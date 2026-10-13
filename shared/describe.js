export function describe(variant, env) {
  return { variant, greeting: env.GREETING ?? null };
}
