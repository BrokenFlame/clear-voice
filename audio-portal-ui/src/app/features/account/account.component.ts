import { Component, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'cv-account',
  standalone: true,
  imports: [MatIconModule, MatButtonModule],
  template: `
    <h1 class="cv-page-title">My details</h1>
    <p class="cv-page-sub">Your account information and current session</p>

    @if (user(); as u) {
      <!-- Profile card -->
      <div class="cv-card" style="padding:24px;max-width:540px;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;padding-bottom:20px;border-bottom:0.5px solid #f0f2f5;">
          <div style="width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:500;flex-shrink:0;"
            [style.background]="isMerchant() ? '#eef3fb' : '#faeeda'"
            [style.color]="isMerchant() ? '#2563a8' : '#854f0b'">
            {{ initials() }}
          </div>
          <div>
            <div style="font-size:17px;font-weight:500;color:#1a2740;margin-bottom:3px;">{{ u.fullName ?? u.username }}</div>
            <div style="font-size:13px;color:#6b7a90;">{{ u.email }}</div>
            <span class="cv-badge" style="margin-top:6px;"
              [class]="isMerchant() ? 'cv-badge--merchant' : 'cv-badge--finance'">
              <mat-icon style="font-size:12px;">{{ isMerchant() ? 'store' : 'account_balance' }}</mat-icon>
              {{ isMerchant() ? 'Merchant user' : 'Finance staff' }}
            </span>
          </div>
        </div>

        <table style="width:100%;">
          <tr class="detail-row">
            <td class="detail-label"><mat-icon>badge</mat-icon> Username</td>
            <td class="detail-value">{{ u.username }}</td>
          </tr>
          @if (u.merchantId) {
            <tr class="detail-row">
              <td class="detail-label"><mat-icon>store</mat-icon> Merchant ID</td>
              <td class="detail-value">
                <span class="cv-merchant-tag" style="font-size:13px;">{{ u.merchantId }}</span>
              </td>
            </tr>
          }
          @if (u.organisationName) {
            <tr class="detail-row">
              <td class="detail-label"><mat-icon>business</mat-icon> Organisation</td>
              <td class="detail-value">{{ u.organisationName }}</td>
            </tr>
          }
          <tr class="detail-row">
            <td class="detail-label"><mat-icon>verified_user</mat-icon> Role</td>
            <td class="detail-value">{{ u.roles.join(', ') }}</td>
          </tr>
          <tr class="detail-row">
            <td class="detail-label"><mat-icon>key</mat-icon> Identity provider</td>
            <td class="detail-value">
              <span style="display:inline-flex;align-items:center;gap:5px;background:#f4f5f7;border-radius:4px;padding:3px 9px;font-size:11px;color:#4a5568;">
                <mat-icon style="font-size:13px;">lock</mat-icon>
                {{ u.identityProvider }}
              </span>
            </td>
          </tr>
        </table>
      </div>

      <!-- Sign out -->
      <div style="max-width:540px;">
        <button mat-stroked-button color="warn" (click)="logout()" style="font-size:13px;">
          <mat-icon>logout</mat-icon>
          Sign out of ClearVoice
        </button>
      </div>
    }
  `,
  styles: [`
    .detail-row td { padding: 8px 0; border-bottom: 0.5px solid #f0f2f5; vertical-align: middle; }
    .detail-row:last-child td { border-bottom: none; }
    .detail-label {
      font-size: 12px; color: #9aa3b0; width: 160px;
      display: flex; align-items: center; gap: 6px;
      mat-icon { font-size: 14px; width: 14px; height: 14px; }
    }
    .detail-value { font-size: 13px; color: #1a2740; }
  `],
})
export class AccountComponent {
  private auth = inject(AuthService);

  user = this.auth.user;
  isMerchant = this.auth.isMerchant;
  isFinanceStaff = this.auth.isFinanceStaff;

  initials(): string {
    const u = this.user();
    if (!u) return '?';
    const name = u.fullName ?? u.username ?? '';
    return name.split(/[\s._-]/).map(p => p[0]).join('').toUpperCase().slice(0, 2);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }
}
