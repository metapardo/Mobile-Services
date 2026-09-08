import { Router, type IRouter } from "express";
import {
  resolvePayrollPeriod,
  calculatePayrollSummary,
  createPayrollRun,
  listPayrollRuns,
  getPayrollRunById,
  markPayrollRunPaid,
  InvalidPayrollPeriodError,
  PayrollRunValidationError,
  type PayrollPeriodShorthand,
  type PayrollRun,
} from "@workspace/db";
import {
  GetPayrollSummaryResponse,
  CreatePayrollRunBody,
  CreatePayrollRunResponse,
  ListPayrollRunsResponse,
  GetPayrollRunParams,
  GetPayrollRunResponse,
  UpdatePayrollRunParams,
  UpdatePayrollRunBody,
  UpdatePayrollRunResponse,
} from "@workspace/api-zod";
import { requireOrgSession } from "../middlewares/require-org-session";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

const router: IRouter = Router();

const PERIOD_SHORTHANDS = ["this_week", "last_week", "this_month"];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function parsePeriodQuery(req: import("express").Request): { period?: PayrollPeriodShorthand; periodStart?: string; periodEnd?: string } | null {
  const { period, periodStart, periodEnd } = req.query;
  if (period !== undefined && (typeof period !== "string" || !PERIOD_SHORTHANDS.includes(period))) return null;
  if (periodStart !== undefined && (typeof periodStart !== "string" || !DATE_ONLY.test(periodStart))) return null;
  if (periodEnd !== undefined && (typeof periodEnd !== "string" || !DATE_ONLY.test(periodEnd))) return null;
  return {
    period: period as PayrollPeriodShorthand | undefined,
    periodStart: periodStart as string | undefined,
    periodEnd: periodEnd as string | undefined,
  };
}

/** `PayrollRun.lineItems`/run metadata round-trip largely as-is (jsonb + plain
 * columns) — this just narrows to the wire shape and matches key ordering elsewhere. */
function runToWire(row: PayrollRun) {
  return {
    id: row.id,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    durationType: row.durationType,
    status: row.status,
    lineItems: row.lineItems,
    runBy: row.runBy,
    runAt: row.runAt,
    reportUrl: row.reportUrl,
  };
}

/**
 * GET /payroll/summary?period=this_week|last_week|this_month&periodStart=&periodEnd=
 * Read-only preview of what a payroll run *would* contain for a period — the "Run
 * Report" / draft-review step (PRD Section 6) without creating a `PayrollRun` row.
 * Explicit `periodStart`+`periodEnd` win over `period` if both are given (see
 * `resolvePayrollPeriod`).
 */
router.get("/payroll/summary", requireOrgSession, async (req, res) => {
  const parsed = parsePeriodQuery(req);
  if (!parsed) {
    res.status(400).json({
      error: "invalid_request",
      message: "period must be this_week/last_week/this_month, and/or periodStart/periodEnd must be YYYY-MM-DD",
    });
    return;
  }
  try {
    const { start, end } = resolvePayrollPeriod(parsed);
    const summary = await calculatePayrollSummary(req.organizationId!, start, end);
    const data = GetPayrollSummaryResponse.parse(summary);
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof InvalidPayrollPeriodError) {
      res.status(400).json({ error: "invalid_period", message: err.message });
      return;
    }
    logger.error({ err }, "GET /payroll/summary: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/payroll/runs", requireOrgSession, async (req, res) => {
  const rawLimit = req.query.limit;
  let limit: number | undefined;
  if (rawLimit !== undefined) {
    if (typeof rawLimit !== "string" || !/^\d+$/.test(rawLimit)) {
      res.status(400).json({ error: "invalid_request", message: "limit must be a positive integer" });
      return;
    }
    limit = Number(rawLimit);
  }
  try {
    const rows = await listPayrollRuns(req.organizationId!, { limit });
    const data = ListPayrollRunsResponse.parse(rows.map(runToWire));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /payroll/runs: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /payroll/runs — computes and stores line items for the given period
 * (`status: "draft"`, review-before-pay per PRD Section 6). `runByEmployeeId` is
 * required — see `createPayrollRun`'s doc comment in `@workspace/db` for the flagged
 * design gap this works around (no admin-user-to-employee mapping exists in v1).
 */
router.post("/payroll/runs", requireOrgSession, async (req, res) => {
  const parsedBody = CreatePayrollRunBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const body = parsedBody.data;
  try {
    const { start, end } = resolvePayrollPeriod({
      period: body.period,
      periodStart: body.periodStart?.toISOString().slice(0, 10),
      periodEnd: body.periodEnd?.toISOString().slice(0, 10),
    });
    const row = await createPayrollRun(req.organizationId!, {
      periodStart: start,
      periodEnd: end,
      durationType: body.durationType,
      runByEmployeeId: body.runByEmployeeId,
    });
    const data = CreatePayrollRunResponse.parse(runToWire(row));
    res.status(201).json(data);
  } catch (err) {
    if (err instanceof InvalidPayrollPeriodError) {
      res.status(400).json({ error: "invalid_period", message: err.message });
      return;
    }
    logger.error({ err }, "POST /payroll/runs: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/payroll/runs/:id", requireOrgSession, async (req, res) => {
  const parsedParams = GetPayrollRunParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  try {
    const row = await getPayrollRunById(req.organizationId!, parsedParams.data.id);
    if (!row) {
      res.status(404).json({ error: "payroll_run_not_found" });
      return;
    }
    const data = GetPayrollRunResponse.parse(runToWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /payroll/runs/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * PATCH /payroll/runs/:id — `draft` -> `paid` only, for now. This is a bookkeeping
 * status flip, NOT a real payment execution (no processor is connected to actually
 * send a direct deposit/check) — see `markPayrollRunPaid`'s doc comment in
 * `@workspace/db`.
 */
router.patch("/payroll/runs/:id", requireOrgSession, async (req, res) => {
  const parsedParams = UpdatePayrollRunParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  const parsedBody = UpdatePayrollRunBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  try {
    const row = await markPayrollRunPaid(req.organizationId!, parsedParams.data.id);
    if (!row) {
      res.status(404).json({ error: "payroll_run_not_found" });
      return;
    }
    const data = UpdatePayrollRunResponse.parse(runToWire(row));
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof PayrollRunValidationError) {
      res.status(400).json({ error: "invalid_status_transition", message: err.message });
      return;
    }
    logger.error({ err }, "PATCH /payroll/runs/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
