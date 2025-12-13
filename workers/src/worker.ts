import { Worker } from "bullmq";
import { env } from "./config";

const connection = { connection: { url: env.FTM_QUEUE_URL } };

// Dataset jobs placeholder; extend with real processors per PRD.
const datasetWorker = new Worker(
  "ftm:datasets",
  async (job) => {
    job.log(`Received dataset job ${job.id} (not implemented)`);
    return { status: "not_implemented" };
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
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
