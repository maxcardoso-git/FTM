import { Worker } from "bullmq";
import { env } from "./config";
import { pool } from "./db";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { connection, datasetScheduler, evalQueue, ftJobQueue, promotionQueue, ftScheduler, queueNames } from "./queues";

type DatasetJob = {
  dataset_id: string;
  tenant_id: string;
  project_id: string;
  vectorize: boolean;
  output_format: "jsonl_chat" | "jsonl_prompt_completion";
};

const s3 = new S3Client({
  region: env.FTM_STORAGE_REGION,
  endpoint: env.AWS_ENDPOINT,
  forcePathStyle: env.AWS_S3_FORCE_PATH_STYLE ?? true
});

function parseStorageUri(uri: string) {
  const match = uri.match(/^s3:\\/\\/([^/]+)(?:\\/(.*))?$/);
  if (!match) throw new Error("Invalid FTM_STORAGE_URI, expected s3://bucket[/prefix]");
  const bucket = match[1];
  const prefix = match[2] ? match[2].replace(/\\/$/, "") : "";
  return { bucket, prefix };
}

const datasetWorker = new Worker(
  queueNames.dataset,
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

      const { bucket, prefix } = parseStorageUri(env.FTM_STORAGE_URI);
      const key = `${prefix ? prefix + "/" : ""}datasets/${data.tenant_id}/${data.project_id}/${data.dataset_id}/dataset.jsonl`;

      const placeholder = [
        JSON.stringify({
          info: "placeholder dataset row",
          dataset_id: data.dataset_id,
          generated_at: new Date().toISOString()
        })
      ].join("\n");

      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: placeholder,
          ContentType: "application/jsonl"
        })
      );

      const storageUri = `s3://${bucket}/${key}`;

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

      job.log(`Dataset ${data.dataset_id} marked ready at ${storageUri}`);
      return updated.rows[0];
    } catch (err) {
      await pool.query(`update ftm_datasets set status = 'failed', updated_at = now() where dataset_id = $1`, [data.dataset_id]);
      job.log(`Dataset ${data.dataset_id} failed: ${(err as Error).message}`);
      throw err;
    } finally {
      client.release();
    }
  },
  connection
);

datasetWorker.on("ready", () => {
  console.log(`Dataset worker ready (queue: ${queueNames.dataset}, env: ${env.FTM_ENV})`);
});

datasetWorker.on("failed", (job, err) => {
  console.error(`Dataset job ${job?.id} failed`, err);
});

// Placeholder workers for eval, fine-tuning, promotions
const evalWorker = new Worker(
  queueNames.eval,
  async (job) => {
    const data = job.data as {
      eval_run_id: string;
      tenant_id: string;
      project_id: string;
      eval_suite_id: string;
      model_ref_type: string;
      model_ref_value: string;
    };
    const client = await pool.connect();
    try {
      await client.query(
        `update ftm_eval_runs
         set status = 'completed',
             metrics_json = '{"placeholder": true}'::jsonb,
             trism_report = '{"placeholder": true}'::jsonb,
             started_at = coalesce(started_at, now()),
             completed_at = now(),
             created_at = coalesce(created_at, now())
         where eval_run_id = $1`,
        [data.eval_run_id]
      );
      job.log(`Eval job ${job.id} marked completed`);
      return { status: "completed" };
    } catch (err) {
      await client.query(`update ftm_eval_runs set status = 'failed', completed_at = now() where eval_run_id = $1`, [
        data.eval_run_id
      ]);
      throw err;
    } finally {
      client.release();
    }
  },
  connection
);

const ftWorker = new Worker(
  queueNames.fineTuning,
  async (job) => {
    const data = job.data as {
      ft_job_id: string;
      tenant_id: string;
      project_id: string;
      provider: string;
      method: string;
      base_model: string;
      dataset_id: string;
    };
    const client = await pool.connect();
    try {
      await client.query(
        `update ftm_ft_jobs
         set status = 'completed',
             provider_job_id = provider_job_id,
             result_json = '{"placeholder": true}'::jsonb,
             cost_estimate_usd = coalesce(cost_estimate_usd, 0),
             cost_actual_usd = coalesce(cost_actual_usd, 0),
             prism_tracked = false,
             updated_at = now()
         where ft_job_id = $1`,
        [data.ft_job_id]
      );
      job.log(`FT job ${job.id} marked completed`);
      return { status: "completed" };
    } catch (err) {
      await client.query(`update ftm_ft_jobs set status = 'failed', updated_at = now() where ft_job_id = $1`, [
        data.ft_job_id
      ]);
      throw err;
    } finally {
      client.release();
    }
  },
  connection
);

const promotionWorker = new Worker(
  queueNames.promotion,
  async (job) => {
    job.log(`Promotion job ${job.id} placeholder`);
    return { status: "not_implemented" };
  },
  connection
);

evalWorker.on("failed", (job, err) => console.error(`Eval job ${job?.id} failed`, err));
ftWorker.on("failed", (job, err) => console.error(`FT job ${job?.id} failed`, err));
promotionWorker.on("failed", (job, err) => console.error(`Promotion job ${job?.id} failed`, err));

const shutdown = async () => {
  await datasetWorker.close();
  await evalWorker.close();
  await ftWorker.close();
  await promotionWorker.close();
  await datasetScheduler.close();
  await ftScheduler.close();
  await pool.end();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
