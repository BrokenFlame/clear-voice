import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'cv-merchant-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatSnackBarModule],
  template: `
    <div class="cv-app" (click.capture)="guardInteraction($event)">
      <nav class="cv-topbar">
        <div class="cv-logo">
          <div class="cv-logo__mark"><mat-icon>music_note</mat-icon></div>
          <span class="cv-logo__text">ClearVoice</span>
        </div>
        <div class="cv-topbar-right">
          <a routerLink="/merchant/account" class="cv-user-pill">
            <div class="cv-avatar">{{ initials() }}</div>
            <span>{{ user()?.username }}</span>
            <mat-icon style="font-size:13px;color:rgba(255,255,255,0.4)">expand_more</mat-icon>
          </a>
          <button class="cv-signout-btn" (click)="logout()">
            <mat-icon>logout</mat-icon> Sign out
          </button>
        </div>
      </nav>

      <div class="cv-layout">
        <aside class="cv-sidebar">
          <p class="cv-nav-section">Merchant</p>
          <a routerLink="/merchant/files" routerLinkActive="active" class="cv-nav-item">
            <mat-icon>folder</mat-icon> My files
          </a>
          <a routerLink="/merchant/upload" routerLinkActive="active" class="cv-nav-item">
            <mat-icon>upload</mat-icon> Upload
          </a>
          <p class="cv-nav-section">Account</p>
          <a routerLink="/merchant/account" routerLinkActive="active" class="cv-nav-item">
            <mat-icon>account_circle</mat-icon> My details
          </a>
        </aside>
        <main class="cv-main">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
})
export class MerchantShellComponent {
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  user = this.auth.user;

  initials(): string {
    const u = this.user();
    if (!u) return '?';
    const name = u.fullName ?? u.username ?? '';
    return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  }

  async logout(): Promise<void> {
    await this.auth.logout();
  }

  guardInteraction(event: Event): void {
    if (this.auth.hasActiveSession()) return;

    event.preventDefault();
    event.stopPropagation();
    this.snack.dismiss();
    void this.auth.redirectToLoginWithPrompt();
  }
}
