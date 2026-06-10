namespace ClearVoice.Api.Models;

// ── Database entities ───────────────────────────────────────────────────────

public class AudioFile
{
    public Guid Id { get; set; }
    public string MerchantId { get; set; } = string.Empty;
    public string UploadedByUserId { get; set; } = string.Empty;
    public string UploadedByUsername { get; set; } = string.Empty;
    public string OriginalFilename { get; set; } = string.Empty;
    public string StorageKey { get; set; } = string.Empty;     // e.g. /MCH-00142/<uuid>_filename.mp3
    public long SizeBytes { get; set; }
    public string ContentType { get; set; } = string.Empty;
    public DateTimeOffset UploadedAt { get; set; }
    public DateTimeOffset? DeletedAt { get; set; }             // soft-delete flag

    public bool IsDeleted => DeletedAt.HasValue;
}

public class AuditEvent
{
    public Guid Id { get; set; }
    public string EventType { get; set; } = string.Empty;      // see AuditEventTypes
    public string UserId { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string? MerchantId { get; set; }
    public string? FileId { get; set; }
    public string? Filename { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public string? Detail { get; set; }
    public DateTimeOffset OccurredAt { get; set; }
}

// ── Audit event type constants ──────────────────────────────────────────────

public static class AuditEventTypes
{
    public const string Login = "login";
    public const string Logout = "logout";
    public const string FileUpload = "file_upload";
    public const string FileDelete = "file_delete";
    public const string FilePlaybackStart = "file_playback_start";
    public const string FileList = "file_list";
    public const string AuditView = "audit_view";
}

// ── Role constants ──────────────────────────────────────────────────────────

public static class Roles
{
    public const string MerchantEmployee = "merchant_employee";
    public const string FinanceStaff = "finance_staff";
}

// ── Claim name constants ────────────────────────────────────────────────────

public static class ClaimNames
{
    public const string MerchantId = "merchant_id";
    public const string OrganisationName = "organisation_name";
    public const string RealmRoles = "realm_access";
    public const string Sub = "sub";
    public const string PreferredUsername = "preferred_username";
    public const string Name = "name";
}

// ── Request / Response DTOs ─────────────────────────────────────────────────

public record AudioFileResponse(
    Guid Id,
    string MerchantId,
    string UploadedByUserId,
    string UploadedByUsername,
    string OriginalFilename,
    long SizeBytes,
    DateTimeOffset UploadedAt
);

public record AuditEventResponse(
    Guid Id,
    string EventType,
    string UserId,
    string Username,
    string? MerchantId,
    string? FileId,
    string? Filename,
    string? IpAddress,
    string? Detail,
    DateTimeOffset OccurredAt
);

public record UploadCompleteResponse(
    Guid FileId,
    string OriginalFilename,
    long SizeBytes,
    string StorageKey,
    DateTimeOffset UploadedAt
);

public record DeleteFileResponse(Guid FileId, string Message);

public record PagedResponse<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int Page,
    int PageSize
);

public record PresignedUrlResponse(string Url, DateTimeOffset ExpiresAt);

public record UserInfoResponse(
    string UserId,
    string Username,
    string? Email,
    string? FullName,
    string? MerchantId,
    string? OrganisationName,
    IReadOnlyList<string> Roles,
    string IdentityProvider
);

// ── Configuration POCOs ─────────────────────────────────────────────────────

public class KeycloakOptions
{
    public string Authority { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public bool RequireHttpsMetadata { get; set; } = true;
}

public class StorageOptions
{
    public string Provider { get; set; } = "S3";
    public S3Options S3 { get; set; } = new();
}

public class S3Options
{
    public string BucketName { get; set; } = string.Empty;
    public string Region { get; set; } = string.Empty;
    public bool UseIRSA { get; set; } = true;

    /// <summary>
    /// Custom S3-compatible endpoint. Set to http://minio:9000 for local dev.
    /// Leave empty to use real AWS S3.
    /// </summary>
    public string? ServiceUrl { get; set; }

    /// <summary>
    /// Required by MinIO and other S3-compatible stores.
    /// Path-style: http://host/bucket/key (vs virtual-hosted: http://bucket.host/key).
    /// </summary>
    public bool ForcePathStyle { get; set; } = false;

    /// <summary>
    /// When using MinIO locally, presigned URLs are generated against the internal
    /// Docker hostname (minio:9000). Set this to the host-accessible URL so the browser
    /// can reach them — e.g. http://localhost:9000.
    /// </summary>
    public string? PresignedUrlHostOverride { get; set; }
}

public class UploadOptions
{
    public long MaxFileSizeBytes { get; set; } = 262_144_000; // 250 MB
    public string[] AllowedExtensions { get; set; } = [".mp3", ".wav", ".m4a", ".ogg"];
    public string[] AllowedContentTypes { get; set; } = ["audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/x-m4a"];
}
