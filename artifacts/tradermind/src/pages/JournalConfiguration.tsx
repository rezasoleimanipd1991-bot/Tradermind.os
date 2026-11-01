import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArrowDown, ArrowUp, Check, Eye, EyeOff, Pencil, Plus, RotateCcw, Save, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { JournalOption } from '../db/database';
import {
  JOURNAL_OPTION_CATEGORIES,
  localizeJournalOptionLabel,
  type JournalCategoryInfo,
  CATEGORY_USAGE,
  PROTECTED_CATEGORY_IDS,
  journalSessionService,
} from '../services/journalSessionService';
import {
  ANALYSIS_FLEXIBLE_FIELD_KEYS,
  clampAnalysisFieldRows,
  DEFAULT_ANALYSIS_FIELD_LAYOUTS,
  getHiddenAnalysisFields,
  getJournalAnalysisFieldLabels,
  getJournalAnalysisFieldLayouts,
  JOURNAL_ANALYSIS_FIELD_LABELS,
  MAX_ANALYSIS_FIELD_ROWS,
  MIN_ANALYSIS_FIELD_ROWS,
  saveHiddenAnalysisFields,
  saveJournalAnalysisFieldLabels,
  saveJournalAnalysisFieldLayouts,
  type AnalysisFieldKind,
  type AnalysisFieldLayouts,
  type AnalysisFlexibleFieldKey,
  type JournalAnalysisFieldKey,
  type JournalAnalysisFieldLabels,
} from '../services/journalAnalysisFieldLabels';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';

/** فیلدهایی که فقط عنوانشان قابل ویرایش است (نوع و اندازهٔ آن‌ها ثابت است). */
const FIXED_ANALYSIS_FIELD_KEYS: readonly JournalAnalysisFieldKey[] = [
  'expectedDirectionOptionId', 'notes', 'previousTradeId', 'nextTradeId', 'tags',
];

const toAsciiDigits = (value: string) => value
  .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));

