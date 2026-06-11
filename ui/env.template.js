window.__env = {
  apiBaseUrl: "${NG_API_URL}",
  oidc: {
    issuer: "${NG_KEYCLOAK_URL}",
    clientId: "${NG_CLIENT_ID}",
    redirectUri: "${NG_REDIRECT_URI}",
    postLogoutRedirectUri: "${NG_POST_LOGOUT_REDIRECT_URI}",
    scope: "${NG_SCOPE}",
    responseType: "${NG_RESPONSE_TYPE}",
    requireHttps: "${NG_REQUIRE_HTTPS}",
    showDebugInformation: "${NG_SHOW_DEBUG}",
    sessionChecksEnabled: "${NG_SESSION_CHECKS_ENABLED}"
  }
};
