/**
 * One-time backfill of `hq_latitude`/`hq_longitude`/`hq_google_place_id` for every
 * organization's `settings` row that has a real `home_address` but no resolved
 * coordinates yet — mirrors `./backfill-booking-coordinates.ts` exactly (same script,
 * same reasoning, different table). Read that file's own comment first; only what
 * differs is called out below.
 *
 * Root cause this closes: `POST /auth/signup` (`../../artifacts/api-server/src/routes/
 * auth.ts`) took a free-typed `businessAddress` and, until the same commit that adds
 * this script, wrote it straight into `settings.home_address` with NO geocoding step —
 * `hq_latitude`/`hq_longitude`/`hq_google_place_id` stayed `null` for every organization
 * unless its owner separately visited Settings and re-entered their address through the
 * `AddressAutocomplete` field there (`artifacts/detail-hub/src/pages/settings.tsx`).
 * Both `PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md`'s HQ-anchored Fuel Gauge scoring and
 * `PRD_Mobull_Weather_Coverage.md`'s calendar/booking weather icons correctly (and
 * silently) no-op on a null HQ — so in practice, every organization that never happened
 * to redo that Settings step got both features invisibly non-functional by default.
 * `POST /auth/signup` now geocodes at signup time (fixes every *future* organization);
 * this script is the one-time catch-up for every organization that signed up before
 * that fix existed.
 *
 * Differences from `./backfill-booking-coordinates.ts`:
 *   - Targets `settings` (one row per organization), not `bookings` (many rows per
 *     organization) — `WHERE home_address <> '' AND (hq_google_place_id IS NULL OR
 *     hq_latitude IS NULL OR hq_longitude IS NULL)`, same "any of the three missing"
 *     guard, same reasoning.
 *   - No `formatted_address` column on `settings` to update — `home_address` itself
 *     stays exactly as the owner typed/selected it; only the three coordinate columns
 *     are written. (Unlike `bookings`, which does have a separate `formatted_address`
 *     column alongside the free-typed `address`.)
 *   - Expected to touch far fewer rows (one per organization vs. every historical
 *     booking), so the same `BATCH_SIZE`/`BATCH_DELAY_MS` pacing is generous here, not
 *     tuned differently.
 */
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../../.env") });

if (!process.env.MIGRATION_DATABASE_URL) {
  throw new Error("MIGRATION_DATABASE_URL must be set. Did you forget to provision a database?");
}

// Dynamic import, after `config(...)` — see `./backfill-booking-coordinates.ts`'s own
// comment for exactly why a static import here would break.
const { geocodeAddress, GoogleMapsConfigError, GoogleMapsUpstreamError } = await import(
  "../../../artifacts/api-server/src/integrations/google-maps"
);

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;

type SettingsRow = { id: number; organization_id: string; home_address: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });

  let processed = 0;
  let succeeded = 0;
  let skipped = 0;
  const skippedDetails: Array<{ id: number; organizationId: string; homeAddress: string; reason: string }> = [];

  try {
    const { rows } = await pool.query<SettingsRow>(
      `select id, organization_id, home_address
       from settings
       where home_address <> ''
         and (hq_google_place_id is null or hq_latitude is null or hq_longitude is null)
       order by id`,
    );

    console.log(`[backfill-settings-hq-coordinates] ${rows.length} organization settings row(s) need HQ coordinates.`);

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (row) => {
          processed++;
          try {
            const result = await geocodeAddress(row.home_address);
            if (!result) {
              skipped++;
              skippedDetails.push({ id: row.id, organizationId: row.organization_id, homeAddress: row.home_address, reason: "no_match" });
              console.log(`[backfill-settings-hq-coordinates] settings #${row.id} (org ${row.organization_id}): no match for "${row.home_address}", skipping.`);
              return;
            }

            // No `updated_at` column on `settings` (unlike `bookings`) — nothing to
            // touch besides the three coordinate columns themselves.
            await pool.query(
              `update settings
               set hq_google_place_id = $1, hq_latitude = $2, hq_longitude = $3
               where id = $4`,
              [result.placeId, result.latitude, result.longitude, row.id],
            );
            succeeded++;
            console.log(`[backfill-settings-hq-coordinates] settings #${row.id} (org ${row.organization_id}): resolved -> "${result.formattedAddress}".`);
          } catch (err) {
            skipped++;
            const reason =
              err instanceof GoogleMapsConfigError
                ? "google_maps_not_configured"
                : err instanceof GoogleMapsUpstreamError
                  ? `google_upstream_error: ${err.message}`
                  : `unexpected_error: ${err instanceof Error ? err.message : String(err)}`;
            skippedDetails.push({ id: row.id, organizationId: row.organization_id, homeAddress: row.home_address, reason });
            console.log(`[backfill-settings-hq-coordinates] settings #${row.id} (org ${row.organization_id}): failed (${reason}), skipping.`);
          }
        }),
      );

      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
      console.log(`[backfill-settings-hq-coordinates] batch ${batchNumber}/${totalBatches} done (${processed}/${rows.length} processed so far).`);

      if (i + BATCH_SIZE < rows.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    console.log(
      `[backfill-settings-hq-coordinates] done. processed=${processed} succeeded=${succeeded} skipped=${skipped}`,
    );
    if (skippedDetails.length > 0) {
      console.log("[backfill-settings-hq-coordinates] skipped detail:", JSON.stringify(skippedDetails, null, 2));
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[backfill-settings-hq-coordinates] fatal error:", err);
  process.exitCode = 1;
});
