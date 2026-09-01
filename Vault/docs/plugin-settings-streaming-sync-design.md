# Plugin settings streaming and sync design

All settings reads and mutations use the authenticated BOS connection. The
server evaluates the selected subservice, installation, plugin, role, and
capability for each opaque plugin selector.

## Status

- **Status:** approved; packaged client contract implemented, remote BOS service
  contract pending in the owning service repository
- **Owner:** BOS platform for the generic contract; each installed application
  and plugin for its setting definitions and business validation
- **Clients:** Codex, ChatGPT, Claude, Copilot, Gemini CLI, Antigravity, and
  future Agent Harness clients
- **Canonical state:** BOS service
- **Local state:** authority-scoped, display-safe cache of confirmed canonical
  snapshots

## Outcome

Every installed BOS plugin can expose typed, editable settings through the
active Agent Harness client. The client can discover a sourced recommendation,
show it beside the current value, collect one explicit user confirmation, apply
the confirmed change through the BOS connection, and
keep an authority-scoped local snapshot synchronized with canonical service
state.

Broad requests for plugin settings, server settings, connection state,
enablement, services, or display-safe properties are inventory requests. They
route to the memory-only BOS Plugin Console before this typed-settings workflow
and never trigger customer-settings initialization or cache access. This
workflow starts from one plugin's **Settings** action, a request for all
settings of one unambiguously named plugin, or an unambiguous request for one
named plugin property. A direct named-plugin request resolves its opaque
selector from the live service inventory and opens settings without rendering
the console as an intermediate surface.

Business hours are the reference workflow. The client reads the organization
website established in its customer-owned client settings, retrieves the
currently published hours during client initialization, presents those hours
with source and freshness evidence, accepts corrections, and applies the
complete confirmed schedule to the plugin installation. The completed server
response updates the local cache and completes that initialization stage.

## Design principles

1. The BOS service owns canonical plugin settings, revisions, validation,
   history, and audit records.
2. The authenticated BOS connection and server-issued context establish
   tenant, organization, application, installation, role, and plugin scope.
3. Plugin definitions own setting meaning, constraints, defaults, and
   recommendation strategies. The platform supplies common types, interaction,
   persistence, synchronization, and conflict handling.
4. Agent Harness clients render server-described fields with native controls
   and can provide equivalent conversational interaction.
5. Every mutation requires explicit user intent bound to an exact draft and
   optimistic base revision. A prompt such as “change Trial Hours to 4–7 PM”
   supplies that intent when the target and value are unambiguous. A sourced
   recommendation requires a separate confirmation. A widget edit supplies
   intent when the user selects its **Apply** action.
6. The local cache contains confirmed display-safe canonical snapshots. It
   serves fast reads and reconnection continuity. Live authority validation is
   required before every private read or mutation.
7. MCP Streamable HTTP carries requests and server notifications. Snapshot
   reads and revision cursors provide deterministic recovery when a host does
   not expose live resource notifications.
8. Provider credentials and secret settings remain in BOS-managed credential
   storage and use existing secure authorization flows.
9. Plugin-setting discovery is a standard client-initialization stage. Runtime
   requests consume its confirmed results and resume that stage when required
   settings remain incomplete.

## Surface ownership

| Surface | Responsibility |
| --- | --- |
| Agent Harness shell | Render native fields, diffs, evidence, confirmation, conflicts, and sync status. |
| Customer/client-settings initializer | Establish and validate the local non-secret organization website, display name, location, timezone, and other declared discovery inputs. |
| Plugin-settings initialization coordinator | Enumerate required plugin settings, resolve their recommendation plans from validated client settings, launch research, consolidate confirmation, dispatch mutations, verify cache commits, and resume the pending request. |
| Settings research worker | Execute one allowlisted recommendation strategy using validated client settings and return sourced, unconfirmed candidates. |
| Settings mutation worker | Execute one confirmed update with the approved draft, preserve idempotency, recover client-side failures, emit progress, and return one sanitized terminal result to the calling harness. |
| Packaged platform skill | Run discovery, draft, confirmation, apply, cache reconciliation, and transport recovery. |
| Plugin settings profile | Declare typed properties, UI hints, recommendation strategies, and required capabilities. |
| Remote MCP router | Authenticate, resolve opaque selectors, validate request shape, and return structured content. |
| Plugin configuration PO | Validate authority, draft, revision, complete plan, idempotency, business rules, and audit. |
| Plugin configuration GO | Read and persist one explicit installation and plugin configuration scope. |
| Application/plugin graph | Own business interpretation and side effects of confirmed settings. |
| Provider adapter | Read or write an external provider under the exact installation-scoped grant when the setting requires it. |
| Local cache helper | Store and reconcile confirmed display-safe snapshots under an authority-scoped key. |

