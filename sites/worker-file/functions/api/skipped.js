// A _worker.js file takes priority: Pages does not build or deploy functions/.
export const onRequest = () => Response.json({ route: "functions" });
