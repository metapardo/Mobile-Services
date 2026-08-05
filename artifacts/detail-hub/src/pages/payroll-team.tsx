import { useState } from 'react';
import { employees } from '@/lib/mock-data';
import { payProfiles, updatePayProfile, addBankAccount, type EmployeeRole, type WorkerType, type PaymentMethod } from '@/lib/payroll-data';
import { ArrowLeft, ChevronDown, ChevronUp, Plus, CreditCard } from 'lucide-react';
import { Link } from 'wouter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function PayTypeChip({ pay_type }: { pay_type: string }) {
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
      pay_type === 'hourly' ? 'bg-blue-100 text-blue-700' :
      pay_type === 'commission' ? 'bg-purple-100 text-purple-700' :
      'bg-muted text-muted-foreground'
    }`}>
      {pay_type === 'hourly' ? 'Hourly' : 'Commission'}
    </span>
  );
}

export default function PayrollTeam() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [, rerender] = useState(0);
  const [addingBank, setAddingBank] = useState<number | null>(null);
  const [bankForm, setBankForm] = useState({ bank_name: '', account_last4: '' });

  const toggle = (id: number) => setExpanded(e => e === id ? null : id);

  const handleRoleChange = (empId: number, roleIdx: number, field: keyof EmployeeRole, value: any) => {
    const p = payProfiles.find(p => p.employee_id === empId);
    if (!p) return;
    (p.roles[roleIdx] as any)[field] = field === 'hourly_rate' || field === 'commission_rate' ? parseFloat(value) || 0 : value;
    rerender(n => n + 1);
  };

  const handleProfileChange = (empId: number, field: 'worker_type' | 'payment_method', value: string) => {
    updatePayProfile(empId, { [field]: value } as any);
    rerender(n => n + 1);
  };

  const handleAddBank = (empId: number) => {
    if (!bankForm.bank_name || !bankForm.account_last4) return;
    addBankAccount(empId, bankForm);
    setBankForm({ bank_name: '', account_last4: '' });
    setAddingBank(null);
    rerender(n => n + 1);
  };

  return (
    <div className="min-h-[100dvh] pb-24 md:pb-8">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <Link href="/more/payroll" className="inline-flex items-center gap-1.5 text-muted-foreground mb-5 hover:text-foreground transition-colors text-[14px]">
          <ArrowLeft className="w-4 h-4" /> Payroll Overview
        </Link>
        <h1 className="text-2xl font-semibold mb-6">Team &amp; Pay Rates</h1>

        <div className="space-y-3">
          {employees.map(emp => {
            const profile = payProfiles.find(p => p.employee_id === emp.id);
            if (!profile) return null;
            const open = expanded === emp.id;

            return (
              <Card key={emp.id} className="overflow-hidden" data-testid={`team-emp-${emp.id}`}>
                {/* Summary row */}
                <button
                  className="w-full px-4 py-4 flex items-center gap-3 text-left hover:brightness-95 transition-all"
                  onClick={() => toggle(emp.id)}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px] font-bold shrink-0"
                    style={{ backgroundColor: emp.color }}>
                    {emp.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold">{emp.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {profile.roles.map((r, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <span className="text-[12px] text-muted-foreground">{r.role}</span>
                          <PayTypeChip pay_type={r.pay_type} />
                          <span className="text-[12px] text-muted-foreground">
                            {r.pay_type === 'hourly' ? `$${r.hourly_rate}/hr` : `${r.commission_rate}%`}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {profile.worker_type === 'w2_employee' ? 'W-2' : '1099'}
                    </span>
                    {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {open && (
                  <div className="border-t border-border/50 px-4 py-4 space-y-5">
                    {/* Roles */}
                    <div>
                      <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-3">Roles &amp; Pay</p>
                      <div className="space-y-3">
                        {profile.roles.map((role, ri) => (
                          <div key={ri} className="p-3 rounded-xl bg-muted/50 space-y-2">
                            <div className="flex items-center gap-2">
                              <input
                                className="flex-1 text-[14px] font-medium bg-transparent border-b border-border/60 pb-0.5 focus:outline-none focus:border-primary"
                                value={role.role}
                                onChange={e => handleRoleChange(emp.id, ri, 'role', e.target.value)}
                              />
                              <select
                                className="text-[13px] bg-background border border-border rounded-lg px-2 py-1 focus:outline-none"
                                value={role.pay_type}
                                onChange={e => handleRoleChange(emp.id, ri, 'pay_type', e.target.value)}
                              >
                                <option value="hourly">Hourly</option>
                                <option value="commission">Commission</option>
                              </select>
                            </div>
                            {role.pay_type === 'hourly' && (
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] text-muted-foreground">Rate</span>
                                <div className="flex items-center border border-border rounded-lg overflow-hidden">
                                  <span className="px-2 text-[13px] text-muted-foreground bg-muted">$</span>
                                  <input
                                    type="number"
                                    className="w-20 px-2 py-1 text-[13px] bg-transparent focus:outline-none"
                                    value={role.hourly_rate ?? ''}
                                    onChange={e => handleRoleChange(emp.id, ri, 'hourly_rate', e.target.value)}
                                  />
                                  <span className="px-2 text-[13px] text-muted-foreground bg-muted">/hr</span>
                                </div>
                              </div>
                            )}
                            {role.pay_type === 'commission' && (
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] text-muted-foreground">Rate</span>
                                <div className="flex items-center border border-border rounded-lg overflow-hidden">
                                  <input
                                    type="number"
                                    className="w-16 px-2 py-1 text-[13px] bg-transparent focus:outline-none"
                                    value={role.commission_rate ?? ''}
                                    onChange={e => handleRoleChange(emp.id, ri, 'commission_rate', e.target.value)}
                                  />
                                  <span className="px-2 text-[13px] text-muted-foreground bg-muted">%</span>
                                </div>
                                <span className="text-[12px] text-muted-foreground">of revenue</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Worker type + payment method */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Worker Type</p>
                        <select
                          className="w-full text-[13px] bg-background border border-border rounded-xl px-3 py-2 focus:outline-none"
                          value={profile.worker_type}
                          onChange={e => handleProfileChange(emp.id, 'worker_type', e.target.value)}
                        >
                          <option value="w2_employee">W-2 Employee</option>
                          <option value="1099_contractor">1099 Contractor</option>
                        </select>
                      </div>
                      <div>
                        <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Payment</p>
                        <select
                          className="w-full text-[13px] bg-background border border-border rounded-xl px-3 py-2 focus:outline-none"
                          value={profile.payment_method}
                          onChange={e => handleProfileChange(emp.id, 'payment_method', e.target.value)}
                        >
                          <option value="direct_deposit">Direct Deposit</option>
                          <option value="check">Check</option>
                        </select>
                      </div>
                    </div>

                    {/* Bank accounts */}
                    <div>
                      <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Bank Accounts</p>
                      {profile.bank_accounts.length === 0 && (
                        <p className="text-[13px] text-muted-foreground mb-2">No accounts on file</p>
                      )}
                      {profile.bank_accounts.map(acct => (
                        <div key={acct.id} className="flex items-center gap-2 py-2 border-b border-border/50 last:border-0">
                          <CreditCard className="w-4 h-4 text-muted-foreground" />
                          <span className="text-[14px]">{acct.bank_name}</span>
                          <span className="text-[13px] text-muted-foreground ml-auto">••••{acct.account_last4}</span>
                        </div>
                      ))}
                      {addingBank === emp.id ? (
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
                            onChange={e => setBankForm(f => ({ ...f, account_last4: e.target.value }))}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => handleAddBank(emp.id)} className="gradient-btn">Add</Button>
                            <Button size="sm" variant="ghost" onClick={() => setAddingBank(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingBank(emp.id)}
                          className="mt-2 flex items-center gap-1.5 text-[13px] text-primary hover:opacity-80 transition-opacity"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add New Bank Account
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