## Plugin settings profile

Every configurable plugin publishes a server-owned profile. Package metadata
may carry display and interaction hints; the live server response controls the
effective profile and editability.

Each property declares:

- stable semantic key and display label;
- value type: boolean, string, number, enum, date, time, timezone, URL,
  weekly schedule, ordered list, or structured object;
- constraints and normalization rules;
- native control hint and optional grouping;
- whether the property is editable, required, secret, or display-safe;
- capability required to read, recommend, and update it;
- recommendation strategy and allowed evidence sources;
- whether a complete replacement is required;
- downstream side-effect class and validation owner; and
- schema version and migration policy.

Secret properties expose readiness and actions through the existing plugin
connection flow. Their values never appear in structured content, chat,
package files, drafts, cache, or logs.

The first common property types should be:

| Type | Native interaction |
| --- | --- |
| Boolean | Toggle |
| Enum | Select control |
| String/number | Validated input |
| Timezone | Searchable IANA timezone select |
| Weekly schedule | Seven-day hours grid with closed and split-period support |
| URL | Validated URL input with source label |
| Ordered list | Add, remove, and reorder controls |
| Structured object | Schema-driven grouped form |

## Client initialization pipeline

Plugin settings initialization is part of the common BOS product-client
lifecycle across Codex, ChatGPT, Claude, Copilot, Gemini, Antigravity, and
future Agent Harness clients. Product and vertical initializers compose this
platform stage; they do not recreate its behavior independently.

### Triggers

Run or resume the plugin-settings initialization stage after:

- the first successful BOS authentication following product installation;
- a product or plugin-profile upgrade that changes the initialization epoch;
- discovery of a required canonical setting in `unset` or invalid `partial`
  state;
- loss or invalidation of the confirmed settings cache; or
- an explicit user request to repair or reinitialize plugin settings.

A completed stage is skipped when the server initialization epoch, required
canonical field states, and local cache receipt all remain current.

### Ordered stages and owners

1. **Host and BOS connection — Agent Harness and BOS MCP client.** Load the
   installed product, complete host-managed BOS authentication, call
   `bos_get_context`, and select the server-marked interactive role.
2. **Client settings — customer/client-settings initializer.** Load the package
   template plus the preserved customer-owned overlay. Establish the declared
   non-secret discovery inputs, including organization website URL,
   organization display name, location display name, and IANA timezone. Derive
   or suggest missing values through the existing consolidated confirmation
   workflow, then write the validated local overlay. This stage supplies
   context and grants no authority.
3. **Canonical inventory — plugin-settings initialization coordinator.** Call
   the server initialization inventory for all enabled configurable plugins.
   Preserve every current confirmed value. Select only required `unset`,
   invalid `partial`, or schema-migrated fields for initialization.
4. **Recommendation research — settings research workers.** Resolve each
   server-declared source role from the validated client-settings overlay.
   Launch bounded parallel research workers for independent plugins or sources.
   Business Hours uses the confirmed client website first and the confirmed
   organization name, location, and timezone only when its plan permits public
   search. Workers return candidates, evidence, freshness, confidence, and
   conflicts. They perform no setting mutation.
5. **Draft validation — coordinator and BOS service.** Normalize candidates
   against the live field types and call `bos_prepare_plugin_settings` for each
   plugin. The server returns validated drafts and exact diffs.
6. **Consolidated review — Agent Harness.** Present all required initialization
   recommendations in one review surface with sources and confidence. Ask the
   user once to accept the complete set or provide corrections. Corrections are
   normalized and prepared again before confirmation.
7. **Persistence — settings mutation workers and BOS service.** After user
   authorization, launch one mutation worker per independent plugin. Each
   worker applies its exact draft through the plugin's owning product
   connection, uses the shared retry and recovery contract, and returns the
   committed server snapshot.
8. **Cache and completion — coordinator.** Atomically write each committed
   snapshot to its authority-scoped settings cache. Re-read required fields,
   reconcile partial outcomes, and record a local initialization receipt bound
   to the server initialization epoch and schema versions. The server's
   canonical field states remain the completion authority.
9. **Resume — Agent Harness.** Report initialized values and any unresolved
   items, then automatically resume the request that triggered initialization.

Initialization may complete partially when independent plugins fail. Confirmed
successful plugin settings remain committed and cached. The coordinator reports
each failed plugin, applies its recovery policy, preserves the initialization
continuation, and resumes incomplete work later without repeating confirmed
values.

