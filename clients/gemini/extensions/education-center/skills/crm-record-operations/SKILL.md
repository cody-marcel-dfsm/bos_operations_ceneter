---
name: crm-record-operations
description: Find, list, create, update, delete, or remove organization-described Lead Director records through live discovered operations. Use for natural-language CRUD requests while preserving exact source targets, point-in-time evidence, guarantees, and mutation receipts.
---




## Product initialization preflight

Before performing this skill's workflow, preserve the pending request and
complete the product's host-managed BOS authentication. Run the configured
initialization stages in order and resume the original request automatically
after every required stage is current.

First validate the customer-owned `config/customer-settings.json` against
`config/customer-settings.template.json`. Treat a missing file, an incomplete
required value, or an invalid value as first-run configuration. Also migrate a
missing/invalid `default_context` or missing/invalid product-specific BOS
customer preference store. Restore a confirmed valid mirror for this plugin without asking again;
confirm a new default once through the consolidated setup. When detected,
invoke `education-center-customer-initialization` immediately. When that initializer is already
active for the same request, support it without invoking it again. Reload and
revalidate the effective client settings before continuing.

For live `bos-identity-mcp/v2`, discover the requested operation first. Missing
optional plugin-profile setup tools do not block an independently advertised
ready operation with no declared dependency on that setup. Keep that profile
setup incomplete, preserve operation-specific readiness requirements and
denials, and continue the requested operation without initializer recursion.
Otherwise, after client settings are current, validate the scoped grant's live
plugin-service inventory, organization business profile initialization epoch,
required canonical field states, and local completion
receipt. Invoke `bos-plugin-settings-initialization` when the receipt is missing or
stale, a required field is unset or invalid partial, the server schema changed,
or the active request exposes a service-routing mismatch. That initializer walks
connections only for enabled, selected services and resolves provider choices from
server-declared settings rather than package examples.
Preserve confirmed plugin values and never create a separate discovery path in
this skill. Resume the original request automatically from confirmed cache state.

## Scoped authorization preflight

