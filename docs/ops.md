# Operations and configuration

## Configuration (env-driven, suggested names)
- `FTM_ENV`: dev|stage|prod
- `FTM_PORT`: API port
- `FTM_DATABASE_URL`: Postgres connection string
- `FTM_STORAGE_URI`: object storage base URI (e.g., s3://bucket)
- `FTM_STORAGE_REGION`: storage region
- `FTM_QUEUE_URL` / `FTM_QUEUE_TYPE`: queue endpoint and type (redis|sqs|rabbit)
- `FTM_VECTOR_URL` (optional): vector store endpoint
- `FTM_ORCHESTRATOR_URL`: base URL for governance/audit APIs
- `FTM_ORCHESTRATOR_API_KEY`: service-to-service auth
- `FTM_TRISM_URL`: TRiSM sanitizer/scanner endpoint
- `FTM_PRISM_URL`: PRISM cost/approval endpoint
- `FTM_OPENAI_API_KEY`: provider key (per tenant/project when possible)
- `FTM_WEBHOOK_SIGNING_KEY`: key for outbound webhook signatures
- `FTM_LOG_LEVEL`: debug|info|warn|error
- `FTM_OTEL_EXPORTER_OTLP_ENDPOINT`: OTel collector endpoint

## Deployment checklist (v1)
- Apply migrations from `migrations/`.
- Configure secrets via vault/secret manager; never bake keys into images.
- Deploy API pods behind LB; deploy workers with queue access; autoscale workers on queue depth.
- Enable HTTPS termination and restrict allowed origins; enforce Idempotency-Key on mutating routes.
- Configure webhook destinations and rotate signing keys with overlap.
- Set SLO alerts (latency p95, error rate, queue backlog, webhook DLQ).

## Local development (stub)
- Dependencies: Postgres, object storage emulator (e.g., MinIO), queue (Redis for local), optional vector store.
- Steps (example):
  1. `docker compose up postgres redis minio` (compose file TBD).
  2. Export env vars (`FTM_DATABASE_URL`, `FTM_STORAGE_URI`, `FTM_QUEUE_URL`, keys for mocks).
  3. Run migrations via tool (TBD) using `migrations/`.
  4. Start API server in dev mode; start worker process connected to same queue.
  5. Use `docs/openapi.yaml` with a REST client for smoke tests.

## Key runbooks (expand later)
- Retry stuck jobs: inspect DLQ; replay with `queue-replay` script (TBD).
- Webhook failures: fetch delivery by ID; redeliver after updating endpoint/secret; rotate signing keys.
- Credential rotation: update secret manager; rolling restart API/workers; verify health probes.
- Emergency pointer override: use `PATCH /production-pointers/{id}`; create audit note; schedule regression eval post-change.
