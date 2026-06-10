import { Routes } from '@angular/router';
import { authGuard, merchantGuard, financeGuard } from './core/guards/auth.guard';
import { AuthCallbackComponent } from './core/auth/auth-callback.component';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/login/login.component').then(m => m.LoginComponent) },
  { path: 'auth/callback', component: AuthCallbackComponent },

  {
    path: 'merchant',
    canActivate: [authGuard, merchantGuard],
    loadComponent: () => import('./shared/components/merchant-shell.component').then(m => m.MerchantShellComponent),
    children: [
      { path: 'files', loadComponent: () => import('./features/merchant/files/merchant-files.component').then(m => m.MerchantFilesComponent) },
      { path: 'upload', loadComponent: () => import('./features/merchant/upload/merchant-upload.component').then(m => m.MerchantUploadComponent) },
      { path: 'account', loadComponent: () => import('./features/account/account.component').then(m => m.AccountComponent) },
      { path: '', redirectTo: 'files', pathMatch: 'full' },
    ],
  },

  {
    path: 'finance',
    canActivate: [authGuard, financeGuard],
    loadComponent: () => import('./shared/components/finance-shell.component').then(m => m.FinanceShellComponent),
    children: [
      { path: 'files', loadComponent: () => import('./features/finance/files/finance-files.component').then(m => m.FinanceFilesComponent) },
      { path: 'audit', loadComponent: () => import('./features/finance/audit/finance-audit.component').then(m => m.FinanceAuditComponent) },
      { path: 'account', loadComponent: () => import('./features/account/account.component').then(m => m.AccountComponent) },
      { path: '', redirectTo: 'files', pathMatch: 'full' },
    ],
  },

  { path: '**', redirectTo: '' },
];
