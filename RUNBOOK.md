# ClearVoice — Developer Runbook

## Repository layout

```
clearvoice/
├── api/                        # .NET 9 Minimal API
│   ├── ClearVoice.Api/
│   │   ├── Auth/               # JWT claims helpers
│   │   ├── Data/               # EF Core DbContext
│   │   ├── Endpoints/          # All route definitions
│   │   ├── Models/             # Domain models + DTOs
│   │   ├── Services/           # AuditService, S3StorageProvider
│   │   ├── Program.cs          # Minimal API entry point
│   │   └── appsettings*.json
│   └── Dockerfile              # Multi-stage Linux build
├── audio-portal-ui/            # Angular 20 SPA
│   └── src/app/
│       ├── core/               # Auth, guards, interceptors, API service
│       ├── features/           # login, merchant/*, finance/*, account
│       └── shared/             # Shell layout components
├── ui/
│   ├── Dockerfile              # nginx serving the Angular build
│   └── nginx.conf              # SPA fallback + security headers
├── keycloak-theme/
│   ├── clearvoice-realm.json   # Full realm export (import on first boot)
│   └── clearvoice/login/       # Custom FTL theme + CSS
├── helm/clearvoice/            # Helm chart for EKS
└── docker-compose.yml          # Local full-stack
```

---

## Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| .NET SDK | 9.0 | https://dot.net |
| Node.js | 22.x | https://nodejs.org |
| Angular CLI | 20.x | `npm i -g @angular/cli@20` |
| Docker Desktop | 4.x | https://docker.com |
| AWS CLI | 2.x | https://aws.amazon.com/cli |
| kubectl | 1.29+ | https://kubernetes.io/docs/tasks/tools |
| Helm | 3.14+ | https://helm.sh |
| eksctl | 0.175+ | https://eksctl.io *(for cluster creation only)* |

---

## Part 1 — Running locally (Mac)

No AWS account needed. MinIO provides a fully S3-compatible store running in Docker.

There are two modes — choose the one that suits your task:

| Mode | When to use |
|------|-------------|
| **Local demo** (all-in-Docker) | Quick smoke test; no SDK install needed |
| **Local dev** (hot-reload) | Feature work; instant recompile on save |

---

### Local demo — full stack in Docker

No SDK installation required.

```bash
cd clear-voice
docker compose up --build
```

This starts all services and serves the Angular UI on **http://localhost:4200**.

To rebuild only the UI after a code change:

```bash
docker compose up -d --build ui
```

#### UI runtime configuration (Docker)

The Dockerised UI is a production Angular build. At container startup `docker-entrypoint.sh` runs `envsubst` on `ui/env.template.js` and writes `/tmp/env.js`, which `index.html` loads before Angular bootstraps. The values come from `docker-compose.yml`:

```yaml
NG_API_URL:       http://localhost:5000
NG_KEYCLOAK_URL:  http://localhost:8080/realms/clearvoice
NG_CLIENT_ID:     clearvoice-ui
NG_REQUIRE_HTTPS: "false"
NG_SHOW_DEBUG:    "true"
```

Change any of these in `docker-compose.yml`, then `docker compose up -d --build ui`.

---

### Local dev — hot-reload

#### Prerequisites

```bash
# Install .NET 9 SDK — download from https://dot.net
# or with Homebrew:
brew install --cask dotnet-sdk

# Install Node 22
brew install node@22
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc

# Install Angular CLI 20
npm install -g @angular/cli@20

# Docker Desktop for Mac — https://www.docker.com/products/docker-desktop
# (make sure it's running before continuing)
```

#### Step 1 — Start backing services only

This starts PostgreSQL, Keycloak, MinIO, and the one-shot init containers:

```bash
cd clear-voice
docker compose up -d postgres keycloak keycloak-profile-init minio minio-init
```

Watch the startup (takes about 30–45 s for Keycloak):

```bash
docker compose ps
# All services should reach "healthy" or "exited (0)" for one-shot init jobs
```

What you get:

| Service | URL | Credentials |
|---------|-----|-------------|
| PostgreSQL | localhost:5432 | clearvoice / clearvoice_dev |
| Keycloak admin | http://localhost:8080 | admin / admin |
| MinIO S3 API | http://localhost:9100 | clearvoice / clearvoice_dev_secret |
| MinIO web console | http://localhost:9101 | clearvoice / clearvoice_dev_secret |

