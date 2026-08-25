# My CRM product architecture

Status: active initial-product direction
Date: 2026-08-25
Owners: BOS Operations Center for client composition and skills; Lead Director
for application context, MCP runtime, CRM operations, and provider integrations

## Decision

My CRM is a provider-neutral CRM operating layer over customer and lead data in
the systems connected to BOS. It gives the user one CRM vocabulary for records,
pipelines, activities, and reconciliation while preserving the identity and
transaction guarantees of every source. A request may target one source, query
several sources independently, construct a merged view, or synchronize selected
facts from an authoritative source into other selected systems.

My CRM launches through the current BOS plugin access model. The initial
product has no product-license, Subscription Director, Stripe, checkout,
entitlement, fee, or payment-processing dependency.

The user installs My CRM in a supported AI client, connects or signs in through
BOS OAuth, receives an authorized Lead Director context, and uses the named CRM
MCP group. Authentication, application authorization, role authorization, MCP
group enablement, and provider authorization remain enforced because they
protect customer data. They are independent of commercial licensing.

The initial identities are:

| Surface | Identity |
|---|---|
| Marketplace display name | `My CRM` |
| BOS Operations Center product slug | `my-crm` |
| BOS application | `leaddirector` |
| Existing Lead Director MCP group | `crm` |
| Existing MCP route | `/mcp/apps/leaddirector/crm` |
| Initial commercial policy | no fee; no license lookup or entitlement gate |

### Approved product asset

Use `products/my-crm/assets/lead-director-crm-logo.png` as the My CRM package
logo and composer icon. It is the supplied square Lead Director CRM mark: deep
navy field, electric-blue shield, white typography, and pipeline-to-target
symbol. The source is a 1024×1024 RGB PNG.

`My CRM` remains the marketplace display name. `Lead Director CRM` is the brand
wording rendered inside the approved logo and accurately identifies the BOS
application that owns the CRM runtime.

Use the existing `crm` resource group. Lead Director already owns and tests
this immutable route for CRM access. The product name and route-group name do
not need to be identical: `products/my-crm/product.json` explicitly binds the
`my-crm` package to `mcp_group_name: "crm"`.

Future product licensing is a separate platform workstream. It may later add a
commercial decision at an approved connection or runtime boundary. The My CRM
package, CRM skills, public tool contracts, application services, and provider
adapters remain usable without that future subsystem.

## Stack alignment

| Layer | Current or proposed My CRM role | Owner |
|---|---|---|
| AI client | Installs the product, loads skills, presents Connect/Sign in, stores the OAuth grant, and invokes MCP tools | Claude, ChatGPT/Codex, and later supported hosts |
| Product package | Declares My CRM identity, CRM skill composition, host metadata, and the `leaddirector/crm` connection | BOS Operations Center |
| CRM skills | Interpret CRM intent, select per-source, federated, merged-view, or synchronize-from behavior, and compose bounded CRM operations | BOS Operations Center |
| BOS federated-query skills | Plan source fan-out, enforce cache freshness, run per-source work in parallel where the host permits it, aggregate results, and expose execution evidence | BOS Operations Center |
| MCP transport | Validates the host-managed token, exposes discovery, accepts opaque `context_id`, and dispatches calls | Lead Director/BOS service |
| Named CRM group | Filters the aggregate registry to the approved CRM tools and plugin domains | Lead Director |
| Installed application | Supplies organization, installation, actor, role, plugin, capability, and `crm` group enablement | Lead Director app graph |
| CRM PO services | Execute provider-neutral CRM reads and governed mutations | Lead Director |
| OS plugins and adapters | Connect Lead Director records, GoHighLevel, Calimatic, Gmail, Calendar, and future CRM systems | Lead Director/BOS service |
| GO persistence | Stores tenant-scoped CRM state, plans, idempotency, provenance, and audit evidence | Lead Director |

My CRM is therefore a client product over an application-owned MCP surface. It
does not access OS integrations directly. Lead Director resolves the installed
application and exposes the permitted integration capabilities.

