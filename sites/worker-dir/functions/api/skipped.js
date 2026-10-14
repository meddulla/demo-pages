// Pages builds functions/ next to a _worker.js/ directory but does not deploy it.
export const onRequest = () => Response.json({ route: "functions" });