First apply the versioned identity-context workflow in `bos-mcp-client`.
For live `bos-identity-mcp/v2`, resolve explicit request scope or the saved
customer default against fresh authorized contexts, discover tools for the
selected handle, and execute with that same handle. This branch governs
context selection throughout this skill, including older scoped-grant wording.
A missing operation never permits changing organization or role to find it.
The following single-context rules apply only to legacy scoped-grant discovery.

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context` to validate the exact scoped OAuth
connection. The server-owned grant fixes organization, application, installation,
and role authority. Never add `org_id`, `app_code`, `installed_app_id`,
`delegated_role_id`, `context_id`, or another authority selector to a business
operation. Invoke only the operation's live-declared business arguments.
Use the same scoped connection for BOS installed-app discovery. Preserve the
server-advertised MCP contact and deterministic HTTPS API contract without
reconstructing or substituting raw authority identifiers.

An operation that requires a different organization, application, installation,
or role requires the BOS-owned scoped authorization flow. The client never changes
authority by adding request arguments.

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

# CRM Record Operations

Use `bos-mcp-client` on the BOS platform connection. This reusable workflow
ships in Education Center and uses the BOS connection scoped to the authorized application for authenticated
application discovery. Invoke each business operation through the exact live
tool or deterministic HTTPS API advertised for that server-authorized application context;
the BOS Service owns source execution.

For any individual Lead Director record-detail request, invoke `crm-customer-journey` as
part of the read and present its rich graph view by default, including for a
single requested field. Return that field and relevant profile details below
the graph. Derive the entity label, fields, organization-specific custom values,
node type, actions, transitions, and UI/rendering instructions from current
organization Describe and record/graph evidence. Treat lead, contact, customer,
student, family, opportunity, and similar user terms as request vocabulary,
never as a fixed Lead Director entity model. Resolve graph membership from application evidence and
preserve verified details when graph evidence is partial or unavailable.
The user need not ask for a journey or specify a goal. Follow explicit user
format instructions and keep the request read-only.

Completion requires rendering the journey evidence, not merely invoking its
read operation. For every individual record-detail response, the response is incomplete
until it shows the verified current node, the application-resolved goal, every intermediate node
on the exact ordered path, and the path's returned gates or blockers. Include
the native graph view and the same readable text path before profile fields.
Never replace this path with a list of available actions, reachable states,
generic workflow options, or a current-status summary. If the first journey
result supplies only current state or actions, continue goal and path discovery
through the live operations required by `crm-customer-journey`. When an exact
path still cannot be obtained after those reads, label the result as a partial
journey and identify the precise missing goal or path evidence; never describe
that response as live and complete.

## Lead Director access patterns

Route by the user's operation and requested scope: search or list by supported
filters, inspect one or several selected records, create a record, update declared
fields, or delete when the current server contract supports it. Accept natural
language, organization-described fields, and current server-issued selectors as lookup inputs
only where the discovered schema supports them. Resolve ambiguous matches before
a targeted read or write. Never fabricate source or record selectors.

Use `bos-mcp-client` current-host read execution for
available authenticated Lead Director reads. Choose a direct, search, filtered,
paginated, or batch operation from its live schema; reuse current-context
results where valid. The provider-neutral service sequence below applies to
that advertised contract. A supported Lead Director operation may expose a
different schema: follow its declared fields, authority, and side-effect class.
Do not impose a federated source inventory on a native operation whose contract
does not require it. Keep provider execution server-owned.

Whenever a record is displayed, invoke `crm-customer-journey` and apply its
organization-described format contract. This includes create
and update receipts, duplicate/already-existing matches, previews, and every
record displayed in a list. Retain filters/order/pagination while rendering each
record separately. After a confirmed write, read the exact resulting record if
needed and display its current graph and profile without waiting for another
user request. Graph discovery is a post-result read; it never replays a write
or erases a verified receipt. If graph reads fail, retain the outcome and show
the detailed partial-evidence view. Honor explicit user output formats.

For `bos-identity-mcp/v2`, discover operations with `bos_list_context_tools`
for the already selected context and invoke them through `bos_execute`. Inspect
the selected context's capability report when its catalog omits a requested
operation. A top-level claim of delete support does not establish a callable
delete contract for this installation. Preserve evidence of that mismatch and
report the missing capability without probing a guessed delete name or changing
roles.

Discover each requested CRUD operation independently from the current callable
catalog and advertised application contracts. Create or search support does not
establish update or delete support. An absent tool name requires supported
app-operation discovery; an explicit server prohibition applies to its stated
scope and must not be bypassed through a different endpoint. Distinguish an
unavailable operation from an authorization denial and a transient transport
failure. Report the exact missing operation and observed contract; never claim
complete CRUD support from create/read acceptance alone.

Apply the BOS client mutation safety contract before every write. One logical
task may update or delete one conceptual record represented by one to five
explicit source records in one discovered request. Block multiple conceptual
records, bulk scope, or unknown scope before the first write. Preserve every
source target, service guarantee, approval instruction, and receipt. Supply no
client idempotency, retry, reconciliation, MVCC, or execution state. BOS Service
owns those behaviors. Every delete follows the service-returned review and
approval action. Never simulate a missing delete through another operation.

## Reads

1. Request Describe for the minimum operation set required by the task and
   compile one normalized record query from its current schema.
2. Omit `source` for a general search. When the user explicitly names a source,
   copy its complete current `{platform, application, plugin}` reference from
   Describe. Invoke the operation once and preserve its source-native records,
   opaque selectors, source results, and errors.
3. Keep source records distinct. CRM client reasoning may group records as one
   conceptual customer only after the response and must preserve evidence,
   confidence, provenance, conflicts, uncertainty, and freshness.
4. Render origin, last update in local time, age, maximum age, and coverage.
5. For one exact record, use a separate read operation only when current
   Describe advertises one. Otherwise use the described exact-search semantics.
   Copy the opaque public selector from current evidence and never substitute a
   provider identifier, internal node identifier, database key, or inferred
   record identity.

For a generic or cached callable schema, use `bos-mcp-client` Resource-owned
operation schemas. Read the advertised scoped application operation
resource, match the exact callable and use its current input schema within the
host envelope. Derive writable fields and idempotency bounds from
that schema; organization-described display fields do not establish create inputs. Discovery
success alone never proves that a create or update executed.

## Creates and updates

For a requested record creation, resolve the source pair from current
server-returned source metadata in the current BOS connection context, matched to the user's
requested application. Never manufacture `source_type` or `source_identity`
from the person's email, phone, name, role, context hint, or the word “manual.”
If the live contract requires an undiscoverable source selector, report that
exact contract gap. Follow only the service's authoritative result, returned
state action, or recovery instruction for a failed or uncertain request.

1. Resolve one complete create-capable source reference from current Describe
   for create. For update, preserve the one-to-five explicit targets selected
   for one conceptual customer. Require the discovered operation to advertise
   its exact HTTP method, write effect, limits, guarantees, and schemas.
2. Send create as the described `source` plus dynamic `changes`. Send update as
   one request whose `targets` each contain the complete source reference,
   opaque record selector, and source-specific `changes`. Validate every field
   against current Describe and reject duplicate `(source, selector)` pairs.
3. Supply no client duplicate pre-check, version, idempotency key, attempt
   identity, retry counter, or reconciliation decision. Consume the service's
   typed uniqueness/conflict result and service-owned idempotency behavior.
4. Satisfy the discovered service's confirmation contract using the exact
   target and changes authorized by the user. If it requires a deterministic
   confirmation identity, bind approval to that identity. Obtain new approval
   only when required by the contract or a material target/change difference;
   never treat an unrelated prior approval as authorization.
5. Invoke the discovered service operation once through its exact advertised
   HTTPS method and complete URI. Preserve one ordered outcome per target and
   report the advertised per-source and cross-source guarantees without
   strengthening them.
6. Invalidate or refresh affected query caches after a confirmed commit.

Inspect the structured result before reporting success. `isError: false` or a
completion message is insufficient. A result with `complete: false`, an empty
success list, or `source_mutation_failed` is a failed or partial operation.
Preserve the exact per-source error and follow only the exact service-returned
state action for an uncertain outcome. Never construct a reconciliation read or
replay the mutation. Present the verified record and journey only after
confirmed success. This is part of the current operating contract for this
capability.

## Deletes

1. Resolve the exact record from current-context search, exact lookup, or a valid
   prior result. Match the user's identifying details; disambiguate multiple
   matches before deletion. Use only the returned record/source selectors and
   current version required by the operation schema.
2. Discover the explicit delete operation and its semantics: permanent deletion,
   soft deletion, archive, and graph-state transition are distinct. Carry out
   only the requested supported operation; explain any required alternative
   without silently substituting it. A business graph read is required only
   when the delete contract requires it.
3. Establish that the complete effect touches one record, including cascades.
   Show the organization, application/source, exact record, deletion semantics,
   and consequences. Ask for confirmation of this prepared deletion and wait
   for the user's affirmative response. The initial delete request and an
   automation prompt never satisfy this step. Bind confirmation to the exact
   target, scope, version, and effect; re-confirm material changes. Obtain any
   server-required preview/confirmation artifact as well.
4. Send one delete request with the one-to-five exact targets. If the service
   returns `428 APPROVAL_REQUIRED`, present its exact target summaries and
   consequences, obtain explicit approval, and invoke its returned action
   verbatim. A changed target requires a fresh instruction and approval.
5. When the service returns `202 in_progress`, wait for its declared interval
   and invoke only its returned bodyless state action. Never replay the delete
   or send client retry, reconciliation, version, or idempotency state.
6. Verify the structured deletion receipt and the contract-defined postcondition
   through a fresh read/status when available. Report already-deleted, conflict,
   denied, failed, and unknown outcomes accurately. An empty search alone does
   not prove deletion; identify any postcondition that could not be checked.
7. Show the verified deletion receipt within the detailed record view. Mark the
   record Deleted and any retained pre-deletion graph as historical with its
   observation time; never depict a deleted record as currently active.

Use multi-source synchronization only through an explicitly discovered
server-orchestrated operation. A record mutation never grants synchronization
or deletion of other records.
