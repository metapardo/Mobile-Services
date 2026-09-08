import { useState } from 'react';
import { Card } from '@workspace/blue-glass-design-system/components/ui/card';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, subMonths, format,
} from 'date-fns';
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  useListBookings, useListPackages, useGetFinancialReport, getGetFinancialReportQueryKey,
  type FinancialReportResult,
} from '@workspace/api-client-react';
import { adaptBooking, isoDateOnly } from '@/lib/api-adapters';

// ─── Types ────────────────────────────────────────────────────────────────────
type Period = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';
type FinancialPeriod = 'monthly' | 'quarterly' | 'annual';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt$ = (n: number, decimals = 0) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const fmtPct = (n: number) => n.toFixed(1) + '%';

/** "2026-09" -> "September 2026" (or a custom date-fns format string). */
function formatYm(ym: string, formatStr = 'MMMM yyyy') {
  const [y, m] = ym.split('-').map(Number);
  return format(new Date(y, m - 1, 1), formatStr);
}

/** Human-readable top-of-tab label, e.g. "September 2026" / "Trailing 3 months
 * (Jul 2026 – Sep 2026)" / "Year to date (Jan 2026 – Sep 2026)". */
function getPeriodLabel(period: FinancialPeriod, months: string[]): string {
  if (months.length === 0) return '';
  if (period === 'monthly') return formatYm(months[0]);
  const prefix = period === 'quarterly' ? `Trailing ${months.length} months` : 'Year to date';
  return `${prefix} (${formatYm(months[0], 'MMM yyyy')} – ${formatYm(months[months.length - 1], 'MMM yyyy')})`;
}

/** Raw `YYYY-MM` range label used repeatedly inside card subtitles, matching the
 * app's existing convention of showing the underlying months verbatim there. */
function monthsRangeLabel(months: string[]): string {
  if (months.length === 0) return '';
  if (months.length === 1) return months[0];
  return `Trailing ${months.length} months (${months[0]} – ${months[months.length - 1]})`;
}

function LoadingCard() {
  return (
    <Card className="p-8 flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
    </Card>
  );
}

