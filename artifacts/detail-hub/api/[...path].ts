// Deliberate, narrow exception — see `.claude/agents/frontend-engineer.md` for the
// full explanation. This is the ONLY file in `detail-hub` allowed to import
// `@workspace/api-server` directly.
//
// `api-server`'s Express app (`artifacts/api-server/src/app.ts`) is deployed as a
// Vercel Serverless Function under this SAME Vercel project (Root Directory is
// `artifacts/detail-hub`), so `detail-hub` and `api-server` end up same-origin in
// production — that's what lets Better Auth's session cookie survive without needing
// a `SameSite=None; Secure` cookie-attribute workaround.
//
// Vercel's filesystem routing turns any file under `<Root Directory>/api/*` into a
// serverless function. A bracketed segment with a name and a `...` prefix (e.g.
// `[...path]`) is Vercel's catch-all convention — it matches every request path under
// `/api/` (e.g. `/api/bookings/123`) and hands the function a `path` query param
// containing the matched segments. An empty-name catch-all (`[...].ts`, with nothing
// between the brackets) is not valid — Vercel requires an identifier there, the same
// way Next.js does — so this file is named `[...path].ts`, not `[...].ts`.
//
// Express itself does the actual routing once a request reaches it (it reads
// `req.url`, not this file's `path` param), so the catch-all's parameter name has no
// runtime significance beyond satisfying Vercel's naming rule.
export { default } from "@workspace/api-server";
