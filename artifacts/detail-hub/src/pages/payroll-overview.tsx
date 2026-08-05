import { useState } from 'react';
import { Link } from 'wouter';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, addDays } from 'date-fns';
import { Users, Clock, CalendarOff, DollarSign, ChevronRight, Play } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { calcPayrollSummary, payrollRuns, pendingTimeOffCount } from '@/lib/payroll-data';

type Period = 'current-week' | 'last-week' | 'month';

function getPeriodRange(period: Period) {
  const now = new Date();
  if (period === 'current-week') return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
  if (period === 'last-week') { const lw = subWeeks(now, 1); return { start: startOfWeek(lw, { weekStartsOn: 1 }), end: endOfWeek(lw, { weekStartsOn: 1 }) }; }
  return { start: startOfMonth(now), end: endOfMonth(now) };
}

export default function PayrollOverview() {
  const [period, setPeriod] = useState<Period>('current-week');
  const { start, end } = getPeriodRange(period);
  const [, rerender] = useState(0);
  const pendingCount = pendingTimeOffCount();

  const summaries = calcPayrollSummary(start, end);
  const totalGross = summaries.reduce((s, e) => s + e.gross_pay, 0);
  const totalNet   = summaries.reduce((s, e) => s + e.net_pay, 0);

  const periodLabel =
    period === 'current-week' ? `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}` :
    period === 'last-week'    ? `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}` :
    format(start, 'MMMM yyyy');

  const hubs = [
    { label: 'Team & Pay',    sub: 'Roles and pay rates',       icon: Users,       href: '/more/payroll/team'          },
    { label: 'Time Off',      sub: pendingCount > 0 ? `${pendingCount} pending` : 'Requests & history', icon: CalendarOff, href: '/more/payroll/time-off', badge: pendingCount },
    { label: 'Time Tracking', sub: 'Hours logged by employee',  icon: Clock,       href: '/more/payroll/time-tracking' },
    { label: 'Run Payroll',   sub: 'Pay your team',             icon: Play,        href: '/more/payroll/run'           },
  ];

  const recentRuns = [...payrollRuns].sort((a, b) => b.id - a.id).slice(0, 3);

  return (
    <div className="min-h-[100dvh] pb-24 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Team Payroll</h1>
          <p className="text-[14px] text-muted-foreground mt-0.5">{periodLabel}</p>
        </div>

        {/* Period tabs */}
        <div className="flex gap-2 mb-6">
          {(['current-week', 'last-week', 'month'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => { setPeriod(p); rerender(n => n + 1); }}
              className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                period === p ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {p === 'current-week' ? 'This Week' : p === 'last-week' ? 'Last Week' : 'This Month'}
            </button>
          ))}
        </div>

        {/* Totals */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <Card className="p-4">
            <p className="text-[12px] text-muted-foreground mb-1 uppercase tracking-wide">Gross Payroll</p>
            <p className="text-2xl font-semibold tabular-nums">${totalGross.toFixed(2)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[12px] text-muted-foreground mb-1 uppercase tracking-wide">Net Payroll</p>
            <p className="text-2xl font-semibold tabular-nums">${totalNet.toFixed(2)}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">After 20% illustrative deduction</p>
          </Card>
        </div>

        {/* Per-employee summary */}
        <Card className="mb-6 overflow-hidden">
          <div className="px-4 py-3 border-b border-border/50">
            <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide">Employee Summary</p>
          </div>
          <div className="divide-y divide-border/50">
            {summaries.map(s => (
              <div key={s.employee_id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium truncate">{s.name}</p>
                </div>
                <div className="text-right shrink-0 space-y-0.5">
                  {s.hourly_pay > 0 && (
                    <p className="text-[12px] text-muted-foreground tabular-nums">
                      Hourly ${s.hourly_pay.toFixed(2)}
                    </p>
                  )}
                  {s.commission_pay > 0 && (
                    <p className="text-[12px] text-muted-foreground tabular-nums">
                      Commission ${s.commission_pay.toFixed(2)}
                    </p>
                  )}
                  <p className="text-[14px] font-semibold tabular-nums">${s.gross_pay.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Hub entry cards */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          {hubs.map(h => {
            const Icon = h.icon;
            return (
              <Link key={h.href} href={h.href}>
                <Card className="p-4 hover:brightness-95 transition-all cursor-pointer">
                  <div className="flex items-start justify-between mb-2">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4.5 h-4.5 text-primary" style={{ width: 18, height: 18 }} />
                    </div>
                    {h.badge && h.badge > 0 ? (
                      <span className="text-[11px] font-semibold bg-primary text-white rounded-full w-5 h-5 flex items-center justify-center">
                        {h.badge}
                      </span>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-[14px] font-semibold">{h.label}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{h.sub}</p>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Run history */}
        {recentRuns.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide">Recent Runs</p>
              <Link href="/more/payroll/run" className="text-[13px] text-primary">View all</Link>
            </div>
            <Card className="overflow-hidden">
              <div className="divide-y divide-border/50">
                {recentRuns.map(run => (
                  <div key={run.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-medium">
                        {format(new Date(run.period_start), 'MMM d')} – {format(new Date(run.period_end), 'MMM d, yyyy')}
                      </p>
                      <p className="text-[12px] text-muted-foreground capitalize">{run.duration_type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-semibold tabular-nums">${run.total_paid.toFixed(2)}</p>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        run.status === 'paid' ? 'bg-green-100 text-green-700' :
                        run.status === 'report' ? 'bg-blue-100 text-blue-700' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {run.status === 'paid' ? 'Paid' : run.status === 'report' ? 'Report' : 'Draft'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
