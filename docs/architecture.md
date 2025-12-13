# Architecture

Fine-Tuning Manager (FTM) is an API-first microservice with async workers. It executes governed pipelines for datasets, evals, fine-tuning, registry, and promotions while Orchestrator remains the governance authority.

## System view
- API Service: REST endpoints with Idempotency-Key support; issues governance checks; persists state in PostgreSQL; emits audit events to Orchestrator; signs webhooks.
- Worker Pool: queue-backed processors for dataset build, eval execution, fine-tune jobs, monitoring tasks, and promotion side-effects (pointer swaps, rollbacks).
- Integrations:
  - Orchestrator Governance/Audit: REST calls for GovernanceCheck, PRISM approvals, audit event emission.
  - TRiSM: sanitize gate for datasets, lightweight scans on metadata/notes, scoring for eval outputs.
  - OpenAI Provider: FT job submission (SFT/DPO), status polling/webhooks for job completions.
  - ResourceRegistry/Object Storage: resolves storage buckets/paths for datasets, eval artifacts, and FT outputs.
  - Optional Vector Layer: for deduplication similarity and eval selection strategies.
- Observability: OpenTelemetry traces; structured logs with `trace_id`; metrics for durations, fail rates, gate denials, and queue health.

## Component responsibilities
- Dataset Builder
  - Ingests traces from Orchestrator (Memory/Assistants/Sessions).
  - Dedup (exact + optional embedding similarity via vector layer).
  - Generates JSONL (chat or prompt-completion) with schema validation.
  - Mandatory TRiSM sanitize gate before persistence; lineage/version tracking.
- Eval Service
  - Eval suite registry (static cases or vector-selected cases).
  - Executes grading hooks (schema-valid, tool-call success, safety) and applies TRiSM scoring to outputs.
  - Persists metrics + artifacts; emits audit on completion; supports scheduled re-evals.
- Fine-Tuning Job Runner
  - OpenAI adapter for SFT and DPO in v1; async submission + polling/webhooks.
  - Enforces governance gates: dataset sanitized, governance decision approved, optional PRISM pre-approval.
  - Tracks cost estimate vs actual; emits PRISM tracking events.
- Model Registry
  - Registers provider model IDs as ModelVersions; attaches eval/governance summaries.
  - Maintains lifecycle states: candidate/approved/production/retired.
- Promotion Service
  - Promotion target scope: assistant/project/global.
  - Gate checks: min eval score, TRiSM, PRISM/GovernanceCheck(action=model.promote).
  - Atomic production pointer swap; rollback to previous pointer.
- Monitoring
  - Scheduled re-evals (cron/worker), regression detection (score/risk/cost deltas).
  - Emits events to Orchestrator audit and triggers promotions or rollbacks per policy.

## Deployment topology
- Stateless API instances behind LB.
- Worker deployment(s) consuming from queue (e.g., Redis/Rabbit/SQS; pluggable).
- PostgreSQL for relational data; Object Storage for artifacts; optional vector store.
- Webhook delivery service with retries and signature verification.

## Key flows (happy path)
- UC1 Dataset build: API request → GovernanceCheck(TRiSM sanitize gate) → enqueue dataset job → worker dedup + sanitize + JSONL persist to storage → record `ftm_datasets` + audit event with storage URI.
- UC2 Eval run: request with model reference → fetch eval suite + selection strategy → enqueue eval job → worker runs cases, applies grading + TRiSM scoring → persist metrics/artifacts → audit event, optional PRISM cost estimate.
- UC3 Fine-tune: request validated (dataset.sanitized=true, governance gate) → optional PRISM pre-approval based on estimate → submit OpenAI job → poll/webhook → persist result/costs → update model registry entry.
- UC4 Promotion: request targets assistant/project/global → verify min eval score + TRiSM + PRISM decision → atomic production pointer update with rollback handle → audit emit.

## Resilience and retries
- Queue-based retries with exponential backoff per job type.
- Idempotent handlers (Idempotency-Key header, provider job_id reuse).
- Webhooks: signed payloads, persisted delivery attempts, DLQ for dead deliveries.
- Circuit breakers and timeouts for external calls (Orchestrator, TRiSM, OpenAI).

## Configuration and secrets
- Service-to-service API key for Orchestrator; provider credentials per tenant/project.
- Signing keys for webhooks; encryption at rest for storage; environment-based config for queue, DB, storage, vector layer.

## Compliance and audit
- No raw PII stored; only sanitized datasets.
- Audit events for: dataset_created, eval_completed, ft_job_created, model_promoted, model_rejected.
- Governance decisions stored alongside artifacts and lineage to ensure traceability.
