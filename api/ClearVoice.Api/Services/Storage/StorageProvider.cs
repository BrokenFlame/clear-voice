using Amazon.S3;
using Amazon.S3.Model;
using ClearVoice.Api.Models;
using Microsoft.Extensions.Options;

namespace ClearVoice.Api.Services.Storage;

// ── Abstraction ──────────────────────────────────────────────────────────────

public interface IStorageProvider
{
    /// <summary>Stream an upload directly to storage without buffering the full file in memory.</summary>
    Task<string> UploadAsync(string merchantId, string fileId, string filename, Stream content, string contentType, CancellationToken ct = default);

    /// <summary>Generate a short-lived pre-signed URL for in-browser playback.</summary>
    Task<(string Url, DateTimeOffset ExpiresAt)> GetPresignedUrlAsync(string storageKey, int expiryMinutes = 30, CancellationToken ct = default);

    /// <summary>Permanently delete a file from storage.</summary>
    Task DeleteAsync(string storageKey, CancellationToken ct = default);
}

// ── S3 / MinIO implementation ─────────────────────────────────────────────────

public class S3StorageProvider(IAmazonS3 s3, IOptions<StorageOptions> opts, ILogger<S3StorageProvider> logger)
    : IStorageProvider
{
    private readonly S3Options _s3 = opts.Value.S3;

    // True when pointed at MinIO or another S3-compatible store
    private bool IsCompatibilityMode => !string.IsNullOrEmpty(_s3.ServiceUrl);

    /// <summary>
    /// Key format: {merchantId}/{fileId}_{sanitisedFilename}
    /// Metadata (uploader, date, etc.) lives in PostgreSQL — storage is the blob store only.
    /// </summary>
    public async Task<string> UploadAsync(
        string merchantId, string fileId, string filename,
        Stream content, string contentType,
        CancellationToken ct = default)
    {
        var sanitised = SanitiseFilename(filename);
        var key       = $"{merchantId}/{fileId}_{sanitised}";

        logger.LogInformation("Storage upload starting: bucket={Bucket} key={Key} minio={MinIO}",
            _s3.BucketName, key, IsCompatibilityMode);

        var request = new PutObjectRequest
        {
            BucketName  = _s3.BucketName,
            Key         = key,
            InputStream = content,
            ContentType = contentType,
        };

        // SSE-S3 is not supported by MinIO in its default open-source configuration
        if (!IsCompatibilityMode)
        {
            request.ServerSideEncryptionMethod = ServerSideEncryptionMethod.AES256;
        }

        var response = await s3.PutObjectAsync(request, ct);
        logger.LogInformation("Storage upload complete: key={Key} etag={ETag}", key, response.ETag);
        return key;
    }

    public async Task<(string Url, DateTimeOffset ExpiresAt)> GetPresignedUrlAsync(
        string storageKey, int expiryMinutes = 30, CancellationToken ct = default)
    {
        var expiry  = DateTime.UtcNow.AddMinutes(expiryMinutes);
        var request = new GetPreSignedUrlRequest
        {
            BucketName = _s3.BucketName,
            Key        = storageKey,
            Expires    = expiry,
            Verb       = HttpVerb.GET,
        };

        var url = await s3.GetPreSignedURLAsync(request);

        // MinIO presigned URLs are generated using the internal Docker network hostname
        // (e.g. http://minio:9000/...). The browser can't reach that, so we rewrite
        // the host portion to the public-facing address (e.g. http://localhost:9000).
        if (!string.IsNullOrEmpty(_s3.PresignedUrlHostOverride))
        {
            url = RewritePresignedUrlHost(url, _s3.PresignedUrlHostOverride);
        }

        return (url, new DateTimeOffset(expiry, TimeSpan.Zero));
    }

    public async Task DeleteAsync(string storageKey, CancellationToken ct = default)
    {
        logger.LogInformation("Storage delete: bucket={Bucket} key={Key}", _s3.BucketName, storageKey);
        await s3.DeleteObjectAsync(_s3.BucketName, storageKey, ct);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static string SanitiseFilename(string filename)
    {
        var safe = System.Text.RegularExpressions.Regex.Replace(
            System.IO.Path.GetFileName(filename),
            @"[^\w\-\.]",
            "_");
        return safe.Length > 200 ? safe[..200] : safe;
    }

    /// <summary>
    /// Replace the scheme+host+port of a presigned URL with <paramref name="hostOverride"/>.
    /// E.g. http://minio:9000/bucket/key?X-Amz-Signature=...
    ///   → http://localhost:9000/bucket/key?X-Amz-Signature=...
    /// </summary>
    private static string RewritePresignedUrlHost(string url, string hostOverride)
    {
        try
        {
            var uri      = new Uri(url);
            var target   = new Uri(hostOverride.TrimEnd('/'));
            var rewritten = new UriBuilder(uri)
            {
                Scheme = target.Scheme,
                Host   = target.Host,
                Port   = target.Port,
            };
            return rewritten.Uri.ToString();
        }
        catch
        {
            return url; // fall back to original if anything goes wrong
        }
    }
}


