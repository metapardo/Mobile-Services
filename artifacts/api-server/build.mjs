import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm } from "node:fs/promises";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  // Two entry points, two different consumers:
  //   - src/index.ts -> dist/index.mjs: the executable (calls .listen()), used by the
  //     local/Replit deployment target (see .replit-artifact/artifact.toml).
  //   - src/app.ts -> dist/app.mjs: the Express app alone (default export, no .listen()),
  //     consumed via this package's `exports` field by
  //     artifacts/detail-hub/api/[...path].ts as a Vercel Serverless Function entry
  //     point. This is NOT optional — `exports` previously pointed straight at the raw
  //     `src/app.ts` TypeScript source, which works for local tooling that understands
  //     .ts directly (Vite, tsc) but fails at actual Vercel runtime: Node.js cannot
  //     execute a raw .ts file, and Vercel's function builder does not bundle/inline
  //     cross-package TypeScript source reached via a node_modules-style import — it
  //     only compiles the entry file itself, leaving deeper imports to be resolved by
  //     the Node.js runtime as-is. Confirmed via a real deployment: the build succeeded
  //     but the deployed function crashed with `ERR_MODULE_NOT_FOUND` trying to import
  //     the .ts file directly at request time. Pointing `exports` at this real, fully
  //     bundled .mjs output instead fixes that — it's plain JavaScript, no runtime
  //     TypeScript support required.
  for (const entry of ["src/index.ts", "src/app.ts"]) {
    await esbuild({
      entryPoints: [path.resolve(artifactDir, entry)],
      platform: "node",
      bundle: true,
      format: "esm",
      // Plain `outdir`, no `entryNames` override needed — the two entry files are
      // already named `index.ts`/`app.ts`, so esbuild's default per-input-basename
      // naming already produces `dist/index.mjs`/`dist/app.mjs` correctly on its own.
      outdir: distDir,
      outExtension: { ".js": ".mjs" },
      logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      // NOT externalized (unlike most of this list): `@sentry/node` (added for backend
      // error reporting — see `src/lib/sentry.ts`) has a real, load-bearing runtime
      // dependency on `@opentelemetry/api` (its event-capture/flush path imports it
      // even with tracing disabled). Externalizing it, as this list did until this
      // package accounted for its own package.json dependencies for esbuild to bundle
      // it: it also isn't resolvable from `dist/`'s location under pnpm's isolated
      // node_modules layout (it's nested inside `@sentry/node`'s own node_modules, not
      // hoisted to this package's top-level node_modules), producing a real runtime
      // `ERR_MODULE_NOT_FOUND: @opentelemetry/api` crash — confirmed by actually
      // running the built `dist/index.mjs` locally. It's pure JS with no native
      // bindings, so bundling it (esbuild did so with no warnings) is safe, unlike the
      // genuinely-native packages this list exists to protect.
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
      },
    });
  }
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
