import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { runtimeConfig } from '../config/runtime-config';

// ── Response types (mirror ClearVoice.Api DTOs) ─────────────────────────────

export interface AudioFileResponse {
  id: string;
  merchantId: string;
  uploadedByUserId: string;
  uploadedByUsername: string;
  originalFilename: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface AuditEventResponse {
  id: string;
  eventType: string;
  userId: string;
  username: string;
  merchantId?: string;
  fileId?: string;
  filename?: string;
  ipAddress?: string;
  detail?: string;
  occurredAt: string;
}

export interface PagedResponse<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface PresignedUrlResponse {
  url: string;
  expiresAt: string;
}

export interface UserInfoResponse {
  userId: string;
  username: string;
  email?: string;
  fullName?: string;
  merchantId?: string;
  organisationName?: string;
  roles: string[];
  identityProvider: string;
}

export interface FilesQuery {
  merchantId?: string;
  page?: number;
  pageSize?: number;
  sortBy?: 'uploadedAt' | 'originalFilename' | 'sizeBytes';
  sortDesc?: boolean;
}

export interface AuditQuery {
  eventType?: string;
  merchantId?: string;
  userId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = runtimeConfig.apiBaseUrl;

  // ── Auth ──────────────────────────────────────────────────────────────────

  getUserInfo(): Observable<UserInfoResponse> {
    return this.http.get<UserInfoResponse>(`${this.base}/api/me`);
  }

  postLogout(): Observable<void> {
    return this.http.post<void>(`${this.base}/api/auth/logout`, {});
  }

  // ── Files — merchant ──────────────────────────────────────────────────────

  getMerchantFiles(query: FilesQuery = {}): Observable<PagedResponse<AudioFileResponse>> {
    const params = this.toParams(query);
    return this.http.get<PagedResponse<AudioFileResponse>>(`${this.base}/api/merchant/files`, { params });
  }

  uploadFile(file: File): Observable<HttpEvent<AudioFileResponse>> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<AudioFileResponse>(`${this.base}/api/merchant/files/upload`, form, {
      reportProgress: true,
      observe: 'events',
    });
  }

  // ── Files — finance staff ─────────────────────────────────────────────────

  getAllFiles(query: FilesQuery = {}): Observable<PagedResponse<AudioFileResponse>> {
    const params = this.toParams(query);
    return this.http.get<PagedResponse<AudioFileResponse>>(`${this.base}/api/finance/files`, { params });
  }

  deleteFile(fileId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/finance/files/${fileId}`);
  }

  getPlaybackUrl(fileId: string): Observable<PresignedUrlResponse> {
    return this.http.get<PresignedUrlResponse>(`${this.base}/api/finance/files/${fileId}/playback-url`);
  }

  // ── Audit ─────────────────────────────────────────────────────────────────

  getAuditLog(query: AuditQuery = {}): Observable<PagedResponse<AuditEventResponse>> {
    const params = this.toParams(query);
    return this.http.get<PagedResponse<AuditEventResponse>>(`${this.base}/api/finance/audit`, { params });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toParams(obj: any): HttpParams {
    let params = new HttpParams();
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (v !== undefined && v !== null && v !== '') {
        params = params.set(k, String(v));
      }
    }
    return params;
  }
}
