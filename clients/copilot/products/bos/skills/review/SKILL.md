---
name: review
description: Review Business Operating System platform changes for architecture, tenant isolation, application neutrality, authentication context, PO/GO boundaries, provider scope, tests, migrations, and release readiness. Use for BOS code, package, MCP, plugin, runtime, or cross-application change review.
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

# BOS Review

## Review order

1. Read the controlling architecture and change objective.
2. Inspect the actual diff and validation evidence.
3. Verify ownership across platform, app, client, router, PO, GO, provider, and
   package boundaries.
4. Trace authentication and tenant scope from entry through every side effect.
5. Verify canonical failure behavior for missing or ambiguous state.
6. Check application neutrality and specialization boundaries.
7. Review migration safety, idempotency, rollback, and user-data preservation.
8. Confirm tests cover positive, negative, and repeated-operation behavior.
9. Trace the complete current user journey and reject any dependency on a
   future product, future package composition, or anticipated growth.
10. Report actionable findings with exact file and line evidence.

## Hard gates

- Private operations prove tenant, app, installation, role, and plugin scope.
- Mutations pass through PO orchestration.
- Persistence stays behind GO repositories.
- Clients render server-owned state without inventing app scope.
- Provider credentials and resources belong to the resolved tenant.
- BOS foundations contain no application-only repository assumptions.
- One host-managed BOS OAuth connection serves the user's installed BOS
  subservices. Reject additional BOS logins or registered BOS connections owned
  by Education Center, CRM, Marketing Director, or another subservice plugin.
- The server evaluates subservice, installation, plugin, role, capability,
  provider, and tool scope for every private operation over the BOS connection;
  the live dynamic tool surface itself grants no authority.
- Platform BOS operations never transit a subservice connection.
- Current-product completeness is proven from current components. Future
  products and anticipated growth do not satisfy a present requirement.
- Package builds and installs are deterministic and credential-free.

Return an approval only after all material findings are resolved.
