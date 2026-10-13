export async function onRequest(context) {
  const response = await context.next();
  const tagged = new Response(response.body, response);
  tagged.headers.set("X-Demo-Middleware", "root");
  return tagged;
}
