import { Router, type IRouter } from "express";
import { getSettings, updateSettings, type Settings } from "@workspace/db";
import { GetSettingsResponse, UpdateSettingsBody, UpdateSettingsResponse } from "@workspace/api-zod";
import { requireOrgSession } from "../middlewares/require-org-session";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

const router: IRouter = Router();

/**
 * `settingsTable`'s numeric columns (`gasPrice`, `vehicleMpg`, etc.) use Drizzle's
 * default `numeric` mode, which round-trips as `string` in JS (avoids silent float
 * precision loss at the DB layer) — but `mock-data.ts`'s `Settings` interface, and this
 * API's `SettingsResult`/`GetSettingsResponse` schema, type these as `number` (matching
 * what the frontend already expects). This converts a DB row to the wire shape.
 */
function toWire(row: Settings) {
  return {
    homeAddress: row.homeAddress,
    // PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md FR-2/FR-24 (Phase 1) — null until Home
    // Base is re-saved through the new Places-autocomplete field; see that column's
    // doc comment in `@workspace/db`'s `schema/settings.ts`.
    hqLatitude: row.hqLatitude !== null ? Number(row.hqLatitude) : null,
    hqLongitude: row.hqLongitude !== null ? Number(row.hqLongitude) : null,
    hqGooglePlaceId: row.hqGooglePlaceId,
    gasPrice: Number(row.gasPrice),
    vehicleMpg: Number(row.vehicleMpg),
    gasThresholdGreen: Number(row.gasThresholdGreen),
    gasThresholdAmber: Number(row.gasThresholdAmber),
    commissionRate: Number(row.commissionRate),
    fuelGaugeHalfMi: Number(row.fuelGaugeHalfMi),
    fuelGaugeFullMi: Number(row.fuelGaugeFullMi),
    fuelGaugeHalfMin: Number(row.fuelGaugeHalfMin),
    fuelGaugeFullMin: Number(row.fuelGaugeFullMin),
    techHourlyCost: Number(row.techHourlyCost),
    paymentProcessorConnected: row.paymentProcessorConnected,
    cardReaderPaired: row.cardReaderPaired,
  };
}

/**
 * GET /settings — per-organization settings, created automatically at signup (see
 * `../routes/auth.ts`'s `POST /auth/signup`, and `createDefaultSettings` in
 * `@workspace/db`). Protected by `requireOrgSession` — the first route in this server
 * to use it (see that middleware's header comment).
 */
router.get("/settings", requireOrgSession, async (req, res) => {
  try {
    const row = await getSettings(req.organizationId!);
    if (!row) {
      // Should not happen for an organization created via POST /auth/signup (which
      // always creates one) — logged loudly since it implies the signup-time
      // settings insert failed (see that route's own logging for the same case).
      logger.warn(
        { organizationId: req.organizationId },
        "GET /settings: no settings row found for this organization",
      );
      res.status(404).json({ error: "settings_not_found" });
      return;
    }
    const data = GetSettingsResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "GET /settings: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * PATCH /settings — partial update, e.g. editing the business address later
 * (`homeAddress`, FR-13 of `PRD_DetailHub_SelfServe_Signup_Trial.md`). Numeric fields
 * arrive as JS `number` over the wire (see `toWire` above) and are converted back to
 * `string` here for the `numeric`-mode DB columns.
 */
router.patch("/settings", requireOrgSession, async (req, res) => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }
  const {
    gasPrice,
    vehicleMpg,
    gasThresholdGreen,
    gasThresholdAmber,
    commissionRate,
    fuelGaugeHalfMi,
    fuelGaugeFullMi,
    fuelGaugeHalfMin,
    fuelGaugeFullMin,
    // FR-2/FR-24/§9.4 (Phase 1): `hqLatitude`/`hqLongitude` round-trip as `number` over
    // the wire (numeric-mode DB columns, same reasoning as the Gas Meter fields above)
    // — converted to `string` below. `techHourlyCost` is NOT NULL with a DB default,
    // but still optional on this partial-update request; only written when supplied.
    hqLatitude,
    hqLongitude,
    techHourlyCost,
    ...rest
  } = parsed.data;

  try {
    const row = await updateSettings(req.organizationId!, {
      ...rest,
      ...(hqLatitude !== undefined && { hqLatitude: String(hqLatitude) }),
      ...(hqLongitude !== undefined && { hqLongitude: String(hqLongitude) }),
      ...(gasPrice !== undefined && { gasPrice: String(gasPrice) }),
      ...(vehicleMpg !== undefined && { vehicleMpg: String(vehicleMpg) }),
      ...(gasThresholdGreen !== undefined && { gasThresholdGreen: String(gasThresholdGreen) }),
      ...(gasThresholdAmber !== undefined && { gasThresholdAmber: String(gasThresholdAmber) }),
      ...(commissionRate !== undefined && { commissionRate: String(commissionRate) }),
      ...(fuelGaugeHalfMi !== undefined && { fuelGaugeHalfMi: String(fuelGaugeHalfMi) }),
      ...(fuelGaugeFullMi !== undefined && { fuelGaugeFullMi: String(fuelGaugeFullMi) }),
      ...(fuelGaugeHalfMin !== undefined && { fuelGaugeHalfMin: String(fuelGaugeHalfMin) }),
      ...(fuelGaugeFullMin !== undefined && { fuelGaugeFullMin: String(fuelGaugeFullMin) }),
      ...(techHourlyCost !== undefined && { techHourlyCost: String(techHourlyCost) }),
    });
    if (!row) {
      res.status(404).json({ error: "settings_not_found" });
      return;
    }
    const data = UpdateSettingsResponse.parse(toWire(row));
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "PATCH /settings: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
