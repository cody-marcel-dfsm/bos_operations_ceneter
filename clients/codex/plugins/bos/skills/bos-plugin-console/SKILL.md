---
name: bos-plugin-console
description: Show and manage BOS plugin, connection, enablement, and display-property status as an in-memory interactive view inside the active client. Use when a user asks which BOS plugins or services are enabled, connected, ready, or configurable, or asks to connect, enable, or disable one.
---

# BOS Plugin Console

Render the BOS Plugin Console directly in the active client's content window.
The interaction is memory-only: never create a report file, execute a packaged
helper, start a local process or service, or persist the returned snapshot.

## Display

1. Use the installed BOS product connections already present in the client's
   MCP context. Never inspect the local filesystem or invoke client command-line
   plugin inventory for this view.
2. For each available named product connection, call `bos_get_context`, use the
   server-marked default role context, and call `bos_list_plugin_services` with
   only its opaque `context_id`.
3. Keep every product connection as an independent authorization boundary.
   Never substitute one connection for another or send tenant, organization,
   installation, role, credential, or raw plugin identifiers.
4. Pass the server-returned `structuredContent` directly to the client's native
   interactive content surface. The server owns row order, labels, status
   vocabulary, display-safe properties, action availability, and optimistic
   revision.
5. Render one service-status table with these columns in this order:

| Product | Plugin | Enabled | Service | Connection | Properties | Action |
| --- | --- | :---: | --- | --- | --- | --- |

Use the remote MCP App resource associated with the status tool when the client
supports MCP Apps or its compatible native component surface. The component
renders inside the conversation and binds controls to remote MCP tool calls.
If a client exposes structured tool results without interactive components,
render the same table directly in the conversation from the in-memory result
and accept equivalent natural-language actions.

Do not run a local renderer, materialize HTML or Markdown files, download a UI
bundle, open a localhost port, or start a browser or background service. A query
ends when the client has rendered the current in-memory response.

## Connect

A row with a valid connection action displays **Connect**. Selecting it calls
`bos_begin_plugin_service_connection` with the latest opaque `context_id`,
`plugin_ref`, and `service_ref` from that same response.

- For a missing product grant, activate that product connection's host-native
  **Connect**, **Sign in**, or **Authenticate** action.
- For a provider grant, use the BOS-returned URL elicitation or resource link.
  The customer signs in or enters a credential only on the provider or
  BOS-hosted secure page.
- Poll the remote authorization transaction, refresh context and tools, call
  `bos_list_plugin_services` again, and replace the component state in memory.

Never place passwords, API keys, OAuth codes, tokens, authorization URLs, or
provider payloads in chat, client files, or local storage.

## Enable or disable

The **Enabled** toggle and an equivalent user request call
`bos_set_plugin_enabled` through the plugin's owning product connection. Send
the latest opaque `context_id`, `plugin_ref`, complete target boolean, server
revision, and stable idempotency key.

Require the user's explicit toggle or request. The server revalidates
`bos.plugins.update`, scope, revision, and transition, then performs the audited
PO/GO mutation. Claim success only from the completed remote result. Refresh
tools and context, read the replacement snapshot, and update the same client
content surface in memory.

The toggle changes canonical BOS plugin enablement. It never installs, removes,
starts, stops, or edits a plugin package on the user's machine.

## Settings

A row whose server response exposes a valid settings action displays
**Settings**. Selecting it invokes `bos-plugin-settings` with the latest opaque
context and plugin selector from that same product response. The settings skill
uses the server field schema, native controls, authority-scoped cache, and
audited mutation workflow. The console remains memory-only; the packaged cache
helper belongs to the settings workflow and is never executed by a console
status query.

## Client behavior

ChatGPT, Codex, Claude, Copilot, Gemini, and Antigravity use their native
structured-content or MCP-compatible interactive surface. Presentation may
adapt to the client's content window, while row meaning, actions, authority,
and resulting state remain server-owned and identical.

If the active client cannot render a control, preserve the table in the
conversation and accept a direct request such as `Connect Google Calendar for
Class Operations` or `Turn off Review Outreach`. Keep the entire interaction in
the current conversation context.
