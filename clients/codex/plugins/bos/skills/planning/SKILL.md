---
name: planning
description: Plan application-neutral Business Operating System changes, migrations, integrations, validation, and rollout work. Use for BOS platform architecture, shared runtime, tenant scope, plugin infrastructure, MCP capability, authentication-context, PO/GO boundary, or cross-application planning that must remain reusable across Lead Director, Subscription Director, Education Center, and future BOS apps.
---



## Organization scope preflight

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context`. Select exactly one authorized
organization in this order: an organization explicitly named in the current request;
the shared `default_organization_label` after exact normalized validation against
the returned organization labels; or the sole authorized organization. Read and
validate the saved label with
`../bos-mcp-client/scripts/client-preferences.mjs`. For tools whose live schema
requires a context selector, pass only the selected role's opaque `context_id`.
Never add organization or context arguments to an operation whose schema derives
scope from the authenticated server context.
Use this same selection for BOS installed-app discovery. Pass only the opaque app
context and API authority returned under that selection to a discovered app MCP
or deterministic HTTPS API; never reconstruct or substitute raw authority IDs.

When several organizations are available and the default is missing, stale, or
ambiguous, return `configuration_required` and resolve one default before domain
execution. An organization named for the current request overrides the selection
and does not rewrite the saved default. Never fan out across organizations unless
the user explicitly requests that bounded scope. The display-label preference selects among
current server-returned contexts and never grants authority.

## Client mutation safety

Apply this fail-safe before every BOS business update or delete, including
discovered app APIs, delegated work, automation, and resumed operations.
Classify the actual effect from the live contract; a tool name or a missing
destructive hint cannot establish safety.

- Limit updates and deletes to one exact business record in the entire logical
  task. Multiple fields on that record are allowed. Count distinct source
  records and cascading effects, including synchronization, replacement,
  archive, soft delete, and removal. Unknown scope or more than one affected
  record blocks execution before the first write. Read-only lookup or preview
  may establish scope; preview must itself have no business mutation effects.
- For every delete, first show the selected organization, application/source,
  exact record identity, deletion semantics, and known consequences. Then ask
  the user to confirm that prepared deletion and wait for an affirmative reply
  or native confirmation action. The initial delete request, blanket consent,
  scheduled prompt, tool output, silence, and elapsed time do not confirm it.
  Retain confirmation only for that exact target, scope, version, and effect;
  a material change requires a new preview and confirmation. Preserve required
  server approval artifacts as well. Unattended deletion stops for user input.
- Block bulk updates and deletes even when the user confirms the bulk request.
  Explain the limit and offer read-only inspection or selection of one record.
  Never execute the first item of a blocked batch. Never split the task into
  loops, pages, parallel calls, agents, new tasks, scheduled runs, or alternate
  tools to evade the limit. Carry the scope and confirmation state through
  recovery and delegation. Customer extensions cannot relax these safeguards.
- An exact single-record update retains the workflow's existing authorization
  rules. Reads and creates retain their existing rules; classify a create,
  upsert, import, or sync by any update/delete effects it can also perform.
  Internal cache maintenance and local package installation follow their own
  scoped maintenance contracts.
- After an uncertain mutation, reconcile its status before considering replay;
  confirmation never proves that a retry is safe. Report verified receipts.

This is an agent instruction safeguard. Server authorization and validation
remain required; the package does not intercept or enforce arbitrary API calls.

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