### Client-settings requirement

Every product exposing a recommendation plan declares the client-setting
source roles that plan may consume. The product's client-settings template and
initializer must support those roles before release. For Business Hours, the
required client-setting schema adds `organization_website_url` alongside the
existing organization display name, location display name, and timezone.

The package template contains an empty reusable field. The customer-owned
overlay contains the confirmed URL. Package skills and generated clients
contain no customer website, identity, or location value.

## Remote MCP contract

All tools receive only a current opaque `context_id` plus short-lived selectors
returned by the BOS connection. Clients never send raw organization,
installation, delegated-role, provider-account, or database identifiers.

### Read initialization inventory

`bos_get_plugin_settings_initialization` requires
`bos.plugin_settings.read`. It returns the product `initialization_epoch` and
an ordered inventory of enabled configurable plugins, required field states,
profile schema versions, opaque plugin selectors, and recommendation plans.
The initialization coordinator uses this one response to determine which
plugins need work. The server derives product and installation scope from the
authenticated context.

### Read settings

`bos_get_plugin_settings` requires `bos.plugin_settings.read` and returns
ordered `structuredContent` containing:

- opaque `plugin_ref`;
- optimistic `revision`;
- opaque stable `cache_scope` safe for local partitioning;
- `schema_version`;
- ordered field definitions and confirmed effective values;
- field state of `configured`, `partial`, or `unset`;
- a sanitized recommendation plan for fields that permit discovery;
- value provenance and last canonical update time;
- editability and available actions;
- latest resumable `change_cursor`; and
- `_meta.ui.resourceUri` for the remote MCP App settings component.

`bos_get_context` also returns one opaque `settings_epoch` for the resolved
product scope. The epoch changes whenever a settings snapshot visible to that
context changes. It reveals no value or authority identifier and provides a
lightweight cache validator across disconnected tasks and missed notifications.

The response contains display-safe values only. A non-secret property reports
`configured`, `partial`, or `unset`. A secret-backed property reports readiness
as `configured`, `connection_required`, or `unavailable` without exposing its
value.

An unset or partial field may include a recommendation plan such as:

```json
{
  "strategy": "public_business_hours",
  "allowed_sources": [
    {"source_role": "client_settings.organization_website_url"},
    {"source_role": "client_settings.organization_display_name"},
    {"source_role": "client_settings.location_display_name"},
    {"source_role": "client_settings.timezone"}
  ],
  "evidence_priority": ["structured_data", "hours_page", "location_page", "public_search"],
  "requires_confirmation": true
}
```

The server builds this plan from the plugin profile and current canonical
plugin state. It declares client-setting source roles and exposes no local
client-setting values. The initialization coordinator resolves each role from
the validated customer-owned client settings. Those values supply discovery
context and never grant authority.

The field definition and its value travel together so a cache hit can render
the same native interaction without another settings read. For example:

```json
{
  "property_ref": "opaque property selector",
  "semantic_key": "trial_hours",
  "label": "Trial Hours",
  "value_type": "weekly_schedule",
  "control": "hours_grid",
  "editable": true,
  "value": {
    "timezone": "America/Denver",
    "monday": [{"opens": "16:00", "closes": "19:00"}]
  }
}
```

A boolean value uses `value_type: "boolean"` and `control: "toggle"`. The
server can mark a control read-only or disabled through action availability and
an explanatory reason. The client never infers editability from visual state.

### Prepare recommendation

`bos_prepare_plugin_settings` requires `bos.plugin_settings.recommend`. It
accepts the current context, `plugin_ref`, base `revision`, typed candidate
values, and sanitized evidence descriptors. It returns an expiring opaque
`draft_ref`, normalized proposed values, a complete current/proposed diff,
validation results, evidence labels, and a deterministic `draft_hash`.

Preparation performs no canonical mutation. The server revalidates that the
plugin profile allows the evidence source and candidate shape. Source content
stays at its owning source unless a plugin's declared validation contract
requires a bounded, sanitized excerpt.

### Apply confirmed settings

`bos_apply_plugin_settings` requires `bos.plugin_settings.update`. It accepts:

```json
{
  "context_id": "opaque server-issued context",
  "plugin_ref": "opaque request-scoped selector",
  "draft_ref": "opaque expiring draft",
  "revision": "optimistic base revision",
  "idempotency_key": "stable operation key"
}
```

The user authorizes the exact draft through the native **Apply** action, an
unambiguous direct change request, or confirmation of a recommendation. The
client invokes the mutation only after that authorization. The PO binds
`draft_ref` to the authenticated actor, context, plugin, complete normalized
values, `draft_hash`, authorization evidence, and base revision;
revalidates authority and business rules; acquires the operation lock; applies
provider side effects when declared; persists through the GO; records the
before/after audit; emits the canonical change event; and returns the complete
new snapshot and revision.

