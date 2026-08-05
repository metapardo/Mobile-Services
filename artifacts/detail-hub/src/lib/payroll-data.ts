import { employees, bookings, packages } from './mock-data';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PayType = 'hourly' | 'commission';
export type WorkerType = 'w2_employee' | '1099_contractor';
export type PaymentMethod = 'direct_deposit' | 'check';

export interface EmployeeRole {
  role: string;
  pay_type: PayType;
  hourly_rate?: number;
  commission_rate?: number; // percentage, e.g. 30 = 30%
}

export interface BankAccount {
  id: number;
  bank_name: string;
  account_last4: string;
}

export interface EmployeePayProfile {
  employee_id: number;
  worker_type: WorkerType;
  payment_method: PaymentMethod;
  roles: EmployeeRole[];
  bank_accounts: BankAccount[];
}

export type TimeLogSource = 'manual' | 'derived_from_booking';
export type TimeLogStatus = 'pending' | 'approved';

export interface TimeLog {
  id: number;
  employee_id: number;
  date: string; // YYYY-MM-DD
  role: string;
  hours: number;
  status: TimeLogStatus;
  source: TimeLogSource;
  booking_id?: number;
  notes?: string;
}

export type TimeOffType = 'vacation' | 'sick' | 'personal';
export type TimeOffStatus = 'pending' | 'approved' | 'denied';

export interface TimeOffRequest {
  id: number;
  employee_id: number;
  start_date: string;
  end_date: string;
  type: TimeOffType;
  status: TimeOffStatus;
  notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
}

export type PayrollRunStatus = 'draft' | 'paid' | 'report';
export type DurationType = 'weekly' | 'biweekly' | 'monthly' | 'custom';

export interface PayrollEmployeeSummary {
  employee_id: number;
  hourly_pay: number;
  commission_pay: number;
  tips: number;
  gross_pay: number;
  net_pay: number;
}

export interface PayrollRun {
  id: number;
  period_start: string;
  period_end: string;
  duration_type: DurationType;
  status: PayrollRunStatus;
  total_paid: number;
  created_at: string;
  employee_summaries: PayrollEmployeeSummary[];
  report_url?: string;
}

// ─── Pay Profiles ─────────────────────────────────────────────────────────────

export let payProfiles: EmployeePayProfile[] = [
  {
    employee_id: 1, // Marcus Webb — commission-only detailer, 1099
    worker_type: '1099_contractor',
    payment_method: 'direct_deposit',
    roles: [{ role: 'Detailer', pay_type: 'commission', commission_rate: 30 }],
    bank_accounts: [{ id: 1, bank_name: 'Chase', account_last4: '4521' }],
  },
  {
    employee_id: 2, // Deja Thornton — commission-only detailer, W-2
    worker_type: 'w2_employee',
    payment_method: 'direct_deposit',
    roles: [{ role: 'Detailer', pay_type: 'commission', commission_rate: 28 }],
    bank_accounts: [{ id: 2, bank_name: 'Bank of America', account_last4: '7832' }],
  },
  {
    employee_id: 3, // Carlos Reyes — hourly front desk, W-2
    worker_type: 'w2_employee',
    payment_method: 'check',
    roles: [{ role: 'Front Desk', pay_type: 'hourly', hourly_rate: 18 }],
    bank_accounts: [],
  },
  {
    employee_id: 4, // Tanya Osei — both roles, 1099
    worker_type: '1099_contractor',
    payment_method: 'direct_deposit',
    roles: [
      { role: 'Detailer', pay_type: 'commission', commission_rate: 25 },
      { role: 'Front Desk', pay_type: 'hourly', hourly_rate: 16 },
    ],
    bank_accounts: [{ id: 3, bank_name: 'Wells Fargo', account_last4: '1190' }],
  },
];

// ─── Time Logs ────────────────────────────────────────────────────────────────
// 3 weeks of entries: Jul 14–18, Jul 21–25, Jul 28–Aug 1, + current week Aug 4–8

