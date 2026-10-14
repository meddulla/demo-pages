export const onRequestGet = ({ params }: { params: { id: string } }) =>
  Response.json({ route: "user", id: params.id });
