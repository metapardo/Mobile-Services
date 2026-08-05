import { useState } from 'react';
import { employees } from '@/lib/mock-data';
import { calcPayrollSummary, payrollRuns, savePayrollRun, MOCK_DEDUCTION_RATE, type DurationType } from '@/lib/payroll-data';
import { ArrowLeft, ChevronRight, CheckCircle, FileText, Play } from 'lucide-react';
import { Link } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, subDays, startOfWeek, endOfWeek } from 'date-fns';

type Step = 1 | 2 | 3;

const today = new Date();
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

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

export default function PayrollRun() {
  const [step, setStep] = useState<Step>(1);
  const [, rerender] = useState(0);

  // Step 1 state
  const [periodStart, setPeriodStart] = useState(fmtDate(startOfWeek(subDays(today, 7), { weekStartsOn: 1 })));
  const [periodEnd, setPeriodEnd]     = useState(fmtDate(endOfWeek(subDays(today, 7), { weekStartsOn: 1 })));
  const [durationType, setDurationType] = useState<DurationType>('weekly');

  // Step 3 state
  const [runResult, setRunResult] = useState<typeof payrollRuns[0] | null>(null);
  const [runMode, setRunMode] = useState<'payroll' | 'report'>('payroll');

  const summaries = calcPayrollSummary(new Date(periodStart), new Date(periodEnd));
  const totalGross = summaries.reduce((s, e) => s + e.gross_pay, 0);
  const totalNet   = summaries.reduce((s, e) => s + e.net_pay, 0);
  const hasActivity = summaries.some(s => s.gross_pay > 0);

  const handleRunPayroll = () => {
    const run = savePayrollRun({
      period_start: periodStart,
      period_end: periodEnd,
      duration_type: durationType,
      status: runMode === 'payroll' ? 'paid' : 'report',
      total_paid: runMode === 'payroll' ? totalNet : 0,
      created_at: new Date().toISOString(),
      report_url: runMode === 'report' ? `https://reports.detailhub.app/${Date.now()}.pdf` : undefined,
      employee_summaries: summaries.map(s => ({
        employee_id: s.employee_id,
        hourly_pay: s.hourly_pay,
        commission_pay: s.commission_pay,
        tips: s.tips,
        gross_pay: s.gross_pay,
        net_pay: s.net_pay,
      })),
    });
    setRunResult(run);
    setStep(3);
  };

  const sortedRuns = [...payrollRuns].sort((a, b) => b.id - a.id);

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
                <p className="text-[12px] text-muted-foreground uppercase tracking-wide mb-2">Payroll Duration</p>
                <div className="grid grid-cols-4 gap-2">
                  {(['weekly', 'biweekly', 'monthly', 'custom'] as DurationType[]).map(d => (
                    <button
                      key={d}
                      onClick={() => {
                        setDurationType(d);
                        if (d === 'weekly') { setPeriodStart(fmtDate(startOfWeek(subDays(today, 7), { weekStartsOn: 1 }))); setPeriodEnd(fmtDate(endOfWeek(subDays(today, 7), { weekStartsOn: 1 }))); }
                        if (d === 'biweekly') { setPeriodStart(fmtDate(subDays(today, 14))); setPeriodEnd(fmtDate(subDays(today, 1))); }
                        if (d === 'monthly') { setPeriodStart(fmtDate(new Date(today.getFullYear(), today.getMonth() - 1, 1))); setPeriodEnd(fmtDate(new Date(today.getFullYear(), today.getMonth(), 0))); }
                      }}
                      className={`py-2 rounded-xl text-[12px] font-medium capitalize transition-colors ${
                        durationType === d ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {d === 'biweekly' ? 'Bi-weekly' : d.charAt(0).toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <DateInput label="Payroll Period Start" value={periodStart} onChange={setPeriodStart} />
                <DateInput label="Payroll Period End"   value={periodEnd}   onChange={setPeriodEnd}   />
              </div>
            </Card>

            {/* Action type */}
            <Card className="p-5">
              <p className="text-[12px] text-muted-foreground uppercase tracking-wide mb-3">Action</p>
              <div className="space-y-2">
                {([['payroll', 'Run Payroll', 'Mark employees as paid for this period', Play],
                   ['report',  'Run Report',  'Generate a report without marking as paid', FileText]] as const).map(([val, label, sub, Icon]) => (
                  <button
                    key={val}
                    onClick={() => setRunMode(val)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${
                      runMode === val ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      runMode === val ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold">{label}</p>
                      <p className="text-[12px] text-muted-foreground">{sub}</p>
                    </div>
                    <div className={`ml-auto w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      runMode === val ? 'border-primary' : 'border-muted-foreground/40'
                    }`}>
                      {runMode === val && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            <Button className="w-full gradient-btn" size="lg" onClick={() => setStep(2)}>
              Review Draft <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        )}

        {/* ── STEP 2: Draft review ── */}
        {step === 2 && (
          <div className="space-y-4">
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-border/50 bg-muted/20">
                <p className="text-[13px] font-semibold">
                  {format(new Date(periodStart), 'MMM d')} – {format(new Date(periodEnd), 'MMM d, yyyy')}
                  <span className="ml-2 text-muted-foreground font-normal capitalize">{durationType}</span>
                </p>
              </div>

              {/* Column headers */}
              <div className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-2 px-4 py-2 border-b border-border/30 bg-muted/10">
                {['Employee', 'Hourly', 'Commission', 'Gross', 'Net'].map(h => (
                  <p key={h} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</p>
                ))}
              </div>

              <div className="divide-y divide-border/40">
                {summaries.map(s => {
                  const e = employees.find(emp => emp.id === s.employee_id);
                  return (
                    <div key={s.employee_id} className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-2 px-4 py-3 items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                        <p className="text-[13px] font-medium truncate">{e?.name}</p>
                      </div>
                      <p className={`text-[13px] tabular-nums ${s.hourly_pay === 0 ? 'text-muted-foreground' : ''}`}>
                        {s.hourly_pay > 0 ? `$${s.hourly_pay.toFixed(0)}` : '—'}
                      </p>
                      <p className={`text-[13px] tabular-nums ${s.commission_pay === 0 ? 'text-muted-foreground' : ''}`}>
                        {s.commission_pay > 0 ? `$${s.commission_pay.toFixed(0)}` : '—'}
                      </p>
                      <p className="text-[13px] font-medium tabular-nums">${s.gross_pay.toFixed(0)}</p>
                      <p className="text-[13px] font-semibold tabular-nums text-primary">${s.net_pay.toFixed(0)}</p>
                    </div>
                  );
                })}
              </div>

              {/* Totals row */}
              <div className="grid grid-cols-[1fr_80px_80px_80px_80px] gap-2 px-4 py-3 border-t border-border/60 bg-muted/20">
                <p className="text-[13px] font-semibold">Total</p>
                <p className="text-[13px]" />
                <p className="text-[13px]" />
                <p className="text-[13px] font-semibold tabular-nums">${totalGross.toFixed(0)}</p>
                <p className="text-[13px] font-semibold tabular-nums text-primary">${totalNet.toFixed(0)}</p>
              </div>
            </Card>

            <Card className="p-3 bg-amber-50 border-amber-200">
              <p className="text-[12px] text-amber-700">
                ⚠️ Net pay uses a flat {Math.round(MOCK_DEDUCTION_RATE * 100)}% illustrative deduction. This is not real tax withholding logic.
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
                disabled={!hasActivity}
                onClick={handleRunPayroll}
              >
                {runMode === 'payroll' ? 'Run Payroll' : 'Run Report'}
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Confirmation ── */}
        {step === 3 && runResult && (
          <div className="space-y-4">
            <Card className="p-6 text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                {runResult.status === 'paid'
                  ? <CheckCircle className="w-8 h-8 text-green-500" />
                  : <FileText className="w-8 h-8 text-blue-500" />
                }
              </div>
              <h2 className="text-[20px] font-semibold mb-1">
                {runResult.status === 'paid' ? 'Payroll Complete' : 'Report Generated'}
              </h2>
              <p className="text-[14px] text-muted-foreground mb-4">
                {format(new Date(runResult.period_start), 'MMM d')} – {format(new Date(runResult.period_end), 'MMM d, yyyy')}
              </p>
              {runResult.status === 'paid' && (
                <p className="text-3xl font-bold tabular-nums text-primary">${runResult.total_paid.toFixed(2)}</p>
              )}
              {runResult.report_url && (
                <p className="text-[12px] text-muted-foreground mt-2 break-all">{runResult.report_url}</p>
              )}
            </Card>

            {runResult.status === 'paid' && (
              <div className="space-y-2">
                {runResult.employee_summaries.filter(s => s.net_pay > 0).map(s => {
                  const e = employees.find(emp => emp.id === s.employee_id);
                  return (
                    <Card key={s.employee_id} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                        style={{ backgroundColor: e?.color }}>
                        {e?.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div className="flex-1">
                        <p className="text-[14px] font-semibold">{e?.name}</p>
                        <p className="text-[12px] text-muted-foreground">You Got Paid 🎉</p>
                      </div>
                      <p className="text-[16px] font-bold tabular-nums text-primary">${s.net_pay.toFixed(2)}</p>
                    </Card>
                  );
                })}
              </div>
            )}

            <Button className="w-full gradient-btn" size="lg" onClick={() => { setStep(1); setRunResult(null); rerender(n => n + 1); }}>
              Run Another Period
            </Button>
          </div>
        )}

        {/* Run history */}
        {step !== 3 && (
          <div className="mt-8">
            <p className="text-[13px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Run History</p>
            <Card className="overflow-hidden">
              {sortedRuns.length === 0 && (
                <div className="p-6 text-center text-[14px] text-muted-foreground">No runs yet</div>
              )}
              <div className="divide-y divide-border/50">
                {sortedRuns.map(run => (
                  <div key={run.id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-medium">
                        {format(new Date(run.period_start), 'MMM d')} – {format(new Date(run.period_end), 'MMM d, yyyy')}
                      </p>
                      <p className="text-[12px] text-muted-foreground capitalize">{run.duration_type}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[14px] font-semibold tabular-nums">
                        {run.status === 'paid' ? `$${run.total_paid.toFixed(2)}` : 'Report'}
                      </p>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        run.status === 'paid'   ? 'bg-green-100 text-green-700' :
                        run.status === 'report' ? 'bg-blue-100 text-blue-700' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {run.status.charAt(0).toUpperCase() + run.status.slice(1)}
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
