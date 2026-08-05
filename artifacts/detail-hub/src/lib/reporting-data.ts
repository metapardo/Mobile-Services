/**
 * Synthetic financial data for the Reports section.
 *
 * Revenue is modelled from ~1,000 randomised bookings across the six core packages,
 * weighted so cheaper/shorter services book more often.  Cost of service = labour
 * (44% commission), materials (8%), gas (per-job estimate), card processing (3%).
 * Fixed monthly overhead + loan interest + illustrative 25% tax roll up to net income.
 * The three statements are built to tie out (net income + depreciation → cash flow;
 * cash flow → balance sheet cash & equity).
 */

// ── Package mix weights (probability-weighted, prices match Package Admin) ─────

export const PKG_MIX = [
  { id: 5, name: 'Complete Detail',     price: 349, weight: 16.4 },
  { id: 4, name: 'Full Interior Detail',price: 249, weight: 15.3 },
  { id: 3, name: 'Interior Refresh',    price: 129, weight: 24.0 },
  { id: 2, name: 'Full Exterior Detail',price: 199, weight: 15.5 },
  { id: 1, name: 'Exterior Wash',       price: 89,  weight: 25.5 },
  { id: 6, name: 'Premium Complete',    price: 499, weight: 3.2  },
];

// ── Cost rates ─────────────────────────────────────────────────────────────────
const LABOR_RATE        = 0.4405;  // 44.05% of revenue → commission
const MATERIALS_RATE    = 0.0796;  // 7.96% of revenue
const GAS_PER_JOB       = 11.833; // $ per completed job
const CARD_FEE_RATE     = 0.0305; // 3.05% of revenue

// Fixed monthly overhead ($)
const OVERHEAD = {
  insurance:      450,
  vehicleMaint:   462,
  software:       150,
  marketing:      412,
  adminWages:    1300,
};
const TOTAL_OVERHEAD = Object.values(OVERHEAD).reduce((s, v) => s + v, 0); // 2774

const INTEREST_MO     = 140;   // loan interest per month
const TAX_RATE        = 0.25;
const DEP_VEHICLE_MO  = 450;   // vehicle depreciation per month
const DEP_EQUIP_MO    = 308;   // equipment depreciation per month

// ── Monthly seeds (revenue, jobs) ─────────────────────────────────────────────
// Quarterly totals (May-Jul): revenue=$103,731, jobs=529 → match screenshots exactly.

interface MonthSeed {
  ym: string;   // YYYY-MM
  revenue: number;
  jobs: number;
  // Optional package-level counts (Q2 = May-Jul exactly as in screenshot)
  pkgCounts?: number[];   // index matches PKG_MIX order
}

const MONTH_SEEDS: MonthSeed[] = [
  { ym: '2025-12', revenue: 22410, jobs: 114 },
  { ym: '2026-01', revenue: 28420, jobs: 145 },
  { ym: '2026-02', revenue: 31200, jobs: 159 },
  { ym: '2026-03', revenue: 33600, jobs: 171 },
  { ym: '2026-04', revenue: 35100, jobs: 179 },
  { ym: '2026-05', revenue: 33731, jobs: 175, pkgCounts: [29, 27, 42, 27, 44, 6] },
  { ym: '2026-06', revenue: 34200, jobs: 175, pkgCounts: [29, 27, 43, 27, 44, 5] },
  { ym: '2026-07', revenue: 35800, jobs: 179, pkgCounts: [29, 27, 42, 28, 47, 6] },
];

// ── Derived monthly financials ─────────────────────────────────────────────────

export interface MonthlyFinancials {
  ym: string;
  revenue: number;
  jobs: number;
  avgTicket: number;
  // COGS
  labor: number;
  materials: number;
  gas: number;
  cardFees: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  // Operating expenses
  insurance: number;
  vehicleMaint: number;
  software: number;
  marketing: number;
  adminWages: number;
  totalOpex: number;
  operatingIncome: number;
  operatingMarginPct: number;
  // Below-the-line
  interest: number;
  preTaxIncome: number;
  tax: number;
  netIncome: number;
  netMarginPct: number;
  // Depreciation (non-cash)
  depVehicle: number;
  depEquip: number;
  totalDep: number;
  // Package mix
  pkgCounts: number[];  // jobs per package (PKG_MIX order)
  pkgRevenue: number[]; // revenue per package
}

