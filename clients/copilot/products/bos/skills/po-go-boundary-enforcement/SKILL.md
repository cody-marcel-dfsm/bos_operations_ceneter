---
name: po-go-boundary-enforcement
description: Enforce BOS Router-to-PO-to-GO-to-database boundaries for runtime tools, reconciliation, metrics, transitions, plugins, migrations, and every data mutation path. Use when designing, implementing, or reviewing BOS operations that read or change tenant-scoped state.
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
