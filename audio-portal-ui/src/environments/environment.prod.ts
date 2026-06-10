export const environment = {
  production: true,
  apiBaseUrl: 'https://api.clearvoice.example.com',
  oidc: {
    issuer: 'https://keycloak.example.com/realms/clearvoice',
    clientId: 'clearvoice-ui',
    redirectUri: 'https://clearvoice.example.com/auth/callback',
    postLogoutRedirectUri: 'https://clearvoice.example.com',
    scope: 'openid profile email',
    responseType: 'code',
    requireHttps: true,
    showDebugInformation: false,
    sessionChecksEnabled: true,
  }
};