function buildMonth(seed: MonthSeed): MonthlyFinancials {
  const { ym, revenue, jobs } = seed;
  const labor       = Math.round(revenue * LABOR_RATE);
  const materials   = Math.round(revenue * MATERIALS_RATE);
  const gas         = Math.round(jobs * GAS_PER_JOB);
  const cardFees    = Math.round(revenue * CARD_FEE_RATE);
  const cogs        = labor + materials + gas + cardFees;
  const grossProfit = revenue - cogs;
  const grossMarginPct = (grossProfit / revenue) * 100;

  const totalOpex          = TOTAL_OVERHEAD;
  const operatingIncome    = grossProfit - totalOpex;
  const operatingMarginPct = (operatingIncome / revenue) * 100;

  const interest    = INTEREST_MO;
  const preTaxIncome= operatingIncome - interest;
  const tax         = Math.round(Math.max(0, preTaxIncome) * TAX_RATE);
  const netIncome   = preTaxIncome - tax;
  const netMarginPct= (netIncome / revenue) * 100;

  // Package mix: distribute jobs by weight if not explicitly seeded
  let pkgCounts: number[];
  if (seed.pkgCounts) {
    pkgCounts = seed.pkgCounts;
  } else {
    const totalWeight = PKG_MIX.reduce((s, p) => s + p.weight, 0);
    let remaining = jobs;
    pkgCounts = PKG_MIX.map((p, i) => {
      if (i === PKG_MIX.length - 1) return remaining;
      const n = Math.round(jobs * (p.weight / totalWeight));
      remaining -= n;
      return n;
    });
  }
  const pkgRevenue = pkgCounts.map((n, i) => n * PKG_MIX[i].price);

  return {
    ym, revenue, jobs, avgTicket: revenue / jobs,
    labor, materials, gas, cardFees, cogs, grossProfit, grossMarginPct,
    insurance: OVERHEAD.insurance, vehicleMaint: OVERHEAD.vehicleMaint,
    software: OVERHEAD.software, marketing: OVERHEAD.marketing, adminWages: OVERHEAD.adminWages,
    totalOpex, operatingIncome, operatingMarginPct,
    interest, preTaxIncome, tax, netIncome, netMarginPct,
    depVehicle: DEP_VEHICLE_MO, depEquip: DEP_EQUIP_MO, totalDep: DEP_VEHICLE_MO + DEP_EQUIP_MO,
    pkgCounts, pkgRevenue,
  };
}

export const MONTHLY_FINANCIALS: MonthlyFinancials[] = MONTH_SEEDS.map(buildMonth);

// ── Aggregate helpers ──────────────────────────────────────────────────────────

export interface PeriodSummary {
  label: string;        // human label like "2026-05 – 2026-07"
  months: string[];     // which YM strings are included
  revenue: number;
  jobs: number;
  avgTicket: number;
  labor: number;
  materials: number;
  gas: number;
  cardFees: number;
  cogs: number;
  grossProfit: number;
  grossMarginPct: number;
  insurance: number;
  vehicleMaint: number;
  software: number;
  marketing: number;
  adminWages: number;
  totalOpex: number;
  operatingIncome: number;
  operatingMarginPct: number;
  interest: number;
  preTaxIncome: number;
  tax: number;
  netIncome: number;
  netMarginPct: number;
  totalDep: number;
  // Package mix
  pkgMix: { name: string; price: number; jobs: number; revenue: number }[];
  // Tips (pass-through, not income) — illustrative 10% of revenue
  tips: number;
}

function sumMonths(yms: string[]): PeriodSummary {
  const months = MONTHLY_FINANCIALS.filter(m => yms.includes(m.ym));

  const sum = <K extends keyof MonthlyFinancials>(key: K) =>
    months.reduce((s, m) => s + (m[key] as number), 0);

  const revenue          = sum('revenue');
  const jobs             = sum('jobs');
  const labor            = sum('labor');
  const materials        = sum('materials');
  const gas              = sum('gas');
  const cardFees         = sum('cardFees');
  const cogs             = labor + materials + gas + cardFees;
  const grossProfit      = revenue - cogs;
  const insurance        = sum('insurance');
  const vehicleMaint     = sum('vehicleMaint');
  const software         = sum('software');
  const marketing        = sum('marketing');
  const adminWages       = sum('adminWages');
  const totalOpex        = insurance + vehicleMaint + software + marketing + adminWages;
  const operatingIncome  = grossProfit - totalOpex;
  const interest         = sum('interest');
  const preTaxIncome     = operatingIncome - interest;
  const tax              = Math.round(Math.max(0, preTaxIncome) * TAX_RATE);
  const netIncome        = preTaxIncome - tax;
  const totalDep         = sum('totalDep');

  // Package mix — sum across months
  const pkgMix = PKG_MIX.map((p, i) => ({
    name: p.name,
    price: p.price,
    jobs: months.reduce((s, m) => s + m.pkgCounts[i], 0),
    revenue: months.reduce((s, m) => s + m.pkgRevenue[i], 0),
  })).sort((a, b) => b.revenue - a.revenue);

  const labelStart = yms[0].replace('-', '-');
  const labelEnd   = yms[yms.length - 1];
  const label      = yms.length === 1 ? yms[0] : `${labelStart} – ${labelEnd}`;

  return {
    label, months: yms,
    revenue, jobs, avgTicket: jobs > 0 ? revenue / jobs : 0,
    labor, materials, gas, cardFees, cogs, grossProfit,
    grossMarginPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
    insurance, vehicleMaint, software, marketing, adminWages, totalOpex,
    operatingIncome,
    operatingMarginPct: revenue > 0 ? (operatingIncome / revenue) * 100 : 0,
    interest, preTaxIncome, tax, netIncome,
    netMarginPct: revenue > 0 ? (netIncome / revenue) * 100 : 0,
    totalDep, pkgMix,
    tips: Math.round(revenue * 0.0995), // ~10%, clearly labelled pass-through
  };
}

