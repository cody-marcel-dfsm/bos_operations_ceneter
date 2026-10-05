---
name: bos-app-discovery
description: Route requests through authenticated BOS app discovery, including finding skills and operations that can contribute to an ad hoc dynamic BOSL workflow. Use when app scope, service ownership, workflow composition, graph shape, or API contracts must be discovered at runtime.
---

## Requests to list available tools and workflows

When the user asks what tools, workflows, or operations are available across
BOS applications, perform a read-only full inventory before summarizing. Apply
`bos-mcp-client`'s first-action and identity-context rules, establish the exact
authorized contexts, and enumerate native tools separately for each context.
Read each exact advertised application description and service catalog. For
every advertised HTTPS Describe contact, retrieve all operations in the
contact's bounded batches and validate the complete returned parent document.
Follow each native tool's exact advertised API-contract link, compare its
declared input and output schemas with the public contract, and preserve any
unresolved or unavailable counterpart. Report coverage counts and the complete
per-operation inventory using the table and freshness rules below; label the
inventory incomplete whenever a required description, comparison, constraint,
or validation is unavailable. Do not execute business operations or mutations
for this discovery request.

Before drafting, audit the evidence row by row. State organization, application,
installation, and role only when the selected fresh context explicitly returns
them; never infer additional access from examples or role names. Retrieve and
validate each advertised public HTTPS Describe response before calling its
operations described; a native tool list or `app.describe` alone does not
establish that observation. For every native and public operation, retain its
exact required and optional fields, field constraints and bounds, output
shape, limits, pagination, version, observation time, and validation result;
leave any unsupported field unresolved. Immediately before calculating ages,
read guard status again and use that response's exact `reference_time` for all
age calculations and the stated reference.


For live `bos-identity-mcp/v2`, first apply [identity-context compatibility](../bos-mcp-client/references/identity-context.md).
Its fresh authorized-context selection and saved-default rules govern this
workflow; single-context grant wording below applies to legacy discovery.

## Requests to compare application API contracts

When a request asks to explain, compare, or validate a named application API
operation's input or output schema, effects, field bounds, limits, pagination,
or error declarations, retrieve the operation-level public contract from the
current authorized application before writing the comparison.

For live `bos-identity-mcp/v2`, use the exact advertised HTTPS Describe contact
through the host-native authenticated HTTP capability. Request only the needed
operation keys within that contact's declared batch maximum, preserve the
returned document and operation contacts, and validate the complete parent
response with `operation-describe` before comparing. A native tool descriptor
or MCP semantic capability `app.describe` result is a separate evidence
surface. It does not substitute for an advertised HTTPS Describe response or
establish HTTPS observation. If the contact is absent or the response cannot be
retrieved and validated, report the requested comparison as unresolved and
identify the missing evidence instead of claiming it is complete.

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

For Agent-Driven Custom Journey authoring or a read-only assessment of journey
feasibility, obtain a fresh application description
through current advertised discovery and validate its BOSL resource links with
`scripts/validate-discovery.mjs`. Use the identity-v2 resource selection and
validation rules above; legacy discovery calls its advertised `app.describe`
with `{}`. Read each exact advertised schema, reference, and examples URI through
the same authenticated BOS connection. Then call `plugins.list` with `{}`, preserve readiness separately
from accessibility, copy the selected plugin's complete `service.describe` input
verbatim, and validate compact/detailed journey agreement. Follow each returned
operation-contract link through current discovery with the link's exact input.
Read and validate the advertised journey-registration contract before assessing
compiler/runtime feasibility, limits, required inputs, or prerequisites. A
read-only assessment ends with evidence and performs no registration or journey
execution.
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

For any request for a full BOS inventory, use the response format below before
writing a summary. Fill it only from retained, current observations; never
replace an absent row with a guessed capability, role, constraint, or route.

1. **Authorized identity:** report the selected organization, application,
   installation, and role exactly as one fresh `bos_get_context` row returned
   them. Do not list other roles unless each has its own fresh authorized
   context row. Omit role examples and common role names from memory.
2. **Coverage totals:** state counts for observed native operations, described
   public API operations, exact linked pairs, aliases, and unresolved rows.
3. **Evidence table:** include one row for every advertised native operation
   and every described public API operation.

| Scope and source | Exact operation and aliases | Exact counterpart or no observed counterpart | Declared execution mode | Input/output constraints and bounds | Limits and pagination | Contract version, observed time and age | Validation attempts, errors, recovery and current result |
|---|---|---|---|---|---|---|---|
| Copy the application/service and source surface | Copy observed names verbatim | Copy the exact link or state `No observed counterpart` | Copy `journey_runtime`, HTTPS, or the observed mode | Copy declarations and exact differences | Copy observed values | Copy observed version/time; calculate age from the latest guard `reference_time` | Record every attempted document/mode and result; include failures and any observed recovery |