Repeated use of the same idempotency key for the same draft reconciles to the
original result. Reuse with another draft fails closed. A material revision
conflict returns the current snapshot and requires the client to show the
difference before a new confirmation.

A successful response carries `status: "committed"`, the operation reference,
new revision, complete confirmed snapshot, and next change cursor. The client
updates its cache only from this response or a later reconciled committed
result.

### Structured mutation errors

Every unsuccessful apply returns a sanitized error envelope to the settings
mutation worker:

```json
{
  "status": "failed",
  "error_class": "validation",
  "error_code": "SETTING_VALUE_INVALID",
  "retryable": false,
  "public_message": "Trial Hours contains an invalid time range.",
  "field_errors": [{"property_ref": "opaque", "message": "Closing time must follow opening time."}],
  "operation_ref": "opaque operation selector",
  "support_reference": "sanitized correlation reference"
}
```

Optional fields include `retry_after_ms`, `recovery_action`, `current_revision`,
and a replacement schema fingerprint. The envelope contains no credentials,
raw provider payloads, customer records, internal stack traces, or raw
authority identifiers. The server classifies known business, provider, and
persistence failures. The client classifies transport closure and malformed
MCP responses locally.

### Synchronize changes

The plugin settings snapshot is exposed as a versioned MCP resource. When the
host supports resource subscriptions, BOS emits
`notifications/resources/updated` after the canonical commit. The client reads
the replacement snapshot and advances its cursor.

Every client also supports deterministic catch-up through
`bos_get_plugin_setting_changes`, using the last committed `change_cursor` and
a fixed refresh upper bound. The response supplies ordered revisions or directs
the client to replace its state with a full snapshot. Cursor expiry, schema
change, reconnect, or revision discontinuity triggers a full snapshot read.

Streaming is an optimization over the snapshot contract. The snapshot and
cursor path is the recovery authority.

## Local cache contract

Plugin settings use a dedicated namespace beside the shared BOS document
cache:

| Platform | Root |
| --- | --- |
| macOS | `~/Library/Caches/ai.dfsm.bos/plugin-settings/v1` |
| Linux | `${XDG_CACHE_HOME:-~/.cache}/ai.dfsm.bos/plugin-settings/v1` |
| Windows | `%LOCALAPPDATA%\DFSM\BOS\Cache\plugin-settings\v1` |

The cache key combines the server-returned `cache_scope`, plugin semantic key,
and settings schema version. The stored record contains the display-safe
canonical snapshot, product `settings_epoch`, revision, cursor,
`sync_completed_at`, and content hash. Files and directories use private
user-only permissions and atomic replacement.

Cache rules:

1. Validate live BOS context before reading a cached private snapshot.
2. Treat cached data as a replica with visible freshness, revision, and source.
3. Commit the cache only from a completed canonical read, successful apply
   response, or complete change catch-up.
4. Preserve the prior cache record after a failed or partial sync.
5. Reconcile uncertain mutations by operation identity or idempotency key before
   updating the cache.
6. Keep proposed and unconfirmed values in task-local memory. An optional
   sanitized continuation envelope may retain `draft_ref`, `draft_hash`, and
   approval state.
7. Maintain no offline mutation queue. Applying settings requires a live,
   authorized canonical service operation.
8. Invalidate the authority partition after sign-out, revocation, scope change,
   or server-directed invalidation.

### Cache-first read sequence

1. Resolve the BOS connection and validate its current context.
   `bos_get_context` returns or confirms the stable opaque cache scope and
   current product `settings_epoch`.
2. Read the local entry for that cache scope, plugin, and settings schema.
3. On a cache hit with a matching epoch, return the confirmed values and their
   stored field definitions immediately and render the native controls from the
   same record.
4. On a miss, changed epoch, expired entry, schema mismatch, or revision
   invalidation, use cursor catch-up when possible and otherwise call
   `bos_get_plugin_settings` through the BOS connection.
5. Validate the complete response and atomically cache it.
6. When the returned canonical field is `configured`, answer the question and
   render the controls from the newly committed cache record.
7. When the returned field is required and `unset` or invalid `partial`, invoke
   the plugin-settings initialization coordinator immediately. Preserve the
   user's question as the pending request.
8. The coordinator runs its client-settings, research, draft, consolidated
   review, persistence, cache, and completion stages, then resumes the question
   from the confirmed cache.
