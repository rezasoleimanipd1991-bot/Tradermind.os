import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Trade } from '../../db/database';
import { db } from '../../db/database';
import {
  computeExcursion, describeExcursion, mergeManualExcursion, parsePriceInput, readManualExcursion,
} from '../../lib/tradeExcursion';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';

interface TradeExcursionCardProps {
  trade: Trade;
  onSaved: () => void | Promise<void>;
}

const fmt = (value: number | null) => (value == null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}R`);

/**
 * ثبت بالاترین و پایین‌ترین قیمتِ دیده‌شده در طول معامله؛ برنامه MFE و MAE را
 * بر حسب R حساب و برای تب «ریسک» در تحلیل لبه ذخیره می‌کند.
 */
export function TradeExcursionCard({ trade, onSaved }: TradeExcursionCardProps) {
  const stored = useMemo(() => readManualExcursion(trade.liveMonitoring), [trade.liveMonitoring]);
  // متن خام نگه داشته می‌شود تا ورودی فارسی و کیبورد صوتی وسط تایپ خراب نشود.
  const [highText, setHighText] = useState(stored.highPrice != null ? String(stored.highPrice) : '');
  const [lowText, setLowText] = useState(stored.lowPrice != null ? String(stored.lowPrice) : '');
  const [saving, setSaving] = useState(false);

  const highPrice = parsePriceInput(highText);
  const lowPrice = parsePriceInput(lowText);
  const invalidRange = highPrice != null && lowPrice != null && highPrice < lowPrice;
  const result = useMemo(
    () => computeExcursion({ direction: trade.direction, entryPrice: trade.entryPrice, stopLoss: trade.stopLoss, highPrice, lowPrice }),
    [trade.direction, trade.entryPrice, trade.stopLoss, highPrice, lowPrice],
  );
  const notes = result ? describeExcursion(result, trade.rMultiple) : [];
  const hasInput = highPrice != null || lowPrice != null;

  const save = async (clear = false) => {
    if (!clear && (!result || !hasInput || invalidRange)) return;
    setSaving(true);
    try {
      const merged = clear || !result
        ? mergeManualExcursion(trade.liveMonitoring, null)
        : mergeManualExcursion(trade.liveMonitoring, { highPrice, lowPrice, mfeR: result.mfeR, maeR: result.maeR });
      await db.trades.update(trade.id, { liveMonitoring: merged });
      if (clear) { setHighText(''); setLowText(''); }
      toast.success(clear ? 'مقدار MFE/MAE پاک شد.' : 'MFE/MAE ذخیره شد.');
      await onSaved();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'ذخیرهٔ MFE/MAE انجام نشد.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card data-testid="card-trade-excursion">
      <CardHeader>
        <CardTitle className="text-base">حرکت قیمت در طول معامله (MFE / MAE)</CardTitle>
        <CardDescription>
          بالاترین و پایین‌ترین قیمتی را که بین ورود و خروج روی چارت دیدی وارد کن. اوج سود (MFE) و بیشترین حرکت علیه معامله (MAE) بر حسب R حساب می‌شود.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">بالاترین قیمت در طول معامله</span>
            <Input inputMode="decimal" value={highText} onChange={event => setHighText(event.target.value)} data-testid="input-excursion-high" />
          </label>
          <label className="space-y-1.5 text-sm">
            <span className="text-muted-foreground">پایین‌ترین قیمت در طول معامله</span>
            <Input inputMode="decimal" value={lowText} onChange={event => setLowText(event.target.value)} data-testid="input-excursion-low" />
          </label>
        </div>
        {invalidRange && <p className="text-xs text-destructive" data-testid="text-excursion-invalid">بالاترین قیمت نباید کمتر از پایین‌ترین قیمت باشد.</p>}
        {!result && hasInput && <p className="text-xs text-muted-foreground">برای محاسبه، ورود و حد ضرر معامله باید با هم فرق داشته باشند.</p>}
        <div className="grid grid-cols-2 gap-2 text-center" data-testid="excursion-values">
          <div className="rounded-md border bg-muted/20 p-2"><div className="text-[11px] text-muted-foreground">MFE (اوج سود)</div><div className="font-semibold" dir="ltr">{fmt(result?.mfeR ?? null)}</div></div>
          <div className="rounded-md border bg-muted/20 p-2"><div className="text-[11px] text-muted-foreground">MAE (بیشترین حرکت علیه)</div><div className="font-semibold" dir="ltr">{fmt(result?.maeR ?? null)}</div></div>
        </div>
        {notes.length > 0 && (
          <ul className="space-y-1 rounded-md bg-muted/40 p-3 text-xs leading-6 text-muted-foreground" data-testid="list-excursion-notes">
            {notes.map(line => <li key={line}>• {line}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void save(false)} disabled={saving || !result || !hasInput || invalidRange} data-testid="button-save-excursion">ذخیرهٔ MFE/MAE</Button>
          {(stored.highPrice != null || stored.lowPrice != null) && (
            <Button type="button" variant="outline" onClick={() => void save(true)} disabled={saving} data-testid="button-clear-excursion">پاک کردن</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
