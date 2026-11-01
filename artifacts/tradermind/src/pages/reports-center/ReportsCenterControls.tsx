import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type {
  DatePreset,
  FilterDimension,
  ReportFilterOption,
  ReportSectionId,
  ReportsCenterFilters,
} from '../../services/reportsCenterService';
import {
  DEFAULT_REPORT_SECTIONS,
  REPORT_SECTION_DEFINITIONS,
} from '../../services/reportsCenterService';

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: 'today', label: 'امروز' },
  { value: 'yesterday', label: 'دیروز' },
  { value: 'last7', label: '۷ روز گذشته' },
  { value: 'last30', label: '۳۰ روز گذشته' },
  { value: 'last90', label: '۹۰ روز گذشته' },
  { value: 'thisWeek', label: 'این هفته' },
  { value: 'thisMonth', label: 'این ماه' },
  { value: 'lastMonth', label: 'ماه گذشته' },
  { value: 'thisYear', label: 'امسال' },
  { value: 'all', label: 'تمام دوره' },
  { value: 'custom', label: 'بازهٔ دلخواه' },
];

const FILTERS: Array<{ key: FilterDimension; label: string }> = [
  { key: 'statuses', label: 'وضعیت' },
  { key: 'symbols', label: 'نماد' },
  { key: 'directions', label: 'جهت' },
  { key: 'strategies', label: 'استراتژی' },
  { key: 'setups', label: 'ستاپ / درجه' },
  { key: 'sessions', label: 'سشن' },
  { key: 'timeframes', label: 'تایم‌فریم' },
  { key: 'psychology', label: 'حالت روانی' },
  { key: 'mistakes', label: 'اشتباه' },
  { key: 'tags', label: 'برچسب' },
  { key: 'accounts', label: 'حساب' },
  { key: 'boxes', label: 'باکس' },
];

