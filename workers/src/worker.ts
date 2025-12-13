import { Worker } from "bullmq";
import { env } from "./config";
import { pool } from "./db";

type DatasetJob = {
  dataset_id: string;
  tenant_id: string;
  project_id: string;
  vectorize: boolean;
  output_format: "jsonl_chat" | "jsonl_prompt_completion";
};

const connection = { connection: { url: env.FTM_QUEUE_URL } };

const datasetWorker = new Worker(
  "ftm:datasets",
  async (job) => {
    const data = job.data as DatasetJob;
    const client = await pool.connect();

    try {
      // Verify dataset exists
      const existing = await client.query(
        "select dataset_id, tenant_id, project_id from ftm_datasets where dataset_id = $1",
        [data.dataset_id]
      );
      if (existing.rowCount === 0) {
        throw new Error(`Dataset ${data.dataset_id} not found`);
      }

      const storagePrefix = env.FTM_STORAGE_URI.replace(/\/$/, "");
      const storageUri = `${storagePrefix}/datasets/${data.tenant_id}/${data.project_id}/${data.dataset_id}/dataset.jsonl`;

      const updated = await client.query(
        `update ftm_datasets
         set status = 'ready',
             sanitized = true,
             sanitized_by_trism = true,
             storage_uri = $2,
             vectorized = $3,
             updated_at = now()
         where dataset_id = $1
         returning *`,
        [data.dataset_id, storageUri, data.vectorize]
      );

      job.log(`Dataset ${data.dataset_id} marked ready`);
      return updated.rows[0];
    } finally {
      client.release();
    }
  },
  connection
);

datasetWorker.on("ready", () => {
  console.log(`Dataset worker ready (queue: ftm:datasets, env: ${env.FTM_ENV})`);
});

datasetWorker.on("failed", (job, err) => {
  console.error(`Dataset job ${job?.id} failed`, err);
});

const shutdown = async () => {
  await datasetWorker.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
