#!/bin/sh
# Runs inside the minio/mc (MinIO Client) container.
# Waits until MinIO is healthy, then creates the bucket if it doesn't exist.

set -e

MINIO_HOST="http://minio:9000"
ALIAS="local"
BUCKET="clearvoice-recordings"

echo "⏳ Waiting for MinIO at ${MINIO_HOST}..."
until mc alias set "${ALIAS}" "${MINIO_HOST}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" 2>/dev/null; do
  sleep 2
done

echo "✅ MinIO ready."

if mc ls "${ALIAS}/${BUCKET}" > /dev/null 2>&1; then
  echo "ℹ️  Bucket '${BUCKET}' already exists — skipping."
else
  mc mb "${ALIAS}/${BUCKET}"
  echo "✅ Bucket '${BUCKET}' created."
fi

# Optional: set bucket policy to allow presigned URL access
mc anonymous set download "${ALIAS}/${BUCKET}" 2>/dev/null || true

echo "✅ MinIO init complete."
