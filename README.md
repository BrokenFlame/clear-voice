# ClearVoice – Finance Compliance Portal

A secure, cloud-native compliance recording portal for managing encrypted audio files across merchant and finance staff roles.

---

## Table of Contents

- [Repository Layout](#repository-layout)
- [Modes of Operation](#modes-of-operation)
- [Local Demo – Full Docker Stack](#local-demo--full-docker-stack)
- [Local Development – Hot-Reload](#local-development--hot-reload)
- [Production – AWS EKS](#production--aws-eks)
- [Test Users](#test-users)
- [API Endpoints](#api-endpoints)
- [Frontend Routes](#frontend-routes)

---

## Repository Layout

```
clear-voice/
├── api/ClearVoice.Api/         # .NET 9 Minimal API
├── audio-portal-ui/            # Angular 20 SPA
├── ui/
│   ├── Dockerfile              # Multi-stage build: ng build → nginx
│   ├── nginx.conf              # SPA fallback + security headers
│   ├── env.template.js         # Runtime config template (envsubst at startup)
│   └── docker-entrypoint.sh   # Generates /tmp/env.js then starts nginx
├── keycloak-theme/
│   ├── clearvoice-realm.json   # Full realm export — imported on first boot
│   └── clearvoice/login/       # Custom FTL theme + CSS
├── docker/
│   ├── keycloak-profile-init.sh
│   └── minio-init.sh
├── helm/clearvoice/            # Helm chart — EKS production deployment
├── docker-compose.yml          # Local full-stack (all services in Docker)
├── RUNBOOK.md                  # Step-by-step developer & ops runbook
└── SECURITY_AUDIT_REPORT.md
```

---

## Modes of Operation

| Mode | How the UI runs | How the API runs | Use case |
|------|-----------------|------------------|----------|
| **Local demo** | nginx in Docker on :4200 | .NET in Docker on :5000 | Quick end-to-end demo, CI |
| **Local dev** | `ng serve` on :4200 | `dotnet run` on :5000 | Day-to-day feature work with hot-reload |
| **Production** | nginx pod (Helm) | .NET pod (Helm) on EKS | AWS EKS deployment |

All three modes share the same Docker images and Keycloak OIDC flow. The UI reads runtime configuration from `/env.js` (generated at container startup from environment variables) so the same image works in every environment without rebuilding.

---

## Local Demo – Full Docker Stack

> Everything runs in Docker. No local SDK install required.

### Prerequisites

- Docker Desktop 4.x with `docker compose` support

### Start the stack

```bash
docker compose up --build
```

This starts and wires together:

| Service | URL | Credentials |
|---------|-----|-------------|
| Angular UI | http://localhost:4200 | — |
| .NET API | http://localhost:5000 | — |
| Swagger | http://localhost:5000/swagger | — |
| Keycloak admin | http://localhost:8080 | `admin` / `admin` |
| MinIO S3 API | http://localhost:9100 | `clearvoice` / `clearvoice_dev_secret` |
| MinIO console | http://localhost:9101 | `clearvoice` / `clearvoice_dev_secret` |
| PostgreSQL | localhost:5432 | `clearvoice` / `clearvoice_dev` |

On first boot:
- Keycloak imports `keycloak-theme/clearvoice-realm.json` and creates the `clearvoice` realm.
- `keycloak-profile-init` adds the required user profile attributes (`merchant_id`, `organisation_name`) and demo users.
- `minio-init` creates the `clearvoice-recordings` bucket.

Both init containers should reach `Exited (0)`. If `keycloak-profile-init` fails:

```bash
docker compose logs keycloak-profile-init --tail=50
docker compose up keycloak-profile-init   # re-run
```

### Stop / reset

```bash
docker compose down          # stop, keep data volumes
docker compose down -v       # stop and wipe all data (clean slate)
```

### UI runtime configuration

When running in Docker, the UI receives its config through environment variables in `docker-compose.yml`:

```yaml
NG_API_URL:       http://localhost:5000
NG_KEYCLOAK_URL:  http://localhost:8080/realms/clearvoice
NG_CLIENT_ID:     clearvoice-ui
NG_REQUIRE_HTTPS: "false"
NG_SHOW_DEBUG:    "true"
```

These are injected at container startup into `/tmp/env.js`, which is loaded by `index.html` before the Angular app bootstraps. To change a value, update `docker-compose.yml` and restart the UI container:

```bash
docker compose up -d --build ui
```

---

## Local Development – Hot-Reload

> Backend services in Docker; API and UI run on your machine for instant feedback.

### Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| .NET SDK | 9.0 | https://dot.net |
| Node.js | 22.x | https://nodejs.org |
| Angular CLI | 20.x | `npm i -g @angular/cli@20` |
| Docker Desktop | 4.x | https://docker.com |

### 1 – Start backing services only

```bash
docker compose up -d postgres keycloak keycloak-profile-init minio minio-init
```

Wait until `keycloak-profile-init` and `minio-init` reach `Exited (0)`:

```bash
docker compose ps
```

### 2 – Run the .NET API

```bash
cd api/ClearVoice.Api
dotnet run
# or with hot-reload:
dotnet watch
```

Runs on **http://localhost:5000**. On first run, EF Core creates the database schema automatically (development mode only).

### 3 – Run the Angular UI

```bash
cd audio-portal-ui
npm install       # first time only
ng serve --port 4200
```

Open **http://localhost:4200**.

The dev server uses `environment.ts` which points at `http://localhost:5000` and `http://localhost:8080`. No environment variables or `env.js` are needed in this mode — Angular's file replacement handles it at build time.

### 4 – Reset data

```bash
docker compose down -v      # wipe Postgres, Keycloak, and MinIO volumes
docker compose up -d postgres keycloak keycloak-profile-init minio minio-init
```

---

## Production – AWS EKS

> The Helm chart deploys the API and UI as Kubernetes workloads on EKS. PostgreSQL uses AWS RDS, object storage uses AWS S3, and secrets are managed via AWS Secrets Manager + External Secrets Operator.

See **[RUNBOOK.md](RUNBOOK.md)** for the full step-by-step production runbook including:

- EKS cluster setup
- ECR image build and push
- IRSA (IAM Roles for Service Accounts) for S3
- Keycloak deployment on EKS
- Helm deploy / upgrade / rollback
- Database migration jobs
- Logging and observability (CloudWatch / Fluent Bit)

### Quick deploy summary

```bash
# 1. Build and push images to ECR
docker build --platform linux/amd64 -t $ECR_BASE/clearvoice/api:1.0.0 ./api
docker build --platform linux/amd64 -t $ECR_BASE/clearvoice/ui:1.0.0  -f ui/Dockerfile .
docker push $ECR_BASE/clearvoice/api:1.0.0
docker push $ECR_BASE/clearvoice/ui:1.0.0

# 2. Deploy with Helm
helm upgrade --install clearvoice ./helm/clearvoice \
  --namespace clearvoice \
  --create-namespace \
  -f helm/clearvoice/values-prod.yaml \
  --set global.imageRegistry=$ECR_BASE \
  --set api.image.tag=1.0.0 \
  --set ui.image.tag=1.0.0 \
  --wait
```

See **[helm/clearvoice/README.md](helm/clearvoice/README.md)** for full Helm chart documentation including all configurable values.

### Production UI runtime configuration

In production the UI pod receives its config through Helm `values-prod.yaml`:

```yaml
ui:
  env:
    NG_API_URL:      https://api.clearvoice.example.com
    NG_KEYCLOAK_URL: https://keycloak.example.com/realms/clearvoice
    NG_CLIENT_ID:    clearvoice-ui
```

These values are passed into the container as environment variables and written to `/tmp/env.js` at pod startup. To change them, update your values file and run `helm upgrade`.

---

## Test Users

**Merchant users** — can upload and manage their own files:

| Username | Password | Merchant ID |
|----------|----------|-------------|
| `demo.merchant` | `merchant123!` | MCH-00142 |
| `demo2.merchant` | `merchant123!` | MCH-00142 |
| `demo1.merchant` | `merchant123!` | MCH-00143 |

**Finance staff** — can view all files and the audit log:

| Username | Password |
|----------|----------|
| `demo.finance` | `finance123!` |

These users are created by `docker/keycloak-profile-init.sh` on first boot. Finance staff use local Keycloak credentials; in production, auditors authenticate via Azure Entra ID through the Keycloak Azure broker.

---

## API Endpoints

| Method | Path | Role | Description |
|--------|------|------|-------------|
| `GET` | `/health` | Public | Liveness / readiness probe |
| `GET` | `/api/me` | Any authenticated | Current user info + roles |
| `GET` | `/api/merchant/files` | `merchant_employee` | List own files |
| `POST` | `/api/merchant/files/upload` | `merchant_employee` | Upload audio file |
| `GET` | `/api/finance/files` | `finance_staff` | List all files |
| `GET` | `/api/finance/files/{id}/playback-url` | `finance_staff` | Presigned S3 URL for streaming |
| `DELETE` | `/api/finance/files/{id}` | `finance_staff` | Delete file |
| `GET` | `/api/finance/audit` | `finance_staff` | Audit log |

Swagger UI (development): http://localhost:5000/swagger

---

## Frontend Routes

| Path | Role | Description |
|------|------|-------------|
| `/` | Public | Login page |
| `/auth/callback` | Public | OIDC callback handler |
| `/merchant/files` | `merchant_employee` | My files |
| `/merchant/upload` | `merchant_employee` | Upload audio |
| `/merchant/account` | `merchant_employee` | Account details |
| `/finance/files` | `finance_staff` | All recordings |
| `/finance/audit` | `finance_staff` | Audit log |
| `/finance/account` | `finance_staff` | Account details |
