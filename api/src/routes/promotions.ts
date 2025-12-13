import { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { pool } from "../lib/db";
import { promotionQueue } from "../lib/queues";

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  project_id: z.string().uuid(),
  model_version_id: z.string().uuid(),
  target: z.object({
    type: z.enum(["assistant", "project", "global"]),
    value: z.string()
  })
});

export async function registerPromotionRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
    }
    const data = parsed.data;
    const decisionId = randomUUID();

    try {
      await pool.query(
        `insert into ftm_promotions
         (decision_id, tenant_id, project_id, model_version_id, target_type, target_value, decision, created_at)
         values ($1,$2,$3,$4,$5,$6,'blocked',now())`,
        [decisionId, data.tenant_id, data.project_id, data.model_version_id, data.target.type, data.target.value]
      );

      await promotionQueue.add(
        "promote",
        {
          decision_id: decisionId,
          tenant_id: data.tenant_id,
          project_id: data.project_id,
          model_version_id: data.model_version_id,
          target_type: data.target.type,
          target_value: data.target.value
        },
        { jobId: decisionId }
      );

      return reply.code(201).send({
        decision_id: decisionId,
        tenant_id: data.tenant_id,
        project_id: data.project_id,
        model_version_id: data.model_version_id,
        target_type: data.target.type,
        target_value: data.target.value,
        decision: "blocked",
        created_at: new Date().toISOString()
      });
    } catch (err) {
      request.log.error({ err }, "failed to create promotion decision");
      return reply.code(500).send({ error: "internal_error", message: "Failed to create promotion decision" });
    }
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await pool.query(
        `select decision_id, tenant_id, project_id, model_version_id, target_type, target_value, decision, reasons_json, trism_pass, prism_pass, production_pointer_json, created_at
         from ftm_promotions where decision_id = $1`,
        [id]
      );
      if (result.rowCount === 0) {
        return reply.code(404).send({ error: "not_found", message: "Promotion not found" });
      }
      return reply.send(result.rows[0]);
    } catch (err) {
      request.log.error({ err }, "failed to fetch promotion");
      return reply.code(500).send({ error: "internal_error", message: "Failed to fetch promotion" });
    }
  });
}
