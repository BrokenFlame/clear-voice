#!/bin/sh
set -eu

: "${NG_API_URL:=}"
: "${NG_KEYCLOAK_URL:=}"
: "${NG_CLIENT_ID:=}"
: "${NG_REDIRECT_URI:=}"
: "${NG_POST_LOGOUT_REDIRECT_URI:=}"
: "${NG_SCOPE:=}"
: "${NG_RESPONSE_TYPE:=}"
: "${NG_REQUIRE_HTTPS:=}"
: "${NG_SHOW_DEBUG:=}"
: "${NG_SESSION_CHECKS_ENABLED:=}"

envsubst '${NG_API_URL} ${NG_KEYCLOAK_URL} ${NG_CLIENT_ID} ${NG_REDIRECT_URI} ${NG_POST_LOGOUT_REDIRECT_URI} ${NG_SCOPE} ${NG_RESPONSE_TYPE} ${NG_REQUIRE_HTTPS} ${NG_SHOW_DEBUG} ${NG_SESSION_CHECKS_ENABLED}' \
  < /usr/share/nginx/html/env.template.js \
  > /tmp/env.js

exec nginx -g 'daemon off;'