export default function JournalConfiguration() {
  const [categoryId, setCategoryId] = useState<string>(JOURNAL_OPTION_CATEGORIES[0].id);
  const [options, setOptions] = useState<JournalOption[]>([]);
  const [customCategories, setCustomCategories] = useState<JournalCategoryInfo[]>([]);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysisFieldLabels, setAnalysisFieldLabels] = useState<JournalAnalysisFieldLabels>(
    JOURNAL_ANALYSIS_FIELD_LABELS,
  );
  const [fieldLayouts, setFieldLayouts] = useState<AnalysisFieldLayouts>(DEFAULT_ANALYSIS_FIELD_LAYOUTS);
  // متن خام تعداد خط‌ها: تا زمان ذخیره، ورودی فارسی/کیبورد صوتی پاک نمی‌شود.
  const [hiddenFields, setHiddenFields] = useState<JournalAnalysisFieldKey[]>(() => getHiddenAnalysisFields());
  const [rowsText, setRowsText] = useState<Record<string, string>>({});

  const allCategories = useMemo<JournalCategoryInfo[]>(
    () => [
      ...JOURNAL_OPTION_CATEGORIES.filter(category => !hiddenCategoryIds.includes(category.id)).map(category => ({ ...category, custom: false })),
      ...customCategories,
    ],
    [customCategories, hiddenCategoryIds],
  );
  const removedCategories = JOURNAL_OPTION_CATEGORIES.filter(category => hiddenCategoryIds.includes(category.id));
  const currentCategory = allCategories.find(category => category.id === categoryId);
  const categoryLabel = currentCategory?.label ?? categoryId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await journalSessionService.ensureDefaultOptions();
      setCustomCategories(await journalSessionService.getCustomCategories());
      setHiddenCategoryIds(await journalSessionService.getHiddenCategoryIds());
      setOptions(await journalSessionService.getOptions(categoryId, true));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'بارگذاری گزینه‌ها ناموفق بود.');
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setAnalysisFieldLabels(getJournalAnalysisFieldLabels());
    const layouts = getJournalAnalysisFieldLayouts();
    setFieldLayouts(layouts);
    setRowsText(Object.fromEntries(ANALYSIS_FLEXIBLE_FIELD_KEYS.map(key => [key, String(layouts[key].rows)])));
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setLabel('');
    setDescription('');
    setRequired(false);
  };

  const startEdit = (option: JournalOption) => {
    setEditingId(option.id);
    setLabel(localizeJournalOptionLabel(option.category, option.label));
    setDescription(option.description);
    setRequired(option.required ?? false);
  };

  const save = async () => {
    if (!label.trim()) {
      toast.error('عنوان گزینه را وارد کنید.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await journalSessionService.updateOption(editingId, { label, description, required });
        toast.success('گزینه به‌روزرسانی شد.');
      } else {
        await journalSessionService.createOption({ category: categoryId, label, description, required });
        toast.success('گزینه اضافه شد.');
      }
      resetForm();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ذخیره گزینه ناموفق بود.');
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (option: JournalOption) => {
    try {
      await journalSessionService.setOptionEnabled(option.id, !option.enabled);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'به‌روزرسانی وضعیت گزینه ناموفق بود.');
    }
  };

  const addCategory = async () => {
    try {
      const created = await journalSessionService.createCategory(newCategoryName);
      setNewCategoryName('');
      setCategoryId(created.id);
      resetForm();
      toast.success('دسته اضافه شد. حالا گزینه‌هایش را بنویسید و آن را در «نوع فیلد ← چک‌باکس» به یک فیلد تحلیل وصل کنید.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ساخت دسته ناموفق بود.');
    }
  };

  const renameCurrentCategory = async () => {
    const name = window.prompt('نام جدید دسته:', categoryLabel);
    if (name == null) return;
    try {
      await journalSessionService.renameCategory(categoryId, name);
      toast.success('نام دسته تغییر کرد.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'تغییر نام ناموفق بود.');
    }
  };

  const removeBuiltinCategory = async () => {
    if (!window.confirm(`دستهٔ «${categoryLabel}» از فهرست و فرم‌ها حذف شود؟\nگزینه‌ها و سوابق قبلی نگه داشته می‌شوند و هر وقت خواستید از پایین همین فهرست آن را برمی‌گردانید.`)) return;
    try {
      await journalSessionService.hideCategory(categoryId);
      setCategoryId(JOURNAL_OPTION_CATEGORIES.find(category => category.id !== categoryId && !hiddenCategoryIds.includes(category.id))?.id ?? JOURNAL_OPTION_CATEGORIES[0].id);
      resetForm();
      toast.success('دسته حذف شد.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'حذف دسته ناموفق بود.');
    }
  };

  const restoreBuiltinCategory = async (id: string) => {
    try {
      await journalSessionService.restoreCategory(id);
      toast.success('دسته برگشت.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'بازگرداندن دسته ناموفق بود.');
    }
  };

  const deleteCurrentCategory = async () => {
    if (!window.confirm(`دستهٔ «${categoryLabel}» با همهٔ گزینه‌هایش برای همیشه حذف شود؟`)) return;
    try {
      await journalSessionService.deleteCategory(categoryId);
      // فیلدهایی که چک‌باکسشان به این دسته وصل بود به کادر متنی برمی‌گردند.
      const repaired = Object.fromEntries(ANALYSIS_FLEXIBLE_FIELD_KEYS.map(key => {
        const layout = fieldLayouts[key];
        return [key, layout.optionCategory === categoryId ? { ...DEFAULT_ANALYSIS_FIELD_LAYOUTS[key], rows: layout.rows } : layout];
      })) as AnalysisFieldLayouts;
      saveJournalAnalysisFieldLayouts(repaired);
      setFieldLayouts(getJournalAnalysisFieldLayouts());
      void journalSessionService.saveAnalysisFieldConfig();
      setCategoryId(JOURNAL_OPTION_CATEGORIES[0].id);
      resetForm();
      toast.success('دسته حذف شد.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'حذف دسته ناموفق بود.');
    }
  };

  const deleteOption = async (option: JournalOption) => {
    const name = localizeJournalOptionLabel(option.category, option.label);
    if (!window.confirm(`گزینهٔ «${name}» برای همیشه حذف شود؟\nمعاملات و سشن‌های قبلی که از آن استفاده کرده‌اند عنوان آن را «حذف‌شده» نشان می‌دهند. اگر فقط نمی‌خواهید در انتخاب‌های جدید دیده شود، به‌جای حذف آن را بایگانی کنید.`)) return;
    try {
      await journalSessionService.deleteOption(option.id);
      if (editingId === option.id) resetForm();
      toast.success('گزینه حذف شد.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'حذف گزینه ناموفق بود.');
    }
  };

  const deleteAllInCategory = async () => {
    if (options.length === 0) return;
    if (!window.confirm(`همهٔ ${options.length.toLocaleString('fa-IR')} گزینهٔ دستهٔ «${categoryLabel}» برای همیشه حذف شوند؟\nمعاملات و سشن‌های قبلی عنوان این گزینه‌ها را «حذف‌شده» نشان می‌دهند.`)) return;
    try {
      const count = await journalSessionService.deleteCategoryOptions(categoryId);
      resetForm();
      toast.success(`${count.toLocaleString('fa-IR')} گزینه حذف شد.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'حذف گزینه‌ها ناموفق بود.');
    }
  };

  const toggleFieldHidden = (key: JournalAnalysisFieldKey) => {
    const next = hiddenFields.includes(key) ? hiddenFields.filter(item => item !== key) : [...hiddenFields, key];
    saveHiddenAnalysisFields(next);
    setHiddenFields(getHiddenAnalysisFields());
    void journalSessionService.saveAnalysisFieldConfig();
    toast.success(next.includes(key) ? 'فیلد از فرم تحلیل حذف شد. داده‌های قبلی آن حفظ می‌شود.' : 'فیلد به فرم تحلیل برگشت.');
  };

  const reorder = async (option: JournalOption, direction: -1 | 1) => {
    try {
      await journalSessionService.reorderOption(option.id, direction);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'مرتب‌سازی ناموفق بود.');
    }
  };

  const saveAnalysisLabels = () => {
    try {
      saveJournalAnalysisFieldLabels(analysisFieldLabels);
      setAnalysisFieldLabels(getJournalAnalysisFieldLabels());
      const nextLayouts = Object.fromEntries(ANALYSIS_FLEXIBLE_FIELD_KEYS.map(key => [key, {
        ...fieldLayouts[key],
        rows: clampAnalysisFieldRows(toAsciiDigits(rowsText[key] ?? ''), fieldLayouts[key].rows),
      }])) as AnalysisFieldLayouts;
      saveJournalAnalysisFieldLayouts(nextLayouts);
      const saved = getJournalAnalysisFieldLayouts();
      setFieldLayouts(saved);
      setRowsText(Object.fromEntries(ANALYSIS_FLEXIBLE_FIELD_KEYS.map(key => [key, String(saved[key].rows)])));
      void journalSessionService.saveAnalysisFieldConfig();
      toast.success('عنوان و چیدمان فیلدهای رویداد تحلیل ذخیره شد.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'ذخیرهٔ عنوان فیلدها انجام نشد.');
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 pb-10" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-journal-config-title">پیکربندی ژورنال</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            گزینه‌های شخصی ژورنال را مدیریت کنید. گزینه‌های استفاده‌شده بایگانی می‌شوند تا سابقه معاملات حفظ شود.
          </p>
        </div>
        <SlidersHorizontal className="h-6 w-6 text-primary" aria-hidden="true" />
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">فیلدهای رویداد تحلیل</CardTitle>
          <CardDescription>برای هر فیلد، عنوان، نوع (کادر متنی یا چک‌باکس) و تعداد خط‌های کادر را تعیین کنید. اندازهٔ کادر متنی را داخل خود تحلیل هم می‌توانید با دکمه‌های + و − یا کشیدن گوشهٔ کادر تغییر دهید.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-3">
            {ANALYSIS_FLEXIBLE_FIELD_KEYS.map((key: AnalysisFlexibleFieldKey) => {
              const layout = fieldLayouts[key];
              return (
                <div key={key} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_.7fr_1.2fr]" data-testid={`config-analysis-field-${key}`}>
                  <label className="space-y-1.5 text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">عنوان ({JOURNAL_ANALYSIS_FIELD_LABELS[key]}){hiddenFields.includes(key) && <Badge variant="secondary">حذف‌شده از فرم</Badge>}</span>
                    <Input
                      value={analysisFieldLabels[key]}
                      onChange={event => setAnalysisFieldLabels(current => ({ ...current, [key]: event.target.value }))}
                      aria-label={`عنوان فیلد ${JOURNAL_ANALYSIS_FIELD_LABELS[key]}`}
                      maxLength={100}
                      data-testid={`input-analysis-field-label-${key}`}
                    />
                  </label>
                  <div className="space-y-1.5 text-sm">
                    <span className="text-muted-foreground">نوع فیلد</span>
                    <Select value={layout.kind} onValueChange={value => setFieldLayouts(current => ({ ...current, [key]: { ...current[key], kind: value as AnalysisFieldKind } }))}>
                      <SelectTrigger data-testid={`select-analysis-field-kind-${key}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">کادر متنی</SelectItem>
                        <SelectItem value="checkbox">چک‌باکس</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="space-y-1.5 text-sm">
                    <span className="text-muted-foreground">تعداد خط ({MIN_ANALYSIS_FIELD_ROWS}–{MAX_ANALYSIS_FIELD_ROWS})</span>
                    <Input
                      inputMode="numeric"
                      value={rowsText[key] ?? ''}
                      onChange={event => setRowsText(current => ({ ...current, [key]: event.target.value }))}
                      disabled={layout.kind === 'checkbox'}
                      aria-label={`تعداد خط ${JOURNAL_ANALYSIS_FIELD_LABELS[key]}`}
                      data-testid={`input-analysis-field-rows-${key}`}
                    />
                  </label>
                  <div className="space-y-1.5 text-sm">
                    <span className="text-muted-foreground">گزینه‌های چک‌باکس</span>
                    <Select value={layout.optionCategory} onValueChange={value => setFieldLayouts(current => ({ ...current, [key]: { ...current[key], optionCategory: value } }))} disabled={layout.kind !== 'checkbox'}>
                      <SelectTrigger data-testid={`select-analysis-field-category-${key}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {allCategories.map(category => <SelectItem key={category.id} value={category.id}>{category.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2 lg:col-span-4">
                    <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => toggleFieldHidden(key)} data-testid={`button-toggle-analysis-field-${key}`}>
                      {hiddenFields.includes(key) ? <><Eye className="h-4 w-4" />بازگرداندن فیلد به فرم</> : <><EyeOff className="h-4 w-4" />حذف فیلد از فرم</>}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FIXED_ANALYSIS_FIELD_KEYS.map(key => (
              <div key={key} className="space-y-1.5 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground">{JOURNAL_ANALYSIS_FIELD_LABELS[key]}{hiddenFields.includes(key) && <Badge variant="secondary">حذف‌شده از فرم</Badge>}</span>
                <Input
                  value={analysisFieldLabels[key]}
                  onChange={event => setAnalysisFieldLabels(current => ({ ...current, [key]: event.target.value }))}
                  aria-label={`عنوان فیلد ${JOURNAL_ANALYSIS_FIELD_LABELS[key]}`}
                  maxLength={100}
                  data-testid={`input-analysis-field-label-${key}`}
                />
                <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => toggleFieldHidden(key)} data-testid={`button-toggle-analysis-field-${key}`}>
                  {hiddenFields.includes(key) ? <><Eye className="h-4 w-4" />بازگرداندن به فرم</> : <><EyeOff className="h-4 w-4" />حذف از فرم</>}
                </Button>
              </div>
            ))}
          </div>
          <Button onClick={saveAnalysisLabels} className="gap-2" data-testid="button-save-analysis-field-labels">
            <Save className="h-4 w-4" />ذخیرهٔ عنوان‌ها و چیدمان
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">دسته‌ها</CardTitle>
            <CardDescription>هر دسته مستقل قابل تنظیم است.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {allCategories.map(category => (
              <button
                key={category.id}
                type="button"
                data-testid={`button-option-category-${category.id}`}
                onClick={() => { setCategoryId(category.id); resetForm(); }}
                className={`flex min-h-10 w-full items-center justify-between rounded-md px-3 text-right text-sm transition-colors ${
                  categoryId === category.id ? 'bg-primary/10 font-semibold text-primary' : 'hover:bg-muted'
                }`}
              >
                <span>{category.label}</span>
                <span className="text-xs text-muted-foreground">
                  {options.filter(option => option.enabled && option.category === category.id).length || ''}
                </span>
              </button>
            ))}
            <div className="mt-3 space-y-2 border-t pt-3">
              <Input
                value={newCategoryName}
                onChange={event => setNewCategoryName(event.target.value)}
                placeholder="نام دستهٔ جدید"
                aria-label="نام دستهٔ جدید"
                maxLength={60}
                data-testid="input-new-category-name"
              />
              <Button type="button" size="sm" className="w-full gap-2" onClick={() => void addCategory()} disabled={!newCategoryName.trim()} data-testid="button-add-category">
                <Plus className="h-4 w-4" />افزودن دسته
              </Button>
            </div>
            {removedCategories.length > 0 && (
              <div className="mt-3 space-y-1 border-t pt-3" data-testid="list-removed-categories">
                <p className="text-xs text-muted-foreground">دسته‌های حذف‌شده</p>
                {removedCategories.map(category => (
                  <div key={category.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{category.label}</span>
                    <Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2" onClick={() => void restoreBuiltinCategory(category.id)} data-testid={`button-restore-category-${category.id}`}><RotateCcw className="h-3.5 w-3.5" />بازگرداندن</Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{editingId ? 'ویرایش گزینه' : `افزودن به ${categoryLabel}`}</CardTitle>
              <CardDescription>متن دلخواه خود را به هر زبانی وارد کنید.</CardDescription>
            </CardHeader>
            <CardContent className={`grid gap-3 sm:items-start ${categoryId === 'checklist' ? 'sm:grid-cols-[1fr_1fr_auto]' : 'sm:grid-cols-[1fr_1fr_auto]'}`}>
              <Input
                data-testid="input-journal-option-label"
                value={label}
                onChange={event => setLabel(event.target.value)}
                placeholder="عنوان گزینه"
                aria-label="عنوان گزینه"
                maxLength={100}
              />
              <Textarea
                data-testid="input-journal-option-description"
                value={description}
                onChange={event => setDescription(event.target.value)}
                placeholder="توضیح (اختیاری)"
                aria-label="توضیح گزینه"
                maxLength={500}
                className="min-h-10"
              />
              {categoryId === 'checklist' && (
                <label className="flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm sm:col-span-2" data-testid="label-checklist-required">
                  <input data-testid="checkbox-checklist-option-required" type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} />
                  هنگام ثبت مرور معامله اجباری باشد
                </label>
              )}
              <div className="flex gap-2">
                <Button data-testid="button-save-journal-option" onClick={() => void save()} disabled={saving} className="gap-2">
                  {editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  {editingId ? 'ذخیره' : 'افزودن'}
                </Button>
                {editingId && (
                  <Button data-testid="button-cancel-journal-option-edit" variant="outline" onClick={resetForm} aria-label="لغو ویرایش">
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">{categoryLabel}</CardTitle>
                {currentCategory && !currentCategory.custom && !PROTECTED_CATEGORY_IDS.includes(currentCategory.id) && (
                  <Button type="button" size="sm" variant="outline" className="gap-2 text-destructive" onClick={() => void removeBuiltinCategory()} data-testid="button-remove-builtin-category"><Trash2 className="h-4 w-4" />حذف دسته</Button>
                )}
                {currentCategory?.custom && (
                  <>
                    <Button type="button" size="sm" variant="outline" className="gap-2" onClick={() => void renameCurrentCategory()} data-testid="button-rename-category"><Pencil className="h-4 w-4" />تغییر نام دسته</Button>
                    <Button type="button" size="sm" variant="outline" className="gap-2 text-destructive" onClick={() => void deleteCurrentCategory()} data-testid="button-delete-category"><Trash2 className="h-4 w-4" />حذف دسته</Button>
                  </>
                )}
                <Button type="button" size="sm" variant="outline" className="gap-2 text-destructive" disabled={options.length === 0} onClick={() => void deleteAllInCategory()} data-testid="button-delete-category-options">
                  <Trash2 className="h-4 w-4" />حذف همهٔ گزینه‌های این دسته
                </Button>
              </div>
              {currentCategory && !currentCategory.custom && <p className="mb-1 text-xs text-muted-foreground" data-testid="text-category-usage">کاربرد: {CATEGORY_USAGE[currentCategory.id] ?? '—'}{PROTECTED_CATEGORY_IDS.includes(currentCategory.id) ? ' — حذف‌شدنی نیست' : ''}</p>}
              <CardDescription>بایگانی، گزینه را از انتخاب‌های جدید پنهان می‌کند و سابقه را نگه می‌دارد؛ حذف، آن را برای همیشه پاک می‌کند.</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="py-8 text-center text-sm text-muted-foreground" data-testid="status-options-loading">در حال بارگذاری…</p>
              ) : options.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground" data-testid="status-options-empty">هنوز گزینه‌ای ثبت نشده است.</p>
              ) : (
                <div className="divide-y">
                  {options.map((option, index) => (
                    <div key={option.id} data-testid={`row-journal-option-${option.id}`} className="flex flex-wrap items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                           <span className="font-medium break-words" data-testid={`text-journal-option-${option.id}`}>{localizeJournalOptionLabel(option.category, option.label)}</span>
                          {option.category === 'checklist' && option.required && <Badge variant="outline">الزامی</Badge>}
                          {!option.enabled && <Badge variant="secondary">بایگانی</Badge>}
                        </div>
                        {option.description && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{option.description}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          data-testid={`button-option-up-${option.id}`}
                          size="icon" variant="ghost" className="h-8 w-8"
                          aria-label="انتقال به بالا"
                          disabled={index === 0}
                          onClick={() => void reorder(option, -1)}
                        ><ArrowUp className="h-4 w-4" /></Button>
                        <Button
                          data-testid={`button-option-down-${option.id}`}
                          size="icon" variant="ghost" className="h-8 w-8"
                          aria-label="انتقال به پایین"
                          disabled={index === options.length - 1}
                          onClick={() => void reorder(option, 1)}
                        ><ArrowDown className="h-4 w-4" /></Button>
                        <Button
                          data-testid={`button-edit-option-${option.id}`}
                          size="icon" variant="ghost" className="h-8 w-8"
                          aria-label={`ویرایش ${localizeJournalOptionLabel(option.category, option.label)}`}
                          onClick={() => startEdit(option)}
                        ><Pencil className="h-4 w-4" /></Button>
                        <Button
                          data-testid={`button-toggle-option-${option.id}`}
                          size="icon" variant="ghost" className="h-8 w-8"
                          aria-label={option.enabled ? `بایگانی ${localizeJournalOptionLabel(option.category, option.label)}` : `فعال‌سازی ${localizeJournalOptionLabel(option.category, option.label)}`}
                          onClick={() => void toggleEnabled(option)}
                        >
                          {option.enabled ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                        </Button>
                        <Button
                          data-testid={`button-delete-option-${option.id}`}
                          size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                          aria-label={`حذف ${localizeJournalOptionLabel(option.category, option.label)}`}
                          onClick={() => void deleteOption(option)}
                        ><Trash2 className="h-4 w-4" /></Button>
                        {editingId === option.id && <Check className="h-4 w-4 text-primary" aria-label="در حال ویرایش" />}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}