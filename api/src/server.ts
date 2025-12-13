import fastify from "fastify";
import { env } from "./config";
import { registerDatasetRoutes } from "./routes/datasets";
import { registerEvalRoutes } from "./routes/evals";
import { registerFtJobRoutes } from "./routes/ftJobs";
import { registerPromotionRoutes } from "./routes/promotions";
import { registerEvalSuiteRoutes } from "./routes/evalSuites";
import { registerModelVersionRoutes } from "./routes/modelVersions";
import { registerProductionPointerRoutes } from "./routes/productionPointers";

async function buildServer() {
  const app = fastify({
    logger: {
      level: env.FTM_LOG_LEVEL
    }
  });

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(registerDatasetRoutes, { prefix: "/datasets" });
  await app.register(registerEvalSuiteRoutes, { prefix: "/eval-suites" });
  await app.register(registerEvalRoutes, { prefix: "/eval-runs" });
  await app.register(registerFtJobRoutes, { prefix: "/ft-jobs" });
  await app.register(registerPromotionRoutes, { prefix: "/promotions" });
  await app.register(registerModelVersionRoutes, { prefix: "/model-versions" });
  await app.register(registerProductionPointerRoutes, { prefix: "/production-pointers" });

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
