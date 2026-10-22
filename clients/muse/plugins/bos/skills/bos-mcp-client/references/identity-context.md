# BOS identity context compatibility — v1

## One BOS identity; OAuth and identity-key parity

One BOS identity login gives the agent access to the organizations, applications,
installations and eligible assigned roles that identity is currently authorized
to use. GPT and Claude authenticate that identity through OAuth; Muse currently
uses one user-issued BOS identity API key. Both methods use the same discovery,
context-selection and per-operation authorization rules. The agent matches an
explicit requested context or the calling plugin's confirmed defaults against
fresh authorized choices, asks for clarification when necessary, and reuses the
same connection when the context changes. Each operation independently checks
current membership, role, capability, plugin consent and provider policy.
Separate BOS identities retain their own logins, credentials and
authority. Provider consent stays with its provider. Existing restricted grants
and integration keys retain their original limits and migration rules.

Multiple valid returned contexts are normal. Apply the selection rules below to
safe labels and fresh handles. An unresolved choice requires clarification;
malformed or denied authority retains its existing fail-closed behavior.
Credentials remain with the host; no skill reads or transfers them.


This versioned compatibility branch applies only when live `bos_get_context`
returns `contract_version: bos-identity-mcp/v2` and the host exposes
`bos_list_context_tools` and `bos_execute`. It takes precedence over legacy
single-grant wording in domain and control-plane workflows. Legacy discovery
retains its exact grant boundary and never gains multi-context authority.

## Setup and customer defaults

