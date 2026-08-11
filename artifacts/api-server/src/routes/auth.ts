import { Router, type IRouter } from "express";
import { APIError } from "better-auth";
import {
  db,
  accountTable,
  userTable,
  memberTable,
  sessionTable,
  claimPlatformInviteToken,
  releasePlatformInviteToken,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  SignupBody,
  SignupResponse,
  LoginBody,
  LoginResponse,
  GetAuthSessionResponse,
} from "@workspace/api-zod";
import { auth } from "../lib/auth";
import { logger } from "../lib/logger";
import { toFetchHeaders, forwardSetCookies } from "../lib/http-bridge";

const router: IRouter = Router();

/**
 * POST /auth/signup — the platform-level, invite-gated admin/owner signup endpoint.
 *
 * DESIGN NOTE — why this is NOT a single real DB transaction, and what stands in for
 * one instead:
 *
 * The obvious shape for "create a user, create an org, mark a token used" is one DB
 * transaction: if any step fails, nothing sticks. That's not achievable here through
 * Better Auth's public API, and this was verified against the installed
 * `better-auth@1.6.26` / `@better-auth/core@1.6.26` packages rather than assumed:
 *
 *   - `auth.api.signUpEmail` (dist/api/routes/sign-up.mjs) wraps its own body in
 *     `runWithTransaction(ctx.context.adapter, ...)`, which calls `adapter.transaction(cb)`
 *     (see `@better-auth/core/dist/context/transaction.mjs`).
 *   - But the Drizzle adapter this app uses (`better-auth/dist/adapters/drizzle-adapter`)
 *     does not implement a `.transaction()` method of its own. `getBaseAdapter`
 *     (`better-auth/dist/db/adapter-base.mjs`) detects that and silently patches one in:
 *     `adapter.transaction = async (cb) => cb(adapter)` — i.e. for this specific stack,
 *     Better Auth's own internal "transaction" is a no-op passthrough, not a real
 *     Postgres transaction. So even `signUpEmail` alone isn't atomic against a partial
 *     failure between creating `user` and linking the `account` credential row.
 *   - `auth.api.createOrganization` (`plugins/organization/routes/crud-org.mjs`) doesn't
 *     attempt to wrap itself in a transaction at all — it does sequential adapter calls
 *     (`createOrganization`, then `createMember`).
 *
 * So real cross-call atomicity isn't available through Better Auth's public API on this
 * adapter, regardless of whether this route tries to wrap the calls in its own
 * `db.transaction(...)` — Better Auth manages its own connection/adapter internally and
 * doesn't accept an externally-supplied transaction handle to participate in.
 *
 * Given that, this route uses Better Auth's own APIs sequentially and layers
 * eventual-consistency-with-compensation on top:
 *   1. Atomically claim the invite token first (see `claimPlatformInviteToken` in
 *      `@workspace/db` for why that single conditional UPDATE is race-safe on its own).
 *      If claiming fails, nothing else happens — no user, no org.
 *   2. Create the user + credential account via `auth.api.signUpEmail`.
 *   3. Create the organization (+ owner membership) via `auth.api.createOrganization`,
 *      passing `userId` explicitly with no session/headers so Better Auth treats this as
 *      a trusted server-side ("system") action, per `crud-org.mjs`'s own
 *      `isSystemAction` check.
 *   4. If step 3 fails after step 2 succeeded, compensate: delete the orphaned user (and
 *      its `account` row) directly via our own `db`/Drizzle, and release the invite token
 *      back to unused so it isn't wasted on a failed attempt. Both are best-effort — this
 *      is intentionally NOT re-wrapped in more Better Auth calls, since the whole point
 *      is to clean up state Better Auth's own API already committed.
 *
 * This leaves one honest gap, called out rather than hidden: between step 2 succeeding
 * and step 3 failing, there is a brief window where a `user`/`account` row exists with
 * no organization. The compensation above closes that window quickly (same request, no
 * user-visible intermediate state — the caller never receives success until step 3
 * succeeds), but it is not instantaneous/atomic the way a single transaction would be.
 * If the compensating cleanup itself fails (e.g. DB connection drops mid-request), an
 * orphaned user with a burned invite token could persist — logged loudly so it's
 * operationally visible, not silently swallowed.
 */
