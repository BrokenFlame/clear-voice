import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'cv-auth-callback',
  standalone: true,
  imports: [MatProgressSpinnerModule],
  template: `
    <div style="display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;">
      <mat-spinner diameter="36"></mat-spinner>
      <p style="color:#6b7a90;font-size:14px;">Completing sign in…</p>
    </div>
  `,
})
export class AuthCallbackComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
    // OAuthService has already consumed the code from the URL in app initializer.
    // We just need to route based on the resolved role.
    if (this.auth.isMerchant()) {
      await this.router.navigate(['/merchant/files']);
    } else if (this.auth.isFinanceStaff()) {
      await this.router.navigate(['/finance/files']);
    } else {
      // Authenticated but no recognised role — return to login
      await this.router.navigate(['/']);
    }
  }
}
