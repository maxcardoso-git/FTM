# Migrations

Keep SQL migrations for PostgreSQL schema under this directory.

Guidelines:
- One migration per schema change; include forwards and, when safe, backwards steps.
- Seed status enumerations or reference data via migrations (or application-level validation initially).
- Run migrations in CI before integration tests; apply in deploy pipeline before rolling out services.

Pending:
- Generate initial migration from `docs/data-model.md`.
- Add helper functions for audit insertion if needed (repeatable migrations).
