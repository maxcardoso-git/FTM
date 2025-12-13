import { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { pool } from "../lib/db";

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  project_id: z.string().uuid(),
  name: z.string(),
  selection_strategy: z.enum(["static", "vector_retrieval"]),
  kb_collection: z.string().optional(),
  policy_profile: z.string().optional(),
  description: z.string().optional()
});

export async function registerEvalSuiteRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
    }
    const data = parsed.data;
    const evalSuiteId = randomUUID();
    try {
      await pool.query(
        `insert into ftm_eval_suites
         (eval_suite_id, tenant_id, project_id, name, selection_strategy, kb_collection, policy_profile, description, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,now(),now())`,
        [
          evalSuiteId,
          data.tenant_id,
          data.project_id,
          data.name,
          data.selection_strategy,
          data.kb_collection ?? null,
          data.policy_profile ?? null,
          data.description ?? null
        ]
      );
      return reply.code(201).send({
        eval_suite_id: evalSuiteId,
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      request.log.error({ err }, "failed to create eval suite");
      return reply.code(500).send({ error: "internal_error", message: "Failed to create eval suite" });
    }
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await pool.query(
        `select eval_suite_id, tenant_id, project_id, name, selection_strategy, kb_collection, policy_profile, description, created_at, updated_at
         from ftm_eval_suites where eval_suite_id = $1`,
        [id]
      );
      if (result.rowCount === 0) {
        return reply.code(404).send({ error: "not_found", message: "Eval suite not found" });
      }
      return reply.send(result.rows[0]);
    } catch (err) {
      request.log.error({ err }, "failed to fetch eval suite");
      return reply.code(500).send({ error: "internal_error", message: "Failed to fetch eval suite" });
    }
  });
}
