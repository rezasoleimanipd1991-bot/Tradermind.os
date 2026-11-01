import { Minus, Plus } from 'lucide-react';
import {
  clampAnalysisFieldRows,
  MAX_ANALYSIS_FIELD_ROWS,
  MIN_ANALYSIS_FIELD_ROWS,
  type AnalysisFieldLayout,
} from '../../services/journalAnalysisFieldLabels';
import type { JournalOption } from '../../db/database';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';

interface AnalysisFlexibleFieldProps {
  label: string;
  layout: AnalysisFieldLayout;
  textValue: string;
  selectedIds: string[];
  /** گزینه‌های فعالِ دستهٔ انتخاب‌شده برای حالت چک‌باکس. */
  options: JournalOption[];
  onTextChange: (value: string) => void;
  onSelectedChange: (ids: string[]) => void;
  /** تغییر تعداد خط‌های کادر؛ در تنظیمات چیدمان ذخیره می‌شود. */
  onRowsChange: (rows: number) => void;
  testId: string;
}

/**
 * یک فیلد قابل‌تنظیم در رویداد تحلیل: بسته به تنظیم کاربر یا کادر متنی چندخطی
 * است یا فهرستی از چک‌باکس‌ها. اندازهٔ کادر متنی هم با کشیدن گوشهٔ کادر و هم با
 * دکمه‌های + و − تغییر می‌کند.
 */
export function AnalysisFlexibleField({
  label, layout, textValue, selectedIds, options, onTextChange, onSelectedChange, onRowsChange, testId,
}: AnalysisFlexibleFieldProps) {
  const toggle = (optionId: string) => {
    onSelectedChange(selectedIds.includes(optionId)
      ? selectedIds.filter(id => id !== optionId)
      : [...selectedIds, optionId]);
  };

  return (
    <div className="space-y-1.5" data-testid={`field-${testId}`}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}</Label>
        {layout.kind === 'text' && (
          <div className="flex items-center gap-0.5" role="group" aria-label={`اندازهٔ کادر ${label}`}>
            <button type="button" aria-label="کوچک‌تر کردن کادر" disabled={layout.rows <= MIN_ANALYSIS_FIELD_ROWS}
              onClick={() => onRowsChange(clampAnalysisFieldRows(layout.rows - 1, layout.rows))}
              className="grid h-6 w-6 place-items-center rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
              data-testid={`shrink-${testId}`}><Minus className="h-3 w-3" /></button>
            <button type="button" aria-label="بزرگ‌تر کردن کادر" disabled={layout.rows >= MAX_ANALYSIS_FIELD_ROWS}
              onClick={() => onRowsChange(clampAnalysisFieldRows(layout.rows + 1, layout.rows))}
              className="grid h-6 w-6 place-items-center rounded border border-border text-muted-foreground hover:bg-muted disabled:opacity-40"
              data-testid={`grow-${testId}`}><Plus className="h-3 w-3" /></button>
          </div>
        )}
      </div>
      {layout.kind === 'text' ? (
        <Textarea rows={layout.rows} className="resize-y leading-7" value={textValue} onChange={event => onTextChange(event.target.value)} data-testid={`input-${testId}`} />
      ) : (
        <>
          {options.length ? (
            <div className="grid gap-2 rounded-md border border-input bg-background p-3 sm:grid-cols-2" data-testid={`list-${testId}`}>
              {options.map(option => {
                const checked = selectedIds.includes(option.id);
                return (
                  <label key={option.id} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${checked ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggle(option.id)} className="h-4 w-4 accent-primary" data-testid={`toggle-${testId}-${option.id}`} />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground" data-testid={`empty-${testId}`}>
              گزینهٔ فعالی برای این فیلد تعریف نشده است؛ از «پیکربندی ژورنال» اضافه کنید.
            </p>
          )}
          {textValue.trim() && (
            <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs leading-5 text-muted-foreground" data-testid={`legacy-${testId}`}>
              متن ثبت‌شدهٔ قبلی: {textValue}
            </p>
          )}
        </>
      )}
    </div>
  );
}
