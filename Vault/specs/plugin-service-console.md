# BOS plugin service console

## Purpose

The BOS Plugin Console is an in-memory interactive view inside the active
client's content window. It displays BOS products, server-enabled plugins,
service connections, and display-safe properties and allows an authorized user
to connect, enable, or disable them.

A console request creates no report, cache, HTML file, Markdown file, local
database, renderer process, listener, browser session, or machine-local
service. The BOS server returns structured state through the root BOS MCP
connection, and the client renders that response directly from memory.

Before the remote console query, the shared BOS client performs its standard
organization-selection preflight. It calls `bos_get_context`, validates an
explicit organization override or reads the existing
`default_organization_label` through the packaged client-preferences helper,
and selects exactly one returned organization before its default role. This
read creates no console snapshot or cache. A missing, stale, malformed, or
ambiguous preference with several available organizations returns
`configuration_required`. The console never substitutes a previous task's
response, typed-settings cache, local inventory, or cross-organization summary
when the live query cannot run.

Broad user language including “plugin settings,” “server settings for BOS
plugins,” connection status, enablement, services, or display properties routes
to this console before any product customer-settings or plugin-settings
initialization preflight. The request neither reads nor creates a customer
settings overlay. A user enters the cached typed-settings workflow by selecting
**Settings** for one returned plugin, requesting all settings of one
unambiguously named plugin, or naming one plugin property. A direct named-plugin
request resolves the opaque selector through this live inventory and opens the
settings surface without rendering the console as an intermediate view.
The product initialization coordinator also reuses the same canonical service
inventory before plugin-settings discovery, scoped to the selected default or
explicit organization. It presents unresolved connection actions one at a time
and does not render or query other organizations by default.

## Ownership and boundaries

- The active client's BOS context identifies which installed subservices and
  plugins are available. The console does not inspect local plugin folders
  or invoke a client command-line inventory.
- The root BOS plugin owns the single MCP resource and OAuth grant. The server
  evaluates each subservice row against canonical installation, enablement,
  role, capability, and provider state without creating another login.
- The BOS service owns organization, installation, role, plugin enablement,
  capability grants, provider readiness, display-safe properties, revisions,
  mutations, and audit records.
- The router authenticates and shapes responses. A PO validates capability,
  revision, transition, idempotency, and provider scope and writes the audit.
  GOs read and persist one explicit canonical scope.
- The client content component owns only ephemeral presentation state such as
  the selected row or expanded properties. It never becomes canonical state.

The view distinguishes three independent states:

| State | Owner | Meaning |
| --- | --- | --- |
| BOS connection | Client host and BOS OAuth | The current client can call the root BOS resource. |
| BOS plugin enabled | BOS service | The server may authorize the plugin's operations for this installation. |
| Service connected | BOS credential service | The scoped provider grant is ready for that plugin service. |

Changing one state never silently changes another or starts or stops software
on the user's machine.

The initialization coordinator treats `connected` and `not_required` rows as
ready, preserves disabled rows, and advances one enabled
`connection_required` row at a time through its current server-returned action.
It pauses with `connection_required` for user-owned sign-in, consent, secure
credential entry, or explicit deferral. It refreshes context, operation status, and the
canonical service inventory after each completed action before proceeding to
plugin settings. It never enables a plugin implicitly or stores connection
state in a local receipt.

## In-memory read contract

The root BOS resource exposes `bos_list_plugin_services` to an authenticated
context carrying `bos.plugins.read`:

```json
{
  "context_id": "opaque server-issued context"
}
```

The server revalidates the context, sorts the canonical snapshot, and returns
it as MCP `structuredContent`:

```json
{
  "schema_version": "1",
  "revision": "opaque optimistic revision",
  "rows": [
    {
      "plugin_ref": "opaque request-scoped selector",
      "service_ref": "opaque request-scoped selector",
      "product": "Education Operation Center",
      "plugin": "Class Operations",
      "enabled": true,
      "service": "Google Calendar",
      "connection_state": "connected",
      "can_connect": false,
      "can_update_enablement": true,
      "properties": {
        "Calendar access": "Read and write"
      }
    }
  ]
}
```

Allowed connection states are `connected`, `connection_required`,
`bos_sign_in_required`, `not_required`, and `unavailable`. `plugin_ref`,
`service_ref`, and `revision` are opaque, short-lived selectors usable only
with the same authenticated BOS context. Responses contain no credentials,
tokens, authorization URLs, provider payloads, raw database IDs, customer
records, or cross-tenant counts.

The server orders rows by stable package key, plugin key, service key, and
property key. The client renders that order directly. A query-time timestamp is
absent, so identical canonical state produces identical structured content.

## Interactive content contract

The status tool associates its response with a remotely served MCP App UI
resource through `_meta.ui.resourceUri`. The resource uses the MCP Apps UI MIME
type `text/html;profile=mcp-app`, runs inside the client's content surface, and
receives the tool result through the MCP Apps bridge. The BOS remote service
serves this resource; the client package never downloads, builds, or executes a
local UI bundle.

The component renders:

| Product | Plugin | Enabled | Service | Connection | Properties | Action |
| --- | --- | :---: | --- | --- | --- | --- |

The **Enabled** control is a toggle backed by the enablement mutation. The
**Action** cell displays **Connect** only when the row supplies a valid action.
The component calls remote MCP tools through the host bridge and replaces its
ephemeral state from the completed tool response.

