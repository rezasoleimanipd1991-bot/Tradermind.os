import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { backupService } from '../../services/backupService';
import { loadPeriodReview } from '../../services/journalPeriodReviewLoader';
import type { PeriodReview, ReviewPeriodKind } from '../../services/journalPeriodReview';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value * 100) / 100}`;
const percent = (value: number | null) => (value == null ? '—' : `${Math.round(value)}٪`);

/**
 * مرور خودکار هفتگی یا ماهانه (ماه شمسی): خلاصهٔ آمار، مشاهده‌های برآمده از داده،
 * و پرسش‌هایی برای بازبینی استراتژی. خروجی Word هم دارد.
 */
export function PeriodReviewCard() {
  const [kind, setKind] = useState<ReviewPeriodKind>('week');
  const [offset, setOffset] = useState(0);
  const [review, setReview] = useState<PeriodReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReview(await loadPeriodReview(kind, offset));
    } catch (cause) {
      console.error('[PeriodReview] load failed', cause);
      toast.error(`بارگذاری مرور ناموفق بود: ${cause instanceof Error ? cause.message : String(cause)}`.slice(0, 200));
    } finally {
      setLoading(false);
    }
  }, [kind, offset]);

  useEffect(() => { void load(); }, [load]);

  const exportWord = async () => {
    setExporting(true);
    try {
      await backupService.exportJournalPeriodReview(kind, offset);
    } catch (cause) {
      console.error('[PeriodReview] export failed', cause);
      toast.error(`ساخت فایل Word مرور ناموفق بود: ${cause instanceof Error ? cause.message : String(cause)}`.slice(0, 200));
    } finally {
      setExporting(false);
    }
  };

  const switchKind = (next: ReviewPeriodKind) => { setKind(next); setOffset(0); };

  return (
    <Card data-testid="card-period-review">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">مرور خودکار دوره‌ای</CardTitle>
        <CardDescription>خلاصهٔ هفته یا ماه شمسی از روی سشن‌ها و معاملات ثبت‌شده.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={kind === 'week' ? 'default' : 'outline'} onClick={() => switchKind('week')} data-testid="button-review-week">هفتگی</Button>
          <Button type="button" size="sm" variant={kind === 'month' ? 'default' : 'outline'} onClick={() => switchKind('month')} data-testid="button-review-month">ماهانه</Button>
          <div className="mr-auto flex items-center gap-1">
            <Button type="button" size="icon" variant="outline" aria-label="دورهٔ قبل" onClick={() => setOffset(current => current - 1)} data-testid="button-review-prev"><ChevronRight className="h-4 w-4" /></Button>
            <Button type="button" size="icon" variant="outline" aria-label="دورهٔ بعد" disabled={offset >= 0} onClick={() => setOffset(current => current + 1)} data-testid="button-review-next"><ChevronLeft className="h-4 w-4" /></Button>
          </div>
        </div>

        {loading && <p className="text-sm text-muted-foreground" data-testid="status-review-loading">در حال محاسبهٔ مرور…</p>}
        {!loading && review && (
          <>
            <div>
              <p className="font-semibold" data-testid="text-review-range">{review.range.label}</p>
              <p className="text-xs text-muted-foreground" dir="ltr" style={{ textAlign: 'right' }}>{review.range.gregorianLabel}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="grid-review-kpis">
              {[
                ['سشن / روز', `${review.sessionCount.toLocaleString('fa-IR')} / ${review.tradingDays.toLocaleString('fa-IR')}`],
                ['معاملات بسته', review.overall.settled.toLocaleString('fa-IR')],
                ['نرخ برد', percent(review.overall.winRate)],
                ['سود/زیان', signed(review.overall.netPnl)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border bg-muted/20 p-2 text-center">
                  <div className="text-[11px] text-muted-foreground">{label}</div>
                  <div className="font-semibold" dir="ltr">{value}</div>
                </div>
              ))}
            </div>
            <section className="space-y-1.5">
              <h3 className="text-sm font-semibold">مشاهدات</h3>
              {review.observations.length === 0
                ? <p className="text-xs text-muted-foreground">مشاهده‌ای برای این دوره وجود ندارد.</p>
                : <ul className="space-y-1 text-sm leading-7" data-testid="list-review-observations">{review.observations.map(line => <li key={line}>• {line}</li>)}</ul>}
            </section>
            <section className="space-y-1.5">
              <h3 className="text-sm font-semibold">پرسش‌هایی برای بازبینی</h3>
              {review.questions.length === 0
                ? <p className="text-xs text-muted-foreground" data-testid="text-review-no-questions">نمونه برای مطرح‌کردن پرسش کافی نیست یا الگوی نگران‌کننده‌ای دیده نشد.</p>
                : <ul className="space-y-1 text-sm leading-7" data-testid="list-review-questions">{review.questions.map(line => <li key={line}>• {line}</li>)}</ul>}
              <p className="text-[11px] text-muted-foreground">این موارد فقط از روی داده‌های ثبت‌شده ساخته می‌شوند و توصیهٔ معاملاتی نیستند.</p>
            </section>
            <Button type="button" variant="outline" onClick={() => void exportWord()} disabled={exporting} data-testid="button-export-review-word">
              {exporting ? <><RefreshCcw className="ml-2 h-4 w-4 animate-spin" />در حال ساخت…</> : <><Download className="ml-2 h-4 w-4" />دانلود مرور (Word)</>}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
