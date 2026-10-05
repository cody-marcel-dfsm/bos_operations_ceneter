---
name: bos-app-discovery
description: Route requests through authenticated BOS app discovery, including finding skills and operations that can contribute to an ad hoc dynamic BOSL workflow. Use when app scope, service ownership, workflow composition, graph shape, or API contracts must be discovered at runtime.
---

## Match discovery to the requested assessment

Use `bos-mcp-client`'s first-action and identity-context rules for every BOS
assessment. Establish fresh authorized contexts and validate the selected
application description. Start each identity-bearing app, tool, workflow, or
readiness report with an **Authorized context** row containing organization,
application, installation, role, and source provenance. Copy its public labels
verbatim from the selected current `bos.get.context` row. When the host returns
an `authorized_context` reporting row, preserve that row's labels and exact
source reference; ordinary clients retain the context observation and selected
row pointer. Carry that same typed row from successful scoped discovery
wrappers into the assessment; raw application catalogs remain separately
attributed metadata. Every additional accessible-context claim requires its own fresh
context row within the requested scope.

When the user explicitly requests configured role definitions, report them
under **Configured application role metadata** with their separate catalog
source. Keep that metadata type separate from the Authorized context row and
copy the current role only from its context observation. Each identity claim in
the report remains traceable to that same exact context source.

Choose the evidence needed for the actual request:

- **Apps and public services:** list the fresh authorized applications and the
  actual returned public-service catalog, including empty catalogs, ownership,
  declared capabilities, provenance, and available versions and observation
  times. Preserve application boundaries for nested provider services.
- **Identity and capability summaries:** report the selected authorized context
  and capabilities from its fresh native tool catalog and validated application
  descriptions. Attribute capability claims to those observations.
- **Readiness and prerequisites:** read the application/service catalog and the
  operation descriptions needed for the requested source readiness. Preserve
  every observed readiness declaration and conflict, including different
  readiness reported for one source's search and dedicated operations. When an
  advertised search contract declares source readiness, retrieve and validate
  that contract and preserve its actual source rows alongside the service
  catalog's declarations. Keep current readiness unverified when timely provider
  or execution evidence is missing; advertised availability remains attributable to its source.
- **Tools and workflows:** enumerate the native tools, public services, and
  workflow capabilities in each authorized app. Follow the validated application
  description's separately advertised `journey_registration.contract` through
  its exact `capability` and `input`, resolve the callable through current
  discovery, and validate the actual response with `api-contract`. Include its
  raw BOSL required inputs, supported node types, server-owned guarantees,
  execution declaration, compiler/runtime limits, and public errors in the
  workflow assessment. Use the packaged contract-facts projection below to
  preserve complete execution and limit declarations and observed pagination
  tensions. When the link or a required observation is unavailable, identify
  that missing evidence explicitly.
- **Detailed contracts and full inventories:** use the named-contract comparison
  section for requested operation schemas, fields, bounds, effects, limits, and
  errors. Use the full-inventory workflow for an explicitly comprehensive
  per-operation contract audit, including native/public schema reconciliation.

Keep app/service lists, identity summaries, readiness checks, and tool/workflow
availability lists within their requested facts. A complete contract audit
requires an explicit detailed or comprehensive request. Retrieve and validate
operation-level contracts whenever a requested fact depends on them; a native
tool catalog or application description alone supplies no public operation
schema. For all assessments, preserve failed reads, missing prerequisites,
observed conflicts, exact source provenance, and validation results relevant to
the requested facts. Read guard status immediately before calculating ages and
use its exact `reference_time` with each literal source `observed_at`. Perform
no business operation, registration, or mutation for a read-only assessment.


### Preserve contract facts for workflow reporting

