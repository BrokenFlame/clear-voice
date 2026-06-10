import {
  ApplicationConfig,
  APP_INITIALIZER,
  provideZoneChangeDetection,
  inject,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideOAuthClient, OAuthService } from 'angular-oauth2-oidc';

import { routes } from './app.routes';
import { authConfig } from './core/auth/auth.config';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/auth/auth.service';

function initializeAuth(oauthService: OAuthService, authService: AuthService) {
  return async () => {
    oauthService.configure(authConfig);

    // Do not block app bootstrap if OIDC discovery is briefly unavailable.
    // This keeps the home page rendering and lets users retry auth once Keycloak recovers.
    try {
      await oauthService.loadDiscoveryDocument();
    } catch (error) {
      console.error('[AuthInit] Discovery document load failed; continuing app bootstrap.', error);
      return;
    }

    await authService.initialize();
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideAnimationsAsync(),
    provideOAuthClient(),
    {
      provide: APP_INITIALIZER,
      useFactory: () => {
        const oauthService = inject(OAuthService);
        const authService = inject(AuthService);
        return initializeAuth(oauthService, authService);
      },
      multi: true,
    },
  ],
};
