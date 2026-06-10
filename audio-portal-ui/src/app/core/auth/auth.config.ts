import { AuthConfig } from 'angular-oauth2-oidc';
import { environment } from '../../environments/environment';

export const authConfig: AuthConfig = {
  issuer: environment.oidc.issuer,
  clientId: environment.oidc.clientId,
  redirectUri: environment.oidc.redirectUri,
  postLogoutRedirectUri: environment.oidc.postLogoutRedirectUri,
  scope: environment.oidc.scope,
  responseType: environment.oidc.responseType,
  requireHttps: environment.oidc.requireHttps,
  showDebugInformation: environment.oidc.showDebugInformation,
  sessionChecksEnabled: environment.oidc.sessionChecksEnabled,

  // PKCE — S256 is required; Keycloak enforces this on the clearvoice-ui client
  useSilentRefresh: false,
  silentRefreshTimeout: 5000,
  timeoutFactor: 0.75,
  clearHashAfterLogin: true,
  nonceStateSeparator: 'semicolon',

  // Store tokens in sessionStorage (cleared on tab close) — safer than localStorage
  // for a shared/public machine risk model.
  // Switch to 'localStorage' if persistent sessions across tabs are required.
  oidc: true,
};
