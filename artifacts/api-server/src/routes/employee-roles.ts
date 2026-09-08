import { Router, type IRouter } from "express";
import {
  listEmployeeRoles,
  createEmployeeRole,
  updateEmployeeRole,
  deleteEmployeeRole,
  EmployeeRoleValidationError,
  type EmployeeRole,
} from "@workspace/db";
import {
  ListEmployeeRolesParams,
  ListEmployeeRolesResponse,
  CreateEmployeeRoleParams,
  CreateEmployeeRoleBody,
  CreateEmployeeRoleResponse,
  UpdateEmployeeRoleParams,
  UpdateEmployeeRoleBody,
  UpdateEmployeeRoleResponse,
  DeleteEmployeeRoleParams,
} from "@workspace/api-zod";
import { requireOrgSession } from "../middlewares/require-org-session";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

const router: IRouter = Router();

/**
 * `hourlyRate`/`commissionRate` round-trip as `string` at the DB layer (`numeric`
 * columns) but the wire contract types them as `number | null`, matching every other
 * numeric field in this API (see `bookings.ts`/`packages.ts`/`settings.ts`'s `toWire`).
 */
function toWire(row: EmployeeRole) {
  return {
    id: row.id,
    employeeId: row.employeeId,
    roleName: row.roleName,
    payType: row.payType,
    hourlyRate: row.hourlyRate === null ? null : Number(row.hourlyRate),
    commissionRate: row.commissionRate === null ? null : Number(row.commissionRate),
  };
}

router.get("/employees/:employeeId/roles", requireOrgSession, async (req, res) => {
  const parsedParams = ListEmployeeRolesParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  try {
    const rows = await listEmployeeRoles(req.organizationId!, parsedParams.data.employeeId);
    const data = ListEmployeeRolesResponse.parse(rows.map(toWire));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /employees/:employeeId/roles: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/employees/:employeeId/roles", requireOrgSession, async (req, res) => {
  const parsedParams = CreateEmployeeRoleParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  const parsedBody = CreateEmployeeRoleBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const body = parsedBody.data;
  try {
    const row = await createEmployeeRole(req.organizationId!, parsedParams.data.employeeId, {
      roleName: body.roleName,
      payType: body.payType,
      hourlyRate: body.hourlyRate === undefined || body.hourlyRate === null ? null : String(body.hourlyRate),
      commissionRate: body.commissionRate === undefined || body.commissionRate === null ? null : String(body.commissionRate),
    });
    const data = CreateEmployeeRoleResponse.parse(toWire(row));
    res.status(201).json(data);
  } catch (err) {
    if (err instanceof EmployeeRoleValidationError) {
      res.status(400).json({ error: "invalid_employee_role", message: err.message });
      return;
    }
    logger.error({ err }, "POST /employees/:employeeId/roles: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/employees/:employeeId/roles/:roleId", requireOrgSession, async (req, res) => {
  const parsedParams = UpdateEmployeeRoleParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  const parsedBody = UpdateEmployeeRoleBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const body = parsedBody.data;
  try {
    const row = await updateEmployeeRole(req.organizationId!, parsedParams.data.employeeId, parsedParams.data.roleId, {
      ...(body.roleName !== undefined && { roleName: body.roleName }),
      ...(body.payType !== undefined && { payType: body.payType }),
      ...(body.hourlyRate !== undefined && { hourlyRate: body.hourlyRate === null ? null : String(body.hourlyRate) }),
      ...(body.commissionRate !== undefined && {
        commissionRate: body.commissionRate === null ? null : String(body.commissionRate),
      }),
    });
    if (!row) {
      res.status(404).json({ error: "employee_role_not_found" });
      return;
    }
    const data = UpdateEmployeeRoleResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof EmployeeRoleValidationError) {
      res.status(400).json({ error: "invalid_employee_role", message: err.message });
      return;
    }
    logger.error({ err }, "PATCH /employees/:employeeId/roles/:roleId: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.delete("/employees/:employeeId/roles/:roleId", requireOrgSession, async (req, res) => {
  const parsedParams = DeleteEmployeeRoleParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  try {
    const deleted = await deleteEmployeeRole(req.organizationId!, parsedParams.data.employeeId, parsedParams.data.roleId);
    if (!deleted) {
      res.status(404).json({ error: "employee_role_not_found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "DELETE /employees/:employeeId/roles/:roleId: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
