# BOS plugin service console

## Purpose

The BOS Plugin Console is an in-memory interactive view inside the active
client's content window. It displays BOS products, server-enabled plugins,
service connections, and display-safe properties and allows an authorized user
to connect, enable, or disable them.

A console request creates no report, cache, HTML file, Markdown file, local
database, process, listener, browser session, or machine-local service. The BOS
server returns structured state through the product's existing remote MCP
connection, and the client renders that response directly from memory.

## Ownership and boundaries

- The active client's existing context identifies which named BOS product
  connections are available. The console does not inspect local plugin folders
  or invoke a client command-line inventory.
- Each operational product retains its independent named MCP resource and OAuth
  grant. Aggregation in the conversation never creates a broad administrative
  connection or transfers authority between products.
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
| Product connection | Client host and BOS OAuth | The current client can call the named BOS resource. |
| BOS plugin enabled | BOS service | The plugin may expose its authorized capabilities for this installation. |
| Service connected | BOS credential service | The scoped provider grant is ready for that plugin service. |

Changing one state never silently changes another or starts or stops software
on the user's machine.

## In-memory read contract

Each eligible runtime product exposes `bos_list_plugin_services` to an
authenticated context carrying `bos.plugins.read`:

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
with the same authenticated product scope. Responses contain no credentials,
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
packaged `bos-plugin-settings` workflow for that row's owning named product
connection. The settings workflow renders server-described typed fields,
supports equivalent prompt edits, and maintains its separate authority-scoped
confirmed-snapshot cache. The console itself remains an in-memory view and
stores no settings state.

Clients with an equivalent native structured-content surface may render the
same response through that surface. A client without interactive component
support renders the same table in the conversation and accepts equivalent
natural-language actions. Every path remains in memory and uses the same remote
tools and authority.

## Connection action

`bos_begin_plugin_service_connection` accepts the latest `context_id`,
`plugin_ref`, and `service_ref`. The PO verifies `bos.plugins.connect`, current
plugin enablement, provider binding, and exact installation scope before
starting a bounded remote authorization transaction. It returns the established
URL-mode elicitation or sanitized resource-link result. After verification, the
client refreshes tools and replaces the in-memory console snapshot.

An unavailable product OAuth grant activates only that product connection's
host-native **Connect**, **Sign in**, or **Authenticate** action.

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
affected tool manifests; the client refreshes tools and context before replacing
the in-memory snapshot.

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
- A status request performs no filesystem write, local process launch, port
  bind, browser launch, or local service start.
- Identical canonical state returns identical ordered `structuredContent`.
- Missing product OAuth exposes only that product's host-owned connection
  action and never falls through to another connection.
- Disabled plugins remain visible and expose none of their domain tools.
- Connect rejects stale, foreign, disabled, or unauthorized selectors.
- Enablement rejects missing capability, stale revision, illegal transition,
  cross-tenant scope, and conflicting idempotency reuse.
- Successful actions refresh tools, context, and the same in-memory view.
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
