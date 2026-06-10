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
using System.Net;
using System.Net.Sockets;
using System.Security.Claims;
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
    var normalizedCorsOrigins = corsOrigins
        .Where(o => !string.IsNullOrWhiteSpace(o))
        .Select(o => o.Trim().TrimEnd('/'))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();

    builder.Services.Configure<StorageOptions>(builder.Configuration.GetSection("Storage"));
    builder.Services.Configure<UploadOptions>(builder.Configuration.GetSection("Upload"));
    builder.Services.AddSingleton(uploadOpts); // also available as plain instance

    // ── CORS ─────────────────────────────────────────────────────────────────
    // Allowed methods are fixed to the set this API actually exposes.
    // Allowed origins come from configuration (Helm injects them as
    // Cors__AllowedOrigins__0, Cors__AllowedOrigins__1, …).
    builder.Services.AddCors(opt =>
        opt.AddDefaultPolicy(policy =>
            policy.SetIsOriginAllowed(origin =>
                    normalizedCorsOrigins.Contains(origin.TrimEnd('/'), StringComparer.OrdinalIgnoreCase))
                  .AllowAnyHeader()
                  .WithMethods("GET", "POST", "DELETE", "OPTIONS")
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
                ValidateIssuer           = !builder.Environment.IsDevelopment(),
                ValidIssuer              = keycloakOpts.Authority,
                ValidateAudience         = false,
                ValidateLifetime         = true,
                ValidateIssuerSigningKey = true,
                // Keycloak includes roles inside realm_access.roles — map them
                RoleClaimType            = ClaimTypes.Role,
                NameClaimType            = "preferred_username",
            };

            options.Events = new JwtBearerEvents
            {
                OnAuthenticationFailed = ctx =>
                {
                    Log.Warning("JWT auth failed: {Error}", ctx.Exception.Message);
                    return Task.CompletedTask;
                },

                // Keycloak emits realm roles inside a nested realm_access.roles
                // JSON object. Flatten them into ClaimTypes.Role so that
                // RequireRole() and [Authorize(Roles=...)] work correctly.
                OnTokenValidated = ctx =>
                {
                    var identity = ctx.Principal?.Identity as System.Security.Claims.ClaimsIdentity;
                    if (identity is null) return Task.CompletedTask;

                    var realmAccess = identity.FindFirst("realm_access");
                    if (realmAccess?.Value is { } json)
                    {
                        try
                        {
                            using var doc = System.Text.Json.JsonDocument.Parse(json);
                            if (doc.RootElement.TryGetProperty("roles", out var roles))
                            {
                                foreach (var role in roles.EnumerateArray())
                                {
                                    var roleName = role.GetString();
                                    if (!string.IsNullOrEmpty(roleName))
                                        identity.AddClaim(new System.Security.Claims.Claim(
                                            System.Security.Claims.ClaimTypes.Role, roleName));
                                }
                            }
                        }
                        catch { /* ignore malformed */ }
                    }

                    // Also map flat realm_access.roles claims if present
                    foreach (var c in identity.FindAll("realm_access.roles").ToList())
                    {
                        // The value might be a JSON array string or a plain role name
                        if (c.Value.StartsWith('['))
                        {
                            try
                            {
                                using var doc = System.Text.Json.JsonDocument.Parse(c.Value);
                                foreach (var role in doc.RootElement.EnumerateArray())
                                {
                                    var roleName = role.GetString();
                                    if (!string.IsNullOrEmpty(roleName))
                                        identity.AddClaim(new System.Security.Claims.Claim(
                                            System.Security.Claims.ClaimTypes.Role, roleName));
                                }
                            }
                            catch { /* ignore */ }
                        }
                        else
                        {
                            identity.AddClaim(new System.Security.Claims.Claim(
                                System.Security.Claims.ClaimTypes.Role, c.Value));
                        }
                    }

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

        // Explicit credentials take priority (local dev / MinIO via appsettings).
        // If not set, the SDK falls through to: env vars → ~/.aws → IRSA (EKS).
        if (!string.IsNullOrEmpty(storageOpts.S3.AccessKeyId) &&
            !string.IsNullOrEmpty(storageOpts.S3.SecretKey))
        {
            var credentials = new Amazon.Runtime.BasicAWSCredentials(
                storageOpts.S3.AccessKeyId, storageOpts.S3.SecretKey);
            return new AmazonS3Client(credentials, config);
        }

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
    int? fallbackHttpPort = null;
    if (builder.Environment.IsDevelopment() && !IsLocalhostPortAvailable(5000))
    {
        fallbackHttpPort = FindAvailableLocalhostPort(5001, 50);
        if (fallbackHttpPort is not null)
        {
            Log.Warning("Port 5000 is in use. Falling back to http://127.0.0.1:{FallbackPort}", fallbackHttpPort.Value);
        }
    }

    builder.Services.Configure<Microsoft.AspNetCore.Http.Features.FormOptions>(opt =>
    {
        opt.MultipartBodyLengthLimit = uploadOpts.MaxFileSizeBytes;
    });
    builder.WebHost.ConfigureKestrel(k =>
    {
        k.Limits.MaxRequestBodySize = uploadOpts.MaxFileSizeBytes;
        if (fallbackHttpPort is not null)
        {
            k.ListenLocalhost(fallbackHttpPort.Value);
        }
    });

    // ────────────────────────────────────────────────────────────────────────
    var app = builder.Build();
    // ────────────────────────────────────────────────────────────────────────

    // ── Create / migrate database on startup ─────────────────────────────────
    // Development: EnsureCreatedAsync creates the schema directly from the model
    //   — no migration files needed to get running locally.
    // Production: run migrations as a pre-deploy Job (see RUNBOOK Part 8).
    using (var scope = app.Services.CreateScope())
    {
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        if (app.Environment.IsDevelopment())
        {
            // If an older/incomplete local schema exists, EnsureCreated() will no-op.
            // Recreate once when required tables are missing so local dev can proceed.
            await db.Database.EnsureCreatedAsync();

            await using var conn = db.Database.GetDbConnection();
            await conn.OpenAsync();
            await using var cmd = conn.CreateCommand();
            cmd.CommandText = "select to_regclass('\"AudioFiles\"') is not null";
            var audioFilesExists = (bool?)await cmd.ExecuteScalarAsync() ?? false;
            await conn.CloseAsync();

            if (!audioFilesExists)
            {
                Log.Warning("Development schema incomplete; recreating local database schema.");
                await db.Database.EnsureDeletedAsync();
                await db.Database.EnsureCreatedAsync();
            }
        }
        else
            await db.Database.MigrateAsync();
    }

    app.UseSerilogRequestLogging();
    app.UseCors(policy =>
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod());

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

static bool IsLocalhostPortAvailable(int port)
{
    try
    {
        using var listener = new TcpListener(IPAddress.Loopback, port);
        listener.Start();
        listener.Stop();
        return true;
    }
    catch (SocketException)
    {
        return false;
    }
}

static int? FindAvailableLocalhostPort(int startPort, int maxAttempts)
{
    var port = startPort;
    for (var i = 0; i < maxAttempts; i++, port++)
    {
        if (IsLocalhostPortAvailable(port))
            return port;
    }

    return null;
}
