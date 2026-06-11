import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { runtimeConfig } from '../config/runtime-config';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  // Only attach token to API calls — never to third-party requests
  if (!req.url.startsWith(runtimeConfig.apiBaseUrl)) {
    return next(req);
  }

  const token = auth.getAccessToken();
  if (!token) return next(req);

  const authReq = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });

  return next(authReq);
};
