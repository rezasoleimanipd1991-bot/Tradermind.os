import { useId } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import type { Distribution, EquityPoint } from '../../services/dashboardOverview';
import { cn } from '../../lib/utils';

/** نمودارهای مشترک سیستم طراحی (Equity / P&L / توزیع). همه روی داده‌ی واقعی و توکن‌های تم. */

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
export const fmtSigned = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num.format(Math.abs(v))}`;
const axisTick = { fill: 'hsl(var(--muted-foreground))', fontSize: 11 };
const dateTick = (v: string) => v.slice(5).replace('-', '/');

/** محور X روی اندیس یکتا؛ چند معامله‌ی هم‌روز نباید روی هم بیفتند. برچسب تاریخ فقط در اولین معامله‌ی هر روز نمایش داده می‌شود. */
function indexed<T extends { date: string }>(data: T[]) {
  const pts = data.map((d, n) => ({ ...d, n }));
  const tick = (n: number) => {
    const cur = pts[n]?.date;
    if (!cur) return '';
    return n > 0 && pts[n - 1].date === cur ? '' : dateTick(cur);
  };
  return { pts, tick };
}

type TipPayload = Array<{ payload: { date: string; equity?: number; pnl?: number; symbol: string } }>;

function PointTooltip({ active, payload, field }: { active?: boolean; payload?: TipPayload; field: 'equity' | 'pnl' }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const v = (p[field] ?? 0) as number;
  return (
    <div className="tm-panel tm-panel-solid px-3 py-2 text-xs" dir="ltr">
      <div className="text-muted-foreground">{p.date} · {p.symbol}</div>
      <div className={cn('tm-num text-sm font-bold', v >= 0 ? 'tm-pos' : 'tm-neg')}>{fmtSigned(v)}</div>
    </div>
  );
}

function LastValueLabel({ viewBox, value }: { viewBox?: { x?: number; y?: number }; value: number }) {
  if (!viewBox || viewBox.x === undefined || viewBox.y === undefined) return null;
  const text = fmtSigned(value);
  const w = Math.max(44, text.length * 7.2 + 14);
  return (
    <g transform={`translate(${viewBox.x - w - 6}, ${viewBox.y - 30})`} aria-hidden>
      <rect width={w} height={22} rx={6} fill="hsl(var(--background))" stroke="hsl(var(--primary))" strokeOpacity={0.7} />
      <text x={w / 2} y={15} textAnchor="middle" fontSize={11} fontWeight={700} fill="hsl(var(--primary))">{text}</text>
    </g>
  );
}

export function EquityAreaChart({ data: raw, height = 300 }: { data: EquityPoint[]; height?: number }) {
  const gid = useId().replace(/:/g, '');
  const { pts: data, tick } = indexed(raw);
  return (
    // نمودارهای زمانی همیشه LTR‌اند تا در RTL معکوس نشوند
    <div dir="ltr" style={{ height }} className="w-full" role="img" aria-label="منحنی سرمایه">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 30, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`eq-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.45} vertical={false} />
          <XAxis dataKey="n" tickFormatter={tick} tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => num.format(v)} />
          <Tooltip content={<PointTooltip field="equity" />} cursor={{ stroke: 'hsl(var(--primary))', strokeOpacity: 0.4 }} />
          {data.length > 1 && (
            <ReferenceDot
              x={data[data.length - 1].n}
              y={data[data.length - 1].equity}
              r={4.5}
              fill="hsl(var(--primary))"
              stroke="hsl(var(--background))"
              strokeWidth={2}
              ifOverflow="extendDomain"
              label={<LastValueLabel value={data[data.length - 1].equity} />}
            />
          )}
          <Area type="linear" dataKey="equity" stroke="hsl(var(--primary))" strokeWidth={2} fill={`url(#eq-${gid})`}
            dot={false} activeDot={{ r: 4, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
            isAnimationActive animationDuration={450} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PnlBarChart({ data: raw, height = 220 }: { data: EquityPoint[]; height?: number }) {
  const { pts: data, tick } = indexed(raw);
  return (
    <div dir="ltr" style={{ height }} className="w-full" role="img" aria-label="سود و زیان هر معامله">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap="18%">
          <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.45} vertical={false} />
          <XAxis dataKey="n" tickFormatter={tick} tick={axisTick} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={20} />
          <YAxis tick={axisTick} axisLine={false} tickLine={false} width={48} tickFormatter={(v: number) => num.format(v)} />
          <ReferenceLine y={0} stroke="hsl(var(--foreground))" strokeOpacity={0.55} />
          <Tooltip content={<PointTooltip field="pnl" />} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
          <Bar dataKey="pnl" radius={[2, 2, 0, 0]} isAnimationActive animationDuration={450}>
            {data.map((p, i) => <Cell key={i} fill={p.pnl >= 0 ? 'hsl(var(--tm-positive))' : 'hsl(var(--tm-negative))'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const pct = (v: number) => `${v.toFixed(0)}%`;

export function DistributionDonut({ distribution: d, size = 170 }: { distribution: Distribution; size?: number }) {
  const rows = [
    { name: 'سودده', value: d.wins, color: 'hsl(var(--tm-positive))' },
    { name: 'ضرر', value: d.losses, color: 'hsl(var(--tm-negative))' },
    { name: 'سر به سر', value: d.breakeven, color: 'hsl(var(--muted-foreground) / 0.6)' },
  ];
  const share = (v: number) => (d.total ? (v / d.total) * 100 : 0);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }} dir="ltr" role="img" aria-label="توزیع نتایج معاملات">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows.filter((r) => r.value > 0)} dataKey="value" innerRadius="70%" outerRadius="100%" paddingAngle={2}
              stroke="none" startAngle={90} endAngle={-270} isAnimationActive animationDuration={450}>
              {rows.filter((r) => r.value > 0).map((r) => <Cell key={r.name} fill={r.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tm-num text-2xl font-bold text-foreground">{d.total}</span>
          <span className="text-[10px] text-muted-foreground">کل معاملات بسته</span>
        </div>
      </div>
      <ul className="w-full space-y-1.5 text-xs">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: r.color }} aria-hidden />
            <span className="flex-1 text-muted-foreground">{r.name}</span>
            <span className="tm-num font-semibold text-foreground">{pct(share(r.value))}</span>
            <span className="tm-num w-8 text-end text-muted-foreground">{r.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
