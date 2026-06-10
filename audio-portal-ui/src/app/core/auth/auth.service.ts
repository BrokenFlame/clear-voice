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
    (this._user()?.roles.includes('merchant_employee') ?? false)
    || !!this._user()?.merchantId
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

  async ensureUserLoaded(): Promise<void> {
    if (this._user()) return;
    if (!this.oauthService.hasValidAccessToken()) return;
    await this.loadUserProfile();
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

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='));
      return JSON.parse(json) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private extractRoles(claims: Record<string, unknown>): string[] {
    const roles = new Set<string>();

    const realmAccess = claims['realm_access'] as { roles?: unknown } | undefined;
    if (realmAccess?.roles && Array.isArray(realmAccess.roles)) {
      for (const role of realmAccess.roles) {
        if (typeof role === 'string' && role) roles.add(role);
      }
    }

    const flatRealmRoles = claims['realm_access.roles'];
    if (Array.isArray(flatRealmRoles)) {
      for (const role of flatRealmRoles) {
        if (typeof role === 'string' && role) roles.add(role);
      }
    } else if (typeof flatRealmRoles === 'string' && flatRealmRoles) {
      roles.add(flatRealmRoles);
    }

    const resourceAccess = claims['resource_access'] as Record<string, unknown> | undefined;
    if (resourceAccess && typeof resourceAccess === 'object') {
      for (const clientClaims of Object.values(resourceAccess)) {
        const clientRoles = (clientClaims as { roles?: unknown })?.roles;
        if (Array.isArray(clientRoles)) {
          for (const role of clientRoles) {
            if (typeof role === 'string' && role) roles.add(role);
          }
        }
      }
    }

    return Array.from(roles);
  }

  private async loadUserProfile(): Promise<void> {
    try {
      const idClaims = this.oauthService.getIdentityClaims() as Record<string, unknown> | null;
      const accessClaims = this.decodeJwtPayload(this.oauthService.getAccessToken());
      const claims = ({ ...(accessClaims ?? {}), ...(idClaims ?? {}) }) as Record<string, unknown>;
      if (Object.keys(claims).length === 0) return;

      const roles = this.extractRoles(claims);

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
}