## Federated execution contract

My CRM consumes the reusable BOS contract in
[`../specs/federated-query-execution.md`](../specs/federated-query-execution.md).
The CRM skills supply domain intent and CRM result interpretation. BOS platform
skills supply discovery, cache policy, source fan-out, aggregation, recovery,
execution evidence, and explain planning.

The four CRM execution modes are:

| Mode | Meaning |
|---|---|
| `per_source` | Return distinct results and status for every selected CRM source |
| `federated` | Query selected sources and aggregate the result set while retaining source provenance |
| `merged_view` | Correlate records into a composite view without silently changing source records |
| `synchronize_from` | Treat a selected source as authoritative for specified fields and apply a governed mutation plan to explicit targets |

The client retains a revisioned source catalog learned through MCP discovery and
configuration. Each invocation validates that catalog according to its refresh
policy instead of rediscovering every source unconditionally. Dataset caches
carry an authority scope, query identity, last successful update time, and a
configurable maximum age. Stale entries are refreshed before use and are
excluded from results when the refresh fails unless the user explicitly permits
stale fallback.

For multi-source reads, the client creates one bounded execution unit per source
and runs those units in parallel when the host supports agents or parallel tool
calls. Each unit receives only the selected source handle, opaque BOS context,
normalized query, cache policy, and output schema. Hosts without parallel
execution run the same plan sequentially and preserve the same result envelope.

Each source result is appended to a user-visible execution ledger as it arrives.
The ledger shows plan creation, source start, cache decision, freshness, source
success or failure, recovery, aggregation, and finalization. It provides
observable execution evidence and excludes private model reasoning. The final
answer includes per-source provenance, cache/live status, a local-time freshness
label, partial failures, and usage telemetry whose scope is identified as
host-measured, client-visible estimate, or unavailable.

`explain <request>` returns the planned skills, source selection, cache
decisions, normalized query parameters, aggregation strategy, mutation risk,
and expected output without executing source calls. `explain analyze <request>`
executes the plan and adds observed timings, cache outcomes, source outcomes,
recovery, and usage.

## User experience

### Existing authorized user

1. The user installs My CRM from the client's supported marketplace or private
   Git marketplace.
2. The client loads the packaged CRM skills. Installation grants no customer
   data authority.
3. On the first private CRM request, the client presents **Connect** or
   **Sign in** for the My CRM resource.
4. BOS completes its existing OAuth login and consent flow for
   `/mcp/apps/leaddirector/crm`.
5. Lead Director resolves the user's canonical organizations, installations,
   memberships, roles, enabled `crm` group, plugin grants, and capabilities.
6. The host stores the resource-scoped grant. My CRM discovers only the tools
   allowed by the selected opaque context.
7. The skill executes the request through the CRM group. Provider-specific
   authorization recovery appears only when the requested data source needs it.

No Subscription Director or Stripe call occurs in these steps. No license row
is created or read.

### New login with no Lead Director context

A BOS login and an operational application context are different records. The
current Lead Director authentication architecture resolves pre-provisioned
organizations; a login by itself does not prove an installed application,
role, or customer-data scope.

To deliver the intended “sign up and use My CRM at no charge” experience, add a
governed onboarding continuation:

1. BOS authenticates the user.
2. Context resolution finds no eligible `leaddirector/crm` context and returns
   `application_onboarding_required` with a server-owned continuation URL.
3. The user creates or joins an organization through the Lead Director
   onboarding flow.
4. Lead Director's PO/GO provisioning path creates or resolves the installed
   application, assigns the permitted role, and enables the `crm` group.
5. OAuth resumes, resolves the new canonical context, and completes the grant.
6. The client refreshes tool discovery and resumes the original CRM request.

This onboarding flow provisions application authority. It performs no license
or payment operation. Existing-organization invitations follow the same flow
and join the invited organization instead of creating another one.

### Provider connection

