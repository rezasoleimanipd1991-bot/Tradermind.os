/**
 * محافظ معماری: فرمول‌های آماری نباید خارج از core/metrics دوباره پیاده شوند.
 * فایل‌های فهرست‌شده در LEGACY قبل از موتور واحد نوشته شده‌اند؛ هر فایل جدید (یا فایل مهاجرت‌شده)
 * که این الگوها را داشته باشد باعث شکست این تست می‌شود. هنگام مهاجرت یک فایل، آن را از LEGACY حذف کنید.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const SRC = resolve(process.cwd(), 'src');

const PATTERNS: Record<string, RegExp> = {
  'تقسیم نرخ برد': /\.filter\(isWin\)\.length\s*\/\s*[\w.]+\.length|\b(?:wins?|winners|won)\.length\s*\/\s*[\w.]+\.length|\bwins\s*\/\s*[\w.]*(?:length|total)\b/,
  'جمع سود/زیان ناخالص دستی': /\b(?:const|let)\s+(?:grossProfit|grossLoss|totalWinPnl|totalLossPnl)\b/,
  'Drawdown دستی': /peak\s*-\s*(?:equity|eq|cum)\b/,
  'ریاضیات آماری دستی': /function\s+(?:stdDev|median|avg|mean)\s*\(/,
};

/** فایل‌های قدیمی که هنوز مهاجرت نشده‌اند (فقط تقسیم نرخ برد روی شمارش‌هایی که از isWin مشترک می‌آیند). */
const LEGACY = new Set([
  'components/VisualSimilarityPanel.tsx',
  'pages/LiveTrade.tsx',
  'services/liveTradeService.ts',
  'services/screenshotIntelligenceService.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) { if (name !== 'node_modules') walk(full, out); }
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('no duplicate metric formulas outside core/metrics', () => {
  const files = walk(SRC)
    .map(f => ({ f, rel: relative(SRC, f).split(sep).join('/') }))
    .filter(({ rel }) =>
      !rel.startsWith('core/metrics/') && !rel.includes('__tests__') && !/\.test\.tsx?$/.test(rel));

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('only LEGACY files contain hand-written formulas', () => {
    const offenders: string[] = [];
    for (const { f, rel } of files) {
      if (LEGACY.has(rel)) continue;
      const text = readFileSync(f, 'utf-8');
      for (const [label, re] of Object.entries(PATTERNS)) {
        if (re.test(text)) offenders.push(`${rel}: ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('LEGACY has no stale entries (remove files once migrated)', () => {
    const stale: string[] = [];
    for (const rel of LEGACY) {
      const hit = files.find(x => x.rel === rel);
      const text = hit ? readFileSync(hit.f, 'utf-8') : '';
      if (!Object.values(PATTERNS).some(re => re.test(text))) stale.push(rel);
    }
    expect(stale).toEqual([]);
  });
});
