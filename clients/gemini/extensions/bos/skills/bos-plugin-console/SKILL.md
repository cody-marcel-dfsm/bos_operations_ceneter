---
name: bos-plugin-console
description: Show and manage BOS plugin, connection, enablement, server-settings summary, and display-property status. When a signed-out request needs BOS data, use the protected resource's OAuth challenge to present the active client's native login action, preserve the request through consent, and resume it afterward. Never substitute manual sign-in guidance or local inventory.
---



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

For live `bos-identity-mcp/v2`, first apply [identity-context compatibility](../bos-mcp-client/references/identity-context.md).
Its fresh authorized-context selection and saved-default rules govern this
workflow; single-context grant wording below applies to legacy discovery.
# BOS Plugin Console

Render the BOS Plugin Console directly in the active client's content window.
The interaction is memory-only: never create a report file, execute a packaged
renderer, start a local renderer or service, or persist the returned snapshot.
The console uses only the organization, application, installation, and role
already bound to the active product grant. It performs no client-side authority
selection and creates no console state.

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
the protected MCP resource's HTTP 401 `WWW-Authenticate` resource-metadata
challenge. Let the active client render its native **Sign in**, **Connect**, or
**Authenticate** action for that registered connection. Never replace that
resource-level OAuth challenge with a plugin-install recommendation, external
install page, manual navigation, or local inspection. Preserve the current
request while the customer signs in, refresh live discovery of dynamic
domain-specific MCP services and tooling after consent, call
`bos_get_context`, and continue this same request. Never ask the customer to
repeat the prompt.

## Display

1. Use the BOS platform connection already present in the client. Never directly inspect the local filesystem
   or invoke command-line plugin inventory.
2. Call `bos_get_context` once to revalidate that the OAuth grant binds exactly
   one organization, application, installation, and role. Supply no authority
   selector and stop on any missing or ambiguous scope.
3. Call `bos_list_plugin_services` without organization, role, or context
   arguments. The server derives the exact inventory from the validated grant.
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

- For a missing grant, activate the BOS platform connection's host-native
  **Connect**, **Sign in**, or **Authenticate** action.
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
