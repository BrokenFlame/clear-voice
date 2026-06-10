import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { OAuthService } from 'angular-oauth2-oidc';

export interface ClearVoiceUser {
  sub: string;
  username: string;
  email?: string;
  fullName?: string;
  merchantId?: string;
  organisationName?: string;
  roles: string[];
  identityProvider: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private oauthService = inject(OAuthService);
  private router = inject(Router);

  private _user = signal<ClearVoiceUser | null>(null);

  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user());
  readonly isMerchant = computed(() =>
    this._user()?.roles.includes('merchant_employee') ?? false
  );
  readonly isFinanceStaff = computed(() =>
    this._user()?.roles.includes('finance_staff') ?? false
  );

  async initialize(): Promise<void> {
    this.oauthService.setupAutomaticSilentRefresh();

    try {
      await this.oauthService.tryLoginCodeFlow();
      if (this.oauthService.hasValidAccessToken()) {
        await this.loadUserProfile();
      }
    } catch (e) {
      console.error('[AuthService] Login flow error:', e);
    }
  }

  login(): void {
    this.oauthService.initCodeFlow();
  }

  async logout(): Promise<void> {
    this._user.set(null);
    this.oauthService.revokeTokenAndLogout();
  }

  getAccessToken(): string {
    return this.oauthService.getAccessToken();
  }

  private async loadUserProfile(): Promise<void> {
    try {
      const claims = this.oauthService.getIdentityClaims() as Record<string, unknown>;
      if (!claims) return;

      // realm_access.roles is added by the oidc-realm-role-mapper to the ID token.
      // As a defensive fallback, also check the access token — Keycloak always
      // includes realm_access in the access token regardless of client scope config.
      const idRealmAccess = claims['realm_access'] as { roles?: string[] } | undefined;
      const atRealmAccess = idRealmAccess
        ? undefined
        : (this.decodeAccessTokenPayload()?.['realm_access'] as { roles?: string[] } | undefined);
      const realmAccess = idRealmAccess ?? atRealmAccess;
      const roles = realmAccess?.roles ?? [];

      // Detect IdP: azure-federated users won't have a merchant_id
      const identityProvider = claims['identity_provider'] as string
        ?? (roles.includes('finance_staff') ? 'azure' : 'keycloak');

      this._user.set({
        sub: claims['sub'] as string,
        username: (claims['preferred_username'] as string) ?? '',
        email: claims['email'] as string | undefined,
        fullName: claims['name'] as string | undefined,
        merchantId: claims['merchant_id'] as string | undefined,
        organisationName: claims['organisation_name'] as string | undefined,
        roles,
        identityProvider,
      });
    } catch (e) {
      console.error('[AuthService] Failed to load user profile:', e);
    }
  }

  /** Decodes the JWT payload of the current access token without verifying the signature. */
  private decodeAccessTokenPayload(): Record<string, unknown> | null {
    try {
      const token = this.oauthService.getAccessToken();
      if (!token) return null;
      const payloadB64 = token.split('.')[1];
      if (!payloadB64) return null;
      // Convert base64url → base64 and restore padding (RFC 4648 §5)
      const base64 = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
      return JSON.parse(atob(padded)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
