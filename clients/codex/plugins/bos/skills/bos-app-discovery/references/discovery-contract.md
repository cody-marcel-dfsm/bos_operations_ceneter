# Agent-routed app discovery contract

## BOS discovery root

Discover and read advertised MCP resources on the existing authenticated BOS
connection before evaluating downstream host capabilities. Use the current
resource inventory, follow pagination, and read the returned discovery manifest
and its advertised directory URI. A directory may be exposed as a resource or
a live-described tool. Tool catalog absence is insufficient evidence of missing
resource discovery. Optional resource-template method failure does not block
listed resource reads. Follow the concrete host procedure in `../SKILL.md`.

For identity-v2, fresh authorized contexts identify accessible application and
installation choices in their server-authorized organization and role. Use the
selected context's current advertised application description and service
catalog to report its capabilities, readiness, and empty states. Keep each
observation scoped to its application and include returned versions and times.
An accessible-inventory or readiness assessment can complete with those facts;
an organization-wide directory is needed for facts beyond that observed scope.
Missing business-data or execution prerequisites still stop the affected task.

Match the assessment to the requested facts. App/service lists use fresh
context identities and the actual app-owned public-service catalog; identity
and capability summaries use the selected context and native capability
catalog. Readiness assessments use source-backed readiness and prerequisite
evidence, preserving empty states, provenance, freshness, and every observed
conflict. Retrieve and validate an advertised search contract when it declares
source readiness, preserving those source rows alongside the service catalog's
declarations. Tool/workflow availability lists include the actual advertised
journey-registration contract and its supported authoring/runtime capabilities.
An explicitly detailed or comprehensive contract audit uses the full-inventory
reconciliation below. Retrieve operation schemas when the requested facts
require them; ordinary availability summaries do not require an exhaustive
native/public schema comparison.

For full inventories, answer with one exact selected-identity row, coverage
totals, and a source-keyed reconciliation table. Use separate rows for each
advertised native operation (including each alias), each described public API
operation, and each schema-comparison result. Native and public rows use these
columns: scope/source, exact operation and alias, exact advertised counterpart
or `No observed counterpart`, declared execution mode, input/output constraints
and bounds, limits/pagination, contract version and observed time/age,
validation attempts, errors, recovery, and current result. A comparison row
identifies the exact operation/source and schema pointer on both sides, whether
the declarations match, and every returned declaration difference. Join a
native and public operation only through the exact advertised contract
reference; structural similarity does not establish a relationship. Do not add
roles from memory or prose examples. Preserve every missing, stale, failed, and
recovered observation. Report counts for native operations, alias rows, public
operations, exact advertised links, submitted schema pairs, returned
comparison results, and unresolved rows; each count must reconcile to the
corresponding table rows and observations before claiming complete coverage.
Report an empty input schema as a valid zero-input action when the observed
contract accepts `{}`. Record validation failure and recovery as separate
observed outcomes.

Before presenting an accessible inventory, build an internal authorization
table from the fresh context rows: organization, application, installation,
and role label. Match every final accessible-app, installation, and role claim
to a row in that table, within the selected request scope. Report the selected
context's role as the current identity. A configured application role catalog
supplies role definitions; include those definitions when explicitly requested
and label them as configured application metadata.

In the final inventory, report the selected context role verbatim. Each
additional accessible-role claim maps to its own fresh authorized context row.
Keep configured role definitions labeled as application metadata, separate from
observed access. The final response names only roles established by those
observations.

For a full inventory, cover all currently advertised operation keys and catalog entries,
using the returned Describe batch maximum for required descriptions and
explicitly identifying unresolved descriptions.

For full contract inventories, keep the table source-keyed through final drafting. Never combine native and
public declarations into one row, and never assign a schema-comparison result
to another operation based on similar names or shapes. Include failed and
unavailable reads with their effect on the inventory. Mark `journey_runtime` as
journey runtime; use HTTPS only when the observed contract declares the HTTP
route. Report row counts for native operations, aliases, public operations,
exact advertised links, submitted schema pairs, returned comparison results,
and unresolved rows before describing coverage as complete.

Validate each document against its actual envelope type. For identity-v2,
validate the application resource with `app-describe` and the complete HTTPS
Describe response with `operation-describe`; that response validation covers
its individual operation contacts. The legacy `api-contract` mode validates
the actual `api.contract.get` response envelope. An individual identity-v2
operation contact retains its parent Describe provenance and validation.

The existing `lead-director.journeys.register` API contract declares
`lead-director-journey-registration/v1`. Validate that application-owned
registration subtype through `api-contract`, preserving its raw BOSL schemas,
limits, guarantees, execution contact, public errors, and private freshness.
Plugin operation contracts retain their structured source requirements. For tools/workflow
and read-only feasibility assessments, follow the application's exact
`journey_registration.contract.capability` and `.input` through current
discovery and validate the actual returned contract. Enumerate this link
separately from public Describe operations and native API-contract links; mark
it unresolved when missing or unavailable. Complete public Describe retrieval
does not establish registration-contract retrieval or validation.

