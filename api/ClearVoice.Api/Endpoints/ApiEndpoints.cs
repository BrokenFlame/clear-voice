using ClearVoice.Api.Auth;
using ClearVoice.Api.Data;
using ClearVoice.Api.Models;
using ClearVoice.Api.Services;
using ClearVoice.Api.Services.Storage;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ClearVoice.Api.Endpoints;

public static class ApiEndpoints
{
    public static void MapAllEndpoints(this WebApplication app)
    {
        app.MapAuthEndpoints();
        app.MapMerchantEndpoints();
        app.MapFinanceEndpoints();
    }

    // ── /api/me ─────────────────────────────────────────────────────────────

    private static void MapAuthEndpoints(this WebApplication app)
    {
        var grp = app.MapGroup("/api").RequireAuthorization();

        grp.MapGet("/me", (HttpContext ctx) =>
        {
            var u = ctx.User;
            return Results.Ok(new UserInfoResponse(
                UserId: u.UserId(),
                Username: u.Username(),
                Email: u.Email(),
                FullName: u.FullName(),
                MerchantId: u.MerchantId(),
                OrganisationName: u.OrganisationName(),
                Roles: u.RealmRoles(),
                IdentityProvider: u.MerchantId() is not null ? "keycloak" : "azure"
            ));
        })
        .WithName("GetMe")
        .WithTags("Auth");

        grp.MapPost("/auth/logout", async (HttpContext ctx, AuditService audit) =>
        {
            var u = ctx.User;
            await audit.RecordAsync(
                AuditEventTypes.Logout,
                u.UserId(), u.Username(),
                merchantId: u.MerchantId(),
                ipAddress: ctx.Connection.RemoteIpAddress?.ToString(),
                userAgent: ctx.Request.Headers.UserAgent);
            return Results.Ok();
        })
        .WithName("PostLogout")
        .WithTags("Auth");
    }

    // ── /api/merchant ────────────────────────────────────────────────────────

