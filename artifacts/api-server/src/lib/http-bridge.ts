import type { IncomingHttpHeaders } from "node:http";
import type { Response as ExpressResponse } from "express";

/**
 * Converts Express/Node's `IncomingHttpHeaders` (plain object, values are `string |
 * string[] | undefined`) into a standard Fetch `Headers` instance, which is what Better
 * Auth's direct `auth.api.*` calls expect for anything that needs to read the request
 * (session cookie lookup, origin/CSRF checks — see `lib/auth.ts` for why the latter
 * matters). `new Headers(plainObject)` can't be used directly here: it throws on
 * multi-value headers (`string[]`), which Node produces for a small set of headers.
 */
export function toFetchHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) result.append(key, entry);
    } else {
      result.append(key, value);
    }
  }
  return result;
}

/**
 * `Headers.prototype.getSetCookie()` is a real, standard, runtime-present method (Node
 * 18.14+/20+'s native `Headers`, backed by undici) — but its *type* only exists on the
 * global ambient `Headers` interface via `@types/node` re-exporting `undici-types`'
 * declarations, and `undici-types` is a nested-only dependency of `@types/node` (never
 * hoisted to a package any of our code imports directly). Under `@vercel/node`'s
 * `ts.LanguageService` build host — which has no `realpath` and, per this codebase's
 * established pattern, fails to resolve nested-only packages reachable only through a
 * symlink chain it won't dereference — that global augmentation silently collapses
 * (masked by `skipLibCheck`, so it fails quietly as a missing member rather than an
 * unresolved-module error), leaving the ambient `Headers` interface without
 * `getSetCookie` under Vercel specifically, even though local `tsc` resolves it fine.
 * Promoting `undici-types` to a direct `api-server` dependency does NOT fix this
 * (confirmed) — the failing `import * as undici from "undici-types"` lives inside
 * `@types/node`'s own declaration file, not anywhere api-server's own `node_modules`
 * resolution touches. So: sidestep the ambient global type entirely with a local
 * interface + cast, rather than depending on that fragile cross-package global merge.
 */
interface HeadersWithGetSetCookie extends Headers {
  getSetCookie(): string[];
}

/**
 * Forwards every `Set-Cookie` header from a Better Auth direct-call response (obtained
 * via `returnHeaders: true`, e.g. `auth.api.signInEmail({ ..., returnHeaders: true })`)
 * onto the real Express response. This is the step that actually gets the session
 * cookie into the browser — without it, Better Auth still creates a valid session
 * server-side, but the client never receives the cookie that would let it use it.
 */
export function forwardSetCookies(res: ExpressResponse, headers: Headers | undefined): void {
  if (!headers) return;
  for (const cookie of (headers as HeadersWithGetSetCookie).getSetCookie()) {
    res.append("Set-Cookie", cookie);
  }
}
