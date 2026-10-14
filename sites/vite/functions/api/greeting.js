export const onRequestGet = ({ env }) => Response.json({ greeting: env.GREETING ?? null });
