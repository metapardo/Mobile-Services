// One-off/admin helper: issues a new row in `platform_invite_tokens` (see
// `../src/schema/platform-invite-tokens.ts` for the full design rationale) so a
// specific email address can complete the real gated signup flow at
// `/signup?invite=<token>`. There was no existing way to create one of these — this
// repo only had the consumption side (`claimPlatformInviteToken` in
// `../src/platform-invite.ts`) — so this fills that gap as a small reusable script
// rather than a throwaway one-liner.
//
// Usage: node ./scripts/create-invite.mjs <email> [expiresInDays]
//   expiresInDays defaults to 30.
//
// Uses the restricted runtime role (DATABASE_URL / app_runtime2), not
// MIGRATION_DATABASE_URL — this is a plain data insert into a table with no RLS
// policy (platform_invite_tokens has no organizationId/tenant scoping by design, see
// the schema file), so the owner connection is not needed here.
import pg from "pg";
import { config } from "dotenv";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

const [, , email, expiresInDaysArg] = process.argv;
if (!email || !email.includes("@")) {
  console.error("Usage: node ./scripts/create-invite.mjs <email> [expiresInDays]");
  process.exit(1);
}
const expiresInDays = expiresInDaysArg ? Number(expiresInDaysArg) : 30;
if (!Number.isFinite(expiresInDays) || expiresInDays <= 0) {
  console.error("expiresInDays must be a positive number");
  process.exit(1);
}

const token = crypto.randomBytes(24).toString("base64url");
const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const result = await pool.query(
    `INSERT INTO platform_invite_tokens (token, email, expires_at) VALUES ($1, $2, $3) RETURNING id, token, email, expires_at`,
    [token, email.toLowerCase(), expiresAt],
  );
  const row = result.rows[0];
  console.log(`Invite created for ${row.email} (id ${row.id}), expires ${row.expires_at.toISOString()}`);
  console.log(`Token: ${row.token}`);
} finally {
  await pool.end();
}
