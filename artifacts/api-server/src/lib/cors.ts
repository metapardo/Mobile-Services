/**
 * Single source of truth for which browser origins this server trusts for
 * cookie-bearing cross-origin requests. Used in exactly two places, and both need to
 * agree or cookie-based auth breaks in a confusing way:
 *
 *   1. `app.ts` — the Express-level `cors()` middleware, which controls whether the
 *      browser is allowed to read the response (`Access-Control-Allow-Origin`) and
 *      whether it's allowed to send/receive cookies (`Access-Control-Allow-Credentials`).
 *   2. `lib/auth.ts` — Better Auth's own `trustedOrigins`, which is a SEPARATE check
 *      Better Auth runs internally (CSRF-style origin validation on top of, not
 *      instead of, CORS — see the comment above `betterAuth({...})` for how this was
 *      confirmed against the installed package). Getting CORS right alone is not
 *      enough: without a matching `trustedOrigins`, Better Auth rejects the request
 *      with `INVALID_ORIGIN` even though the browser's CORS preflight already passed.
 *
 * Configuration:
 *   - `CORS_ALLOWED_ORIGINS`: comma-separated list of allowed origins, e.g.
 *     `https://app.example.com,https://staging.example.com`. Supports `*` as a glob
 *     wildcard within a segment (e.g. `https://*.example.com`), matching Better Auth's
 *     own `trustedOrigins` glob syntax so one list means the same thing in both places.
 *   - If unset AND `NODE_ENV !== "production"`: falls back to `http://localhost:*` and
 *     `http://127.0.0.1:*` — this repo's frontend (`artifacts/detail-hub`) gets its dev
 *     port from a `PORT` env var with no fixed default (see its `vite.config.ts`), so a
 *     single hardcoded dev origin would break as soon as that port changes. Matching
 *     "any localhost port" is the only option that doesn't hardcode a guess.
 *   - If unset AND `NODE_ENV === "production"`: resolves to an empty allowlist (deny
 *     all cross-origin requests) rather than silently falling back to the dev default.
 *     A production deployment with no explicit `CORS_ALLOWED_ORIGINS` should fail
 *     loudly (every cross-origin request rejected, logged) rather than accidentally
 *     trusting `localhost`. `app.ts` logs a warning at startup when this happens.
 *
 * FLAGGED FOR FOLLOW-UP: nobody has told this agent what the real deployed frontend
 * origin will be yet. Whoever deploys this server needs to set `CORS_ALLOWED_ORIGINS`
 * to that real origin (e.g. the detail-hub Vercel URL) — until then, production
 * cross-origin requests will be rejected by design (see above), not silently broken.
 */
export function getAllowedOriginPatterns(): string[] {
  const raw = process.env["CORS_ALLOWED_ORIGINS"];
  if (raw && raw.trim() !== "") {
    return raw
      .split(",")
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }

  if (process.env["NODE_ENV"] === "production") {
    return [];
  }

  return ["http://localhost:*", "http://127.0.0.1:*"];
}

/**
 * Converts one glob-style origin pattern (`*` = any run of non-`/` characters, matching
 * Better Auth's own `trustedOrigins` wildcard semantics) into a `RegExp` that matches a
 * full origin string exactly.
 */
function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, (char) => (char === "*" ? "[^/]*" : `\\${char}`));
  return new RegExp(`^${escaped}$`);
}

/**
 * Checks whether `origin` (the browser's `Origin` header value) matches any pattern in
 * `patterns`. Needed because the `cors` npm package's `origin` option only does exact
 * string matches when given an array — it has no glob/wildcard support of its own, so
 * dev-mode's `http://localhost:*` pattern requires this to actually work.
 */
export function matchesAllowedOrigin(origin: string, patterns: string[]): boolean {
  return patterns.some((pattern) => patternToRegExp(pattern).test(origin));
}