For tool/workflow and journey-feasibility reports, use the packaged
[contract-facts projector](scripts/project-contract-facts.mjs) on the exact
validated operation-Describe parent documents and API-contract responses used
by the assessment. Ordinary clients can invoke its stdin/stdout CLI with
`{documents:[{kind,document,scope}]}`: `kind` is `operation-describe` or
`api-contract`, `document` is the actual complete response, and `scope` contains
the descriptive `organization`, `application`, `installation`, and `role`
labels from the selected context. Scope labels group declarations and supply no
authorization proof. In a host offering `acceptance_project_contract_facts`,
pass only its retained validated document IDs; the host supplies the originals
and scope. When that verified host supports default selection, omit
`document_ids` after the relevant contracts have been discovered and validated
to select its current retained, successfully validated operation-Describe and
API-contract originals. Inspect the returned `source_documents` to reconcile
coverage with the requested facts; default selection supplies no missing
discovery or validation. Explicit IDs still require exact returned eligible
references. Preserve missing helper support as a reporting limitation and report
these same exact declarations from the validated documents.

The ordinary projector returns full summaries and operation rows. A bounded
host may return `document_id`, `summaries_pointer`, `summary_count`, and
`operations_pointer` for the complete retained projection, with compact
summaries carrying `pointer` and `execution_groups`/`error_groups` objects
containing `count` and `pointer`. Copy those exact returned references into
bounded document reads. If compact summaries are omitted, read
`summaries_pointer` first; read every referenced group completely and follow
returned chunk offsets until complete. Use `operations_pointer` for the
underlying execution and limit rows needed by the assessment. The compact
response and the complete retained projection describe the same observations;
neither supplies a new source or validation proof.

Use the projection's complete `execution` and `limits` rows in the workflow
report: include every declared field and literal value, including document and
lifecycle bounds. Preserve declared nulls and absent fields separately. Report
every `summaries.execution_groups` entry with its complete method, transport,
and context-header tuple for every public operation and actual API-contract or
registration operation. Include each declared response body, content type, and
every response header name. Group identical tuples only when every member
operation and its source are listed; a null transport retains its independently
declared method and context header. Account for every `summaries.error_groups`
entry, including general public errors and operation-specific or source-specific
errors, with each declared HTTP status and retryability value. Preserve scope,
contract kind, source observations, and declaration pointers for both ledgers;
read their retained projection document when the initial summary is bounded.
Reconcile the final report against every execution and error group before
finishing, retaining conflicting, null, and absent declarations explicitly.
Report its pagination tensions with both exact schema-field and flag declarations;
these observations do not invalidate a contract or establish runtime behavior.
Use `summaries` for any transport totals, retaining their contract-kind and
scope groups: public operation-Describe counts and API-contract counts describe
separate sets. Preserve duplicate observations and conflicting declarations;
use no aggregate count when those groups do not match the stated set. The
projector supplies validated declarations only, with document indexes and JSON
pointers; it establishes no source equivalence, authority, execution permission,
or current readiness. Requested detailed schema comparisons still use the
named-contract section and the original validated source documents.


For live `bos-identity-mcp/v2`, first apply [identity-context compatibility](../bos-mcp-client/references/identity-context.md).
Its fresh authorized-context selection and saved-default rules govern this
workflow; single-context grant wording below applies to legacy discovery.

## Requests to compare application API contracts

When a request asks to explain, compare, or validate a named application API
operation's input or output schema, effects, field bounds, limits, pagination,
or error declarations, retrieve the operation-level public contract from the
current authorized application before writing the comparison.

For live `bos-identity-mcp/v2`, follow this order:

**Required before writing any API contract comparison:** the application-level
`app.describe` resource is not the operation-level HTTPS Describe response,
even when it lists the requested operation keys. After validating that exact
resource, call the current authenticated HTTPS Describe tool with its exact
`document_id` and requested advertised operation keys. In the reviewer-native
runtime, call `bos_https_describe` with `document_id` copied from the validated
resource and `operations` copied from `describe.operations`; when both are
advertised for a create/update comparison, call it with
`operations: ["create", "update"]` in one request. When the requested keys fit
the advertised maximum, send them together exactly once; do not split them into
per-operation requests or repeat a successful key in another batch. Use
additional non-overlapping batches only when the required key set exceeds the
maximum. Read the returned operation descriptions and their published
validation before drafting. Do not complete from
`app.describe` alone if the HTTPS call or either required description is
missing; report the unsupported part as unresolved.