9. When an optional field remains unset, render its empty control and expose an
   **Initialize** action that invokes the same coordinator for that field.

The answer identifies its source as local confirmed cache or live BOS and shows
the canonical sync time. A cache hit avoids the plugin-settings data query; it
does not bypass current authority validation.

An `unset` cache hit for a required field resumes client initialization. The
coordinator may reuse fresh recommendation evidence from the document cache and
otherwise refresh that evidence according to the plan. Recommendation evidence
and drafts never become confirmed settings-cache values.

This cache holds configuration snapshots. The existing document cache remains
responsible for website pages and other recommendation evidence when their
source policy permits local caching.

## Native client interaction

The remote MCP App resource renders the same server-owned structured content in
clients supporting MCP Apps. Agent Harness clients with native schema-driven
widgets may render equivalent controls directly. Conversation-only clients
show the same values, evidence, diff, and actions as structured text.

Rendering means that the actual field labels and values are visible. A generic
tool-result card labeled **Structured output**, a collapsed payload, raw JSON,
schema metadata, or `[object Object]` does not satisfy the interaction contract.
If the remote MCP App or native widgets are not actually mounted, the client
immediately expands the complete snapshot in the conversation. Nested values
use labeled rows, empty values read **Not configured**, and safe URLs,
display-safe email addresses, and phone numbers are clickable. The phrase
**Structured output** is never the user-facing name of the settings result.

The standard settings surface contains:

- plugin and installation display labels;
- canonical sync status and freshness;
- current value;
- recommended value with source and retrieval time;
- editable native control;
- validation feedback;
- complete diff;
- **Apply confirmed settings** and **Discard** actions; and
- conflict refresh and review actions.

Clients preserve server field order, constraints, action availability, and
revision. A native component invokes the same remote tools as the conversation
workflow.

Codex Agent Harness renders this as an in-memory client-native settings table.
Each editable field receives its server-described inline widget, and native
**Apply** and **Discard** actions remove the need to type a value into the
conversation. This path materializes no HTML or Markdown file, report, UI
bundle, renderer, localhost process, browser session, or separate UI service.
The remote BOS connection supplies authenticated data and mutations only; the
Agent Harness owns the rendering surface.

When Codex exposes only its generic tool-result viewer, the conversation
fallback is mandatory. It shows the readable values first and exact authorized
natural-language edit requests after them; it does not describe printed action
labels as buttons.

## Delegated mutation execution

When the user submits an exact settings change, the calling Agent Harness
launches one parallel settings mutation worker when parallel agents are
available. The parent agent remains responsible for the conversation and
visible settings surface.

The worker receives the complete task context required for the operation:

- exact user intent or widget Apply event;
- BOS connection;
- selected role context or a directive to refresh it;
- cached confirmed snapshot, field definitions, revision, and cursor;
- prepared draft reference and hash when already available;
- stable client operation identity, current-draft idempotency key, and task
  correlation reference;
- retry and recovery policy; and
- the required sanitized result schema.

The context excludes credentials, tokens, raw authority IDs, raw provider
payloads, unrelated customer records, and hidden reasoning. The worker uses the
same authenticated BOS connection and interactive user role as the parent.
Delegation grants no additional authority. A harness without parallel-agent
support executes the identical worker contract in the active agent.

The worker performs:

1. Refresh context and live field schema when either is stale.
2. Convert the exact requested change into a typed candidate and validate it
   against the server field definition.
3. Prepare or refresh the server-bound draft. A direct unambiguous user request
   carries its authorization binding into this step. A recommendation waits for
   the parent's explicit confirmation before worker launch.
4. Call `bos_apply_plugin_settings` with the idempotency key bound to the exact
   current draft.
5. Reconcile any unknown completion before another mutation attempt.
6. Apply the error policy below until committed or terminal.
7. On `committed`, atomically replace the cache from the complete server
   snapshot.
8. Return a sanitized terminal result and progress history to the parent.

The worker emits progress events containing the current phase, attempt number,
sanitized error class, recovery action, and next retry time. The calling
harness may render these events while the user continues interacting.

### Retry and recovery policy

The server owns transactional safety, provider reconciliation, and structured
error classification. The worker owns client transport recovery and reasoning
over the returned error envelope.

