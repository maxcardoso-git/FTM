# Fine-Tuning Manager (FTM)

External API-first service for model optimization (datasets, evals, fine-tuning, registry, promotions) governed by Orchestrator TRiSM/PRISM.

## Overview
- Service role: executor + registry; governance authority remains Orchestrator.
- v1 provider: OpenAI (SFT, DPO). Schema includes RFT for forward compatibility; multi-provider remains out of scope for v1.
- Persistence: PostgreSQL plus Object Storage; optional vector layer for dedup/retrieval selection.
- Interaction: REST APIs with idempotency keys, async jobs with polling/webhooks, audit emission to Orchestrator.
- Auth: Orchestrator login API (API key service-to-service); mTLS/RBAC planned later.

## Scope and non-goals
- In scope: dataset building/sanitization, eval suite registry and runs, FT job orchestration, model registry, promotions with governance gates, monitoring (scheduled re-evals + regression detection), pricing tracking.
- Out of scope (v1): UI rebuild, acting as policy authority, multi-provider coverage, automated RFT graders, cross-tenant dataset mixing.

## Architecture at a glance
- Style: microservice (API + workers) with queue-backed async jobs.
- Core components: Dataset Builder, Eval Service, FT Job Runner (OpenAI adapter), Model Registry, Promotion Service, Monitoring/Regression checker.
- Integrations: Orchestrator governance/audit, TRiSM sanitizer/scanner, PRISM cost/approvals, ResourceRegistry for storage URIs, optional KB/vector store.
- Observability: OpenTelemetry traces, structured logs, metrics (durations, fail rates, gate denials).
- NFR targets: availability 99.5% (v1), API p95 < 500 ms, status endpoints p95 < 300 ms.

## Governance and security
- Hard gates: datasets must pass TRiSM sanitize before FT; promotions require GovernanceCheck + TRiSM/PRISM; user metadata scanned.
- Data handling: no raw PII; sanitized datasets only; encrypted storage at rest; signed webhooks; full audit trail to Orchestrator.

## Pricing model (v1)
- Token-based estimation per method (SFT/DPO) with provider rates.
- Optional PRISM pre-approval threshold; track estimate vs actual; emit cost events and persist on jobs.

## Repository layout (initial)
- `docs/` — architecture, data model, API, roadmap (added incrementally).
- Service code will be added in subsequent steps (API + workers + adapters).