Provider connection stays separate from BOS login. If a CRM request needs
GoHighLevel, Gmail, Calendar, Calimatic, Salesforce, or another provider and
the selected installation lacks a healthy binding, the MCP service returns the
existing secure provider-recovery instruction. The user authorizes the
provider on a BOS-hosted page, the service stores the installation-scoped
credential, and the client resumes the request.

## Physical storage

Canonical editable My CRM client source belongs inside BOS Operations Center.
Generated host packages remain build outputs.

```text
bos_operations_center/
├── source/
│   ├── platform/
│   │   ├── bos-federated-query/
│   │   └── bos-cache-maintenance/
│   └── capabilities/
│       └── my-crm/
│           ├── my-crm/
│           ├── record-operations/
│           ├── pipeline-operations/
│           ├── activity-operations/
│           └── federation-operations/
├── products/
│   └── my-crm/
│       ├── product.json
│       └── assets/
│           └── lead-director-crm-logo.png
├── clients/
│   ├── codex/plugins/my-crm/       # generated
│   ├── claude/plugins/my-crm/      # generated
│   ├── copilot/products/my-crm/    # generated when declared
│   └── gemini/extensions/my-crm/   # generated when declared
└── Vault/
```

Lead Director owns the server implementation:

```text
lead_director/
├── backend/platform_orchestration/
│   ├── mcp_operational_profiles.py
│   ├── agent_operation_catalog.py
│   ├── federated_record_service.py
│   ├── federated_record_tools.py
│   ├── agent_federation_runtime.py
│   └── agent_lead_sis_crm_adapters.py
├── backend/graph_orchestration/
│   └── agent_federation_repository.py
└── backend/tests/unit/
    ├── test_crm_mcp_operational_profile.py
    └── test_*federat*.py
```

There is no source dependency from My CRM to Subscription Director.

## Verified current baseline

### BOS Operations Center

- Product manifests already compose canonical skills into generated Claude,
  Codex, Copilot, and Gemini packages.
- Runtime products already declare `application_name` and `mcp_group_name` and
  include `platform/bos-mcp-client`.
- An active Codex runtime product requires its registered
  `plugin_asdk_app_*` identifier.
- Education Center demonstrates the current installation and OAuth connection
  model.
- No `products/my-crm/product.json` or `source/capabilities/my-crm/` tree exists
  yet.

### Lead Director

- `/mcp/apps/leaddirector/crm` is registered and contract-tested.
- The group currently permits the `lead_director` plugin domain.
- Current public CRM aliases include lead search, get, create, reserved update,
  and customer-provisioning retry, plus BOS context and authorization status.
- Lead search, get, and create are implemented. General Lead Director field
  update is declared unavailable until an approved editable-field PO path
  exists.
- Current canonical intake and ISM application data enables the `crm` group for
  selected roles.
- Federation PO, persistence, tool execution, and Lead Director,
  GoHighLevel, and Calimatic adapter foundations already exist.
- GoHighLevel contact search lacks a verified scoped PO primitive. Lead
  Director general field update and Calimatic writes also remain unavailable.
- The current CRM group does not expose the broader federated provider mesh.

## Product capability design

### Implementation bootstrap

The current Lead Director-only tools validate the package, connection, context,
and MCP call path. They are the implementation bootstrap for My CRM and do not
define the product's provider-neutral semantics. The bootstrap skills support:

- selecting and explaining the current Lead Director context;
- searching leads;
- retrieving one lead;
- creating a lead after duplicate checking; and
- reporting unsupported update or provider operations accurately.

The customer-provisioning retry operation remains an internal capability. My
CRM skills do not invoke it unless a future explicitly packaged administrative
workflow requires it.

### Federated CRM release

Expand the same `crm` group with application-owned semantic operations:

- `crm_list_sources`
- `crm_search_contacts`
- `crm_get_contact`
- `crm_create_contact`
- `crm_update_contact`
- `crm_get_activity_timeline`
- `crm_plan_reconciliation`
- `crm_apply_reconciliation`