export let timeLogs: TimeLog[] = [
  // ── Week of Jul 14–18 ──
  { id: 1,  employee_id: 3, date: '2026-07-14', role: 'Front Desk', hours: 8, status: 'approved', source: 'manual' },
  { id: 2,  employee_id: 3, date: '2026-07-15', role: 'Front Desk', hours: 8, status: 'approved', source: 'manual' },
  { id: 3,  employee_id: 3, date: '2026-07-16', role: 'Front Desk', hours: 8, status: 'approved', source: 'manual' },
  { id: 4,  employee_id: 3, date: '2026-07-17', role: 'Front Desk', hours: 8, status: 'approved', source: 'manual' },
  { id: 5,  employee_id: 3, date: '2026-07-18', role: 'Front Desk', hours: 6, status: 'approved', source: 'manual' },
  { id: 6,  employee_id: 4, date: '2026-07-15', role: 'Front Desk', hours: 5, status: 'approved', source: 'manual' },
  { id: 7,  employee_id: 4, date: '2026-07-17', role: 'Front Desk', hours: 4, status: 'approved', source: 'manual' },

  // ── Week of Jul 21–25 ──
  { id: 8,  employee_id: 3, date: '2026-07-21', role: 'Front Desk', hours: 8, status: 'approved', source: 'manual' },
  { id: 9,  employee_id: 3, date: '2026-07-22', role: 'Front Desk', hours: 8, status: 'approved', source: 'manual' },
  { id: 10, employee_id: 3, date: '2026-07-23', role: 'Front Desk', hours: 8, status: 'approved', source: 'manual' },
  { id: 11, employee_id: 3, date: '2026-07-24', role: 'Front Desk', hours: 8, status: 'approved', source: 'manual' },
  { id: 12, employee_id: 3, date: '2026-07-25', role: 'Front Desk', hours: 7, status: 'approved', source: 'manual' },
  { id: 13, employee_id: 4, date: '2026-07-22', role: 'Front Desk', hours: 6, status: 'approved', source: 'manual' },
  { id: 14, employee_id: 4, date: '2026-07-24', role: 'Front Desk', hours: 5, status: 'approved', source: 'manual' },
  { id: 15, employee_id: 1, date: '2026-07-23', role: 'Detailer',   hours: 6, status: 'approved', source: 'derived_from_booking', booking_id: 14 },
  { id: 16, employee_id: 2, date: '2026-07-25', role: 'Detailer',   hours: 4, status: 'approved', source: 'derived_from_booking', booking_id: 14 },

  // ── Week of Jul 28–Aug 1 ──
  { id: 17, employee_id: 3, date: '2026-07-28', role: 'Front Desk', hours: 8, status: 'approved', source: 'manual' },
  { id: 18, employee_id: 3, date: '2026-07-29', role: 'Front Desk', hours: 8, status: 'approved', source: 'manual' },
  { id: 19, employee_id: 3, date: '2026-07-30', role: 'Front Desk', hours: 8, status: 'approved', source: 'manual' },
  { id: 20, employee_id: 3, date: '2026-07-31', role: 'Front Desk', hours: 8, status: 'approved', source: 'manual' },
  { id: 21, employee_id: 3, date: '2026-08-01', role: 'Front Desk', hours: 5, status: 'approved', source: 'manual' },
  { id: 22, employee_id: 4, date: '2026-07-29', role: 'Front Desk', hours: 7, status: 'approved', source: 'manual' },
  { id: 23, employee_id: 4, date: '2026-07-31', role: 'Front Desk', hours: 4, status: 'approved', source: 'manual' },
  { id: 24, employee_id: 1, date: '2026-07-28', role: 'Detailer',   hours: 5, status: 'approved', source: 'derived_from_booking', booking_id: 13 },
  { id: 25, employee_id: 2, date: '2026-07-30', role: 'Detailer',   hours: 6, status: 'approved', source: 'derived_from_booking', booking_id: 15 },

  // ── Current week Aug 4–8 (mix of approved + pending) ──
  { id: 26, employee_id: 3, date: '2026-08-03', role: 'Front Desk', hours: 8, status: 'approved', source: 'manual' },
  { id: 27, employee_id: 3, date: '2026-08-04', role: 'Front Desk', hours: 8, status: 'approved', source: 'manual' },
  { id: 28, employee_id: 3, date: '2026-08-05', role: 'Front Desk', hours: 8, status: 'pending',  source: 'manual' },
  { id: 29, employee_id: 4, date: '2026-08-04', role: 'Front Desk', hours: 6, status: 'approved', source: 'manual' },
  { id: 30, employee_id: 4, date: '2026-08-05', role: 'Front Desk', hours: 5, status: 'pending',  source: 'manual' },
  { id: 31, employee_id: 1, date: '2026-08-04', role: 'Detailer',   hours: 7, status: 'pending',  source: 'derived_from_booking', booking_id: 1 },
  { id: 32, employee_id: 2, date: '2026-08-04', role: 'Detailer',   hours: 5, status: 'pending',  source: 'derived_from_booking', booking_id: 2 },
  { id: 33, employee_id: 4, date: '2026-08-06', role: 'Detailer',   hours: 6, status: 'pending',  source: 'derived_from_booking', booking_id: 5 },
];

