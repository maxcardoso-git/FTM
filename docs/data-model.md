# Data model and storage

Primary store is PostgreSQL. Artifacts (datasets, eval outputs, FT logs) live in Object Storage. Optional vector layer supports deduplication and eval selection.

## Relational schema (v1)
```sql
create table ftm_datasets (
  dataset_id uuid primary key,
  tenant_id uuid not null references tenants(tenant_id),
  project_id uuid not null references projects(project_id),
  assistant_id varchar(255),
  status varchar(50) not null check (status in ('building', 'pending_sanitization', 'ready', 'blocked', 'failed')),
  output_format varchar(50) not null check (output_format in ('jsonl_chat', 'jsonl_prompt_completion')),
  sanitized boolean default false,
  sanitized_by_trism boolean default false,
  trism_report jsonb,
  storage_uri varchar(255),
  record_count int,
  token_estimate int,
  vectorized boolean default false,
  created_at timestamptz default current_timestamp,
  updated_at timestamptz default current_timestamp,
  orchestrator_audit_id uuid,
  governance_decision_id uuid
);
create index on ftm_datasets (tenant_id, project_id, assistant_id, status, created_at);

create table ftm_eval_suites (
  eval_suite_id uuid primary key,
  tenant_id uuid not null references tenants(tenant_id),
  project_id uuid not null references projects(project_id),
  name varchar(255),
  description text,
  selection_strategy varchar(50) not null check (selection_strategy in ('static', 'vector_retrieval')),
  kb_collection varchar(255),
  policy_profile varchar(255),
  created_at timestamptz default current_timestamp,
  updated_at timestamptz default current_timestamp
);
create index on ftm_eval_suites (tenant_id, project_id, name);

create table ftm_eval_runs (
  eval_run_id uuid primary key,
  tenant_id uuid not null references tenants(tenant_id),
  project_id uuid not null references projects(project_id),
  eval_suite_id uuid not null references ftm_eval_suites(eval_suite_id),
  model_ref_type varchar(50) not null check (model_ref_type in ('base_model', 'ft_model_version', 'provider_model_id')),
  model_ref_value varchar(255),
  status varchar(50) not null check (status in ('queued', 'running', 'completed', 'failed', 'blocked')),
  metrics_json jsonb,
  trism_report jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  orchestrator_audit_id uuid,
  governance_decision_id uuid,
  created_at timestamptz default current_timestamp
);
create index on ftm_eval_runs (tenant_id, project_id, eval_suite_id, status, started_at);

create table ftm_ft_jobs (
  ft_job_id uuid primary key,
  tenant_id uuid not null references tenants(tenant_id),
  project_id uuid not null references projects(project_id),
  provider varchar(50) not null check (provider in ('openai')),
  method varchar(50) not null check (method in ('SFT', 'DPO', 'RFT')),
  base_model varchar(255),
  dataset_id uuid not null references ftm_datasets(dataset_id),
  status varchar(50) not null check (status in ('queued', 'running', 'completed', 'failed', 'blocked', 'canceled')),
  provider_job_id varchar(255),
  result_json jsonb,
  cost_estimate_usd numeric,
  cost_actual_usd numeric,
  prism_tracked boolean default false,
  orchestrator_audit_id uuid,
  governance_decision_id uuid,
  created_at timestamptz default current_timestamp,
  updated_at timestamptz default current_timestamp
);
create index on ftm_ft_jobs (tenant_id, project_id, provider, status, created_at);

create table ftm_model_versions (
  model_version_id uuid primary key,
  tenant_id uuid not null references tenants(tenant_id),
  project_id uuid not null references projects(project_id),
  provider varchar(50) not null check (provider in ('openai')),
  provider_model_id varchar(255),
  ft_job_id uuid not null references ftm_ft_jobs(ft_job_id),
  status varchar(50) not null check (status in ('candidate', 'approved', 'production', 'retired')),
  eval_summary_json jsonb,
  governance_summary_json jsonb,
  orchestrator_audit_id uuid,
  governance_decision_id uuid,
  created_at timestamptz default current_timestamp,
  updated_at timestamptz default current_timestamp
);
create index on ftm_model_versions (tenant_id, project_id, provider, status);

create table ftm_promotions (
  decision_id uuid primary key,
  tenant_id uuid not null references tenants(tenant_id),
  project_id uuid not null references projects(project_id),
  model_version_id uuid not null references ftm_model_versions(model_version_id),
  target_type varchar(50) not null check (target_type in ('assistant', 'project', 'global')),
  target_value varchar(255),
  decision varchar(50) not null check (decision in ('promoted', 'rejected', 'blocked')),
  reasons_json jsonb,
  trism_pass boolean,
  prism_pass boolean,
  production_pointer_json jsonb,
  orchestrator_audit_id uuid,
  governance_decision_id uuid,
  created_at timestamptz default current_timestamp
);
create index on ftm_promotions (tenant_id, project_id, model_version_id, created_at);

create table ftm_production_pointers (
  pointer_id uuid primary key,
  tenant_id uuid not null references tenants(tenant_id),
  project_id uuid not null references projects(project_id),
  target_type varchar(50) not null check (target_type in ('assistant', 'project', 'global')),
  target_value varchar(255),
  active_model_version_id uuid references ftm_model_versions(model_version_id),
  previous_model_version_id uuid references ftm_model_versions(model_version_id),
  orchestrator_audit_id uuid,
  governance_decision_id uuid,
  updated_at timestamptz default current_timestamp
);
create index on ftm_production_pointers (tenant_id, project_id, target_type, target_value);
```

## Notes and constraints
- Foreign keys enforce lineage (datasets → ft_jobs → model_versions → promotions) and tenancy/project boundaries via `tenants` and `projects`.
- `model_ref_value` supports base model, internal model version, or provider model ID depending on `model_ref_type`.
- TRiSM reports are stored as JSONB for datasets and eval runs; raw artifacts stay in object storage.
- Consider partitioning `ftm_eval_runs` and `ftm_ft_jobs` for scale; indexes above cover typical filters.

## Storage layout
- Object Storage prefixes:
  - `datasets/{tenant}/{project}/{dataset_id}/dataset.jsonl`
  - `evals/{tenant}/{project}/{eval_run_id}/artifacts/*`
  - `ft_jobs/{tenant}/{project}/{ft_job_id}/provider_output.json`
- Optional vector store collections:
  - `datasets_dedup_{tenant}_{project}`
  - `eval_cases_{tenant}_{project}` for selection strategies.

## Migration strategy
- Keep SQL migrations under `migrations/` (not yet generated) with repeatable views/functions for audit helpers.
- Seed reference data for status enums via migrations; enforce allowed values at app layer until database enum decisions are finalized.
- Apply migrations in CI before tests; lockstep versioning with API deployments.

## Data retention
- Retain audit references indefinitely; allow configurable TTL for raw eval artifacts and intermediate FT logs.
- Keep production pointer history by retaining `previous_model_version_id` references; do not hard delete model versions—use `retired` state.
