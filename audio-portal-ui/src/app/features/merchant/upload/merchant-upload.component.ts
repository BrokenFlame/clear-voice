import { Component, inject, signal, ElementRef, ViewChild } from '@angular/core';
import { HttpEventType } from '@angular/common/http';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../../core/services/api.service';

interface QueuedFile {
  file: File;
  progress: number;          // 0-100
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

const MAX_BYTES = 262_144_000; // 250 MB
const ALLOWED_TYPES = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/ogg', 'audio/x-m4a'];
const ALLOWED_EXT   = ['.mp3', '.wav', '.m4a', '.ogg'];

@Component({
  selector: 'cv-merchant-upload',
  standalone: true,
  imports: [MatIconModule, MatButtonModule, MatSnackBarModule],
  template: `
    <h1 class="cv-page-title">Upload recordings</h1>
    <p class="cv-page-sub">Select audio files from your device. Maximum file size 250 MB per file.</p>

    <!-- Drop zone -->
    <div
      class="cv-drop-zone"
      [class.drag-over]="isDragging()"
      (dragover)="onDragOver($event)"
      (dragleave)="onDragLeave()"
      (drop)="onDrop($event)"
      (click)="fileInput.click()"
      role="button"
      tabindex="0"
      aria-label="Drop audio files here or click to browse"
      (keydown.enter)="fileInput.click()">
      <div class="cv-drop-zone__icon">
        <mat-icon style="font-size:40px;width:40px;height:40px;">cloud_upload</mat-icon>
      </div>
      <p class="cv-drop-zone__title">Drag and drop audio files here</p>
      <p class="cv-drop-zone__sub">Supports {{ allowedLabel }}</p>
      <button mat-flat-button color="primary" style="margin-top:4px;" (click)="$event.stopPropagation(); fileInput.click()">
        Browse files
      </button>
      <p class="cv-drop-zone__limit">Max 250 MB per file</p>
    </div>

    <input #fileInput type="file" accept=".mp3,.wav,.m4a,.ogg" multiple hidden
      (change)="onFilesSelected($event)">

    <!-- Queue -->
    @if (queue().length > 0) {
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:16px;">
        @for (item of queue(); track item.file.name) {
          <div class="queue-item">
            <div class="queue-item__icon">
              <mat-icon>audio_file</mat-icon>
            </div>
            <div class="queue-item__info">
              <div class="queue-item__name">{{ item.file.name }}</div>
              <div class="queue-item__meta">{{ formatBytes(item.file.size) }}</div>
              @if (item.status === 'uploading') {
                <div class="cv-upload-progress" style="margin-top:6px;">
                  <div class="cv-upload-progress__track">
                    <div class="cv-upload-progress__fill" [style.width.%]="item.progress"></div>
                  </div>
                </div>
              }
              @if (item.status === 'error') {
                <div style="font-size:11px;color:#e24b4a;margin-top:4px;">{{ item.error }}</div>
              }
            </div>
            <div class="queue-item__status">
              @if (item.status === 'done') {
                <mat-icon style="color:#639922;">check_circle</mat-icon>
              } @else if (item.status === 'error') {
                <mat-icon style="color:#e24b4a;">error</mat-icon>
              } @else if (item.status === 'uploading') {
                <span style="font-size:12px;color:#2563a8;font-weight:500;">{{ item.progress }}%</span>
              } @else {
                <button mat-icon-button (click)="removeFromQueue(item)" aria-label="Remove">
                  <mat-icon>close</mat-icon>
                </button>
              }
            </div>
          </div>
        }
      </div>
    }

    <!-- Upload button -->
    @if (pendingItems().length > 0) {
      <button mat-flat-button color="primary"
        style="width:100%;margin-top:20px;padding:12px;"
        [disabled]="isUploading()"
        (click)="startUpload()">
        <mat-icon>upload</mat-icon>
        Upload {{ pendingItems().length }} file{{ pendingItems().length === 1 ? '' : 's' }}
      </button>
    }

    <!-- Success banner -->
    @if (allDone() && queue().length > 0) {
      <div style="display:flex;align-items:center;gap:8px;margin-top:16px;padding:14px 16px;background:#eaf3de;border:0.5px solid #97c459;border-radius:8px;color:#27500a;font-size:13px;">
        <mat-icon style="color:#3b6d11;">check_circle</mat-icon>
        Upload complete. {{ queue().length }} file{{ queue().length === 1 ? '' : 's' }} added to your merchant records.
      </div>
    }
  `,
  styles: [`
    .queue-item {
      background: #fff;
      border: 0.5px solid #e2e5ea;
      border-radius: 8px;
      padding: 12px 14px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .queue-item__icon {
      width: 34px; height: 34px;
      background: #eef3fb; border-radius: 7px;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0;
      mat-icon { color: #2563a8; font-size: 18px; }
    }
    .queue-item__info { flex: 1; min-width: 0; }
    .queue-item__name {
      font-size: 13px; font-weight: 500; color: #1a2740;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .queue-item__meta { font-size: 11px; color: #9aa3b0; margin-top: 2px; }
    .queue-item__status { flex-shrink: 0; min-width: 32px; text-align: center; }
  `],
})
export class MerchantUploadComponent {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  queue = signal<QueuedFile[]>([]);
  isDragging = signal(false);
  isUploading = signal(false);