1. Select the exact `app.describe` resource advertised for the authorized
   application in the BOS resource catalog, read its exact URI, and validate
   that returned resource with `app-describe`.
2. Match each operation named by the request to the exact keys in the validated
   resource's `describe.operations` list. Request every matching key through the
   advertised host-authenticated HTTPS Describe capability, in batches no
   larger than its declared maximum. For a create-and-update comparison, request
   both `create` and `update` together in one batch when those exact keys are
   advertised; do not repeat a successfully described operation in another
   batch.
3. Preserve each complete HTTPS Describe parent response and validate it with
   `operation-describe`. Compare the requested fields, effects, limits, and
   errors from the returned operation objects. Do not finish from native MCP
   tool descriptors, the semantic `app.describe` operation, or schema-difference
   output alone; those are separate evidence surfaces and cannot substitute for
   the requested public operation descriptions.

For the semantic comparison, use the validated returned operation objects as
the evidence for required and optional fields, effects, bounds, limits,
pagination, and error declarations. Do not use `acceptance_compare_schemas` or
`compare.schemas` to establish any of those declarations. Call a schema helper
only when a structural schema difference is itself requested, and only after
the exact source documents have been observed and validated; copy each returned
`document_id` and exact schema JSON Pointer from those documents. For the
reviewer-native comparison tool, each source must be returned by
`bos_list_context_tools` or `bos_https_describe`, or pass
`acceptance_validate_installed` with `valid: true` for its actual document type,
including a validated legacy `api-contract` response. Identity, readiness, and
ordinary text documents are not schema evidence. If either validated document
or exact schema pointer is unavailable, leave that structural comparison
unresolved and report the missing evidence. Never guess, reuse, or reconstruct a document identifier or schema pointer.

Report execution transport only when the operation's `execution.transport`
field explicitly declares it. HTTPS Describe is the contract retrieval
transport; it does not establish the operation's execution transport. When
`execution.transport` is absent or null, state that execution transport is
unspecified and leave it unresolved. For limits, enumerate every field and
literal value present in each operation's `limits` object in the comparison;
preserve fields that appear on only one operation and do not omit less
prominent limits. Mark an absent declaration as unavailable instead of
inferring or defaulting it.

If the requested operation key is not advertised, a key is missing from the
response, or its response cannot be retrieved and validated, report that part
of the comparison as unresolved and identify the missing evidence.

For legacy discovery, follow the exact advertised `api.contract.get` link with
its returned input and validate that response envelope as legacy evidence. Do
not relabel its transport or infer an HTTPS Describe observation.

For identity-v2 application discovery, validate the application resource with
`app-describe` and each complete HTTPS Describe parent response with
`operation-describe`. That parent validation covers its returned operation
contacts. Apply `api-contract` only to an actual legacy `api.contract.get`
response envelope. Retain every failed discovery or validation observation and
report its effect on the requested assessment.

For BOSL schema, reference, and examples, resolve each stable resource identity
against the fresh resource catalog returned for the selected context. Select
the single matching resource and read its exact server-advertised scoped URI.
Preserve that URI verbatim; the server owns its context selector. Missing or
ambiguous matches stop the read. Never append, construct, substitute, or guess
a context handle or invocation URI.
# BOS App Discovery

First execute the first-action tool lookup in `bos-mcp-client`. Resolve deferred
`bos_get_context` through the advertised callable inventory (including Codex
`functions.exec` / `ALL_TOOLS` when available) before resource listing or UI
diagnostics. A resource list alone cannot establish missing BOS tools.

GPT owns request routing, planning, service selection, API invocation, and
cross-app evidence composition. BOS MCP supplies current server-authorized scope choices for identity-v2
and the exact grant-bound scope and advertised directory for legacy discovery. Each selected app MCP supplies its own graph, plugins,
services, goals, and machine-readable API contracts.

