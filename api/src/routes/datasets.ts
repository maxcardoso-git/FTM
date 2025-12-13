import { FastifyInstance } from "fastify";

export async function registerDatasetRoutes(app: FastifyInstance) {
  app.post("/", async (_request, reply) => {
    reply.code(501).send({ error: "not_implemented", message: "Dataset creation will be implemented in the first vertical slice." });
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.code(501).send({ error: "not_implemented", message: `Dataset ${id} lookup not implemented yet.` });
  });
}
