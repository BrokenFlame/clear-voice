import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return (async () => {
    await auth.ensureUserLoaded();

    if (auth.isLoggedIn()) return true;
    return router.createUrlTree(['/']);
  })();
};

export const merchantGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return (async () => {
    await auth.ensureUserLoaded();
    const user = auth.user();
    const keycloakMerchantFallback =
      auth.isLoggedIn()
      && user?.identityProvider === 'keycloak'
      && !auth.isFinanceStaff();

    if (auth.isMerchant() || keycloakMerchantFallback) return true;
    if (auth.isFinanceStaff()) return router.createUrlTree(['/finance/files']);
    return router.createUrlTree(['/']);
  })();
};

export const financeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return (async () => {
    await auth.ensureUserLoaded();

    if (auth.isFinanceStaff()) return true;
    if (auth.isMerchant()) return router.createUrlTree(['/merchant/files']);
    return router.createUrlTree(['/']);
  })();
};