let nextTimeLogId = 34;

// ─── Time Off Requests ────────────────────────────────────────────────────────

export let timeOffRequests: TimeOffRequest[] = [
  // Pending — Deja wants vacation next week
  {
    id: 1,
    employee_id: 2,
    start_date: '2026-08-10',
    end_date: '2026-08-14',
    type: 'vacation',
    status: 'pending',
    notes: 'Family trip, planned in advance',
  },
  // Pending — Carlos sick day
  {
    id: 2,
    employee_id: 3,
    start_date: '2026-08-07',
    end_date: '2026-08-07',
    type: 'sick',
    status: 'pending',
    notes: '',
  },
  // Approved — Marcus personal day last week
  {
    id: 3,
    employee_id: 1,
    start_date: '2026-07-28',
    end_date: '2026-07-28',
    type: 'personal',
    status: 'approved',
    reviewed_by: 'Admin',
    reviewed_at: '2026-07-25T10:30:00Z',
  },
  // Denied — Tanya vacation (peak season)
  {
    id: 4,
    employee_id: 4,
    start_date: '2026-08-01',
    end_date: '2026-08-05',
    type: 'vacation',
    status: 'denied',
    notes: 'Peak season',
    reviewed_by: 'Admin',
    reviewed_at: '2026-07-20T14:15:00Z',
  },
  // Approved — Carlos vacation (early July)
  {
    id: 5,
    employee_id: 3,
    start_date: '2026-07-04',
    end_date: '2026-07-05',
    type: 'vacation',
    status: 'approved',
    reviewed_by: 'Admin',
    reviewed_at: '2026-06-28T09:00:00Z',
  },
];

let nextTimeOffId = 6;

// ─── Historical Payroll Runs ───────────────────────────────────────────────────

export let payrollRuns: PayrollRun[] = [
  {
    id: 1,
    period_start: '2026-07-14',
    period_end: '2026-07-20',
    duration_type: 'weekly',
    status: 'paid',
    total_paid: 2847.50,
    created_at: '2026-07-21T10:00:00Z',
    employee_summaries: [
      { employee_id: 1, hourly_pay: 0,      commission_pay: 0,      tips: 0, gross_pay: 0,       net_pay: 0       },
      { employee_id: 2, hourly_pay: 0,      commission_pay: 0,      tips: 0, gross_pay: 0,       net_pay: 0       },
      { employee_id: 3, hourly_pay: 684,    commission_pay: 0,      tips: 0, gross_pay: 684,     net_pay: 547.20  },
      { employee_id: 4, hourly_pay: 144,    commission_pay: 0,      tips: 0, gross_pay: 144,     net_pay: 115.20  },
    ],
  },
  {
    id: 2,
    period_start: '2026-07-21',
    period_end: '2026-07-27',
    duration_type: 'weekly',
    status: 'paid',
    total_paid: 3614.80,
    created_at: '2026-07-28T10:30:00Z',
    employee_summaries: [
      { employee_id: 1, hourly_pay: 0,   commission_pay: 898.50,  tips: 0, gross_pay: 898.50,  net_pay: 718.80  },
      { employee_id: 2, hourly_pay: 0,   commission_pay: 403.20,  tips: 0, gross_pay: 403.20,  net_pay: 322.56  },
      { employee_id: 3, hourly_pay: 702, commission_pay: 0,       tips: 0, gross_pay: 702,     net_pay: 561.60  },
      { employee_id: 4, hourly_pay: 176, commission_pay: 0,       tips: 0, gross_pay: 176,     net_pay: 140.80  },
    ],
  },
];

let nextPayrollRunId = 3;

// ─── Mutation helpers ─────────────────────────────────────────────────────────

export function approveTimeLog(id: number) {
  const log = timeLogs.find(l => l.id === id);
  if (log) log.status = 'approved';
}

export function approveBulkTimeLogs(ids: number[]) {
  ids.forEach(id => approveTimeLog(id));
}

