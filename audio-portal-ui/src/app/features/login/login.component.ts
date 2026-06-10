import { Component, OnInit, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'cv-login',
  standalone: true,
  imports: [],
  template: `
    <div class="login-wrap">
      <header class="login-header">
        <div class="logo">
          <div class="logo__mark" aria-hidden="true">♪</div>
          <div>
            <div class="logo__text">ClearVoice</div>
            <div class="logo__tag">Finance compliance portal</div>
          </div>
        </div>
        <span class="secure-label">Secured · TLS 1.3</span>
      </header>

      <main class="login-body">
        <div class="login-card">
          <p class="eyebrow">Welcome back</p>
          <h1 class="title">Sign in to <em>ClearVoice</em></h1>
          <p class="subtitle">Upload and manage compliance call recordings for your finance agreements.</p>

          <p class="section-label">Finance company staff</p>
          <button class="btn-primary" (click)="login()">
            <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
              <path fill="#f35325" d="M1 1h10v10H1z"/>
              <path fill="#81bc06" d="M12 1h10v10H12z"/>
              <path fill="#05a6f0" d="M1 12h10v10H1z"/>
              <path fill="#ffba08" d="M12 12h10v10H12z"/>
            </svg>
            Continue with Azure AD
          </button>

          <div class="divider"><span></span><em>or</em><span></span></div>

          <p class="section-label">Merchant users</p>
          <button class="btn-secondary" (click)="login()">
            <span class="inline-icon" aria-hidden="true">🔒</span>
            Sign in with merchant credentials
          </button>

          <div class="notice">
            <span class="inline-icon" aria-hidden="true">🛡</span>
            This portal is for authorised users only. All access is logged and audited.
            Unauthorised access is prohibited.
          </div>
        </div>
      </main>

      <footer class="login-footer">
        <span>© 2025 ClearVoice Finance Portal</span>
        <span>v1.0.0 · Keycloak OIDC</span>
      </footer>
    </div>
  `,
  styles: [`
    .login-wrap {
      font-family: 'DM Sans', sans-serif;
      background: #0c1628;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .login-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 40px;
      border-bottom: 0.5px solid rgba(255,255,255,0.08);
    }
    .logo { display: flex; align-items: center; gap: 10px; }
    .logo__mark {
      width: 32px; height: 32px;
      background: #2563a8; border-radius: 6px;
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 18px; line-height: 1;
    }
    .logo__text { font-family: 'DM Serif Display', serif; font-size: 17px; color: #e8edf5; }
    .logo__tag  { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.3); }
    .secure-label { font-size: 12px; color: rgba(255,255,255,0.25); }

    .login-body {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
    }
    .login-card {
      background: #131f35;
      border: 0.5px solid rgba(255,255,255,0.10);
      border-radius: 16px;
      padding: 40px;
      width: 100%;
      max-width: 420px;
    }

    .eyebrow {
      font-size: 11px; letter-spacing: 0.10em; text-transform: uppercase;
      color: rgba(255,255,255,0.40); margin: 0 0 10px;
    }
    .title {
      font-family: 'DM Serif Display', serif;
      font-size: 26px; color: #e8edf5; font-weight: 400;
      line-height: 1.2; margin: 0 0 6px;
      em { color: #5b9cf6; font-style: italic; }
    }
    .subtitle {
      font-size: 13px; color: rgba(255,255,255,0.45);
      line-height: 1.6; margin: 0 0 24px;
    }
    .section-label {
      font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
      color: rgba(255,255,255,0.30); margin: 0 0 8px;
    }

    .btn-primary {
      width: 100%; padding: 12px 20px;
      background: #2563a8; border: none; border-radius: 8px;
      color: #fff; font-family: 'DM Sans', sans-serif;
      font-size: 14px; font-weight: 500; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      transition: background 0.15s;
      &:hover { background: #1d4f8a; }
    }
    .btn-secondary {
      width: 100%; padding: 11px 20px; margin-top: 10px;
      background: transparent;
      border: 0.5px solid rgba(255,255,255,0.18); border-radius: 8px;
      color: rgba(255,255,255,0.70); font-family: 'DM Sans', sans-serif;
      font-size: 14px; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 8px;
      transition: all 0.15s;
      &:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.30); }
    }

    .inline-icon {
      font-size: 14px;
      line-height: 1;
      display: inline-block;
    }

    .divider {
      display: flex; align-items: center; gap: 12px; margin: 20px 0 16px;
      span { flex: 1; height: 0.5px; background: rgba(255,255,255,0.10); display: block; }
      em { font-style: normal; font-size: 11px; color: rgba(255,255,255,0.30); letter-spacing: 0.05em; }
    }

    .notice {
      margin-top: 24px; padding: 12px 14px;
      background: rgba(255,255,255,0.04);
      border: 0.5px solid rgba(255,255,255,0.08); border-radius: 8px;
      font-size: 12px; color: rgba(255,255,255,0.35); line-height: 1.6;
    }

    .login-footer {
      padding: 16px 40px;
      border-top: 0.5px solid rgba(255,255,255,0.06);
      display: flex; justify-content: space-between;
      font-size: 11px; color: rgba(255,255,255,0.20);
    }
  `],
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
    await this.auth.ensureUserLoaded();
    const user = this.auth.user();
    const keycloakMerchantFallback =
      this.auth.isLoggedIn()
      && user?.identityProvider === 'keycloak'
      && !this.auth.isFinanceStaff();

    if (this.auth.isMerchant() || keycloakMerchantFallback) {
      await this.router.navigate(['/merchant/files']);
    } else if (this.auth.isFinanceStaff()) {
      await this.router.navigate(['/finance/files']);
    }
  }

  login(): void {
    this.auth.login();
  }
}
