import { eq } from "drizzle-orm";
import { settingsTable, type InsertSettings, type Settings } from "./schema";
import { withOrganization } from "./tenant";

/**
 * Defaults for every `settings` column other than `organizationId`/`homeAddress`,
 * used to create a new organization's settings row at signup time. Intentionally
 * copied from `artifacts/detail-hub/src/lib/mock-data.ts`'s `settings` object (the
 * values a brand-new frontend instance already assumes as "sensible defaults" today),
 * not invented fresh here — these are Gas Meter / commission assumptions this PRD
 * (`PRD_DetailHub_SelfServe_Signup_Trial.md`) doesn't ask a signing-up business to
 * configure, but `settingsTable`'s columns are `NOT NULL` with no DB-level default, so
 * *something* has to be written at row-creation time. All Gas Meter/commission-rate
 * defaults are expected to be reviewed/adjusted later from Settings — only
 * `homeAddress` is real signup input (see `createDefaultSettings` below).
 */
const SETTINGS_DEFAULTS = {
  gasPrice: "6.00",
  vehicleMpg: "28",
  gasThresholdGreen: "10",
  gasThresholdAmber: "20",
  commissionRate: "25",
  fuelGaugeHalfMi: "3",
  fuelGaugeFullMi: "8",
  fuelGaugeHalfMin: "1.5",
  fuelGaugeFullMin: "4",
  // PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md §6.2 — matches `settingsTable.techHourlyCost`'s
  // own DB-level default (`.notNull().default("22.00")`); listed explicitly here too,
  // same as every other default in this object, rather than relying on the column
  // default alone.
  techHourlyCost: "22.00",
  paymentProcessorConnected: false,
  cardReaderPaired: false,
} satisfies Partial<InsertSettings>;

/**
 * Creates the one-row-per-organization `settings` row for a brand-new organization,
 * populating `homeAddress` from the required business-address field collected at
 * signup (`PRD_DetailHub_SelfServe_Signup_Trial.md` FR-11/FR-13 — this is
 * `AdminSettings.home_base_address` from the master PRD; formalized here as
 * `settingsTable.homeAddress`, which already existed in this schema before this PRD's
 * work started, rather than as a new/duplicate address field or table). Every other
 * column is seeded from `SETTINGS_DEFAULTS` above, editable later via
 * `updateSettings`/`GET|PATCH /settings`.
 *
 * `hq` (optional): the resolved `hqLatitude`/`hqLongitude`/`hqGooglePlaceId` for
 * `homeAddress`, if the caller already geocoded it (`POST /auth/signup` does this via
 * `geocodeAddress` before calling here — see that route's own comment for why a failed/
 * unresolved geocode must never block signup). Omitted or `undefined` leaves all three
 * columns `null`, exactly as before this parameter existed — every code path that reads
 * them (Fuel Gauge, `PRD_Mobull_Weather_Coverage.md`'s calendar/booking weather icons)
 * already treats "HQ has no coordinates yet" as a real, expected state, not an error, so
 * there is no unsafe default to worry about here.
 */
export async function createDefaultSettings(
  organizationId: string,
  homeAddress: string,
  hq?: { latitude: number; longitude: number; placeId: string } | null,
): Promise<Settings> {
  return withOrganization(organizationId, async (tx) => {
    const [created] = await tx
      .insert(settingsTable)
      .values({
        organizationId,
        homeAddress,
        ...(hq && {
          hqLatitude: String(hq.latitude),
          hqLongitude: String(hq.longitude),
          hqGooglePlaceId: hq.placeId,
        }),
        ...SETTINGS_DEFAULTS,
      })
      .returning();
    return created!;
  });
}

/** Reads the single settings row for an organization, or `null` if none exists yet. */
export async function getSettings(organizationId: string): Promise<Settings | null> {
  return withOrganization(organizationId, async (tx) => {
    const [row] = await tx
      .select()
      .from(settingsTable)
      .where(eq(settingsTable.organizationId, organizationId));
    return row ?? null;
  });
}

/**
 * Partially updates an organization's settings row (e.g. editing `homeAddress` later
 * from Settings, per FR-13). `organizationId` itself is never patchable — callers
 * can't pass it in `patch` since it's typed as `Omit<..., "organizationId">`, and even
 * if a caller managed to smuggle it in, the RLS `WITH CHECK` predicate this row is
 * scoped under would reject any attempt to move it to a different organization.
 *
 * Bug fix (reported live: Settings showed a freshly-typed San Diego home address, but
 * the Fuel Gauge kept computing drive time from the org's *previous* HQ on the other
 * side of the country): `settings.tsx`'s `AddressAutocomplete` clears its local
 * `hqLatitude`/`hqLongitude` to `null` the moment the owner types (a stale coordinate
 * pair must never survive edited-but-not-yet-reselected text), which `toUpdateRequest`
 * then serializes as `undefined` on the wire. Previously, `undefined` here meant
 * "caller didn't mention this column" and the UPDATE below left whatever coordinates
 * were already in the row untouched — so `homeAddress` moved to the new text while the
 * old, now-unrelated `hqLatitude`/`hqLongitude`/`hqGooglePlaceId` silently lived on,
 * and the Fuel Gauge (which reads those columns directly, never re-geocoding
 * `homeAddress` live — see `booking-new.tsx`'s `hqHasCoordinates`) kept confidently
 * costing jobs against a location the business no longer operates from. There was no
 * error and nothing looked wrong in Settings, which is what made this so hard to spot.
 * Per `settings.ts` (the API route)'s own `toWire` comment, the intended contract is
 * "null until Home Base is re-saved through the Places-autocomplete field" — i.e. an
 * address update with no accompanying coordinates should *clear* the old ones, not
 * inherit them. `hqHasCoordinates` already treats null coordinates as a normal,
 * well-handled state (`booking-new.tsx`'s "no-hq" Fuel Gauge state points the owner
 * back to Settings) — a bare `homeAddress` update now lands there instead of on a
 * confidently wrong number.
 */
export async function updateSettings(
  organizationId: string,
  patch: Partial<Omit<InsertSettings, "organizationId">>,
): Promise<Settings | null> {
  const effectivePatch =
    patch.homeAddress !== undefined && patch.hqLatitude === undefined
      ? { ...patch, hqLatitude: null, hqLongitude: null, hqGooglePlaceId: null }
      : patch;

  return withOrganization(organizationId, async (tx) => {
    const [updated] = await tx
      .update(settingsTable)
      .set(effectivePatch)
      .where(eq(settingsTable.organizationId, organizationId))
      .returning();
    if (updated) return updated;

    if (effectivePatch.homeAddress === undefined) return null;
    const [created] = await tx
      .insert(settingsTable)
      .values({ organizationId, ...SETTINGS_DEFAULTS, ...effectivePatch, homeAddress: effectivePatch.homeAddress })
      .returning();
    return created ?? null;
  });
}
