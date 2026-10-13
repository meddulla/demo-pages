import { greet } from "../../lib/greet";

interface Env {
  GREETING: string;
}

export const onRequestGet = ({ env }: { env: Env }) =>
  Response.json({ route: "hello", greeting: greet(env.GREETING) });

export const onRequestPost = async ({ request }: { request: Request }) =>
  Response.json({ route: "hello", method: "POST", body: await request.text() });
