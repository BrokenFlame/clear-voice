# ClearVoice Helm Chart

Deploys the ClearVoice Finance Compliance Portal (Angular UI + .NET API) to Kubernetes. Designed for AWS EKS with RDS PostgreSQL, S3 storage, and Keycloak OIDC.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Install](#quick-install)
- [UI Runtime Configuration](#ui-runtime-configuration)
- [Secret Management](#secret-management)
- [Values Reference](#values-reference)
- [Production Deploy (AWS EKS)](#production-deploy-aws-eks)
- [Upgrading and Rolling Back](#upgrading-and-rolling-back)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

| Component | Notes |
|-----------|-------|
| Kubernetes 1.28+ | EKS recommended |
| Helm 3.14+ | |
| AWS ECR | Container image registry |
| AWS RDS PostgreSQL 16 | Managed database |
| AWS S3 bucket | Audio file storage |
| Keycloak | External — deploy separately (see RUNBOOK Part 5) |
| External Secrets Operator | Required in production for AWS Secrets Manager integration |
| cert-manager | Required if using `cert-manager.io/cluster-issuer` annotation for TLS |

---

## Quick Install

```bash
helm upgrade --install clearvoice ./helm/clearvoice \
  --namespace clearvoice \
  --create-namespace \
  -f helm/clearvoice/values-prod.yaml \
  --set global.imageRegistry=123456789012.dkr.ecr.eu-west-2.amazonaws.com \
  --set api.image.tag=1.0.0 \
  --set ui.image.tag=1.0.0 \
  --wait --timeout 5m
```

Verify:

```bash
kubectl get pods -n clearvoice
kubectl get ingress -n clearvoice
curl https://clearvoice.example.com/health
```

---

## UI Runtime Configuration

The Angular UI is a pre-built static SPA served by nginx. Its backend URLs and OIDC settings are **not baked into the image** — they are injected at pod startup as environment variables, written to `/tmp/env.js`, and loaded by `index.html` before Angular bootstraps.

This means **one image works in all environments** (local Docker, staging, production) without rebuilding.

### Helm values

```yaml
ui:
  env:
    NG_API_URL:      https://api.clearvoice.example.com   # .NET API origin
    NG_KEYCLOAK_URL: https://keycloak.example.com/realms/clearvoice
    NG_CLIENT_ID:    clearvoice-ui
```

### All supported env vars

| Variable | Required | Description |
|----------|----------|-------------|
| `NG_API_URL` | Yes | Base URL of the .NET API |
| `NG_KEYCLOAK_URL` | Yes | Full Keycloak realm URL (issuer) |
| `NG_CLIENT_ID` | Yes | Keycloak public client ID |
| `NG_REDIRECT_URI` | No | OIDC redirect URI — defaults to `{origin}/auth/callback` |
| `NG_POST_LOGOUT_REDIRECT_URI` | No | Post-logout URI — defaults to `{origin}` |
| `NG_SCOPE` | No | OIDC scopes — defaults to `openid profile email` |
| `NG_RESPONSE_TYPE` | No | OIDC response type — defaults to `code` |
| `NG_REQUIRE_HTTPS` | No | `true` / `false` — defaults to `true` in prod env |
| `NG_SHOW_DEBUG` | No | `true` / `false` — enables OIDC debug logging |
| `NG_SESSION_CHECKS_ENABLED` | No | `true` / `false` — Keycloak session iframe checks |

Unset variables fall back to the values in `src/environments/environment.prod.ts`. You only need to set variables that differ from those defaults.

### Content-Security-Policy

The nginx CSP `connect-src` directive must include both the API origin and the Keycloak origin. In production, override the policy in `values-prod.yaml`:

```yaml
security:
  csp:
    policy: >-
      default-src 'self';
      script-src 'self';
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      font-src 'self' https://fonts.gstatic.com;
      img-src 'self' data:;
      connect-src 'self' https://api.clearvoice.example.com https://keycloak.example.com;
      frame-ancestors 'none';
```

---

## Secret Management

### Production — AWS Secrets Manager + External Secrets Operator

Store backend secrets in AWS Secrets Manager. The External Secrets Operator syncs them into a standard Kubernetes Secret (`clearvoice-secrets`) that the API pods consume via `secretKeyRef`.

**The Angular UI does not consume secrets.** All UI config values (API URL, Keycloak issuer, client ID) are public and passed as plain ConfigMap/env values.

Enable in `values-prod.yaml`:

```yaml
externalSecrets:
  enabled: true
  targetSecretName: clearvoice-secrets
  refreshInterval: 1h
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

**Required cluster setup:**
1. External Secrets Operator installed in the cluster.
2. A `ClusterSecretStore` named `aws-secretsmanager` that can reach AWS Secrets Manager.
3. The ESO service account has IAM permission to read the referenced secret paths.

### Fallback — static Kubernetes Secret

If `externalSecrets.enabled` is `false` (e.g., staging or non-AWS environments), the chart renders `templates/secret.yaml` as a static Kubernetes Secret. Populate values using `--set` or a local override file that is **not committed to source control**:

```bash
helm upgrade --install clearvoice ./helm/clearvoice \
  --namespace clearvoice \
  --set "api.secretValues.postgres-connection-string=Host=...;..." \
  --set "api.secretValues.keycloak-authority=https://..."
```

### Secret key alignment

`api.secretEnv` maps Kubernetes Secret keys to .NET environment variables. The default `targetSecretName` is `clearvoice-secrets`. If you change it, update `api.secretEnv[*].secretName` to match.

---

## Values Reference

### Global

| Key | Default | Description |
|-----|---------|-------------|
| `global.imageRegistry` | `""` | ECR registry prefix, e.g. `123456789012.dkr.ecr.eu-west-2.amazonaws.com` |
| `global.environment` | `production` | Environment label |

### API

| Key | Default | Description |
|-----|---------|-------------|
| `api.image.repository` | `clearvoice/api` | Image name (appended to `global.imageRegistry`) |
| `api.image.tag` | `1.0.0` | Image tag |
| `api.replicaCount` | `2` | Number of replicas (overridden by HPA when enabled) |
| `api.autoscaling.enabled` | `true` | Enable HPA |
| `api.autoscaling.minReplicas` | `2` | HPA minimum |
| `api.autoscaling.maxReplicas` | `6` | HPA maximum |
| `api.serviceAccount.annotations` | `{}` | Set `eks.amazonaws.com/role-arn` here for IRSA |
| `api.env` | see values.yaml | Non-secret env vars (passed via ConfigMap) |
| `api.secretEnv` | see values.yaml | Secret-backed env vars (`secretKeyRef`) |

### UI

| Key | Default | Description |
|-----|---------|-------------|
| `ui.image.repository` | `clearvoice/ui` | Image name |
| `ui.image.tag` | `1.0.0` | Image tag |
| `ui.replicaCount` | `2` | Number of replicas |
| `ui.autoscaling.enabled` | `true` | Enable HPA |
| `ui.env.NG_API_URL` | `https://api.clearvoice.example.com` | API base URL injected at startup |
| `ui.env.NG_KEYCLOAK_URL` | `https://keycloak.example.com/realms/clearvoice` | Keycloak issuer injected at startup |
| `ui.env.NG_CLIENT_ID` | `clearvoice-ui` | OIDC public client ID |

### Ingress

| Key | Default | Description |
|-----|---------|-------------|
| `ingress.enabled` | `true` | Deploy Ingress resource |
| `ingress.className` | `""` | Ingress class: `istio`, `alb`, `nginx`, etc. |
| `ingress.annotations` | `{}` | Controller-specific annotations |
| `ingress.hosts` | see values.yaml | Host/path rules — `/api` → API service, `/` → UI service |
| `ingress.tls` | `[]` | TLS config; leave empty if gateway handles TLS without a K8s secret |

### External Secrets

| Key | Default | Description |
|-----|---------|-------------|
| `externalSecrets.enabled` | `false` | Enable ExternalSecret resource |
| `externalSecrets.targetSecretName` | `clearvoice-secrets` | Name of the synced Kubernetes Secret |
| `externalSecrets.refreshInterval` | `1h` | How often ESO re-reads from AWS |
| `externalSecrets.secretStoreRef.name` | `aws-secretsmanager` | Name of the SecretStore/ClusterSecretStore |
| `externalSecrets.data` | see values.yaml | List of `{secretKey, remoteRef}` mappings |

---

## Production Deploy (AWS EKS)

For the complete step-by-step guide see **[RUNBOOK.md](../../RUNBOOK.md)** (Parts 2–9).

### Summary

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=eu-west-2
ECR_BASE=${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

# Authenticate Docker to ECR
aws ecr get-login-password --region ${REGION} \
  | docker login --username AWS --password-stdin ${ECR_BASE}

# Build and push images (from repo root)
docker build --platform linux/amd64 -t ${ECR_BASE}/clearvoice/api:1.0.0 ./api
docker build --platform linux/amd64 -t ${ECR_BASE}/clearvoice/ui:1.0.0  -f ui/Dockerfile .
docker push ${ECR_BASE}/clearvoice/api:1.0.0
docker push ${ECR_BASE}/clearvoice/ui:1.0.0

# Deploy
helm upgrade --install clearvoice ./helm/clearvoice \
  --namespace clearvoice \
  --create-namespace \
  -f helm/clearvoice/values-prod.yaml \
  --set global.imageRegistry=${ECR_BASE} \
  --set api.image.tag=1.0.0 \
  --set ui.image.tag=1.0.0 \
  --wait --timeout 5m
```

### Ingress options

**Istio** (used in `values-prod.yaml`):
```yaml
ingress:
  className: istio
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  tls:
    - secretName: clearvoice-tls
      hosts: [clearvoice.example.com]
```

**AWS ALB** (alternative):
```yaml
ingress:
  className: alb
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/certificate-arn: "arn:aws:acm:eu-west-2:ACCOUNT:certificate/CERT-ID"
    alb.ingress.kubernetes.io/ssl-redirect: "443"
  tls: []   # ALB handles TLS; no K8s secret needed
```

### IRSA for S3 access

The API pod accesses S3 without static credentials using IAM Roles for Service Accounts:

```yaml
api:
  serviceAccount:
    annotations:
      eks.amazonaws.com/role-arn: "arn:aws:iam::ACCOUNT_ID:role/clearvoice-api-s3-role"
  env:
    Storage__S3__UseIRSA: "true"
```

See RUNBOOK Part 4 for the IAM role and trust policy setup.

### Database migrations

Never run `EnsureCreated` in production. Run migrations as a Kubernetes Job before deploying a new chart version. See RUNBOOK Part 8 for the migration Job manifest and the `--migrate-only` flag.

---

## Upgrading and Rolling Back

```bash
# Upgrade to a new image tag
helm upgrade clearvoice ./helm/clearvoice \
  --namespace clearvoice \
  -f helm/clearvoice/values-prod.yaml \
  --set global.imageRegistry=${ECR_BASE} \
  --set api.image.tag=1.0.1 \
  --set ui.image.tag=1.0.1 \
  --wait

# Dry-run to validate templates before applying
helm upgrade clearvoice ./helm/clearvoice \
  --namespace clearvoice \
  -f helm/clearvoice/values-prod.yaml \
  --dry-run

# View release history
helm history clearvoice -n clearvoice

# Roll back to the previous release
helm rollback clearvoice -n clearvoice

# Roll back to a specific revision
helm rollback clearvoice 3 -n clearvoice
```

---

## Troubleshooting

```bash
# Check pod status and recent events
kubectl get pods -n clearvoice
kubectl describe pod -n clearvoice <pod-name>

# Stream API logs (structured JSON)
kubectl logs -n clearvoice -l app.kubernetes.io/component=api -f --tail=100

# Stream UI (nginx) logs
kubectl logs -n clearvoice -l app.kubernetes.io/component=ui -f --tail=50

# Verify runtime env.js is served correctly
kubectl port-forward -n clearvoice svc/clearvoice-ui 8080:80
curl http://localhost:8080/env.js

# Port-forward API for direct health/swagger access
kubectl port-forward -n clearvoice svc/clearvoice-api 5000:80
curl http://localhost:5000/health

# Check External Secret sync status
kubectl describe externalsecret -n clearvoice clearvoice-external-secret
kubectl get secret -n clearvoice clearvoice-secrets

# Validate Helm template rendering locally
helm template clearvoice ./helm/clearvoice \
  -f helm/clearvoice/values-prod.yaml \
  --set global.imageRegistry=example.dkr.ecr.eu-west-2.amazonaws.com
```
