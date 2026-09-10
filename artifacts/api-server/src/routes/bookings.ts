import { Router, type IRouter } from "express";
import {
  listBookings,
  listAnchorCandidates,
  getBookingById,
  createBooking,
  updateBooking,
  deleteBooking,
  recordBookingPayment,
  refundBooking,
  BookingValidationError,
  BookingOverlapError,
  CardProcessingUnavailableError,
  type BookingWithRelations,
} from "@workspace/db";
import { computeRoute } from "../integrations/google-maps";
import {
  ListBookingsResponse,
  ListBookingAnchorsQueryParams,
  ListBookingAnchorsResponse,
  CreateBookingBody,
  CreateBookingResponse,
  GetBookingParams,
  GetBookingResponse,
  UpdateBookingParams,
  UpdateBookingBody,
  UpdateBookingResponse,
  DeleteBookingParams,
  RecordBookingPaymentParams,
  RecordBookingPaymentBody,
  RecordBookingPaymentResponse,
  RefundBookingParams,
  RefundBookingBody,
  RefundBookingResponse,
} from "@workspace/api-zod";
import { requireOrgSession } from "../middlewares/require-org-session";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

const router: IRouter = Router();

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `pg`/node-postgres error objects carry a Postgres error `code` string; `23503` is
 * `foreign_key_violation` — the shape a bad `clientId`/`packageIds[]`/
 * `employeeSplit[].employeeId` reference takes when it slips past the app layer.
 *
 * Drizzle (0.45.x) wraps the raw `pg` error in its own `DrizzleQueryError`, with the
 * real `pg` error (and its `.code`) attached as `.cause`, not on the top-level error
 * object — confirmed empirically (see the task write-up's live test transcript: a
 * deliberately-bad `clientId` produced a `DrizzleQueryError` whose `.cause` was the
 * `pg` `error: insert or update ... violates foreign key constraint` with
 * `code: "23503"`). A naive top-level-only check on `err.code` never matches, so this
 * walks `.cause` a few levels rather than assuming one specific wrapping depth.
 */
function isForeignKeyViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object" && "code" in current && (current as { code?: unknown }).code === "23503") {
      return true;
    }
    current = typeof current === "object" && current !== null && "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

/**
 * `depositAmount`/`parkingCost`/`employeeSplit[].percentage` round-trip as `string` at
 * the DB layer (numeric columns, same reasoning as `settings.ts`'s `toWire`) but the
 * wire contract types them as `number`, matching mock-data.ts. `employeeIds` is
 * derived from `employeeSplit` rather than stored separately (see
 * `../../../../lib/db/src/schema/employee-split.ts`).
 */
