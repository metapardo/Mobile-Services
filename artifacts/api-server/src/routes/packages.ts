import { Router, type IRouter } from "express";
import { listPackages, getPackageById, createPackage, updatePackage, archivePackage, type Package } from "@workspace/db";
import {
  ListPackagesResponse,
  CreatePackageBody,
  CreatePackageResponse,
  GetPackageParams,
  GetPackageResponse,
  UpdatePackageParams,
  UpdatePackageBody,
  UpdatePackageResponse,
  ArchivePackageParams,
  ArchivePackageResponse,
} from "@workspace/api-zod";
import { requireOrgSession } from "../middlewares/require-org-session";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

const router: IRouter = Router();

/**
 * `packagesTable.price`'s numeric column round-trips as `string` in JS (same reasoning
 * as `settings.ts`'s `toWire`) but the wire contract types it as `number`, matching
 * mock-data.ts's `Package.price`.
 */
function toWire(row: Package) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description,
    price: Number(row.price),
    durationMinutes: row.durationMinutes,
    isAddon: row.isAddon,
    archived: row.archived,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

router.get("/packages", requireOrgSession, async (req, res) => {
  const includeArchived = req.query.includeArchived === "true";
  try {
    const rows = await listPackages(req.organizationId!, { includeArchived });
    const data = ListPackagesResponse.parse(rows.map(toWire));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /packages: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.post("/packages", requireOrgSession, async (req, res) => {
  const parsedBody = CreatePackageBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  try {
    const row = await createPackage(req.organizationId!, {
      ...parsedBody.data,
      price: String(parsedBody.data.price),
    });
    const data = CreatePackageResponse.parse(toWire(row));
    res.status(201).json(data);
  } catch (err) {
    logger.error({ err }, "POST /packages: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.get("/packages/:id", requireOrgSession, async (req, res) => {
  const parsedParams = GetPackageParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  try {
    const row = await getPackageById(req.organizationId!, parsedParams.data.id);
    if (!row) {
      res.status(404).json({ error: "package_not_found" });
      return;
    }
    const data = GetPackageResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /packages/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

router.patch("/packages/:id", requireOrgSession, async (req, res) => {
  const parsedParams = UpdatePackageParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  const parsedBody = UpdatePackageBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const { price, ...rest } = parsedBody.data;
  try {
    const row = await updatePackage(req.organizationId!, parsedParams.data.id, {
      ...rest,
      ...(price !== undefined && { price: String(price) }),
    });
    if (!row) {
      res.status(404).json({ error: "package_not_found" });
      return;
    }
    const data = UpdatePackageResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "PATCH /packages/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/** Soft-delete (archive) — see `archivePackage`'s own doc comment in `@workspace/db`. */
router.delete("/packages/:id", requireOrgSession, async (req, res) => {
  const parsedParams = ArchivePackageParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "invalid_request", message: parsedParams.error.message });
    return;
  }
  try {
    const row = await archivePackage(req.organizationId!, parsedParams.data.id);
    if (!row) {
      res.status(404).json({ error: "package_not_found" });
      return;
    }
    const data = ArchivePackageResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "DELETE /packages/:id: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
