# Implementation roadmap, QA, and ops

## Delivery phases (suggested)
1) Foundations (week 1)
   - Bootstrap service (API + worker skeleton), config, env separation.
   - Auth middleware with Orchestrator login API; Idempotency-Key support.
   - Observability wiring (OTel traces/logs/metrics); health/status endpoints.
   - Migrations for base schema; storage and queue adapters stubbed.
2) Datasets (week 2)
   - Trace ingest clients; dedup pipeline (exact + optional semantic).
   - TRiSM sanitize gate + lineage/versioning; JSONL generation and upload.
   - Audit emission + webhooks for dataset created.
3) Evals (week 3)
   - Eval suite registry; selection strategies (static/vector retrieval).
   - Grading hooks + TRiSM scoring; metrics persistence + artifacts storage.
   - Webhooks/audit for eval completed; scheduled re-eval trigger skeleton.
4) Fine-tuning (weeks 4–5)
   - OpenAI adapter (SFT/DPO); cost estimation; PRISM pre-approval path.
   - Async submission/polling; webhook ingestion; retry/backoff logic.
   - Result persistence; model version registration; cost tracking (estimate vs actual).
5) Promotions (week 6)
   - Promotion API with gates (min eval score, TRiSM scan, GovernanceCheck, PRISM).
   - Atomic production pointer swap + rollback; audit/webhook events.
6) Monitoring (week 7)
   - Cron/worker for scheduled re-evals; regression detection (score/risk/cost deltas).
   - Automated rollback trigger option (feature-flagged).
7) Hardening (week 8)
   - Load tests on status endpoints; chaos on worker retries; security scans.
   - Runbooks, SLO alerts, dashboard polish; release candidate validation.

## Testing and QA strategy
- Unit: adapters (OpenAI, TRiSM, PRISM), gating logic, dedup, grading functions, idempotency cache.
- Integration: end-to-end flows for UC1–UC4 against test Postgres + storage + mocked governance/PRISM; webhook signing/verification.
- Contract: OpenAPI conformance tests; provider job schema validation; webhook payload contracts.
- Performance: p95 latency tests for GET/status; queue throughput benchmarks; cost estimation scalability.
- Regression: scheduled re-evals plus golden test cases; backwards compatibility on migrations.
- Security/Compliance: input sanitization tests, secrets scanning, signed webhook verification, encryption at rest checks, access-control headers.

## Observability and SLOs
- Metrics: job durations, fail rates, queue depth, gate denials, webhook delivery success, cost estimate vs actual delta.
- Traces: span external calls (Orchestrator, TRiSM, PRISM, OpenAI); link `trace_id` to logs.
- Logs: structured JSON with tenant/project IDs; redaction of PII.
- SLOs: availability 99.5% v1; API p95 < 500 ms; status p95 < 300 ms; webhook success > 99% within 10 minutes; error budget tracked per quarter.
- Alerts: queue backlog, gate denial spike, provider error spike, webhook DLQ growth, pointer swap failures.

## Operational playbooks (initial)
- Deploy: run migrations → roll API/worker → smoke test health and auth → canary promotion test.
- Incident: identify failing domain (queue/db/provider); replay jobs with Idempotency-Key; rollback production pointer via endpoint.
- Webhook failures: inspect DLQ; re-deliver by ID; rotate webhook signing keys with overlapping validity.
- Credentials/keys: rotation procedure for provider keys and webhook secrets; mTLS optional in v2.
- Backups: nightly Postgres backups; verify restore quarterly; storage versioning enabled for artifacts.

## Environments
- Dev: mocked Orchestrator/TRiSM/PRISM; local Postgres + object storage emulator.
- Stage: pre-prod with real governance integration; load/perf tests; chaos toggled.
- Prod: locked-down credentials; signed webhooks; audit enforced; feature flags for risky automation (auto-promotion/rollback).