  allowedLabel = ALLOWED_EXT.join(', ');

  pendingItems() { return this.queue().filter(i => i.status === 'pending'); }
  allDone()      { return this.queue().length > 0 && this.queue().every(i => i.status === 'done'); }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(true);
  }

  onDragLeave(): void { this.isDragging.set(false); }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.isDragging.set(false);
    const files = Array.from(e.dataTransfer?.files ?? []);
    this.addFiles(files);
  }

  onFilesSelected(e: Event): void {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.addFiles(files);
    input.value = '';
  }

  private addFiles(files: File[]): void {
    const valid = files.filter(f => this.validate(f));
    this.queue.update(q => [
      ...q,
      ...valid.map(f => ({ file: f, progress: 0, status: 'pending' as const })),
    ]);
  }

  private validate(f: File): boolean {
    if (f.size > MAX_BYTES) {
      this.snack.open(`${f.name} exceeds 250 MB limit`, 'Dismiss', { duration: 4000 });
      return false;
    }
    const ext = '.' + f.name.split('.').pop()?.toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      this.snack.open(`${f.name} is not a supported audio format`, 'Dismiss', { duration: 4000 });
      return false;
    }
    return true;
  }

  removeFromQueue(item: QueuedFile): void {
    this.queue.update(q => q.filter(i => i !== item));
  }

  startUpload(): void {
    if (this.isUploading()) return;
    this.isUploading.set(true);
    const pending = this.pendingItems();
    let completed = 0;

    for (const item of pending) {
      item.status = 'uploading';
      this.api.uploadFile(item.file).subscribe({
        next: event => {
          if (event.type === HttpEventType.UploadProgress) {
            item.progress = event.total
              ? Math.round((event.loaded / event.total) * 100)
              : 0;
            this.queue.update(q => [...q]); // trigger signal update
          } else if (event.type === HttpEventType.Response) {
            item.status = 'done';
            item.progress = 100;
            this.queue.update(q => [...q]);
            completed++;
            if (completed === pending.length) this.isUploading.set(false);
          }
        },
        error: err => {
          item.status = 'error';
          item.error = err?.error?.message ?? 'Upload failed';
          this.queue.update(q => [...q]);
          completed++;
          if (completed === pending.length) this.isUploading.set(false);
        },
      });
    }
  }

  formatBytes(b: number): string {
    if (b < 1_048_576) return `${(b / 1_024).toFixed(1)} KB`;
    return `${(b / 1_048_576).toFixed(1)} MB`;
  }
}
