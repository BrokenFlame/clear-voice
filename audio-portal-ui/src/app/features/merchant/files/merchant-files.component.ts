import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';
import { ApiService, AudioFileResponse, PagedResponse } from '../../../core/services/api.service';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'cv-merchant-files',
  standalone: true,
  imports: [DatePipe, FormsModule, MatIconModule, MatButtonModule, RouterLink],
  template: `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;">
      <div>
        <h1 class="cv-page-title">My files</h1>
        <p class="cv-page-sub">All recordings uploaded for your merchant account</p>
      </div>
      <span class="cv-badge cv-badge--merchant">
        <mat-icon style="font-size:13px">store</mat-icon>
        {{ user()?.merchantId }}
      </span>
    </div>

    <div class="cv-stats-grid">
      <div class="cv-stat-card">
        <div class="cv-stat-card__label">Total uploads</div>
        <div class="cv-stat-card__value">{{ paged()?.totalCount ?? '–' }}</div>
      </div>
      <div class="cv-stat-card">
        <div class="cv-stat-card__label">Total size</div>
        <div class="cv-stat-card__value">{{ totalSize() }}</div>
      </div>
      <div class="cv-stat-card">
        <div class="cv-stat-card__label">This month</div>
        <div class="cv-stat-card__value">{{ thisMonth() }}</div>
      </div>
    </div>

    <div class="cv-card">
      <div class="cv-table-toolbar">
        <div class="cv-search">
          <mat-icon>search</mat-icon>
          <input placeholder="Search file names…" [(ngModel)]="searchTerm" (input)="onSearch()" aria-label="Search files">
        </div>
        <a routerLink="/merchant/upload" mat-stroked-button style="font-size:13px;">
          <mat-icon>upload</mat-icon> Upload
        </a>
      </div>

      @if (loading()) {
        <div style="padding:32px;text-align:center;color:#9aa3b0;font-size:13px;">Loading…</div>
      } @else if (files().length === 0) {
        <div style="padding:40px;text-align:center;color:#9aa3b0;font-size:13px;">
          No files uploaded yet.
          <a routerLink="/merchant/upload" style="color:#2563a8;margin-left:4px;">Upload the first one →</a>
        </div>
      } @else {
        <table class="cv-table">
          <thead>
            <tr>
              <th>File name</th>
              <th>Uploaded</th>
              <th>Uploaded by</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            @for (f of files(); track f.id) {
              <tr>
                <td>
                  <span style="display:flex;align-items:center;gap:6px;">
                    <mat-icon style="font-size:15px;color:#5b9cf6">audio_file</mat-icon>
                    <span style="font-weight:500;color:#1a2740;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px;">{{ f.originalFilename }}</span>
                  </span>
                </td>
                <td style="font-size:12px;white-space:nowrap;">{{ f.uploadedAt | date:'dd MMM yyyy, HH:mm' }}</td>
                <td>
                  <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#4a5568;">
                    <span style="width:18px;height:18px;border-radius:50%;background:#b5d4f4;display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:500;color:#0c447c;">
                      {{ initials(f.uploadedByUsername) }}
                    </span>
                    {{ f.uploadedByUsername }}
                  </span>
                </td>
                <td style="white-space:nowrap;">{{ formatBytes(f.sizeBytes) }}</td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>
  `,
})
export class MerchantFilesComponent implements OnInit {
  private api = inject(ApiService);
  private auth = inject(AuthService);

  user = this.auth.user;
  paged = signal<PagedResponse<AudioFileResponse> | null>(null);
  loading = signal(true);
  searchTerm = '';

  files() { return this.paged()?.items ?? []; }

  totalSize(): string {
    const bytes = this.files().reduce((s, f) => s + f.sizeBytes, 0);
    return this.formatBytes(bytes);
  }

  thisMonth(): number {
    const now = new Date();
    return this.files().filter(f => {
      const d = new Date(f.uploadedAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(search?: string): Promise<void> {
    this.loading.set(true);
    this.api.getMerchantFiles({ pageSize: 50 }).subscribe({
      next: p => { this.paged.set(p); this.loading.set(false); },
      error: () => { this.loading.set(false); },
    });
  }

  onSearch(): void { this.load(this.searchTerm); }

  initials(name: string): string {
    return name.split(/[\s._-]/).map(p => p[0]).join('').toUpperCase().slice(0, 2);
  }

  formatBytes(b: number): string {
    if (b < 1_024) return `${b} B`;
    if (b < 1_048_576) return `${(b / 1_024).toFixed(1)} KB`;
    return `${(b / 1_048_576).toFixed(1)} MB`;
  }
}
