import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
  db,
  userTable,
  sessionTable,
  accountTable,
  verificationTable,
  organizationTable,
  memberTable,
  invitationTable,
} from "@workspace/db";
import { getAllowedOriginPatterns } from "./cors";

/**
 * Admin/owner login only for v1 — no client-facing or employee accounts. This matches
 * every current PRD: clients and employees are notification recipients, not app users.
 *
 * The `organization` plugin is enabled because every business-owned table in
 * `@workspace/db` (employees, clients, bookings, etc.) is scoped by a required
 * `organizationId` FK into `organization.id` for multi-tenancy, enforced at the DB
 * level via Postgres row-level security — see `lib/db/src/schema/rls.ts` and
 * `lib/db/src/tenant.ts`. `session.activeOrganizationId` (added by this plugin) is
 * intended to be the source of the `app.organization_id` value that
 * `withOrganization(...)` sets per-request — that wiring has no call sites yet since
 * no real data routes exist in this server yet.
 *
 * Team support is deliberately NOT enabled (no `teams` option passed to
 * `organization()`) — nothing in scope needs sub-organization teams; adding it later
 * only requires adding the `team`/`teamMember` tables and passing `teams: { enabled:
 * true }` here, it doesn't change anything already built.
 *
 * `database` uses the Drizzle adapter against the same Neon-backed `@workspace/db`
 * instance as the rest of the app (per standing instructions: Neon + Better Auth,
 * Drizzle adapter). The `schema` map below is required because this repo's table
 * variable names (`userTable`, `sessionTable`, ...) don't match Better Auth's default
 * model-name-keyed lookup (`user`, `session`, ...).
 *
 * `emailAndPassword` is now enabled — decided (not left NOT-decided anymore) as part of
 * building `POST /api/auth/signup` (`routes/auth.ts`): email+password is the simplest
 * fit for a single admin/owner account with no social/SSO requirement in any PRD, and
 * it's what `auth.api.signUpEmail`/`auth.api.signInEmail` are built around. `autoSignIn:
 * false` is deliberate: `routes/auth.ts` calls `auth.api.signUpEmail` server-side with
 * no request headers (there's no real HTTP request to attach a session cookie to at that
 * point — the caller isn't authenticated yet, they're mid-signup), so auto-sign-in would
 * still create a `session` row server-side even though its cookie could never reach the
 * client, leaving a dangling, unusable session behind on every signup. Disabling it keeps
 * `signUpEmail` to exactly "create user + credential account", nothing else. Sign-in
 * (`auth.api.signInEmail`, a real session) is a separate, not-yet-built route — this repo
 * has no generic Better Auth HTTP handler (`auth.handler`) mounted anywhere yet, and
 * `routes/auth.ts` deliberately doesn't add one: mounting Better Auth's own catch-all
 * would also expose its ungated `/sign-up/email` endpoint directly, bypassing the
 * platform-invite-token gate entirely. `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are
 * also required in the environment before this can serve real traffic; Better Auth
 * resolves those from `process.env` itself (not read explicitly here), same as every
 * other Better Auth deployment.
 *
 * `trustedOrigins` — added alongside `POST /auth/login` and `GET /auth/session`, the
 * first two routes that need a real cross-origin browser session (signup's server-side
 * `signUpEmail` call has no request/headers to attach a session cookie to, so this
 * never mattered before now). This was verified against the installed
 * `better-auth@1.6.26` package rather than assumed: `trustedOrigins` is NOT the same
 * check as Express-level CORS — it's Better Auth's own CSRF-style origin validation
 * (`api/middlewares/origin-check.mjs`'s `validateOrigin`/`validateFormCsrf`), which runs
 * on every non-GET auth request that carries a `Cookie` or `Origin`/`Referer` header,
 * regardless of whether the Express `cors()` middleware already approved the request.
 * Left unset, it defaults to trusting only this server's own `baseURL`
 * (`context/helpers.mjs`'s `getTrustedOrigins`), so a correctly-CORS-configured
 * cross-origin sign-in would still be rejected with `INVALID_ORIGIN` by Better Auth
 * itself. Sourced from the same `getAllowedOriginPatterns()` as `app.ts`'s CORS
 * allowlist (see `./cors.ts`) — the two lists must agree, or CORS lets a browser talk to
 * this server while Better Auth then rejects it (or vice versa isn't possible, but a
 * drifting pair of allowlists is exactly the kind of bug that's easy to introduce by
 * hand-maintaining two separate lists, hence the shared helper).
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: userTable,
      session: sessionTable,
      account: accountTable,
      verification: verificationTable,
      organization: organizationTable,
      member: memberTable,
      invitation: invitationTable,
    },
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
  },
  trustedOrigins: getAllowedOriginPatterns(),
  plugins: [organization()],
});
