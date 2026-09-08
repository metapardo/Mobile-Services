import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListEmployees,
  useListEmployeeRoles,
  useListTimeLogs,
  useCreateTimeLog,
  useApproveTimeLog,
  useDeleteTimeLog,
  getListTimeLogsQueryKey,
  getListEmployeeRolesQueryKey,
  type TimeLogResult,
} from '@workspace/api-client-react';
import { ArrowLeft, CheckCircle, Briefcase, Filter, Plus, Loader2, AlertTriangle, Trash2, Clock3 } from 'lucide-react';
import { Link } from 'wouter';
import { Card } from '@workspace/blue-glass-design-system/components/ui/card';
import { Button } from '@workspace/blue-glass-design-system/components/ui/button';
import { Input } from '@workspace/blue-glass-design-system/components/ui/input';
import { Label } from '@workspace/blue-glass-design-system/components/ui/label';
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
import { format } from 'date-fns';
import { PAYROLL_PERIODS, PAYROLL_PERIOD_LABELS, getPayrollPeriodDateRange, type PayrollPeriod } from '@/lib/payroll-period';

function AddTimeLogDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const employeesQuery = useListEmployees();
  const employees = employeesQuery.data ?? [];

  const [employeeId, setEmployeeId] = useState<number | ''>('');
  const [roleName, setRoleName] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [hours, setHours] = useState<number>(8);

  const rolesQuery = useListEmployeeRoles(employeeId as number, {
    query: { queryKey: getListEmployeeRolesQueryKey(employeeId as number), enabled: employeeId !== '' },
  });
  const hourlyRoles = (rolesQuery.data ?? []).filter(r => r.payType === 'hourly');

  const createMutation = useCreateTimeLog({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListTimeLogsQueryKey() });
        toast({ title: 'Time logged' });
        onOpenChange(false);
        setEmployeeId('');
        setRoleName('');
        setHours(8);
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong logging these hours. Please try again.';
        toast({ title: 'Log failed', description: message, variant: 'destructive' });
      },
    },
  });

  const handleSubmit = () => {
    if (employeeId === '' || !roleName || hours <= 0) return;
    createMutation.mutate({ data: { employeeId, roleName, date, hours } });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log Hours</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div>
            <Label htmlFor="tl-employee">Employee</Label>
            <select
              id="tl-employee"
              className="w-full text-[14px] bg-background border border-border rounded-xl px-3 py-2 focus:outline-none mt-1"
              value={employeeId}
              onChange={e => { setEmployeeId(e.target.value ? parseInt(e.target.value) : ''); setRoleName(''); }}
            >
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          {employeeId !== '' && (
            <div>
              <Label htmlFor="tl-role">Role</Label>
              {rolesQuery.isLoading ? (
                <div className="flex items-center gap-2 text-[13px] text-muted-foreground mt-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading roles…
                </div>
              ) : hourlyRoles.length === 0 ? (
                <p className="text-[13px] text-muted-foreground mt-1">
                  This employee has no hourly pay role yet — add one from Team &amp; Pay Rates first.
                </p>
              ) : (
                <select
                  id="tl-role"
                  className="w-full text-[14px] bg-background border border-border rounded-xl px-3 py-2 focus:outline-none mt-1"
                  value={roleName}
                  onChange={e => setRoleName(e.target.value)}
                >
                  <option value="">Select role…</option>
                  {hourlyRoles.map(r => <option key={r.id} value={r.roleName}>{r.roleName} (${r.hourlyRate}/hr)</option>)}
                </select>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="tl-date">Date</Label>
              <Input id="tl-date" type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="tl-hours">Hours</Label>
              <Input id="tl-hours" type="number" min={0} step={0.25} value={hours} onChange={e => setHours(parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={createMutation.isPending || employeeId === '' || !roleName || hours <= 0}
          >
            {createMutation.isPending ? 'Logging…' : 'Log Hours'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function PayrollTimeTracking() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<PayrollPeriod>('this_week');
  const [empFilter, setEmpFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TimeLogResult | null>(null);

  const { start, end } = getPayrollPeriodDateRange(period);
  const employeesQuery = useListEmployees();
  const employees = employeesQuery.data ?? [];

  const logsQuery = useListTimeLogs({
    start,
    end,
    ...(empFilter !== 'all' ? { employeeId: empFilter } : {}),
  });
  const logs = logsQuery.data ?? [];

  const invalidateLogs = () => queryClient.invalidateQueries({ queryKey: getListTimeLogsQueryKey() });

  const approveMutation = useApproveTimeLog({
    mutation: {
      onSuccess: invalidateLogs,
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong approving this entry.';
        toast({ title: 'Approve failed', description: message, variant: 'destructive' });
      },
    },
  });

  const deleteMutation = useDeleteTimeLog({
    mutation: {
      onSuccess: async () => {
        await invalidateLogs();
        setDeleteTarget(null);
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong removing this entry.';
        toast({ title: 'Delete failed', description: message, variant: 'destructive' });
      },
    },
  });

  const filtered = logs
    .filter(l => statusFilter === 'all' || (statusFilter === 'approved' ? l.approved : !l.approved))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const pendingIds = filtered.filter(l => !l.approved).map(l => l.id);
  const pendingCount = logs.filter(l => !l.approved).length;

  const handleBulkApprove = async () => {
    await Promise.all(pendingIds.map(id => approveMutation.mutateAsync({ id })));
  };

  const emp = (id: number) => employees.find(e => e.id === id);

  const isLoading = logsQuery.isLoading || employeesQuery.isLoading;
  const isError = logsQuery.isError || employeesQuery.isError;

  return (
    <div className="min-h-[100dvh] pb-24 md:pb-8">
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <Link href="/more/payroll" className="inline-flex items-center gap-1.5 text-muted-foreground mb-5 hover:text-foreground transition-colors text-[14px]">
          <ArrowLeft className="w-4 h-4" /> Payroll Overview
        </Link>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Time Tracking</h1>
            {pendingCount > 0 && (
              <p className="text-[13px] text-muted-foreground mt-0.5">{pendingCount} entr{pendingCount !== 1 ? 'ies' : 'y'} pending approval</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} data-testid="button-log-hours">
              <Plus className="w-4 h-4 mr-1" /> Log Hours
            </Button>
            {pendingCount > 0 && (
              <Button size="sm" onClick={handleBulkApprove} className="gradient-btn text-[13px]" disabled={approveMutation.isPending}>
                Approve all pending
              </Button>
            )}
          </div>
        </div>

        {/* Period tabs */}
        <div className="flex gap-2 mb-4">
          {PAYROLL_PERIODS.map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                period === p ? 'bg-primary text-white' : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {PAYROLL_PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />
          </div>
          <select
            className="text-[13px] bg-background border border-border rounded-xl px-3 py-1.5 focus:outline-none"
            value={empFilter === 'all' ? 'all' : empFilter}
            onChange={e => setEmpFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
          >
            <option value="all">All employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <select
            className="text-[13px] bg-background border border-border rounded-xl px-3 py-1.5 focus:outline-none"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
          </select>
        </div>

        {isError ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="text-[15px] font-semibold">Couldn't load time logs</p>
            <p className="text-[13px] text-muted-foreground max-w-[280px]">Check your connection and try again.</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <Empty className="border border-border rounded-xl bg-card">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Clock3 />
              </EmptyMedia>
              <EmptyTitle>No time entries yet</EmptyTitle>
              <EmptyDescription>
                Log hours for an hourly employee to see them here.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Log Hours
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <Card className="overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_1fr_60px_80px_100px] gap-3 px-4 py-2.5 border-b border-border/50 bg-muted/30">
              {['Date', 'Employee', 'Role', 'Hrs', 'Source', 'Status'].map(h => (
                <p key={h} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</p>
              ))}
            </div>

            <div className="divide-y divide-border/40">
              {filtered.map(log => {
                const e = emp(log.employeeId);
                return (
                  <div
                    key={log.id}
                    className="grid grid-cols-[1fr_1fr_1fr_60px_80px_100px] gap-3 px-4 py-3 items-center"
                  >
                    <p className="text-[13px] tabular-nums">{format(new Date(log.date), 'MMM d')}</p>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e?.color }} />
                      <p className="text-[13px] truncate">{e?.name.split(' ')[0] ?? `#${log.employeeId}`}</p>
                    </div>
                    <p className="text-[13px] truncate">{log.roleName}</p>
                    <p className="text-[13px] font-medium tabular-nums">{log.hours}h</p>
                    <div className="flex items-center gap-1">
                      {log.source === 'derived_from_booking' && (
                        <Briefcase className="w-3 h-3 text-muted-foreground shrink-0" aria-label="From booking" />
                      )}
                      <span className="text-[11px] text-muted-foreground truncate">
                        {log.source === 'derived_from_booking' ? 'Job' : 'Manual'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!log.approved ? (
                        <button
                          onClick={() => approveMutation.mutate({ id: log.id })}
                          disabled={approveMutation.isPending}
                          className="text-[12px] font-medium text-primary hover:text-primary/70 transition-colors"
                        >
                          Approve
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                          <span className="text-[12px] text-green-600">Done</span>
                        </div>
                      )}
                      <button
                        onClick={() => setDeleteTarget(log)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Delete entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        <p className="text-[12px] text-muted-foreground mt-3 text-center">
          <Briefcase className="w-3 h-3 inline mr-1" />
          Job icon = entry derived from a completed booking
        </p>
      </div>

      <AddTimeLogDialog open={addOpen} onOpenChange={setAddOpen} />

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Time Entry</DialogTitle>
          </DialogHeader>
          <p className="text-[14px] text-muted-foreground pt-2">
            Remove this {deleteTarget?.hours}h entry for {emp(deleteTarget?.employeeId ?? -1)?.name}
            {deleteTarget ? ` on ${format(new Date(deleteTarget.date), 'MMM d, yyyy')}` : ''}? This can't be undone.
          </p>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              className="flex-1 bg-red-500 hover:bg-red-600 text-white border-0"
              onClick={() => deleteTarget && deleteMutation.mutate({ id: deleteTarget.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