The Keycloak `clearvoice` realm is auto-imported. Demo users are pre-created by `keycloak-profile-init`.

Expected one-shot service states:
- `minio-init` → `Exited (0)`
- `keycloak-profile-init` → `Exited (0)`

If `keycloak-profile-init` fails:

```bash
docker compose logs keycloak-profile-init --tail=200
docker compose up keycloak-profile-init
```

#### Step 2 — Run the .NET API

```bash
cd clear-voice/api/ClearVoice.Api
dotnet restore
dotnet run
# or with hot-reload:
dotnet watch
```

The API starts on **http://localhost:5000**. On first run it automatically creates the database schema (Development mode only — production uses `dotnet ef migrations`).

Swagger UI: http://localhost:5000/swagger

To run EF Core migrations manually, or create new ones after model changes:

```bash
dotnet tool install --global dotnet-ef      # one-time
dotnet ef database update                   # apply pending migrations
dotnet ef migrations add <MigrationName>    # create a new migration
```

#### Step 3 — Run the Angular UI

```bash
cd clear-voice/audio-portal-ui
npm install          # first time only
ng serve --port 4200
```

Open **http://localhost:4200**.

In this mode Angular uses `src/environments/environment.ts` (file-replaced at build time), which points at `http://localhost:5000` and `http://localhost:8080`. No `env.js` or container env vars are needed.

#### Step 5 — Log in and test the full flow

1. Click **"Sign in with merchant credentials"**
2. Log in as `demo.merchant` / `merchant123!`
3. You land on the merchant **Files** page
4. Navigate to **Upload** and drop an `.mp3` file
5. Check the upload landed in MinIO:

```bash
# Via MinIO web console — http://localhost:9101
# Browse to clearvoice-recordings bucket

# Or via the mc CLI (install separately if needed):
docker run --rm --network clearvoice_default minio/mc \
  alias set local http://minio:9000 clearvoice clearvoice_dev_secret \
  && mc ls local/clearvoice-recordings/MCH-00142/
```

6. Visit http://localhost:5000/swagger to test endpoints directly

To get a Bearer token for Swagger:

```bash
curl -s -X POST \
  'http://localhost:8080/realms/clearvoice/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'client_id=clearvoice-ui&grant_type=password&username=demo.merchant&password=merchant123!' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])"
```

Paste the output into **Swagger → Authorize**.

### Stopping and resetting

```bash
# Stop everything (data volumes preserved)
docker compose down

# Stop and wipe all data (clean slate)
docker compose down -v

# Restart just one service
docker compose restart keycloak
```

---

## Part 2 — Building Docker images for Linux / AMD64

Both images target `linux/amd64` explicitly so they run correctly on EKS nodes.

### Build the API image

```bash
cd clearvoice/api

docker build \
  --platform linux/amd64 \
  -t clearvoice/api:1.0.0 \
  -f Dockerfile \
  .
```

### Build the UI image

The UI Dockerfile expects to find `audio-portal-ui/` in the build context (the `clearvoice/` root):

```bash
cd clearvoice

docker build \
  --platform linux/amd64 \
  -t clearvoice/ui:1.0.0 \
  -f ui/Dockerfile \
  .
```

### Test the containerised stack locally

```bash
cd clear-voice
docker compose up --build
```

This starts: postgres → keycloak → keycloak-profile-init → minio → minio-init → api → ui (nginx on port 4200).

### Push images to ECR

