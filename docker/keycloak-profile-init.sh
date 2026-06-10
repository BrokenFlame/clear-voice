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
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/user-profile.json >/dev/null

PROFILE=$(curl -sS -f "$KEYCLOAK_URL/admin/realms/$REALM/users/profile" -H "Authorization: Bearer $ACCESS_TOKEN")
printf '%s' "$PROFILE" | grep -q '"name":"merchant_id"' || {
  echo "merchant_id not found in realm user profile after update"
  exit 1
}

echo "Keycloak user profile configured with merchant_id and organisation_name"
