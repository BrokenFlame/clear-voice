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
    await oauthService.loadDiscoveryDocument();
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