Replace `ACCOUNT_ID` and `REGION` throughout:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=eu-west-2
ECR_BASE=${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

# Authenticate
aws ecr get-login-password --region ${REGION} \
  | docker login --username AWS --password-stdin ${ECR_BASE}

# Create repositories (one-time)
aws ecr create-repository --repository-name clearvoice/api  --region ${REGION}
aws ecr create-repository --repository-name clearvoice/ui   --region ${REGION}

# Tag and push
docker tag clearvoice/api:1.0.0 ${ECR_BASE}/clearvoice/api:1.0.0
docker tag clearvoice/ui:1.0.0  ${ECR_BASE}/clearvoice/ui:1.0.0

docker push ${ECR_BASE}/clearvoice/api:1.0.0
docker push ${ECR_BASE}/clearvoice/ui:1.0.0
```

---

## Part 3 — EKS cluster setup

> Skip this section if you already have an EKS cluster.

```bash
eksctl create cluster \
  --name clearvoice \
  --region eu-west-2 \
  --nodegroup-name standard \
  --node-type t3.medium \
  --nodes 2 \
  --nodes-min 2 \
  --nodes-max 6 \
  --managed

# Update your local kubeconfig
aws eks update-kubeconfig --name clearvoice --region eu-west-2
kubectl get nodes   # verify connectivity
```

### Install cluster add-ons

**AWS Load Balancer Controller** (required for ALB Ingress):

```bash
# Install the IAM policy
curl -o alb-iam-policy.json https://raw.githubusercontent.com/kubernetes-sigs/aws-load-balancer-controller/main/docs/install/iam_policy.json
aws iam create-policy \
  --policy-name AWSLoadBalancerControllerIAMPolicy \
  --policy-document file://alb-iam-policy.json

# Add the Helm repo and install
helm repo add eks https://aws.github.io/eks-charts
helm repo update
helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=clearvoice \
  --set serviceAccount.create=true \
  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=arn:aws:iam::${ACCOUNT_ID}:role/AmazonEKSLoadBalancerControllerRole
```

---

## Part 4 — IRSA setup for S3 access

IRSA (IAM Roles for Service Accounts) lets the API pod access S3 without static credentials. The pod's service account is annotated with an IAM role ARN; the EKS pod identity webhook injects a projected token that the AWS SDK exchanges for temporary credentials automatically.

### Step 1 — Enable OIDC provider for your cluster

```bash
eksctl utils associate-iam-oidc-provider \
  --cluster clearvoice \
  --region eu-west-2 \
  --approve
```

### Step 2 — Create the IAM policy for S3

```bash
cat > clearvoice-s3-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::clearvoice-recordings-YOURBUCKET",
        "arn:aws:s3:::clearvoice-recordings-YOURBUCKET/*"
      ]
    }
  ]
}
EOF

aws iam create-policy \
  --policy-name ClearVoiceS3Policy \
  --policy-document file://clearvoice-s3-policy.json
```

### Step 3 — Create the IAM role with trust policy

```bash
OIDC_PROVIDER=$(aws eks describe-cluster --name clearvoice --region eu-west-2 \
  --query "cluster.identity.oidc.issuer" --output text | sed 's|https://||')

NAMESPACE=clearvoice
SERVICE_ACCOUNT=clearvoice-api

cat > trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_PROVIDER}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "${OIDC_PROVIDER}:sub": "system:serviceaccount:${NAMESPACE}:${SERVICE_ACCOUNT}",
          "${OIDC_PROVIDER}:aud": "sts.amazonaws.com"
        }
      }
    }
  ]
}
EOF

aws iam create-role \
  --role-name clearvoice-api-s3-role \
  --assume-role-policy-document file://trust-policy.json

aws iam attach-role-policy \
  --role-name clearvoice-api-s3-role \
  --policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/ClearVoiceS3Policy
```

Note the Role ARN — you'll need it in the Helm values:
```bash
aws iam get-role --role-name clearvoice-api-s3-role --query Role.Arn --output text
```

---

## Part 5 — Keycloak on EKS

For production, deploy Keycloak using the Bitnami Helm chart backed by RDS PostgreSQL. A minimal setup:

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami

helm upgrade --install keycloak bitnami/keycloak \
  --namespace keycloak --create-namespace \
  --set auth.adminUser=admin \
  --set auth.adminPassword=CHANGE_ME \
  --set externalDatabase.host=YOUR_RDS_ENDPOINT \
  --set externalDatabase.database=keycloak \
  --set externalDatabase.user=keycloak \
  --set externalDatabase.password=CHANGE_ME \
  --set postgresql.enabled=false
```

After Keycloak is running, import the realm and theme:

```bash
# Copy theme into Keycloak pod
KEYCLOAK_POD=$(kubectl get pods -n keycloak -l app.kubernetes.io/name=keycloak -o jsonpath='{.items[0].metadata.name}')
kubectl cp keycloak-theme/clearvoice keycloak/${KEYCLOAK_POD}:/opt/bitnami/keycloak/themes/

# Import realm via admin CLI
kubectl exec -n keycloak ${KEYCLOAK_POD} -- \
  /opt/bitnami/keycloak/bin/kcadm.sh config credentials \
    --server http://localhost:8080 --realm master \
    --user admin --password CHANGE_ME

kubectl exec -n keycloak ${KEYCLOAK_POD} -- \
  /opt/bitnami/keycloak/bin/kcadm.sh create realms \
    -f /tmp/clearvoice-realm.json
```

