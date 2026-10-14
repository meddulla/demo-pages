// The import lies outside the output directory, so this only works when
// `wrangler pages deploy` bundles the file.
import { describe } from "../lib/describe.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/worker") return Response.json(describe(env));
    return env.ASSETS.fetch(request);
  },
};
