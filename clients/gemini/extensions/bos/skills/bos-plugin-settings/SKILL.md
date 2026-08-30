---
name: bos-plugin-settings
description: Read and change typed BOS plugin settings through native client controls or conversation, using authority-scoped cache, confirmed server mutations, bounded recovery, and feedback-ready failures.
---

# BOS Plugin Settings

Use the single root BOS connection. This skill operates
server-owned plugin configuration and the display-safe local replica. It never
edits package files, customer extensions, or provider credentials. The server
resolves the selected subservice and plugin from opaque selectors and canonical
state; the client never authenticates again for that subservice.

Read [references/settings-operation-contract.md](references/settings-operation-contract.md)
before changing a setting or handling an update failure.

## Route before preflight

A broad request for BOS plugin settings, server settings, connection status,
enablement, services, or display properties belongs to `bos-plugin-console`.
Invoke that skill immediately through the root BOS connection. This routing
happens before product customer initialization, plugin-settings initialization,
filesystem access, or settings-cache access, so the response remains an
in-memory status view in the active client.

Continue below only for a **Settings** action on one server-returned plugin or
an unambiguous request to read or change one named plugin property. A specific
field that is required and unset may then invoke the initialization workflow.

## Read

1. Call `bos_get_context`, select the server-marked default interactive role,
   and verify `bos.plugin_settings.read`.
2. Use the returned opaque `cache_scope` and `settings_epoch` with
   `../bos-mcp-client/scripts/plugin-settings-cache.mjs`. Never derive cache
   authority from client settings or request text.
3. On a current cache hit, answer from its confirmed snapshot and pass the
   stored field definitions to the client's native structured-content surface.
4. On a miss or stale entry, use cursor catch-up when the live tools support it;
   otherwise call `bos_get_plugin_settings` with only `context_id` and the
   server-returned plugin selector. Commit the complete validated snapshot with
   `canonical_source: bos_read`, then answer from the committed cache entry.
5. If a required field is `unset` or invalid `partial`, preserve the user's
   request and invoke `bos-plugin-settings-initialization`. Resume the read from
   confirmed cache state after initialization.

Render the server's field order, labels, value types, controls, editability,
reasons, revision, source, and sync time. A boolean renders as a toggle; a
weekly schedule renders as an hours grid when the host supports it. A host
without native controls renders the same structure in conversation.

## Change

An unambiguous prompt naming the property and exact value authorizes that exact
change. A component edit requires its **Apply** action. A sourced or inferred
recommendation requires the user to confirm the displayed draft.

1. Refresh context and live field schema. Validate the candidate against the
   server-returned type and constraints.
2. Call `bos_prepare_plugin_settings` with the latest context, plugin selector,
   base revision, typed candidate, and sanitized evidence descriptors when
   applicable.
3. Bind the authorization to the returned exact diff and draft hash. Ask for
   clarification when the target or normalized value remains ambiguous.
4. Launch one parallel settings mutation worker when the harness supports
   delegated agents. Give it the complete operational context listed in the
   operation contract. The active agent executes the identical worker contract
   when delegation is unavailable.
5. The worker calls `bos_apply_plugin_settings` with the exact draft, revision,
   and current-draft idempotency key. It emits sanitized progress to the parent
   and runs bounded recovery until the result is committed or terminal.
6. Accept success only from `status: committed` or a reconciled committed
   operation. Atomically commit the returned complete snapshot with
   `canonical_source: bos_committed` or `bos_reconciled`.
7. Refresh context and tool discovery when the result changes capabilities,
   then render the confirmed replacement values.

On ordinary success say what changed and show the new confirmed values. When
the server commits and local cache repair fails, report the committed server
value and state that the next read will refresh the cache.

## Failure

Interpret the server's structured error envelope through the operation
contract. Reconcile uncertain mutations before replay. Keep the last confirmed
cache snapshot after failed or indeterminate updates.

For a terminal protocol, server-invariant, or repeated request-shape failure,
return the sanitized code, support reference, attempts, recovery actions,
operation state, and current confirmed value. Prepare a privacy-minimized bug
draft and expose **Report this issue**. Invoke `submit-feedback` only after the
user requests reporting; that skill obtains explicit confirmation before its
mutation.

Never include credentials, tokens, raw authority identifiers, raw MCP payloads,
stack traces, website bodies, or unrelated customer records in progress,
cache, or feedback.