export function approveTimeOffRequest(id: number) {
  const req = timeOffRequests.find(r => r.id === id);
  if (req) {
    req.status = 'approved';
    req.reviewed_by = 'Admin';
    req.reviewed_at = new Date().toISOString();
  }
}

export function denyTimeOffRequest(id: number) {
  const req = timeOffRequests.find(r => r.id === id);
  if (req) {
    req.status = 'denied';
    req.reviewed_by = 'Admin';
    req.reviewed_at = new Date().toISOString();
  }
}

export function updatePayProfile(employeeId: number, updates: Partial<EmployeePayProfile>) {
  const idx = payProfiles.findIndex(p => p.employee_id === employeeId);
  if (idx !== -1) payProfiles[idx] = { ...payProfiles[idx], ...updates };
}

export function addBankAccount(employeeId: number, bank: Omit<BankAccount, 'id'>) {
  const profile = payProfiles.find(p => p.employee_id === employeeId);
  if (profile) {
    const newId = Math.max(0, ...profile.bank_accounts.map(b => b.id)) + 1;
    profile.bank_accounts.push({ ...bank, id: newId });
  }
}

export function savePayrollRun(run: Omit<PayrollRun, 'id'>): PayrollRun {
  const newRun = { ...run, id: nextPayrollRunId++ };
  payrollRuns.unshift(newRun);
  return newRun;
}

// ─── Calculation helpers ──────────────────────────────────────────────────────

export const MOCK_DEDUCTION_RATE = 0.20; // 20% flat illustrative deduction

export interface EmployeePayrollSummary {
  employee_id: number;
  name: string;
  color: string;
  hourly_pay: number;
  commission_revenue: number;
  commission_pay: number;
  tips: number;
  gross_pay: number;
  net_pay: number;
}

export function calcPayrollSummary(
  periodStart: Date,
  periodEnd: Date,
): EmployeePayrollSummary[] {
  const startStr = periodStart.toISOString().slice(0, 10);
  const endStr   = periodEnd.toISOString().slice(0, 10);

  return employees.map(emp => {
    const profile = payProfiles.find(p => p.employee_id === emp.id);
    if (!profile) return { employee_id: emp.id, name: emp.name, color: emp.color, hourly_pay: 0, commission_revenue: 0, commission_pay: 0, tips: 0, gross_pay: 0, net_pay: 0 };

    // Hourly pay from approved time logs in period
    let hourly_pay = 0;
    for (const role of profile.roles.filter(r => r.pay_type === 'hourly')) {
      const logs = timeLogs.filter(
        l => l.employee_id === emp.id &&
             l.role === role.role &&
             l.status === 'approved' &&
             l.date >= startStr &&
             l.date <= endStr,
      );
      const hours = logs.reduce((s, l) => s + l.hours, 0);
      hourly_pay += hours * (role.hourly_rate ?? 0);
    }

    // Commission pay from completed bookings in period
    let commission_revenue = 0;
    let commission_pay = 0;
    for (const role of profile.roles.filter(r => r.pay_type === 'commission')) {
      const rate = (role.commission_rate ?? 0) / 100;
      const periodBookings = bookings.filter(
        b => b.date >= startStr &&
             b.date <= endStr &&
             b.status === 'completed' &&
             b.employeeIds.includes(emp.id),
      );
      for (const b of periodBookings) {
        const pkgTotal = b.packageIds.reduce((s, id) => {
          const pkg = packages.find(p => p.id === id);
          return s + (pkg?.price ?? 0);
        }, 0);
        const split = b.employeeSplit.find(s => s.employeeId === emp.id);
        const empRevenue = (pkgTotal * (split?.percentage ?? 100)) / 100;
        commission_revenue += empRevenue;
        commission_pay += empRevenue * rate;
      }
    }

    const tips = 0; // pass-through — none in mock data
    const gross_pay = hourly_pay + commission_pay + tips;
    const net_pay = gross_pay * (1 - MOCK_DEDUCTION_RATE);

    return { employee_id: emp.id, name: emp.name, color: emp.color, hourly_pay, commission_revenue, commission_pay, tips, gross_pay, net_pay };
  });
}

// ─── Pending count helper ─────────────────────────────────────────────────────
export function pendingTimeOffCount(): number {
  return timeOffRequests.filter(r => r.status === 'pending').length;
}