For Azure AD federation, update `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_TENANT_ID` in the realm JSON before importing, or update via the Keycloak admin console under Identity Providers → Azure.

---

## Part 6 — Deploy to EKS with Helm

### Step 1 — Create the namespace and secrets

```bash
kubectl create namespace clearvoice

# The API reads sensitive config from this Secret
kubectl create secret generic clearvoice-secrets \
  --namespace clearvoice \
  --from-literal=postgres-connection-string="Host=YOUR_RDS;Port=5432;Database=clearvoice;Username=clearvoice;Password=CHANGE_ME" \
  --from-literal=keycloak-authority="https://keycloak.example.com/realms/clearvoice" \
  --from-literal=keycloak-audience="clearvoice-ui" \
  --from-literal=s3-bucket-name="clearvoice-recordings-prod" \
  --from-literal=s3-region="eu-west-2"
```

### Step 2 — Create a production values override file

Create `my-values.yaml` (do not commit to source control):

```yaml
global:
  imageRegistry: "123456789012.dkr.ecr.eu-west-2.amazonaws.com"

api:
  image:
    tag: "1.0.0"
  serviceAccount:
    annotations:
      eks.amazonaws.com/role-arn: "arn:aws:iam::123456789012:role/clearvoice-api-s3-role"

ui:
  image:
    tag: "1.0.0"

ingress:
  annotations:
    alb.ingress.kubernetes.io/certificate-arn: "arn:aws:acm:eu-west-2:123456789012:certificate/YOUR-CERT-ID"
  hosts:
    - host: clearvoice.example.com
      paths:
        - path: /api
          pathType: Prefix
          backend: api
        - path: /
          pathType: Prefix
          backend: ui
```

### Step 3 — Deploy

```bash
helm upgrade --install clearvoice ./helm/clearvoice \
  --namespace clearvoice \
  --values my-values.yaml \
  --wait \
  --timeout 5m
```

### Step 4 — Verify

```bash
# Check all pods are Running
kubectl get pods -n clearvoice

# Check the ALB is provisioned (takes ~2 min)
kubectl get ingress -n clearvoice

# Tail API logs (structured JSON, visible in CloudWatch via Fluent Bit)
kubectl logs -n clearvoice -l app.kubernetes.io/component=api -f

# Health check
curl https://clearvoice.example.com/health
```

### Upgrading

```bash
# After building and pushing new images:
helm upgrade clearvoice ./helm/clearvoice \
  --namespace clearvoice \
  --values my-values.yaml \
  --set api.image.tag=1.0.1 \
  --set ui.image.tag=1.0.1 \
  --wait
```

### Rolling back

```bash
helm rollback clearvoice --namespace clearvoice
```

---

## Part 7 — Adding a merchant user in Keycloak

Finance staff create merchant users via the Keycloak admin console. The critical step is setting the `merchant_id` attribute.

1. Log in to the Keycloak admin console
2. Select the `clearvoice` realm
3. Users → Add user
4. Set Username, Email, First name, Last name
5. Credentials → Set password (uncheck "Temporary")
6. Role Mappings → Add `merchant_employee`
7. **Attributes tab** → Add:
   - Key: `merchant_id` Value: `MCH-XXXXX`
   - Key: `organisation_name` Value: `Trading Name Ltd`

The `merchant_id` attribute flows into the JWT via the protocol mapper configured in the realm export, and is read by the API via `ClaimsExtensions.MerchantId()`.

---

## Part 8 — EF Core database migrations in production

Never auto-migrate in production. Run migrations as a Kubernetes Job before deployment:

```yaml
# k8s/migration-job.yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: clearvoice-migrate-{{ .Release.Revision }}
  namespace: clearvoice
spec:
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: migrate
          image: YOUR_ECR/clearvoice/api:1.0.0
          command: ["dotnet", "ClearVoice.Api.dll", "--migrate-only"]
          env:
            - name: ConnectionStrings__Postgres
              valueFrom:
                secretKeyRef:
                  name: clearvoice-secrets
                  key: postgres-connection-string
```

