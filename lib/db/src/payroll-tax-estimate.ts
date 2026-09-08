/**
 * ============================================================================
 * SIMPLIFIED, ILLUSTRATIVE PAYROLL WITHHOLDING ESTIMATE — NOT REAL TAX WITHHOLDING.
 * ============================================================================
 *
 * This file computes a rough, in-app-display-only estimate of federal withholding for
 * a `w2_employee`'s pay period. It is NOT real payroll tax withholding, filing, or
 * compliance, and must never be presented anywhere in the product as "your actual
 * withholding," used to actually remit taxes, or relied on for any compliance purpose.
 *
 * Per docs/prds/PRD_DetailHub_Payroll_Module.md Section 9 ("Use Case: Tax Filing &
 * Compliance — flagged, not scoped"): real payroll tax withholding/filing is a
 * heavily-regulated domain with real legal/financial liability, and that PRD explicitly
 * calls it a build-vs-buy decision requiring a third-party payroll/compliance provider
 * — not something to build in-house. This function exists only so the Payroll Run
 * summary screen can show a plausible net-pay figure instead of gross-pay-as-net; it
 * intentionally has none of: state/local tax, W-4 allowances/filing status other than
 * single, pre-tax deductions, or any per-employee customization.
 *
 * `1099_contractor` employees never go through this function — contractors self-remit
 * their own estimated taxes, so `net_pay = gross_pay` exactly for them (see `./payroll.ts`).
 */

const DAYS_PER_YEAR = 365.25;

/**
 * 2025 IRS single-filer federal income tax brackets — approximate, single-filer only,
 * no state/local tax, no W-4 allowances — verify against current IRS Rev. Proc. before
 * relying on this for anything beyond an illustrative estimate. `upTo` is the top of
 * each bracket (inclusive), in annual taxable dollars.
 */
const FEDERAL_BRACKETS_2025_SINGLE: ReadonlyArray<{ upTo: number; rate: number }> = [
  { upTo: 11_925, rate: 0.1 },
  { upTo: 48_475, rate: 0.12 },
  { upTo: 103_350, rate: 0.22 },
  { upTo: 197_300, rate: 0.24 },
  { upTo: 250_525, rate: 0.32 },
  { upTo: 626_350, rate: 0.35 },
  { upTo: Infinity, rate: 0.37 },
];

/** 2025 FICA figures — approximate, needs verification against current IRS/SSA figures. */
const SOCIAL_SECURITY_RATE = 0.062;
const SOCIAL_SECURITY_WAGE_BASE_2025 = 176_100;
const MEDICARE_RATE = 0.0145;
const ADDITIONAL_MEDICARE_RATE = 0.009;
const ADDITIONAL_MEDICARE_THRESHOLD_SINGLE = 200_000;

/** Standard marginal-bracket method — NOT a flat rate applied to the whole amount. */
function annualFederalIncomeTax(annualizedGross: number): number {
  let tax = 0;
  let bottomOfBracket = 0;
  for (const bracket of FEDERAL_BRACKETS_2025_SINGLE) {
    if (annualizedGross <= bottomOfBracket) break;
    const taxableInThisBracket = Math.min(annualizedGross, bracket.upTo) - bottomOfBracket;
    tax += taxableInThisBracket * bracket.rate;
    bottomOfBracket = bracket.upTo;
  }
  return tax;
}

function annualFica(annualizedGross: number): number {
  const socialSecurity = Math.min(annualizedGross, SOCIAL_SECURITY_WAGE_BASE_2025) * SOCIAL_SECURITY_RATE;
  const medicare = annualizedGross * MEDICARE_RATE;
  const additionalMedicare =
    Math.max(0, annualizedGross - ADDITIONAL_MEDICARE_THRESHOLD_SINGLE) * ADDITIONAL_MEDICARE_RATE;
  return socialSecurity + medicare + additionalMedicare;
}

/** Inclusive day count between two dates (e.g. a Mon–Sun week is 7 days, not 6). */
function periodLengthInDays(periodStart: Date, periodEnd: Date): number {
  const ms = periodEnd.getTime() - periodStart.getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

/**
 * Returns the estimated NET pay for a `w2_employee` for one pay period, after a
 * simplified illustrative federal withholding + FICA estimate — see this file's
 * top-of-file warning. Steps (percentage-method payroll approach — never apply
 * brackets directly to a weekly/period figure, which would push people into much
 * higher brackets than they actually owe):
 *
 *   1. Annualize the period's gross pay based on how many of these periods fit in a year.
 *   2. Compute annual federal income tax via marginal brackets, plus FICA (Social
 *      Security up to the wage base, Medicare on everything, + the 0.9% additional
 *      Medicare surtax above $200k annualized).
 *   3. De-annualize the total back down to this period.
 *   4. Return `periodGrossPay - periodWithholding`.
 */
export function estimateWithholding(periodGrossPay: number, periodStart: Date, periodEnd: Date): number {
  const days = periodLengthInDays(periodStart, periodEnd);
  const periodsPerYear = DAYS_PER_YEAR / days;

  const annualizedGross = periodGrossPay * periodsPerYear;
  const annualEstimatedTax = annualFederalIncomeTax(annualizedGross) + annualFica(annualizedGross);
  const periodWithholding = annualEstimatedTax / periodsPerYear;

  return periodGrossPay - periodWithholding;
}
