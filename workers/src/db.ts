import { Pool } from "pg";
import { env } from "./config";

export const pool = new Pool({
  connectionString: env.FTM_DATABASE_URL
});
