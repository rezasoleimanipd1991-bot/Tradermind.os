/** تنظیمات اتصال این دستگاه (گوشی/وب) به نرم‌افزار ویندوز. فقط روی همین دستگاه می‌ماند. */

export interface SyncConfig {
  token: string;
  urls: string[];
  lastGoodUrl?: string;
  autoSync: boolean;
  pairedAt: number;
}

export interface SyncLastResult {
  at: number;
  rowsSent: number;
  inserted: number;
  updated: number;
  deleted: number;
  blobsUp: number;
  blobsDown: number;
}

const CONFIG_KEY = 'tradermind.sync.config.v1';
const RESULT_KEY = 'tradermind.sync.lastResult.v1';

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as Partial<SyncConfig>;
    if (typeof c.token !== 'string' || !Array.isArray(c.urls) || c.urls.length === 0) return null;
    return {
      token: c.token,
      urls: c.urls,
      lastGoodUrl: c.lastGoodUrl,
      autoSync: c.autoSync ?? true,
      pairedAt: c.pairedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export function saveSyncConfig(c: SyncConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
}

export function clearSyncConfig(): void {
  localStorage.removeItem(CONFIG_KEY);
  localStorage.removeItem(RESULT_KEY);
}

export function loadLastResult(): SyncLastResult | null {
  try {
    const raw = localStorage.getItem(RESULT_KEY);
    return raw ? (JSON.parse(raw) as SyncLastResult) : null;
  } catch {
    return null;
  }
}

export function saveLastResult(r: SyncLastResult): void {
  try { localStorage.setItem(RESULT_KEY, JSON.stringify(r)); } catch { /* حافظه پر است */ }
}

const URL_RE = /^https?:\/\/[^\s/$.?#][^\s]*$/i;

export function normalizeUrl(u: string): string {
  return u.trim().replace(/\/+$/, '');
}

/**
 * کد اتصال را (که برنامه‌ی ویندوز نشان می‌دهد) باز می‌کند.
 * هر متنی که شامل «tm1.…» باشد پذیرفته می‌شود (مثلاً لینک کامل یا متن کپی‌شده با فاصله).
 */
export function decodePairCode(input: string): { token: string; urls: string[] } | null {
  const m = /tm1\.([A-Za-z0-9_-]+)/.exec((input ?? '').replace(/\s+/g, ''));
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), ch => ch.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data?.v !== 1 || typeof data.t !== 'string' || data.t.length < 16 || !Array.isArray(data.u)) return null;
    const urls = (data.u as unknown[])
      .filter((u): u is string => typeof u === 'string')
      .map(normalizeUrl)
      .filter(u => URL_RE.test(u))
      .slice(0, 8);
    if (!urls.length) return null;
    return { token: data.t, urls };
  } catch {
    return null;
  }
}
