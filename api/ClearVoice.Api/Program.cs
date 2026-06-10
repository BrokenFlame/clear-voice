using Amazon;
using Amazon.Runtime;
using Amazon.S3;
using ClearVoice.Api.Data;
using ClearVoice.Api.Endpoints;
using ClearVoice.Api.Models;
using ClearVoice.Api.Services;
using ClearVoice.Api.Services.Storage;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Serilog;
using Serilog.Formatting.Compact;

// ── Bootstrap Serilog immediately so startup errors are captured ─────────────
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console(new CompactJsonFormatter())
    .CreateBootstrapLogger();

try
{
    var builder = WebApplication.CreateBuilder(args);

    // ── Serilog ──────────────────────────────────────────────────────────────
    builder.Host.UseSerilog((ctx, services, config) =>
        config.ReadFrom.Configuration(ctx.Configuration)
              .ReadFrom.Services(services)
              .Enrich.FromLogContext()
              .WriteTo.Console(new CompactJsonFormatter())
    );

    // ── Configuration ────────────────────────────────────────────────────────
    var keycloakOpts = builder.Configuration
        .GetSection("Keycloak").Get<KeycloakOptions>()!;
    var storageOpts  = builder.Configuration
        .GetSection("Storage").Get<StorageOptions>()!;
    var uploadOpts   = builder.Configuration
        .GetSection("Upload").Get<UploadOptions>()!;
    var corsOrigins  = builder.Configuration
        .GetSection("Cors:AllowedOrigins").Get<string[]>()
        ?? ["http://localhost:4200"];

    builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection("Storage"));
    builder.Services.Configure<UploadOptions>(builder.Configuration.GetSection("Upload"));
    builder.Services.AddSingleton(uploadOpts); // also available as plain instance

    // ── CORS ─────────────────────────────────────────────────────────────────
    builder.Services.AddCors(opt =>
        opt.AddDefaultPolicy(policy =>
            policy.WithOrigins(corsOrigins)
                  .AllowAnyHeader()
                  .AllowAnyMethod()
        )
    );

    // ── Authentication — Keycloak JWT ────────────────────────────────────────
    builder.Services
        .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.Authority            = keycloakOpts.Authority;
            options.Audience             = keycloakOpts.Audience;
            options.RequireHttpsMetadata = keycloakOpts.RequireHttpsMetadata;

            options.TokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuer           = true,
                ValidateAudience         = true,
                ValidateLifetime         = true,
                ValidateIssuerSigningKey = true,
                // Keycloak includes roles inside realm_access.roles — map them
                RoleClaimType            = "realm_access.roles",
                NameClaimType            = "preferred_username",
            };

            options.Events = new JwtBearerEvents
            {
                OnAuthenticationFailed = ctx =>
                {
                    Log.Warning("JWT auth failed: {Error}", ctx.Exception.Message);
                    return Task.CompletedTask;
                },
            };
        });

    builder.Services.AddAuthorization();

    // ── PostgreSQL / EF Core ─────────────────────────────────────────────────
    builder.Services.AddDbContext<AppDbContext>(opt =>
        opt.UseNpgsql(builder.Configuration.GetConnectionString("Postgres"))
    );

    // ── AWS S3 / MinIO ────────────────────────────────────────────────────────
    // When Storage:S3:ServiceUrl is set (local dev / MinIO) the SDK is pointed at
    // that endpoint instead of AWS. ForcePathStyle is required by MinIO.
    // On EKS with IRSA, leave ServiceUrl empty and set UseIRSA = true.
    builder.Services.AddDefaultAWSOptions(
        new Amazon.Extensions.NETCore.Setup.AWSOptions
        {
            Region = RegionEndpoint.GetBySystemName(storageOpts.S3.Region),
        }
    );

    // Register IAmazonS3 — override the endpoint config when a ServiceUrl is provided
    builder.Services.AddSingleton<IAmazonS3>(_ =>
    {
        var config = new AmazonS3Config
        {
            RegionEndpoint = RegionEndpoint.GetBySystemName(storageOpts.S3.Region),
        };

        if (!string.IsNullOrEmpty(storageOpts.S3.ServiceUrl))
        {
            config.ServiceURL    = storageOpts.S3.ServiceUrl;
            config.ForcePathStyle = storageOpts.S3.ForcePathStyle;
            // Signature v4 required by MinIO
            config.SignatureVersion = "4";
        }

        // For MinIO / explicit credentials: use the credentials from env or config.
        // For IRSA on EKS: FallbackCredentialsFactory handles the projected token automatically.
        return new AmazonS3Client(config);
    });

    builder.Services.AddSingleton<IStorageProvider, S3StorageProvider>();

    // ── Application services ─────────────────────────────────────────────────
    builder.Services.AddScoped<AuditService>();

    // ── OpenAPI / Swagger ────────────────────────────────────────────────────
    builder.Services.AddEndpointsApiExplorer();
    builder.Services.AddSwaggerGen(c =>
    {
        c.SwaggerDoc("v1", new OpenApiInfo
        {
            Title   = "ClearVoice API",
            Version = "v1",
            Description = "Finance compliance audio recording portal API",
        });
        c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
        {
            Type   = SecuritySchemeType.Http,
            Scheme = "bearer",
            BearerFormat = "JWT",
            Description  = "Paste a Keycloak access token",
        });
        c.AddSecurityRequirement(new OpenApiSecurityRequirement
        {
            [new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                    { Type = ReferenceType.SecurityScheme, Id = "Bearer" }
            }] = []
        });
    });

    // ── Request size limit (250 MB) ──────────────────────────────────────────
    builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(opt =>
    {
        opt.MultipartBodyLengthLimit = uploadOpts.MaxFileSizeBytes;
    });
    builder.WebHost.ConfigureKestrel(k =>
    {
        k.Limits.MaxRequestBodySize = uploadOpts.MaxFileSizeBytes;
    });

    // ────────────────────────────────────────────────────────────────────────
    var app = builder.Build();
    // ────────────────────────────────────────────────────────────────────────

    // ── Auto-migrate on startup (dev only; use proper migration in prod) ─────
    if (app.Environment.IsDevelopment())
    {
        using var scope = app.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await db.Database.MigrateAsync();
    }

    app.UseSerilogRequestLogging();
    app.UseCors();

    if (app.Environment.IsDevelopment())
    {
        app.UseSwagger();
        app.UseSwaggerUI(c =>
        {
            c.SwaggerEndpoint("/swagger/v1/swagger.json", "ClearVoice API v1");
            c.RoutePrefix = "swagger";
        });
    }

    app.UseAuthentication();
    app.UseAuthorization();

    app.MapAllEndpoints();

    // Health check — used by Kubernetes liveness/readiness probes
    app.MapGet("/health", () => Results.Ok(new { status = "healthy", ts = DateTimeOffset.UtcNow }))
       .AllowAnonymous()
       .WithTags("System");

    Log.Information("ClearVoice API starting on {Urls}", string.Join(", ", app.Urls));
    await app.RunAsync();
}
catch (Exception ex)
{
    Log.Fatal(ex, "ClearVoice API terminated unexpectedly");
}
finally
{
    await Log.CloseAndFlushAsync();
}
