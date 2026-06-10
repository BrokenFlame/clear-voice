#!/bin/sh
set -eu

KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak:8080}"
REALM="${KEYCLOAK_REALM:-clearvoice}"
ADMIN_USER="${KEYCLOAK_ADMIN_USER:-admin}"
ADMIN_PASS="${KEYCLOAK_ADMIN_PASSWORD:-admin}"

TOKEN_RESPONSE=$(curl -sS -X POST "$KEYCLOAK_URL/realms/master/protocol/openid-connect/token" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "username=$ADMIN_USER" \
  -d "password=$ADMIN_PASS" \
  -d 'grant_type=password' \
  -d 'client_id=admin-cli')

ACCESS_TOKEN=$(printf '%s' "$TOKEN_RESPONSE" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')
if [ -z "$ACCESS_TOKEN" ]; then
  echo "Failed to get Keycloak admin token"
  echo "$TOKEN_RESPONSE"
  exit 1
fi

auth_header() {
  printf 'Authorization: Bearer %s' "$ACCESS_TOKEN"
}

get_client_id() {
  CLIENT_RESPONSE=$(curl -sS -f "$KEYCLOAK_URL/admin/realms/$REALM/clients?clientId=clearvoice-ui" \
    -H "$(auth_header)")
  printf '%s' "$CLIENT_RESPONSE" | grep -o '"id":"[^"]*"' | head -n 1 | cut -d'"' -f4
}

ensure_identity_provider_mapper() {
  CLIENT_ID=$(get_client_id)
  if [ -z "$CLIENT_ID" ]; then
    echo "Failed to resolve clearvoice-ui client id"
    exit 1
  fi

  MAPPERS_RESPONSE=$(curl -sS -f "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_ID/protocol-mappers/models" \
    -H "$(auth_header)")

  if printf '%s' "$MAPPERS_RESPONSE" | grep -q '"name":"identity_provider"'; then
    return
  fi

  cat >/tmp/identity-provider-mapper.json <<'JSON'
{
  "name": "identity_provider",
  "protocol": "openid-connect",
  "protocolMapper": "oidc-usermodel-attribute-mapper",
  "consentRequired": false,
  "config": {
    "userinfo.token.claim": "true",
    "user.attribute": "identity_provider",
    "id.token.claim": "true",
    "access.token.claim": "true",
    "claim.name": "identity_provider",
    "jsonType.label": "String"
  }
}
JSON

  curl -sS -f -X POST "$KEYCLOAK_URL/admin/realms/$REALM/clients/$CLIENT_ID/protocol-mappers/models" \
    -H "$(auth_header)" \
    -H 'Content-Type: application/json' \
    --data-binary @/tmp/identity-provider-mapper.json >/dev/null
}

lookup_user_id() {
  USERNAME="$1"
  USER_RESPONSE=$(curl -sS -f "$KEYCLOAK_URL/admin/realms/$REALM/users?username=$USERNAME&exact=true" \
    -H "$(auth_header)")
  printf '%s' "$USER_RESPONSE" | grep -o '"id":"[^"]*"' | head -n 1 | cut -d'"' -f4
}

ensure_finance_demo_user() {
  USER_ID=$(lookup_user_id demo.finance)

  if [ -z "$USER_ID" ]; then
    cat >/tmp/demo-finance-user.json <<'JSON'
{
  "username": "demo.finance",
  "email": "demo.finance@example.com",
  "firstName": "Demo",
  "lastName": "Finance",
  "enabled": true,
  "emailVerified": true,
  "attributes": {
    "identity_provider": ["keycloak"],
    "organisation_name": ["Pinnacle Auto Finance Ltd"]
  }
}
JSON

    curl -sS -f -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users" \
      -H "$(auth_header)" \
      -H 'Content-Type: application/json' \
      --data-binary @/tmp/demo-finance-user.json >/dev/null

    USER_ID=$(lookup_user_id demo.finance)
  fi

  if [ -z "$USER_ID" ]; then
    echo "Failed to create or resolve demo.finance user"
    exit 1
  fi

  cat >/tmp/demo-finance-user-update.json <<'JSON'
{
  "id": "REPLACE_USER_ID",
  "username": "demo.finance",
  "email": "demo.finance@example.com",
  "firstName": "Demo",
  "lastName": "Finance",
  "enabled": true,
  "emailVerified": true,
  "attributes": {
    "identity_provider": ["keycloak"],
    "organisation_name": ["Pinnacle Auto Finance Ltd"]
  }
}
JSON
  sed -i "s/REPLACE_USER_ID/$USER_ID/g" /tmp/demo-finance-user-update.json

  curl -sS -f -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID" \
    -H "$(auth_header)" \
    -H 'Content-Type: application/json' \
    --data-binary @/tmp/demo-finance-user-update.json >/dev/null

  cat >/tmp/demo-finance-password.json <<'JSON'
{
  "type": "password",
  "value": "finance123!",
  "temporary": false
}
JSON

  curl -sS -f -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID/reset-password" \
    -H "$(auth_header)" \
    -H 'Content-Type: application/json' \
    --data-binary @/tmp/demo-finance-password.json >/dev/null

  ROLE_RESPONSE=$(curl -sS -f "$KEYCLOAK_URL/admin/realms/$REALM/roles/finance_staff" \
    -H "$(auth_header)")

  curl -sS -f -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID/role-mappings/realm" \
    -H "$(auth_header)" \
    -H 'Content-Type: application/json' \
    --data-binary "[$ROLE_RESPONSE]" >/dev/null || true
}

ensure_merchant2_demo_user() {
  USER_ID=$(lookup_user_id demo2.merchant)

  if [ -z "$USER_ID" ]; then
    cat >/tmp/demo2-merchant-user.json <<'JSON'
{
  "username": "demo2.merchant",
  "email": "demo2.merchant@example.com",
  "firstName": "Demo2",
  "lastName": "Merchant",
  "enabled": true,
  "emailVerified": true,
  "attributes": {
    "identity_provider": ["keycloak"],
    "merchant_id": ["MCH-00142"],
    "organisation_name": ["Pinnacle Auto Finance Ltd"]
  }
}
JSON

    curl -sS -f -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users" \
      -H "$(auth_header)" \
      -H 'Content-Type: application/json' \
      --data-binary @/tmp/demo2-merchant-user.json >/dev/null

    USER_ID=$(lookup_user_id demo2.merchant)
  fi

  if [ -z "$USER_ID" ]; then
    echo "Failed to create or resolve demo2.merchant user"
    exit 1
  fi

  cat >/tmp/demo2-merchant-password.json <<'JSON'
{
  "type": "password",
  "value": "merchant123!",
  "temporary": false
}
JSON

  curl -sS -f -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID/reset-password" \
    -H "$(auth_header)" \
    -H 'Content-Type: application/json' \
    --data-binary @/tmp/demo2-merchant-password.json >/dev/null

  ROLE_RESPONSE=$(curl -sS -f "$KEYCLOAK_URL/admin/realms/$REALM/roles/merchant_employee" \
    -H "$(auth_header)")

  curl -sS -f -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID/role-mappings/realm" \
    -H "$(auth_header)" \
    -H 'Content-Type: application/json' \
    --data-binary "[$ROLE_RESPONSE]" >/dev/null || true
}

ensure_merchant1_demo_user() {
  USER_ID=$(lookup_user_id demo1.merchant)

  if [ -z "$USER_ID" ]; then
    cat >/tmp/demo1-merchant-user.json <<'JSON'
{
  "username": "demo1.merchant",
  "email": "demo1.merchant@example.com",
  "firstName": "Demo1",
  "lastName": "Merchant",
  "enabled": true,
  "emailVerified": true,
  "attributes": {
    "identity_provider": ["keycloak"],
    "merchant_id": ["MCH-00143"],
    "organisation_name": ["Premier Transport Finance Ltd"]
  }
}
JSON

    curl -sS -f -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users" \
      -H "$(auth_header)" \
      -H 'Content-Type: application/json' \
      --data-binary @/tmp/demo1-merchant-user.json >/dev/null

    USER_ID=$(lookup_user_id demo1.merchant)
  fi

  if [ -z "$USER_ID" ]; then
    echo "Failed to create or resolve demo1.merchant user"
    exit 1
  fi

  cat >/tmp/demo1-merchant-password.json <<'JSON'
{
  "type": "password",
  "value": "merchant123!",
  "temporary": false
}
JSON

  curl -sS -f -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID/reset-password" \
    -H "$(auth_header)" \
    -H 'Content-Type: application/json' \
    --data-binary @/tmp/demo1-merchant-password.json >/dev/null

  ROLE_RESPONSE=$(curl -sS -f "$KEYCLOAK_URL/admin/realms/$REALM/roles/merchant_employee" \
    -H "$(auth_header)")

  curl -sS -f -X POST "$KEYCLOAK_URL/admin/realms/$REALM/users/$USER_ID/role-mappings/realm" \
    -H "$(auth_header)" \
    -H 'Content-Type: application/json' \
    --data-binary "[$ROLE_RESPONSE]" >/dev/null || true
}

cat >/tmp/user-profile.json <<'JSON'
{
  "attributes": [
    {
      "name": "username",
      "displayName": "${username}",
      "validations": {
        "length": {"min": 3, "max": 255},
        "username-prohibited-characters": {},
        "up-username-not-idn-homograph": {}
      },
      "permissions": {"view": ["admin", "user"], "edit": ["admin", "user"]},
      "multivalued": false
    },
    {
      "name": "email",
      "displayName": "${email}",
      "validations": {"email": {}, "length": {"max": 255}},
      "required": {"roles": ["user"]},
      "permissions": {"view": ["admin", "user"], "edit": ["admin", "user"]},
      "multivalued": false
    },
    {
      "name": "firstName",
      "displayName": "${firstName}",
      "validations": {"length": {"max": 255}, "person-name-prohibited-characters": {}},
      "required": {"roles": ["user"]},
      "permissions": {"view": ["admin", "user"], "edit": ["admin", "user"]},
      "multivalued": false
    },
    {
      "name": "lastName",
      "displayName": "${lastName}",
      "validations": {"length": {"max": 255}, "person-name-prohibited-characters": {}},
      "required": {"roles": ["user"]},
      "permissions": {"view": ["admin", "user"], "edit": ["admin", "user"]},
      "multivalued": false
    },
    {
      "name": "merchant_id",
      "displayName": "Merchant ID",
      "validations": {
        "length": {"min": 1, "max": 64},
        "pattern": {
          "pattern": "^[A-Za-z0-9_-]+$",
          "error-message": "Merchant ID must contain only letters, numbers, underscore or hyphen"
        }
      },
      "permissions": {"view": ["admin", "user"], "edit": ["admin"]},
      "multivalued": false
    },
    {
      "name": "organisation_name",
      "displayName": "Organisation",
      "validations": {"length": {"min": 1, "max": 128}},
      "permissions": {"view": ["admin", "user"], "edit": ["admin"]},
      "multivalued": false
    }
  ],
  "groups": [
    {
      "name": "user-metadata",
      "displayHeader": "User metadata",
      "displayDescription": "Attributes, which refer to user metadata"
    }
  ],
  "unmanagedAttributePolicy": "ENABLED"
}
JSON

curl -sS -f -X PUT "$KEYCLOAK_URL/admin/realms/$REALM/users/profile" \
  -H "$(auth_header)" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/user-profile.json >/dev/null

PROFILE=$(curl -sS -f "$KEYCLOAK_URL/admin/realms/$REALM/users/profile" -H "$(auth_header)")
printf '%s' "$PROFILE" | grep -q '"name":"merchant_id"' || {
  echo "merchant_id not found in realm user profile after update"
  exit 1
}

ensure_identity_provider_mapper
ensure_finance_demo_user
ensure_merchant1_demo_user
ensure_merchant2_demo_user

echo "Keycloak user profile configured and demo users ensured"
