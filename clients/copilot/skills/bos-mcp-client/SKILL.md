---
name: bos-mcp-client
description: Operate a packaged application MCP resource group, including scope resolution, live tool discovery, transport recovery, and provider authorization recovery.
---


## Product first-run preflight

Before performing this skill's workflow, resolve the installed product root and
validate its customer-owned `config/customer-settings.json` against
`config/customer-settings.template.json`. Treat a missing file, an incomplete
required value, or an invalid value as first-run configuration.

When first-run configuration is detected, invoke `education-center-customer-initialization`
immediately. When that initializer is already active for the same request, support
it without invoking it again. Preserve the user's original request while
initialization runs.
Complete the product's host-managed BOS authentication before asking any settings
question. If direct sign-in is required, ask only for that action and resume
initialization automatically afterward. Do not perform the original workflow or
substitute generic customer values while configuration remains unresolved. After
the user accepts the consolidated recommendation and the initializer writes and
revalidates `config/customer-settings.json`, reload the effective settings and
resume the original request automatically.

# BOS MCP Client

Use this skill for client-side application resource-group operations.
Each installed runtime product owns one named remote MCP resource. A Claude
account or organization Web connector declares it and exposes the persistent
host-managed **Connect** action; ChatGPT/Codex authorizes
it through the registered app's host-managed OAuth 2.1 connection.
Other supported clients use the product adapter declared by their generated
package until they receive an equivalent OAuth migration.
The triggered domain skill selects the matching product connection; BOS derives
canonical execution scope from the validated grant. Authorization never falls
through from another product connection.

Developer and operator work is outside this skill when the request explicitly
targets BOS source code, deployment infrastructure, Cloud Run, GCP Secret
Manager, an approved administrative provisioning path, or another
developer-controlled service surface. Perform that work through the owning
repository workflow and the developer's existing infrastructure identity. A
credential being created for a BOS MCP client does not make its server-side
provisioning a client runtime operation.

## Connection ownership

The agent owns the BOS MCP client lifecycle for the duration of the user's
request.

Read [references/runtime-continuation-contract.md](references/runtime-continuation-contract.md)
before recovering authorization, refreshing a tool manifest, or continuing a
stateful mutation workflow.

- Discover and use the installed product's configured BOS MCP connection.
- If BOS is absent from the callable tool manifest, inspect the active client's
  plugin and runtime binding immediately. Repair or reinstall the configured
  local product and restore its declared authorization connection. For Codex,
  verify the required registered app binding; for Claude, verify the package's
  account-connector metadata and the matching Web connector under
  **Customize → Connectors**, then use its persistent **Connect** action. When a
  private installation lacks that connector, add it with the exact name and URL
  from the generated `CONNECTORS.md`; never reconstruct or modify the
  package-owned route. Preserve every other installed product connection.
  Restore only the immutable
  `/mcp/apps/{application-name}/{skill-group-name}` package route for every
  application runtime product, then verify that named server is registered.
  Packages own both human-readable route segments.
  Never discover, prompt for, repair,
  or materialize a URL from `installed_app_id` or customer settings.
  Do not stop at diagnosing client registration.
- If the transport, stream, or MCP session closes, reconnect or reinitialize
  that same configured connection, rediscover its live tools, call
  `bos_get_context` again, and retry the interrupted read-only operation once.
- Refresh the callable tool manifest immediately after OAuth reconnection,
  permission or role changes, plugin install/update, capability enablement, or
  an explicit server capability refresh. Discard stale schemas and validate the
  next call only against the refreshed manifest.
- Preserve the user's original request across recovery and continue it
  automatically. Never ask the user to reconnect BOS, resend the request, or
  start a new task.
- Preserve the sanitized continuation envelope across every refresh, including
  pending draft identities, approval state, operation identities, and
  idempotency keys. Never place tokens, credentials, raw authority IDs, raw
  provider payloads, or customer records in that envelope.
- For a mutation whose completion is unknown after a disconnect, reconcile by
  its operation or idempotency identifier before deciding whether to resume.
  Never replay an uncertain mutation blindly.
- Ask for user action only when the host presents BOS Connect/Sign in or a
  secure provider sign-in or credential-entry surface that inherently requires
  the user's direct interaction. Never ask the user to paste a BOS key.
