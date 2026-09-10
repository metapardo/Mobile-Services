/**
 * BUG-6 Blocker 3 (`BUGS_Mobull_2026-09-10_Round2.md`) — one-time backfill of
 * `google_place_id`/`latitude`/`longitude`/`formatted_address` for every booking that
 * predates address autocomplete (shipped Sep 9, 2026). Without this, the Appointment
 * Optimizer's `listAnchorCandidates` (`../src/bookings.ts`) silently can't use those
 * bookings as anchors — they're excluded via `isNotNull(latitude/longitude)`, which is
 * correct behavior for a row that genuinely has no coordinates, but wrong for a row
 * that could resolve one and just never had the chance to.
 *
 * Style/runtime matches `./apply-rls.mjs` (this directory's other one-off ops script):
 * loads `.env` from the repo root, connects via `MIGRATION_DATABASE_URL` (the owner
 * connection — chosen deliberately over `DATABASE_URL`/`app_runtime2` here because this
 * backfill touches every organization's bookings in one pass, which would otherwise mean
 * re-establishing a connection and `SET LOCAL app.organization_id` per org; this is a
 * trusted-operator-run migration-style script, not application request-serving code, so
 * bypassing RLS the same way `apply-rls.mjs` already does for schema/policy management
 * is consistent, not a new precedent). Unlike `apply-rls.mjs`, this one is TypeScript
 * run via `tsx` (see `package.json`'s `backfill-booking-coordinates` script) rather than
 * plain `.mjs` — it needs to import `geocodeAddress` from
 * `artifacts/api-server/src/integrations/google-maps.ts` (the ticket: "Do not call
 * Google directly from this script — reuse the existing server-side proxy"), and that
 * module is TypeScript. This is a direct relative-path import, not a
 * `@workspace/api-server` package dependency — both `lib/db` and `artifacts/api-server`
 * are owned by the same agent/scope in this repo, so there's no cross-team boundary
 * being crossed the way there would be for `artifacts/detail-hub` reaching into
 * `api-server` (see that package's own doc comment on why its "exports" only expose the
 * built Express app, not individual internal functions).
 *
 * Idempotent / safe to re-run: the query below only ever selects rows still missing
 * coordinates, so an already-backfilled row is never re-touched or re-billed to Google.
 *
 * Batched and rate-limited per the ticket ("mind the free-tier caps") — `BATCH_SIZE`
 * addresses geocoded concurrently per batch, `BATCH_DELAY_MS` paced between batches,
 * rather than firing every row's request at once.
 *
 * Un-resolvable addresses are skipped and logged, not treated as a run failure — the
 * ticket: "This script does not need to guarantee 100% resolution; ... Keep the
 * `skippedNoCoordinates` message for anything that still can't resolve" (that frontend
 * message itself belongs to a different, parallel pass — untouched here).
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

// Dynamic `import()`, not a static top-of-file import, and deliberately AFTER the
// `config(...)` call above: `geocodeAddress` transitively imports `@workspace/db`
// (`getCachedRoute`/`setCachedRoute`, `../route-cache.ts`), whose `client.ts` reads
// `DATABASE_URL` at module-evaluation time and throws immediately if it isn't set yet.
// ES module `import` statements are hoisted and evaluated before any other top-level
// code in the importing file runs, so a static import here would try to read
// `DATABASE_URL` before this script's own `config({ path: ... })` call had a chance to
// populate `process.env` from the repo-root `.env` — a dynamic import is what lets
// `config(...)` run first.
const { geocodeAddress, GoogleMapsConfigError, GoogleMapsUpstreamError } = await import(
  "../../../artifacts/api-server/src/integrations/google-maps"
);

// Kept modest — this is a free-tier-caps-conscious batch job, not a latency-sensitive
// request path. Small enough that even a worst-case full Google outage mid-run fails
// fast per batch rather than piling up hundreds of in-flight requests.
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;

type BookingRow = { id: number; organization_id: string; address: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });

  let processed = 0;
  let succeeded = 0;
  let skipped = 0;
  const skippedDetails: Array<{ id: number; address: string; reason: string }> = [];

  try {
    // Same condition BUG-6's directive names: address present, coordinates not yet
    // resolved. `google_place_id IS NULL OR latitude IS NULL OR longitude IS NULL`
    // (not just `google_place_id`) so a row that somehow has one but not the other two
    // (shouldn't happen given how `POST /bookings` writes them, but not assumed) still
    // gets picked up.
    const { rows } = await pool.query<BookingRow>(
      `select id, organization_id, address
       from bookings
       where address <> ''
         and (google_place_id is null or latitude is null or longitude is null)
       order by id`,
    );

    console.log(`[backfill-booking-coordinates] ${rows.length} booking(s) need coordinates.`);

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (row) => {
          processed++;
          try {
            const result = await geocodeAddress(row.address);
            if (!result) {
              skipped++;
              skippedDetails.push({ id: row.id, address: row.address, reason: "no_match" });
              console.log(`[backfill-booking-coordinates] booking #${row.id}: no match for "${row.address}", skipping.`);
              return;
            }

            await pool.query(
              `update bookings
               set google_place_id = $1, latitude = $2, longitude = $3, formatted_address = $4, updated_at = now()
               where id = $5`,
              [result.placeId, result.latitude, result.longitude, result.formattedAddress, row.id],
            );
            succeeded++;
            console.log(`[backfill-booking-coordinates] booking #${row.id}: resolved -> "${result.formattedAddress}".`);
          } catch (err) {
            skipped++;
            const reason =
              err instanceof GoogleMapsConfigError
                ? "google_maps_not_configured"
                : err instanceof GoogleMapsUpstreamError
                  ? `google_upstream_error: ${err.message}`
                  : `unexpected_error: ${err instanceof Error ? err.message : String(err)}`;
            skippedDetails.push({ id: row.id, address: row.address, reason });
            console.log(`[backfill-booking-coordinates] booking #${row.id}: failed (${reason}), skipping.`);
          }
        }),
      );

      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(rows.length / BATCH_SIZE);
      console.log(`[backfill-booking-coordinates] batch ${batchNumber}/${totalBatches} done (${processed}/${rows.length} processed so far).`);

      if (i + BATCH_SIZE < rows.length) {
        await sleep(BATCH_DELAY_MS);
      }
    }

    console.log(
      `[backfill-booking-coordinates] done. processed=${processed} succeeded=${succeeded} skipped=${skipped}`,
    );
    if (skippedDetails.length > 0) {
      console.log("[backfill-booking-coordinates] skipped detail:", JSON.stringify(skippedDetails, null, 2));
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[backfill-booking-coordinates] fatal error:", err);
  process.exitCode = 1;
});
