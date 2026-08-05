import { useState } from 'react';
import { employees } from '@/lib/mock-data';
import { timeOffRequests, approveTimeOffRequest, denyTimeOffRequest } from '@/lib/payroll-data';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { Link } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, differenceInCalendarDays } from 'date-fns';

type Tab = 'pending' | 'history';
type ModalAction = { id: number; name: string; action: 'approve' | 'deny' } | null;

const TYPE_LABEL: Record<string, string> = { vacation: 'Vacation', sick: 'Sick Leave', personal: 'Personal' };

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
      status === 'approved' ? 'bg-green-100 text-green-700' :
      status === 'denied'   ? 'bg-red-100 text-red-600' :
      'bg-amber-100 text-amber-700'
    }`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

export default function PayrollTimeOff() {
  const [tab, setTab] = useState<Tab>('pending');
  const [modal, setModal] = useState<ModalAction>(null);
  const [, rerender] = useState(0);

  const pending = timeOffRequests.filter(r => r.status === 'pending');
  const history = timeOffRequests.filter(r => r.status !== 'pending')
    .sort((a, b) => (b.reviewed_at ?? '').localeCompare(a.reviewed_at ?? ''));

  const emp = (id: number) => employees.find(e => e.id === id);

  const handleConfirm = () => {
    if (!modal) return;
    if (modal.action === 'approve') approveTimeOffRequest(modal.id);
    else denyTimeOffRequest(modal.id);
    setModal(null);
    rerender(n => n + 1);
    if (pending.length === 1) setTab('history'); // auto-switch when queue empties
  };

  const days = (start: string, end: string) => differenceInCalendarDays(new Date(end), new Date(start)) + 1;

  return (
    <div className="min-h-[100dvh] pb-24 md:pb-8">
      <div className="max-w-xl mx-auto px-4 pt-6">
        <Link href="/more/payroll" className="inline-flex items-center gap-1.5 text-muted-foreground mb-5 hover:text-foreground transition-colors text-[14px]">
          <ArrowLeft className="w-4 h-4" /> Payroll Overview
        </Link>

        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-semibold">Time Off</h1>
          {pending.length > 0 && (
            <span className="text-[12px] font-semibold bg-primary text-white rounded-full px-2.5 py-0.5">
              {pending.length} pending
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-xl mb-5">
          {(['pending', 'history'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                tab === t ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'pending' ? `Pending${pending.length > 0 ? ` (${pending.length})` : ''}` : 'History'}
            </button>
          ))}
        </div>

        {/* Pending queue */}
        {tab === 'pending' && (
          <div className="space-y-3">
            {pending.length === 0 && (
              <Card className="p-8 text-center">
                <CheckCircle className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-[15px] font-medium">All caught up</p>
                <p className="text-[13px] text-muted-foreground mt-1">No pending time-off requests</p>
              </Card>
            )}
            {pending.map(req => {
              const e = emp(req.employee_id);
              return (
                <Card key={req.id} className="p-4" data-testid={`time-off-${req.id}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                        style={{ backgroundColor: e?.color }}>
                        {e?.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold">{e?.name}</p>
                        <p className="text-[12px] text-muted-foreground">{TYPE_LABEL[req.type]}</p>
                      </div>
                    </div>
                    <StatusChip status={req.status} />
                  </div>
                  <div className="flex items-center gap-4 mb-3 text-[13px]">
                    <div>
                      <p className="text-muted-foreground text-[11px] uppercase tracking-wide mb-0.5">Dates</p>
                      <p className="font-medium">
                        {format(new Date(req.start_date), 'MMM d')}
                        {req.start_date !== req.end_date && ` – ${format(new Date(req.end_date), 'MMM d, yyyy')}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[11px] uppercase tracking-wide mb-0.5">Duration</p>
                      <p className="font-medium">{days(req.start_date, req.end_date)} day{days(req.start_date, req.end_date) !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  {req.notes && (
                    <p className="text-[13px] text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 mb-3 italic">"{req.notes}"</p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 gradient-btn"
                      onClick={() => setModal({ id: req.id, name: e?.name ?? '', action: 'approve' })}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => setModal({ id: req.id, name: e?.name ?? '', action: 'deny' })}
                    >
                      Deny
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* History */}
        {tab === 'history' && (
          <Card className="overflow-hidden">
            {history.length === 0 && (
              <div className="p-8 text-center text-[14px] text-muted-foreground">No history yet</div>
            )}
            <div className="divide-y divide-border/50">
              {history.map(req => {
                const e = emp(req.employee_id);
                return (
                  <div key={req.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                          style={{ backgroundColor: e?.color }}>
                          {e?.name.split(' ').map(n => n[0]).join('')}
                        </div>
                        <p className="text-[14px] font-medium">{e?.name}</p>
                      </div>
                      <StatusChip status={req.status} />
                    </div>
                    <p className="text-[12px] text-muted-foreground">
                      {TYPE_LABEL[req.type]} · {format(new Date(req.start_date), 'MMM d')}
                      {req.start_date !== req.end_date && ` – ${format(new Date(req.end_date), 'MMM d')}`}
                      {' '}· {days(req.start_date, req.end_date)}d
                    </p>
                    {req.reviewed_at && (
                      <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                        Reviewed {format(new Date(req.reviewed_at), 'MMM d, yyyy')} by {req.reviewed_by}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {/* Confirmation modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setModal(null)} />
          <Card className="relative z-10 w-full max-w-sm p-6 rounded-3xl">
            <div className="flex items-center justify-center mb-4">
              {modal.action === 'approve'
                ? <CheckCircle className="w-10 h-10 text-green-500" />
                : <XCircle className="w-10 h-10 text-red-500" />
              }
            </div>
            <h2 className="text-[18px] font-semibold text-center mb-1">
              {modal.action === 'approve' ? 'Approve Time Off Request' : 'Deny Time Off Request'}
            </h2>
            <p className="text-[14px] text-muted-foreground text-center mb-6">
              Are you sure you want to {modal.action} the time off request by{' '}
              <span className="font-semibold text-foreground">{modal.name}</span>?
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setModal(null)}>Cancel</Button>
              <Button
                className={`flex-1 ${modal.action === 'approve' ? 'gradient-btn' : 'bg-red-500 hover:bg-red-600 text-white border-0'}`}
                onClick={handleConfirm}
              >
                {modal.action === 'approve' ? 'Approve' : 'Deny'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
