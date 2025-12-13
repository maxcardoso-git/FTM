import { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { pool } from "../lib/db";
import { evalQueue } from "../lib/queues";

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  project_id: z.string().uuid(),
  eval_suite_id: z.string().uuid(),
  model_ref: z.object({
    type: z.enum(["base_model", "ft_model_version", "provider_model_id"]),
    value: z.string()
  })
});

export async function registerEvalRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
    }
    const data = parsed.data;
    const evalRunId = randomUUID();

    try {
      await pool.query(
        `insert into ftm_eval_runs
         (eval_run_id, tenant_id, project_id, eval_suite_id, model_ref_type, model_ref_value, status, created_at)
         values ($1,$2,$3,$4,$5,$6,'queued',now())`,
        [evalRunId, data.tenant_id, data.project_id, data.eval_suite_id, data.model_ref.type, data.model_ref.value]
      );

      await evalQueue.add(
        "run",
        {
          eval_run_id: evalRunId,
          tenant_id: data.tenant_id,
          project_id: data.project_id,
          eval_suite_id: data.eval_suite_id,
          model_ref_type: data.model_ref.type,
          model_ref_value: data.model_ref.value
        },
        { jobId: evalRunId }
      );

      return reply.code(201).send({
        eval_run_id: evalRunId,
        tenant_id: data.tenant_id,
        project_id: data.project_id,
        eval_suite_id: data.eval_suite_id,
        model_ref_type: data.model_ref.type,
        model_ref_value: data.model_ref.value,
        status: "queued",
        created_at: new Date().toISOString()
      });
    } catch (err) {
      request.log.error({ err }, "failed to create eval run");
      return reply.code(500).send({ error: "internal_error", message: "Failed to create eval run" });
    }
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await pool.query(
        `select eval_run_id, tenant_id, project_id, eval_suite_id, model_ref_type, model_ref_value, status, metrics_json, trism_report, started_at, completed_at, created_at
         from ftm_eval_runs where eval_run_id = $1`,
        [id]
      );
      if (result.rowCount === 0) {
        return reply.code(404).send({ error: "not_found", message: "Eval run not found" });
      }
      return reply.send(result.rows[0]);
    } catch (err) {
      request.log.error({ err }, "failed to fetch eval run");
      return reply.code(500).send({ error: "internal_error", message: "Failed to fetch eval run" });
    }
  });
}
