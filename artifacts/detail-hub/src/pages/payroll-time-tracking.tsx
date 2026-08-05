import { useState } from 'react';
import { employees } from '@/lib/mock-data';
import { timeLogs, approveTimeLog, approveBulkTimeLogs } from '@/lib/payroll-data';
import { ArrowLeft, CheckCircle, Briefcase, Filter } from 'lucide-react';
import { Link } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export default function PayrollTimeTracking() {
  const [, rerender] = useState(0);
  const [empFilter, setEmpFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved'>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const filtered = timeLogs
    .filter(l => empFilter === 'all' || l.employee_id === empFilter)
    .filter(l => statusFilter === 'all' || l.status === statusFilter)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const pendingIds = filtered.filter(l => l.status === 'pending').map(l => l.id);

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const handleApprove = (id: number) => {
    approveTimeLog(id);
    const next = new Set(selected);
    next.delete(id);
    setSelected(next);
    rerender(n => n + 1);
  };

  const handleBulkApprove = () => {
    const pendingSelected = [...selected].filter(id => timeLogs.find(l => l.id === id)?.status === 'pending');
    if (pendingSelected.length > 0) {
      approveBulkTimeLogs(pendingSelected);
    } else if (pendingIds.length > 0) {
      approveBulkTimeLogs(pendingIds);
    }
    setSelected(new Set());
    rerender(n => n + 1);
  };

  const emp = (id: number) => employees.find(e => e.id === id);
  const pendingCount = timeLogs.filter(l => l.status === 'pending').length;

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
              <p className="text-[13px] text-muted-foreground mt-0.5">{pendingCount} entry{pendingCount !== 1 ? 's' : ''} pending approval</p>
            )}
          </div>
          {pendingCount > 0 && (
            <Button size="sm" onClick={handleBulkApprove} className="gradient-btn text-[13px]">
              Approve {selected.size > 0 ? `${selected.size} selected` : 'all pending'}
            </Button>
          )}
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

        {/* Table */}
        <Card className="overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_1fr_1fr_60px_80px_80px] gap-3 px-4 py-2.5 border-b border-border/50 bg-muted/30">
            {['Date', 'Employee', 'Role', 'Hrs', 'Source', 'Status'].map(h => (
              <p key={h} className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</p>
            ))}
          </div>

          {/* Rows */}
          <div className="divide-y divide-border/40">
            {filtered.length === 0 && (
              <div className="px-4 py-8 text-center text-[14px] text-muted-foreground">No entries match the filter</div>
            )}
            {filtered.map(log => {
              const e = emp(log.employee_id);
              const isPending = log.status === 'pending';
              return (
                <div
                  key={log.id}
                  className={`grid grid-cols-[1fr_1fr_1fr_60px_80px_80px] gap-3 px-4 py-3 items-center ${isPending ? 'cursor-pointer hover:bg-muted/30' : ''} transition-colors`}
                  onClick={() => isPending && toggleSelect(log.id)}
                >
                  <p className="text-[13px] tabular-nums">{format(new Date(log.date), 'MMM d')}</p>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e?.color }} />
                    <p className="text-[13px] truncate">{e?.name.split(' ')[0]}</p>
                  </div>
                  <p className="text-[13px] truncate">{log.role}</p>
                  <p className="text-[13px] font-medium tabular-nums">{log.hours}h</p>
                  <div className="flex items-center gap-1">
                    {log.source === 'derived_from_booking' && (
                      <Briefcase className="w-3 h-3 text-muted-foreground shrink-0" title="From booking" />
                    )}
                    <span className="text-[11px] text-muted-foreground truncate">
                      {log.source === 'derived_from_booking' ? 'Job' : 'Manual'}
                    </span>
                  </div>
                  <div>
                    {isPending ? (
                      <button
                        onClick={e => { e.stopPropagation(); handleApprove(log.id); }}
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
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <p className="text-[12px] text-muted-foreground mt-3 text-center">
          <Briefcase className="w-3 h-3 inline mr-1" />
          Job icon = entry derived from a completed booking
        </p>
      </div>
    </div>
  );
}