| Failure class | Worker action |
| --- | --- |
| Transport closure, timeout, temporary unavailability | Reconnect the same endpoint, rediscover tools, revalidate context, reconcile the operation, and retry with the same idempotency key using bounded exponential backoff with jitter. |
| Rate limit | Honor server `retry_after_ms` within the operation deadline and report the next attempt to the harness. |
| Stale tool or field schema | Refresh tools and settings schema, rebuild the typed request from the original intent, and retry once when the semantic target is unchanged. |
| Expired context or product OAuth | Run the existing host-managed BOS recovery, revalidate the same product scope, and resume once. |
| Provider authorization required | Run the existing BOS-hosted provider recovery and resume the operation once. |
| Stale revision | Refresh the snapshot. Automatically rebase only when the target property is unchanged and the resulting approved diff is identical. Return a conflict to the parent when the target changed. |
| Correctable client data shape | Rebuild from the live server schema and retry once. |
| Local cache corruption or write failure after server commit | Preserve the committed server result, invalidate only the exact cache entry, repair or recreate its private cache path, and retry the atomic cache write once. Fetch the live snapshot on the next read when repair fails. |
| Business validation | Stop retries and return field-level guidance for correction. |
| Permission or capability denial | Refresh context once, then return the authoritative denial. |
| Server invariant, malformed response, or repeated shape failure | Stop mutation retries and return a feedback-ready bug result. |

Automatic transient retries use a maximum of five total mutation attempts with
full jitter over nominal delays of 1, 2, 4, and 8 seconds. A server-provided
retry time takes precedence within the bounded operation deadline. Every replay
of an exact draft uses that draft's original idempotency key. A refreshed draft
uses a new key linked to the same client operation identity after the prior
attempt is reconciled. An uncertain mutation is always reconciled before
replay.

### Parent result handling

On success, the worker returns `committed`, the complete new confirmed values,
revision, operation reference, cache update status, attempts, and recoveries.
The parent responds concisely: “Done. Trial Hours are now …” and renders the
new values.

When the server commits and the bounded local cache repair still fails, the
worker returns `committed_with_cache_warning`. The parent reports that the
setting is committed, explains that the local cache will refresh from BOS on
the next read, and renders the confirmed server response. A local cache failure
never changes a completed canonical mutation into a server failure.

On a terminal failure, the worker returns:

- requested change and target property;
- last confirmed canonical values;
- sanitized error code, public message, and support reference;
- attempt count and bounded timeline;
- client recovery actions taken and their outcomes;
- server operation state and reconciliation result;
- cache state, which remains on the last confirmed snapshot; and
- a privacy-minimized feedback draft containing expected behavior, actual
  behavior, and reproducible sanitized context.

The parent explains what happened and what recovery was attempted. It exposes
**Report this issue** or accepts the feedback command. The packaged
`submit-feedback` skill presents the sanitized payload and obtains explicit
confirmation immediately before `bos_submit_feedback`. A failed settings
update never submits feedback automatically.

## Canonical conversational example

### Normal initialized path

1. During initial client setup, the customer/client-settings initializer
   confirms the organization website, display name, location, and timezone.
2. The plugin-settings initialization coordinator finds Business Hours unset,
   launches its research worker, prepares the sourced schedule, and asks the
   user to confirm or correct it.
3. After confirmation, a mutation worker commits the schedule to BOS. The
   coordinator caches the confirmed server snapshot and completes the
   initialization receipt.
4. Later, the user asks: “What are my business hours?”
5. The client validates context and cache epoch, returns the confirmed cached
   hours, and renders the server-defined controls.
6. User: “Change Trial Hours to 4–7 PM Monday through Thursday.” The exact
   prompt authorizes that exact change. Editing the hours grid and selecting
   **Apply** creates the equivalent authorization.
7. The harness launches the settings mutation worker with the exact intent,
   current snapshot, schema, revision, BOS connection, and stable
   idempotency key.
8. The worker prepares and applies the typed draft. It reports recoveries and
   bounded retry progress to the harness.
9. On commit, the server returns the complete confirmed snapshot and revision.
   The worker atomically updates the cache and returns `committed`.
10. The parent says: “Done. Trial Hours are now 4:00–7:00 PM Monday through
   Thursday,” and renders the new confirmed controls.
11. On terminal failure, the parent reports the cause, attempts, current
   confirmed value, and cache status, then offers the feedback action with a
   precompiled privacy-minimized draft.

### Initialization-repair path

If “What are my business hours?” encounters no current cache record and BOS
returns a required `unset` or invalid `partial` field, the runtime settings
skill preserves that question and invokes the plugin-settings initialization
coordinator. The coordinator performs the same initialization stages described
above, then automatically resumes the question from the confirmed cache. The
runtime skill never creates a separate discovery implementation.

## Business-hours initialization reference workflow

1. The client initialization pipeline reaches the plugin-settings stage after
   local client settings and BOS authentication are complete.
