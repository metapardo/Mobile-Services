import { Router, type IRouter } from "express";
import { listEmployees, getEmployeeById, createEmployee, updateEmployee, archiveEmployee, type Employee } from "@workspace/db";
import {
  ListEmployeesResponse,
  CreateEmployeeBody,
  CreateEmployeeResponse,
  GetEmployeeParams,
  GetEmployeeResponse,
  UpdateEmployeeParams,
  UpdateEmployeeBody,
  UpdateEmployeeResponse,
  ArchiveEmployeeParams,
  ArchiveEmployeeResponse,
} from "@workspace/api-zod";
import { requireOrgSession } from "../middlewares/require-org-session";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

const router: IRouter = Router();

/**
 * Minimal wire shape (FR-2/FR-9) — deliberately does NOT expose `workerType`/
 * `paymentMethod`/`bankAccounts`, which already exist as DB columns for the Payroll
 * Module (with defaults so this minimal API can ignore them entirely, see
 * `../../../../lib/db/src/schema/employees.ts`).
 */
function toWire(row: Employee) {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    email: row.email,
    phone: row.phone,
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.get("/employees", requireOrgSession, async (req, res) => {
  const includeInactive = req.query.includeInactive === "true";
  try {
    const rows = await listEmployees(req.organizationId!, { includeInactive });
    const data = ListEmployeesResponse.parse(rows.map(toWire));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /employees: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/employees", requireOrgSession, async (req, res) => {
  const parsedBody = CreateEmployeeBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  try {
    const row = await createEmployee(req.organizationId!, parsedBody.data);
    const data = CreateEmployeeResponse.parse(toWire(row));
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err }, "POST /employees: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/employees/:id", requireOrgSession, async (req, res) => {
  const parsedParams = GetEmployeeParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  try {
    const row = await getEmployeeById(req.organizationId!, parsedParams.data.id);
    if (!row) {
      res.status(404).json({ error: "employee_not_found" });
      return;
    }
    const data = GetEmployeeResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /employees/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/employees/:id", requireOrgSession, async (req, res) => {
  const parsedParams = UpdateEmployeeParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  const parsedBody = UpdateEmployeeBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  try {
    const row = await updateEmployee(req.organizationId!, parsedParams.data.id, parsedBody.data);
    if (!row) {
      res.status(404).json({ error: "employee_not_found" });
      return;
    }
    const data = UpdateEmployeeResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "PATCH /employees/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/** Soft-delete (archive, i.e. `active: false`) — see `archiveEmployee`'s own doc
 * comment in `@workspace/db`. Not required by FR-9 but cheap and consistent with
 * clients/packages. */
router.delete("/employees/:id", requireOrgSession, async (req, res) => {
  const parsedParams = ArchiveEmployeeParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  try {
    const row = await archiveEmployee(req.organizationId!, parsedParams.data.id);
    if (!row) {
      res.status(404).json({ error: "employee_not_found" });
      return;
    }
    const data = ArchiveEmployeeResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "DELETE /employees/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