Do not describe coverage as complete when a table row, required description,
linked contract, exact constraint, or validation result is missing. Keep the
failed observation and its effect visible. When an advertised action has an
empty input schema and accepts `{}`, report it as an available zero-input
action; do not call its inputs or operation missing. Report a failed validation
and its recovery separately, and claim recovery only after observing its
result.

For identity-v2, use fresh authorized contexts to identify application and
installation choices accessible in the selected organization and role. Read
and validate each applicable advertised application description and service
catalog through its authorized context. Attribute readiness and prerequisites
to their exact application, operation, or source; an empty plugin list means
that application's returned catalog is empty. Preserve contract versions and
observation timestamps when returned.

Build accessible application, installation, and role rows from fresh authorized
contexts. Use the selected context's role for the current identity. Before
presenting the inventory, reconcile every access claim against those rows.
Include configured role definitions when the user explicitly requests them,
with their application-catalog provenance. Follow the final-output reconciliation
procedure in [the discovery contract](references/discovery-contract.md).

For a full inventory, account for every operation key advertised by each
app.describe contact and every returned public plugin/service entry. Resolve
the necessary operation descriptions in batches within that contact's advertised
maximum, and explicitly identify any unresolved description. Group capabilities
for readability while preserving complete coverage of the advertised operations.

Include every native tool returned by `bos_list_context_tools` for each observed
authorized context. Follow an advertised `_meta["bos/apiContract"]` through its
returned capability and exact input, resolving that capability in the current
catalog. Preserve the advertised semantic identifier verbatim. Account for
aliases separately; aliases sharing one exact contract link in the same context
can use one validated observation within this assessment. Reconcile native
input and output schemas with the linked execution contract: required and
optional fields, accepted values and bounds, response shapes, limits, pagination
and transport. State each observed difference with both exact declarations and
their source surfaces. Preserve unresolved differences without assuming a
translation or supplying an execution guarantee.

Build a complete internal comparison ledger with a row for every native
operation and its observed counterpart, retaining each alias. Cover required
and optional inputs, field constraints, selectors, write-target shapes, version
and idempotency declarations, output shapes and media, effects, limits,
pagination and transport. Mark a missing counterpart or declaration explicitly.
Check the ledger against the original catalogs and carry every identified
difference into the final assessment; a representative example does not cover
the other operations. The packaged [schema comparison helper](scripts/compare-schema-surfaces.mjs)
compares exact declared schemas in batches of one to 32 pairs. Use the host's
verified local comparison capability when available, with original observed
schema references. Its complete differences prove no semantic correspondence,
validation, interoperability, authority or readiness; retain those separate gates.

For a full inventory, present a final reconciliation table with a row for every
advertised native operation and every described public API operation. Use the
exact operation name and application/service scope. Include its exact linked
counterpart or state `No observed counterpart`, its declared execution mode,
input and output constraints, limits and pagination, contract version and
observation time, validation status, and any unresolved difference. Count the
native rows, public API rows, exact comparisons, and unresolved rows before
calling the inventory complete. Keep aliases visible in the row or identify
their shared exact contract link.

State the current identity role from the selected fresh context row verbatim.
List additional accessible roles only when separate fresh authorized context
rows establish them. Present configured role definitions as application
metadata, separate from current access. For each capability, copy the exact
execution mode from its observed contract: label `journey_runtime` as journey
runtime, and label HTTPS only when the current contract describes that route.
Use the exact advertised API-contract link and its returned schema when
reconciling native and public operations. Record failed or unavailable
observations in the table and preserve their effect on the assessment.

For readiness and current-capability assessments, report the response's literal
observation timestamp. Calculate its age only from a verified current host,
context or server reference time, and state that reference alongside the
calculation.
When no verified reference is available, report the literal timestamp and that
its age is unverified; do not estimate a current time. Fresh authorization and a newly retrieved response establish
authorized retrieval; current readiness requires its own timely facts and
execution-prerequisite evidence. Label current readiness **unverified** when
that evidence is missing or stale, including in the headline. Attribute
availability values to the advertised contract and list the observed
prerequisites and freshness limitation. Preserve `observed_at`; never substitute
the fetch time for it. Continue the bounded read-only assessment with those
limitations, and retain each required business operation's own fail-closed gate.

A request to list accessible apps, audit readiness, compare contracts, or assess
workflow feasibility is fulfilled by that bounded evidence, including explicit
empty states and unavailable capabilities. Describe the scope actually observed
and any remaining inventory limitation. Require an organization-wide directory
when the requested facts extend beyond the fresh authorized choices and scoped
descriptions. A required business read or execution still stops when its own
prerequisites are unavailable.

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
