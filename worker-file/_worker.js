// Copied to dist-worker-file/_worker.js by scripts/build.mjs. The import path
// resolves to shared/ from both locations, and lies outside the build output,
// so it only works when `wrangler pages deploy` bundles this file.
import { describe } from "../shared/describe.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/worker") return Response.json(describe("worker-file", env));
    return env.ASSETS.fetch(request);
  },
};
