import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { getAllowedOriginPatterns, matchesAllowedOrigin } from "./lib/cors";

/** Thrown by the `cors()` origin callback below when an origin isn't allowed — a
 * distinct class so the error handler at the bottom of this file can recognize it and
 * respond with a clean 403 JSON body instead of falling through to Express's default
 * error handler, which renders a stack-trace-carrying HTML page (confirmed by testing
 * a rejected cross-origin request against this server — see the live test transcript
 * in the task write-up). The browser would refuse to expose that body to the
 * rejecting page regardless (no `Access-Control-Allow-Origin` means no cross-origin JS
 * can read the response), so this isn't a security fix, just not leaking internals to
 * whatever's on the other end of the connection (or to server logs/terminals during
 * manual testing). */
class CorsRejectedError extends Error {}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// `credentials: true` + an explicit (never wildcard) origin allowlist — required for
// Better Auth's session cookie to be sent/received cross-origin at all. A bare `cors()`
// (the previous config) sends `Access-Control-Allow-Origin: *`, which browsers refuse to
// pair with credentialed requests, so cookie-based sign-in would silently never work
// cross-origin. See `./lib/cors.ts` for where the allowlist comes from and why — the
// same list also has to be passed to Better Auth's own `trustedOrigins` in `lib/auth.ts`,
// which is a separate check Better Auth runs internally, not satisfied by fixing CORS.
const allowedOriginPatterns = getAllowedOriginPatterns();
if (allowedOriginPatterns.length === 0) {
  logger.warn(
    "CORS_ALLOWED_ORIGINS is not set and NODE_ENV=production — every cross-origin request will be rejected until it's configured.",
  );
}
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      // No `Origin` header at all (same-origin requests, curl/server-to-server, etc.)
      // — nothing for CORS to gate, let it through.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (matchesAllowedOrigin(origin, allowedOriginPatterns)) {
        callback(null, true);
        return;
      }
      callback(new CorsRejectedError(`Origin "${origin}" is not allowed by this server's CORS policy.`));
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Final error handler — without this, an error thrown synchronously by a middleware
// (e.g. the `cors()` origin callback above) falls through to Express's built-in
// handler, which renders an HTML page containing the error's stack trace. Must be
// declared with all 4 params (`err, req, res, next`) — Express only registers a
// handler as error-handling middleware when it has exactly that arity.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof CorsRejectedError) {
    res.status(403).json({ error: "origin_not_allowed", message: err.message });
    return;
  }
  logger.error({ err }, "unhandled error");
  res.status(500).json({ error: "internal_error" });
};
app.use(errorHandler);

export default app;
