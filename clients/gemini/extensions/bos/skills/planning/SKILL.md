---
name: planning
description: Plan application-neutral Business Operating System changes, migrations, integrations, validation, and rollout work. Use for BOS platform architecture, shared runtime, tenant scope, plugin infrastructure, MCP capability, authentication-context, PO/GO boundary, or cross-application planning that must remain reusable across Lead Director, Subscription Director, Education Center, and future BOS apps.
---

# BOS Planning

## Workflow

1. Identify the requested behavior and the owning BOS surface.
2. Classify each touched surface as platform, app graph, public page, client
   shell, API, MCP capability, plugin, PO, GO, provider, or background job.
3. State the platform invariants that must remain true.
4. Inspect the relevant source, contracts, tests, and current runtime evidence.
5. Select native platform primitives before proposing new abstractions.
6. Separate foundation work from application specialization.
7. Define dependency-ordered implementation, migration, and rollback tasks.
8. Include focused unit, contract, integration, and client validation.
9. Identify unresolved platform capabilities as validation tasks.

## Platform invariants

- Resolve explicit tenant, organization, application, installation, role, and
  plugin scope before private execution.
- Keep BOS platform behavior application-neutral.
- Let app graphs own business behavior after BOS establishes app context.
- Keep web and mobile clients as render shells for server-owned state.
- Route mutations through PO orchestration and GO persistence.
- Use managed provider credentials scoped to the selected installation.
- Fail closed on missing, malformed, or ambiguous canonical state.
- Preserve user and customer data through deterministic, recoverable migration.

## Output

Return architecture facts, affected surfaces and owners, dependency-ordered
tasks, validation and rollout gates, documentation changes, risks, blockers,
and rollback conditions.