Each installed plugin has its own customer-owned preference file managed by
`scripts/customer-preferences.mjs` below macOS Application Support/BOS/plugins,
Windows AppData/BOS/plugins, or Linux XDG config/BOS/plugins. These files live
outside managed plugin caches. Read the calling plugin's file with `read
<plugin-name>` and write it with `save <plugin-name>`. Each contains only
`bos.plugin-customer-preferences/v1`, its matching `plugin_name`, and
`default_context` matching preferences:
`organization_name`, optional `installation_name`, and optional `role_label`.
Each value matches the corresponding safe label in fresh discovery as intent
only. The reader converts an existing inert `role_code` preference to
`role_label` in memory for upgrade compatibility, leaves the existing file
untouched, and still requires an exact fresh label match before use.
No setting grants access, and account changes require fresh authorized matching.
Never read another plugin's default, fall back to it, or copy it as a substitute.
An explicit task-scoped selection replaces the calling plugin's saved fields for
that request and leaves every saved plugin preference unchanged.

During product setup, propose the default from current authorized discovery and
confirmed customer information. Include it in the consolidated recommendation.
Ask once when no confirmed default exists; preserve existing confirmed values.
Confirm installation or role only when needed to resolve multiple contexts.
Use the sole server-returned `is_default` choice when several eligible roles
share the selected organization, application, and installation. A lower-role
selection remains explicit and task-local. Never inspect or infer a privilege
rank. After confirmation, use the helper's
`save <plugin-name>` command with the preference JSON on standard input and
re-read it. Product upgrades preserve this external file. A product-specific
customer overlay may mirror only that same plugin's preference for setup.
Repair conflicting mirrors from that plugin's confirmed value. If only a
confirmed valid overlay mirror exists, restore that plugin's external file after
fresh authorized matching without asking again. Never silently
promote organization display text or a one-request selection to a saved default.

For BOS without a product initializer, establish this preference through
`bos-mcp-client` during setup or the first unscoped business request. Read it in
every ordinary workflow; a valid default needs no repeat organization question.
Control-plane status may use an explicit request without initializing unrelated
product fields. If persistence is unavailable, retain the explicit scope for the
current request and report that saving the default remains incomplete.

For the `bos` plugin only, the reader also accepts the previously confirmed
shared `bos.customer-preferences/v1` file and `bos-client-preferences/v1` file
when the new BOS plugin file is absent. It reads the historical platform-native
`ai.dfsm.bos/client-preferences/v1/preferences.json` path (Windows:
`DFSM/BOS/client-preferences/v1/preferences.json`) or its absolute
`BOS_CLIENT_PREFERENCES_DIR` override. It converts only the confirmed organization
label in memory, leaves the legacy file untouched, and still requires fresh
live authorized matching. Reuse that organization without asking again; resolve
any remaining installation/role ambiguity separately. Invalid or unauthorized
legacy values require repair and never trigger silent fallback. A dependent
plugin never inherits either historical BOS default.

## Resolve and execute

1. Call live `bos_get_context` and retain its authorized contexts in memory.
2. Match the required safe `application_name` and any explicit
   organization/installation/role label first.
   An explicit context request replaces all saved context fields for that task.
   Otherwise match the calling plugin's confirmed default. With no default, use an exact
   previously established scope for the pending request or the sole authorized
   context; establish the persistent default separately during setup.
3. Use `scripts/context-selection.mjs`'s `resolveContext` when executable, or
   apply its exact matching rules. Fresh choices contain only an opaque
   `context_handle`, safe organization/application/installation/role labels,
   and `is_default`. Reject raw IDs, ranks, capabilities, or additional fields.
   Labels allow trim and case normalization. Require one exact context; when
   several roles remain for one organization/application/installation, use the
   sole returned `is_default` choice unless the user explicitly selected a
   lower role. Clarify duplicate labels, multiple installations, or multiple
   defaults. Never choose by list order, privilege rank, a person's name, or
   probing business records across organizations. A removed
   or unauthorized default produces `default_context_unavailable`; ask for an
   authorized replacement, without silent fallback or changing grants.
4. Pass only the fresh returned `context_handle` to `bos_list_context_tools`.
   Require its response to bind the same handle. Native names and their count
   describe that catalog only. Follow current `app.describe`, `service.describe`
   and advertised operation-contract resources through the same authenticated
   connection to discover the requested operation independently, including
   deletion. Preserve advertised availability, provider readiness and host
   executability separately. A top-level CRUD description supplies no specific
   operation contract; an absent native name supplies no evidence that a
   described HTTPS operation is absent.
5. For a freshly advertised native discovery/control, compatibility or resource
   delivery tool, call `bos_execute` with that handle, its exact `tool_name`, and
   schema-validated `arguments`. The business-read compatibility exceptions
   remain exactly `feedback.recommendations.query`, `journeys.notifications.read`
   and `journeys.state.read`, with their existing scope and schemas. Preserve
   existing native embedded-resource delivery. Never convert a Describe
   operation key into `tool_name` or route another described business operation
   through this dispatcher. Keep raw org/app/install/role IDs out of business
   arguments and verify the returned context before using its result.
6. For a discovered deterministic HTTPS operation, use its complete current
   execution contract: method, URI, context binding and any declared transport.
   Compatible contacts with absent or null `execution.transport` retain their
   validated method, URI and context binding; report that field as unspecified.
   Invoke through the existing BOS adapter only when the current host supplies
   authenticated HTTP on the same BOS connection. Copy its published static
   `execution.context_header` and put the same selected opaque handle in that
   header. The required value is `X-BOS-Context-Handle`; never construct another
   header, put the handle in the business body, or add OAuth, token, retry,
   idempotency, execution, or journey state. When the required host capability
   is absent, preserve completed discovery and report the exact unavailable
   authenticated operation as `host_capability_unavailable`. A packaged adapter
   or an acceptance-host helper establishes no native host capability. Keep
   credentials inside the host; construct no alternate transport.
7. Use an operation's declared `journey_runtime` through its current journey
   contract. Apply step 6's deterministic HTTP binding to raw BOSL registration
   and to every returned journey `start`, `complete`, `step`, `failed`, and
   `state` action. Returned actions carry no context field; the BOS transport
   adapter binds the fresh handle only while invoking them. Preserve
   header-free behavior for legacy/v1 actions.
8. Preserve the selected scope with approvals, versions, caches, server-owned
   operation references, and exact returned recovery actions. Refresh handles after context changes; never persist handles as
   defaults. Keep concurrent requests independent. A denial or missing operation
   never permits another role or organization as a workaround.
   The server reauthorizes every operation; discovery and preferences confer
   no authority.

An unavailable optional plugin-profile setup surface leaves that setup
incomplete. It does not block an independently advertised ready operation whose
live contract declares no dependency on it. Operation-specific readiness and
explicit denials remain binding. Never invent setup tools or recurse into setup.

No reconnect is required solely to select another currently authorized context.
Missing/expired/revoked identity authorization retains native BOS recovery.
Provider recovery and all mutation confirmation/receipt rules remain in force.