- When the host requires a fresh session to load repaired tools, create or
  continue a same-task session through the client's task controls when
  available, carry the continuation envelope into it, rediscover tools, verify
  context, and resume automatically. State the host boundary only when the
  client offers no programmatic continuation mechanism.
- If bounded recovery fails, report the attempted recovery, sanitized error
  category, completed partial work, and the precise client or service repair
  required. Keep the current request active whenever the client supports
  recovery within the same task.

## Runtime workflow

Apply provider recovery as one request interceptor around every BOS domain
`tools/call`. Domain skills describe the operation; they never own, opt into,
or bypass authentication recovery. Preserve the pending call before execution
and inspect its sanitized result before producing a final answer.

1. Use the immutable connection URL recorded by the package and declared by
   the product's native host adapter. Treat its application name
   and skill-group name as immutable package configuration, never as tenant
   authority or user-selectable settings.
2. On an application skill-group connection, do not send `org_id`, `app_code`,
   `installed_app_id`, or `delegated_role_id`; BOS derives execution scope from
   the authenticated principal and installed-app group enablement. Call
   `bos_get_context`, use the server-marked default role context, and pass only
   its opaque `context_id` to domain tools. When the user explicitly requests
   another available role, use that role's opaque context for the request.
3. Fail closed when context is absent or ambiguous.
4. Use the triggered product skill to choose its matching named connection.
   For example, Education Center operations use `education-center`; Video Ads operations
   use `video-ads`. The endpoint selects a tool group; it never selects an
   organization or another authorization grant.
5. Authenticate a selected Claude account-level Web connector through its
   persistent **Connect** control, and a ChatGPT/Codex connection
   through its registered app. Both use a host-managed
   OAuth grant. Other clients use only the generated product
   adapter declared for that client. Keep access tokens, refresh tokens,
   authorization codes, bearer values, and grant metadata out of chat, tool
   arguments, package files, and logs. Never reuse or fall back to another
   product's authorization. If BOS rejects a desktop OAuth grant after
   reconnecting once, invoke the host's Connect/Sign in flow and resume once
   after it succeeds.
6. When a domain call returns `authorization_required`, preserve its original
   operation ID and activate the returned secure authorization path immediately
   in the active request. Use the host's native URL-mode elicitation when it is
   available; otherwise present the returned resource link as the next action.
   The host obtains the customer's consent before opening the browser.
   - OAuth: open the returned provider URL, let the customer sign in directly
     with the provider, and poll `bos_get_authorization_status` with the exact
     recovery token.
   - API key: open the returned short-lived BOS HTTPS credential-collection
     URL. For Calimatic, this BOS page asks for the Calimatic portal URL and API
     key. The customer submits them directly to BOS; the model and MCP client
     never receive either value. Poll the sanitized transaction status.
7. Poll and verify recovered authorization, then call `bos_resume_operation`
   once without asking the user to resubmit the request. Stop
   if authorization or that single retry fails.

For an explicit request to connect or authenticate a provider, call
`bos_get_context` and invoke the exact server-returned recovery `next_action`
for that provider. Do not substitute setup instructions, a dashboard route, or
a request for the user to report completion. The same interceptor owns Gmail
OAuth, Calimatic API-key collection, and every future provider authorization
kind returned by BOS.

Provider readiness and authorization are local to the selected organization,
installation, and plugin. A missing provider credential can block only the
affected provider operation. It never removes another product's tools, changes
another connection's authentication state, or blocks another product's build,
installation, or release gate.

Domain skills interpret their workflows and execute only through their matching
configured product MCP. BOS derives actor, tenant, organization, application,
installation, role, plugin, and capability scope from that connection's
validated OAuth grant and canonical server records.

## Role-aware execution

Treat role names and capabilities returned by BOS as descriptions of
server-owned authority. Client prompts and arguments never create authority.

1. Call `bos_get_context` before the first domain operation and after an
   authorization, membership, or role-capability change.
2. Group role entries by organization and installed app. Use the entry marked
   `is_default: true` unless the user explicitly requests another available
   role.
3. Select a role using only its opaque `context_id`. Never send a role name or
   delegated-role value as authority.