    private static void MapMerchantEndpoints(this WebApplication app)
    {
        var grp = app.MapGroup("/api/merchant")
            .RequireAuthorization(policy => policy.RequireRole("merchant_employee"));

        // GET /api/merchant/files
        grp.MapGet("/files", async (
            HttpContext ctx,
            AppDbContext db,
            AuditService audit,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 50) =>
        {
            var merchantId = ctx.User.MerchantId()!;
            var u = ctx.User;

            var query = db.AudioFiles
                .Where(f => f.MerchantId == merchantId)
                .OrderByDescending(f => f.UploadedAt);

            var total = await query.CountAsync();
            var items = await query
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(f => new AudioFileResponse(
                    f.Id, f.MerchantId,
                    f.UploadedByUserId, f.UploadedByUsername,
                    f.OriginalFilename, f.SizeBytes, f.UploadedAt))
                .ToListAsync();

            await audit.RecordAsync(AuditEventTypes.FileList, u.UserId(), u.Username(),
                merchantId: merchantId,
                ipAddress: ctx.Connection.RemoteIpAddress?.ToString());

            return Results.Ok(new PagedResponse<AudioFileResponse>(items, total, page, pageSize));
        })
        .WithName("GetMerchantFiles")
        .WithTags("Merchant");

        // POST /api/merchant/files/upload
        grp.MapPost("/files/upload", async (
            HttpContext ctx,
            AppDbContext db,
            IStorageProvider storage,
            AuditService audit,
            UploadOptions uploadOpts) =>
        {
            var u = ctx.User;
            var merchantId = u.MerchantId();
            if (string.IsNullOrEmpty(merchantId))
                return Results.BadRequest("No merchant_id claim on token.");

            if (!ctx.Request.HasFormContentType)
                return Results.BadRequest("Expected multipart/form-data.");

            var form = await ctx.Request.ReadFormAsync();
            var file = form.Files.GetFile("file");
            if (file is null)
                return Results.BadRequest("No file uploaded.");

            // Validate size
            if (file.Length > uploadOpts.MaxFileSizeBytes)
                return Results.BadRequest($"File exceeds maximum size of 250 MB.");

            // Sanitize filename: strip directory components, then remove any character
            // that is not alphanumeric, dot, hyphen, or underscore.
            var rawFilename    = Path.GetFileName(file.FileName);   // removes path traversal (e.g. ../../etc/passwd)
            var sanitizedName  = System.Text.RegularExpressions.Regex.Replace(rawFilename, @"[^\w.\-]", "_");
            if (string.IsNullOrWhiteSpace(sanitizedName))
                return Results.BadRequest("Invalid filename.");

            // Validate extension
            var ext = Path.GetExtension(sanitizedName).ToLowerInvariant();
            if (!uploadOpts.AllowedExtensions.Contains(ext))
                return Results.BadRequest($"File type '{ext}' is not permitted.");

            // Validate content type
            if (!uploadOpts.AllowedContentTypes.Contains(file.ContentType))
                return Results.BadRequest($"Content type '{file.ContentType}' is not permitted.");

            var fileId = Guid.NewGuid();

            await using var stream = file.OpenReadStream();
            var storageKey = await storage.UploadAsync(
                merchantId, fileId.ToString(), sanitizedName,
                stream, file.ContentType);

            var record = new AudioFile
            {
                Id                  = fileId,
                MerchantId          = merchantId,
                UploadedByUserId    = u.UserId(),
                UploadedByUsername  = u.Username(),
                OriginalFilename    = sanitizedName,
                StorageKey          = storageKey,
                SizeBytes           = file.Length,
                ContentType         = file.ContentType,
                UploadedAt          = DateTimeOffset.UtcNow,
            };

            db.AudioFiles.Add(record);
            await db.SaveChangesAsync();

            await audit.RecordAsync(
                AuditEventTypes.FileUpload,
                u.UserId(), u.Username(),
                merchantId: merchantId,
                fileId: fileId.ToString(),
                filename: sanitizedName,
                ipAddress: ctx.Connection.RemoteIpAddress?.ToString(),
                detail: $"{file.Length} bytes");

            return Results.Ok(new UploadCompleteResponse(
                record.Id, record.OriginalFilename,
                record.SizeBytes, record.StorageKey, record.UploadedAt));
        })
        .WithName("UploadFile")
        .WithTags("Merchant")
        .DisableAntiforgery();  // SPA uses Bearer token, not cookie-based CSRF
    }

    // ── /api/finance ─────────────────────────────────────────────────────────

