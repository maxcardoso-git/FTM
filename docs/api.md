# API surface and lifecycle flows

All endpoints are REST. Authentication uses Orchestrator-issued API keys (service-to-service); v1 requires HTTPS and signed webhooks. Support `Idempotency-Key` header on all mutating endpoints.

## Auth and headers
- `Authorization: Bearer <orchestrator_api_key>`
- `Idempotency-Key: <uuid>` (required for POST/PATCH)
- `X-FTM-Signature: <hmac>` on incoming webhooks (FTM-signed)

## Core resources (v1)
### Datasets
- `POST /datasets` — build dataset from traces
  - Body: `{ tenant_id, project_id, assistant_id?, source: { type: "orchestrator_traces", filters: {...} }, output_format, dedup: { exact: true, semantic: true? }, vectorize?: true }`
  - Gates: GovernanceCheck(TRiSM sanitize) before job enqueue.
- `GET /datasets/{id}` — status, metadata, storage_uri, sanitized flags.
- `POST /datasets/{id}/rebuild` — rebuild with same config and new lineage entry.

### Eval suites and runs
- `POST /eval-suites` — create suite `{ name, selection_strategy: "static"|"vector_retrieval", kb_collection?, policy_profile?, description?, cases? }`
- `GET /eval-suites/{id}`
- `POST /eval-runs` — trigger eval
  - Body: `{ tenant_id, project_id, eval_suite_id, model_ref: { type: "base_model"|"ft_model_version"|"provider_model_id", value }, overrides?, cost_cap_usd? }`
  - Flow: governance gate (if policy profile) → enqueue eval job → metrics persisted → audit emit.
- `GET /eval-runs/{id}` — status, metrics, artifacts links.

### Fine-tuning jobs
- `POST /ft-jobs`
  - Body: `{ tenant_id, project_id, method: "SFT"|"DPO"|"RFT", provider: "openai", base_model, dataset_id, hyperparams?, cost_threshold_usd?, prism_pre_approval?: true }`
  - Gates: dataset.sanitized=true; GovernanceCheck(action=ft.job.create); optional PRISM pre-approval vs estimate.
- `GET /ft-jobs/{id}`
- `POST /ft-jobs/{id}/cancel`

### Model registry
- `POST /model-versions` — register model (used for external provider IDs too)
  - Body: `{ provider, provider_model_id, ft_job_id?, eval_summary?, governance_summary? }`
- `GET /model-versions/{id}`
- `GET /model-versions?project_id=...&status=...`

### Promotions
- `POST /promotions`
  - Body: `{ model_version_id, target: { type: "assistant"|"project"|"global", value }, min_eval_score, notes? }`
  - Gates: TRiSM scan on notes; governance check action=model.promote; PRISM approval if cost/impact flagged; verify latest eval score meets threshold.
- `GET /promotions/{decision_id}`
- `POST /promotions/{decision_id}/rollback` — restore previous pointer.
- Production pointers:
  - `GET /production-pointers?target_type=...&target_value=...`
  - `PATCH /production-pointers/{id}` (admin) for emergency overrides.

### Monitoring
- `POST /monitoring/re-evals` — schedule re-eval job with suite and target model ref.
- `GET /monitoring/re-evals/{id}`

## Webhooks (outbound from FTM)
Headers: `X-FTM-Event`, `X-FTM-Signature`, `X-FTM-Delivery`
- `dataset.created` — `{ dataset_id, status, storage_uri, sanitized }`
- `eval.completed` — `{ eval_run_id, status, metrics, trism_report_ref }`
- `ft_job.updated` — `{ ft_job_id, status, provider_job_id, cost_estimate_usd, cost_actual_usd? }`
- `model.promoted` — `{ model_version_id, target, decision, production_pointer }`
- Retries: exponential backoff; DLQ after N failures; delivery status query endpoint `GET /webhooks/deliveries/{id}`.

## Lifecycle flows
- Dataset build: validate → governance sanitize gate → enqueue → worker dedup + sanitize → persist + audit → emit webhook.
- Eval run: lookup suite → governance if policy_profile → enqueue → worker executes cases, grades, applies TRiSM scoring → persist metrics/artifacts → audit + webhook.
- FT job: validate dataset sanitized + gate → cost estimate + optional PRISM pre-approval → submit provider job → poll/webhook ingest → persist result/costs → update model registry → emit audit/webhook.
- Promotion: fetch latest eval summary → check min score + TRiSM + PRISM/GovernanceCheck → atomic pointer swap → audit + webhook → optional rollback endpoint if later regression triggers.

## Idempotency expectations
- Duplicate `POST` with same `Idempotency-Key` returns existing resource reference.
- Provider job reuse: if `provider_job_id` already recorded for dataset/model pair, treat as idempotent (no duplicate submission).
- Promotion pointer updates are atomic; repeated requests return same decision and pointer state.

## Error handling
- 400 validation errors; 401/403 for auth/governance failures; 409 for gate denials (e.g., dataset not sanitized); 429 for rate limits; 5xx for transient issues (retry via Idempotency-Key).
