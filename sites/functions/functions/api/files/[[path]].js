export function onRequest({ params }) {
  return Response.json({ route: "files", path: params.path ?? [] });
}
