import { Router, type IRouter } from "express";
import { listTimeLogs, createTimeLog, approveTimeLog, deleteTimeLog, type TimeLog } from "@workspace/db";
import {
  ListTimeLogsResponse,
  CreateTimeLogBody,
  CreateTimeLogResponse,
  ApproveTimeLogParams,
  ApproveTimeLogResponse,
  DeleteTimeLogParams,
} from "@workspace/api-zod";
import { requireOrgSession } from "../middlewares/require-org-session";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

const router: IRouter = Router();

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** `hours` round-trips as `string` (DB `numeric` column) but the wire contract types
 * it as `number`, same reasoning as every other numeric field in this API. */
function toWire(row: TimeLog) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    roleName: row.roleName,
    date: row.date,
    hours: Number(row.hours),
    source: row.source,
    linkedBookingId: row.linkedBookingId,
    approved: row.approved,
  };
}

/**
 * GET /time-logs?employeeId=&start=&end= — filterable by employee and/or an inclusive
 * `YYYY-MM-DD` date range, powering the Time Tracking hub (PRD Section 4). `start`/
 * `end` are validated manually (same reasoning as `bookings.ts`'s `GET /bookings`: the
 * orval `coerce` config only coerces `date`/`date-time` for body/response, not query).
 */
router.get("/time-logs", requireOrgSession, async (req, res) => {
  const rawEmployeeId = req.query.employeeId;
  const rawStart = req.query.start;
  const rawEnd = req.query.end;
  if (
    (rawStart !== undefined && (typeof rawStart !== "string" || !DATE_ONLY.test(rawStart))) ||
    (rawEnd !== undefined && (typeof rawEnd !== "string" || !DATE_ONLY.test(rawEnd)))
  ) {
    res.status(400).json({ error: "invalid_request", message: "start/end must be YYYY-MM-DD" });
    return;
  }
  let employeeId: number | undefined;
  if (rawEmployeeId !== undefined) {
    if (typeof rawEmployeeId !== "string" || !/^\d+$/.test(rawEmployeeId)) {
      res.status(400).json({ error: "invalid_request", message: "employeeId must be a positive integer" });
      return;
    }
    employeeId = Number(rawEmployeeId);
  }
  try {
    const rows = await listTimeLogs(req.organizationId!, {
      employeeId,
      start: rawStart as string | undefined,
      end: rawEnd as string | undefined,
    });
    const data = ListTimeLogsResponse.parse(rows.map(toWire));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /time-logs: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /time-logs — manual entry only (PRD Open Question #11's decided v1 default).
 * Always created unapproved (`approved: false`); see `POST /time-logs/:id/approve`.
 */
router.post("/time-logs", requireOrgSession, async (req, res) => {
  const parsedBody = CreateTimeLogBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const body = parsedBody.data;
  try {
    const row = await createTimeLog(req.organizationId!, {
      employeeId: body.employeeId,
      roleName: body.roleName,
      date: body.date.toISOString().slice(0, 10),
      hours: String(body.hours),
    });
    const data = CreateTimeLogResponse.parse(toWire(row));
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err }, "POST /time-logs: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/** Admin review/lock step ahead of a payroll run (PRD Section 4) — only approved logs
 * feed a payroll run's `hourly_pay`. */
router.post("/time-logs/:id/approve", requireOrgSession, async (req, res) => {
  const parsedParams = ApproveTimeLogParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  try {
    const row = await approveTimeLog(req.organizationId!, parsedParams.data.id);
    if (!row) {
      res.status(404).json({ error: "time_log_not_found" });
      return;
    }
    const data = ApproveTimeLogResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "POST /time-logs/:id/approve: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/time-logs/:id", requireOrgSession, async (req, res) => {
  const parsedParams = DeleteTimeLogParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  try {
    const deleted = await deleteTimeLog(req.organizationId!, parsedParams.data.id);
    if (!deleted) {
      res.status(404).json({ error: "time_log_not_found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "DELETE /time-logs/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