    private static void MapFinanceEndpoints(this WebApplication app)
    {
        var grp = app.MapGroup("/api/finance")
            .RequireAuthorization(policy => policy.RequireRole("finance_staff"));

        // GET /api/finance/files
        grp.MapGet("/files", async (
            HttpContext ctx,
            AppDbContext db,
            AuditService audit,
            [FromQuery] string? merchantId = null,
            [FromQuery] string? sortBy     = "uploadedAt",
            [FromQuery] bool sortDesc      = true,
            [FromQuery] int page           = 1,
            [FromQuery] int pageSize       = 100) =>
        {
            var u = ctx.User;

            var q = db.AudioFiles.AsQueryable();
            if (!string.IsNullOrEmpty(merchantId))
                q = q.Where(f => f.MerchantId == merchantId);

            q = (sortBy, sortDesc) switch
            {
                ("originalFilename", false) => q.OrderBy(f => f.OriginalFilename),
                ("originalFilename", true)  => q.OrderByDescending(f => f.OriginalFilename),
                ("sizeBytes", false)        => q.OrderBy(f => f.SizeBytes),
                ("sizeBytes", true)         => q.OrderByDescending(f => f.SizeBytes),
                (_, false)                  => q.OrderBy(f => f.UploadedAt),
                _                           => q.OrderByDescending(f => f.UploadedAt),
            };

            var total = await q.CountAsync();
            var items = await q
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(f => new AudioFileResponse(
                    f.Id, f.MerchantId,
                    f.UploadedByUserId, f.UploadedByUsername,
                    f.OriginalFilename, f.SizeBytes, f.UploadedAt))
                .ToListAsync();

            await audit.RecordAsync(AuditEventTypes.FileList, u.UserId(), u.Username(),
                merchantId: merchantId,
                ipAddress: ctx.Connection.RemoteIpAddress?.ToString());

            return Results.Ok(new PagedResponse<AudioFileResponse>(items, total, page, pageSize));
        })
        .WithName("GetAllFiles")
        .WithTags("Finance");

        // GET /api/finance/files/{id}/playback-url
        grp.MapGet("/files/{id:guid}/playback-url", async (
            Guid id,
            HttpContext ctx,
            AppDbContext db,
            IStorageProvider storage,
            AuditService audit) =>
        {
            var u = ctx.User;
            var file = await db.AudioFiles.FindAsync(id);
            if (file is null) return Results.NotFound();

            var (url, expiresAt) = await storage.GetPresignedUrlAsync(file.StorageKey);

            await audit.RecordAsync(AuditEventTypes.FilePlaybackStart,
                u.UserId(), u.Username(),
                merchantId: file.MerchantId,
                fileId: id.ToString(),
                filename: file.OriginalFilename,
                ipAddress: ctx.Connection.RemoteIpAddress?.ToString());

            return Results.Ok(new PresignedUrlResponse(url, expiresAt));
        })
        .WithName("GetPlaybackUrl")
        .WithTags("Finance");

        // DELETE /api/finance/files/{id}
        grp.MapDelete("/files/{id:guid}", async (
            Guid id,
            HttpContext ctx,
            AppDbContext db,
            IStorageProvider storage,
            AuditService audit) =>
        {
            var u = ctx.User;
            var file = await db.AudioFiles.FindAsync(id);
            if (file is null) return Results.NotFound();

            // Delete from S3
            await storage.DeleteAsync(file.StorageKey);

            // Soft-delete in DB (preserves audit trail)
            file.DeletedAt = DateTimeOffset.UtcNow;
            await db.SaveChangesAsync();

            await audit.RecordAsync(
                AuditEventTypes.FileDelete,
                u.UserId(), u.Username(),
                merchantId: file.MerchantId,
                fileId: id.ToString(),
                filename: file.OriginalFilename,
                ipAddress: ctx.Connection.RemoteIpAddress?.ToString(),
                detail: $"{file.SizeBytes} bytes");

            return Results.Ok(new DeleteFileResponse(id, "File deleted successfully."));
        })
        .WithName("DeleteFile")
        .WithTags("Finance");

        // GET /api/finance/audit
        grp.MapGet("/audit", async (
            HttpContext ctx,
            AppDbContext db,
            AuditService audit,
            [FromQuery] string? eventType  = null,
            [FromQuery] string? merchantId = null,
            [FromQuery] string? userId     = null,
            [FromQuery] int page           = 1,
            [FromQuery] int pageSize       = 200) =>
        {
            var u = ctx.User;
            var q = db.AuditEvents.AsQueryable();

            if (!string.IsNullOrEmpty(eventType))  q = q.Where(e => e.EventType  == eventType);
            if (!string.IsNullOrEmpty(merchantId)) q = q.Where(e => e.MerchantId == merchantId);
            if (!string.IsNullOrEmpty(userId))     q = q.Where(e => e.UserId     == userId);

            var total = await q.CountAsync();
            var items = await q
                .OrderByDescending(e => e.OccurredAt)
                .Skip((page - 1) * pageSize)
                .Take(pageSize)
                .Select(e => new AuditEventResponse(
                    e.Id, e.EventType,
                    e.UserId, e.Username,
                    e.MerchantId, e.FileId, e.Filename,
                    e.IpAddress, e.Detail, e.OccurredAt))
                .ToListAsync();

            await audit.RecordAsync(AuditEventTypes.AuditView,
                u.UserId(), u.Username(),
                ipAddress: ctx.Connection.RemoteIpAddress?.ToString());

            return Results.Ok(new PagedResponse<AuditEventResponse>(items, total, page, pageSize));
        })
        .WithName("GetAuditLog")
        .WithTags("Finance");
    }
}
