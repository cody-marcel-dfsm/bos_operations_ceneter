# Agent-routed app discovery contract

## BOS discovery root

Discover and read advertised MCP resources on the existing authenticated BOS
connection before evaluating downstream host capabilities. Use the current
resource inventory, follow pagination, and read the returned discovery manifest
and its advertised directory URI. A directory may be exposed as a resource or
a live-described tool. Tool catalog absence is insufficient evidence of missing
resource discovery. Optional resource-template method failure does not block
listed resource reads. Follow the concrete host procedure in `../SKILL.md`.

The BOS MCP returns the current authenticated scoped-grant description and an
authorized installed-app directory. Each app contact contains:

- descriptive `app_code`, `display_name`, and `description`;
- an HTTPS `mcp_resource` or equivalent opaque contact;
- `contract_version` and `discovery_epoch`;
- `capability_families`; and
- descriptive `required_scopes`.

The descriptor contains no raw or opaque authority selector, organization,
membership, role, installation,
plugin, credential, or persistence identifier. GPT selects from these current
descriptors. BOS does not choose an app or route a domain request.

## App MCP discovery

An app MCP describes only its application boundary. Discover the versioned
semantic equivalents of:

- `app.describe` for purpose, vocabulary, entities, and contract versions;
- `graph.describe` for installed graph identity, digest, nodes, transitions,
  gates, goals, entry points, and exits;
- `services.list` and `plugins.list` for app-owned and nested provider services;
- `service.describe` for operations, side effects, authority, provenance, and
  failures;
- `api.contract.get` for the current machine-readable operation contract;
  and
- `discovery.refresh` for current discovery after relevant state changes.

Semantic capability names guide discovery. Literal resource, tool, URI, and API
operation names come from the current versioned response.

For Agent-Driven Custom Journeys, fresh `app.describe` also publishes one scoped
application reference and exact authenticated BOSL schema, language-reference,
and conformance-example resource URIs plus an opaque descriptor token.
`plugins.list` publishes accessible plugin journeys as structured
`{platform, application, plugin}` references, compact client/server steps,
purpose, separate readiness, a descriptor token, and the complete input for
independent `service.describe`. Detailed Describe must agree with the compact
steps and publishes exactly one of `journey` or `behavior`. An executable
`journey` declares every server step's semantic operation,
schemas, effect, approval, limits, public failures, receipts, and recovery. An
event-driven plugin may instead publish `behavior`: its trigger, ordered
automation states, named human interfaces, branch successors, and terminal
customer-facing outcomes. Behavior states describe server-owned automation and
never become client-invokable operations. Accessible unready plugins remain
visible with sanitized recovery guidance.
Every operation limit includes integer `maximum_duration_seconds` from 1 through
900 and integer `maximum_fan_out` from 1 through 100. Missing or out-of-range
values make the service description invalid; the client never supplies defaults.
The corresponding deterministic operation Describe response repeats those
exact fields for every ready operation. Validate it with
`validate-discovery.mjs operation-describe` before planning or invocation.

Follow every `api.contract.get` link with its exact returned input. Validate the
response with `validate-discovery.mjs api-contract`, passing the requested
operation and, for a plugin-owned link, the selected complete structured source.
The response binds the operation and source to its current schemas, reference
classes, effect, permission, approval, limits, guarantees, execution URI,
retry policy, receipt, public errors, recovery, provenance, and readiness. It
is fresh private MCP data with `ttlMs: 0` and `cacheScope: private`.
`bosl_server_node: true` requires `node_type: server`. When
`bosl_server_node` is false, `node_type` is absent; that operation remains a
discoverable deterministic API and cannot be compiled as a journey server
node. A client copies this classification and never derives it from provider,
operation name, or route.

Every service descriptor supplies stable `service_id`, agent-readable `summary`,
`entity_types`, `owner_kind`, `operations`, `api_base_url` containing an HTTPS
origin or opaque base reference, `contract_uri`, `auth_scheme`,
`required_scopes`, `provenance`, `failure_contract`, and `version`. Plugin and
provider-backed services remain nested under
their owning app unless BOS discovery identifies them as independently
installed applications.

## Deterministic API invocation

The client validates the machine-readable contract before each unfamiliar
operation. APIs use bounded HTTPS JSON schemas, stable operation identifiers,
the authenticated scoped grant, explicit side-effect classes, typed errors,
pagination where needed, observation timestamps, freshness, provenance, and
correlation references. Every mutation is service-idempotent; the client
supplies no idempotency key, attempt identity, retry counter, reconciliation
decision, or execution state. Read-only planning stays separate from
transition execution.

Every call uses a short-lived audience-bound bearer through a host credential
boundary and revalidates actor, organization, app installation,
role, operation, plugin, and provider requirements. A context issued for another
organization, installation, role, app, or audience fails closed at the grant
boundary. Discovery never expands API authority.

## Client state

Keep the current descriptor, contract digest/version, and sanitized operation
plan only for the active request. Refresh after authority, installation, graph,
plugin, provider, grant-expiry, or contract changes. Resolve an uncertain
mutation only through the exact service-returned state action; never replay the
mutation or create client retry, attempt, idempotency, or reconciliation state.

The client never persists bearer tokens, raw or opaque authority selectors, app
endpoints as configuration, or customer records in discovery state. It uses no
browser automation, DOM inspection, UI-derived authority, cached selector, or
hardcoded app registry.

## Host capability states

The target workflow requires two host capabilities after BOS discovery:

1. attach or query an MCP resource returned dynamically for the active request;
2. invoke a discovered HTTPS API with host-managed audience-bound
   authentication through the current grant-bound app contact.

Identity-v2 HTTP execution contracts publish the static
`execution.context_header` value `X-BOS-Context-Handle`. Copy that name and
supply the current opaque selected handle in the header on the exact advertised
request. The handle never enters the business schema, cache key, OAuth
material, retry identity, idempotency identity, execution state, or journey
state. For journey registration, the discovered contract supplies this binding;
every returned lifecycle/state HTTP action receives the same fresh handle from
the BOS transport adapter even though the action envelope carries no context
field. Dependent products never receive the handle. Legacy/v1 HTTP remains
header-free. `execution.transport: "journey_runtime"` selects the journey
runtime instead and has no context header.

Evaluate each capability only when its step is reached after BOS directory
discovery and contact validation. Attempt an available supported facility;
establish an absent facility from the current host inventory. Preserve actual
server error types, completed reads, recovery evidence, and unattempted steps.
When either capability is demonstrably unavailable, return `host_capability_unavailable`
with the missing capability, selected app display identity, contract version,
and a sanitized continuation reference for the per-app operation. Apply the
Current-host read execution rule in `../SKILL.md` to independently authorized
authenticated reads. Preserve a partial result when those reads succeed.
Browser or copied-endpoint work never repairs this state.