2. The coordinator resolves the BOS connection, calls
   `bos_get_context`, selects the server-marked default role, and verifies the
   required read and recommendation capabilities.
3. `bos_get_plugin_settings_initialization` returns Business Hours as required
   and `unset` or `partial`, plus its field schema, revision, and recommendation
   plan. The plan references client-setting source roles and carries no customer
   values.
4. The coordinator resolves those roles from the validated local
   customer-settings overlay and launches a Business Hours research worker.
5. The research worker retrieves the confirmed client website and extracts
   published hours from structured data, an authoritative hours page, location
   page, and visible site content in that priority order. When the website is
   absent and the plan permits public search, it searches with the confirmed
   client organization name and location and accepts evidence only after
   matching the organization identity and location. It records source URL,
   retrieval time, evidence type, timezone, and confidence. Conflicting pages
   remain visible as a conflict. It follows only public HTTPS or HTTP URLs,
   rejects loopback and private-network targets, treats all page text and
   metadata as untrusted evidence, and never follows instructions embedded in
   website content.
6. The worker normalizes the candidate into a seven-day schedule supporting
   closed days, multiple periods, and overnight periods. It never infers a
   holiday exception as the standing weekly schedule.
7. The coordinator calls `bos_prepare_plugin_settings`. The server validates the
   complete schedule, timezone, plugin policy, and base revision.
8. The initialization review presents: “These are the hours I pulled from your
   website. Please confirm they are correct or send changes.” It shows all seven
   days, timezone, source links, retrieval time, differences from canonical
   state, and any ambiguity. Other required plugin recommendations may appear in
   the same consolidated review.
9. “Use these settings,” the native Apply action, or an equivalent unambiguous
   confirmation approves the exact displayed draft. A correction creates a new
   draft and requires confirmation of that replacement.
10. The coordinator launches the settings mutation worker.
    `bos_apply_plugin_settings` performs the audited canonical mutation and any
    plugin-declared downstream service update under one operation identity.
11. The completed server snapshot is written atomically to the local plugin
    settings cache. The coordinator verifies Business Hours is configured,
    records initialization completion, refreshes tools when needed, and resumes
    the pending client request.
12. Other active clients receive the resource update notification or catch up
    from their cursor on their next interaction.

If the recommendation plan resolves no usable website or identity from client
settings, the initialization coordinator returns to the client-settings stage
to complete or correct those source values. If discovery remains unreachable or
ambiguous, the initialization review presents an editable blank or partial
recommendation with the evidence limitation clearly labeled.

## Plugin integration convention

Every plugin that exposes customer-configurable behavior supplies:

1. a versioned server settings profile;
2. read, recommend, and update capability mappings;
3. PO validation and GO persistence for its exact installation scope;
4. typed UI hints using platform-supported controls;
5. recommendation strategies with allowlisted evidence sources;
6. side-effect and reconciliation behavior for provider-backed settings;
7. an event and cursor projection for confirmed changes;
8. contract tests for cross-tenant, stale revision, capability, idempotency,
   schema, and secret-redaction behavior; and
9. a plugin skill section that maps user intent to the generic settings
   workflow.

Plugins with no configurable properties return an empty profile and remain
fully operable through their domain tools. Automation plugins use the same
contract for triggers, schedules, templates, thresholds, routing rules, and
enablement parameters.

## Conflict and failure behavior

- **Stale revision:** refresh, show the server change and the user's proposed
  change together, prepare a replacement draft, and obtain confirmation.
- **Disconnected stream:** reconnect the same product endpoint, rediscover
  tools, revalidate context, catch up from the cursor, and resume once.
- **Unknown mutation result:** reconcile by operation or idempotency identity
  before any replay or cache update.
- **Provider authorization required:** complete the existing BOS-hosted secure
  authorization flow and resume the same operation once.
- **Schema upgrade:** read a full snapshot, migrate only through the
  server-declared profile, and use the new cache namespace or record version.
- **Partial provider side effect:** the PO records the operation state and
  exposes reconciliation. The client reports the canonical outcome and keeps
  the prior cache snapshot until completion is known.
- **Lost capability or scope:** invalidate the affected cache partition and
  fail closed.

## Implementation and rollout sequence

1. Finalize tool names, schemas, capability names, MCP resource URI, and
   structured-content version.
2. Implement the server profile registry and one Business Hours reference
   profile.
3. Implement Router-to-PO-to-GO read, prepare, apply, audit, idempotency,
   revision, and event paths in the owning service repository.
4. The packaged `bos-mcp-client` now includes the plugin-settings cache helper,
   cache protocol, and authority-scoped completion receipt.
