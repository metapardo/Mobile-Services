import { useState } from 'react';
import { Link } from 'wouter';
import { format } from 'date-fns';
import { Users, Clock, CalendarOff, ChevronRight, Play, Loader2, AlertTriangle, Wallet } from 'lucide-react';
import { Card } from '@workspace/blue-glass-design-system/components/ui/card';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '@workspace/blue-glass-design-system/components/ui/empty';
import { useGetPayrollSummary, useListEmployees, useListPayrollRuns } from '@workspace/api-client-react';
import { PAYROLL_PERIODS, PAYROLL_PERIOD_LABELS, formatPayrollPeriodLabel, type PayrollPeriod } from '@/lib/payroll-period';

export default function PayrollOverview() {
  const [period, setPeriod] = useState<PayrollPeriod>('this_week');

  const summaryQuery = useGetPayrollSummary({ period });
  const employeesQuery = useListEmployees({ includeInactive: true });
  const runsQuery = useListPayrollRuns({ limit: 3 });

  const employees = employeesQuery.data ?? [];
  const lines = summaryQuery.data?.lines ?? [];
  const totalGross = summaryQuery.data?.grossTotal ?? 0;
  const totalNet = summaryQuery.data?.netTotal ?? 0;
  const pendingCount = summaryQuery.data?.pendingTimeOffCount ?? 0;
  const recentRuns = runsQuery.data ?? [];

  const employeeById = (id: number) => employees.find(e => e.id === id);

  const isLoading = summaryQuery.isLoading || employeesQuery.isLoading || runsQuery.isLoading;
  const isError = summaryQuery.isError || employeesQuery.isError || runsQuery.isError;

  const hubs = [
    { label: 'Team & Pay',    sub: 'Roles and pay rates',       icon: Users,       href: '/more/payroll/team'          },
    { label: 'Time Off',      sub: pendingCount > 0 ? `${pendingCount} pending` : 'Requests & history', icon: CalendarOff, href: '/more/payroll/time-off', badge: pendingCount },
    { label: 'Time Tracking', sub: 'Hours logged by employee',  icon: Clock,       href: '/more/payroll/time-tracking' },
    { label: 'Run Payroll',   sub: 'Pay your team',             icon: Play,        href: '/more/payroll/run'           },
  ];

  return (
    <div className="min-h-[100dvh] pb-24 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Team Payroll</h1>
          <p className="text-[14px] text-muted-foreground mt-0.5">{formatPayrollPeriodLabel(period)}</p>
        </div>

        {/* Period tabs */}
        <div className="flex gap-2 mb-6">
          {PAYROLL_PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                period === p ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
              data-testid={`period-${p}`}
            >
              {PAYROLL_PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {isError ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center" data-testid="status-payroll-error">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="text-[15px] font-semibold">Couldn't load payroll</p>
            <p className="text-[13px] text-muted-foreground max-w-[280px]">Check your connection and try again.</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-16" data-testid="status-payroll-loading">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <>
            {/* Totals */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <Card className="p-4">
                <p className="text-[12px] text-muted-foreground mb-1 uppercase tracking-wide">Gross Payroll</p>
                <p className="text-2xl font-semibold tabular-nums">${totalGross.toFixed(2)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-[12px] text-muted-foreground mb-1 uppercase tracking-wide">Est. Net Payroll</p>
                <p className="text-2xl font-semibold tabular-nums">${totalNet.toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Estimated withholding — not a substitute for real payroll tax filing
                </p>
              </Card>
            </div>

            {/* Per-employee summary */}
            <Card className="mb-6 overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50">
                <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide">Employee Summary</p>
              </div>
              {lines.length === 0 ? (
                <Empty data-testid="empty-state-employee-summary">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Wallet />
                    </EmptyMedia>
                    <EmptyTitle>No pay activity yet</EmptyTitle>
                    <EmptyDescription>
                      Add team members and pay rates, then log hours or complete bookings to see payroll here.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="divide-y divide-border/50">
                  {lines.map(line => {
                    const emp = employeeById(line.employee_id);
                    return (
                      <div key={line.employee_id} className="px-4 py-3 flex items-center gap-3">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: emp?.color ?? '#999' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium truncate">{emp?.name ?? `Employee #${line.employee_id}`}</p>
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          {line.hourly_pay > 0 && (
                            <p className="text-[12px] text-muted-foreground tabular-nums">
                              Hourly ${line.hourly_pay.toFixed(2)}
                            </p>
                          )}
                          {line.commission_pay > 0 && (
                            <p className="text-[12px] text-muted-foreground tabular-nums">
                              Commission ${line.commission_pay.toFixed(2)}
                            </p>
                          )}
                          <p className="text-[14px] font-semibold tabular-nums">${line.gross_pay.toFixed(2)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide">Recent Runs</p>
                <Link href="/more/payroll/run" className="text-[13px] text-primary">View all</Link>
              </div>
              <Card className="overflow-hidden">
                {recentRuns.length === 0 ? (
                  <div className="px-4 py-6 text-center text-[14px] text-muted-foreground">No payroll runs yet</div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {recentRuns.map(run => {
                      const totalNetForRun = run.lineItems.reduce((s, l) => s + l.net_pay, 0);
                      return (
                        <div key={run.id} className="px-4 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-[14px] font-medium">
                              {format(new Date(run.periodStart), 'MMM d')} – {format(new Date(run.periodEnd), 'MMM d, yyyy')}
                            </p>
                            <p className="text-[12px] text-muted-foreground capitalize">{run.durationType}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[14px] font-semibold tabular-nums">${totalNetForRun.toFixed(2)}</p>
                            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                              run.status === 'paid' ? 'bg-green-100 text-green-700' :
                              run.status === 'draft' ? 'bg-muted text-muted-foreground' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
