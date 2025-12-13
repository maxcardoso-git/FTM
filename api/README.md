# API Service Skeleton

This directory will hold the API service implementation for FTM.

Suggested stack (to validate with team):
- Language/framework: TypeScript + Fastify (lightweight, fast) or Python + FastAPI.
- OpenAPI-first with code generation for types and clients.
- Middlewares: auth (Orchestrator API keys), Idempotency-Key cache, request validation.
- Observability: OpenTelemetry tracing, structured JSON logging, metrics export.

Structure (planned):
- `src/routes/` — route handlers per domain (datasets, evals, ft-jobs, model-versions, promotions, monitoring, webhooks).
- `src/services/` — domain services and integrations (Orchestrator, TRiSM, PRISM, OpenAI, storage, vector).
- `src/lib/` — shared utilities (idempotency, retry/circuit breakers, webhook signing).
- `src/config/` — configuration schema and loaders.
- `src/server.ts` — bootstrap, middlewares, health endpoints.

Pending:
- Confirm language/runtime choice.
- Generate server stubs from `docs/openapi.yaml` once available.