router.post("/auth/signup", async (req, res) => {
  const parsed = SignupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }
  const { inviteToken, name, email, password, organizationName, organizationSlug } = parsed.data;

  const claimedToken = await claimPlatformInviteToken(inviteToken, email);
  if (!claimedToken) {
    res.status(400).json({
      error: "invalid_invite_token",
      message: "This invite token is invalid, expired, or has already been used.",
    });
    return;
  }

  let createdUserId: string | undefined;
  try {
    const signUpResult = await auth.api.signUpEmail({
      body: { name, email, password },
    });
    createdUserId = signUpResult.user.id;

    const organization = await auth.api.createOrganization({
      body: {
        name: organizationName,
        slug: organizationSlug,
        userId: signUpResult.user.id,
      },
    });
    if (!organization) {
      throw new Error("createOrganization returned no result");
    }

    const data = SignupResponse.parse({
      user: {
        id: signUpResult.user.id,
        name: signUpResult.user.name,
        email: signUpResult.user.email,
        emailVerified: signUpResult.user.emailVerified,
        createdAt: signUpResult.user.createdAt,
      },
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: organization.createdAt,
      },
    });
    res.status(201).json(data);
    return;
  } catch (err) {
    // Compensating cleanup — see the design note above for why this exists instead of
    // a real transaction. Both actions are best-effort; failures here are logged loudly
    // rather than silently swallowed, since they mean leftover state.
    if (createdUserId) {
      try {
        await db.transaction(async (tx) => {
          await tx.delete(accountTable).where(eq(accountTable.userId, createdUserId as string));
          await tx.delete(userTable).where(eq(userTable.id, createdUserId as string));
        });
      } catch (cleanupErr) {
        logger.error(
          { err: cleanupErr, userId: createdUserId },
          "signup: failed to clean up orphaned user after organization creation failure — manual intervention required",
        );
      }
    }
    try {
      await releasePlatformInviteToken(claimedToken.id);
    } catch (releaseErr) {
      logger.error(
        { err: releaseErr, tokenId: claimedToken.id },
        "signup: failed to release claimed invite token after failure — token is now burned without a successful signup",
      );
    }

    if (err instanceof APIError) {
      // Trust Better Auth's own computed HTTP status (`statusCode`, numeric — see
      // `better-call/dist/error.mjs`) rather than re-deriving one: e.g. it already
      // resolves duplicate-slug/duplicate-org to 400 and duplicate-email to 422. `code`
      // is the machine-readable discriminator (e.g. `ORGANIZATION_SLUG_ALREADY_TAKEN`,
      // `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`) for callers that need to distinguish cases.
      logger.warn({ err }, "signup: Better Auth rejected the request");
      res.status(typeof err.statusCode === "number" ? err.statusCode : 422).json({
        error: err.body?.code ?? "signup_failed",
        message: err.body?.message ?? "Signup failed.",
      });
      return;
    }

    logger.error({ err }, "signup: unexpected failure");
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /auth/login — admin/owner sign-in.
 *
 * Two things this route does that a naive `auth.api.signInEmail(...)` call wouldn't:
 *
 * 1. Forwards the session cookie. `auth.api.signInEmail` is called directly (not
 *    through a mounted `auth.handler`, same reasoning as `POST /auth/signup` above —
 *    no generic Better Auth HTTP surface is exposed here), but unlike signup's
 *    server-side call, this one has a real browser on the other end that needs the
 *    `Set-Cookie` Better Auth produces. Passing `returnHeaders: true` (rather than the
 *    default, which returns just the body) surfaces those response headers so
 *    `forwardSetCookies` (`../lib/http-bridge.ts`) can copy them onto the real Express
 *    response — verified against the installed `better-auth@1.6.26`/`better-call@1.3.7`
 *    packages that this is exactly what `returnHeaders: true` is for (see
 *    `better-call`'s `StrictEndpoint` overloads and `dispatch.mjs`'s
 *    `mergeResponseHeaders`), not inferred from documentation alone.
 *
 * 2. Auto-activates the user's organization on the new session, if unambiguous. v1
 *    scope is one admin/owner user per organization with no multi-org membership yet
 *    (see `lib/auth.ts`'s header comment and every current PRD). Despite that, nothing
 *    in Better Auth sets `session.activeOrganizationId` automatically:
 *      - `auth.api.createOrganization` (called during signup) only calls
 *        `adapter.setActiveOrganization` when `ctx.context.session` is truthy
 *        (`plugins/organization/routes/crud-org.mjs`) — but signup's call is a
 *        headless "system action" with no session at all (see the signup handler
 *        above), so that branch never runs.
 *      - `auth.api.signInEmail` (this route) creates a brand-new session with
 *        `activeOrganizationId` left unset — it's a plugin-added, optional session
 *        field (`organization.mjs`: `activeOrganizationId: { required: false }`), and
 *        nothing in the base sign-in flow touches it.
 *    Without this, EVERY login would land on a session with no active organization,
 *    making "authenticated but no active org" the common case instead of the rare one
 *    — exactly backwards from what `GET /auth/session`'s response shape assumes. So:
 *    look up this user's `member` rows directly (no Better Auth API call for this —
 *    `auth.api.listOrganizations` requires re-deriving a session context; a direct
 *    Drizzle query against `memberTable`, an auth table with no RLS, is simpler and
 *    established precedent, see the signup handler's own direct `db` use above). If
 *    there's exactly one, set it as this session's `activeOrganizationId` directly
 *    (also a direct Drizzle `UPDATE` on `sessionTable`, keyed by the session `token`
 *    `signInEmail` just returned — cheaper and no less correct than calling
 *    `auth.api.setActiveOrganization`, which would need its own session/header
 *    round-trip to re-authenticate as the user that was *just* authenticated).
 *    Zero or multiple organizations are left unset on purpose rather than guessed —
 *    zero implies an orphaned user (e.g. a signup that failed after user creation but
 *    before the compensating cleanup in the signup handler above ran), multiple is a
 *    v2 scenario this app doesn't support yet. Both are logged as warnings so they're
 *    operationally visible instead of silently swallowed.
 */
router.post("/auth/login", async (req, res) => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  try {
    const { headers, response } = await auth.api.signInEmail({
      body: { email, password },
      headers: toFetchHeaders(req.headers),
      returnHeaders: true,
    });

    forwardSetCookies(res, headers);

    let organizationId: string | null = null;
    const memberships = await db
      .select({ organizationId: memberTable.organizationId })
      .from(memberTable)
      .where(eq(memberTable.userId, response.user.id));

    if (memberships.length === 1) {
      organizationId = memberships[0]!.organizationId;
      await db
        .update(sessionTable)
        .set({ activeOrganizationId: organizationId })
        .where(eq(sessionTable.token, response.token));
    } else if (memberships.length > 1) {
      logger.warn(
        { userId: response.user.id, organizationCount: memberships.length },
        "login: user belongs to more than one organization — v1 doesn't support this yet, no active organization was set",
      );
    } else {
      logger.warn(
        { userId: response.user.id },
        "login: user belongs to no organization — likely an orphaned account from a failed signup",
      );
    }

    const data = LoginResponse.parse({
      user: {
        id: response.user.id,
        name: response.user.name,
        email: response.user.email,
        emailVerified: response.user.emailVerified,
        createdAt: response.user.createdAt,
      },
      token: response.token,
      organizationId,
    });
    res.status(200).json(data);
    return;
  } catch (err) {
    if (err instanceof APIError) {
      // Same convention as signup above: trust Better Auth's own computed status
      // (401 for `INVALID_EMAIL_OR_PASSWORD`, the expected case here) rather than
      // re-deriving one, and fall back to 401 — not signup's 422 — since this route's
      // failure mode is "not authenticated", not "couldn't create a resource".
      logger.warn({ err }, "login: Better Auth rejected the request");
      res.status(typeof err.statusCode === "number" ? err.statusCode : 401).json({
        error: err.body?.code ?? "login_failed",
        message: err.body?.message ?? "Login failed.",
      });
      return;
    }
    logger.error({ err }, "login: unexpected failure");
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * GET /auth/session — reports whether the request carries a valid session and, if so,
 * whether it has an active organization. See `openapi.yaml`'s `/auth/session`
 * description for the three response shapes this distinguishes and why.
 *
 * Always responds 200 (including "not signed in") — this endpoint's entire purpose is
 * to answer "what's the session state", and "no session" is a normal answer to that
 * question, not a failure. Uses `returnHeaders: true` for the same reason as login
 * above: Better Auth's `getSession` can silently refresh the session cookie (sliding
 * expiration, see `api/routes/session.mjs`) as a side effect of a successful check, and
 * that refreshed cookie needs to actually reach the browser or the client-side cookie's
 * expiry never gets extended even though the server-side session's did.
 */
router.get("/auth/session", async (req, res) => {
  try {
    const { headers, response } = await auth.api.getSession({
      headers: toFetchHeaders(req.headers),
      returnHeaders: true,
    });

    forwardSetCookies(res, headers);

    if (!response) {
      const data = GetAuthSessionResponse.parse({ authenticated: false });
      res.status(200).json(data);
      return;
    }

    const data = GetAuthSessionResponse.parse({
      authenticated: true,
      user: {
        id: response.user.id,
        name: response.user.name,
        email: response.user.email,
        emailVerified: response.user.emailVerified,
        createdAt: response.user.createdAt,
      },
      organizationId: response.session.activeOrganizationId ?? null,
    });
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof APIError) {
      logger.warn({ err }, "session: Better Auth rejected the request");
      res.status(typeof err.statusCode === "number" ? err.statusCode : 401).json({
        error: err.body?.code ?? "session_check_failed",
        message: err.body?.message ?? "Could not check session.",
      });
      return;
    }
    logger.error({ err }, "session: unexpected failure");
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
