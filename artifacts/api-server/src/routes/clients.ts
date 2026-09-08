import { Router, type IRouter } from "express";
import { listClients, getClientById, createClient, updateClient, archiveClient, type Client } from "@workspace/db";
import {
  ListClientsResponse,
  CreateClientBody,
  CreateClientResponse,
  GetClientParams,
  GetClientResponse,
  UpdateClientParams,
  UpdateClientBody,
  UpdateClientResponse,
  ArchiveClientParams,
  ArchiveClientResponse,
} from "@workspace/api-zod";
import { requireOrgSession } from "../middlewares/require-org-session";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

const router: IRouter = Router();

function toWire(row: Client) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    notes: row.notes,
    archived: row.archived,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * GET /clients — every route in this file requires `requireOrgSession` (see that
 * middleware's own header comment) and every `@workspace/db` call below is scoped by
 * `req.organizationId!` via `withOrganization` (`lib/db/src/tenant.ts`), which is what
 * actually sets `app.organization_id` for RLS to enforce — never query these tables
 * without going through one of those `@workspace/db` functions.
 */
router.get("/clients", requireOrgSession, async (req, res) => {
  const includeArchived = req.query.includeArchived === "true";
  try {
    const rows = await listClients(req.organizationId!, { includeArchived });
    const data = ListClientsResponse.parse(rows.map(toWire));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /clients: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/clients", requireOrgSession, async (req, res) => {
  const parsedBody = CreateClientBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  try {
    const row = await createClient(req.organizationId!, parsedBody.data);
    const data = CreateClientResponse.parse(toWire(row));
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err }, "POST /clients: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/clients/:id", requireOrgSession, async (req, res) => {
  const parsedParams = GetClientParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  try {
    const row = await getClientById(req.organizationId!, parsedParams.data.id);
    if (!row) {
      res.status(404).json({ error: "client_not_found" });
      return;
    }
    const data = GetClientResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /clients/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/clients/:id", requireOrgSession, async (req, res) => {
  const parsedParams = UpdateClientParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  const parsedBody = UpdateClientBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  try {
    const row = await updateClient(req.organizationId!, parsedParams.data.id, parsedBody.data);
    if (!row) {
      res.status(404).json({ error: "client_not_found" });
      return;
    }
    const data = UpdateClientResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "PATCH /clients/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/** Soft-delete (archive) — see `archiveClient`'s own doc comment in `@workspace/db`. */
router.delete("/clients/:id", requireOrgSession, async (req, res) => {
  const parsedParams = ArchiveClientParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  try {
    const row = await archiveClient(req.organizationId!, parsedParams.data.id);
    if (!row) {
      res.status(404).json({ error: "client_not_found" });
      return;
    }
    const data = ArchiveClientResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "DELETE /clients/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
