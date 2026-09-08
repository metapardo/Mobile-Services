import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { bookingsTable, bookingPackagesTable, packagesTable, employeesTable, employeeSplitsTable } from "./schema";
import { withOrganization } from "./tenant";
import { calculatePayrollSummary } from "./payroll";

/**
 * Reports section — Monthly/Quarterly/Annual "Financial View"
 * (`PRD_DetailHub_After_Package_Work.md` Section 6.2, FR-10/FR-11/FR-13). Ports
 * `artifacts/detail-hub/src/lib/reporting-data.ts`'s exact statement shape
 * (`MonthlyFinancials`/`PeriodSummary`/`BALANCE_SHEET`/`CashFlowStatement`) as a
 * deliberate hybrid of REAL data and FIXED constants — see each computation below for
 * which is which. Do not re-derive the fixed constants if this file is revisited; the
 * source of truth for their values is `reporting-data.ts`, ported here verbatim.
 *
 * REAL (computed from actual tables, replacing reporting-data.ts's fabricated seeds):
 *   - `revenue`/`jobs`/`avgTicket` — completed bookings in the period × their assigned
 *     packages' current price (same join shape `calculatePayrollSummary` already uses
 *     for `commission_revenue`, see `./payroll.ts`).
 *   - `cogs.labor` — real total gross payroll for the period, via
 *     `calculatePayrollSummary`. Replaces the old `LABOR_RATE * revenue` (44.05%)
 *     proxy entirely — that approximation is no longer needed now real payroll exists.
 *   - `packageMix` — real per-package booking counts/revenue in the period.
 *   - `revenueByEmployee` — real, from completed bookings × `employee_splits` ×
 *     package price (mirrors `pages/reporting.tsx`'s existing mock-data computation,
 *     which already worked this way — same logic, real tables).
 *   - `balanceSheet.accountsReceivable` — real: completed bookings in the period with
 *     `paymentRecordedAt IS NULL` (Checkout backend, Phase A, made this derivable).
 *   - `cashFlow.changeReceivables` — real AR this period minus real AR for the
 *     immediately-preceding equivalent-length period.
 *
 * FIXED (ported verbatim from `reporting-data.ts`, no new settings/config built for
 * these per this phase's explicit scope boundary):
 *   - `MATERIALS_RATE` (7.96% of revenue), `GAS_PER_JOB` ($11.833/job).
 *   - Card processing fees are DROPPED ENTIRELY (not ported at a fake nonzero rate) —
 *     Checkout only supports zelle/venmo/cash, so there is no real or hypothetical
 *     card fee to model here.
 *   - `OVERHEAD_MO` (insurance/vehicleMaint/software/marketing/adminWages), scaled by
 *     the number of calendar months the requested period spans.
 *   - `INTEREST_MO`, `TAX_RATE` (applied to real pre-tax income), `DEP_VEHICLE_MO`/
 *     `DEP_EQUIP_MO`, all scaled the same way.
 *   - Every other balance-sheet field (`cash`, `prepaidExpenses`, `vehicleNet`,
 *     `equipmentNet`, `accountsPayable`, `vehicleLoanBalance`, `ownersEquity`) and
 *     `cashFlow.changePayables`/`loanPayments`/`ownerDraws` (the last one partially
 *     real since it's a percentage of the now-real `netIncome`).
 *
 * FLAGGED (not silently picked): `reporting-data.ts` also modeled a `tips` line
 * (~10% of revenue, "illustrative pass-through, not income") on the income statement.
 * No tips data source exists anywhere in this schema (see `PayrollLineItem.tips` in
 * `./payroll.ts`, hardcoded to `0` for the same reason) — rather than fabricate a
 * percentage-of-revenue guess here too, this endpoint omits tips entirely. If product
 * wants tips back on this statement, it needs a real tips field/column first.
 */

// ── Fixed cost constants — ported verbatim from reporting-data.ts, do not re-derive ──

const MATERIALS_RATE = 0.0796; // 7.96% of revenue
const GAS_PER_JOB = 11.833; // $ per completed job

const OVERHEAD_MO = {
  insurance: 450,
  vehicleMaint: 462,
  software: 150,
  marketing: 412,
  adminWages: 1300,
};

