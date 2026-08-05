import { useState } from 'react';
import { bookings, packages, employees } from '@/lib/mock-data';
import { Card } from '@/components/ui/card';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts';
import {
  startOfWeek, endOfWeek, format, isToday,
} from 'date-fns';
import {
  MONTHLY_SUMMARY, QUARTERLY_SUMMARY, ANNUAL_SUMMARY,
  getTrendData, getCashFlow, BALANCE_SHEET,
  type PeriodSummary,
} from '@/lib/reporting-data';

// ─── Types ────────────────────────────────────────────────────────────────────
type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt$ = (n: number, decimals = 0) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const fmtPct = (n: number) => n.toFixed(1) + '%';

function StatCard({
  label, value, sub, accent = false,
}: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-[22px] font-bold tabular-nums leading-tight ${accent ? 'text-primary' : ''}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </Card>
  );
}

// Ledger row for income/balance statements
function LedgerRow({
  label, value, bold = false, indent = false, muted = false, green = false, negative = false,
}: {
  label: string; value: string | number; bold?: boolean; indent?: boolean;
  muted?: boolean; green?: boolean; negative?: boolean;
}) {
  const fmtVal = typeof value === 'number'
    ? (value < 0 ? '-' + fmt$(Math.abs(value)) : fmt$(value))
    : value;

  return (
    <div className={`flex justify-between py-2 ${indent ? 'pl-4' : ''} ${bold ? 'border-t border-border/70 mt-1' : ''}`}>
      <span className={`text-[13px] ${bold ? 'font-semibold' : ''} ${muted ? 'text-muted-foreground' : ''}`}>{label}</span>
      <span className={`text-[13px] tabular-nums ${bold ? 'font-semibold' : ''} ${green ? 'text-green-600 font-semibold' : ''} ${negative ? 'text-muted-foreground' : ''}`}>
        {fmtVal}
      </span>
    </div>
  );
}

// Horizontal bar for package mix
function PkgBar({ name, rev, jobs, maxRev }: { name: string; rev: number; jobs: number; maxRev: number }) {
  const pct = maxRev > 0 ? (rev / maxRev) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border/40 last:border-0">
      <span className="text-[13px] w-36 shrink-0 truncate">{name}</span>
      <div className="flex-1 bg-muted rounded-full h-2">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="text-right shrink-0 min-w-[80px]">
        <span className="text-[13px] font-medium tabular-nums">{fmt$(rev)}</span>
        <span className="text-[11px] text-muted-foreground ml-1">· {jobs}</span>
      </div>
    </div>
  );
}

