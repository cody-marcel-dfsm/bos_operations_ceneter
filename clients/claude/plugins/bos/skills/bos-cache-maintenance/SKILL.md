---
name: bos-cache-maintenance
description: Inspect, refresh, invalidate, and maintain authority-scoped BOS query caches and cached MCP source maps. Use automatically before federated or expensive source reads and when a user asks about cache health, freshness, refresh, or clearing cached data.
---



## Scoped authorization preflight

First apply the versioned identity-context workflow in `bos-mcp-client`.
For live `bos-identity-mcp/v2`, resolve explicit request scope or the saved
customer default against fresh authorized contexts, discover tools for the
selected handle, and execute with that same handle. This branch governs
context selection throughout this skill, including older scoped-grant wording.
A missing operation never permits changing organization or role to find it.
The following single-context rules apply only to legacy scoped-grant discovery.

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

- Limit updates and deletes to one exact conceptual business record in the
  entire logical task. Multiple fields on that record are allowed. That record
  may resolve to one through five explicit source-record targets in one
  discovered service request. Count distinct conceptual records and cascading
  effects, including synchronization, replacement, archive, soft delete, and
  removal. Unknown scope, more than five source targets, or more than one
  conceptual record blocks execution before the first write. Read-only lookup
  or preview may establish scope; preview must itself have no business mutation
  effects.
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
- An exact one-conceptual-record update retains the workflow's existing
  authorization rules. Reads and creates retain their existing rules; classify
  a create, upsert, import, or sync by any update/delete effects it can also
  perform. Internal cache maintenance and local package installation follow
  their own scoped maintenance contracts.
- After an uncertain mutation, invoke only the exact service-returned bodyless
  state action and service-declared timing. Never replay the mutation or
  construct a status route, selector, retry schedule, or reconciliation
  request. Confirmation never proves that another mutation is safe. Report
  verified receipts.

This is an agent instruction safeguard. Server authorization and validation
remain required; the package does not intercept or enforce arbitrary API calls.

# BOS Cache Maintenance

Use `bos-mcp-client/scripts/document-cache.mjs` after validating the live opaque
BOS context. Read
[references/maintenance-contract.md](references/maintenance-contract.md) before
an explicit cache inspection, invalidation, or stale-refresh operation.

## Invocation preflight

For every domain invocation, inspect only the manifest-derived source map and
datasets selected by that request:

1. Apply the product's client-owned maximum-age policy by source and dataset.
2. Treat live context, authorization, provider-binding, manifest, or source
   revision changes as invalidation evidence.
3. Use `current` cache data within policy. For `refresh_required`, query the
   provider conditionally or incrementally through one fixed upper bound and
   commit only after complete retrieval.
4. Abort a failed or partial refresh. Exclude the stale source under the default
   `allow_stale_on_error: false` policy.
5. Return cache/live origin, ISO update time, local display time, age, maximum
   age, and coverage with every source result.

Use `inspect` for metadata without document bodies. Use `invalidate` for one
exact authority/source/query identity. Authority revocation cleanup may remove
all indexes owned by that revoked authority through the managed host lifecycle.

Cache maintenance changes data reuse only. It grants no server authority and
never supplies data to a context that fails current authorization.

For Agent-Driven Custom Journey authoring contracts, use
`bos-mcp-client/scripts/journey-contract-cache.mjs`. Keep `app.describe` live.
Allow exact linked-resource, selected structured plugin/service, current
application, and complete current-authority invalidation only. A reconnect,
authority-partition change, selected context change, descriptor-token change,
freshness expiry, or explicit maintenance request prevents reuse.
