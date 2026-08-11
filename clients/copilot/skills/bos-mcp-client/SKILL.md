---
name: bos-mcp-client
description: Operate a packaged application MCP resource group, including scope resolution, live tool discovery, transport recovery, and provider authorization recovery.
---

# BOS MCP Client

Use this skill for client-side application resource-group operations.
Each installed runtime product owns one declared bearer binding for its named
connection. The triggered domain skill selects that product connection and its
organization-scoped principal; BOS derives canonical execution scope on the
server. Credentials never fall through from another product connection.

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

- Discover and use the installed product's configured BOS MCP connection.
- If BOS is absent from the callable tool manifest, inspect the active client's
  plugin and MCP registration immediately. Repair or reinstall the configured
  local product and bind its declared product credential through the
  supported secret mechanism. Preserve every other installed product
  connection. Restore only the immutable
  `/mcp/apps/{application-name}/{skill-group-name}` package route for every
  application runtime product, then verify that named server is registered.
  Packages own both human-readable route segments.
  Never discover, prompt for, repair,
  or materialize a URL from `installed_app_id` or customer settings.
  Do not stop at diagnosing client registration.
- If the transport, stream, or MCP session closes, reconnect or reinitialize
  that same configured connection, rediscover its live tools, call
  `bos_get_context` again, and retry the interrupted read-only operation once.
- Preserve the user's original request across recovery and continue it
  automatically. Never ask the user to reconnect BOS, resend the request, or
  start a new task.
- For a mutation whose completion is unknown after a disconnect, reconcile by
  its operation or idempotency identifier before deciding whether to resume.
  Never replay an uncertain mutation blindly.
- Ask for user action only when the client presents a secure provider sign-in
  or credential-entry surface that requires the user's direct interaction.
- When the host requires a fresh session to load repaired tools, create or
  continue that session through the client's task controls when available and
  carry the original request into it. State the host boundary only when the
  client offers no programmatic continuation mechanism.
- If bounded recovery fails, report the attempted recovery, sanitized error
  category, completed partial work, and the precise client or service repair
  required. Keep the current request active whenever the client supports
  recovery within the same task.

## Runtime workflow

1. Use the connection URL shipped by the package. Treat its application name
   and skill-group name as immutable package configuration, never as tenant
   authority or user-selectable settings.
2. On an application skill-group connection, do not send `org_id`, `app_code`,
   `installed_app_id`, or `delegated_role_id`; BOS derives execution scope from
   the authenticated principal and installed-app group enablement.
3. Fail closed when context is absent or ambiguous.
4. Use the triggered product skill to choose its matching named connection.
   For example, Education Center operations use `education-center`; Video Ads operations
   use `video-ads`. The endpoint selects a tool group; it never selects an
   organization or another bearer credential.
5. Authenticate the selected connection with exactly one package-declared
   product credential. Keep it out of chat, tool arguments, package files, and
   logs. Never reuse, fall back to, or test another product's credential.
   If BOS rejects the credential after reconnecting once, report that the
   client credential configuration requires repair.
6. When a domain call returns `authorization_required`, preserve its original
   operation ID and follow the returned authorization type automatically:
   - OAuth: open the returned URL, let the customer sign in directly with the
     provider, and poll `bos_get_authorization_status` with the exact scope.
   - Secret input: open the returned short-lived BOS HTTPS
     credential-collection URL. Let the customer submit the value directly to
     BOS and poll the sanitized transaction status.
7. Verify recovered authorization and call `bos_resume_operation` once. Stop
   if authorization or that single retry fails.

Provider readiness and authorization are local to the selected organization,
installation, and plugin. A missing provider credential can block only the
affected provider operation. It never removes another product's tools, changes
another connection's authentication state, or blocks another product's build,
installation, or release gate.

Domain skills interpret their workflows and execute only through their matching
configured product MCP. BOS derives actor, tenant, organization, application,
installation, role, plugin, and capability scope from that connection's bearer
principal and canonical server records.

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
   query. When the plan returns gaps, request exactly those intervals plus
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