5. The packaged client now includes the generic plugin-settings initialization
   coordinator. The remote initialization inventory tool and epoch remain a
   service dependency.
6. Education Center client settings now declare
   `organization_website_url`; its initializer validates and confirms that
   source before invoking plugin-settings initialization.
7. The generic `bos-plugin-settings` skill is packaged, and the Plugin Console
   delegates its **Settings** action to that workflow.
8. Every declared runtime product now composes `submit-feedback`, the mutation
   workflow, and the initialization coordinator. Disabled products receive
   these capabilities when their packages become active and regenerate.
9. Add native MCP App controls and structured-text fallback behavior.
10. Add plugin profile declarations and skill routing incrementally, starting
   with Business Hours and existing automation plugins.
11. Codex, Claude, Copilot, and Gemini packages are generated from the shared
    source and checked for behavior parity.
12. Run server contract, security, initialization, cache, reconnection,
    client-rendering, and end-to-end confirmation tests.
13. Roll out read-only snapshots, then initialization recommendations and
    drafts, then confirmed mutations, then event-driven synchronization.

## Validation gates

- Cross-tenant, cross-installation, cross-role, and foreign-selector requests
  fail closed.
- Interactive authority comes from the authenticated user's selected role.
- Secret values and raw authority IDs remain absent from structured content,
  cache, continuation envelopes, and logs.
- A draft binds exact values, evidence descriptors, actor context, plugin,
  revision, and hash.
- Every successful mutation has one operation identity, stable idempotency,
  before/after audit, and deterministic result.
- A successful server apply updates the cache; a failed or uncertain apply
  preserves the prior cache snapshot.
- A current cache hit renders values and server-defined controls without a
  plugin-settings data query after live authority validation.
- A required unset or invalid partial canonical field resumes the common client
  initialization coordinator. That coordinator alone resolves the
  server-allowlisted recommendation plan from validated client settings, keeps
  discovered values unconfirmed, and persists them after user authorization.
- Business Hours is researched and configured during initial client setup, and
  later runtime reads consume the confirmed cache or resume incomplete
  initialization.
- A prompt-authorized change and its equivalent widget Apply action create the
  same typed draft and canonical mutation.
- Parallel mutation execution preserves the interactive user's scope, emits
  sanitized progress to the parent harness, and returns one terminal result.
- Transient retries are bounded, jittered, idempotent, and preceded by
  reconciliation whenever completion is uncertain.
- Terminal protocol and repeated data-shape failures produce a complete
  privacy-minimized feedback draft and require explicit confirmation before
  submission.
- Stream loss recovers through cursor catch-up without asking the user to repeat
  the request or confirmation.
- Stale revisions require a visible conflict decision.
- Website recommendations show source, retrieval time, timezone, all seven
  days, and ambiguity.
- Native widget and conversational paths produce the same canonical mutation.
- Generated clients contain equivalent skills, helper bytes, and runtime
  behavior.

## Rollback

Disable settings update capabilities and the remote Apply action while
preserving canonical configuration. Clients continue to read snapshots through
the prior schema. Disable resource notifications independently; cursor-based
snapshot refresh remains available. A cache schema rollback points clients to
the prior versioned namespace and leaves newer cache data eligible for later
cleanup.

## Recommended architecture decisions

1. Serve the same versioned semantic UI resource,
   `ui://bos/plugin-settings/v1`, independently through every named product
   connection. Each product's OAuth grant and server context remain an
   independent authorization boundary.
2. Compose the runtime profile registry from application-owned plugin manifests
   and validate every profile against one BOS core metamodel. This keeps generic
   types and safety rules in the platform while each application owns setting
   meaning and business validation.
3. Use Review Outreach as the second reference profile after Business Hours.
   Its schedules, enablement parameters, templates, and thresholds exercise the
   reusable automation-setting types without making the platform specific to
   one vertical.
4. Expire a local settings-cache partition 30 days after its last successful
   live authority validation and allow managed policy to shorten that period.
   Preserve current canonical settings in the service for the life of the
   installation. Retain revision and audit history through the service's
   existing centralized audit-retention policy.
5. Make plugin-settings initialization a mandatory common stage for every
   runtime product containing enabled configurable plugins. Compose it after
   local client-settings initialization and BOS authentication, and before
   normal domain workflows.

## Current delivery boundary

This repository implements the application-neutral packaged client behavior,
local cache, initialization ordering, product composition, generated clients,
and deterministic tests. The owning BOS service repository must implement and
security-test the remote profile registry, MCP tools, Router-to-PO-to-GO
mutations, audit, notifications, initialization inventory, and Business Hours
reference profile before the end-to-end workflow is operational.
