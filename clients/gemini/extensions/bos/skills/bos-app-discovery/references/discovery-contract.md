# Agent-routed app discovery contract

## BOS discovery root

Discover and read advertised MCP resources on the existing authenticated BOS
connection before evaluating downstream host capabilities. Use the current
resource inventory, follow pagination, and read the returned discovery manifest
and its advertised directory URI. A directory may be exposed as a resource or
a live-described tool. Tool catalog absence is insufficient evidence of missing
resource discovery. Optional resource-template method failure does not block
listed resource reads. Follow the concrete host procedure in `../SKILL.md`.

The BOS MCP returns the current authenticated organization context and an
authorized installed-app directory. Each app contact contains:

- descriptive `app_code`, `display_name`, and `description`;
- an HTTPS `mcp_resource` or equivalent opaque contact;
- an opaque server-issued `context_id`;
- `contract_version` and `discovery_epoch`;
- `capability_families`; and
- descriptive `required_scopes`.

The descriptor contains no raw organization, membership, role, installation,
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
- `api.contract.get` for OpenAPI or an equivalent machine-readable contract;
  and
- `discovery.refresh` for current discovery after relevant state changes.

Semantic capability names guide discovery. Literal resource, tool, URI, and API
operation names come from the current versioned response.

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
opaque authenticated context, explicit side-effect classes, typed errors,
pagination where needed, observation timestamps, freshness, provenance, and
correlation references. Retryable mutations require a contract-declared
idempotency key. Read-only planning stays separate from transition execution.

Every call uses a short-lived audience-bound bearer through a host credential
boundary and revalidates actor, organization membership, app installation,
role, operation, plugin, and provider requirements. A context issued for another
organization, installation, role, app, audience, or expired discovery epoch
fails closed as cross-context reuse. Discovery never expands API authority.

## Client state

Keep the current descriptor, contract digest/version, and sanitized operation
plan only for the active request. Refresh after authority, installation, graph,
plugin, provider, context-expiry, or contract changes. Reconcile uncertain
mutations by the discovered operation or idempotency identity before replay.

The client never persists bearer tokens, raw authority identifiers, app
endpoints as configuration, or customer records in discovery state. It uses no
browser automation, DOM inspection, UI-derived authority, cached selector, or
hardcoded app registry.

## Host capability states

The target workflow requires two host capabilities after BOS discovery:

1. attach or query an MCP resource returned dynamically for the active request;
2. invoke a discovered HTTPS API with host-managed audience-bound
   authentication and the opaque app context.

Evaluate each capability only when its step is reached after BOS directory
discovery and contact validation. Attempt an available supported facility;
establish an absent facility from the current host inventory. Preserve actual
server error types, completed reads, recovery evidence, and unattempted steps.
When either capability is demonstrably unavailable, return `host_capability_unavailable`
with the missing capability, selected app display identity, contract version,
and a sanitized continuation reference. Keep the operation pending. A central
BOS domain alias, browser, or copied endpoint does not satisfy this state.
