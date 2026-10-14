// Checks a deployed site and, optionally, compares it with a second deployment
// of the same site (for example one made by a different tool).
//
//   node scripts/check.mjs <site> <base-url> [<compare-base-url>]
//
// <site> is static, functions, worker-file or worker-dir. Preview deployments
// read the `preview` env, so the expected greeting is "preview".
import { createHash } from "node:crypto";

const [site, baseUrl, compareUrl] = process.argv.slice(2);
const SITES = ["static", "functions", "worker-file", "worker-dir"];
if (!SITES.includes(site) || !baseUrl) {
  console.error(`usage: node scripts/check.mjs <${SITES.join("|")}> <base-url> [<compare-base-url>]`);
  process.exit(2);
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const text = (r) => new TextDecoder().decode(r.body);
const json = (r) => JSON.parse(text(r));
const LARGE_SIZE = 25 * 1024 * 1024;

// Each check is one request plus an assertion.
const CHECKS = {
  static: [
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
  ],
  functions: [
    { path: "/", assert: (r) => r.status === 200 && text(r).includes("functions-index") },
    { path: "/", name: "root middleware ran", assert: (r) => r.headers["x-demo-middleware"] === "root" },
    { path: "/api", assert: (r) => json(r).route === "api-index" },
    { path: "/api/hello", assert: (r) => json(r).greeting === "hello from preview" },
    { path: "/api/hello", method: "POST", body: "ping", assert: (r) => json(r).body === "ping" },
    { path: "/api/users/42", assert: (r) => json(r).id === "42" },
    { path: "/api/files/a/b/c", assert: (r) => JSON.stringify(json(r).path) === '["a","b","c"]' },
    { path: "/api/banner", assert: (r) => text(r).trim() === "text-module-banner" },
    { path: "/plugin-assets/hello.txt", name: "assets: plugin route", assert: (r) => text(r).trim() === "plugin-asset-hello" },
  ],
  "worker-file": [
    { path: "/", assert: (r) => r.status === 200 && text(r).includes("worker-file-index") },
    { path: "/worker", assert: (r) => json(r).site === "worker-file" && json(r).greeting === "preview" },
    { path: "/api/skipped", name: "functions/ not deployed", assert: (r) => !text(r).includes('"route"') },
  ],
  "worker-dir": [
    { path: "/", assert: (r) => r.status === 200 && text(r).includes("worker-dir-index") },
    { path: "/worker", assert: (r) => json(r).site === "worker-dir" && json(r).chunk === "worker-dir-chunk" },
    { path: "/worker/nested", assert: (r) => json(r).path === "/worker/nested" && json(r).greeting === "preview" },
    { path: "/api/skipped", name: "functions/ not deployed", assert: (r) => !text(r).includes('"route"') },
  ],
};

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
    if (value !== null) headers[name] = value.replace(new URL(base).origin, "");
  }
  return { status: res.status, path: new URL(res.url || check.path, base).pathname, headers, body };
}

async function largeOk(base, response) {
  const expected = (await (await fetch(new URL("/large/25mib.bin.sha256", base))).text()).trim();
  return response.status === 200 && response.body.byteLength === LARGE_SIZE && sha256(response.body) === expected;
}

function summary(r) {
  return { status: r.status, path: r.path, headers: r.headers, bytes: r.body.byteLength, sha256: sha256(r.body) };
}

let failures = 0;
for (const check of CHECKS[site]) {
  const label = `${check.method ?? "GET"} ${check.path}${check.name ? ` (${check.name})` : ""}`;
  try {
    const a = await request(baseUrl, check);
    let ok = check.large ? await largeOk(baseUrl, a) : Boolean(check.assert(a));

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

    if (!ok) failures++;
    console.log(`${ok ? "ok  " : "FAIL"} ${label} -> ${a.status}${note}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${label} -> ${error.message}`);
  }
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
