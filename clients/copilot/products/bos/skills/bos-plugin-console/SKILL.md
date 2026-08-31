---
name: bos-plugin-console
description: Show and manage BOS plugin, connection, enablement, server-settings summary, and display-property status as an in-memory interactive view inside the active client. Use when a user asks for BOS plugin or server settings broadly, which plugins or services are enabled, connected, ready, or configurable, or asks to connect, enable, or disable one.
---

# BOS Plugin Console

Render the BOS Plugin Console directly in the active client's content window.
The interaction is memory-only: never create a report file, execute a packaged
renderer, start a local renderer or service, or persist the returned snapshot.
The organization-selection preflight below may execute only the packaged
`bos-mcp-client/scripts/client-preferences.mjs` helper's read operation. That
read validates an existing display-label preference and creates no console
state.

Treat broad requests such as “show the server settings for the BOS plugins,”
“show plugin settings,” or “which BOS services are connected?” as console
status requests. Run this console directly. Do not invoke a product customer
initializer, plugin-settings initializer, or settings cache for these requests.
Only a **Settings** action on one returned plugin, an unambiguous request for
all settings of one unambiguously named plugin, or a request for one named
plugin property enters the separate typed settings workflow.
A named-plugin request resolves its opaque selector from the live service
inventory and opens the settings surface directly. It does not render the
console as an intermediate step.

## Display

1. Use the single installed BOS connection already present in the client's MCP
   context. Never directly inspect the local filesystem or invoke client
   command-line plugin inventory for this view. The governed preference-helper
   read described below is the sole local selection operation.
2. Call `bos_get_context` once through BOS and deduplicate its returned
   organization labels. Resolve exactly one organization before any console
   data call:
   - an organization explicitly named in the current request takes precedence
     after it matches exactly one returned label;
   - otherwise run the packaged `client-preferences.mjs read` operation with
     all current returned organization labels on standard input and use its
     exact `default_organization_label` when it returns `state: current`;
   - otherwise use the sole returned organization;
   - when several organizations remain and the preference is missing, stale,
     malformed, or ambiguous, return `configuration_required` and stop.
3. Within the selected organization, use its unique server-marked default role
   context and call `bos_list_plugin_services` with only that opaque
   `context_id`. Never enumerate service data for every accessible
   organization by default.
4. Treat inability to load the live console as a live-console failure. Never
   substitute a prior-task response, typed-settings cache, last-confirmed
   settings table, local plugin inventory, or multi-organization summary. A
   tool refresh or reconnect repeats this same organization selection before
   the console call.
5. Let the server evaluate every product and plugin row from canonical
   installation, enablement, role, capability, and provider state. Never send
   tenant, organization, installation, role, credential, or raw plugin
   identifiers, and never call through a subservice connection.
6. Pass the server-returned `structuredContent` directly to the client's native
   interactive content surface. The server owns row order, labels, status
   vocabulary, display-safe properties, action availability, and optimistic
   revision.
7. Render one service-status table with these columns in this order:

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

- For a missing BOS grant, activate the root BOS connection's host-native
  **Connect**, **Sign in**, or **Authenticate** action. Subservice rows never
  request another BOS login.
- For a provider grant, use the BOS-returned URL elicitation or resource link.
  The customer signs in or enters a credential only on the provider or
  BOS-hosted secure page.
- Poll the remote authorization transaction, refresh context and tools, call
  `bos_list_plugin_services` again, and replace the component state in memory.

Never place passwords, API keys, OAuth codes, tokens, authorization URLs, or
provider payloads in chat, client files, or local storage.

## Enable or disable

The **Enabled** toggle and an equivalent user request call
`bos_set_plugin_enabled` through the BOS connection. Send
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

A request such as “show me the Automation Plugin settings” invokes the same
settings workflow directly. Resolve exactly one matching server-returned plugin
row, pass its opaque selector in memory, and render the typed settings surface.

## Client behavior

ChatGPT, Codex, Claude, Copilot, Gemini, and Antigravity use their native
structured-content or MCP-compatible interactive surface. Presentation may
adapt to the client's content window, while row meaning, actions, authority,
and resulting state remain server-owned and identical.

If the active client cannot render a control, preserve the table in the
conversation and accept a direct request such as `Connect Google Calendar for
Class Operations` or `Turn off Review Outreach`. Keep the entire interaction in
the current conversation context.
