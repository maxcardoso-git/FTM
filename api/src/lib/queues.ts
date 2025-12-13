import { Queue } from "bullmq";
import { env } from "../config";

const connection = { connection: { url: env.FTM_QUEUE_URL } };

export const datasetQueue = new Queue("ftm:datasets", connection);
