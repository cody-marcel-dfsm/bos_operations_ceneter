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
7. Validate the complete current user journey without relying on a future
   product, future package, or assumed product growth.
8. Define dependency-ordered implementation, migration, and rollback tasks.
9. Include focused unit, contract, integration, and client validation.
10. Identify unresolved platform capabilities as implementation blockers.

## Platform invariants

- Resolve explicit tenant, organization, application, installation, role, and
  plugin scope before private execution.
- Keep BOS platform behavior application-neutral.
- Give the user one host-managed BOS authentication connection. Subservice
  plugins contribute capabilities behind that connection and never require an
  additional BOS login.
- Let the server evaluate installed services, plugin enablement, roles,
  capabilities, provider readiness, and tool authorization on every private
  operation. Treat the live dynamic tool surface as discovery and schemas,
  never authority.
- Keep platform BOS traffic on the BOS connection. Never use Education Center,
  CRM, Marketing Director, or another subservice as a platform transport.
- Let app graphs own business behavior after BOS establishes app context.
- Keep web and mobile clients as render shells for server-owned state.
- Route mutations through PO orchestration and GO persistence.
- Use managed provider credentials scoped to the selected installation.
- Fail closed on missing, malformed, or ambiguous canonical state.
- Preserve user and customer data through deterministic, recoverable migration.
- Treat future products and anticipated growth as optional context, never as a
  dependency that satisfies a current product requirement.

## Output

Return architecture facts, affected surfaces and owners, dependency-ordered
tasks, validation and rollout gates, documentation changes, risks, blockers,
and rollback conditions.