Read [the discovery contract](references/discovery-contract.md) before the first
app-directory or per-app MCP query in a request.

For Agent-Driven Custom Journey authoring, obtain a fresh application
description through current advertised discovery and validate its BOSL resource
links with `scripts/validate-discovery.mjs`. Use the identity-v2 resource
selection and validation rules above; legacy discovery calls its advertised
`app.describe` with `{}`. Read each exact advertised schema, reference, and
examples URI through the same authenticated BOS connection. Then call
`plugins.list` with `{}`, preserve readiness separately from accessibility,
copy the selected plugin's complete `service.describe` input verbatim, and
validate compact/detailed journey agreement. Follow each returned
operation-contract link through current discovery with the link's exact input.
Read and validate the advertised journey-registration contract before assessing
compiler/runtime feasibility, limits, required inputs, or prerequisites.

For a read-only assessment of journey feasibility, validate the fresh
application description and follow its `journey_registration.contract` using
the exact advertised `capability` and `input`. Validate that actual response
with `api-contract` and assess its raw BOSL input/output schemas, required
fields, supported node types, guarantees, execution, compiler/runtime limits,
and public errors. Read the actual service catalog and relevant service or
operation contracts for capabilities and readiness the assessment requires.
Read additional advertised BOSL schema, reference, or examples resources when
those observations leave required grammar or feasibility evidence missing.
Preserve that missing evidence explicitly. A read-only assessment ends with
evidence and performs no registration or journey execution. Actual authoring
retains the full resource and contract prerequisites above.
Validate a complete identity-v2 HTTPS Describe response with
`scripts/validate-discovery.mjs operation-describe`, covering its returned
contacts. Validate an actual legacy `api.contract.get` response with
`scripts/validate-discovery.mjs api-contract`. Preserve the requested semantic
operation, selected structured source when the
link belongs to a plugin, deterministic execution URI, schemas, source
readiness, exact duration/fan-out limits, and private non-cacheable metadata.
An HTTP Describe operation identifier alone supplies no `api.contract.get`
lookup input. Use only an explicitly advertised operation-contract link and its
exact returned input; when that link is absent, report the missing BOSL contract
evidence and retain the validated HTTP description for its declared purpose.
Never derive a legacy semantic identifier from an HTTP operation name.
`bosl_server_node: true` requires `node_type: server`; a deterministic API with
`bosl_server_node: false` omits `node_type` and remains callable outside a
journey but cannot be authored as a BOSL server node. Never infer either
classification. Missing limits are unavailable, never defaulted. Cache only linked
resources and individual plugin descriptions under `bos-mcp-client`'s journey
contract cache; `app.describe` itself remains fresh and non-cacheable.

Treat a detailed `service.describe.journey` as a composition source for an ad
hoc workflow. A `service.describe.behavior` is explanatory topology and never
becomes an executable node. A domain skill may contribute client-node goals,
constraints, evidence requirements, and presentation without creating a server
operation. The workflow orchestrator selects the smallest useful set of those
contributions for the current objective.

## Current-host read execution

Use the current authenticated BOS capabilities for the requested operation.
After `bos_get_context` revalidates the connection's scoped grant, resolve a
live-discovered read operation whose descriptor covers the requested data.
Invoke its exact schema without client-supplied authority fields and continue from the
returned evidence. For an advertised app MCP or API, use its contract when the
host can execute it with the required authentication. Select the supported
operation from current evidence; do not impose a preferred future transport or
require a second connection for an already callable authorized BOS operation.

All supported operations belong to one current operating contract. Discover
callable names from the host catalog and argument constraints from current
validated operation contracts; never invent endpoints or selectors.
Directory or transport limitations remain scoped to that operation. An
access denial never permits switching routes to evade it. Missing or ambiguous
context, revoked grants, and explicit access denials stop the affected operation.
Every operation retains request-time server authorization.

## Accessible inventory and readiness assessments