export function DatePresetSelect({
  value,
  onChange,
}: {
  value: DatePreset;
  onChange: (value: DatePreset) => void;
}) {
  return (
    <label className="flex min-w-44 flex-col gap-1.5 text-sm">
      <span className="text-muted-foreground">بازهٔ زمانی</span>
      <select
        className="h-10 rounded-md border border-input bg-background px-3 text-foreground"
        value={value}
        onChange={event => onChange(event.target.value as DatePreset)}
      >
        {DATE_PRESETS.map(option => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

export function SearchableMultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: ReportFilterOption[];
  selected: string[];
  onChange: (value: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return normalized
      ? options.filter(option => option.label.toLocaleLowerCase().includes(normalized))
      : options;
  }, [options, query]);

  return (
    <details className="group min-w-0 rounded-md border border-border bg-background">
      <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm [&::-webkit-details-marker]:hidden">
        <span className="truncate">{label}</span>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {selected.length ? selected.length : 'همه'}
        </span>
      </summary>
      <div className="border-t border-border p-2">
        <label className="flex items-center gap-2 rounded-md border border-input px-2">
          <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <input
            className="h-9 w-full bg-transparent text-sm outline-none"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={`جست‌وجو در ${label}`}
            aria-label={`جست‌وجو در ${label}`}
          />
        </label>
        <div className="my-2 flex gap-2">
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-primary hover:bg-muted"
            onClick={() => onChange(options.map(option => option.value))}
          >
            انتخاب همه
          </button>
          <button
            type="button"
            className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            onClick={() => onChange([])}
          >
            پاک‌کردن
          </button>
        </div>
        <div className="max-h-48 space-y-1 overflow-y-auto">
          {visible.map(option => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={event => onChange(
                  event.target.checked
                    ? [...selected, option.value]
                    : selected.filter(value => value !== option.value),
                )}
              />
              <span className="min-w-0 truncate">{option.label}</span>
            </label>
          ))}
          {visible.length === 0 && <p className="px-2 py-4 text-center text-xs text-muted-foreground">موردی پیدا نشد.</p>}
        </div>
      </div>
    </details>
  );
}

export function ReportSectionChooser({
  selected,
  onChange,
}: {
  selected: ReportSectionId[];
  onChange: (value: ReportSectionId[]) => void;
}) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const search = query.trim().toLocaleLowerCase();
    return [...new Set(REPORT_SECTION_DEFINITIONS.map(item => item.category))]
      .map(category => ({
        category,
        sections: REPORT_SECTION_DEFINITIONS.filter(item =>
          item.category === category &&
          (!search || item.label.toLocaleLowerCase().includes(search) || category.toLocaleLowerCase().includes(search)),
        ),
      }))
      .filter(group => group.sections.length > 0);
  }, [query]);

  const toggle = (id: ReportSectionId, checked: boolean) => {
    onChange(checked ? [...selected, id] : selected.filter(item => item !== id));
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="report-sections-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="report-sections-heading" className="font-semibold">بخش‌های گزارش</h2>
          <p className="text-xs text-muted-foreground">فقط بخش‌های انتخاب‌شده نمایش داده و در خروجی گزارش استفاده می‌شوند.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted" onClick={() => onChange(REPORT_SECTION_DEFINITIONS.map(item => item.id))}>انتخاب همه</button>
          <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted" onClick={() => onChange([])}>پاک‌کردن انتخاب</button>
          <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted" onClick={() => onChange([...DEFAULT_REPORT_SECTIONS])}>نمای پیش‌فرض</button>
        </div>
      </div>
      <label className="mt-3 flex max-w-lg items-center gap-2 rounded-md border border-input px-2">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <input
          className="h-9 w-full bg-transparent text-sm outline-none"
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="جست‌وجوی بخش گزارش"
          aria-label="جست‌وجوی بخش گزارش"
        />
      </label>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {groups.map(group => (
          <fieldset key={group.category} className="min-w-0 space-y-1">
            <legend className="mb-1 text-xs font-semibold text-muted-foreground">{group.category}</legend>
            {group.sections.map(section => (
              <label key={section.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                <input type="checkbox" checked={selected.includes(section.id)} onChange={event => toggle(section.id, event.target.checked)} />
                <span>{section.label}</span>
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </section>
  );
}

export function FilterControls({
  filters,
  options,
  onChange,
}: {
  filters: ReportsCenterFilters;
  options: Record<FilterDimension, ReportFilterOption[]>;
  onChange: <K extends keyof ReportsCenterFilters>(key: K, value: ReportsCenterFilters[K]) => void;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4" aria-labelledby="report-filters-heading">
      <div className="flex flex-wrap items-end gap-3">
        <h2 id="report-filters-heading" className="mr-1 font-semibold">فیلترهای مشترک</h2>
        <DatePresetSelect value={filters.preset} onChange={value => onChange('preset', value)} />
        {filters.preset === 'custom' && (
          <>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">از تاریخ</span>
              <input className="h-10 rounded-md border border-input bg-background px-3" type="date" value={filters.fromDate} onChange={event => onChange('fromDate', event.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">تا تاریخ</span>
              <input className="h-10 rounded-md border border-input bg-background px-3" type="date" value={filters.toDate} onChange={event => onChange('toDate', event.target.value)} />
            </label>
          </>
        )}
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {FILTERS.map(filter => (
          <SearchableMultiSelect
            key={filter.key}
            label={filter.label}
            options={options[filter.key]}
            selected={filters[filter.key]}
            onChange={value => onChange(filter.key, value)}
          />
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">حداقل کیفیت اجرا (۰ تا ۱۰۰)</span>
          <input className="h-10 rounded-md border border-input bg-background px-3" type="number" min={0} max={100} value={filters.minExecutionQuality ?? ''} onChange={event => onChange('minExecutionQuality', event.target.value === '' ? null : Number(event.target.value))} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">حداکثر کیفیت اجرا (۰ تا ۱۰۰)</span>
          <input className="h-10 rounded-md border border-input bg-background px-3" type="number" min={0} max={100} value={filters.maxExecutionQuality ?? ''} onChange={event => onChange('maxExecutionQuality', event.target.value === '' ? null : Number(event.target.value))} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">جست‌وجو در درس، سناریو و یادداشت</span>
          <input className="h-10 rounded-md border border-input bg-background px-3" type="search" value={filters.lessonQuery} onChange={event => onChange('lessonQuery', event.target.value)} placeholder="عبارت جست‌وجو..." />
        </label>
      </div>
    </section>
  );
}

export function ActiveFilterChips({
  filters,
  options,
  onChange,
  dateLabel,
}: {
  filters: ReportsCenterFilters;
  options: Record<FilterDimension, ReportFilterOption[]>;
  onChange: <K extends keyof ReportsCenterFilters>(key: K, value: ReportsCenterFilters[K]) => void;
  dateLabel: string;
}) {
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  if (filters.preset !== 'all') {
    chips.push({
      key: 'date',
      label: `تاریخ: ${dateLabel}`,
      remove: () => {
        onChange('preset', 'all');
        onChange('fromDate', '');
        onChange('toDate', '');
      },
    });
  }
  FILTERS.forEach(({ key, label }) => {
    filters[key].forEach(value => {
      const optionLabel = options[key].find(option => option.value === value)?.label ?? value;
      chips.push({
        key: `${key}:${value}`,
        label: `${label}: ${optionLabel}`,
        remove: () => onChange(key, filters[key].filter(item => item !== value)),
      });
    });
  });
  if (filters.minExecutionQuality !== null) chips.push({
    key: 'minQuality',
    label: `حداقل کیفیت اجرا: ${filters.minExecutionQuality}`,
    remove: () => onChange('minExecutionQuality', null),
  });
  if (filters.maxExecutionQuality !== null) chips.push({
    key: 'maxQuality',
    label: `حداکثر کیفیت اجرا: ${filters.maxExecutionQuality}`,
    remove: () => onChange('maxExecutionQuality', null),
  });
  if (filters.lessonQuery.trim()) chips.push({
    key: 'search',
    label: `جست‌وجو: ${filters.lessonQuery}`,
    remove: () => onChange('lessonQuery', ''),
  });

  if (!chips.length) return <p className="text-sm text-muted-foreground">هیچ فیلتری فعال نیست؛ همهٔ داده‌های ثبت‌شده بررسی می‌شوند.</p>;
  return (
    <div className="flex flex-wrap gap-2" aria-label="فیلترهای فعال">
      {chips.map(chip => (
        <button key={chip.key} type="button" onClick={chip.remove} className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/60 px-3 py-1 text-xs hover:bg-muted" title="حذف این فیلتر">
          <span className="truncate">{chip.label}</span><span aria-hidden="true">×</span>
        </button>
      ))}
    </div>
  );
}
