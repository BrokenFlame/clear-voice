# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Trust corporate MITM CA used in enterprise networks (e.g. Zscaler)
COPY certs/zscaler-root-ca.crt /usr/local/share/ca-certificates/zscaler-root-ca.crt
RUN update-ca-certificates

COPY ClearVoice.Api/ClearVoice.Api.csproj ./ClearVoice.Api/
RUN dotnet restore ./ClearVoice.Api/ClearVoice.Api.csproj

COPY ClearVoice.Api/ ./ClearVoice.Api/
RUN dotnet publish ./ClearVoice.Api/ClearVoice.Api.csproj \
    -c Release \
    -r linux-x64 \
    --self-contained false \
    -o /app/publish \
    /p:UseAppHost=false

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app

# Security: run as non-root
RUN addgroup --system --gid 1001 clearvoice \
 && adduser  --system --uid 1001 --ingroup clearvoice --no-create-home clearvoice

COPY --from=build --chown=clearvoice:clearvoice /app/publish .

# Kubernetes will inject these via ConfigMap / Secret / IRSA
ENV ASPNETCORE_ENVIRONMENT=Production
ENV ASPNETCORE_URLS=http://+:8080

USER clearvoice
EXPOSE 8080

ENTRYPOINT ["dotnet", "ClearVoice.Api.dll"]