For an explicitly comprehensive BOS contract inventory, use the response format below before
writing a summary. Fill it only from retained, current observations; never
replace an absent row with a guessed capability, role, constraint, or route.

### Ordered evidence workflow for a full inventory

Complete these steps in order before drafting the answer. Maintain one working
ledger from current observations; do not write a completeness summary until the
ledger passes the final coverage check.

1. **Bind identity.** Use fresh authorized contexts to identify the selected
   organization, application, installation, and role. For identity-v2, record
   accessible application, installation, and role choices only from their own
   fresh context rows. Reconcile every access claim against those rows; keep
   configured role definitions separate as application metadata.
2. **Enumerate the sources.** Record every native tool returned by
   `bos_list_context_tools` for each observed context, every operation key
   advertised by each `app.describe` contact, every separately advertised
   `journey_registration.contract`, and every returned public plugin/service entry. Preserve exact names and semantic identifiers. Keep
   aliases as separate rows; aliases sharing the same exact contract link in
   the same context may share one validated observation.
3. **Resolve and validate each contract.** Follow every advertised
   `_meta["bos/apiContract"]` and application `journey_registration.contract`
   through their returned capability, exact input, and current catalog. Retrieve
   and validate the actual registration response with `api-contract`; public
   Describe coverage does not replace this separate observation. Retrieve every
   required public operation description in
   batches within its advertised maximum. Validate the complete returned
   document and retain its exact source, operation, version, and observation
   time. Mark missing or failed descriptions unresolved.
4. **Compare only observed schemas.** Do not call schema comparison with a
   document ID or schema pointer until that exact document and pointer have
   been returned and validated in this assessment. If validation or comparison
   fails, retain the attempted document/mode, exact error, and recovery result;
   do not invent or reconstruct identifiers, retry with guessed inputs, or
   report a comparison as successful. The packaged [schema comparison
   helper](scripts/compare-schema-surfaces.mjs) compares exact declared schemas
   in batches of one to 32 pairs. Schema differences establish no semantic
   correspondence, validation, interoperability, authority, or readiness.
   Keep a comparison ledger with one entry for every submitted pair and result.
   Record the exact native and public operation labels and schema pointers for
   each side, whether declarations match, and every returned difference. Link
   a native operation to a public operation only through its exact advertised
   contract reference; similar names or schemas do not establish a counterpart.
   A schema comparison reports structural differences and never creates or
   proves an advertised relationship.
5. **Complete every ledger row.** For each native operation and public
   counterpart, compare required and optional inputs, accepted values and
   bounds, selectors, write-target shapes, output shapes and media, effects,
   limits, pagination, idempotency, version, and transport. Copy each value from
   that operation's own validated contract. State both exact declarations and
   their source surfaces for every difference; mark absent declarations and
   missing counterparts explicitly. Include zero-input `{}` actions as
   available actions, and report failed validation separately from any observed
   recovery.
6. **Reconcile access, readiness, and freshness.** Attribute each readiness or
   prerequisite value to its exact application, operation, or source; an empty
   plugin list means that application's returned catalog is empty. Preserve
   conflicting declarations, including cursor fields alongside
   `pagination_supported`, and leave the affected conclusion unresolved. Use an
   exact `evaluation_reference_time` when the current task or reviewer supplies
   one; otherwise use the latest verified guard `reference_time`. State that
   reference and calculate age from the response's literal `observed_at`; never
   substitute fetch time or memory. Without a verified reference, report age as
   unverified. Fresh authorization establishes access, while current readiness
   requires its own timely evidence and execution prerequisites; label it
   **unverified** when either is missing or stale.
