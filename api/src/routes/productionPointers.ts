import { FastifyInstance } from "fastify";
import { z } from "zod";
import { pool } from "../lib/db";

const patchSchema = z.object({
  active_model_version_id: z.string().uuid(),
  notes: z.string().optional()
});

export async function registerProductionPointerRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { target_type, target_value } = request.query as { target_type?: string; target_value?: string };
    if (!target_type || !target_value) {
      return reply.code(400).send({ error: "validation_error", message: "target_type and target_value are required" });
    }
    try {
      const result = await pool.query(
        `select pointer_id, tenant_id, project_id, target_type, target_value, active_model_version_id, previous_model_version_id, orchestrator_audit_id, governance_decision_id, updated_at
         from ftm_production_pointers
         where target_type = $1 and target_value = $2`,
        [target_type, target_value]
      );
      if (result.rowCount === 0) {
        return reply.code(404).send({ error: "not_found", message: "Production pointer not found" });
      }
      return reply.send(result.rows[0]);
    } catch (err) {
      request.log.error({ err }, "failed to fetch production pointer");
      return reply.code(500).send({ error: "internal_error", message: "Failed to fetch production pointer" });
    }
  });

  app.patch("/:id", async (request, reply) => {
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
    }
    const { id } = request.params as { id: string };
    const data = parsed.data;
    try {
      const result = await pool.query(
        `update ftm_production_pointers
         set previous_model_version_id = active_model_version_id,
             active_model_version_id = $2,
             updated_at = now()
         where pointer_id = $1
         returning pointer_id, tenant_id, project_id, target_type, target_value, active_model_version_id, previous_model_version_id, updated_at`,
        [id, data.active_model_version_id]
      );
      if (result.rowCount === 0) {
        return reply.code(404).send({ error: "not_found", message: "Production pointer not found" });
      }
      return reply.send(result.rows[0]);
    } catch (err) {
      request.log.error({ err }, "failed to update production pointer");
      return reply.code(500).send({ error: "internal_error", message: "Failed to update production pointer" });
    }
  });
}