When a row exposes configurable settings, its **Settings** action invokes the
packaged `bos-plugin-settings` workflow through the BOS connection. The
settings workflow renders server-described typed fields,
supports equivalent prompt edits, and maintains its separate authority-scoped
confirmed-snapshot cache. The console itself remains an in-memory view and
stores no settings state.

A direct named-plugin settings request uses the same server-returned selector.
In Codex Agent Harness, the resulting settings table and each editable inline
control are client-native and memory-only. The workflow creates no HTML or
Markdown file, report, renderer, localhost process, browser session, or
separate UI service.

Clients with an equivalent native structured-content surface may render the
same response through that surface. A client without interactive component
support renders the same table in the conversation and accepts equivalent
natural-language actions. Every path remains in memory and uses the same remote
tools and authority.

A client has rendered the console only when the actual row values are visible.
A generic tool-result card labeled **Structured output**, a collapsed payload,
raw JSON, schema metadata, or `[object Object]` is not a console surface. When a
remote MCP App or native component is not actually mounted, the client expands
the values into the conversation immediately. Nested properties become labeled
lines; empty values become **Not configured**; safe URLs, display-safe email
addresses, and phone numbers become clickable links. Native **Connect** and
**Settings** actions are real buttons and **Enabled** is a real toggle. A
conversation-only fallback presents exact natural-language actions and never
claims that printed labels are clickable controls.

## Connection action

`bos_begin_plugin_service_connection` accepts the latest `context_id`,
`plugin_ref`, and `service_ref`. The PO verifies `bos.plugins.connect`, current
plugin enablement, provider binding, and exact installation scope before
starting a bounded remote authorization transaction. It returns the established
URL-mode elicitation or sanitized resource-link result. After verification, the
client refreshes context, operation status, and the in-memory console snapshot.

An unavailable BOS OAuth grant activates the root BOS connection's host-native
**Connect**, **Sign in**, or **Authenticate** action. A subservice row never
requests another BOS login.

An authenticated `bos_get_context` or
`bos_begin_plugin_service_connection` call proves that the root BOS grant is
valid for the returned provider transaction. An API-key recovery URL therefore
renders the provider credential collector directly. If it instead renders,
redirects to, or offers root BOS sign-in, the client does not follow that action
or launch BOS authentication. It polls the existing transaction once, preserves
the pending operation, and reports `provider_recovery_identity_boundary` when
the provider surface remains absent. A separate BOS browser cookie never
controls provider readiness.

## Enablement mutation

`bos_set_plugin_enabled` accepts:

```json
{
  "context_id": "opaque server-issued context",
  "plugin_ref": "opaque request-scoped selector",
  "enabled": true,
  "revision": "opaque optimistic revision",
  "idempotency_key": "stable operation key"
}
```

The PO requires `bos.plugins.update`, validates the target state and revision,
rejects cross-scope or illegal transitions, applies the change through a GO,
and records actor, acting role, before/after state, operation ID, and result.
Repeated idempotency keys reconcile to the original result. Success invalidates
affected context and operation status; the client refreshes both before replacing
the in-memory snapshot. It refreshes the static catalog only when the server
schema also changed.

This mutation changes canonical BOS plugin enablement only. It never installs,
removes, enables, disables, starts, stops, or edits a local client package.

## Cross-client requirements

ChatGPT, Codex, Claude, Copilot, Gemini, and Antigravity use their native
structured-content, component, elicitation, resource-link, and action surfaces.
The client adapter may change visual presentation to fit its content window.
It never changes row meaning, action semantics, authority, mutations, or
resulting BOS state.

The BOS Plugin Console skill contains instructions and UI metadata only. It
contains no query-time script, renderer, executable, local server, or cache.

## Validation gates

- Console skill packages contain no executable or query-time renderer.
- A status request performs no filesystem write, local renderer launch, port
  bind, browser launch, or local service start. Its sole packaged-helper
  operation is the read-only default-organization validation preflight.
- The organization preflight validates the shared default display label
  against the current BOS context before calling `bos_list_plugin_services`.
- An unqualified request queries only the validated default organization; an
  explicit organization override applies only to that request.
- Live-console failure never renders cached settings or prior
  cross-organization results as the current console.
- Identical canonical state returns identical ordered `structuredContent`.
- Missing BOS OAuth exposes the root BOS host-owned connection action.
- Disabled plugins remain visible, and the server denies their domain operations
  at `tools/call`; their static operation descriptors remain discoverable.
- Connect rejects stale, foreign, disabled, or unauthorized selectors.
- Enablement rejects missing capability, stale revision, illegal transition,
  cross-tenant scope, and conflicting idempotency reuse.
- Successful actions refresh context, operation status, and the same in-memory
  view. They refresh tool discovery only for a server-schema change.
- A generic **Structured output** tool card never satisfies the visible console
  requirement; actual values and available actions are rendered readably.
- Structured content and UI payloads contain no secrets, raw authority IDs,
  customer records, or volatile authorization URLs.

## Rollout

1. Ship the instructions-only console skill in every BOS client package.
2. Implement and contract-test the three remote tools in each eligible product
   group behind `bos.plugins.read`, `bos.plugins.connect`, and
   `bos.plugins.update`.
3. Serve the versioned MCP App resource from the BOS remote MCP service and
   associate it with the status tool.
4. Validate native in-conversation rendering and actions in ChatGPT, Codex,
   Claude, Copilot, Gemini, and Antigravity.
5. Enable read access first, connection actions second, and enablement mutations
   after audit and cross-tenant tests pass.

Rollback disables the three capabilities and remote component while preserving
existing plugin configuration and provider grants. No client-side runtime
artifact requires cleanup.