// ─── Daily / Weekly (operational only) ────────────────────────────────────────
function OperationalView({ period }: { period: 'daily' | 'weekly' }) {
  const now = new Date();
  const dayStr = format(now, 'yyyy-MM-dd');
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd   = endOfWeek(now,   { weekStartsOn: 1 });

  const relevant = bookings.filter(b => {
    if (b.status === 'cancelled' || b.status === 'no-show') return false;
    if (period === 'daily') return b.date === dayStr;
    return b.date >= format(weekStart, 'yyyy-MM-dd') && b.date <= format(weekEnd, 'yyyy-MM-dd');
  });

  const revenue = relevant.reduce((s, b) =>
    s + b.packageIds.reduce((ps, id) => ps + (packages.find(p => p.id === id)?.price ?? 0), 0), 0);
  const jobs = relevant.length;
  const avgTicket = jobs > 0 ? revenue / jobs : 0;
  const completed = relevant.filter(b => b.status === 'completed').length;

  // Gross margin approx from synthetic rates
  const gm = revenue > 0 ? revenue * 0.389 : 0;
  const gmPct = revenue > 0 ? 38.9 : 0;

  const periodLabel = period === 'daily'
    ? format(now, 'EEEE, MMMM d')
    : `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">{periodLabel}</p>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-[13px] text-amber-800">
        Day-to-day, watch <strong>jobs booked</strong> and <strong>gross margin</strong>. Profit, overhead, and cash
        are only meaningful monthly or longer — switch to Monthly or Quarterly for the full picture.
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Jobs Booked" value={String(jobs)} sub={`${completed} completed`} />
        <StatCard label="Revenue" value={fmt$(revenue)} sub="confirmed bookings" />
        <StatCard label="Avg Ticket" value={fmt$(avgTicket)} />
        <StatCard label="Est. Gross Margin" value={fmtPct(gmPct)} sub={`~${fmt$(gm)} gross profit`} />
      </div>

      {/* Today's jobs */}
      {relevant.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
            <p className="text-[13px] font-semibold">Bookings</p>
          </div>
          <div className="divide-y divide-border/40">
            {relevant.map(b => {
              const pkgNames = b.packageIds.map(id => packages.find(p => p.id === id)?.name ?? '').join(', ');
              const rev = b.packageIds.reduce((s, id) => s + (packages.find(p => p.id === id)?.price ?? 0), 0);
              return (
                <div key={b.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium">{b.startTime} · {pkgNames}</p>
                    <p className="text-[12px] text-muted-foreground">{b.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-semibold tabular-nums">{fmt$(rev)}</p>
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${
                      b.status === 'completed' ? 'bg-green-100 text-green-700' :
                      b.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>{b.status}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      {relevant.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground text-[14px]">No bookings {period === 'daily' ? 'today' : 'this week'}</p>
        </Card>
      )}
    </div>
  );
}

// ─── Full financial view (monthly / quarterly / annual) ───────────────────────
function FinancialView({ summary, periodLabel }: { summary: PeriodSummary; periodLabel: string }) {
  const trendData  = getTrendData();
  const cashFlow   = getCashFlow(summary);
  const maxPkgRev  = Math.max(...summary.pkgMix.map(p => p.revenue));

  // Revenue by employee from live bookings (best-effort from real data)
  const empRevenue = employees.map(emp => {
    const empBookings = bookings.filter(
      b => b.status === 'completed' && b.employeeIds.includes(emp.id)
    );
    const rev = empBookings.reduce((s, b) => {
      const total = b.packageIds.reduce((ps, id) => ps + (packages.find(p => p.id === id)?.price ?? 0), 0);
      const split = b.employeeSplit.find(sp => sp.employeeId === emp.id);
      return s + total * (split?.percentage ?? 100) / 100;
    }, 0);
    return { name: emp.name.split(' ')[0], revenue: rev, color: emp.color };
  }).filter(e => e.revenue > 0);

  // "Where the money goes" cost breakdown
  const costItems = [
    { label: 'Labor (commission)', value: summary.labor },
    { label: 'Operating expenses', value: summary.totalOpex },
    { label: 'Materials & supplies', value: summary.materials },
    { label: 'Gas', value: summary.gas },
    { label: 'Card processing', value: summary.cardFees },
    { label: 'Interest & tax', value: summary.interest + summary.tax },
  ];
  const totalCosts = costItems.reduce((s, c) => s + c.value, 0);
  const COLORS = ['#3654FF', '#7C3AED', '#06B6D4', '#1E9E62', '#D9A404', '#DC2626'];

  return (
    <div className="space-y-5">
      {/* Context banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-[13px] text-blue-800 leading-relaxed">
        <strong>Full financial view.</strong> {periodLabel} — includes overhead, taxes, and cash position, not just bookings.
      </div>

      {/* 6 KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Revenue"
          value={fmt$(summary.revenue)}
          sub={`${summary.months.length > 1 ? 'Trailing ' + summary.months.length + ' months' : summary.months[0]}`}
        />
        <StatCard
          label="Gross Margin"
          value={fmtPct(summary.grossMarginPct)}
          sub={`${fmt$(summary.grossProfit)} gross profit`}
        />
        <StatCard
          label="Net Margin"
          value={fmtPct(summary.netMarginPct)}
          sub={`${fmt$(summary.netIncome)} net income`}
        />
        <StatCard
          label="Jobs Completed"
          value={summary.jobs.toLocaleString()}
          sub={`avg ticket ${fmt$(summary.avgTicket)}`}
        />
        <StatCard
          label="Cash on Hand"
          value={fmt$(BALANCE_SHEET.cash)}
          sub={`as of ${BALANCE_SHEET.asOf}`}
          accent
        />
        <StatCard
          label="Total Liabilities"
          value={fmt$(BALANCE_SHEET.totalLiabilities)}
          sub="loan + payables"
        />
      </div>

      {/* Revenue & net income trend */}
      <Card className="p-4">
        <div className="mb-3">
          <p className="text-[15px] font-semibold">Revenue &amp; net income trend</p>
          <p className="text-[12px] text-muted-foreground">6-month history, monthly</p>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3654FF" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#3654FF" stopOpacity={0}    />
              </linearGradient>
              <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#1E9E62" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#1E9E62" stopOpacity={0}    />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
              tickFormatter={v => '$' + (v / 1000).toFixed(0) + 'k'} />
            <Tooltip
              formatter={(val: number, name: string) => [fmt$(val), name === 'revenue' ? 'Revenue' : 'Net Income']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)' }}
            />
            <Area type="monotone" dataKey="revenue"   stroke="#3654FF" strokeWidth={2} fill="url(#revGrad)" dot={false} />
            <Area type="monotone" dataKey="netIncome" stroke="#1E9E62" strokeWidth={2} fill="url(#netGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-1 justify-center">
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-3 h-0.5 bg-primary inline-block rounded" /> Revenue
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-3 h-0.5 bg-green-500 inline-block rounded" /> Net Income
          </span>
        </div>
      </Card>

      {/* Where the money goes */}
      <Card className="p-4">
        <div className="mb-3">
          <p className="text-[15px] font-semibold">Where the money goes</p>
          <p className="text-[12px] text-muted-foreground">cost breakdown, selected period</p>
        </div>
        <div className="flex gap-4 items-center">
          <div style={{ width: 130, height: 130, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[{ name: '' }]} layout="vertical" margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                {/* Fake pie with bar segments — use a real PieChart instead */}
              </BarChart>
            </ResponsiveContainer>
            {/* Use a donut via CSS */}
            <div className="relative w-full h-full" style={{ marginTop: -130 }}>
              <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                {(() => {
                  let offset = 0;
                  return costItems.map((item, i) => {
                    const pct = totalCosts > 0 ? (item.value / totalCosts) * 100 : 0;
                    const dashArray = `${pct} ${100 - pct}`;
                    const el = (
                      <circle key={i} cx="18" cy="18" r="15.915"
                        fill="none" stroke={COLORS[i]} strokeWidth="3.5"
                        strokeDasharray={dashArray} strokeDashoffset={-offset}
                      />
                    );
                    offset += pct;
                    return el;
                  });
                })()}
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground leading-tight">Total</p>
                  <p className="text-[12px] font-bold">{fmt$(totalCosts)}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            {costItems.map((item, i) => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i] }} />
                <span className="text-[12px] flex-1 truncate">{item.label}</span>
                <span className="text-[12px] font-medium tabular-nums">{fmt$(item.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Package mix */}
      <Card className="p-4">
        <div className="mb-3">
          <p className="text-[15px] font-semibold">Package mix</p>
          <p className="text-[12px] text-muted-foreground">
            {summary.months.length > 1
              ? `Trailing ${summary.months.length} months (${summary.months[0]} – ${summary.months[summary.months.length - 1]})`
              : summary.months[0]}
          </p>
        </div>
        <div>
          {summary.pkgMix.map(p => (
            <PkgBar key={p.name} name={p.name} rev={p.revenue} jobs={p.jobs} maxRev={maxPkgRev} />
          ))}
        </div>
      </Card>

      {/* Income statement */}
      <Card className="p-4">
        <div className="mb-3">
          <p className="text-[15px] font-semibold">Income statement</p>
          <p className="text-[12px] text-muted-foreground">
            {summary.months.length > 1
              ? `Trailing ${summary.months.length} months (${summary.months[0]} – ${summary.months[summary.months.length - 1]})`
              : summary.months[0]}
          </p>
        </div>
        <div className="divide-y-0">
          <p className="text-[13px] font-semibold mt-1 mb-0.5">Revenue</p>
          <LedgerRow label="Service revenue" value={summary.revenue} indent />
          <LedgerRow label="Tips (pass-through, not income)" value={summary.tips} indent muted />

          <p className="text-[13px] font-semibold mt-3 mb-0.5">Cost of service</p>
          <LedgerRow label="Labor (commission)" value={summary.labor} indent />
          <LedgerRow label="Materials & supplies" value={summary.materials} indent />
          <LedgerRow label="Gas" value={summary.gas} indent />
          <LedgerRow label="Card processing fees" value={summary.cardFees} indent />
          <LedgerRow label={`Gross profit (${fmtPct(summary.grossMarginPct)})`} value={summary.grossProfit} bold />

          <p className="text-[13px] font-semibold mt-3 mb-0.5">Operating expenses</p>
          <LedgerRow label="Insurance" value={summary.insurance} indent />
          <LedgerRow label="Vehicle maintenance" value={summary.vehicleMaint} indent />
          <LedgerRow label="Software & subscriptions" value={summary.software} indent />
          <LedgerRow label="Marketing" value={summary.marketing} indent />
          <LedgerRow label="Admin wages" value={summary.adminWages} indent />
          <LedgerRow label={`Operating income (${fmtPct(summary.operatingMarginPct)})`} value={summary.operatingIncome} bold />

          <LedgerRow label="Interest expense" value={summary.interest} indent />
          <LedgerRow label="Income tax (illustrative 25%)" value={summary.tax} indent />
          <LedgerRow label={`Net income (${fmtPct(summary.netMarginPct)})`} value={summary.netIncome} bold green />
        </div>
      </Card>

      {/* Balance sheet */}
      <Card className="p-4">
        <div className="mb-3">
          <p className="text-[15px] font-semibold">Balance sheet</p>
          <p className="text-[12px] text-muted-foreground">as of {BALANCE_SHEET.asOf}</p>
        </div>
        <p className="text-[13px] font-semibold mt-1 mb-0.5">Assets</p>
        <LedgerRow label="Cash" value={BALANCE_SHEET.cash} indent />
        <LedgerRow label="Accounts receivable" value={BALANCE_SHEET.accountsReceivable} indent />
        <LedgerRow label="Prepaid expenses" value={BALANCE_SHEET.prepaidExpenses} indent />
        <LedgerRow label="Total current assets" value={BALANCE_SHEET.totalCurrentAssets} muted indent />
        <LedgerRow label="Vehicle (net of depreciation)" value={BALANCE_SHEET.vehicleNet} indent />
        <LedgerRow label="Equipment (net of depreciation)" value={BALANCE_SHEET.equipmentNet} indent />
        <LedgerRow label="Total assets" value={BALANCE_SHEET.totalAssets} bold />

        <p className="text-[13px] font-semibold mt-3 mb-0.5">Liabilities</p>
        <LedgerRow label="Accounts payable" value={BALANCE_SHEET.accountsPayable} indent />
        <LedgerRow label="Vehicle loan balance" value={BALANCE_SHEET.vehicleLoanBalance} indent />
        <LedgerRow label="Total liabilities" value={BALANCE_SHEET.totalLiabilities} muted indent />

        <p className="text-[13px] font-semibold mt-3 mb-0.5">Equity</p>
        <LedgerRow label="Owner's equity" value={BALANCE_SHEET.ownersEquity} bold />
      </Card>

      {/* Cash flow */}
      <Card className="p-4">
        <div className="mb-3">
          <p className="text-[15px] font-semibold">Cash flow</p>
          <p className="text-[12px] text-muted-foreground">
            {summary.months.length > 1
              ? `Trailing ${summary.months.length} months (${summary.months[0]} – ${summary.months[summary.months.length - 1]})`
              : summary.months[0]}
          </p>
        </div>
        <p className="text-[13px] font-semibold mt-1 mb-0.5">Operating activities</p>
        <LedgerRow label="Net income"              value={cashFlow.netIncome} indent />
        <LedgerRow label="Depreciation"            value={cashFlow.depreciation} indent />
        <LedgerRow label="Change in receivables"   value={cashFlow.changeReceivables} indent negative={cashFlow.changeReceivables < 0} />
        <LedgerRow label="Change in payables"      value={cashFlow.changePayables} indent negative={cashFlow.changePayables < 0} />
        <LedgerRow label="Cash from operations"    value={cashFlow.cashFromOperations} bold />

        <p className="text-[13px] font-semibold mt-3 mb-0.5">Financing activities</p>
        <LedgerRow label="Loan principal payments" value={cashFlow.loanPayments} indent negative />
        <LedgerRow label="Owner draws"             value={cashFlow.ownerDraws} indent negative />
        <LedgerRow label="Cash from financing"     value={cashFlow.cashFromFinancing} bold negative />

        <p className="text-[13px] font-semibold mt-3 mb-0.5">Net change</p>
        <LedgerRow label="Net change in cash" value={cashFlow.netChange} indent green={cashFlow.netChange > 0} />
        <LedgerRow label="Cash, beginning"    value={cashFlow.cashBeginning} indent />
        <LedgerRow label="Cash, ending"       value={cashFlow.cashEnding} bold green />
      </Card>

      {/* ── Revenue by employee (bottom) ── */}
      {empRevenue.length > 0 && (
        <Card className="p-4">
          <p className="text-[15px] font-semibold mb-3">Revenue by employee</p>
          <p className="text-[12px] text-muted-foreground mb-3">From completed bookings in app</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={empRevenue} layout="vertical" margin={{ left: 0, right: 16, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => '$' + v} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} width={52} />
              <Tooltip formatter={(v: number) => [fmt$(v, 2), 'Revenue']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                {empRevenue.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Reporting() {
  const [period, setPeriod] = useState<Period>('quarterly');

  const TABS: { key: Period; label: string }[] = [
    { key: 'daily',     label: 'Daily'     },
    { key: 'weekly',    label: 'Weekly'    },
    { key: 'monthly',   label: 'Monthly'   },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'annual',    label: 'Annual'    },
  ];

  const getFinancialSummary = () => {
    if (period === 'monthly')   return { summary: MONTHLY_SUMMARY,   label: 'July 2026' };
    if (period === 'quarterly') return { summary: QUARTERLY_SUMMARY, label: 'Trailing 3 months (2026-05 – 2026-07)' };
    return { summary: ANNUAL_SUMMARY, label: 'Year to date (2026-01 – 2026-07)' };
  };

  const isFinancial = period === 'monthly' || period === 'quarterly' || period === 'annual';

  return (
    <div className="min-h-[100dvh] pb-24 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <h1 className="text-2xl font-semibold mb-5">Reports</h1>

        {/* Period tabs */}
        <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1 -mx-1 px-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setPeriod(t.key)}
              className={`px-4 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                period === t.key
                  ? 'bg-primary text-white'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {!isFinancial && <OperationalView period={period as 'daily' | 'weekly'} />}
        {isFinancial && (() => {
          const { summary, label } = getFinancialSummary();
          return <FinancialView summary={summary} periodLabel={label} />;
        })()}
      </div>
    </div>
  );
}
