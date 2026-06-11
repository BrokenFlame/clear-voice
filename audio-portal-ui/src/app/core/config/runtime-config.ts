import { environment } from '../../../environments/environment';

type RuntimeEnv = {
  apiBaseUrl?: string;
  oidc?: {
    issuer?: string;
    clientId?: string;
    redirectUri?: string;
    postLogoutRedirectUri?: string;
    scope?: string;
    responseType?: string;
    requireHttps?: string | boolean;
    showDebugInformation?: string | boolean;
    sessionChecksEnabled?: string | boolean;
  };
};

type RuntimeConfig = {
  apiBaseUrl: string;
  oidc: {
    issuer: string;
    clientId: string;
    redirectUri: string;
    postLogoutRedirectUri: string;
    scope: string;
    responseType: string;
    requireHttps: boolean;
    showDebugInformation: boolean;
    sessionChecksEnabled: boolean;
  };
};

function parseBool(value: string | boolean | undefined, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string' || value.trim().length === 0) return fallback;
  return value.toLowerCase() === 'true';
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function pickString(value: string | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().length > 0 ? value : fallback;
}

function resolveRuntimeConfig(): RuntimeConfig {
  const runtimeEnv = (globalThis as { __env?: RuntimeEnv }).__env ?? {};
  const runtimeOidc = runtimeEnv.oidc ?? {};

  const origin = globalThis.location?.origin ?? '';
  const defaultRedirectUri = origin ? `${origin}/auth/callback` : environment.oidc.redirectUri;
  const defaultPostLogoutUri = origin || environment.oidc.postLogoutRedirectUri;

  return {
    apiBaseUrl: trimTrailingSlash(pickString(runtimeEnv.apiBaseUrl, environment.apiBaseUrl)),
    oidc: {
      issuer: pickString(runtimeOidc.issuer, environment.oidc.issuer),
      clientId: pickString(runtimeOidc.clientId, environment.oidc.clientId),
      redirectUri: pickString(runtimeOidc.redirectUri, defaultRedirectUri),
      postLogoutRedirectUri: pickString(runtimeOidc.postLogoutRedirectUri, defaultPostLogoutUri),
      scope: pickString(runtimeOidc.scope, environment.oidc.scope),
      responseType: pickString(runtimeOidc.responseType, environment.oidc.responseType),
      requireHttps: parseBool(runtimeOidc.requireHttps, environment.oidc.requireHttps),
      showDebugInformation: parseBool(runtimeOidc.showDebugInformation, environment.oidc.showDebugInformation),
      sessionChecksEnabled: parseBool(runtimeOidc.sessionChecksEnabled, environment.oidc.sessionChecksEnabled),
    },
  };
}

export const runtimeConfig = resolveRuntimeConfig();
