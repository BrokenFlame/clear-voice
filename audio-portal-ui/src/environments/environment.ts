export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:5000',
  oidc: {
    issuer: 'http://localhost:8080/realms/clearvoice',
    clientId: 'clearvoice-ui',
    redirectUri: 'http://localhost:4200/auth/callback',
    postLogoutRedirectUri: 'http://localhost:4200',
    scope: 'openid profile email',
    responseType: 'code',
    requireHttps: false,
    showDebugInformation: true,
    sessionChecksEnabled: true,
  }
};
