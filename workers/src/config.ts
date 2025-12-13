import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  FTM_ENV: z.enum(["dev", "stage", "prod"]).default("dev").catch("dev"),
  FTM_DATABASE_URL: z.string().min(1).default("postgres://ftm:ftm@localhost:5432/ftm"),
  FTM_QUEUE_URL: z.string().default("redis://localhost:6379"),
  FTM_QUEUE_TYPE: z.string().default("redis"),
  FTM_STORAGE_URI: z.string().default("s3://ftm-dev"),
  FTM_LOG_LEVEL: z.string().default("info")
});

export const env = envSchema.parse(process.env);
