import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListEmployees,
  useListTimeOffRequests,
  useCreateTimeOffRequest,
  useReviewTimeOffRequest,
  getListTimeOffRequestsQueryKey,
} from '@workspace/api-client-react';
import { ArrowLeft, CheckCircle, XCircle, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { Link } from 'wouter';
import { Card } from '@workspace/blue-glass-design-system/components/ui/card';
import { Button } from '@workspace/blue-glass-design-system/components/ui/button';
import { Input } from '@workspace/blue-glass-design-system/components/ui/input';
import { Label } from '@workspace/blue-glass-design-system/components/ui/label';
import { Textarea } from '@workspace/blue-glass-design-system/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@workspace/blue-glass-design-system/components/ui/dialog';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@workspace/blue-glass-design-system/components/ui/empty';
import { useToast } from '@workspace/blue-glass-design-system/hooks/use-toast';
import { format, differenceInCalendarDays } from 'date-fns';

type Tab = 'pending' | 'history';
type ModalAction = { id: number; name: string; action: 'approve' | 'deny' } | null;

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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('pending');
  const [modal, setModal] = useState<ModalAction>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({ employeeId: '' as number | '', startDate: format(new Date(), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd'), note: '' });

  const employeesQuery = useListEmployees();
  const employees = employeesQuery.data ?? [];
  const requestsQuery = useListTimeOffRequests();
  const requests = requestsQuery.data ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListTimeOffRequestsQueryKey() });

  const createMutation = useCreateTimeOffRequest({
    mutation: {
      onSuccess: async () => {
        await invalidate();
        toast({ title: 'Time-off request submitted' });
        setAddOpen(false);
        setNewRequest({ employeeId: '', startDate: format(new Date(), 'yyyy-MM-dd'), endDate: format(new Date(), 'yyyy-MM-dd'), note: '' });
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong submitting this request.';
        toast({ title: 'Submit failed', description: message, variant: 'destructive' });
      },
    },
  });

  const reviewMutation = useReviewTimeOffRequest({
    mutation: {
      onSuccess: invalidate,
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong reviewing this request.';
        toast({ title: 'Review failed', description: message, variant: 'destructive' });
      },
    },
  });

  const pending = requests.filter(r => r.status === 'pending');
  const history = requests.filter(r => r.status !== 'pending')
    .sort((a, b) => (b.reviewedAt ?? '').localeCompare(a.reviewedAt ?? ''));

  const emp = (id: number) => employees.find(e => e.id === id);

  const handleConfirm = () => {
    if (!modal) return;
    reviewMutation.mutate({ id: modal.id, data: { status: modal.action === 'approve' ? 'approved' : 'denied' } });
    setModal(null);
    if (pending.length === 1) setTab('history');
  };

  const handleAddRequest = () => {
    if (newRequest.employeeId === '') return;
    createMutation.mutate({
      data: {
        employeeId: newRequest.employeeId,
        startDate: newRequest.startDate,
        endDate: newRequest.endDate,
        note: newRequest.note.trim() || undefined,
      },
    });
  };

  const days = (start: string, end: string) => differenceInCalendarDays(new Date(end), new Date(start)) + 1;

  const isLoading = requestsQuery.isLoading || employeesQuery.isLoading;
  const isError = requestsQuery.isError || employeesQuery.isError;

  return (
    <div className="min-h-[100dvh] pb-24 md:pb-8">
      <div className="max-w-xl mx-auto px-4 pt-6">
        <Link href="/more/payroll" className="inline-flex items-center gap-1.5 text-muted-foreground mb-5 hover:text-foreground transition-colors text-[14px]">
          <ArrowLeft className="w-4 h-4" /> Payroll Overview
        </Link>

        <div className="flex items-center justify-between mb-5">
          <h1 className="text-2xl font-semibold">Time Off</h1>
          <div className="flex items-center gap-2">
            {pending.length > 0 && (
              <span className="text-[12px] font-semibold bg-primary text-white rounded-full px-2.5 py-0.5">
                {pending.length} pending
              </span>
            )}
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} data-testid="button-new-time-off">
              <Plus className="w-4 h-4 mr-1" /> New
            </Button>
          </div>
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

        {isError ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="text-[15px] font-semibold">Couldn't load time-off requests</p>
            <p className="text-[13px] text-muted-foreground max-w-[280px]">Check your connection and try again.</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : (
          <>
            {/* Pending queue */}
            {tab === 'pending' && (
              <div className="space-y-3">
                {pending.length === 0 && (
                  <Empty className="border border-border rounded-xl bg-card">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <CheckCircle />
                      </EmptyMedia>
                      <EmptyTitle>All caught up</EmptyTitle>
                      <EmptyDescription>No pending time-off requests</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
                {pending.map(req => {
                  const e = emp(req.employeeId);
                  return (
                    <Card key={req.id} className="p-4" data-testid={`time-off-${req.id}`}>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold shrink-0"
                            style={{ backgroundColor: e?.color }}>
                            {e?.name.split(' ').map(n => n[0]).join('') ?? '?'}
                          </div>
                          <div>
                            <p className="text-[15px] font-semibold">{e?.name ?? `Employee #${req.employeeId}`}</p>
                          </div>
                        </div>
                        <StatusChip status={req.status} />
                      </div>
                      <div className="flex items-center gap-4 mb-3 text-[13px]">
                        <div>
                          <p className="text-muted-foreground text-[11px] uppercase tracking-wide mb-0.5">Dates</p>
                          <p className="font-medium">
                            {format(new Date(req.startDate), 'MMM d')}
                            {req.startDate !== req.endDate && ` – ${format(new Date(req.endDate), 'MMM d, yyyy')}`}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-[11px] uppercase tracking-wide mb-0.5">Duration</p>
                          <p className="font-medium">{days(req.startDate, req.endDate)} day{days(req.startDate, req.endDate) !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      {req.note && (
                        <p className="text-[13px] text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 mb-3 italic">"{req.note}"</p>
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
                    const e = emp(req.employeeId);
                    return (
                      <div key={req.id} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                              style={{ backgroundColor: e?.color }}>
                              {e?.name.split(' ').map(n => n[0]).join('') ?? '?'}
                            </div>
                            <p className="text-[14px] font-medium">{e?.name ?? `Employee #${req.employeeId}`}</p>
                          </div>
                          <StatusChip status={req.status} />
                        </div>
                        <p className="text-[12px] text-muted-foreground">
                          {format(new Date(req.startDate), 'MMM d')}
                          {req.startDate !== req.endDate && ` – ${format(new Date(req.endDate), 'MMM d')}`}
                          {' '}· {days(req.startDate, req.endDate)}d
                        </p>
                        {req.reviewedAt && (
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                            Reviewed {format(new Date(req.reviewedAt), 'MMM d, yyyy')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </>
        )}
      </div>

      {/* New request dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Time-Off Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label htmlFor="to-employee">Employee</Label>
              <select
                id="to-employee"
                className="w-full text-[14px] bg-background border border-border rounded-xl px-3 py-2 focus:outline-none mt-1"
                value={newRequest.employeeId}
                onChange={e => setNewRequest(f => ({ ...f, employeeId: e.target.value ? parseInt(e.target.value) : '' }))}
              >
                <option value="">Select employee…</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="to-start">Start Date</Label>
                <Input id="to-start" type="date" value={newRequest.startDate} onChange={e => setNewRequest(f => ({ ...f, startDate: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="to-end">End Date</Label>
                <Input id="to-end" type="date" value={newRequest.endDate} onChange={e => setNewRequest(f => ({ ...f, endDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label htmlFor="to-note">Note (optional)</Label>
              <Textarea id="to-note" value={newRequest.note} onChange={e => setNewRequest(f => ({ ...f, note: e.target.value }))} />
            </div>
            <Button
              onClick={handleAddRequest}
              className="w-full"
              disabled={createMutation.isPending || newRequest.employeeId === '' || newRequest.startDate > newRequest.endDate}
            >
              {createMutation.isPending ? 'Submitting…' : 'Submit Request'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                disabled={reviewMutation.isPending}
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
