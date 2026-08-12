import * as Sentry from "@sentry/node";
import { logger } from "./logger";

/**
 * Dev-gating signal, verified rather than assumed (see the task write-up this file was
 * introduced under): `VERCEL` is a Vercel *system* environment variable, "Available at:
 * Both build and runtime" per Vercel's own docs
 * (https://vercel.com/docs/environment-variables/system-environment-variables) — "An
 * indicator to show that system environment variables have been exposed to your
 * project's Deployments", always `"1"`. Confirmed empirically too: pulling this
 * project's real Preview AND Production env vars (`vercel env pull
 * --environment=preview` / `--environment=production`) both produced `VERCEL="1"`
 * (only `VERCEL_ENV` differs between them: `"preview"` vs `"production"`). It is not
 * set at all for a plain local `node`/`pnpm run dev` process (no `vercel dev` in this
 * project's workflow — see package.json's `dev` script), which is exactly the local/
 * deployed split this needs: fire in both Preview and Production, never in local dev
 * (so local testing doesn't burn the free tier's event quota).
 *
 * This is the Node-side analog of `detail-hub/src/main.tsx`'s `import.meta.env.PROD`
 * check — same goal, different signal, because Node has no build-vs-dev-server
 * distinction the way Vite does.
 */
const isVercelDeployment = process.env["VERCEL"] === "1";

const dsn = process.env["SENTRY_DSN"];

export const sentryEnabled = isVercelDeployment && Boolean(dsn);

if (sentryEnabled) {
  Sentry.init({
    dsn,
    // `VERCEL_ENV` is `"production"` or `"preview"` whenever `VERCEL === "1"` (see the
    // comment above) — reuse it directly so Preview/Production events are
    // distinguishable in Sentry's UI without inventing a separate convention.
    environment: process.env["VERCEL_ENV"] ?? "production",
    release: process.env["VERCEL_GIT_COMMIT_SHA"],
    // Error capture only — no performance tracing/profiling (out of scope for this
    // task, see the task write-up). Leaving `tracesSampleRate`/`profilesSampleRate`
    // unset keeps the SDK's tracing integrations inactive; only `captureException`
    // below is actually used.
  });
  logger.info(
    { environment: process.env["VERCEL_ENV"] },
    "Sentry initialized for error reporting",
  );
} else {
  logger.info(
    { isVercelDeployment, hasDsn: Boolean(dsn) },
    "Sentry not initialized (local dev, or SENTRY_DSN unset) — errors will not be reported",
  );
}

/**
 * Reports an unexpected exception to Sentry and waits for delivery before returning.
 *
 * This function exists specifically to close the "serverless flush gotcha": in a
 * Vercel Function, the process can freeze immediately after the HTTP response is sent
 * — potentially before `Sentry.captureException`'s background delivery (a queued HTTP
 * request to Sentry's ingest API) has actually gone out. `Sentry.captureException`
 * alone only enqueues the event; it does not wait for the network call. There is no
 * dedicated Vercel Functions integration/wrapper in `@sentry/node` the way there is
 * for AWS Lambda (`@sentry/aws-serverless`'s `wrapHandler`) or GCP Functions — verified
 * by checking Sentry's own docs site (no "Vercel Functions" guide distinct from
 * `@sentry/node`'s plain Node/Express guide; the Vercel integration docs
 * (https://docs.sentry.io/integrations/deployment/vercel/) cover source maps/release
 * tracking for Next.js, not this). So the safe pattern here — and the one Sentry's own
 * "Draining"/APIs docs point to (`Sentry.flush(timeout): Promise<boolean>`, "Flushes
 * all pending events") — is: capture, then `await Sentry.flush(...)` *before*
 * completing the HTTP response, so the response (and any subsequent function freeze)
 * only happens after delivery was attempted.
 *
 * Callers must `await` this before sending their response — see `app.ts`'s final error
 * handler and `routes/auth.ts`'s generic `catch` fallbacks for the call sites.
 *
 * A no-op (resolves immediately) when Sentry isn't initialized (see `sentryEnabled`
 * above), so call sites don't need their own `if (sentryEnabled)` guards.
 */
export async function captureAndFlush(err: unknown): Promise<void> {
  if (!sentryEnabled) {
    return;
  }
  Sentry.captureException(err);
  // 2s cap: generous enough for a small error event to reach Sentry's ingest API over
  // a normal connection, short enough not to meaningfully delay the error response a
  // real client is waiting on. `flush` resolves as soon as delivery completes (or
  // fails) — it does not always wait the full timeout.
  const delivered = await Sentry.flush(2000);
  if (!delivered) {
    logger.warn("Sentry.flush timed out before confirming delivery of a captured exception");
  }
}

export { Sentry };
