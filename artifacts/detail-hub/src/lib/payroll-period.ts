import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, format } from 'date-fns';
import { GetPayrollSummaryPeriod } from '@workspace/api-client-react';

/**
 * Client-side mirror of `@workspace/db`'s `resolvePayrollPeriod` (see
 * `lib/db/src/payroll.ts`) — Monday-start weeks, calendar months. Used anywhere this
 * app needs an actual `YYYY-MM-DD` date range for a shorthand period (e.g. filtering
 * `GET /time-logs`, which has no shorthand-period query param of its own, unlike
 * `GET /payroll/summary`/`POST /payroll/runs` which accept the shorthand directly).
 */
export type PayrollPeriod = typeof GetPayrollSummaryPeriod[keyof typeof GetPayrollSummaryPeriod];

export const PAYROLL_PERIODS: PayrollPeriod[] = [
  GetPayrollSummaryPeriod.this_week,
  GetPayrollSummaryPeriod.last_week,
  GetPayrollSummaryPeriod.this_month,
];

export const PAYROLL_PERIOD_LABELS: Record<PayrollPeriod, string> = {
  this_week: 'This Week',
  last_week: 'Last Week',
  this_month: 'This Month',
};

export function getPayrollPeriodDateRange(period: PayrollPeriod): { start: string; end: string } {
  const now = new Date();
  if (period === 'this_week') {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
  }
  if (period === 'last_week') {
    const lastWeek = subWeeks(now, 1);
    const start = startOfWeek(lastWeek, { weekStartsOn: 1 });
    const end = endOfWeek(lastWeek, { weekStartsOn: 1 });
    return { start: format(start, 'yyyy-MM-dd'), end: format(end, 'yyyy-MM-dd') };
  }
  // this_month
  return { start: format(startOfMonth(now), 'yyyy-MM-dd'), end: format(endOfMonth(now), 'yyyy-MM-dd') };
}

export function formatPayrollPeriodLabel(period: PayrollPeriod): string {
  const { start, end } = getPayrollPeriodDateRange(period);
  if (period === 'this_month') return format(new Date(start), 'MMMM yyyy');
  return `${format(new Date(start), 'MMM d')} – ${format(new Date(end), 'MMM d, yyyy')}`;
}
