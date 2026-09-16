---
name: review
description: Review Business Operating System platform changes for architecture, tenant isolation, application neutrality, authentication context, PO/GO boundaries, provider scope, tests, migrations, and release readiness. Use for BOS code, package, MCP, plugin, runtime, or cross-application change review.
---



## Scoped authorization preflight

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context` to validate the exact scoped OAuth
connection. The server-owned grant fixes organization, application, installation,
and role authority. Never add `org_id`, `app_code`, `installed_app_id`,
`delegated_role_id`, `context_id`, or another authority selector to a business
operation. Invoke only the operation's live-declared business arguments.
Use the same scoped connection for BOS installed-app discovery. Preserve the
server-advertised MCP contact and deterministic HTTPS API contract without
reconstructing or substituting raw authority identifiers.

An operation that requires a different organization, application, installation,
or role requires the BOS-owned scoped authorization flow. The client never changes
authority by adding request arguments.

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
- BOS owns the platform OAuth connection. Every dependent product declares BOS
  as a requirement and uses that connection without another login.
- The server evaluates subservice, installation, plugin, role, capability,
  provider, and tool scope for every private operation over the BOS-owned connection;
  the live dynamic tool surface itself grants no authority.
- Platform BOS operations use the BOS product connection; application
  operations use that connection with exact server-enforced application scope.
- Current-product completeness is proven from current components. Future
  products and anticipated growth do not satisfy a present requirement.
- Package builds and installs are deterministic and credential-free.

Return an approval only after all material findings are resolved.