function toWire(row: BookingWithRelations) {
  return {
    id: row.id,
    clientId: row.clientId,
    packageIds: row.packageIds,
    employeeIds: row.employeeSplit.map((s) => s.employeeId),
    employeeSplit: row.employeeSplit.map((s) => ({ employeeId: s.employeeId, percentage: Number(s.percentage) })),
    date: row.date,
    startTime: row.startTime,
    address: row.address,
    // PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md FR-2/§9.4 (Phase 1) — null for any
    // booking with no coordinates yet (every booking that existed before this field
    // shipped, or one saved via the "Use what I typed" manual-override path); see
    // `schema/bookings.ts`'s doc comment on these columns.
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    googlePlaceId: row.googlePlaceId,
    formattedAddress: row.formattedAddress,
    depositAmount: Number(row.depositAmount),
    parkingCost: Number(row.parkingCost),
    status: row.status,
    notes: row.notes,
    paymentMethod: row.paymentMethod,
    paymentReference: row.paymentReference,
    paymentRecordedAt: row.paymentRecordedAt,
    refundStatus: row.refundStatus,
    refundReference: row.refundReference,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

/**
 * GET /bookings — date-range list powering the calendar view (FR-10), plus an
 * optional `clientId` filter (FR-5/FR-6 of
 * PRD_DetailHub_Signup_Copy_and_Packages_Hardening.md, Section 6.2) powering the
 * client-detail booking history view. `start`/`end` are validated as plain
 * `YYYY-MM-DD` strings rather than run through the generated
 * `ListBookingsQueryParams` zod schema: the orval pipeline's `coerce` config
 * (`lib/api-spec/orval.config.ts`) only coerces `date`/`date-time` for `body`/
 * `response`, not `query` — a raw query-string `start`/`end` would fail `zod.date()`'s
 * strict "must already be a Date instance" check. Manual validation here sidesteps
 * that rather than fighting the generator config for two optional query strings.
 *
 * `clientId` composes with (never bypasses) the organization scoping: it's forwarded
 * into `listBookings`, which ANDs it onto the same `conditions` array as
 * `organizationId` (see that function's doc comment in `@workspace/db`'s
 * `bookings.ts`) — and every query in this codebase also runs inside
 * `withOrganization`, which sets the `app.organization_id` Postgres session variable
 * that this table's RLS policy enforces independently of the application-level WHERE
 * clause. A `clientId` for a client belonging to a different organization can only
 * ever narrow the already-org-scoped result to nothing — it can't be used to read
 * across organizations.
 */
router.get("/bookings", requireOrgSession, async (req, res) => {
  const rawStart = req.query.start;
  const rawEnd = req.query.end;
  const rawClientId = req.query.clientId;
  if ((rawStart !== undefined && (typeof rawStart !== "string" || !DATE_ONLY.test(rawStart))) ||
      (rawEnd !== undefined && (typeof rawEnd !== "string" || !DATE_ONLY.test(rawEnd)))) {
    res.status(400).json({ error: "invalid_request", message: "start/end must be YYYY-MM-DD" });
    return;
  }
  let clientId: number | undefined;
  if (rawClientId !== undefined) {
    if (typeof rawClientId !== "string" || !/^\d+$/.test(rawClientId)) {
      res.status(400).json({ error: "invalid_request", message: "clientId must be a positive integer" });
      return;
    }
    clientId = Number(rawClientId);
  }
  try {
    const rows = await listBookings(req.organizationId!, {
      start: rawStart as string | undefined,
      end: rawEnd as string | undefined,
      clientId,
    });
    const data = ListBookingsResponse.parse(rows.map(toWire));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /bookings: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/bookings", requireOrgSession, async (req, res) => {
  const parsedBody = CreateBookingBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const body = parsedBody.data;
  try {
    const row = await createBooking(req.organizationId!, req.userId!, {
      clientId: body.clientId,
      packageIds: body.packageIds,
      employeeSplit: body.employeeSplit.map((s) => ({ employeeId: s.employeeId, percentage: String(s.percentage) })),
      date: body.date.toISOString().slice(0, 10),
      startTime: body.startTime,
      address: body.address,
      // FR-2/FR-14: only ever set together, when the owner selected a suggestion from
      // Places Autocomplete (`POST /places/details`'s response) — omitted entirely for
      // a manual/free-typed address (FR-17), which leaves these columns null.
      ...(body.latitude !== undefined && { latitude: String(body.latitude) }),
      ...(body.longitude !== undefined && { longitude: String(body.longitude) }),
      ...(body.googlePlaceId !== undefined && { googlePlaceId: body.googlePlaceId }),
      ...(body.formattedAddress !== undefined && { formattedAddress: body.formattedAddress }),
      depositAmount: String(body.depositAmount),
      parkingCost: String(body.parkingCost),
      status: body.status,
      notes: body.notes ?? null,
      // `paymentMethod`/`paymentReference`/`refundStatus`/`refundReference` are
      // deliberately NOT settable here — Payment Methods PRD FR-1/FR-2's checkout flow
      // records payment as its own dedicated step (`POST /bookings/:id/payment`),
      // after a booking already exists, not a field set at creation. Routing all
      // payment writes through that one endpoint (and `POST /bookings/:id/refund`) is
      // also what keeps FR-5's "credit_card must be rejected, no processor connected"
      // guard as a single enforced choke point rather than something a generic
      // `PATCH /bookings/:id` could quietly bypass.
    }, computeRoute);
    const data = CreateBookingResponse.parse(toWire(row));
    res.status(201).json(data);
  } catch (err) {
    if (err instanceof BookingOverlapError) {
      // BUG-3 (`BUGS_Mobull_2026-09-10.md`) — 409, not 400: the request is
      // well-formed, it just conflicts with an existing booking for the same
      // employee(s).
      res.status(409).json({ error: "booking_overlap", message: err.message });
      return;
    }
    if (err instanceof BookingValidationError) {
      res.status(400).json({ error: "invalid_employee_split", message: err.message });
      return;
    }
    if (isForeignKeyViolation(err)) {
      res.status(400).json({
        error: "invalid_reference",
        message: "clientId/packageIds/employeeSplit must reference existing rows in this organization.",
      });
      return;
    }
    logger.error({ err }, "POST /bookings: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /bookings/anchors — PRD_Mobull_Appointment_Optimizer_v1.0.md FR-19/§5 Step 1.
 * Registered BEFORE `GET /bookings/:id` below: Express matches routes in
 * registration order, and `:id` matches any path segment (including the literal
 * string "anchors") — if `/bookings/:id` were registered first, a request to
 * `/bookings/anchors` would be routed there instead and fail `GetBookingParams`'s
 * integer-id parse with a 400, never reaching this handler.
 *
 * `lat`/`lng` are required; `days` is optional and defaults to
 * `ANCHOR_DEFAULT_SEARCH_WINDOW_DAYS` (7, FR-22 — the search window is a Phase 2
 * business setting, hardcoded here for Phase 1) inside `listAnchorCandidates` itself,
 * not here, so this route and any other future caller of that function share one
 * default rather than each hardcoding their own.
 */
router.get("/bookings/anchors", requireOrgSession, async (req, res) => {
  const parsedQuery = ListBookingAnchorsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: "invalid_request", message: parsedQuery.error.message });
    return;
  }
  const { lat, lng, days } = parsedQuery.data;
  try {
    const rows = await listAnchorCandidates(req.organizationId!, { lat, lng, days });
    const data = ListBookingAnchorsResponse.parse(rows);
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /bookings/anchors: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/bookings/:id", requireOrgSession, async (req, res) => {
  const parsedParams = GetBookingParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  try {
    const row = await getBookingById(req.organizationId!, parsedParams.data.id);
    if (!row) {
      res.status(404).json({ error: "booking_not_found" });
      return;
    }
    const data = GetBookingResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /bookings/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/bookings/:id", requireOrgSession, async (req, res) => {
  const parsedParams = UpdateBookingParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  const parsedBody = UpdateBookingBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const body = parsedBody.data;

  try {
    const row = await updateBooking(req.organizationId!, parsedParams.data.id, {
      ...(body.clientId !== undefined && { clientId: body.clientId }),
      ...(body.packageIds !== undefined && { packageIds: body.packageIds }),
      ...(body.employeeSplit !== undefined && {
        employeeSplit: body.employeeSplit.map((s) => ({ employeeId: s.employeeId, percentage: String(s.percentage) })),
      }),
      ...(body.date !== undefined && { date: body.date.toISOString().slice(0, 10) }),
      ...(body.startTime !== undefined && { startTime: body.startTime }),
      ...(body.address !== undefined && { address: body.address }),
      ...(body.latitude !== undefined && { latitude: String(body.latitude) }),
      ...(body.longitude !== undefined && { longitude: String(body.longitude) }),
      ...(body.googlePlaceId !== undefined && { googlePlaceId: body.googlePlaceId }),
      ...(body.formattedAddress !== undefined && { formattedAddress: body.formattedAddress }),
      ...(body.depositAmount !== undefined && { depositAmount: String(body.depositAmount) }),
      ...(body.parkingCost !== undefined && { parkingCost: String(body.parkingCost) }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.notes !== undefined && { notes: body.notes }),
      // See `POST /bookings`'s comment above — payment/refund fields are only
      // settable via `POST /bookings/:id/payment` and `POST /bookings/:id/refund`.
    }, computeRoute);
    if (!row) {
      res.status(404).json({ error: "booking_not_found" });
      return;
    }
    const data = UpdateBookingResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof BookingOverlapError) {
      // BUG-3 (`BUGS_Mobull_2026-09-10.md`) — 409, not 400: the request is
      // well-formed, it just conflicts with an existing booking for the same
      // employee(s). Also catches an update that moves this booking's own
      // time/employee/address INTO conflict with another booking.
      res.status(409).json({ error: "booking_overlap", message: err.message });
      return;
    }
    if (err instanceof BookingValidationError) {
      res.status(400).json({ error: "invalid_employee_split", message: err.message });
      return;
    }
    if (isForeignKeyViolation(err)) {
      res.status(400).json({
        error: "invalid_reference",
        message: "clientId/packageIds/employeeSplit must reference existing rows in this organization.",
      });
      return;
    }
    logger.error({ err }, "PATCH /bookings/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * DELETE /bookings/:id — hard delete (see `deleteBooking`'s own doc comment in
 * `@workspace/db` for why this is safe for bookings specifically, unlike clients/
 * packages/employees).
 */
router.delete("/bookings/:id", requireOrgSession, async (req, res) => {
  const parsedParams = DeleteBookingParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  try {
    const deleted = await deleteBooking(req.organizationId!, parsedParams.data.id);
    if (!deleted) {
      res.status(404).json({ error: "booking_not_found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "DELETE /bookings/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /bookings/:id/payment — PRD_DetailHub_Payment_Methods.md FR-1/FR-2/FR-5.
 * `zelle`/`venmo`/`cash` record the tender type + optional reference note and
 * timestamp it. `credit_card` ALWAYS fails with 422 `card_processing_not_available` —
 * no processor is connected anywhere in this codebase (Section 8), and this route
 * must never fall through to any real or simulated charge logic for that case.
 */
router.post("/bookings/:id/payment", requireOrgSession, async (req, res) => {
  const parsedParams = RecordBookingPaymentParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  const parsedBody = RecordBookingPaymentBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const body = parsedBody.data;
  try {
    const row = await recordBookingPayment(req.organizationId!, parsedParams.data.id, {
      paymentMethod: body.paymentMethod,
      paymentReference: body.paymentReference ?? null,
    });
    if (!row) {
      res.status(404).json({ error: "booking_not_found" });
      return;
    }
    const data = RecordBookingPaymentResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof CardProcessingUnavailableError) {
      res.status(422).json({ error: "card_processing_not_available", message: err.message });
      return;
    }
    logger.error({ err }, "POST /bookings/:id/payment: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /bookings/:id/refund — FR-8/Section 6.2. Always a manual reversal record; no
 * processor refund API is ever called here for any tender type (see
 * `refundBooking`'s doc comment in `@workspace/db`).
 */
router.post("/bookings/:id/refund", requireOrgSession, async (req, res) => {
  const parsedParams = RefundBookingParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  const parsedBody = RefundBookingBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const body = parsedBody.data;
  try {
    const row = await refundBooking(req.organizationId!, parsedParams.data.id, {
      refundReference: body.refundReference ?? null,
    });
    if (!row) {
      res.status(404).json({ error: "booking_not_found" });
      return;
    }
    const data = RefundBookingResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "POST /bookings/:id/refund: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
