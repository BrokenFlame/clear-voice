import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { ApiService, AuditEventResponse, PagedResponse } from '../../../core/services/api.service';

const EVENT_META: Record<string, { label: string; cls: string; icon: string }> = {
  file_upload:         { label: 'Upload',    cls: 'cv-badge--upload',  icon: 'upload' },
  login:               { label: 'Login',     cls: 'cv-badge--login',   icon: 'login' },
  logout:              { label: 'Logout',    cls: 'cv-badge--logout',  icon: 'logout' },
  file_delete:         { label: 'Delete',    cls: 'cv-badge--delete',  icon: 'delete' },
  file_playback_start: { label: 'Playback',  cls: 'cv-badge--play',    icon: 'play_arrow' },
  file_list:           { label: 'Viewed',    cls: 'cv-badge--login',   icon: 'list' },
  audit_view:          { label: 'Audit',     cls: 'cv-badge--logout',  icon: 'assignment' },
};

@Component({
  selector: 'cv-finance-audit',
  standalone: true,
  imports: [DatePipe, FormsModule, MatIconModule],
  template: `
    <h1 class="cv-page-title">Audit log</h1>
    <p class="cv-page-sub">All user actions recorded in the portal</p>

    <div class="cv-table-toolbar" style="background:#fff;border:0.5px solid #e2e5ea;border-radius:10px 10px 0 0;">
      <div class="cv-search" style="flex:2;">
        <mat-icon>search</mat-icon>
        <input placeholder="Search events, users, files…" [(ngModel)]="search" (input)="load()" aria-label="Search audit log">
      </div>
      <select style="background:#fff;border:0.5px solid #e2e5ea;border-radius:7px;padding:7px 10px;font-family:'DM Sans',sans-serif;font-size:13px;color:#1a2740;cursor:pointer;outline:none;"
        [(ngModel)]="filterEvent" (change)="load()" aria-label="Filter by event">
        <option value="">All events</option>
        <option value="file_upload">Upload</option>
        <option value="file_delete">Delete</option>
        <option value="file_playback_start">Playback</option>
        <option value="login">Login</option>
        <option value="logout">Logout</option>
      </select>
      <select style="background:#fff;border:0.5px solid #e2e5ea;border-radius:7px;padding:7px 10px;font-family:'DM Sans',sans-serif;font-size:13px;color:#1a2740;cursor:pointer;outline:none;"
        [(ngModel)]="filterMerchant" (change)="load()" aria-label="Filter by merchant">
        <option value="">All merchants</option>
        @for (m of merchantIds(); track m) {
          <option [value]="m">{{ m }}</option>
        }
      </select>
    </div>

    <div class="cv-card" style="border-radius:0 0 10px 10px;border-top:none;">
      @if (loading()) {
        <div style="padding:32px;text-align:center;color:#9aa3b0;font-size:13px;">Loading…</div>
      } @else if (events().length === 0) {
        <div style="padding:40px;text-align:center;color:#9aa3b0;font-size:13px;">No audit events found.</div>
      } @else {
        <table class="cv-table">
          <thead>
            <tr>
              <th style="width:170px;">Timestamp</th>
              <th style="width:110px;">Event</th>
              <th>User</th>
              <th style="width:110px;">Merchant</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            @for (e of events(); track e.id) {
              <tr>
                <td style="font-size:11px;font-family:monospace;color:#6b7a90;white-space:nowrap;">
                  {{ e.occurredAt | date:'yyyy-MM-dd HH:mm:ss' }}
                </td>
                <td>
                  <span class="cv-badge {{ meta(e.eventType).cls }}" style="font-size:10px;">
                    <mat-icon style="font-size:11px;">{{ meta(e.eventType).icon }}</mat-icon>
                    {{ meta(e.eventType).label }}
                  </span>
                </td>
                <td>
                  <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#4a5568;">
                    <span [class]="avatarClass(e)"
                      style="width:18px;height:18px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:500;flex-shrink:0;">
                      {{ initials(e.username) }}
                    </span>
                    {{ e.username }}
                  </span>
                </td>
                <td>
                  @if (e.merchantId) {
                    <span class="cv-merchant-tag">{{ e.merchantId }}</span>
                  }
                </td>
                <td style="font-size:12px;color:#6b7a90;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px;">
                  {{ e.detail ?? e.filename ?? '—' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
})
export class FinanceAuditComponent implements OnInit {
  private api = inject(ApiService);

  paged = signal<PagedResponse<AuditEventResponse> | null>(null);
  loading = signal(true);
  search = '';
  filterEvent = '';
  filterMerchant = '';

  events() { return this.paged()?.items ?? []; }
  merchantIds() { return [...new Set(this.events().map(e => e.merchantId).filter(Boolean))].sort() as string[]; }

  async ngOnInit(): Promise<void> { this.load(); }

  load(): void {
    this.loading.set(true);
    this.api.getAuditLog({
      eventType: this.filterEvent || undefined,
      merchantId: this.filterMerchant || undefined,
      pageSize: 200,
    }).subscribe({
      next: p => { this.paged.set(p); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  meta(type: string) { return EVENT_META[type] ?? { label: type, cls: 'cv-badge--logout', icon: 'info' }; }

  avatarClass(e: AuditEventResponse): string {
    return e.merchantId
      ? 'style="background:#b5d4f4;color:#0c447c;"'
      : 'style="background:#FAC775;color:#633806;"';
  }

  initials(name: string): string {
    return name.split(/[\s._-]/).map((p: string) => p[0]).join('').toUpperCase().slice(0, 2);
  }
}
