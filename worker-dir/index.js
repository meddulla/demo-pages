import { chunkName } from "./chunk.mjs";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/worker" || url.pathname.startsWith("/worker/")) {
      return Response.json({
        variant: "worker-dir",
        chunk: chunkName,
        path: url.pathname,
        greeting: env.GREETING ?? null,
      });
    }
    return env.ASSETS.fetch(request);
  },
};
