# Worker Service Skeleton

This directory will hold queue-driven workers for dataset build, eval execution, fine-tuning job polling, webhook deliveries, and monitoring tasks.

Responsibilities:
- Consume jobs from queue (Redis/Rabbit/SQS) with per-type backoff/retry policies.
- Implement idempotent processors; emit audit events; sign outbound webhooks.
- Poll provider jobs (OpenAI) and reconcile statuses; update persistence layer.
- Run scheduled re-evals and regression detection; optionally trigger auto-rollback.

Pending:
- Confirm queue choice and worker framework (BullMQ/RQ/Temporal option if desired).
- Define job payload schemas aligned with `docs/api.md` and OpenAPI.
- Implement DLQ handling and replay tooling under `scripts/`.
