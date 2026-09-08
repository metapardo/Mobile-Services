import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListEmployees,
  useCreateEmployee,
  useUpdateEmployee,
  useListEmployeeRoles,
  useCreateEmployeeRole,
  useUpdateEmployeeRole,
  useDeleteEmployeeRole,
  getListEmployeesQueryKey,
  getListEmployeeRolesQueryKey,
  type EmployeeResult,
  type EmployeeRoleResult,
  type BankAccount,
} from '@workspace/api-client-react';
import { ArrowLeft, ChevronDown, ChevronUp, Plus, CreditCard, Trash2, Loader2, AlertTriangle, UsersRound, X } from 'lucide-react';
import { Link } from 'wouter';
import { Card } from '@workspace/blue-glass-design-system/components/ui/card';
import { Button } from '@workspace/blue-glass-design-system/components/ui/button';
import { Input } from '@workspace/blue-glass-design-system/components/ui/input';
import { Label } from '@workspace/blue-glass-design-system/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@workspace/blue-glass-design-system/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@workspace/blue-glass-design-system/components/ui/alert-dialog';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '@workspace/blue-glass-design-system/components/ui/empty';
import { useToast } from '@workspace/blue-glass-design-system/hooks/use-toast';

const EMPLOYEE_COLORS = ['#3654FF', '#1E9E62', '#D9A404', '#DC2626', '#9333EA', '#0891B2', '#EA580C', '#DB2777'];

type PayType = 'hourly' | 'commission';

