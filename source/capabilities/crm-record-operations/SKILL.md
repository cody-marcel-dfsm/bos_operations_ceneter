---
name: crm-record-operations
description: Find, list, create, update, delete, or remove organization-described Lead Director records through live discovered operations. Use for natural-language CRUD requests while preserving exact source targets, point-in-time evidence, guarantees, and mutation receipts.
---

# CRM Record Operations

Use `bos-mcp-client` on the BOS platform connection. This reusable workflow
ships in Education Center and uses the BOS connection scoped to the authorized application for authenticated
application discovery. Invoke each business operation through the exact live
tool or deterministic HTTPS API advertised by that scoped product connection;
the BOS Service owns source execution.

For any lead or contact detail request, invoke `crm-customer-journey` as
part of the read and present its rich graph view by default, including for a
single requested field. Return that field and relevant profile details below
the graph. Resolve contact graph membership from application evidence and
preserve verified details when graph evidence is partial or unavailable.
The user need not ask for a journey or specify a goal. Follow explicit user
format instructions and keep the request read-only.

## Lead Director access patterns

Route by the user's operation and requested scope: search or list by supported
filters, inspect one or several selected leads, create a lead, update declared
fields, or delete when the current server contract supports it. Accept natural
language, contact fields, and current server-issued selectors as lookup inputs
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

Whenever a lead is displayed, invoke `crm-customer-journey` and apply its
Every displayed lead uses the detailed format contract. This includes create
and update receipts, duplicate/already-existing matches, previews, and every
lead displayed in a list. Retain filters/order/pagination while rendering each
lead separately. After a confirmed write, read the exact resulting lead if
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
host envelope. Derive writable name/contact fields and idempotency bounds from
that schema; record display fields do not establish create inputs. Discovery
success alone never proves that a create or update executed.

## Creates and updates

For a requested lead creation, resolve the source pair from current
server-returned source metadata in the current scoped connection, matched to the user's
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

1. Resolve the exact lead from current-context search, exact lookup, or a valid
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
