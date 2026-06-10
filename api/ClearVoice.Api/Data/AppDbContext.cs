using ClearVoice.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ClearVoice.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<AudioFile> AudioFiles => Set<AudioFile>();
    public DbSet<AuditEvent> AuditEvents => Set<AuditEvent>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        // ── AudioFile ───────────────────────────────────────────────────────
        model.Entity<AudioFile>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("gen_random_uuid()");

            e.Property(x => x.MerchantId).HasMaxLength(50).IsRequired();
            e.Property(x => x.UploadedByUserId).HasMaxLength(200).IsRequired();
            e.Property(x => x.UploadedByUsername).HasMaxLength(200).IsRequired();
            e.Property(x => x.OriginalFilename).HasMaxLength(500).IsRequired();
            e.Property(x => x.StorageKey).HasMaxLength(1000).IsRequired();
            e.Property(x => x.ContentType).HasMaxLength(100).IsRequired();

            // Soft-delete filter — active files only by default
            e.HasQueryFilter(x => x.DeletedAt == null);

            // Indexes
            e.HasIndex(x => x.MerchantId);
            e.HasIndex(x => new { x.MerchantId, x.UploadedAt });
            e.HasIndex(x => x.StorageKey).IsUnique();
        });

        // ── AuditEvent ──────────────────────────────────────────────────────
        model.Entity<AuditEvent>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Id).HasDefaultValueSql("gen_random_uuid()");

            e.Property(x => x.EventType).HasMaxLength(100).IsRequired();
            e.Property(x => x.UserId).HasMaxLength(200).IsRequired();
            e.Property(x => x.Username).HasMaxLength(200).IsRequired();
            e.Property(x => x.MerchantId).HasMaxLength(50);
            e.Property(x => x.FileId).HasMaxLength(36);
            e.Property(x => x.Filename).HasMaxLength(500);
            e.Property(x => x.IpAddress).HasMaxLength(45);
            e.Property(x => x.UserAgent).HasMaxLength(500);
            e.Property(x => x.Detail).HasMaxLength(2000);

            // No soft-delete on audit — these are immutable
            e.HasIndex(x => x.OccurredAt);
            e.HasIndex(x => x.UserId);
            e.HasIndex(x => x.MerchantId);
            e.HasIndex(x => x.EventType);
        });
    }
}
