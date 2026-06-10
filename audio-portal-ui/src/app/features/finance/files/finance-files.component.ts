import { Component, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService, AudioFileResponse, PagedResponse } from '../../../core/services/api.service';

@Component({
  selector: 'cv-finance-files',
  standalone: true,
  imports: [DatePipe, FormsModule, MatIconModule, MatButtonModule, MatDialogModule, MatSnackBarModule],
  template: `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <h1 class="cv-page-title" style="margin-bottom:0;">All recordings</h1>
      <span class="cv-badge cv-badge--finance">
        <mat-icon style="font-size:13px;">account_balance</mat-icon>
        Finance staff
      </span>
    </div>

    <!-- Toolbar -->
    <div class="cv-table-toolbar" style="background:#fff;border:0.5px solid #e2e5ea;border-radius:10px 10px 0 0;margin-bottom:0;">
      <div class="cv-search" style="flex:2;">
        <mat-icon>search</mat-icon>
        <input placeholder="Search file names…" [(ngModel)]="searchTerm" (input)="load()" aria-label="Search">
      </div>
      <select style="background:#fff;border:0.5px solid #e2e5ea;border-radius:7px;padding:7px 10px;font-family:'DM Sans',sans-serif;font-size:13px;color:#1a2740;cursor:pointer;outline:none;"
        [(ngModel)]="filterMerchant" (change)="load()" aria-label="Filter by merchant">
        <option value="">All merchants</option>
        @for (m of merchantIds(); track m) {
          <option [value]="m">{{ m }}</option>
        }
      </select>
      <select style="background:#fff;border:0.5px solid #e2e5ea;border-radius:7px;padding:7px 10px;font-family:'DM Sans',sans-serif;font-size:13px;color:#1a2740;cursor:pointer;outline:none;"
        [(ngModel)]="sortBy" (change)="load()" aria-label="Sort by">
        <option value="uploadedAt_desc">Newest first</option>
        <option value="uploadedAt_asc">Oldest first</option>
        <option value="originalFilename_asc">Name A–Z</option>
        <option value="sizeBytes_desc">Size ↓</option>
      </select>
    </div>

    <div class="cv-card" style="border-radius:0 0 10px 10px;border-top:none;">
      @if (loading()) {
        <div style="padding:32px;text-align:center;color:#9aa3b0;font-size:13px;">Loading…</div>
      } @else {
        <table class="cv-table">
          <thead>
            <tr>
              <th>File name</th>
              <th>Merchant</th>
              <th>Uploaded</th>
              <th>Uploaded by</th>
              <th>Size</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (f of files(); track f.id) {
              <tr>
                <td style="max-width:220px;">
                  <span style="display:flex;align-items:center;gap:6px;overflow:hidden;">
                    <mat-icon style="font-size:15px;color:#5b9cf6;flex-shrink:0;">audio_file</mat-icon>
                    <span style="font-weight:500;color:#1a2740;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ f.originalFilename }}</span>
                  </span>
                </td>
                <td><span class="cv-merchant-tag">{{ f.merchantId }}</span></td>
                <td style="font-size:12px;white-space:nowrap;">{{ f.uploadedAt | date:'dd MMM yy, HH:mm' }}</td>
                <td>
                  <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#4a5568;">
                    <span style="width:18px;height:18px;border-radius:50%;background:#b5d4f4;display:inline-flex;align-items:center;justify-content:center;font-size:8px;font-weight:500;color:#0c447c;flex-shrink:0;">
                      {{ initials(f.uploadedByUsername) }}
                    </span>
                    {{ f.uploadedByUsername }}
                  </span>
                </td>
                <td style="white-space:nowrap;">{{ formatBytes(f.sizeBytes) }}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:6px;">
                    <button style="background:none;border:0.5px solid #b5d4f4;border-radius:6px;padding:5px 8px;cursor:pointer;font-size:13px;color:#2563a8;display:flex;align-items:center;gap:4px;font-family:'DM Sans',sans-serif;"
                      [class.active-play]="playingId() === f.id"
                      (click)="togglePlay(f)">
                      <mat-icon style="font-size:14px;">{{ playingId() === f.id ? 'pause' : 'play_arrow' }}</mat-icon>
                    </button>
                    <button style="background:none;border:0.5px solid #f7c1c1;border-radius:6px;padding:5px 8px;cursor:pointer;font-size:13px;color:#e24b4a;display:flex;align-items:center;font-family:'DM Sans',sans-serif;"
                      (click)="confirmDelete(f)">
                      <mat-icon style="font-size:14px;">delete</mat-icon>
                    </button>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      }
    </div>

    <!-- Player bar -->
    @if (nowPlaying()) {
      <div class="cv-player-bar">
        <button style="background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.12);border-radius:6px;padding:6px 10px;cursor:pointer;color:rgba(255,255,255,0.7);display:flex;align-items:center;"
          (click)="stopPlay()" aria-label="Stop">
          <mat-icon>stop</mat-icon>
        </button>
        <div style="flex:1;min-width:0;">
          <div class="cv-player-bar__file">{{ nowPlaying()!.originalFilename }}</div>
          <div class="cv-player-bar__meta">{{ nowPlaying()!.merchantId }} · {{ nowPlaying()!.uploadedByUsername }} · {{ formatBytes(nowPlaying()!.sizeBytes) }}</div>
        </div>
        <audio #audioEl style="display:none;" controls></audio>
        <span class="cv-player-bar__time">{{ audioTime() }}</span>
      </div>
    }

    <!-- Delete confirmation overlay -->
    @if (deletingFile()) {
      <div style="position:fixed;inset:0;z-index:100;background:rgba(12,22,40,0.55);display:flex;align-items:center;justify-content:center;">
        <div style="background:#fff;border-radius:12px;padding:28px;width:340px;text-align:center;">
          <mat-icon style="font-size:32px;color:#e24b4a;width:32px;height:32px;margin-bottom:12px;">delete</mat-icon>
          <h3 style="font-size:16px;font-weight:500;color:#1a2740;margin:0 0 6px;">Delete recording?</h3>
          <p style="font-size:13px;color:#6b7a90;line-height:1.5;margin:0 0 22px;">
            This will permanently remove <strong>{{ deletingFile()!.originalFilename }}</strong>
            from merchant <strong>{{ deletingFile()!.merchantId }}</strong>. This cannot be undone.
          </p>
          <div style="display:flex;gap:10px;">
            <button style="flex:1;padding:9px;background:#f4f5f7;border:none;border-radius:7px;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;"
              (click)="deletingFile.set(null)">Cancel</button>
            <button style="flex:1;padding:9px;background:#e24b4a;border:none;border-radius:7px;color:#fff;font-family:'DM Sans',sans-serif;font-size:13px;cursor:pointer;"
              (click)="doDelete()">Delete</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class FinanceFilesComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);

  paged = signal<PagedResponse<AudioFileResponse> | null>(null);
  loading = signal(true);
  searchTerm = '';
  filterMerchant = '';
  sortBy = 'uploadedAt_desc';
  playingId = signal<string | null>(null);
  nowPlaying = signal<AudioFileResponse | null>(null);
  audioTime = signal('—');
  deletingFile = signal<AudioFileResponse | null>(null);

  files() { return this.paged()?.items ?? []; }
  merchantIds() { return [...new Set(this.files().map(f => f.merchantId))].sort(); }

  async ngOnInit(): Promise<void> { await this.load(); }

  load(): void {
    this.loading.set(true);
    const [sortField, sortDir] = this.sortBy.split('_');
    this.api.getAllFiles({
      merchantId: this.filterMerchant || undefined,
      sortBy: sortField as 'uploadedAt' | 'originalFilename' | 'sizeBytes',
      sortDesc: sortDir === 'desc',
      pageSize: 100,
    }).subscribe({
      next: p => { this.paged.set(p); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  togglePlay(f: AudioFileResponse): void {
    if (this.playingId() === f.id) {
      this.stopPlay();
    } else {
      this.playingId.set(f.id);
      this.nowPlaying.set(f);
      // Fetch a pre-signed URL then set audio src
      this.api.getPlaybackUrl(f.id).subscribe(r => {
        const audio = new Audio(r.url);
        audio.play();
        audio.ontimeupdate = () => {
          this.audioTime.set(this.fmtTime(audio.currentTime) + ' / ' + this.fmtTime(audio.duration));
        };
        audio.onended = () => this.stopPlay();
      });
    }
  }

  stopPlay(): void {
    this.playingId.set(null);
    this.nowPlaying.set(null);
    this.audioTime.set('—');
  }

  confirmDelete(f: AudioFileResponse): void { this.deletingFile.set(f); }

  doDelete(): void {
    const f = this.deletingFile();
    if (!f) return;
    this.api.deleteFile(f.id).subscribe({
      next: () => {
        this.deletingFile.set(null);
        this.snack.open(`${f.originalFilename} deleted`, 'Dismiss', { duration: 3000 });
        this.load();
      },
      error: () => this.snack.open('Delete failed', 'Dismiss', { duration: 3000 }),
    });
  }

  initials(name: string): string {
    return name.split(/[\s._-]/).map(p => p[0]).join('').toUpperCase().slice(0, 2);
  }

  formatBytes(b: number): string {
    if (b < 1_048_576) return `${(b / 1_024).toFixed(1)} KB`;
    return `${(b / 1_048_576).toFixed(1)} MB`;
  }

  private fmtTime(s: number): string {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }
}
