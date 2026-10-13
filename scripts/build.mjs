// Builds every deployable output from public/ plus generated fixtures.
//
//   dist/              static site; deployed with functions/ (main, functions)
//   dist-worker-file/  dist/ plus a _worker.js file
//   dist-worker-dir/   dist/ plus a _worker.js/ directory and _routes.json
//   dist-oversize/     dist/ plus one file 1 byte over the 25 MiB limit
//                      (only with --oversize; deploys must refuse it)
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAX_ASSET_SIZE = 25 * 1024 * 1024;
const oversize = process.argv.includes("--oversize");

// Deterministic, incompressible bytes, so the large file hashes the same on
// every build and cannot be shrunk by transport compression.
function pseudoRandomBytes(size, seed) {
  const bytes = new Uint8Array(size);
  let x = seed >>> 0 || 1;
  for (let i = 0; i < size; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    bytes[i] = x & 0xff;
  }
  return bytes;
}

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

for (const name of ["dist", "dist-worker-file", "dist-worker-dir", "dist-oversize"]) {
  rmSync(join(root, name), { recursive: true, force: true });
}

const dist = join(root, "dist");
cpSync(join(root, "public"), dist, { recursive: true });

// Exactly at the limit: upstream accepts files up to and including 25 MiB.
const large = pseudoRandomBytes(MAX_ASSET_SIZE, 0x5eed);
write(join(dist, "large/25mib.bin"), large);
write(
  join(dist, "large/25mib.bin.sha256"),
  `${createHash("sha256").update(large).digest("hex")}\n`,
);

// Upstream's ignore list is minimatch against the path relative to the output
// directory: `.wrangler` is ignored only at the top level, while
// `**/node_modules` and `**/.DS_Store` are ignored at any depth.
write(join(dist, ".wrangler/ignored.txt"), "top-level .wrangler is ignored\n");
write(join(dist, "nested/.wrangler/kept.txt"), "nested .wrangler is uploaded\n");
write(join(dist, "nested/node_modules/ignored.txt"), "nested node_modules is ignored\n");
write(join(dist, ".DS_Store"), "ignored\n");
write(join(dist, "nested/.DS_Store"), "ignored\n");

const workerFile = join(root, "dist-worker-file");
cpSync(dist, workerFile, { recursive: true });
cpSync(join(root, "worker-file/_worker.js"), join(workerFile, "_worker.js"));

const workerDir = join(root, "dist-worker-dir");
cpSync(dist, workerDir, { recursive: true });
cpSync(join(root, "worker-dir"), join(workerDir, "_worker.js"), { recursive: true });
cpSync(join(root, "worker-dir-routes.json"), join(workerDir, "_routes.json"));

if (oversize) {
  const out = join(root, "dist-oversize");
  cpSync(dist, out, { recursive: true });
  write(join(out, "large/too-big.bin"), pseudoRandomBytes(MAX_ASSET_SIZE + 1, 0xb16));
}

console.log(
  `built dist/, dist-worker-file/, dist-worker-dir/${oversize ? ", dist-oversize/" : ""}`,
);
