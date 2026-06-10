using ClearVoice.Api.Data;
using ClearVoice.Api.Models;

namespace ClearVoice.Api.Services;

public class AuditService(AppDbContext db, ILogger<AuditService> logger)
{
    public async Task RecordAsync(
        string eventType,
        string userId,
        string username,
        string? merchantId   = null,
        string? fileId       = null,
        string? filename     = null,
        string? ipAddress    = null,
        string? userAgent    = null,
        string? detail       = null,
        CancellationToken ct = default)
    {
        var ev = new AuditEvent
        {
            Id          = Guid.NewGuid(),
            EventType   = eventType,
            UserId      = userId,
            Username    = username,
            MerchantId  = merchantId,
            FileId      = fileId,
            Filename    = filename,
            IpAddress   = ipAddress,
            UserAgent   = userAgent?.Length > 500 ? userAgent[..500] : userAgent,
            Detail      = detail,
            OccurredAt  = DateTimeOffset.UtcNow,
        };

        // Persist to database
        db.AuditEvents.Add(ev);
        await db.SaveChangesAsync(ct);

        // Also emit a structured log line to stdout — picked up by Kubernetes logging
        logger.LogInformation(
            "AUDIT {EventType} user={UserId} username={Username} merchant={MerchantId} file={FileId} ip={IpAddress}",
            eventType, userId, username, merchantId, fileId, ipAddress);
    }
}
