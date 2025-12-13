# Recommended stack (proposal)

## Runtime and frameworks
- API: TypeScript + Fastify
  - OpenAPI-first with codegen for types and validation.
  - Fast, low overhead, good plugin ecosystem (OTel, auth, rate limits).
- Workers: Node.js + BullMQ (Redis-backed queues)
  - Shared code with API for domain logic and adapters.
  - Supports retries, backoff, concurrency control; DLQ via separate queues.
- Alternative: Python + FastAPI + RQ/Celery if team prefers Python; would mirror the same API/worker split.

## Integrations and libs
- OpenTelemetry SDK for Node.js; export to OTLP collector.
- pg/TypeORM (or Prisma) for PostgreSQL; consider Kysely/Drizzle for typed SQL.
- AWS SDK for S3/MinIO; optional vector client (e.g., pgvector or external provider).
- Node Fetch/undici for HTTP to Orchestrator/TRiSM/PRISM; circuit breaker layer (e.g., opossum) for resilience.
- Webhook signing/verification via HMAC-SHA256.

## Job queues
- Default: Redis (BullMQ) for local and small/mid scale; pluggable adapter interface to swap for SQS/Rabbit in stage/prod if needed.
- Use separate queues per domain: dataset, eval, ft-job, webhook-delivery, monitoring.

## Testing tooling
- Vitest/Jest for unit/integration; supertest for API; contract tests from OpenAPI.
- Testcontainers for Postgres/Redis/MinIO in integration tests.

## Build and packaging
- Node 20 LTS; package with pnpm or npm.
- Dockerfile with multi-stage build; runs as non-root; env-configured.
- Compose file for local dev (Postgres, Redis, MinIO already provided).
