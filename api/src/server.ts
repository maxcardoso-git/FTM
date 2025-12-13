import fastify from "fastify";
import { env } from "./config";
import { registerDatasetRoutes } from "./routes/datasets";
import { registerEvalRoutes } from "./routes/evals";

async function buildServer() {
  const app = fastify({
    logger: {
      level: env.FTM_LOG_LEVEL
    }
  });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(registerDatasetRoutes, { prefix: "/datasets" });
  await app.register(registerEvalRoutes, { prefix: "/eval-runs" });

  return app;
}

async function start() {
  const app = await buildServer();
  try {
    await app.listen({ port: env.FTM_PORT, host: "0.0.0.0" });
    app.log.info({ port: env.FTM_PORT }, "API server started");
  } catch (err) {
    app.log.error(err, "Failed to start server");
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

export { buildServer };
