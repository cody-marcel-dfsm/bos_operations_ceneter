---
name: po-go-boundary-enforcement
description: Enforce BOS Router-to-PO-to-GO-to-database boundaries for runtime tools, reconciliation, metrics, transitions, plugins, migrations, and every data mutation path. Use when designing, implementing, or reviewing BOS operations that read or change tenant-scoped state.
---

# BOS PO/GO Boundary Enforcement

## Boundary

- Router: parse requests, authenticate actors, and shape responses.
- PO: validate scope, orchestrate workflows, enforce idempotency, acquire locks,
  execute side effects, and write audits.
- GO: perform repository operations and SQL for one explicit scope.
- Database: enforce constraints and persist canonical state.

## Mutation workflow

1. Authenticate the actor.
2. Resolve and validate organization, app, installation, role, and plugin.
3. Validate the complete plan and idempotency key.
4. Acquire the operation lock when concurrent execution is possible.
5. Call GO repositories through PO orchestration.
6. Emit canonical events and metrics.
7. Record the operation audit.
8. Return a deterministic result.

## Gates

- Keep raw runtime SQL inside GO repositories.
- Keep mutations outside routers, scripts, and agent instructions.
- Validate every provider account and credential against resolved tenant scope.
- Fail closed on missing canonical sources, ambiguous scope, illegal
  transitions, or absent audit paths.
- Test state, history, metrics, repeated execution, and cross-tenant rejection.