Add a `--migrate-only` mode to `Program.cs`:

```csharp
if (args.Contains("--migrate-only"))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<AppDbContext>().Database.MigrateAsync();
    return;
}
```

---

## Part 9 — Logging and observability

All application logs are written to **stdout** as compact JSON (Serilog `CompactJsonFormatter`). Every log line includes:

- `@t` — ISO timestamp
- `@l` — level (Information, Warning, Error)
- `@m` — message
- `SourceContext` — class name
- Request path, status code, duration (from `UseSerilogRequestLogging()`)

**Audit events** additionally include: `EventType`, `UserId`, `Username`, `MerchantId`, `FileId`, `IpAddress`.

On EKS, install [Fluent Bit](https://docs.aws.amazon.com/eks/latest/userguide/fargate-logging.html) to ship logs to CloudWatch Logs:

```bash
helm repo add fluent https://fluent.github.io/helm-charts
helm upgrade --install fluent-bit fluent/fluent-bit \
  --namespace kube-system \
  --set config.outputs="[OUTPUT]\n  Name cloudwatch_logs\n  Match *\n  region eu-west-2\n  log_group_name /clearvoice/eks\n  log_stream_prefix app-\n  auto_create_group true"
```

---

## Part 10 — Quick reference

### Local URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| Angular UI | http://localhost:4200 | — |
| .NET API | http://localhost:5000 | — |
| Swagger | http://localhost:5000/swagger | — |
| Keycloak admin | http://localhost:8080 | admin / admin |
| MinIO S3 API | http://localhost:9100 | clearvoice / clearvoice_dev_secret |
| MinIO console | http://localhost:9101 | clearvoice / clearvoice_dev_secret |
| PostgreSQL | localhost:5432 | clearvoice / clearvoice_dev |

### Common commands

```bash
# Start backing services only (Postgres + Keycloak + MinIO)
docker compose up -d postgres keycloak keycloak-profile-init minio minio-init

# Start full containerised stack (all services including API + UI)
docker compose up --build

# Stop all services (keep data volumes)
docker compose down

# Stop and wipe all data (clean slate)
docker compose down -v

# Run Angular dev server
cd audio-portal-ui && ng serve

# Run .NET API (with hot-reload)
cd api/ClearVoice.Api && dotnet watch

# Load MinIO credentials into current shell
source .env

# List uploaded files in MinIO (from host)
docker run --rm --network clearvoice_default minio/mc \
  alias set local http://minio:9000 clearvoice clearvoice_dev_secret \
  && mc ls local/clearvoice-recordings/

# Build production Angular bundle
cd audio-portal-ui && ng build --configuration production

# Build API Docker image for Linux/AMD64
docker build --platform linux/amd64 -t clearvoice/api:1.0.0 ./api

# Helm dry-run (validate templates)
helm upgrade --install clearvoice ./helm/clearvoice \
  --namespace clearvoice --values my-values.yaml --dry-run

# Get all clearvoice resources in cluster
kubectl get all -n clearvoice

# Stream API logs
kubectl logs -n clearvoice -l app.kubernetes.io/component=api -f --tail=100

# Port-forward API for direct testing in cluster
kubectl port-forward -n clearvoice svc/clearvoice-api 5000:80
```

### S3 key format

```
/{merchantId}/{uuid}_{sanitisedFilename}

Example: MCH-00142/a1b2c3d4-e5f6-7890-abcd-ef1234567890_customer-call-june07.mp3
```

Metadata (who uploaded, when, original filename, size) is stored in PostgreSQL. S3 is the blob store only.

### Environment variables (API)

| Variable | Description |
|----------|-------------|
| `Keycloak__Authority` | Keycloak realm URL |
| `Keycloak__Audience` | `clearvoice-ui` |
| `Keycloak__RequireHttpsMetadata` | `true` in production |
| `ConnectionStrings__Postgres` | Full Npgsql connection string |
| `Storage__Provider` | `S3` |
| `Storage__S3__BucketName` | S3 bucket name |
| `Storage__S3__Region` | AWS region |
| `Storage__S3__UseIRSA` | `true` on EKS, `false` locally |
| `ASPNETCORE_ENVIRONMENT` | `Development` / `Production` |
| `ASPNETCORE_URLS` | `http://+:8080` (container) |
