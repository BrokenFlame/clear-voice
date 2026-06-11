import { AuthConfig } from 'angular-oauth2-oidc';
import { runtimeConfig } from '../config/runtime-config';

export const authConfig: AuthConfig = {
  issuer: runtimeConfig.oidc.issuer,
  clientId: runtimeConfig.oidc.clientId,
  redirectUri: runtimeConfig.oidc.redirectUri,
  postLogoutRedirectUri: runtimeConfig.oidc.postLogoutRedirectUri,
  scope: runtimeConfig.oidc.scope,
  responseType: runtimeConfig.oidc.responseType,
  requireHttps: runtimeConfig.oidc.requireHttps,
  showDebugInformation: runtimeConfig.oidc.showDebugInformation,
  sessionChecksEnabled: runtimeConfig.oidc.sessionChecksEnabled,

  // PKCE — S256 is required; Keycloak enforces this on the clearvoice-ui client
  useSilentRefresh: false,
  silentRefreshTimeout: 5000,
  timeoutFactor: 0.75,
  clearHashAfterLogin: true,

  // Store tokens in sessionStorage (cleared on tab close) — safer than localStorage
  // for a shared/public machine risk model.
  // Switch to 'localStorage' if persistent sessions across tabs are required.
  oidc: true,
};