7. **Audit, then write.** Use source-keyed rows so evidence from different
   operations cannot collapse together. The final answer contains separate
   rows for each native operation (including each alias), each described public
   operation, and each schema-comparison result. Native and public rows include
   their exact advertised counterpart or `No observed counterpart`, execution
   mode, input/output constraints and bounds, effects, limits/pagination,
   version/time, validation result, and unresolved differences. Comparison
   rows identify both exact operation/source labels and pointers, then carry
   every returned declaration difference; never assign a comparison result to
   a different operation because its schema looks similar. Count native
   operations, alias rows, public operations, exact advertised links, submitted
   schema pairs and returned comparison results, and unresolved rows. Counts
   must match the corresponding rows and observations. If any source,
   description, comparison, required field, or validation is missing, label the
   inventory incomplete and identify the affected rows before any summary.
   Carry every observed difference into the answer; examples never stand in
   for unlisted operations. Follow the final-output reconciliation procedure
   in [the discovery contract](references/discovery-contract.md).

Copy execution mode from each operation's validated contract: label
`journey_runtime` as journey runtime and label HTTPS only when the operation
declares that route. Describe returned data from its output schema, never from
the operation name; do not claim file contents unless the schema declares them.
Report a version only when declared, and say `not declared` otherwise. Keep
each required business operation's own fail-closed gate.

## Execute BOS resource discovery

After `bos_get_context` revalidates the scoped grant, perform resource discovery
through the existing authenticated BOS connection in the same request. Context
alone does not inspect the app directory. Do not gate BOS resource discovery on dynamic MCP attachment
or authenticated API invocation capabilities needed at later steps.

1. Use the host's MCP resource listing facility for the configured BOS server.
   In Codex, use `list_mcp_resources` with that server's configured name, then
   `read_mcp_resource` with the exact server and URI returned by the listing.
   These host facilities are separate from the BOS callable-tool catalog;
   an absent directory tool does not establish absent resource discovery.
2. Inspect returned resource descriptors for app-owned data and operation
   schemas that cover the request, including resources bound to the scoped
   grant. For an operation schema supplementing an already callable tool,
   apply Resource-owned operation schemas in `bos-mcp-client`.
   Read a matching resource through its exact listed URI before expanding into
   separate app discovery. A directory or manifest read is needed only for
   unresolved app identity, scope, or missing evidence; its timeout must not
   block an independently listed, authorized data resource.
3. Follow resource-list pagination when needed to locate the advertised
   discovery manifest or installed-app directory. Read that resource. If the
   manifest advertises `directoryUri`, follow the exact returned URI through
   a supported resource read; when the host requires a listed URI, locate it
   in the resource inventory first. Never construct a directory or app URI.
4. Use resource templates only when discovery requires them and the host
   exposes that facility. A `resources/templates/list` response of
   `Method not found` means that optional method is unsupported; continue
   with listed resources and supported reads. It does not invalidate a
   successful resource list or read.
5. Resolve the directory's advertised scope and version, validate that each
   contact belongs to the already-bound grant, and continue
   the app discovery workflow immediately. Treat directory metadata as
   discovery evidence; it never authorizes cross-organization business reads.

For a transient timeout or transport failure of a read-only resource list/read,
follow only the host- or service-published recovery action and declared timing.
Reinitialize only if the host reports a closed session and supports it. Never
treat an authorization denial as a timeout. When no recovery action exists,
preserve completed independent reads and identify the failed operation and
observed outcome. Never replay a request or guess an unlisted URI.

When discovery is advertised as a tool, use its live descriptor and schema.
An empty tool search must still proceed to the available resource facilities.
Keep BOS directory resource reads on the BOS product connection. Use server-returned application contracts through the same BOS connection
when supported. A contact alone never creates another login or grants authority.

## App discovery workflow

1. Use `bos-mcp-client` to authenticate and revalidate the connection's exact
   organization, application, installation, and role grant. Supply no client
   organization, role, or context selector.
2. Execute BOS resource discovery above. Use app-owned resources that already
   provide the required evidence with valid scope; otherwise read the
   authenticated installed-app directory or its live advertised tool. Validate every returned
   app contact before using it. BOS identifies available apps; GPT shortlists
   apps from their returned descriptions and the user's intent.