These tools normalize user intent while returning source identity,
provenance, coverage, supported operations, and partial-failure evidence. They
coordinate only enabled plugins and healthy provider bindings inside the
selected Lead Director context.

Federated reads preserve successful source results when another source fails.
Single-source commits inherit that provider's transactional guarantee.
Cross-source mutations execute as a versioned plan and report every source as
pending, committed, failed, uncertain, recovery scheduled, or reconciled. The
system may compensate or retry toward eventual consistency and never represents
the cross-source operation as atomic.

The initial federated source order is:

1. Lead Director native records for leads and pipeline state.
2. GoHighLevel for external CRM contacts after scoped search is implemented.
3. Gmail and Google Calendar for read-only activity evidence after deterministic
   contact matching is established.
4. Calimatic for optional read-only family/student context.
5. Salesforce and other future CRMs through new server-owned plugins and
   adapters.

## CRM skill grouping

| Skill | Responsibility |
|---|---|
| `my-crm` | Classify CRM intent, entity, source scope, and execution mode; select the My CRM connection and opaque context; delegate platform mechanics and focused CRM work |
| `my-crm-record-operations` | Search, get, create, update, and safely delete supported CRM entities while preserving source provenance and provider guarantees |
| `my-crm-pipeline-operations` | Inspect and change supported lead, opportunity, stage, owner, and next-action state |
| `my-crm-activity-operations` | Assemble authorized email, calendar, note, call, and document evidence into source-aware activity timelines |
| `my-crm-federation-operations` | Compare, link, merge for presentation, select authoritative sources, plan synchronization, apply idempotently, and report every source result |

My CRM includes the platform-owned `bos-federated-query` and
`bos-cache-maintenance` skills and delegates shared execution machinery to them.
The entry and record skills ship first. Other CRM skills may ship only when the
corresponding server tools are discoverable and tested.

## Outstanding design decisions

The architectural direction is established. Implementation still needs these
bounded product decisions:

1. Define identity confidence and field-authority rules for `merged_view` and
   `synchronize_from`, including which fields may never merge automatically.
2. Define default freshness profiles by CRM dataset and source class. The
   client selects the configured maximum age; live server invalidation,
   authorization changes, and catalog revisions always force refresh.
3. Define the portable execution-event schema and each launch host's adapter to
   its progress or activity surface.
4. Confirm which launch hosts expose exact model usage. Other hosts will return
   a labeled client-visible estimate or `unavailable`.
5. Define per-operation provider guarantees and compensation support in the
   source catalog before enabling multi-source writes.
6. Define durable recovery limits and the user-action-required threshold. The
   server owns recovery state and retries; the client observes and reports them.

## Launch boundaries

The initial release includes:

- host-managed BOS OAuth;
- canonical organization, installation, role, group, plugin, and capability
  authorization;
- Lead Director-backed CRM operations;
- secure provider recovery for supported integrations;
- deterministic client generation; and
- credential-free public package content.

The initial release excludes:

- Subscription Director calls;
- product, license, plan, entitlement, price, checkout, and Stripe identifiers;
- license creation or lookup;
- paywalls and trials;
- raw provider passthrough;
- arbitrary SQL;
- automatic identity merge;
- destructive delete; and
- unbounded bulk synchronization.

## Launch gates

1. Approve the package-to-route binding: product `my-crm`, MCP group `crm`.
2. Decide whether the first public release promises existing-account access or
   self-service onboarding for every new login. Implement the onboarding
   continuation before advertising the latter.
3. Add the My CRM canonical skill source and product manifest.
4. Register the ChatGPT/Codex app for the exact CRM route and add its stable app
   ID to the active manifest.
5. Generate and validate the declared client packages.
6. Verify tenant isolation, opaque-context selection, role/capability filtering,
   provider recovery, mutation idempotency, and audit evidence.
7. Run one live Connect/Sign in and tool-discovery test in each launch client.

No launch gate depends on Subscription Director or commercial licensing.
