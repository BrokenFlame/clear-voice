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
  private static readonly loginPromptStorageKey = 'clearvoice.loginPrompt';

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
      if (this.hasValidAccessToken()) {
        await this.loadUserProfile();
      }
    } catch (e) {
      console.error('[AuthService] Login flow error:', e);
    }
  }

  async ensureUserLoaded(): Promise<void> {
    if (this._user()) return;
    await this.oauthService.tryLoginCodeFlow();
    if (!this.hasValidAccessToken()) return;
    await this.loadUserProfile();
    if (this._user()) return;

    const claims = this.getMergedClaims();
    if (Object.keys(claims).length > 0) {
      this.setUserFromClaims(claims);
    }
  }

  login(): void {
    this.oauthService.initCodeFlow();
  }

  async logout(): Promise<void> {
    this._user.set(null);

    // Best effort: call the provider logout endpoint when available.
    // If this fails (common in local dev due to provider/CORS quirks),
    // still clear local auth state and route user to the home page.
    try {
      await this.oauthService.revokeTokenAndLogout();
      return;
    } catch (e) {
      console.warn('[AuthService] Provider logout failed, falling back to local logout.', e);
    }

    this.oauthService.logOut();
    await this.router.navigateByUrl('/');
  }

  getAccessToken(): string {
    return this.oauthService.getAccessToken();
  }

  hasActiveSession(): boolean {
    const isActive = this.oauthService.hasValidAccessToken();
    if (!isActive) {
      this._user.set(null);
    }
    return isActive;
  }

  async redirectToLoginWithPrompt(message = 'You need to log in to continue.'): Promise<void> {
    sessionStorage.setItem(AuthService.loginPromptStorageKey, message);
    await this.router.navigateByUrl('/');
  }

  consumeLoginPrompt(): string | null {
    const message = sessionStorage.getItem(AuthService.loginPromptStorageKey);
    if (message) {
      sessionStorage.removeItem(AuthService.loginPromptStorageKey);
    }
    return message;
  }

  private hasValidAccessToken(): boolean {
    return this.oauthService.hasValidAccessToken();
  }

  private getMergedClaims(): Record<string, unknown> {
    const idClaims = this.oauthService.getIdentityClaims() as Record<string, unknown> | null;
    const idTokenClaims = this.decodeJwtPayload(this.oauthService.getIdToken());
    const accessClaims = this.decodeJwtPayload(this.oauthService.getAccessToken());

    return ({ ...(accessClaims ?? {}), ...(idTokenClaims ?? {}), ...(idClaims ?? {}) }) as Record<string, unknown>;
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

  private asStringClaim(value: unknown): string | undefined {
    if (typeof value === 'string' && value.trim().length > 0) return value;
    if (Array.isArray(value)) {
      const first = value.find((v) => typeof v === 'string' && v.trim().length > 0);
      if (typeof first === 'string') return first;
    }
    return undefined;
  }

  private setUserFromClaims(claims: Record<string, unknown>): void {
    const roles = this.extractRoles(claims);
    const identityProvider = this.asStringClaim(claims['identity_provider'])
      ?? (roles.includes('finance_staff') ? 'azure' : 'keycloak');

    this._user.set({
      sub: this.asStringClaim(claims['sub']) ?? 'unknown',
      username: this.asStringClaim(claims['preferred_username']) ?? this.asStringClaim(claims['email']) ?? 'unknown',
      email: this.asStringClaim(claims['email']),
      fullName: this.asStringClaim(claims['name']),
      merchantId: this.asStringClaim(claims['merchant_id'] ?? claims['merchantId']),
      organisationName: this.asStringClaim(claims['organisation_name']),
      roles,
      identityProvider,
    });
  }

  private async loadUserProfile(): Promise<void> {
    try {
      const claims = this.getMergedClaims();
      if (Object.keys(claims).length === 0) return;

      this.setUserFromClaims(claims);
    } catch (e) {
      console.error('[AuthService] Failed to load user profile:', e);
    }
  }
}
