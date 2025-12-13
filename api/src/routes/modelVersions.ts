import { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { pool } from "../lib/db";

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  project_id: z.string().uuid(),
  provider: z.literal("openai"),
  provider_model_id: z.string(),
  ft_job_id: z.string().uuid().optional(),
  status: z.enum(["candidate", "approved", "production", "retired"]).default("candidate")
});

export async function registerModelVersionRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
    }
    const data = parsed.data;
    const modelVersionId = randomUUID();
    try {
      await pool.query(
        `insert into ftm_model_versions
         (model_version_id, tenant_id, project_id, provider, provider_model_id, ft_job_id, status, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,now(),now())`,
        [modelVersionId, data.tenant_id, data.project_id, data.provider, data.provider_model_id, data.ft_job_id ?? null, data.status]
      );

      return reply.code(201).send({
        model_version_id: modelVersionId,
        ...data,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      request.log.error({ err }, "failed to create model version");
      return reply.code(500).send({ error: "internal_error", message: "Failed to create model version" });
    }
  });

  app.get("/", async (request, reply) => {
    const { project_id, status } = request.query as { project_id?: string; status?: string };
    const params: any[] = [];
    const conditions: string[] = [];
    if (project_id) {
      params.push(project_id);
      conditions.push(`project_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    try {
      const result = await pool.query(
        `select model_version_id, tenant_id, project_id, provider, provider_model_id, ft_job_id, status, created_at, updated_at
         from ftm_model_versions ${where}
         order by created_at desc`,
        params
      );
      return reply.send({ items: result.rows });
    } catch (err) {
      request.log.error({ err }, "failed to list model versions");
      return reply.code(500).send({ error: "internal_error", message: "Failed to list model versions" });
    }
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await pool.query(
        `select model_version_id, tenant_id, project_id, provider, provider_model_id, ft_job_id, status, eval_summary_json, governance_summary_json, created_at, updated_at
         from ftm_model_versions where model_version_id = $1`,
        [id]
      );
      if (result.rowCount === 0) {
        return reply.code(404).send({ error: "not_found", message: "Model version not found" });
      }
      return reply.send(result.rows[0]);
    } catch (err) {
      request.log.error({ err }, "failed to fetch model version");
      return reply.code(500).send({ error: "internal_error", message: "Failed to fetch model version" });
    }
  });
}
