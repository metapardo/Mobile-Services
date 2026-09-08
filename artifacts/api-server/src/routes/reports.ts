import { Router, type IRouter } from "express";
import { calculateFinancialReport, InvalidReportPeriodError } from "@workspace/db";
import { GetFinancialReportResponse } from "@workspace/api-zod";
import { requireOrgSession } from "../middlewares/require-org-session";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

const router: IRouter = Router();

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /reports/financials?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * The Monthly/Quarterly/Annual "Financial View" (PRD_DetailHub_After_Package_Work.md
 * Section 6.2, FR-10/FR-11/FR-13) — income statement, balance sheet, cash flow,
 * package mix, revenue-by-employee, and a trailing-6-month trend, all in one response.
 * See `calculateFinancialReport`'s doc comment in `@workspace/db` (`./reports.ts`) for
 * exactly which fields are real (computed from bookings/payroll/packages/employees)
 * versus fixed constants ported verbatim from the old
 * `artifacts/detail-hub/src/lib/reporting-data.ts`.
 *
 * `start`/`end` are validated as plain `YYYY-MM-DD` strings rather than run through a
 * generated zod query schema — same reasoning as `GET /bookings` in `./bookings.ts`
 * (the orval pipeline's `coerce` config only applies to body/response, not query).
 * Both are required (unlike `GET /bookings`'s optional range) since a financial
 * statement with no period bound isn't a meaningful request here.
 */
router.get("/reports/financials", requireOrgSession, async (req, res) => {
  const rawStart = req.query.start;
  const rawEnd = req.query.end;
  if (typeof rawStart !== "string" || !DATE_ONLY.test(rawStart) || typeof rawEnd !== "string" || !DATE_ONLY.test(rawEnd)) {
    res.status(400).json({ error: "invalid_request", message: "start and end are required and must be YYYY-MM-DD" });
    return;
  }
  try {
    const report = await calculateFinancialReport(req.organizationId!, rawStart, rawEnd);
    const data = GetFinancialReportResponse.parse(report);
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof InvalidReportPeriodError) {
      res.status(400).json({ error: "invalid_period", message: err.message });
      return;
    }
    logger.error({ err }, "GET /reports/financials: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
