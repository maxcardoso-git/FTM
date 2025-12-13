import { Queue, QueueScheduler, Worker } from "bullmq";
import { env } from "./config";

export const queueNames = {
  dataset: "ftm:datasets",
  eval: "ftm:evals",
  fineTuning: "ftm:fine-tuning",
  promotion: "ftm:promotions"
} as const;

export const connection = { connection: { url: env.FTM_QUEUE_URL } };

export const datasetQueue = new Queue(queueNames.dataset, connection);
export const evalQueue = new Queue(queueNames.eval, connection);
export const ftJobQueue = new Queue(queueNames.fineTuning, connection);
export const promotionQueue = new Queue(queueNames.promotion, connection);

// Schedulers ensure delayed/retried jobs are processed even after restarts.
export const datasetScheduler = new QueueScheduler(queueNames.dataset, connection);
export const ftScheduler = new QueueScheduler(queueNames.fineTuning, connection);