const INTEREST_MO = 140; // loan interest per month
const TAX_RATE = 0.25;
const DEP_VEHICLE_MO = 450; // vehicle depreciation per month
const DEP_EQUIP_MO = 308; // equipment depreciation per month

/** Balance sheet fields with no real underlying ledger anywhere in this schema —
 * ported verbatim from `reporting-data.ts`'s `BALANCE_SHEET` as a fixed baseline.
 * Only `accountsReceivable` becomes real (computed per-period, see below). */
const BALANCE_SHEET_FIXED = {
  cash: 36996,
  prepaidExpenses: 500,
  vehicleNet: 41250,
  equipmentNet: 7202,
  accountsPayable: 1161,
  vehicleLoanBalance: 24940,
  ownersEquity: 60976,
};

// ── Date helpers (UTC, no date-fns dependency — mirrors ./payroll.ts's own helpers) ──

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDaysUTC(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}
function parseDateOnly(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

/**
 * Every distinct `YYYY-MM` spanned by `[start, end]`, inclusive — used to scale fixed
 * monthly constants (overhead/interest/depreciation) and to label the statements'
 * `months` list. Assumes callers pass whole-month-aligned ranges (the Monthly/
 * Quarterly/Annual tabs' boundaries always are) — a partial-month range still works,
 * it just counts every touched month as a whole month for scaling purposes rather than
 * pro-rating by day, which is the simpler and more defensible behavior given these are
 * illustrative fixed costs, not a real ledger.
 */
function monthsInRange(start: string, end: string): string[] {
  const months: string[] = [];
  const startD = parseDateOnly(start);
  const endD = parseDateOnly(end);
  let y = startD.getUTCFullYear();
  let m = startD.getUTCMonth();
  const endY = endD.getUTCFullYear();
  const endM = endD.getUTCMonth();
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m + 1).padStart(2, "0")}`);
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return months;
}

/** Same-length period immediately preceding `[start, end]` — feeds the cash flow
 * statement's real `changeReceivables` (this period's real AR minus the previous
 * equivalent period's real AR). */
function previousPeriod(start: string, end: string): { start: string; end: string } {
  const startD = parseDateOnly(start);
  const endD = parseDateOnly(end);
  const lengthDays = Math.round((endD.getTime() - startD.getTime()) / 86_400_000) + 1;
  const prevEnd = addDaysUTC(startD, -1);
  const prevStart = addDaysUTC(prevEnd, -(lengthDays - 1));
  return { start: toDateOnly(prevStart), end: toDateOnly(prevEnd) };
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(ym: string): string {
  const idx = Number(ym.slice(5, 7)) - 1;
  return MONTH_LABELS[idx] ?? ym;
}
function addMonthsToYm(ym: string, delta: number): string {
  const [yStr, mStr] = ym.split("-");
  let y = Number(yStr);
  let m = Number(mStr) - 1 + delta;
  while (m < 0) {
    m += 12;
    y -= 1;
  }
  while (m > 11) {
    m -= 12;
    y += 1;
  }
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}
function monthBounds(ym: string): { start: string; end: string } {
  const [yStr, mStr] = ym.split("-");
  const y = Number(yStr);
  const m = Number(mStr) - 1;
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

// ── Response shape ────────────────────────────────────────────────────────────

export type PackageMixEntry = { packageId: number; name: string; price: number; jobs: number; revenue: number };
export type RevenueByEmployeeEntry = { employeeId: number; name: string; revenue: number };

export type FinancialReportBalanceSheet = {
  asOf: string;
  cash: number;
  accountsReceivable: number;
  prepaidExpenses: number;
  totalCurrentAssets: number;
  vehicleNet: number;
  equipmentNet: number;
  totalAssets: number;
  accountsPayable: number;
  vehicleLoanBalance: number;
  totalLiabilities: number;
  ownersEquity: number;
};

export type FinancialReportCashFlow = {
  netIncome: number;
  depreciation: number;
  changeReceivables: number;
  changePayables: number;
  cashFromOperations: number;
  loanPayments: number;
  ownerDraws: number;
  cashFromFinancing: number;
  netChange: number;
  cashBeginning: number;
  cashEnding: number;
};

export type FinancialReportTrendPoint = { ym: string; month: string; revenue: number; netIncome: number };

export type FinancialReport = {
  periodStart: string;
  periodEnd: string;
  months: string[];
  revenue: number;
  jobs: number;
  avgTicket: number;
  cogs: { labor: number; materials: number; gas: number; total: number };
  grossProfit: number;
  grossMarginPct: number;
  opex: {
    insurance: number;
    vehicleMaint: number;
    software: number;
    marketing: number;
    adminWages: number;
    total: number;
  };
  operatingIncome: number;
  operatingMarginPct: number;
  interest: number;
  preTaxIncome: number;
  tax: number;
  netIncome: number;
  netMarginPct: number;
  depreciation: { vehicle: number; equipment: number; total: number };
  packageMix: PackageMixEntry[];
  revenueByEmployee: RevenueByEmployeeEntry[];
  balanceSheet: FinancialReportBalanceSheet;
  cashFlow: FinancialReportCashFlow;
  trend: FinancialReportTrendPoint[];
};

export class InvalidReportPeriodError extends Error {}

// ── Internal data gathering ───────────────────────────────────────────────────

type PeriodBookingData = {
  jobs: number;
  revenue: number;
  accountsReceivable: number;
  packageMix: PackageMixEntry[];
  revenueByEmployee: RevenueByEmployeeEntry[];
};

/**
 * Gathers everything derivable from real `bookings`/`booking_packages`/`packages`/
 * `employee_splits` for `[start, end]`. Scoped to `status: "completed"` bookings only
 * — the same booking set `calculatePayrollSummary`'s `commission_revenue` is drawn
 * from (see `./payroll.ts`), so this endpoint's `revenue` and `cogs.labor` stay
 * coherent with each other rather than being computed off two different definitions
 * of "a job that counts."
 */
async function gatherPeriodBookingData(
  organizationId: string,
  start: string,
  end: string,
): Promise<PeriodBookingData> {
  return withOrganization(organizationId, async (tx) => {
    const [periodBookings, packages, employees] = await Promise.all([
      tx
        .select({ id: bookingsTable.id, paymentRecordedAt: bookingsTable.paymentRecordedAt })
        .from(bookingsTable)
        .where(
          and(
            eq(bookingsTable.organizationId, organizationId),
            eq(bookingsTable.status, "completed"),
            gte(bookingsTable.date, start),
            lte(bookingsTable.date, end),
          ),
        ),
      tx.select().from(packagesTable).where(eq(packagesTable.organizationId, organizationId)),
      tx.select().from(employeesTable).where(eq(employeesTable.organizationId, organizationId)),
    ]);

    if (periodBookings.length === 0) {
      return { jobs: 0, revenue: 0, accountsReceivable: 0, packageMix: [], revenueByEmployee: [] };
    }

    const bookingIds = periodBookings.map((b) => b.id);
    const [packageRows, splitRows] = await Promise.all([
      tx
        .select({
          bookingId: bookingPackagesTable.bookingId,
          packageId: bookingPackagesTable.packageId,
          price: packagesTable.price,
        })
        .from(bookingPackagesTable)
        .innerJoin(packagesTable, eq(bookingPackagesTable.packageId, packagesTable.id))
        .where(
          and(
            eq(bookingPackagesTable.organizationId, organizationId),
            inArray(bookingPackagesTable.bookingId, bookingIds),
          ),
        ),
      tx
        .select({
          bookingId: employeeSplitsTable.bookingId,
          employeeId: employeeSplitsTable.employeeId,
          percentage: employeeSplitsTable.percentage,
        })
        .from(employeeSplitsTable)
        .where(
          and(
            eq(employeeSplitsTable.organizationId, organizationId),
            inArray(employeeSplitsTable.bookingId, bookingIds),
          ),
        ),
    ]);

    const bookingTotalById = new Map<number, number>();
    for (const row of packageRows) {
      bookingTotalById.set(row.bookingId, (bookingTotalById.get(row.bookingId) ?? 0) + Number(row.price));
    }
    const revenue = [...bookingTotalById.values()].reduce((s, v) => s + v, 0);
    const jobs = periodBookings.length;

    let accountsReceivable = 0;
    for (const b of periodBookings) {
      if (b.paymentRecordedAt === null) accountsReceivable += bookingTotalById.get(b.id) ?? 0;
    }

    const pkgAgg = new Map<number, { jobs: number; revenue: number }>();
    for (const row of packageRows) {
      const cur = pkgAgg.get(row.packageId) ?? { jobs: 0, revenue: 0 };
      cur.jobs += 1;
      cur.revenue += Number(row.price);
      pkgAgg.set(row.packageId, cur);
    }
    const packageMix: PackageMixEntry[] = [...pkgAgg.entries()]
      .map(([packageId, agg]) => {
        const pkg = packages.find((p) => p.id === packageId);
        return {
          packageId,
          name: pkg?.name ?? `Package ${packageId}`,
          price: pkg ? Number(pkg.price) : 0,
          jobs: agg.jobs,
          revenue: agg.revenue,
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const empRevenue = new Map<number, number>();
    for (const split of splitRows) {
      const bookingTotal = bookingTotalById.get(split.bookingId) ?? 0;
      const pct = Number(split.percentage) / 100;
      empRevenue.set(split.employeeId, (empRevenue.get(split.employeeId) ?? 0) + bookingTotal * pct);
    }
    const revenueByEmployee: RevenueByEmployeeEntry[] = [...empRevenue.entries()]
      .map(([employeeId, rev]) => {
        const emp = employees.find((e) => e.id === employeeId);
        return { employeeId, name: emp?.name ?? `Employee ${employeeId}`, revenue: rev };
      })
      .filter((e) => e.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);

    return { jobs, revenue, accountsReceivable, packageMix, revenueByEmployee };
  });
}

/** Computes one `[start, end]` period's full statement set, excluding `trend` (the
 * trend array is built by calling this once per trailing month, see
 * `calculateFinancialReport`). FR-13: every ratio here is guarded against a
 * zero-revenue/zero-jobs period — `0`, never `NaN`/`Infinity`. */
async function computePeriodCore(
  organizationId: string,
  start: string,
  end: string,
): Promise<Omit<FinancialReport, "trend">> {
  const months = monthsInRange(start, end);
  const nMonths = months.length || 1;
  const prev = previousPeriod(start, end);

  const [bookingData, prevBookingData, payrollSummary] = await Promise.all([
    gatherPeriodBookingData(organizationId, start, end),
    gatherPeriodBookingData(organizationId, prev.start, prev.end),
    calculatePayrollSummary(organizationId, start, end),
  ]);

  const { jobs, revenue, accountsReceivable, packageMix, revenueByEmployee } = bookingData;
  const avgTicket = jobs > 0 ? revenue / jobs : 0;

  const labor = payrollSummary.grossTotal;
  const materials = revenue * MATERIALS_RATE;
  const gas = jobs * GAS_PER_JOB;
  const cogsTotal = labor + materials + gas;
  const grossProfit = revenue - cogsTotal;
  const grossMarginPct = revenue > 0 ? (grossProfit / revenue) * 100 : 0;

  const opexInsurance = OVERHEAD_MO.insurance * nMonths;
  const opexVehicleMaint = OVERHEAD_MO.vehicleMaint * nMonths;
  const opexSoftware = OVERHEAD_MO.software * nMonths;
  const opexMarketing = OVERHEAD_MO.marketing * nMonths;
  const opexAdminWages = OVERHEAD_MO.adminWages * nMonths;
  const opexTotal = opexInsurance + opexVehicleMaint + opexSoftware + opexMarketing + opexAdminWages;

  const operatingIncome = grossProfit - opexTotal;
  const operatingMarginPct = revenue > 0 ? (operatingIncome / revenue) * 100 : 0;

  const interest = INTEREST_MO * nMonths;
  const preTaxIncome = operatingIncome - interest;
  const tax = Math.round(Math.max(0, preTaxIncome) * TAX_RATE);
  const netIncome = preTaxIncome - tax;
  const netMarginPct = revenue > 0 ? (netIncome / revenue) * 100 : 0;

  const depVehicle = DEP_VEHICLE_MO * nMonths;
  const depEquip = DEP_EQUIP_MO * nMonths;
  const totalDep = depVehicle + depEquip;

  const changeReceivables = accountsReceivable - prevBookingData.accountsReceivable;
  const changePayables = -Math.round(cogsTotal * 0.003);
  const cashFromOperations = netIncome + totalDep + changeReceivables + changePayables;
  const loanPayments = -510 * nMonths;
  const ownerDraws = -Math.round(netIncome * 0.55);
  const cashFromFinancing = loanPayments + ownerDraws;
  const netChange = cashFromOperations + cashFromFinancing;
  const cashEnding = BALANCE_SHEET_FIXED.cash;
  const cashBeginning = cashEnding - netChange;

  const totalCurrentAssets = BALANCE_SHEET_FIXED.cash + accountsReceivable + BALANCE_SHEET_FIXED.prepaidExpenses;
  const totalAssets = totalCurrentAssets + BALANCE_SHEET_FIXED.vehicleNet + BALANCE_SHEET_FIXED.equipmentNet;
  const totalLiabilities = BALANCE_SHEET_FIXED.accountsPayable + BALANCE_SHEET_FIXED.vehicleLoanBalance;

  return {
    periodStart: start,
    periodEnd: end,
    months,
    revenue,
    jobs,
    avgTicket,
    cogs: { labor, materials, gas, total: cogsTotal },
    grossProfit,
    grossMarginPct,
    opex: {
      insurance: opexInsurance,
      vehicleMaint: opexVehicleMaint,
      software: opexSoftware,
      marketing: opexMarketing,
      adminWages: opexAdminWages,
      total: opexTotal,
    },
    operatingIncome,
    operatingMarginPct,
    interest,
    preTaxIncome,
    tax,
    netIncome,
    netMarginPct,
    depreciation: { vehicle: depVehicle, equipment: depEquip, total: totalDep },
    packageMix,
    revenueByEmployee,
    balanceSheet: {
      asOf: end,
      cash: BALANCE_SHEET_FIXED.cash,
      accountsReceivable,
      prepaidExpenses: BALANCE_SHEET_FIXED.prepaidExpenses,
      totalCurrentAssets,
      vehicleNet: BALANCE_SHEET_FIXED.vehicleNet,
      equipmentNet: BALANCE_SHEET_FIXED.equipmentNet,
      totalAssets,
      accountsPayable: BALANCE_SHEET_FIXED.accountsPayable,
      vehicleLoanBalance: BALANCE_SHEET_FIXED.vehicleLoanBalance,
      totalLiabilities,
      ownersEquity: BALANCE_SHEET_FIXED.ownersEquity,
    },
    cashFlow: {
      netIncome,
      depreciation: totalDep,
      changeReceivables,
      changePayables,
      cashFromOperations,
      loanPayments,
      ownerDraws,
      cashFromFinancing,
      netChange,
      cashBeginning,
      cashEnding,
    },
  };
}

/**
 * `GET /reports/financials?start=&end=` (FR-10/FR-11/FR-13) — the Monthly/Quarterly/
 * Annual "Financial View." Computes the requested period's full statement set (see
 * `computePeriodCore`) plus a trailing-6-calendar-month `trend` (revenue + net income
 * per month, ending with the month containing `periodEnd`) for the existing trend
 * chart — same real/fixed hybrid, independently computed per month.
 */
export async function calculateFinancialReport(
  organizationId: string,
  periodStart: string,
  periodEnd: string,
): Promise<FinancialReport> {
  if (periodStart > periodEnd) {
    throw new InvalidReportPeriodError("periodStart must be on or before periodEnd.");
  }

  const core = await computePeriodCore(organizationId, periodStart, periodEnd);

  const lastYm = periodEnd.slice(0, 7);
  const trendYms = Array.from({ length: 6 }, (_, i) => addMonthsToYm(lastYm, i - 5));
  const trend = await Promise.all(
    trendYms.map(async (ym): Promise<FinancialReportTrendPoint> => {
      const bounds = monthBounds(ym);
      const monthCore = await computePeriodCore(organizationId, bounds.start, bounds.end);
      return { ym, month: monthLabel(ym), revenue: monthCore.revenue, netIncome: monthCore.netIncome };
    }),
  );

  return { ...core, trend };
}
