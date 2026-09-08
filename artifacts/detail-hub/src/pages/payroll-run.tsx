import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListEmployees,
  useGetPayrollSummary,
  useCreatePayrollRun,
  useUpdatePayrollRun,
  useListPayrollRuns,
  getListPayrollRunsQueryKey,
  getGetPayrollSummaryQueryKey,
  type PayrollRunResult,
} from '@workspace/api-client-react';
import { ArrowLeft, ChevronRight, CheckCircle, FileText, Loader2, AlertTriangle } from 'lucide-react';
import { Link } from 'wouter';
import { Card } from '@workspace/blue-glass-design-system/components/ui/card';
import { Button } from '@workspace/blue-glass-design-system/components/ui/button';
import { Label } from '@workspace/blue-glass-design-system/components/ui/label';
import { useToast } from '@workspace/blue-glass-design-system/hooks/use-toast';
import { format } from 'date-fns';
import { PAYROLL_PERIODS, PAYROLL_PERIOD_LABELS, getPayrollPeriodDateRange, type PayrollPeriod } from '@/lib/payroll-period';

type Step = 1 | 2 | 3;
type RangeMode = PayrollPeriod | 'custom';
type DurationType = 'weekly' | 'biweekly' | 'monthly' | 'custom';

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-[12px] text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <input
        type="date"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-border rounded-xl px-3 py-2 text-[14px] bg-background focus:outline-none focus:border-primary"
      />
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
      status === 'paid' ? 'bg-green-100 text-green-700' :
      status === 'draft' ? 'bg-muted text-muted-foreground' :
      'bg-blue-100 text-blue-700'
    }`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function PayrollRun() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>(1);

  const lastWeek = getPayrollPeriodDateRange('last_week');
  const [rangeMode, setRangeMode] = useState<RangeMode>('last_week');
  const [periodStart, setPeriodStart] = useState(lastWeek.start);
  const [periodEnd, setPeriodEnd] = useState(lastWeek.end);
  const [durationType, setDurationType] = useState<DurationType>('weekly');
  const [runByEmployeeId, setRunByEmployeeId] = useState<number | ''>('');

  const [draftRun, setDraftRun] = useState<PayrollRunResult | null>(null);

  const employeesQuery = useListEmployees();
  const employees = employeesQuery.data ?? [];

  const invalidateRuns = () => queryClient.invalidateQueries({ queryKey: getListPayrollRunsQueryKey() });

  const runsQuery = useListPayrollRuns();
  const sortedRuns = [...(runsQuery.data ?? [])].sort((a, b) => b.id - a.id);

  const summaryQuery = useGetPayrollSummary(
    { periodStart, periodEnd },
    { query: { queryKey: getGetPayrollSummaryQueryKey({ periodStart, periodEnd }), enabled: step === 2 } },
  );
  const summary = summaryQuery.data;
  const hasActivity = (summary?.lines ?? []).some(l => l.gross_pay > 0);

  const createRunMutation = useCreatePayrollRun({
    mutation: {
      onSuccess: async (run) => {
        await invalidateRuns();
        setDraftRun(run);
        setStep(3);
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong creating this payroll run. Please try again.';
        toast({ title: 'Create run failed', description: message, variant: 'destructive' });
      },
    },
  });

  const markPaidMutation = useUpdatePayrollRun({
    mutation: {
      onSuccess: async (run) => {
        await invalidateRuns();
        setDraftRun(run);
        toast({ title: 'Payroll run marked as paid' });
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong marking this run as paid.';
        toast({ title: 'Mark paid failed', description: message, variant: 'destructive' });
      },
    },
  });

  const applyRangeMode = (mode: RangeMode) => {
    setRangeMode(mode);
    if (mode === 'custom') return;
    const { start, end } = getPayrollPeriodDateRange(mode);
    setPeriodStart(start);
    setPeriodEnd(end);
    setDurationType(mode === 'this_month' ? 'monthly' : 'weekly');
  };

  const handleCreateRun = () => {
    if (runByEmployeeId === '') return;
    createRunMutation.mutate({
      data: { periodStart, periodEnd, durationType, runByEmployeeId },
    });
  };

  const handleRunAnother = () => {
    setStep(1);
    setDraftRun(null);
  };

  const employeeName = (id: number) => employees.find(e => e.id === id)?.name ?? `Employee #${id}`;
  const employeeColor = (id: number) => employees.find(e => e.id === id)?.color ?? '#999';

  return (
    <div className="min-h-[100dvh] pb-24 md:pb-8">
      <div className="max-w-xl mx-auto px-4 pt-6">
        <Link href="/more/payroll" className="inline-flex items-center gap-1.5 text-muted-foreground mb-5 hover:text-foreground transition-colors text-[14px]">
          <ArrowLeft className="w-4 h-4" /> Payroll Overview
        </Link>

        <h1 className="text-2xl font-semibold mb-6">Run Payroll</h1>

        {/* Step indicator */}
        {step < 3 && (
          <div className="flex items-center gap-2 mb-6">
            {[1, 2].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-semibold transition-colors ${
                  step >= s ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                }`}>{s}</div>
                {s < 2 && <div className={`h-0.5 w-8 ${step > s ? 'bg-primary' : 'bg-muted'}`} />}
              </div>
            ))}
            <p className="ml-2 text-[13px] text-muted-foreground">{step === 1 ? 'Select period' : 'Review draft'}</p>
          </div>
        )}

        {/* ── STEP 1: Period selector ── */}
        {step === 1 && (
          <div className="space-y-5">
            <Card className="p-5 space-y-4">
              <div>
                <p className="text-[12px] text-muted-foreground uppercase tracking-wide mb-2">Period</p>
                <div className="grid grid-cols-4 gap-2">
                  {[...PAYROLL_PERIODS, 'custom' as const].map(p => (
                    <button
                      key={p}
                      onClick={() => applyRangeMode(p)}
                      className={`py-2 rounded-xl text-[12px] font-medium transition-colors ${
                        rangeMode === p ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {p === 'custom' ? 'Custom' : PAYROLL_PERIOD_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <DateInput label="Payroll Period Start" value={periodStart} onChange={v => { setPeriodStart(v); setRangeMode('custom'); }} />
                <DateInput label="Payroll Period End"   value={periodEnd}   onChange={v => { setPeriodEnd(v); setRangeMode('custom'); }} />
              </div>

              <div>
                <p className="text-[12px] text-muted-foreground uppercase tracking-wide mb-2">Payroll Duration</p>
                <div className="grid grid-cols-4 gap-2">
                  {(['weekly', 'biweekly', 'monthly', 'custom'] as DurationType[]).map(d => (
                    <button
                      key={d}
                      onClick={() => setDurationType(d)}
                      className={`py-2 rounded-xl text-[12px] font-medium capitalize transition-colors ${
                        durationType === d ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {d === 'biweekly' ? 'Bi-weekly' : d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="run-by">Run By</Label>
                <select
                  id="run-by"
                  className="w-full text-[14px] bg-background border border-border rounded-xl px-3 py-2 focus:outline-none mt-1"
                  value={runByEmployeeId}
                  onChange={e => setRunByEmployeeId(e.target.value ? parseInt(e.target.value) : '')}
                >
                  <option value="">Select who's running this…</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Required — attributes this run to a team member record (there's no separate admin-login mapping yet).
                </p>
                {employees.length === 0 && !employeesQuery.isLoading && (
                  <p className="text-[12px] text-destructive mt-1">
                    No team members yet — <Link href="/more/payroll/team" className="underline">add one first</Link>.
                  </p>
                )}
              </div>
            </Card>

            <Button
              className="w-full gradient-btn"
              size="lg"
              onClick={() => setStep(2)}
              disabled={runByEmployeeId === '' || periodStart > periodEnd}
            >
              Review Draft <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* ── STEP 2: Draft review ── */}
        {step === 2 && (
          <div className="space-y-4">
            {summaryQuery.isError ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
                <AlertTriangle className="w-8 h-8 text-destructive" />
                <p className="text-[15px] font-semibold">Couldn't load this period's summary</p>
              </div>
            ) : summaryQuery.isLoading || !summary ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
              </div>
            ) : (
              <>
                <Card className="overflow-hidden">
                  <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
                    <p className="text-[13px] font-semibold">
                      {format(new Date(periodStart), 'MMM d')} – {format(new Date(periodEnd), 'MMM d, yyyy')}
                      <span className="ml-2 text-muted-foreground font-normal capitalize">{durationType}</span>
                    </p>
                  </div>

                  <div className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-2 px-4 py-2 border-b border-border/30 bg-muted/10">
                    {['Employee', 'Hourly', 'Commission', 'Gross', 'Net'].map(h => (
                      <p key={h} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</p>
                    ))}
                  </div>

                  <div className="divide-y divide-border/40">
                    {summary.lines.map(line => (
                      <div key={line.employee_id} className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-2 px-4 py-3 items-center">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: employeeColor(line.employee_id) }} />
                          <p className="text-[13px] font-medium truncate">{employeeName(line.employee_id)}</p>
                        </div>
                        <p className={`text-[13px] tabular-nums ${line.hourly_pay === 0 ? 'text-muted-foreground' : ''}`}>
                          {line.hourly_pay > 0 ? `$${line.hourly_pay.toFixed(0)}` : '—'}
                        </p>
                        <p className={`text-[13px] tabular-nums ${line.commission_pay === 0 ? 'text-muted-foreground' : ''}`}>
                          {line.commission_pay > 0 ? `$${line.commission_pay.toFixed(0)}` : '—'}
                        </p>
                        <p className="text-[13px] font-medium tabular-nums">${line.gross_pay.toFixed(0)}</p>
                        <p className="text-[13px] font-semibold tabular-nums text-primary">${line.net_pay.toFixed(0)}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-2 px-4 py-3 border-t border-border/60 bg-muted/20">
                    <p className="text-[13px] font-semibold">Total</p>
                    <p className="text-[13px]" />
                    <p className="text-[13px]" />
                    <p className="text-[13px] font-semibold tabular-nums">${summary.grossTotal.toFixed(0)}</p>
                    <p className="text-[13px] font-semibold tabular-nums text-primary">${summary.netTotal.toFixed(0)}</p>
                  </div>
                </Card>

                <Card className="p-3 bg-amber-50 border-amber-200">
                  <p className="text-[12px] text-amber-700">
                    Net pay is an estimated withholding calculation, not real tax withholding or filing — confirm with a real
                    payroll/tax provider before relying on these numbers for compliance.
                  </p>
                </Card>

                {!hasActivity && (
                  <Card className="p-3 bg-muted/50">
                    <p className="text-[13px] text-muted-foreground text-center">No activity found in this period. Adjust the dates and try again.</p>
                  </Card>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>Back</Button>
                  <Button
                    className="flex-1 gradient-btn"
                    size="lg"
                    disabled={!hasActivity || createRunMutation.isPending}
                    onClick={handleCreateRun}
                  >
                    {createRunMutation.isPending ? 'Creating…' : 'Create Payroll Run'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── STEP 3: Draft created / paid confirmation ── */}
        {step === 3 && draftRun && (
          <div className="space-y-4">
            <Card className="p-6 text-center">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${
                draftRun.status === 'paid' ? 'bg-green-100' : 'bg-blue-100'
              }`}>
                {draftRun.status === 'paid'
                  ? <CheckCircle className="w-8 h-8 text-green-500" />
                  : <FileText className="w-8 h-8 text-blue-500" />
                }
              </div>
              <h2 className="text-[20px] font-semibold mb-1">
                {draftRun.status === 'paid' ? 'Marked as Paid' : 'Payroll Run Created'}
              </h2>
              <p className="text-[14px] text-muted-foreground mb-4">
                {format(new Date(draftRun.periodStart), 'MMM d')} – {format(new Date(draftRun.periodEnd), 'MMM d, yyyy')}
              </p>
              <p className="text-3xl font-bold tabular-nums text-primary">
                ${draftRun.lineItems.reduce((s, l) => s + l.net_pay, 0).toFixed(2)}
              </p>
              {draftRun.status === 'paid' && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Bookkeeping status update only — no funds were actually transferred (no payment processor is connected).
                </p>
              )}
            </Card>

            <div className="space-y-2">
              {draftRun.lineItems.filter(l => l.net_pay > 0).map(l => (
                <Card key={l.employee_id} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                    style={{ backgroundColor: employeeColor(l.employee_id) }}>
                    {employeeName(l.employee_id).split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] font-semibold">{employeeName(l.employee_id)}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {draftRun.status === 'paid' ? 'Marked as paid' : 'Pending — still a draft'}
                    </p>
                  </div>
                  <p className="text-[16px] font-bold tabular-nums text-primary">${l.net_pay.toFixed(2)}</p>
                </Card>
              ))}
            </div>

            {draftRun.status === 'draft' && (
              <Button
                className="w-full gradient-btn"
                size="lg"
                onClick={() => markPaidMutation.mutate({ id: draftRun.id, data: { status: 'paid' } })}
                disabled={markPaidMutation.isPending}
              >
                {markPaidMutation.isPending ? 'Marking as Paid…' : 'Mark as Paid'}
              </Button>
            )}

            <Button className="w-full" variant="outline" size="lg" onClick={handleRunAnother}>
              Run Another Period
            </Button>
          </div>
        )}

        {/* Run history */}
        {step !== 3 && (
          <div className="mt-8">
            <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Run History</p>
            <Card className="overflow-hidden">
              {runsQuery.isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                </div>
              ) : sortedRuns.length === 0 ? (
                <div className="p-6 text-center text-[14px] text-muted-foreground">No runs yet</div>
              ) : (
                <div className="divide-y divide-border/50">
                  {sortedRuns.map(run => {
                    const totalNetForRun = run.lineItems.reduce((s, l) => s + l.net_pay, 0);
                    return (
                      <div key={run.id} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-[14px] font-medium">
                            {format(new Date(run.periodStart), 'MMM d')} – {format(new Date(run.periodEnd), 'MMM d, yyyy')}
                          </p>
                          <p className="text-[12px] text-muted-foreground capitalize">{run.durationType}</p>
                        </div>
                        <div className="text-right flex items-center gap-2">
                          <div>
                            <p className="text-[14px] font-semibold tabular-nums">${totalNetForRun.toFixed(2)}</p>
                            <RunStatusBadge status={run.status} />
                          </div>
                          {run.status === 'draft' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => markPaidMutation.mutate({ id: run.id, data: { status: 'paid' } })}
                              disabled={markPaidMutation.isPending}
                            >
                              Mark Paid
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