4. Confirm the requested operation appears in that context and is invocable.
   When it is absent, explain that the selected role lacks the capability and
   stop before calling the domain tool.
5. Preserve the selected context for related calls in the request. An explicit
   lower-role request changes the context for that request only.

The server re-resolves membership and capabilities on every call. Refresh
context once after a denial or missing context, then treat the repeated server
result as authoritative.

For role administration, call `bos_list_role_capabilities` only when the
selected role carries `bos.roles.read`; it returns role intent, authority rank,
capabilities, editability, and revision. Call `bos_update_role_capabilities`
only when the user explicitly requests a change, using the exact context,
target role, complete replacement capability list, and revision from that read.
The selected role must also carry `bos.roles.update`. Treat success as a
server-audited mutation recording the authenticated actor, acting role, target
role, and before/after capabilities; never claim success when the server does
not return the completed update. After success, refresh `bos_get_context`. On a
revision conflict, read the current configuration and have the user resolve any
material difference before retrying.

## Shared local document cache

Use the packaged `scripts/document-cache.mjs` helper for every reusable
document or document-like read, including files, messages, full threads,
events, enrollments, leads, and provider evidence. The helper resolves one
OS-user cache root shared by all BOS-family products and clients. Keep its
authority indexes separate while allowing identical immutable document
versions to share the content-addressed object store. Read
[references/document-cache-protocol.md](references/document-cache-protocol.md)
before invoking the helper.

After `bos_get_context` validates the live request authority, include its
server-derived organization, installation, delegated role, application, and
this product's skill-group name in the cache authority. Include the exact
authenticated account identity for a separately connected read-only source.
Use digested cache keys in diagnostics.

For each logical source query:

1. Choose a stable source, resource kind, account, and selector. Keep the time
   window outside the selector so overlapping date windows share coverage.
2. Capture one fixed refresh upper bound and call the helper's `begin` operation
   through JSON on standard input. Pass document bodies through standard input
   only; keep them out of command arguments, temporary repository files, and
   diagnostics.
3. When the plan is `current`, generate from the cache without a source content
   query. When a configured maximum age produces `refresh_required`, perform a
   conditional or incremental refresh and exclude the stale source after a
   failed refresh under the default policy. When the plan returns gaps, request exactly those intervals plus
   changes after its cursor through the fixed upper bound. Use provider cursors,
   `modified_after`, conditional versions or ETags, or a bounded versioned
   snapshot. For a cold plan, one bounded snapshot initializes both coverage
   and the change watermark. Call `read` after `begin` when the provider needs
   cached resource versions for conditional requests. Follow every page and
   preserve deletion tombstones.
4. When the plan is `busy`, wait for the bounded lease, then call `begin` again
   and use the completed shared result. This makes concurrent identical work
   single-flight across plugins and client processes.
5. Call `commit` once with the complete normalized change set, tombstones, next
   cursor, and coverage. The helper atomically updates objects, coverage,
   watermark, and `sync_completed_at`. Call `abort` after a failed or partial
   retrieval so the previous committed watermark remains authoritative.
6. Call `read` and generate the requested outcome from the covered cache state.

Use `inspect` for cache health metadata without document bodies and
`invalidate` for one exact authority/source/query identity. Report origin,
`sync_completed_at`, local update time, human-readable age, and configured
maximum age with every freshness-governed result.

Treat query coverage as `[from, through)` and change catch-up as
`(after, through]`. Normalize only the minimum-necessary reusable fields into
cached payloads. Exclude raw message bodies, attachment bytes, unrelated notes,
credentials, and secrets unless the user's request explicitly requires that
source artifact and its provider policy permits local caching.

For a named file or thread, use its stable provider resource identity and cached
version for conditional validation. Fetch the body only when the provider
reports a new version. The initial request treats the full bounded interval or
current named resource as its gap. Snapshot-only sources refresh the complete
bounded snapshot only after conditional source-version validation reports a
change. Record that limitation until their tools expose an incremental cursor
or per-resource conditional read.

The cache supplies read evidence. Execute mutations through the canonical BOS
or provider path, then let a subsequent incremental catch-up reconcile the
local read state. Apply the full cache contract in
`Vault/specs/shared-local-document-cache.md` when working in this repository.
