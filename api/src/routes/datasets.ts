import { FastifyInstance } from "fastify";
import { z } from "zod";
import { randomUUID } from "crypto";
import { pool } from "../lib/db";
import { datasetQueue } from "../lib/queues";

const createSchema = z.object({
  tenant_id: z.string().uuid(),
  project_id: z.string().uuid(),
  assistant_id: z.string().uuid().optional(),
  output_format: z.enum(["jsonl_chat", "jsonl_prompt_completion"]),
  source: z.object({
    type: z.literal("orchestrator_traces"),
    filters: z.record(z.any()).optional()
  }),
  dedup: z
    .object({
      exact: z.boolean().default(true),
      semantic: z.boolean().default(false)
    })
    .default({ exact: true, semantic: false }),
  vectorize: z.boolean().default(false)
});

export async function registerDatasetRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", message: parsed.error.message });
    }

    const data = parsed.data;
    const datasetId = randomUUID();

    try {
      await pool.query(
        `insert into ftm_datasets
         (dataset_id, tenant_id, project_id, assistant_id, status, output_format, sanitized, sanitized_by_trism, vectorized, created_at, updated_at)
         values ($1,$2,$3,$4,'building',$5,false,false,$6,now(),now())`,
        [datasetId, data.tenant_id, data.project_id, data.assistant_id ?? null, data.output_format, data.vectorize]
      );

      await datasetQueue.add(
        "build",
        {
          dataset_id: datasetId,
          tenant_id: data.tenant_id,
          project_id: data.project_id,
          vectorize: data.vectorize,
          output_format: data.output_format
        },
        { jobId: datasetId }
      );

      return reply.code(201).send({
        dataset_id: datasetId,
        tenant_id: data.tenant_id,
        project_id: data.project_id,
        assistant_id: data.assistant_id ?? null,
        status: "building",
        output_format: data.output_format,
        sanitized: false,
        sanitized_by_trism: false,
        vectorized: data.vectorize,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      request.log.error({ err }, "failed to create dataset");
      return reply.code(500).send({ error: "internal_error", message: "Failed to create dataset" });
    }
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const result = await pool.query(
        `select dataset_id, tenant_id, project_id, assistant_id, status, output_format, sanitized, sanitized_by_trism, trism_report, storage_uri, record_count, token_estimate, vectorized, created_at, updated_at
         from ftm_datasets where dataset_id = $1`,
        [id]
      );
      if (result.rowCount === 0) {
        return reply.code(404).send({ error: "not_found", message: "Dataset not found" });
      }
      return reply.send(result.rows[0]);
    } catch (err) {
      request.log.error({ err }, "failed to fetch dataset");
      return reply.code(500).send({ error: "internal_error", message: "Failed to fetch dataset" });
    }
  });
}
