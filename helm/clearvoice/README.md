# ClearVoice Helm Chart

This chart deploys the ClearVoice API and UI to Kubernetes.

## Production Secret Strategy

Use AWS Secrets Manager with External Secrets Operator.

Flow:

1. Store secret values in AWS Secrets Manager.
2. ExternalSecret (this chart) syncs those values into a Kubernetes Secret.
3. API pods consume the Kubernetes Secret via `secretKeyRef` (existing `api.secretEnv` wiring).

The Angular UI should not consume confidential secrets. Browser-facing values (API URL, Keycloak realm URL, public OIDC client ID) remain public configuration.

## External Secrets Values

Configure in `values-prod.yaml` (or your own override file):

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

## Required Cluster Prerequisites

1. External Secrets Operator installed.
2. A `SecretStore` or `ClusterSecretStore` that can access AWS Secrets Manager.
3. IAM permissions for ESO to read the referenced AWS secret paths.

## Secret Name Alignment

`api.secretEnv` expects keys in the Kubernetes Secret named `clearvoice-secrets` by default.

If you change `externalSecrets.targetSecretName`, update `api.secretEnv[*].secretName` to match.

## Fallback Mode

If `externalSecrets.enabled` is `false`, this chart renders `templates/secret.yaml` as a static Kubernetes Secret fallback.

## Deploy

```bash
helm upgrade --install clearvoice ./helm/clearvoice \
  --namespace clearvoice \
  --create-namespace \
  -f helm/clearvoice/values-prod.yaml
```
