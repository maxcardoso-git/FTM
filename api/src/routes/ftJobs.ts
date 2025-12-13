import { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { pool } from "../lib/db";
import { ftJobQueue } from "../lib/queues";

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  project_id: z.string().uuid(),
  provider: z.literal("openai"),
  method: z.enum(["SFT", "DPO", "RFT"]),
  base_model: z.string(),
  dataset_id: z.string().uuid()
});

export async function registerFtJobRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
    }
    const data = parsed.data;
    const ftJobId = randomUUID();

    try {
      await pool.query(
        `insert into ftm_ft_jobs
         (ft_job_id, tenant_id, project_id, provider, method, base_model, dataset_id, status, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,'queued',now(),now())`,
        [ftJobId, data.tenant_id, data.project_id, data.provider, data.method, data.base_model, data.dataset_id]
      );

      await ftJobQueue.add(
        "train",
        {
          ft_job_id: ftJobId,
          tenant_id: data.tenant_id,
          project_id: data.project_id,
          provider: data.provider,
          method: data.method,
          base_model: data.base_model,
          dataset_id: data.dataset_id
        },
        { jobId: ftJobId }
      );

      return reply.code(201).send({
        ft_job_id: ftJobId,
        tenant_id: data.tenant_id,
        project_id: data.project_id,
        provider: data.provider,
        method: data.method,
        base_model: data.base_model,
        dataset_id: data.dataset_id,
        status: "queued",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      request.log.error({ err }, "failed to create fine-tuning job");
      return reply.code(500).send({ error: "internal_error", message: "Failed to create fine-tuning job" });
    }
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await pool.query(
        `select ft_job_id, tenant_id, project_id, provider, method, base_model, dataset_id, status, provider_job_id, result_json, cost_estimate_usd, cost_actual_usd, prism_tracked, created_at, updated_at
         from ftm_ft_jobs where ft_job_id = $1`,
        [id]
      );
      if (result.rowCount === 0) {
        return reply.code(404).send({ error: "not_found", message: "Fine-tuning job not found" });
      }
      return reply.send(result.rows[0]);
    } catch (err) {
      request.log.error({ err }, "failed to fetch fine-tuning job");
      return reply.code(500).send({ error: "internal_error", message: "Failed to fetch fine-tuning job" });
    }
  });
}
