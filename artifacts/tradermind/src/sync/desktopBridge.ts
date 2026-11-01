import { syncCore } from '../db/syncEngine';
import { createHubHandler } from './hubHandler';
import { emitDataSynced } from './dataEvents';

export interface HubAddress { url: string; kind: 'lan' | 'tailscale' }
export interface HubInfo {
  running: boolean;
  port: number | null;
  error: string | null;
  token: string;
  addresses: HubAddress[];
  localUrl: string | null;
  pairCode: string | null;
}

export interface TmDesktopApi {
  isDesktop: true;
  registerHubHandler(fn: (op: string, args: unknown) => Promise<unknown>): void;
  getHubInfo(): Promise<HubInfo | null>;
  rotateHubToken(): Promise<HubInfo | null>;
  openWebVersion(): Promise<boolean>;
}

declare global {
  interface Window { tmDesktop?: TmDesktopApi }
}

export const getDesktopApi = (): TmDesktopApi | null =>
  typeof window !== 'undefined' && window.tmDesktop?.isDesktop ? window.tmDesktop : null;

/** در برنامه‌ی ویندوز: این پنجره مرجع اصلی داده است و درخواست‌های گوشی/وب را پاسخ می‌دهد */
export function registerDesktopHub(): boolean {
  const api = getDesktopApi();
  if (!api) return false;
  api.registerHubHandler(createHubHandler(syncCore, {
    onDataChanged: info => emitDataSynced({ ...info, source: 'received' }),
  }));
  return true;
}
