export function describe(env) {
  return { site: "worker-file", greeting: env.GREETING ?? null };
}
