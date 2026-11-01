import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Globe, Link2, Loader2, RefreshCw, CheckCircle2, AlertTriangle, WifiOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Switch } from '../components/ui/switch';
import { Badge } from '../components/ui/badge';
import { Textarea } from '../components/ui/textarea';
import { Input } from '../components/ui/input';
import { getDesktopApi, type HubInfo } from './desktopBridge';
import { syncManager, useSyncStatus } from './syncManager';

const fmtTime = (ts: number) => new Date(ts).toLocaleString('fa-IR');

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('کپی شد');
  } catch {
    toast.error('کپی نشد؛ متن را دستی انتخاب و کپی کنید');
  }
}

function Shell({ children, description }: { children: React.ReactNode; description: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <RefreshCw className="w-4 h-4 shrink-0" />
          همگام‌سازی بین گوشی، وب و ویندوز
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

// ── برنامه‌ی ویندوز: نسخه‌ی اصلی ──────────────────────────────────
function DesktopHubSection() {
  const api = getDesktopApi()!;
  const [info, setInfo] = useState<HubInfo | null>(null);

  const load = useCallback(() => { void api.getHubInfo().then(setInfo); }, [api]);
  useEffect(load, [load]);

  const rotate = async () => {
    if (!window.confirm('کد جدید ساخته می‌شود و گوشی و نسخه‌ی وبی که قبلاً وصل شده‌اند باید دوباره وصل شوند. ادامه می‌دهید؟')) return;
    setInfo(await api.rotateHubToken());
    toast.success('کد جدید ساخته شد');
  };

  const openWeb = async () => {
    if (!(await api.openWebVersion())) toast.error('سرور همگام‌سازی روشن نیست');
  };

  return (
    <Shell description="این برنامه نسخه‌ی اصلی داده‌هاست. گوشی و نسخه‌ی وب تغییراتشان را وقتی این برنامه باز است به اینجا می‌فرستند و تغییرات این‌جا را می‌گیرند.">
      {!info ? (
        <p className="text-sm text-muted-foreground">در حال بارگذاری…</p>
      ) : !info.running ? (
        <div className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>سرور همگام‌سازی روشن نشد{info.error ? `: ${info.error}` : ''}. برنامه را ببندید و دوباره باز کنید.</span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" />آماده‌ی دریافت از گوشی و وب</Badge>
            <span className="text-muted-foreground" dir="ltr">port {info.port}</span>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">کد اتصال گوشی</p>
            <div className="flex gap-2">
              <Input readOnly dir="ltr" value={info.pairCode ?? ''} className="font-mono text-xs" onFocus={e => e.currentTarget.select()} />
              <Button variant="outline" size="icon" onClick={() => info.pairCode && copyText(info.pairCode)} aria-label="کپی کد اتصال">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              این کد را یک‌بار روی گوشی (تنظیمات ← همگام‌سازی) وارد کنید. هر کسی این کد را داشته باشد به داده‌های شما دسترسی دارد؛ آن را جای عمومی نگذارید.
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm font-medium">آدرس‌های این کامپیوتر</p>
            {info.addresses.length === 0 ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1"><WifiOff className="w-3 h-3" />به هیچ شبکه‌ای وصل نیست.</p>
            ) : info.addresses.map(a => (
              <p key={a.url} className="text-xs text-muted-foreground" dir="ltr">
                {a.url} <span className="opacity-70">({a.kind === 'tailscale' ? 'Tailscale' : 'Wi-Fi / شبکه‌ی خانگی'})</span>
              </p>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={openWeb} className="gap-2">
              <Globe className="w-4 h-4" />باز کردن نسخه‌ی وب در مرورگر (برای تایپ صوتی)
            </Button>
            <Button variant="outline" onClick={rotate}>ساخت کد جدید</Button>
          </div>

          <ul className="text-xs text-muted-foreground list-disc pr-5 space-y-1">
            <li>بار اول، ویندوز ممکن است درباره‌ی «Firewall» سؤال کند؛ اجازه بدهید (شبکه‌ی خصوصی کافی است).</li>
            <li>اگر بیرون از خانه هستید، روی کامپیوتر و گوشی برنامه‌ی Tailscale را نصب و با یک حساب وارد کنید تا گوشی به کامپیوتر برسد.</li>
            <li>نسخه‌ی وب را حتماً از همین دکمه (آدرس 127.0.0.1) باز کنید؛ در آدرس‌های دیگر مرورگر میکروفون و تایپ صوتی را مسدود می‌کند.</li>
          </ul>
        </>
      )}
    </Shell>
  );
}

// ── گوشی و وب ───────────────────────────────────────────────────
function ClientSection() {
  const status = useSyncStatus();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const connect = async () => {
    setBusy(true);
    try {
      await syncManager.pair(code);
      setCode('');
      toast.success('به نرم‌افزار ویندوز وصل شد');
      void syncManager.syncNow('pair');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'اتصال انجام نشد');
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    const r = await syncManager.syncNow('manual');
    if (r.ok) toast.success('همگام‌سازی انجام شد');
    else if (r.unreachable) toast.error('نرم‌افزار ویندوز در دسترس نیست. برنامه را روی کامپیوتر باز کنید.');
    else toast.error(r.error ?? 'همگام‌سازی انجام نشد');
  };

  const resetAndSync = async () => {
    if (!window.confirm('همه‌ی داده‌ها دوباره با ویندوز مقایسه می‌شوند. چیزی پاک نمی‌شود، ولی ممکن است کمی طول بکشد. ادامه؟')) return;
    const r = await syncManager.resetAndSync();
    if (r.ok) toast.success('بررسی کامل انجام شد');
    else toast.error(r.error ?? 'انجام نشد');
  };

  const disconnect = () => {
    if (!window.confirm('اتصال قطع شود؟ داده‌های همین دستگاه پاک نمی‌شوند.')) return;
    syncManager.disconnect();
  };

  if (!status.configured) {
    return (
      <Shell description="تغییراتی که روی این دستگاه می‌دهید وقتی نرم‌افزار ویندوز روشن و باز باشد به آن منتقل می‌شود و تغییرات ویندوز هم به اینجا می‌آید.">
        <div className="space-y-2">
          <p className="text-sm font-medium">کد اتصال</p>
          <Textarea dir="ltr" rows={3} value={code} onChange={e => setCode(e.target.value)} placeholder="tm1.…" className="font-mono text-xs" />
          <p className="text-xs text-muted-foreground">
            در نرم‌افزار ویندوز: تنظیمات ← همگام‌سازی ← «کد اتصال گوشی» را کپی کنید (مثلاً در تلگرام برای خودتان بفرستید) و اینجا بچسبانید. گوشی و کامپیوتر باید در یک Wi-Fi باشند یا هر دو Tailscale داشته باشند.
          </p>
        </div>
        <Button onClick={connect} disabled={busy || !code.trim()} className="gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}اتصال
        </Button>
      </Shell>
    );
  }

  const r = status.lastResult;
  const phaseBadge = {
    syncing: <Badge variant="secondary" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" />در حال همگام‌سازی…</Badge>,
    ok: <Badge variant="secondary" className="gap-1"><CheckCircle2 className="w-3 h-3" />همگام</Badge>,
    unreachable: <Badge variant="outline" className="gap-1"><WifiOff className="w-3 h-3" />ویندوز در دسترس نیست</Badge>,
    error: <Badge variant="destructive" className="gap-1"><AlertTriangle className="w-3 h-3" />خطا</Badge>,
    idle: <Badge variant="outline">متصل</Badge>,
    unpaired: null,
  }[status.phase];

  return (
    <Shell description="تغییرات این دستگاه وقتی نرم‌افزار ویندوز روشن و باز باشد به آن منتقل می‌شود و برعکس.">
      <div className="flex flex-wrap items-center gap-2">{phaseBadge}</div>
      {status.phase === 'unreachable' && (
        <p className="text-xs text-muted-foreground">
          تغییرات شما در همین دستگاه ذخیره است و به‌محض باز شدن نرم‌افزار ویندوز (و دسترسی شبکه) خودکار منتقل می‌شود.
        </p>
      )}
      {status.error && <p className="text-xs text-destructive">{status.error}</p>}
      {r && (
        <p className="text-xs text-muted-foreground">
          آخرین همگام‌سازی موفق: {fmtTime(r.at)} — ارسال {r.rowsSent}، دریافت {r.inserted + r.updated + r.deleted}
          {r.blobsUp + r.blobsDown > 0 ? `، فایل/تصویر ${r.blobsUp + r.blobsDown}` : ''}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">همگام‌سازی خودکار</p>
          <p className="text-xs text-muted-foreground">هنگام باز کردن برنامه، برگشتن به آن و هر چند دقیقه.</p>
        </div>
        <Switch checked={status.autoSync} onCheckedChange={syncManager.setAutoSync} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={syncNow} disabled={status.phase === 'syncing'} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${status.phase === 'syncing' ? 'animate-spin' : ''}`} />همگام‌سازی الان
        </Button>
        <Button variant="outline" onClick={resetAndSync} disabled={status.phase === 'syncing'}>بررسی کامل از اول</Button>
        <Button variant="outline" onClick={disconnect}>قطع اتصال</Button>
      </div>
    </Shell>
  );
}

export function SyncSection() {
  return getDesktopApi() ? <DesktopHubSection /> : <ClientSection />;
}