function ErrorCard() {
  return (
    <Card className="p-8 text-center space-y-2">
      <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
      <p className="text-[15px] font-semibold">Couldn't load report data</p>
      <p className="text-[13px] text-muted-foreground">Check your connection and try again.</p>
    </Card>
  );
}

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

  const rangeStart = period === 'daily' ? dayStr : format(weekStart, 'yyyy-MM-dd');
  const rangeEnd   = period === 'daily' ? dayStr : format(weekEnd,   'yyyy-MM-dd');

  // Real data — FR-9: scoped to the visible day/week via GET /bookings' start/end
  // params, same as calendar.tsx's convention.
  const bookingsQuery = useListBookings({ start: rangeStart, end: rangeEnd });
  const packagesQuery = useListPackages({ includeArchived: true });

  const loadFailed = bookingsQuery.isError || packagesQuery.isError;
  const isLoading  = bookingsQuery.isLoading || packagesQuery.isLoading;

  const packages = packagesQuery.data ?? [];
  const bookings = (bookingsQuery.data ?? []).map(adaptBooking);

  const relevant = bookings.filter(b => {
    if (b.status === 'cancelled' || b.status === 'no-show') return false;
    return b.date >= rangeStart && b.date <= rangeEnd;
  });

  const revenue = relevant.reduce((s, b) =>
    s + b.packageIds.reduce((ps, id) => ps + (packages.find(p => p.id === id)?.price ?? 0), 0), 0);
  const jobs = relevant.length;
  const avgTicket = jobs > 0 ? revenue / jobs : 0;
  const completed = relevant.filter(b => b.status === 'completed').length;

  // Est. Gross Margin: hardcoded 38.9% constant, unchanged — no real per-booking
  // cost data (labor/materials/gas per job) exists yet to replace it with.
  const gm = revenue > 0 ? revenue * 0.389 : 0;
  const gmPct = revenue > 0 ? 38.9 : 0;

  const periodLabel = period === 'daily'
    ? format(now, 'EEEE, MMMM d')
    : `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;

  if (loadFailed) return <ErrorCard />;
  if (isLoading) return <LoadingCard />;

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
function FinancialView({ report, periodLabel }: { report: FinancialReportResult; periodLabel: string }) {
  const monthsLabel = monthsRangeLabel(report.months);
  const maxPkgRev = report.packageMix.length > 0
    ? Math.max(...report.packageMix.map(p => p.revenue))
    : 0;

  // "Where the money goes" cost breakdown. Card processing is dropped entirely —
  // Checkout only supports zelle/venmo/cash, so there's no card-fee line to show.
  const costItems = [
    { label: 'Labor (commission)', value: report.cogs.labor },
    { label: 'Operating expenses', value: report.opex.total },
    { label: 'Materials & supplies', value: report.cogs.materials },
    { label: 'Gas', value: report.cogs.gas },
    { label: 'Interest & tax', value: report.interest + report.tax },
  ];
  const totalCosts = costItems.reduce((s, c) => s + c.value, 0);
  const COLORS = ['#3654FF', '#7C3AED', '#06B6D4', '#1E9E62', '#D9A404'];

  const empRevenue = report.revenueByEmployee.map(e => ({
    name: e.name.split(' ')[0],
    revenue: e.revenue,
  }));

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
          value={fmt$(report.revenue)}
          sub={report.months.length > 1 ? `Trailing ${report.months.length} months` : report.months[0]}
        />
        <StatCard
          label="Gross Margin"
          value={fmtPct(report.grossMarginPct)}
          sub={`${fmt$(report.grossProfit)} gross profit`}
        />
        <StatCard
          label="Net Margin"
          value={fmtPct(report.netMarginPct)}
          sub={`${fmt$(report.netIncome)} net income`}
        />
        <StatCard
          label="Jobs Completed"
          value={report.jobs.toLocaleString()}
          sub={`avg ticket ${fmt$(report.avgTicket)}`}
        />
        <StatCard
          label="Cash on Hand"
          value={fmt$(report.balanceSheet.cash)}
          sub={`as of ${isoDateOnly(report.balanceSheet.asOf)}`}
          accent
        />
        <StatCard
          label="Total Liabilities"
          value={fmt$(report.balanceSheet.totalLiabilities)}
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
          <AreaChart data={report.trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
            <div className="relative w-full h-full">
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
          <p className="text-[12px] text-muted-foreground">{monthsLabel}</p>
        </div>
        <div>
          {report.packageMix.length > 0
            ? report.packageMix.map(p => (
                <PkgBar key={p.packageId} name={p.name} rev={p.revenue} jobs={p.jobs} maxRev={maxPkgRev} />
              ))
            : <p className="text-[13px] text-muted-foreground text-center py-4">No completed bookings this period</p>}
        </div>
      </Card>

      {/* Income statement */}
      <Card className="p-4">
        <div className="mb-3">
          <p className="text-[15px] font-semibold">Income statement</p>
          <p className="text-[12px] text-muted-foreground">{monthsLabel}</p>
        </div>
        <div className="divide-y-0">
          <p className="text-[13px] font-semibold mt-1 mb-0.5">Revenue</p>
          <LedgerRow label="Service revenue" value={report.revenue} indent />

          <p className="text-[13px] font-semibold mt-3 mb-0.5">Cost of service</p>
          <LedgerRow label="Labor (commission)" value={report.cogs.labor} indent />
          <LedgerRow label="Materials & supplies" value={report.cogs.materials} indent />
          <LedgerRow label="Gas" value={report.cogs.gas} indent />
          <LedgerRow label={`Gross profit (${fmtPct(report.grossMarginPct)})`} value={report.grossProfit} bold />

          <p className="text-[13px] font-semibold mt-3 mb-0.5">Operating expenses</p>
          <LedgerRow label="Insurance" value={report.opex.insurance} indent />
          <LedgerRow label="Vehicle maintenance" value={report.opex.vehicleMaint} indent />
          <LedgerRow label="Software & subscriptions" value={report.opex.software} indent />
          <LedgerRow label="Marketing" value={report.opex.marketing} indent />
          <LedgerRow label="Admin wages" value={report.opex.adminWages} indent />
          <LedgerRow label={`Operating income (${fmtPct(report.operatingMarginPct)})`} value={report.operatingIncome} bold />

          <LedgerRow label="Interest expense" value={report.interest} indent />
          <LedgerRow label="Income tax (illustrative 25%)" value={report.tax} indent />
          <LedgerRow label={`Net income (${fmtPct(report.netMarginPct)})`} value={report.netIncome} bold green />
        </div>
      </Card>

      {/* Balance sheet */}
      <Card className="p-4">
        <div className="mb-3">
          <p className="text-[15px] font-semibold">Balance sheet</p>
          <p className="text-[12px] text-muted-foreground">as of {isoDateOnly(report.balanceSheet.asOf)}</p>
        </div>
        <p className="text-[13px] font-semibold mt-1 mb-0.5">Assets</p>
        <LedgerRow label="Cash" value={report.balanceSheet.cash} indent />
        <LedgerRow label="Accounts receivable" value={report.balanceSheet.accountsReceivable} indent />
        <LedgerRow label="Prepaid expenses" value={report.balanceSheet.prepaidExpenses} indent />
        <LedgerRow label="Total current assets" value={report.balanceSheet.totalCurrentAssets} muted indent />
        <LedgerRow label="Vehicle (net of depreciation)" value={report.balanceSheet.vehicleNet} indent />
        <LedgerRow label="Equipment (net of depreciation)" value={report.balanceSheet.equipmentNet} indent />
        <LedgerRow label="Total assets" value={report.balanceSheet.totalAssets} bold />

        <p className="text-[13px] font-semibold mt-3 mb-0.5">Liabilities</p>
        <LedgerRow label="Accounts payable" value={report.balanceSheet.accountsPayable} indent />
        <LedgerRow label="Vehicle loan balance" value={report.balanceSheet.vehicleLoanBalance} indent />
        <LedgerRow label="Total liabilities" value={report.balanceSheet.totalLiabilities} muted indent />

        <p className="text-[13px] font-semibold mt-3 mb-0.5">Equity</p>
        <LedgerRow label="Owner's equity" value={report.balanceSheet.ownersEquity} bold />
      </Card>

      {/* Cash flow */}
      <Card className="p-4">
        <div className="mb-3">
          <p className="text-[15px] font-semibold">Cash flow</p>
          <p className="text-[12px] text-muted-foreground">{monthsLabel}</p>
        </div>
        <p className="text-[13px] font-semibold mt-1 mb-0.5">Operating activities</p>
        <LedgerRow label="Net income"              value={report.cashFlow.netIncome} indent />
        <LedgerRow label="Depreciation"            value={report.cashFlow.depreciation} indent />
        <LedgerRow label="Change in receivables"   value={report.cashFlow.changeReceivables} indent negative={report.cashFlow.changeReceivables < 0} />
        <LedgerRow label="Change in payables"      value={report.cashFlow.changePayables} indent negative={report.cashFlow.changePayables < 0} />
        <LedgerRow label="Cash from operations"    value={report.cashFlow.cashFromOperations} bold />

        <p className="text-[13px] font-semibold mt-3 mb-0.5">Financing activities</p>
        <LedgerRow label="Loan principal payments" value={report.cashFlow.loanPayments} indent negative />
        <LedgerRow label="Owner draws"             value={report.cashFlow.ownerDraws} indent negative />
        <LedgerRow label="Cash from financing"     value={report.cashFlow.cashFromFinancing} bold negative />

        <p className="text-[13px] font-semibold mt-3 mb-0.5">Net change</p>
        <LedgerRow label="Net change in cash" value={report.cashFlow.netChange} indent green={report.cashFlow.netChange > 0} />
        <LedgerRow label="Cash, beginning"    value={report.cashFlow.cashBeginning} indent />
        <LedgerRow label="Cash, ending"       value={report.cashFlow.cashEnding} bold green />
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
              <Bar dataKey="revenue" radius={[0, 4, 4, 0]} fill="#3654FF" />
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

  const isFinancial = period === 'monthly' || period === 'quarterly' || period === 'annual';

  // Real period boundaries for the Financial View — Monthly is the current
  // calendar month, Quarterly is the trailing 3 calendar months, Annual is
  // year-to-date. `GET /reports/financials` computes everything else.
  const now = new Date();
  let financialStart = now;
  let financialEnd = now;
  if (period === 'monthly') {
    financialStart = startOfMonth(now);
    financialEnd = endOfMonth(now);
  } else if (period === 'quarterly') {
    financialStart = startOfMonth(subMonths(now, 2));
    financialEnd = endOfMonth(now);
  } else if (period === 'annual') {
    financialStart = startOfYear(now);
    financialEnd = endOfMonth(now);
  }

  const financialReportParams = {
    start: format(financialStart, 'yyyy-MM-dd'),
    end: format(financialEnd, 'yyyy-MM-dd'),
  };
  const financialReportQuery = useGetFinancialReport(
    financialReportParams,
    {
      query: {
        queryKey: getGetFinancialReportQueryKey(financialReportParams),
        enabled: isFinancial,
      },
    },
  );

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
        {isFinancial && (
          financialReportQuery.isError ? <ErrorCard /> :
          financialReportQuery.isLoading || !financialReportQuery.data ? <LoadingCard /> :
          <FinancialView
            report={financialReportQuery.data}
            periodLabel={getPeriodLabel(period as FinancialPeriod, financialReportQuery.data.months)}
          />
        )}
      </div>
    </div>
  );
}