function PayTypeChip({ payType }: { payType: PayType }) {
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
      payType === 'hourly' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
    }`}>
      {payType === 'hourly' ? 'Hourly' : 'Commission'}
    </span>
  );
}

/** One role's inline editor — auto-saves on blur (text/number) or immediately (select),
 * matching this page's pre-existing "no separate save button" UX. */
function RoleRow({ employeeId, role, onDeleteRequest }: { employeeId: number; role: EmployeeRoleResult; onDeleteRequest: (role: EmployeeRoleResult) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [roleName, setRoleName] = useState(role.roleName);
  const [hourlyRate, setHourlyRate] = useState(role.hourlyRate ?? 0);
  const [commissionRate, setCommissionRate] = useState(role.commissionRate ?? 0);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListEmployeeRolesQueryKey(employeeId) });

  const updateMutation = useUpdateEmployeeRole({
    mutation: {
      onSuccess: invalidate,
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong saving this role. Please try again.';
        toast({ title: 'Save failed', description: message, variant: 'destructive' });
      },
    },
  });

  const saveRoleName = () => {
    if (roleName.trim() && roleName !== role.roleName) {
      updateMutation.mutate({ employeeId, roleId: role.id, data: { roleName: roleName.trim() } });
    }
  };

  const saveRate = () => {
    if (role.payType === 'hourly' && hourlyRate !== role.hourlyRate) {
      updateMutation.mutate({ employeeId, roleId: role.id, data: { hourlyRate } });
    }
    if (role.payType === 'commission' && commissionRate !== role.commissionRate) {
      updateMutation.mutate({ employeeId, roleId: role.id, data: { commissionRate } });
    }
  };

  const switchPayType = (payType: PayType) => {
    if (payType === role.payType) return;
    updateMutation.mutate({
      employeeId,
      roleId: role.id,
      data: {
        payType,
        hourlyRate: payType === 'hourly' ? (hourlyRate || 0) : null,
        commissionRate: payType === 'commission' ? (commissionRate || 0) : null,
      },
    });
  };

  return (
    <div className="p-3 rounded-xl bg-muted/50 space-y-2" data-testid={`role-${role.id}`}>
      <div className="flex items-center gap-2">
        <input
          className="flex-1 text-[14px] font-medium bg-transparent border-b border-border/60 pb-0.5 focus:outline-none focus:border-primary"
          value={roleName}
          onChange={e => setRoleName(e.target.value)}
          onBlur={saveRoleName}
        />
        <select
          className="text-[13px] bg-background border border-border rounded-lg px-2 py-1 focus:outline-none"
          value={role.payType}
          onChange={e => switchPayType(e.target.value as PayType)}
        >
          <option value="hourly">Hourly</option>
          <option value="commission">Commission</option>
        </select>
        <button
          onClick={() => onDeleteRequest(role)}
          className="text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Remove role"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {role.payType === 'hourly' ? (
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted-foreground">Rate</span>
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <span className="px-2 text-[13px] text-muted-foreground bg-muted">$</span>
            <input
              type="number"
              min={0}
              className="w-20 px-2 py-1 text-[13px] bg-transparent focus:outline-none"
              value={hourlyRate}
              onChange={e => setHourlyRate(parseFloat(e.target.value) || 0)}
              onBlur={saveRate}
            />
            <span className="px-2 text-[13px] text-muted-foreground bg-muted">/hr</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-muted-foreground">Rate</span>
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <input
              type="number"
              min={0}
              max={100}
              className="w-16 px-2 py-1 text-[13px] bg-transparent focus:outline-none"
              value={commissionRate}
              onChange={e => setCommissionRate(parseFloat(e.target.value) || 0)}
              onBlur={saveRate}
            />
            <span className="px-2 text-[13px] text-muted-foreground bg-muted">%</span>
          </div>
          <span className="text-[12px] text-muted-foreground">of revenue</span>
        </div>
      )}
    </div>
  );
}

function TeamMemberCard({ employee, expanded, onToggle }: { employee: EmployeeResult; expanded: boolean; onToggle: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addingRole, setAddingRole] = useState(false);
  const [newRole, setNewRole] = useState<{ roleName: string; payType: PayType; rate: number }>({ roleName: '', payType: 'hourly', rate: 0 });
  const [roleDeleteTarget, setRoleDeleteTarget] = useState<EmployeeRoleResult | null>(null);
  const [addingBank, setAddingBank] = useState(false);
  const [bankForm, setBankForm] = useState({ bank_name: '', account_last4: '' });

  const rolesQuery = useListEmployeeRoles(employee.id, {
    query: { queryKey: getListEmployeeRolesQueryKey(employee.id), enabled: expanded },
  });
  const roles = rolesQuery.data ?? [];

  const invalidateEmployees = () => queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
  const invalidateRoles = () => queryClient.invalidateQueries({ queryKey: getListEmployeeRolesQueryKey(employee.id) });

  const updateEmployeeMutation = useUpdateEmployee({
    mutation: {
      onSuccess: invalidateEmployees,
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong saving. Please try again.';
        toast({ title: 'Save failed', description: message, variant: 'destructive' });
      },
    },
  });

  const createRoleMutation = useCreateEmployeeRole({
    mutation: {
      onSuccess: async () => {
        await invalidateRoles();
        setAddingRole(false);
        setNewRole({ roleName: '', payType: 'hourly', rate: 0 });
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong adding this role. Please try again.';
        toast({ title: 'Add role failed', description: message, variant: 'destructive' });
      },
    },
  });

  const deleteRoleMutation = useDeleteEmployeeRole({
    mutation: {
      onSuccess: async () => {
        await invalidateRoles();
        setRoleDeleteTarget(null);
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong removing this role. Please try again.';
        toast({ title: 'Remove role failed', description: message, variant: 'destructive' });
      },
    },
  });

  const handleAddRole = () => {
    if (!newRole.roleName.trim()) return;
    createRoleMutation.mutate({
      employeeId: employee.id,
      data: {
        roleName: newRole.roleName.trim(),
        payType: newRole.payType,
        hourlyRate: newRole.payType === 'hourly' ? newRole.rate : null,
        commissionRate: newRole.payType === 'commission' ? newRole.rate : null,
      },
    });
  };

  const handleAddBank = () => {
    if (!bankForm.bank_name.trim() || !bankForm.account_last4.trim()) return;
    const newAccount: BankAccount = {
      id: crypto.randomUUID(),
      bank_name: bankForm.bank_name.trim(),
      account_last4: bankForm.account_last4.trim().slice(-4),
      is_default: employee.bankAccounts.length === 0,
    };
    updateEmployeeMutation.mutate({ id: employee.id, data: { bankAccounts: [...employee.bankAccounts, newAccount] } });
    setBankForm({ bank_name: '', account_last4: '' });
    setAddingBank(false);
  };

  const handleSetDefaultBank = (accountId: string) => {
    const updated = employee.bankAccounts.map(a => ({ ...a, is_default: a.id === accountId }));
    updateEmployeeMutation.mutate({ id: employee.id, data: { bankAccounts: updated } });
  };

  const handleRemoveBank = (accountId: string) => {
    const remaining = employee.bankAccounts.filter(a => a.id !== accountId);
    if (remaining.length > 0 && !remaining.some(a => a.is_default)) remaining[0].is_default = true;
    updateEmployeeMutation.mutate({ id: employee.id, data: { bankAccounts: remaining } });
  };

  return (
    <Card className="overflow-hidden" data-testid={`team-emp-${employee.id}`}>
      <button
        className="w-full px-4 py-4 flex items-center gap-3 text-left hover:brightness-95 transition-all"
        onClick={onToggle}
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px] font-bold shrink-0"
          style={{ backgroundColor: employee.color }}>
          {employee.name.split(' ').map(n => n[0]).join('')}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold">{employee.name}</p>
          {!expanded && (
            <p className="text-[12px] text-muted-foreground mt-0.5">Tap to manage roles &amp; pay</p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
            {employee.workerType === 'w2_employee' ? 'W-2' : '1099'}
          </span>
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-4 py-4 space-y-5">
          {/* Roles */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide">Roles &amp; Pay</p>
            </div>
            {rolesQuery.isLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {roles.map(role => (
                  <div key={role.id} className="flex items-start gap-2">
                    <div className="flex-1">
                      <RoleRow employeeId={employee.id} role={role} onDeleteRequest={setRoleDeleteTarget} />
                    </div>
                  </div>
                ))}
                {roles.length === 0 && !addingRole && (
                  <p className="text-[13px] text-muted-foreground">No pay roles yet — add one so hours or commission can be paid out.</p>
                )}
                {addingRole ? (
                  <div className="p-3 rounded-xl border border-dashed border-border space-y-2">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Role name (e.g. Detailer)"
                        value={newRole.roleName}
                        onChange={e => setNewRole(f => ({ ...f, roleName: e.target.value }))}
                        className="flex-1"
                      />
                      <select
                        className="text-[13px] bg-background border border-border rounded-lg px-2 py-1.5 focus:outline-none"
                        value={newRole.payType}
                        onChange={e => setNewRole(f => ({ ...f, payType: e.target.value as PayType }))}
                      >
                        <option value="hourly">Hourly</option>
                        <option value="commission">Commission</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-muted-foreground">Rate</span>
                      <Input
                        type="number"
                        min={0}
                        max={newRole.payType === 'commission' ? 100 : undefined}
                        value={newRole.rate}
                        onChange={e => setNewRole(f => ({ ...f, rate: parseFloat(e.target.value) || 0 }))}
                        className="w-24"
                      />
                      <span className="text-[13px] text-muted-foreground">{newRole.payType === 'hourly' ? '/hr' : '% of revenue'}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleAddRole} disabled={createRoleMutation.isPending} className="gradient-btn">
                        {createRoleMutation.isPending ? 'Adding…' : 'Add Role'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAddingRole(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingRole(true)}
                    className="flex items-center gap-1.5 text-[13px] text-primary hover:opacity-80 transition-opacity"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Role
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Worker type + payment method */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Worker Type</p>
              <select
                className="w-full text-[13px] bg-background border border-border rounded-xl px-3 py-2 focus:outline-none"
                value={employee.workerType}
                onChange={e => updateEmployeeMutation.mutate({ id: employee.id, data: { workerType: e.target.value as EmployeeResult['workerType'] } })}
              >
                <option value="w2_employee">W-2 Employee</option>
                <option value="1099_contractor">1099 Contractor</option>
              </select>
            </div>
            <div>
              <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payment</p>
              <select
                className="w-full text-[13px] bg-background border border-border rounded-xl px-3 py-2 focus:outline-none"
                value={employee.paymentMethod}
                onChange={e => updateEmployeeMutation.mutate({ id: employee.id, data: { paymentMethod: e.target.value as EmployeeResult['paymentMethod'] } })}
              >
                <option value="direct_deposit">Direct Deposit</option>
                <option value="check">Check</option>
              </select>
            </div>
          </div>

          {/* Bank accounts */}
          <div>
            <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Bank Accounts</p>
            {employee.bankAccounts.length === 0 && (
              <p className="text-[13px] text-muted-foreground mb-2">No accounts on file</p>
            )}
            {employee.bankAccounts.map(acct => (
              <div key={acct.id} className="flex items-center gap-2 py-2 border-b border-border/50 last:border-0">
                <CreditCard className="w-4 h-4 text-muted-foreground" />
                <span className="text-[14px]">{acct.bank_name}</span>
                <span className="text-[13px] text-muted-foreground">••••{acct.account_last4}</span>
                {acct.is_default ? (
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary ml-auto">Default</span>
                ) : (
                  <button
                    onClick={() => handleSetDefaultBank(acct.id)}
                    className="text-[12px] text-primary hover:opacity-80 transition-opacity ml-auto"
                  >
                    Set default
                  </button>
                )}
                <button
                  onClick={() => handleRemoveBank(acct.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Remove bank account"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {addingBank ? (
              <div className="mt-2 space-y-2">
                <input
                  className="w-full text-[13px] border border-border rounded-xl px-3 py-2 bg-background focus:outline-none focus:border-primary"
                  placeholder="Bank name"
                  value={bankForm.bank_name}
                  onChange={e => setBankForm(f => ({ ...f, bank_name: e.target.value }))}
                />
                <input
                  className="w-full text-[13px] border border-border rounded-xl px-3 py-2 bg-background focus:outline-none focus:border-primary"
                  placeholder="Last 4 digits"
                  maxLength={4}
                  value={bankForm.account_last4}
                  onChange={e => setBankForm(f => ({ ...f, account_last4: e.target.value.replace(/\D/g, '') }))}
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddBank} disabled={updateEmployeeMutation.isPending} className="gradient-btn">Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => setAddingBank(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingBank(true)}
                className="mt-2 flex items-center gap-1.5 text-[13px] text-primary hover:opacity-80 transition-opacity"
              >
                <Plus className="w-3.5 h-3.5" /> Add New Bank Account
              </button>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={!!roleDeleteTarget} onOpenChange={(open) => !open && setRoleDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Role</AlertDialogTitle>
            <AlertDialogDescription>
              Remove "{roleDeleteTarget?.roleName}" from {employee.name}? This can't be undone — existing time logs
              and past payroll runs referencing it are unaffected, but no new hours or commission can be recorded
              against it going forward.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => roleDeleteTarget && deleteRoleMutation.mutate({ employeeId: employee.id, roleId: roleDeleteTarget.id })}
              disabled={deleteRoleMutation.isPending}
            >
              {deleteRoleMutation.isPending ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function PayrollTeam() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ name: '', color: EMPLOYEE_COLORS[0], email: '', phone: '' });

  const employeesQuery = useListEmployees();
  const employees = employeesQuery.data ?? [];

  const invalidateEmployees = () => queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });

  const createEmployeeMutation = useCreateEmployee({
    mutation: {
      onSuccess: async () => {
        await invalidateEmployees();
        toast({ title: 'Team member added' });
        setAddOpen(false);
        setNewEmployee({ name: '', color: EMPLOYEE_COLORS[0], email: '', phone: '' });
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong adding this team member. Please try again.';
        toast({ title: 'Add failed', description: message, variant: 'destructive' });
      },
    },
  });

  const handleAddEmployee = () => {
    if (!newEmployee.name.trim()) return;
    createEmployeeMutation.mutate({
      data: {
        name: newEmployee.name.trim(),
        color: newEmployee.color,
        email: newEmployee.email.trim() || undefined,
        phone: newEmployee.phone.trim() || undefined,
      },
    });
  };

  const toggle = (id: number) => setExpanded(e => (e === id ? null : id));

  return (
    <div className="min-h-[100dvh] pb-24 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <Link href="/more/payroll" className="inline-flex items-center gap-1.5 text-muted-foreground mb-5 hover:text-foreground transition-colors text-[14px]">
          <ArrowLeft className="w-4 h-4" /> Payroll Overview
        </Link>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold">Team &amp; Pay Rates</h1>
          <Button size="sm" onClick={() => setAddOpen(true)} data-testid="button-new-employee">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        </div>

        {employeesQuery.isError ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="text-[15px] font-semibold">Couldn't load your team</p>
            <p className="text-[13px] text-muted-foreground max-w-[280px]">Check your connection and try again.</p>
          </div>
        ) : employeesQuery.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
          </div>
        ) : employees.length === 0 ? (
          <Empty className="border border-border rounded-xl bg-card" data-testid="empty-state-team">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UsersRound />
              </EmptyMedia>
              <EmptyTitle>No team members yet</EmptyTitle>
              <EmptyDescription>
                Add your first team member to set up pay roles, rates, and payment info.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={() => setAddOpen(true)} data-testid="button-add-first-employee">
                <Plus className="w-4 h-4 mr-1" /> Add your first team member
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="space-y-3">
            {employees.map(emp => (
              <TeamMemberCard key={emp.id} employee={emp} expanded={expanded === emp.id} onToggle={() => toggle(emp.id)} />
            ))}
          </div>
        )}

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="emp-name">Name</Label>
                <Input
                  id="emp-name"
                  value={newEmployee.name}
                  onChange={(e) => setNewEmployee(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label>Color</Label>
                <div className="flex gap-2 mt-1">
                  {EMPLOYEE_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewEmployee(f => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-full transition-transform ${newEmployee.color === c ? 'ring-2 ring-offset-2 ring-primary scale-110' : ''}`}
                      style={{ backgroundColor: c }}
                      aria-label={`Choose color ${c}`}
                    />
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="emp-email">Email (optional)</Label>
                <Input
                  id="emp-email"
                  type="email"
                  value={newEmployee.email}
                  onChange={(e) => setNewEmployee(f => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="emp-phone">Phone (optional)</Label>
                <Input
                  id="emp-phone"
                  value={newEmployee.phone}
                  onChange={(e) => setNewEmployee(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <Button
                onClick={handleAddEmployee}
                className="w-full"
                disabled={createEmployeeMutation.isPending || !newEmployee.name.trim()}
              >
                {createEmployeeMutation.isPending ? 'Adding…' : 'Add Team Member'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
