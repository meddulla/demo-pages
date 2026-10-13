import banner from "../../lib/banner.txt";

export const onRequestGet = () =>
  new Response(banner, { headers: { "Content-Type": "text/plain" } });