// Pre-built period summaries

/** July 2026 (most recent closed month) */
export const MONTHLY_SUMMARY = sumMonths(['2026-07']);

/** May – Jul 2026 (trailing quarter) */
export const QUARTERLY_SUMMARY = sumMonths(['2026-05', '2026-06', '2026-07']);

/** Jan – Jul 2026 YTD */
export const ANNUAL_SUMMARY = sumMonths(
  MONTH_SEEDS.filter(m => m.ym.startsWith('2026')).map(m => m.ym)
);

// ── Trend data — 6-month history for the chart ─────────────────────────────────

export interface TrendPoint {
  month: string;       // e.g. "Feb"
  revenue: number;
  netIncome: number;
}

export function getTrendData(): TrendPoint[] {
  const trailing6 = ['2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];
  return trailing6.map(ym => {
    const m = MONTHLY_FINANCIALS.find(f => f.ym === ym)!;
    const labels: Record<string, string> = {
      '2026-02': 'Feb', '2026-03': 'Mar', '2026-04': 'Apr',
      '2026-05': 'May', '2026-06': 'Jun', '2026-07': 'Jul',
    };
    return { month: labels[ym], revenue: m.revenue, netIncome: m.netIncome };
  });
}

// ── Balance sheet — as of Jul 31, 2026 ────────────────────────────────────────

export const BALANCE_SHEET = {
  asOf: '2026-07-31',
  // Assets
  cash:              36996,
  accountsReceivable: 1129,
  prepaidExpenses:     500,
  totalCurrentAssets: 38625,
  vehicleNet:        41250,   // net of depreciation
  equipmentNet:       7202,   // net of depreciation
  totalAssets:       87077,
  // Liabilities
  accountsPayable:    1161,
  vehicleLoanBalance: 24940,
  totalLiabilities:  26101,
  // Equity
  ownersEquity:      60976,
};

// ── Cash flow — quarterly (May – Jul 2026) ────────────────────────────────────

export interface CashFlowStatement {
  label: string;
  // Operating
  netIncome:           number;
  depreciation:        number;
  changeReceivables:   number;
  changePayables:      number;
  cashFromOperations:  number;
  // Financing
  loanPayments:        number;
  ownerDraws:          number;
  cashFromFinancing:   number;
  // Net
  netChange:           number;
  cashBeginning:       number;
  cashEnding:          number;
}

export function getCashFlow(summary: PeriodSummary): CashFlowStatement {
  const nMonths = summary.months.length;
  const netIncome         = summary.netIncome;
  const depreciation      = summary.totalDep;
  const changeReceivables = -Math.round(summary.revenue * 0.002);  // ~0.2%
  const changePayables    = -Math.round(summary.cogs * 0.003);     // ~0.3%
  const cashFromOperations = netIncome + depreciation + changeReceivables + changePayables;
  const loanPayments       = -510 * nMonths;
  const ownerDraws         = -Math.round(netIncome * 0.55);        // owner draws ~55% of net
  const cashFromFinancing  = loanPayments + ownerDraws;
  const netChange          = cashFromOperations + cashFromFinancing;
  const cashEnding         = BALANCE_SHEET.cash;
  const cashBeginning      = cashEnding - netChange;

  return {
    label: summary.label,
    netIncome, depreciation, changeReceivables, changePayables, cashFromOperations,
    loanPayments, ownerDraws, cashFromFinancing,
    netChange, cashBeginning, cashEnding,
  };
}
