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
 * Must be called with the organization's own id already in hand (i.e. after
 * `auth.api.createOrganization` succeeds) — `withOrganization` sets the RLS session
 * variable to this same id for the duration of the insert, so the newly-created row
 * satisfies its own `tenant_isolation` policy's `WITH CHECK` immediately.
 */
export async function createDefaultSettings(
  organizationId: string,
  homeAddress: string,
): Promise<Settings> {
  return withOrganization(organizationId, async (tx) => {
    const [created] = await tx
      .insert(settingsTable)
      .values({ organizationId, homeAddress, ...SETTINGS_DEFAULTS })
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
 * Self-healing: if the UPDATE affects zero rows (no settings row exists yet — a
 * legacy organization that predates `createDefaultSettings`, or a genuine
 * signup-time insert failure), this falls back to creating one from
 * `SETTINGS_DEFAULTS` plus whatever the caller supplied, rather than leaving the
 * organization permanently unable to ever reach a settings row through the API.
 * `homeAddress` is required either way (`NOT NULL`, no DB default) — the settings
 * form always sends it, so this only matters for the edge case this whole path
 * exists to fix.
 */
export async function updateSettings(
  organizationId: string,
  patch: Partial<Omit<InsertSettings, "organizationId">>,
): Promise<Settings | null> {
  return withOrganization(organizationId, async (tx) => {
    const [updated] = await tx
      .update(settingsTable)
      .set(patch)
      .where(eq(settingsTable.organizationId, organizationId))
      .returning();
    if (updated) return updated;

    if (patch.homeAddress === undefined) return null;
    const [created] = await tx
      .insert(settingsTable)
      .values({ organizationId, ...SETTINGS_DEFAULTS, ...patch, homeAddress: patch.homeAddress })
      .returning();
    return created ?? null;
  });
}
