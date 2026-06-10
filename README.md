# ClearVoice – Finance Compliance Portal

A secure, cloud-native compliance recording portal for managing encrypted audio files across merchant and finance staff roles.

---

## Table of Contents

- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [Architecture](#architecture)
- [Testing](#testing)

---

## Local Development

### Prerequisites

- **Docker Desktop** (with `docker compose` support)
- **Node.js** 20+ and npm
- **.NET 9 SDK**
- **Angular CLI** (`npm install -g @angular/cli`)

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/BrokenFlame/clear-voice.git
   cd clear-voice
   ```

2. **Start the backend services** (Keycloak, PostgreSQL, MinIO)
   ```bash
   docker compose up -d
   ```
   - **Keycloak** (OIDC): http://localhost:8080
   - **PostgreSQL**: localhost:5432
   - **MinIO** (S3-compatible): http://localhost:9100

3. **Start the .NET API** (from `api/ClearVoice.Api/`)
   ```bash
   cd api/ClearVoice.Api
   dotnet run
   ```
   - Runs on http://localhost:5000 (or 5001 if 5000 is in use)
   - Environment: Development (reads `appsettings.Development.json`)

4. **Start the Angular frontend** (from `audio-portal-ui/`)
   ```bash
   cd audio-portal-ui
   npm install
   ng serve --port 4200
   ```
   - Runs on http://localhost:4200

5. **Access the application**
   - Navigate to http://localhost:4200
   - Log in using local credentials (see [Test Users](#test-users))

### Docker Compose Services

The `docker-compose.yml` defines:

| Service | Port | Purpose |
|---------|------|---------|
| **keycloak** | 8080 | OIDC provider; imports realm from `keycloak-theme/clearvoice-realm.json` |
| **postgres** | 5432 | Database (in-memory H2 for Keycloak on every restart) |
| **minio** | 9100 (API), 9101 (Console) | S3-compatible object storage for audio files |
| **minio-init** | – | Initializes MinIO bucket and sets anonymous download policy |
| **keycloak-profile-init** | – | Bootstrap script: creates demo users and mappers |

### Test Users

**Merchant Users** (upload & manage own files):
- `demo.merchant` / `merchant123!` (MCH-00142)
- `demo2.merchant` / `merchant123!` (MCH-00142 – same merchant, shared file view)
- `demo1.merchant` / `merchant123!` (MCH-00143 – isolated merchant)

**Finance Staff** (view & audit all files):
- `demo.finance` / `finance123!`

### Key Endpoints

**API**:
- `GET /api/health` – Health check
- `GET /api/merchant/files` – List files for logged-in merchant
- `POST /api/merchant/files/upload` – Upload audio file
- `GET /api/finance/files` – List all files (finance staff only)
- `GET /api/finance/files/{id}/playback-url` – Generate presigned URL for streaming
- `DELETE /api/finance/files/{id}` – Soft-delete file

**Frontend Routes**:
- `/merchant/files` – Merchant: My Files
- `/merchant/upload` – Merchant: Upload
- `/finance/files` – Finance: All Recordings
- `/finance/audit` – Finance: Audit Log

### Development Notes

- **Keycloak Realm Import**: On every `docker compose down && up`, Keycloak rebuilds its in-memory H2 database from `keycloak-theme/clearvoice-realm.json`
- **Bootstrap Script**: `docker/keycloak-profile-init.sh` idempotently ensures demo users and identity provider mappers
- **Port Fallback**: API tries port 5000; if busy, falls back to 5001
- **CORS**: Angular frontend configured to communicate with local API on port 5000/5001

---

## Production Deployment

### Architecture

```
┌─────────────────────────────────────────────────┐
│         AWS EKS Cluster                         │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────────────┐     ┌──────────────────┐ │
│  │  Angular App     │     │  .NET API        │ │
│  │  (Pod)           │────▶│  (Pod)           │ │
│  │  Port: 4200      │     │  Port: 5000      │ │
│  └──────────────────┘     └──────────────────┘ │
│           │                        │            │
│           └────────────┬───────────┘            │
│                        │                        │
└────────────────────────┼────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   ┌─────────┐    ┌──────────┐    ┌──────────┐
   │ AWS RDS │    │ AWS S3   │    │ Keycloak │
   │PostgreSQL  │    │Bucket   │    │(EKS Pod) │
   └─────────┘    └──────────┘    └──────────┘
```

### Prerequisites

- **AWS Account** with:
  - **EKS Cluster** (Kubernetes 1.25+)
  - **RDS PostgreSQL** instance
  - **S3 Bucket** for audio storage
  - **IAM Roles** for EKS pods (S3 access, RDS security group)
  - **kubectl** configured to access the cluster
- **Helm 3+**
- **External Secrets Operator** installed in the cluster

### External Secrets (AWS Secrets Manager)

Production secret flow:

1. Store application secrets in **AWS Secrets Manager**.
2. External Secrets Operator syncs those values into a standard Kubernetes Secret (`clearvoice-secrets`).
3. The .NET API consumes that Kubernetes Secret using existing `secretKeyRef` mappings.

Frontend note:

- The Angular UI should only use public runtime values (API URL, Keycloak realm URL, public client ID).
- Do not store browser-visible configuration in Secrets Manager as "secrets".

### Deploy with Helm

1. **Configure External Secrets in production values** (`helm/clearvoice/values-prod.yaml`):
   ```yaml
   externalSecrets:
     enabled: true
     targetSecretName: clearvoice-secrets
     secretStoreRef:
       kind: ClusterSecretStore
       name: aws-secretsmanager
     data:
       - secretKey: postgres-connection-string
         remoteRef:
           key: /clearvoice/prod/postgres
           property: connectionString
       - secretKey: keycloak-authority
         remoteRef:
           key: /clearvoice/prod/keycloak
           property: authority
       - secretKey: keycloak-client-id
         remoteRef:
           key: /clearvoice/prod/keycloak
           property: clientId
       - secretKey: keycloak-audience
         remoteRef:
           key: /clearvoice/prod/keycloak
           property: audience
       - secretKey: s3-bucket-name
         remoteRef:
           key: /clearvoice/prod/s3
           property: bucketName
       - secretKey: s3-region
         remoteRef:
           key: /clearvoice/prod/s3
           property: region
   ```

2. **Install the Helm chart**:
   ```bash
   helm install clearvoice ./helm/clearvoice \
     --namespace clearvoice \
     --create-namespace \
     -f helm/clearvoice/values-prod.yaml
   ```

3. **Verify deployment**:
   ```bash
   kubectl get pods -n clearvoice
   kubectl get ingress -n clearvoice
   ```

4. **Check logs**:
   ```bash
   kubectl logs -n clearvoice -l app=api -f
   kubectl logs -n clearvoice -l app=ui -f
   ```

### Helm Chart Structure

```
helm/clearvoice/
├── Chart.yaml                    # Chart metadata
├── values.yaml                   # Default values
├── values-prod.yaml              # Production overrides
└── templates/
    ├── api-deployment.yaml       # .NET API deployment
    ├── ui-deployment.yaml        # Angular UI deployment
  ├── external-secret.yaml      # ExternalSecret for AWS Secrets Manager sync
    ├── services.yaml             # Service definitions
    ├── ingress.yaml              # Ingress for UI & API
    ├── configmap.yaml            # Application config
  ├── secret.yaml               # Static K8s Secret fallback (non-ExternalSecrets mode)
    ├── hpa.yaml                  # Horizontal Pod Autoscaler
    ├── pdb.yaml                  # Pod Disruption Budget
    └── _helpers.tpl              # Helper templates
```

### Configuration

#### Environment Variables (Helm ConfigMap)

**API (`api-deployment.yaml`)**:
```yaml
ASPNETCORE_ENVIRONMENT: Production
ConnectionStrings__DefaultConnection: "Host=<RDS_ENDPOINT>;Port=5432;Database=clearvoice;Username=postgres;Password=<PASSWORD>"
Storage__Provider: S3
Storage__S3__Bucket: my-clearvoice-bucket
Storage__S3__Region: us-east-1
Auth__Authority: https://keycloak.example.com/realms/clearvoice
```

**UI (`ui-deployment.yaml`)**:
```yaml
NG_API_URL: https://api.example.com
NG_AUTH_URL: https://keycloak.example.com/realms/clearvoice
NG_CLIENT_ID: clearvoice-ui
```

#### Secrets (External Secrets -> Kubernetes Secret)

- Store backend secrets in AWS Secrets Manager.
- External Secrets Operator syncs values into `clearvoice-secrets`.
- API pods read values through `api.secretEnv` using standard `secretKeyRef`.
- UI configuration remains public and is delivered via environment/config maps.

### Scaling & High Availability

**Horizontal Pod Autoscaler (HPA)**:
```yaml
# Defined in helm/clearvoice/templates/hpa.yaml
# Scales API pods based on CPU/memory utilization
minReplicas: 2
maxReplicas: 10
targetCPUUtilizationPercentage: 70
```

**Pod Disruption Budget (PDB)**:
```yaml
# Ensures at least 1 pod remains during node drains
minAvailable: 1
```

**Database**:
- **RDS Multi-AZ**: Automatic failover
- **Backups**: Daily snapshots to S3

**Storage**:
- **S3 Versioning**: Enabled for audit compliance
- **Lifecycle**: Archive old files to Glacier after 90 days

### Monitoring & Logging

- **CloudWatch**: Application logs, RDS metrics
- **EKS Logging**: Control plane logs to CloudWatch
- **Prometheus** (optional): Pod metrics via Helm addon
- **ELK Stack** (optional): Centralized logging

### Updating the Deployment

```bash
# Update Helm chart values
helm upgrade clearvoice ./helm/clearvoice \
  --namespace clearvoice \
  -f helm/clearvoice/values-prod.yaml

# Rollback if needed
helm rollback clearvoice 1 --namespace clearvoice
```

---

## Architecture

### Local Stack
- **Keycloak** (in-memory H2) → **PostgreSQL** → **MinIO** (S3-compatible)
- **.NET API** communicates with all three
- **Angular UI** → **.NET API** → **Keycloak** (OIDC)

### Production Stack
- **Keycloak** (managed service or EKS pod) → **AWS RDS PostgreSQL**
- **.NET API** (EKS) → **AWS S3** (via IAM role)
- **Angular UI** (EKS/CloudFront) → **.NET API** (API Gateway or ALB)
- All communication encrypted in transit (TLS 1.3)

---

## Testing

### Local Testing

**Unit Tests**:
```bash
# API (.NET)
cd api/ClearVoice.Api
dotnet test

# UI (Angular)
cd audio-portal-ui
npm test
```

**Integration Tests**:
```bash
# Run full stack with test data
docker compose -f docker-compose.test.yml up
```

**Manual Testing**:
1. Log in as `demo.merchant` → Upload file → Verify in file list
2. Log in as `demo2.merchant` → See shared files from demo.merchant
3. Log in as `demo.finance` → See all files across merchants
4. Verify file isolation: demo1.merchant (MCH-00143) should NOT see demo.merchant files (MCH-00142)

### Production Testing

**Smoke Test**:
```bash
kubectl run smoketest --image=curlimages/curl:8.8.0 -i --rm --restart=Never -- \
  curl -v https://api.example.com/health
```

**Load Test**:
```bash
# Using Apache Bench
ab -n 1000 -c 50 https://clearvoice.example.com/
```

---

## Troubleshooting

### Local

**Port already in use**:
```bash
# API falls back to 5001; check with:
lsof -i :5000
# Or update docker-compose.yml port mapping
```

**Keycloak not ready**:
```bash
docker compose logs keycloak | tail -20
docker compose ps keycloak
```

**Files not uploading**:
```bash
# Check MinIO console: http://localhost:9101
# Verify bucket exists and has anonymous policy
docker compose logs minio-init
```

### Production

**Pods not starting**:
```bash
kubectl describe pod <pod-name> -n clearvoice
kubectl logs <pod-name> -n clearvoice
```

**Database connection issues**:
```bash
# Test RDS connectivity from pod
kubectl exec -it <pod-name> -n clearvoice -- \
  psql -h <rds-endpoint> -U postgres -d clearvoice
```

**S3 access denied**:
```bash
# Verify IAM role attached to EKS node
aws iam list-attached-role-policies --role-name <node-role>
```

---

## Documentation

- [Security & Compliance](docs/SECURITY.md)
- [API Reference](docs/API.md)
- [Database Schema](docs/SCHEMA.md)
- [Keycloak Configuration](docs/KEYCLOAK.md)

---

## License

Proprietary – Pinnacle Auto Finance Ltd

---

## Support

For issues, contact: `dev@clearvoice.example.com`
