import { Router, type IRouter } from "express";
import { listTimeOffRequests, createTimeOffRequest, reviewTimeOffRequest, type TimeOffRequest } from "@workspace/db";
import {
  ListTimeOffRequestsResponse,
  CreateTimeOffRequestBody,
  CreateTimeOffRequestResponse,
  ReviewTimeOffRequestParams,
  ReviewTimeOffRequestBody,
  ReviewTimeOffRequestResponse,
} from "@workspace/api-zod";
import { requireOrgSession } from "../middlewares/require-org-session";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

const router: IRouter = Router();

function toWire(row: TimeOffRequest) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status,
    requestedAt: row.requestedAt,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt,
    note: row.note,
  };
}

/**
 * GET /time-off-requests?status=&employeeId= — powers the Time Off queue (PRD Section
 * 5). Per Open Question #12's decided default, approved time off is informational
 * only here — this API never blocks/checks booking assignment against it.
 */
router.get("/time-off-requests", requireOrgSession, async (req, res) => {
  const rawStatus = req.query.status;
  const rawEmployeeId = req.query.employeeId;
  if (rawStatus !== undefined && !["pending", "approved", "denied"].includes(String(rawStatus))) {
    res.status(400).json({ error: "invalid_request", message: "status must be pending, approved, or denied" });
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
    const rows = await listTimeOffRequests(req.organizationId!, {
      status: rawStatus as "pending" | "approved" | "denied" | undefined,
      employeeId,
    });
    const data = ListTimeOffRequestsResponse.parse(rows.map(toWire));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /time-off-requests: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/time-off-requests", requireOrgSession, async (req, res) => {
  const parsedBody = CreateTimeOffRequestBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const body = parsedBody.data;
  try {
    const row = await createTimeOffRequest(req.organizationId!, {
      employeeId: body.employeeId,
      startDate: body.startDate.toISOString().slice(0, 10),
      endDate: body.endDate.toISOString().slice(0, 10),
      note: body.note ?? null,
    });
    const data = CreateTimeOffRequestResponse.parse(toWire(row));
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err }, "POST /time-off-requests: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /time-off-requests/:id/review — approve or deny (PRD Section 5's "Approve Time
 * Off Request" modal). `reviewedByEmployeeId` is optional — see `reviewTimeOffRequest`'s
 * doc comment in `@workspace/db` for why (no reliable admin-user-to-employee mapping
 * exists yet in v1).
 */
router.post("/time-off-requests/:id/review", requireOrgSession, async (req, res) => {
  const parsedParams = ReviewTimeOffRequestParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  const parsedBody = ReviewTimeOffRequestBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const body = parsedBody.data;
  try {
    const row = await reviewTimeOffRequest(req.organizationId!, parsedParams.data.id, {
      status: body.status,
      reviewedByEmployeeId: body.reviewedByEmployeeId ?? null,
    });
    if (!row) {
      res.status(404).json({ error: "time_off_request_not_found" });
      return;
    }
    const data = ReviewTimeOffRequestResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "POST /time-off-requests/:id/review: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
