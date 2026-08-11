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
 * Forwards every `Set-Cookie` header from a Better Auth direct-call response (obtained
 * via `returnHeaders: true`, e.g. `auth.api.signInEmail({ ..., returnHeaders: true })`)
 * onto the real Express response. This is the step that actually gets the session
 * cookie into the browser — without it, Better Auth still creates a valid session
 * server-side, but the client never receives the cookie that would let it use it.
 */
export function forwardSetCookies(res: ExpressResponse, headers: Headers | undefined): void {
  if (!headers) return;
  for (const cookie of headers.getSetCookie()) {
    res.append("Set-Cookie", cookie);
  }
}