For workflow reports, project the exact validated operation-Describe parents and
API-contract responses with the packaged
[contract-facts projector](../scripts/project-contract-facts.mjs). Its
source-keyed fact rows preserve every execution method/transport/context-header
name, limits entry, root required/property names, guarantees, errors, versions,
and available freshness declarations. Include the complete execution and limit
rows in the report. Execution URIs and authority values are omitted; context
header names are declarations only. The ordinary CLI accepts observed documents
and descriptive scope labels; a supported retained-document host capability
resolves the exact validated originals and scope itself.

The projector's summaries count unique operations separately by contract kind,
selected descriptive scope, and exact declared source when present. Keep public
operation-Describe counts separate from API-contract registration/native counts.
Preserve null, absent, and declared transport states, duplicate observations,
and conflicting declarations. Pagination tensions pair actual schema-field
pointers with the same operation/source's literal pagination flag; retain both
in the assessment without inferring runtime permission or invalidating the
contract. A projection is derived reporting evidence and supplies no new
source/schema evidence or authorization. Detailed contract comparisons retain
the original validated documents and their existing requirements.


Copy advertised resource references exactly as returned by the current host,
preserving their spelling and encoding. When the host presents a private
placeholder, it owns resolution to the original reference. Resolve a missing
reference through current advertised discovery before using it.

Before presenting capabilities or prerequisites, reconcile the readiness,
execution mode, limits, capability flags, and input/output schemas needed for
the requested facts. Report
observed disagreements explicitly, including each conflicting declaration;
leave the affected feature unresolved until its governing contract clarifies
it. Distinguish source readiness from the transport or runtime prerequisites
needed to execute its operation.

Legacy directory discovery returns the authenticated scoped-grant description
and an authorized installed-app directory. Each directory app contact contains:

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

Full inventory also covers every native tool in the selected context's current
catalog. An advertised `_meta["bos/apiContract"]` identifies a capability and its
exact input. Resolve that capability through current discovery, copy the input,
and validate the actual returned contract. Preserve semantic identifiers,
including their spelling. Account for aliases sharing that exact link in the
same context with one validated contract observation during this assessment.
Compare native and linked HTTPS input and output schemas, including required
and optional fields, accepted values and bounds, response shapes, limits,
pagination and transport. Attribute each difference to its exact source
declarations. Preserve unresolved differences without inventing a translation.
Use a complete per-operation ledger covering native aliases and all observed
counterparts, with every input requirement, output/media shape, limit and
execution declaration accounted for. Carry each differing declaration into the
final assessment. The packaged schema comparison helper compares declarations
from exact observed schemas; its output provides no correspondence, validation,
interoperability, authorization or readiness guarantee.

Readiness reports preserve the returned `observed_at`. Calculate age only from
a verified current host, authorized context or server reference time and state the
reference used. If that reference is unavailable, preserve the timestamp and
report age as unverified rather than estimating a current time. Present stale or
missing observation evidence as a freshness limitation. Mark current readiness
unverified whenever timely facts or current execution prerequisites are
unestablished, including in summaries; label declared availability as advertised.
Fresh authentication and retrieval retain their own provenance and do not
replace a response observation timestamp or establish provider connectivity.

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

For read-only journey feasibility, first read and validate the actual
advertised journey-registration contract using its exact capability and input.
Assess its raw BOSL input/output schemas, supported node types, required
inputs, guarantees, compiler/runtime limits, execution declaration, and public
errors. Use the actual service catalog and relevant operation contracts for
source capabilities and readiness. Read additional advertised BOSL schema,
reference, and examples resources only when needed to resolve missing grammar
or feasibility evidence; identify unresolved evidence explicitly. Return the
assessment without registering or executing a journey. Actual authoring
continues to require the advertised BOSL resources and operation contracts.

Follow every `api.contract.get` link with its exact returned input. An operation
identifier returned by HTTP Describe is a selector for that HTTP contract; it
does not independently advertise a legacy semantic contract lookup. If no
operation-contract link exists, report the missing BOSL evidence and preserve
the validated HTTP description. Never construct a semantic lookup identifier
from the HTTP operation name. Validate the
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

Public `location_context` and `ownership_context` output-schema properties are display labels in both operation Describe and legacy `api.contract.get` descriptors only when they are closed objects containing exactly one required `label` string with minimum length 1 and maximum length 255. Raw context selectors, credentials, altered or open shapes, and those fields in input or other descriptor positions retain rejection.
