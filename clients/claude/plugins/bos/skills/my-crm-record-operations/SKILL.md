---
name: my-crm-record-operations
description: Find, list, create, update, delete, or remove Lead Director leads and CRM contacts through live discovered operations. Use for natural-language CRUD requests, including LD shorthand, while preserving exact targets, source identity, versions, duplicate checks, and mutation receipts.
---



## Organization scope preflight

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context`. Select exactly one authorized
organization in this order: an organization explicitly named in the current request;
the shared `default_organization_label` after exact normalized validation against
the returned organization labels; or the sole authorized organization. Read and
validate the saved label with
`../bos-mcp-client/scripts/client-preferences.mjs`. For tools whose live schema
requires a context selector, pass only the selected role's opaque `context_id`.
Never add organization or context arguments to an operation whose schema derives
scope from the authenticated server context.
Use this same selection for BOS installed-app discovery. Pass only the opaque app
context and API authority returned under that selection to a discovered app MCP
or deterministic HTTPS API; never reconstruct or substitute raw authority IDs.

When several organizations are available and the default is missing, stale, or
ambiguous, return `configuration_required` and resolve one default before domain
execution. An organization named for the current request overrides the selection
and does not rewrite the saved default. Never fan out across organizations unless
the user explicitly requests that bounded scope. The display-label preference selects among
current server-returned contexts and never grants authority.

## Client mutation safety

Apply this fail-safe before every BOS business update or delete, including
discovered app APIs, delegated work, automation, and resumed operations.
Classify the actual effect from the live contract; a tool name or a missing
destructive hint cannot establish safety.

- Limit updates and deletes to one exact business record in the entire logical
  task. Multiple fields on that record are allowed. Count distinct source
  records and cascading effects, including synchronization, replacement,
  archive, soft delete, and removal. Unknown scope or more than one affected
  record blocks execution before the first write. Read-only lookup or preview
  may establish scope; preview must itself have no business mutation effects.
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
- An exact single-record update retains the workflow's existing authorization
  rules. Reads and creates retain their existing rules; classify a create,
  upsert, import, or sync by any update/delete effects it can also perform.
  Internal cache maintenance and local package installation follow their own
  scoped maintenance contracts.
- After an uncertain mutation, reconcile its status before considering replay;
  confirmation never proves that a retry is safe. Report verified receipts.

This is an agent instruction safeguard. Server authorization and validation
remain required; the package does not intercept or enforce arbitrary API calls.

# My CRM Record Operations

Use `bos-mcp-client` and `bos-app-discovery` on the authenticated BOS connection.
This workflow is distributed by the root BOS package and operates independently
of the optional My CRM product. The discovered application service owns each
business operation and source execution.

For any lead or contact detail request, invoke `my-crm-customer-journey` as
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

Use `bos-mcp-client` and `bos-app-discovery` current-host read execution for
available authenticated Lead Director reads. Choose a direct, search, filtered,
paginated, or batch operation from its live schema; reuse current-context
results where valid. The provider-neutral service sequence below applies to
that advertised contract. A supported Lead Director operation may expose a
different schema: follow its declared fields, authority, and side-effect class.
Do not impose a federated source inventory on a native operation whose contract
does not require it. Keep provider execution server-owned.

Whenever a lead is displayed, invoke `my-crm-customer-journey` and apply its
Every displayed lead uses the detailed format contract. This includes create
and update receipts, duplicate/already-existing matches, previews, and every
lead displayed in a list. Retain filters/order/pagination while rendering each
lead separately. After a confirmed write, read the exact resulting lead if
needed and display its current graph and profile without waiting for another
user request. Graph discovery is a post-result read; it never replays a write
or erases a verified receipt. If graph reads fail, retain the outcome and show
the detailed partial-evidence view. Honor explicit user output formats.

Discover each requested CRUD operation independently from the current callable
catalog and advertised application contracts. Create or search support does not
establish update or delete support. An absent tool name requires supported
app-operation discovery; an explicit server prohibition applies to its stated
scope and must not be bypassed through a different endpoint. Distinguish an
unavailable operation from an authorization denial and a transient transport
failure. Report the exact missing operation and observed contract; never claim
complete CRUD support from create/read acceptance alone.

Apply the BOS client mutation safety contract before every write: updates and
deletes affect at most one record per logical task, including source records
and cascades. Block bulk or unknown scope before the first write. Preserve
version, idempotency, and server authorization requirements. For creates and
single-record updates, exact user instructions supply authorization unless the
live contract requires an additional confirmation artifact. Every delete needs
confirmation after the concrete target and effect are presented. Never simulate
a missing delete through another operation.

## Reads

1. Discover the app-owned provider-neutral CRM record operation and compile one
   normalized record query from its current schema. For explicit source scope,
   validate the exact `lead-director-crm-sources/v1` inventory returned by the
   discovered `crm.sources.list` operation first.
2. Omit source selection for all enabled and authorized sources, or pass one or
   more exact opaque handles returned by current service discovery. Invoke the
   operation once and preserve its server-returned source results and errors.
3. For `merged_view`, present the service's returned federated records. Keep
   its match confidence, field-level provenance, and conflicts unchanged.
4. Render origin, last update in local time, age, maximum age, and coverage.
5. For one exact record, select `crm.records.get` only from the discovered
   service. Send `{recordHandle}` using the opaque handle returned by the
   current search or get response. Accept only
   `lead-director-crm-get/v1` for the same context, authority epoch, service,
   and requested record handle.

For a generic or cached callable schema, use `bos-mcp-client` Resource-owned
operation schemas. Read the advertised context-bound application operation
resource, match the exact callable and use its current input schema within the
host envelope. Derive writable name/contact fields and idempotency bounds from
that schema; record display fields do not establish create inputs. Discovery
success alone never proves that a create or update executed.

## Creates and updates

1. Resolve the exact current source descriptor from the validated
   `lead-director-crm-sources/v1` inventory and verify that it is `ready`
   and advertises the requested provider-neutral capability. Select
   `crm.records.create` or `crm.records.update` only from the discovered
   service. Require the discovered operation to advertise its exact HTTP
   method, `sideEffect: write`, and `idempotent: true`.
2. Request the service's duplicate check before create when a stable identity
   value exists and the live contract advertises one.
3. For create, send exactly `{sourceHandle, changes, idempotencyKey}`. For
   update, send exactly `{recordHandle, expectedVersion, changes,
   idempotencyKey}`. Use the current server-returned version and accept only
   provider-neutral change fields declared by the live schema.
4. Satisfy the discovered service's confirmation contract using the exact
   target and changes authorized by the user. If it requires a deterministic
   confirmation identity, bind approval to that identity. Obtain new approval
   only when required by the contract or a material target/change difference;
   never treat an unrelated prior approval as authorization.
5. Invoke the discovered service operation once. Accept only
   `lead-director-crm-mutation/v1` for the same context, authority epoch,
   service, source, and operation. Report the server receipt and
   `underlying_source_guarantee` without strengthening it.
6. Invalidate or refresh affected query caches after a confirmed commit.

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
4. Pass the exact declared delete arguments, concurrency version and stable
   idempotency key where supported. Execute once. After an uncertain result,
   reconcile using its operation identity or a supported exact read before any
   retry. Never blindly repeat a destructive operation or invent a tool.
5. Verify the structured deletion receipt and the contract-defined postcondition
   through a fresh read/status when available. Report already-deleted, conflict,
   denied, failed, and unknown outcomes accurately. An empty search alone does
   not prove deletion; identify any postcondition that could not be checked.
6. Show the verified deletion receipt within the detailed lead view. Mark the
   record Deleted and any retained pre-deletion graph as historical with its
   observation time; never depict a deleted record as currently active.

Use multi-source synchronization only through an explicitly discovered
server-orchestrated operation. A record mutation never grants synchronization
or deletion of other records.
