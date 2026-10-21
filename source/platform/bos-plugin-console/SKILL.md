---
name: bos-plugin-console
description: Show and manage BOS plugin, connection, enablement, server-settings summary, and display-property status. When a signed-out request needs BOS data, use bos-mcp-client's host-supported identity recovery, preserve the pending request, and resume it afterward. Never substitute local inventory for authenticated results.
metadata:
  version: "1.0.3"
  requires: "{\"bos-mcp-client\":\"1.0.3\",\"bos-plugin-settings\":\"1.0.3\"}"
---


An explicit sign-out request routes directly to `bos-mcp-client`'s
[current-connection sign-out](../bos-mcp-client/references/logout.md) workflow.
It terminates without rendering or refreshing this protected console.
For an authenticated console, offer **Sign out of BOS** as a conversational
action when the platform's live discovery advertises `bos_logout`. Use the
host's supported follow-up affordance, or show the prompt “Sign out of BOS.”
Keep the native host's authentication controls grounded in observed UI.

For other requests with live `bos-identity-mcp/v2`, first apply [identity-context compatibility](../bos-mcp-client/references/identity-context.md).
Its fresh authorized-context selection and saved-default rules govern this
workflow; single-context grant wording below applies to legacy discovery.
# BOS Plugin Console

Render the BOS Plugin Console directly in the active client's content window.
The interaction is memory-only: never create a report file, execute a packaged
renderer, start a local renderer or service, or persist the returned snapshot.
Use the requested or confirmed default context from fresh server-authorized
organization/application/installation/eligible-role choices. The server validates
that selected context and its current permissions for every operation. Business
arguments carry no raw authority selector. The console creates no local state.

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

When BOS business data is unavailable because the customer is signed out, use
`bos-mcp-client` recovery for the current host and preserve the pending request.
On OAuth-capable hosts, use the protected resource's OAuth challenge to present
the native login action, preserve the request through consent, and resume it afterward.
Use the protected MCP resource's HTTP 401 `WWW-Authenticate` resource-metadata
challenge. Let the active client render its native **Sign in**, **Connect**, or
**Authenticate** action for that registered connection. Never replace that
resource-level OAuth challenge with a plugin-install recommendation, external
install page, manual navigation, or local inspection. Preserve the current
request while the customer signs in, refresh live discovery of dynamic
domain-specific MCP services and tooling after consent, call
`bos_get_context`, and continue this same request. Never ask the customer to
repeat the prompt.

Muse uses its existing identity API key in private host credential configuration
and its key-specific recovery. Receive no key in chat or package files. Changing
an authorized organization or app alone requires no new BOS login or key.

## Display

1. Use the BOS platform connection already present in the client. Never directly inspect the local filesystem
   or invoke command-line plugin inventory.
2. Call `bos_get_context` once to validate the identity and resolve the requested
   or confirmed default context from fresh authorized choices. Clarify unresolved
   safe-label choices. Multiple valid contexts are normal; switching among them
   reuses the same BOS login/key. Reject invalid discovery or denied authority.
3. Invoke the selected context's advertised plugin-service inventory operation
   through its exact current contract. Legacy direct tools keep their declared
   argument shape. The server derives and revalidates the selected inventory.
4. Treat inability to load the live console as a live-console failure. Never
   substitute a prior-task response, typed-settings cache, last-confirmed
   settings table, local plugin inventory, or multi-organization summary. A
   tool refresh or reconnect repeats scoped-grant validation before
   the console call.
5. Let the server evaluate every product and plugin row from canonical
   installation, enablement, role, capability, and provider state. Never send
   tenant, organization, installation, role, credential, or raw plugin
   identifiers, and call through the BOS platform connection.
6. Use the server-returned `structuredContent` to populate the visible console.
   A mounted MCP App or native interactive component is the preferred surface.
   A generic tool-result card labeled **Structured output** is unsupported
   presentation, so render the complete readable table directly in the
   conversation instead. The server owns row order, labels, status vocabulary,
   display-safe properties, action availability, and optimistic revision.
7. Render one service-status table with these columns in this order:

| Product | Plugin | Enabled | Service | Connection | Properties | Action |
| --- | --- | :---: | --- | --- | --- | --- |

Use the remote MCP App resource associated with the status tool when the client
supports MCP Apps or its compatible native component surface. The component
renders inside the conversation and binds controls to remote MCP tool calls.
If a client exposes structured tool results without interactive components,
render the same table directly in the conversation from the in-memory result
and accept equivalent natural-language actions.

The visible console shows the actual values. Expand property objects into
labeled lines within their row; render empty values as **Not configured** and
booleans as **Enabled** or **Disabled**. Render safe URLs as descriptive
clickable Markdown links and display-safe email addresses and phone numbers as
`mailto:` and `tel:` links. Never show raw JSON, `[object Object]`, a schema, or
**Structured output** in place of the values.

Every server-allowed interactive action is an actual host control: **Connect**
and **Settings** are buttons, and **Enabled** is a toggle. When the host cannot
mount those controls, show the readable table followed by exact conversational
actions for only the actions the server allows. Do not describe printed labels
as clickable controls.

Do not run a local renderer, materialize HTML or Markdown files, download a UI
bundle, open a localhost port, or start a browser or background service. A query
ends when the client has rendered the current in-memory response.

## Connect

A row with a valid connection action displays **Connect**. Selecting it calls
`bos_begin_plugin_service_connection` with the latest `plugin_ref` and
`service_ref` from that same response.

- For missing BOS identity proof, follow `bos-mcp-client` recovery for the host:
  native **Connect**, **Sign in**, or **Authenticate** on OAuth-capable hosts;
  Muse's private identity-key configuration and key-specific recovery. Preserve
  the pending request and receive no key in chat.
- For a provider grant, use the BOS-returned URL elicitation or resource link.
  The customer signs in or enters a credential only on the provider or
  BOS-hosted secure page. Validate that the opened surface matches the returned
  authorization kind. When the BOS connection is authenticated, an API-key
  recovery URL must show the provider credential collector. If it instead
  renders, redirects to, or offers product MCP sign-in, never click or follow that
  action and never launch or restart product authentication. Preserve the
  transaction, poll its status once, and return
  `provider_recovery_identity_boundary` if the correct provider surface remains
  absent.
- Poll the remote authorization transaction, refresh context or operation
  status, call
  `bos_list_plugin_services` again, and replace the component state in memory.

Never place passwords, API keys, OAuth codes, tokens, authorization URLs, or
provider payloads in chat, client files, or local storage.

## Enable or disable

The **Enabled** toggle and an equivalent user request call
`bos_set_plugin_enabled` through the BOS connection. Send
the latest `plugin_ref` and complete target boolean plus only any additional
semantic fields required by the current discovered schema. Supply no client
idempotency key, revision, retry state, or reconciliation decision.

Require the user's explicit toggle or request. The server revalidates
`bos.plugins.update`, scope, revision, and transition, then performs the audited
PO/GO mutation. Claim success only from the completed remote result. Refresh
context, read the replacement snapshot, and update the same client
content surface in memory.

The toggle changes canonical BOS plugin enablement. It never installs, removes,
starts, stops, or edits a plugin package on the user's machine.

## Settings

A row whose server response exposes a valid settings action displays
**Settings**. Selecting it invokes `bos-plugin-settings` with the latest plugin
selector from that same product response. The settings skill
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
