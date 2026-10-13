// Checks a deployed variant and, optionally, compares it with a second
// deployment of the same variant (for example one made by a different tool).
//
//   node scripts/check.mjs <variant> <base-url> [<compare-base-url>]
//
// <variant> is main, functions, worker-file or worker-dir.
//
// --local checks `wrangler pages dev`, which serves files from disk (no upload
// ignore rules) and reads the top-level config (no preview/production env).
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const local = args.includes("--local");
const [variant, baseUrl, compareUrl] = args.filter((arg) => arg !== "--local");
const VARIANTS = ["main", "functions", "worker-file", "worker-dir"];
if (!VARIANTS.includes(variant) || !baseUrl) {
  console.error(`usage: node scripts/check.mjs [--local] <${VARIANTS.join("|")}> <base-url> [<compare-base-url>]`);
  process.exit(2);
}

const isFunctions = variant === "main" || variant === "functions";
const greeting = local ? "top-level" : variant === "main" ? "production" : "preview";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const text = (r) => new TextDecoder().decode(r.body);
const json = (r) => JSON.parse(text(r));

// Each check is one request plus an assertion. `undefined` assert means the
// response is only reported (and compared), because the expected status is a
// platform detail rather than something the deploy tool decides.
const checks = [
  { path: "/", assert: (r) => r.status === 200 && text(r).includes("static-index") },
  { path: "/", name: "_headers applied", assert: (r) => r.headers["x-demo-headers"] === "from-headers-file" },
  { path: "/about.html", assert: (r) => r.status === 200 && text(r).includes("static-about") },
  {
    path: "/old-about",
    name: "_redirects applied",
    redirect: "manual",
    assert: (r) => r.status === 301 && r.headers.location?.endsWith("/about.html"),
  },
  { path: "/large/25mib.bin", name: "25 MiB file intact", large: true },
];

if (!local) {
  checks.push(
    { path: "/.wrangler/ignored.txt", name: "top-level .wrangler ignored", assert: (r) => !text(r).includes("is ignored") },
    { path: "/nested/node_modules/ignored.txt", name: "nested node_modules ignored", assert: (r) => !text(r).includes("is ignored") },
    { path: "/nested/.wrangler/kept.txt", name: "nested .wrangler uploaded (report only)" },
  );
}

if (isFunctions) {
  checks.push(
    { path: "/", name: "root middleware ran", assert: (r) => r.headers["x-demo-middleware"] === "root" },
    { path: "/api", assert: (r) => json(r).route === "api-index" },
    { path: "/api/hello", assert: (r) => json(r).greeting === `hello from ${greeting}` },
    { path: "/api/hello", method: "POST", body: "ping", assert: (r) => json(r).body === "ping" },
    { path: "/api/users/42", assert: (r) => json(r).id === "42" },
    { path: "/api/files/a/b/c", assert: (r) => JSON.stringify(json(r).path) === '["a","b","c"]' },
    { path: "/api/banner", assert: (r) => text(r).trim() === "text-module-banner" },
    { path: "/plugin-assets/hello.txt", name: "assets: plugin route", assert: (r) => text(r).trim() === "plugin-asset-hello" },
  );
} else {
  const notFunctions = (r) => !text(r).includes('"route"');
  checks.push(
    { path: "/", name: "functions middleware did not run", assert: (r) => r.headers["x-demo-middleware"] === undefined },
    { path: "/api/hello", name: "functions not deployed", assert: notFunctions },
    { path: "/plugin-assets/hello.txt", name: "functions plugin not deployed", assert: (r) => !text(r).includes("plugin-asset-hello") },
  );
}

if (variant === "worker-file") {
  checks.push({
    path: "/worker",
    assert: (r) => json(r).variant === "worker-file" && json(r).greeting === greeting,
  });
}

if (variant === "worker-dir") {
  checks.push(
    { path: "/worker", assert: (r) => json(r).variant === "worker-dir" && json(r).chunk === "worker-dir-chunk" },
    { path: "/worker/nested", assert: (r) => json(r).path === "/worker/nested" },
  );
}

async function request(base, check) {
  const res = await fetch(new URL(check.path, base), {
    method: check.method ?? "GET",
    body: check.body,
    redirect: check.redirect ?? "follow",
    signal: AbortSignal.timeout(60_000),
  });
  const body = new Uint8Array(await res.arrayBuffer());
  const headers = {};
  for (const name of ["content-type", "location", "x-demo-headers", "x-demo-middleware"]) {
    const value = res.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  return { status: res.status, path: new URL(res.url || check.path, base).pathname, headers, body };
}

async function largeOk(base, response) {
  const expected = (await (await fetch(new URL("/large/25mib.bin.sha256", base))).text()).trim();
  return response.status === 200 && response.body.byteLength === 25 * 1024 * 1024 && sha256(response.body) === expected;
}

function summary(r) {
  return { status: r.status, path: r.path, headers: r.headers, bytes: r.body.byteLength, sha256: sha256(r.body) };
}

let failures = 0;
for (const check of checks) {
  const label = `${check.method ?? "GET"} ${check.path}${check.name ? ` (${check.name})` : ""}`;
  try {
    const a = await request(baseUrl, check);
    let ok = true;
    if (check.large) ok = await largeOk(baseUrl, a);
    else if (check.assert) ok = Boolean(check.assert(a));

    let note = "";
    if (compareUrl) {
      const b = await request(compareUrl, check);
      const sa = JSON.stringify(summary(a));
      const sb = JSON.stringify(summary(b));
      if (sa !== sb) {
        ok = false;
        note = `\n    differs:\n      ${baseUrl}: ${sa}\n      ${compareUrl}: ${sb}`;
      }
    }

    const reportOnly = !check.assert && !check.large;
    const status = reportOnly && ok ? "info" : ok ? "ok  " : "FAIL";
    if (status === "FAIL") failures++;
    console.log(`${status} ${label} -> ${a.status}${note}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${label} -> ${error.message}`);
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