3. For evidence still missing, query each selected app MCP through the exact
   contact returned for this request. Discover its semantic equivalents of `app.describe`,
   `graph.describe`, `services.list`, `plugins.list`, `service.describe`, and
   `api.contract.get`. These are semantic capabilities; use the versioned names
   and schemas returned by the app rather than assuming literal tool names.
4. Select the minimum app-owned services needed for the request. Read the
   machine-readable contract for every unfamiliar operation and classify it as
   read, propose, or mutate before invocation.
5. Call the discovered deterministic HTTPS API through a host-native
   authenticated HTTP capability. Use the returned HTTPS origin or opaque base
   reference, operation identifier, and audience requirement. For an
   identity-v2 HTTP execution, require the contract's static
   `execution.context_header` to equal `X-BOS-Context-Handle` and attach only
   the current opaque handle selected from fresh `bos_get_context`. Keep the
   handle out of the business body and add no client authority, OAuth/token,
   retry, idempotency, execution, or journey state. Invoke a
   `journey_runtime` execution through its journey contract instead of direct
   HTTPS.
   Registration and every returned journey lifecycle/state HTTP request use
   that same identity-v2 transport binding. The BOS adapter receives the fresh
   handle directly; dependent products and action payloads do not.
   Supply only schema-declared arguments. Keep bearer material in the host's
   credential boundary and out of prompts, generated headers, chat, files, and
   logs.
6. For cross-app requests, query app MCPs and APIs independently. Reconcile the
   results in GPT and preserve each fact's application, service, observation
   time, freshness, contract version, and correlation evidence. Label GPT
   inference separately.
7. Refresh BOS and app discovery after grant, graph digest/version, plugin,
   authorization, session-expiry, or app-contract
   changes. Re-resolve the operation from the refreshed contract for the next
   semantic request; never automatically replay the failed operation.

For journey registration, descriptor changes cause a fresh authoring read. They
never create a registration precondition or automatic refresh-and-retry branch.
Registration always submits the complete raw BOSL document to its currently
discovered operation.

## Validation and failure behavior

Accept an app contact only when it came from the current authenticated BOS
grant and contains a display identity, HTTPS MCP resource,
contract version, discovery epoch, capability families, and required scopes.
Reject cross-grant reuse and any descriptor containing raw organization,
membership, role, installation, credential, or persistence identifiers.

Before an API call, validate HTTPS transport, operation availability, request
and response schemas, side-effect class, context and audience binding,
provenance guarantees, version, and typed failures. Discovery describes
capability and never grants execution authority; the app API revalidates current
canonical scope.

Return the most specific typed state available, including
`source_not_available`, `app_not_installed`, `app_discovery_stale`,
`app_contact_invalid`, `host_capability_unavailable`, `app_mcp_unavailable`,
`api_contract_invalid`, `context_mismatch`, `authorization_denied`,
`provider_recovery_required`, or `partial_result`. Preserve completed independent
reads when another app fails.

Diagnose failure at the step actually reached. Record the failed operation,
observed result, supported recovery attempted, and which later steps remain
unattempted. A successful context call alone or a missing domain tool name
cannot justify `host_capability_unavailable` for app discovery. A malformed
contact is `app_contact_invalid`; preserve a server-returned denial or error
instead of relabeling it as a host limitation.

After reading and validating the directory, query the returned app contact
through the host's available supported facility and continue contract discovery
and API reads. If the required facility is absent, establish that from the
current host capability inventory; if it exists, attempt the operation and
apply supported bounded recovery before diagnosing failure. Return
`host_capability_unavailable` only for that evidenced missing host operation,
identify the completed discovery steps, and preserve the pending request.
Never describe a later unattempted API as a failed server capability or demand
a server change from a host limitation. Use no browser,
web interface, DOM inspection, cached selector, or hardcoded app endpoint.
Apply Current-host read execution to authorized reads; a per-app
failure does not erase their independently verified evidence.

BOS web and mobile remain generic render shells for server-provided UI and
actions. Keep app selection, graph interpretation, endpoint selection, and
cross-app composition in GPT.
