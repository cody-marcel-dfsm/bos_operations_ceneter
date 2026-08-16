# My CRM client product and Lead Director MCP group

Status: deferred product proposal; only the Lead Director application boundary
and prospective named-group shape remain useful context. My CRM product,
license, pricing, and acquisition design have not begun.
Date: 2026-08-15
Owner: BOS Operations Center for client composition; Lead Director for the
application MCP group and runtime behavior

## Correction

The earlier proposal introduced a new `customer-operations` BOS application.
That does not match the current architecture or the intended My CRM model.

The correct ownership is:

- BOS plugins are operating-system-level capabilities.
- Plugins are installed, configured, enabled, authorized, and executed through
  an application context.
- Lead Director is the current application through which these plugins are
  accessed.
- My CRM is a client product and a named Lead Director MCP group.
- My CRM does not require a new BOS application.
- My CRM does not require a second copy of every provider plugin.

The canonical route should therefore be:

```text
https://dfsm.ai/mcp/apps/leaddirector/my-crm
```

There is no planned route migration. `leaddirector` is intentional because
Lead Director owns the application context that exposes the OS-level plugins.

## The architecture in one view

```text
Claude / ChatGPT / Codex
  |
  | installs
  v
My CRM client product
  |- client manifest and marketplace identity
  |- grouped CRM skills
  |- one named remote MCP connection
  |
  | HTTPS Streamable HTTP + host-managed OAuth
  v
/mcp/apps/leaddirector/my-crm
  |
  v
Lead Director My CRM resource group
  |- fixed public tool allowlist
  |- fixed allowed OS-plugin domains
  |- public tool aliases and schemas
  |
  | resolves one authorized context
  v
Lead Director installed application
  |- tenant and organization
  |- actor and delegated role
  |- enabled MCP groups
  |- enabled OS-level plugins
  |- plugin run-as roles and capabilities
  |
  v
BOS operating-system plugins
  |- Lead Director records
  |- GoHighLevel
  |- Calimatic
  |- Gmail
  |- Google Calendar
  |- Google Drive
  |- Salesforce or another future connector
  |
  v
PO orchestration -> GO persistence and/or provider adapter -> data source
```

The My CRM experience comes from the alignment of all these layers. No single
layer is the whole product.

## The three groupings that must align

“Skill group” currently describes related concepts on the client and server.
The architecture works when the three groupings share one product identity but
retain their separate ownership.

### 1. Client product composition

BOS Operations Center owns an installable product named `my-crm`.
`products/my-crm/product.json` selects the skills that ship together and the
one runtime connection they use.

Conceptually:

```json
{
  "name": "my-crm",
  "display_name": "My CRM",
  "includes": [
    "platform/bos-mcp-client",
    "platform/submit-feedback",
    "platform/manage-customer-extension",
    "capabilities/my-crm-routing",
    "capabilities/my-crm-contact-operations",
    "capabilities/my-crm-pipeline-operations",
    "capabilities/my-crm-activity-context",
    "capabilities/my-crm-reconciliation"
  ],
  "runtime": "bos",
  "application_name": "leaddirector",
  "mcp_group_name": "my-crm"
}
```

This is the installable Claude/OpenAI plugin product. It contains intelligence
and connection metadata. It contains no tenant authority, provider credential,
or customer data.

### 2. Client skill grouping

The skills inside the product teach the model how to operate a CRM:

- determine whether the user is asking about a contact, account, opportunity,
  activity, task, or pipeline;
- search connected sources before creating a duplicate;
- interpret source coverage and provenance;
- reconcile conflicts between sources;
- prepare safe writes and request confirmation when required;
- use source versions and idempotency keys;
- explain partial success and recovery; and
- select the installed `my-crm` MCP connection for every private operation.

Skills compose server tools into useful workflows. They do not determine which
tenant, application installation, provider account, or role is authorized.

### 3. Server MCP resource grouping

Lead Director owns a server resource group with:

```text
application_id:        leaddirector
authorization_app:     lead_director
resource_group_id:     my-crm
route:                 /mcp/apps/leaddirector/my-crm
allowed_plugin_ids:    explicit OS-plugin domains
allowed_tool_names:    explicit My CRM tool catalog
```

This resource group is a filtered view of tools available through an
authorized Lead Director installation. It does not create or install the
underlying plugins.

The common `my-crm` identity aligns:

| Surface | Value |
|---|---|
| Client product name | `my-crm` |
| Client connection name | `my-crm` |
| Product `mcp_group_name` | `my-crm` |
| MCP route group | `my-crm` |
| Server `resource_group_id` | `my-crm` |
| Installed-app enabled MCP group | `my-crm` |

The application identity stays `leaddirector` across the product manifest,
route, server registry, OAuth resource, and installed-app authorization.

## Layer-by-layer ownership

| Layer | Owner | My CRM responsibility |
|---|---|---|
| Marketplace/client host | Claude or OpenAI | Install product, activate skills, connect OAuth, store the grant, invoke tools |
| Client product | BOS Operations Center | Package CRM skills and bind them to one named Lead Director MCP resource |
| Skills | BOS Operations Center | CRM expertise, workflow routing, interpretation, planning, and user interaction |
| MCP transport | BOS service | OAuth validation, Streamable HTTP, JSON-RPC, discovery, call dispatch, reconnect contract |
| MCP resource group | Lead Director | Expose the approved My CRM tool and OS-plugin subset |
| Installed app | Lead Director app graph | Supply tenant/app/role/plugin configuration and enable the `my-crm` group |
| OS plugin framework | BOS | Register reusable integration capabilities |
| Installed OS plugin | Lead Director installation | Enable and configure a plugin for one organization and app installation |
| PO | BOS/Lead Director service | Execute semantic business behavior, authorization, provider coordination, idempotency, and audit |
| GO | BOS/Lead Director service | Persist scoped records, plans, locks, and audit state |
| Provider adapter | Owning OS plugin | Translate semantic operations to GoHighLevel, Calimatic, Gmail, Salesforce, or another provider |

## How a request flows

Example: “Find Jane Smith and tell me where she is in our pipeline.”

1. The host activates the My CRM skill because the request matches its CRM
   description.
2. The skill uses the installed `my-crm` connection.
3. The client sends the MCP request to
   `/mcp/apps/leaddirector/my-crm` with the host-managed OAuth token.
4. BOS validates the token against that exact OAuth resource.
5. `bos_get_context` returns the currently authorized Lead Director contexts
   where the `my-crm` group is enabled.
6. The skill selects the appropriate opaque `context_id` from the user's
   request. It does not construct organization or installation scope.
7. Lead Director resolves the exact organization, installed app, actor role,
   delegated role, plugin set, and capability ceiling.
8. The My CRM resource group intersects that live authority with its fixed
   plugin and tool allowlists.
9. The app-owned CRM operation calls the authorized Lead Director and provider
   plugin adapters needed for the search.
10. PO returns normalized records with source provenance and coverage status.
11. The skill interprets the result and presents the useful CRM answer.

The same route can serve different organizations because the OAuth identity and
`context_id` resolve server-owned installation context. The path remains fixed.

## How OS-level plugins participate

The OS plugin registry answers “what integrations can BOS support?” The Lead
Director installation answers “which of those plugins are enabled and
authorized for this organization and application?” The My CRM MCP group answers
“which of those enabled capabilities can this client product use?”

```text
OS plugin exists
  AND plugin is installed/enabled in this Lead Director installation
  AND actor/delegated roles permit its capability
  AND provider authorization and provenance are healthy
  AND My CRM resource group permits its domain and tool
  = tool is available through My CRM
```

For example, Salesforce support would align as follows:

1. Add Salesforce once as an OS-level BOS plugin and provider adapter.
2. Enable and configure it inside the customer's Lead Director installation.
3. Store its provider authorization under that organization, installed app,
   plugin, and verified Salesforce account.
4. Declare its semantic agent operations and role capabilities.
5. Add the approved Salesforce-backed capabilities to the Lead Director My CRM
   resource group.
6. My CRM skills use the same CRM workflow and live source catalog.

The client product does not embed a Salesforce SDK or credential. The provider
connection remains a BOS plugin accessed through Lead Director.

## What My CRM is at each layer

### In Claude and OpenAI

My CRM is an installable client product:

- a product name and marketplace listing;
- a grouped set of CRM skills;
- an immutable MCP connection;
- an OpenAI registered-app binding or Claude native remote MCP declaration;
- example prompts, privacy disclosures, and support metadata; and
- no operational authority by itself.

### In BOS Operations Center

My CRM is a product composition:

- one `product.json`;
- selected platform and CRM capability skills;
- generated Claude and OpenAI artifacts;
- deterministic package validation;
- versioned releases; and
- customer extension support.

BOS Operations Center is the blanket or container for these product
compositions. Education Center, Video Ads, My CRM, and future products are
separate installable groupings built from the shared source layers.

### In the Lead Director service

My CRM is an application-owned MCP resource group and semantic CRM surface:

- one named route;
- one OAuth resource;
- one fixed tool allowlist;
- one fixed OS-plugin-domain allowlist;
- application-owned CRM operations where cross-plugin coordination is needed;
- provider dependency resolution through enabled OS plugins; and
- the normal BOS authorization, PO/GO, idempotency, audit, and recovery path.

### In the installed Lead Director app

My CRM is enabled canonical state:

- `my-crm` appears in the installed app's `mcp_resource_groups`;
- relevant OS plugins are installed and enabled;
- plugin `run_as_role` values are present;
- role capability grants permit the intended CRM operations;
- source/provider configuration is present; and
- provider credentials have verified account provenance.

## The server tool surface

There are two native ways to expose the OS plugins through the Lead Director My
CRM group.

### Direct grouped plugin tools

The resource group can expose selected semantic tools owned by each plugin:

```text
lead_director_search_leads
ghl_get_contact
ghl_create_contact
calimatic_search_students
gmail_search
calendar_search_events
```

Public aliases can give them My CRM terminology while retaining distinct source
semantics. This follows the current Education Center pattern and is the fastest
path to an initial product.

### Application-owned federated CRM tools

Lead Director can expose higher-level operations:

```text
my_crm_list_sources
my_crm_search_contacts
my_crm_get_contact
my_crm_create_contact
my_crm_update_contact
my_crm_get_activity_timeline
my_crm_plan_sync
my_crm_apply_sync
```

These are Lead Director application capabilities. Their PO implementation may
coordinate several enabled OS plugins. They do not turn My CRM into a separate
application, and they do not move provider plugins out of the BOS plugin
framework.

### Recommendation

Use application-owned federated tools for operations where the user expects one
CRM answer across sources:

- contact search and retrieval;
- identity candidates and source provenance;
- activity timelines;
- duplicate detection; and
- multi-source mutation planning and reconciliation.

Retain bounded source-specific tools for provider features that have genuinely
different semantics. This gives the client a coherent CRM while preserving
provider truth and capability differences.

The existing Lead Director `FederatedRecordService`, semantic operation
catalog, Lead Director and Calimatic adapters, Google bindings, and partial
GoHighLevel adapter are the natural foundation for these application-owned
tools.

## Recommended My CRM skill group

### `my-crm-routing`

Entry skill for CRM intent classification and selection of the other packaged
skills. It always selects the `my-crm` MCP connection for private work.

### `my-crm-contact-operations`

Search, inspect, create, and update people and contacts. Search before create,
preserve source provenance, and use source versions for updates.

### `my-crm-pipeline-operations`

Inspect and update leads, opportunities, stages, owners, next actions, and
pipeline status through the server-advertised capabilities.

### `my-crm-activity-context`

Assemble authorized email, calendar, note, call, and document evidence into a
customer timeline without changing the source systems.

### `my-crm-reconciliation`

Identify duplicate or conflicting records, create a mutation plan, obtain
required approval, apply supported changes idempotently, and report every
source outcome.

These are reusable capability skills under `source/capabilities/`. Provider-
specific skill content is added only when a provider exposes behavior that
cannot be represented through the common CRM workflow.

## Proposed first release

### Product

- Name: `My CRM`
- Product slug: `my-crm`
- Application: `leaddirector`
- MCP group: `my-crm`
- Route: `/mcp/apps/leaddirector/my-crm`
- Initial clients: Claude and ChatGPT/Codex

### Initial sources

- Lead Director as the native application record source
- GoHighLevel as the first external writable CRM source
- Calimatic as an optional read-only family/student source
- Gmail and Google Calendar as activity evidence after contact matching is
  stable

### Initial entities

- contacts and leads
- pipeline state or opportunity status
- activity timeline

### Initial mutations

- create contact or lead
- update approved fields
- update an explicitly supported pipeline state
- prepare and apply a versioned reconciliation plan

Delete, raw provider passthrough, arbitrary SQL, automatic identity merge,
Gmail send, and unbounded bulk synchronization remain outside the first
release.

## Open-source alignment

Open-source these layers:

- My CRM skills;
- product composition;
- public MCP tool schemas;
- canonical contact/source/provenance contracts;
- provider adapter interfaces;
- conformance tests and fixtures; and
- reference adapters that contain no credentials or customer configuration.

The official My CRM product stays bound to the immutable BOS route and uses BOS
OAuth. A self-hosted implementation can reuse the open skills and contracts
under its own product identity, registered app, and build-time MCP endpoint.
The official package should not accept a runtime endpoint override because the
endpoint is part of its OAuth resource identity.

Customers who connect another CRM to BOS follow the normal path: implement or
enable another OS plugin inside Lead Director. The My CRM client product remains
the same lens over the expanded plugin mesh.

## Physical repository layout

Keep the canonical My CRM client source inside BOS Operations Center. Add a
namespaced capability directory under the existing `source/` tree rather than
creating a second top-level source tree or sibling repository.

```text
bos_operations_center/
├── source/                              # canonical editable client sources
│   ├── platform/                        # existing shared BOS skills
│   │   ├── bos-mcp-client/
│   │   ├── submit-feedback/
│   │   └── manage-customer-extension/
│   ├── capabilities/
│   │   ├── review-outreach/             # existing capability
│   │   ├── video-ad-briefing/           # existing capability
│   │   └── my-crm/                      # new CRM capability namespace
│   │       ├── routing/
│   │       │   ├── SKILL.md
│   │       │   ├── agents/openai.yaml
│   │       │   └── references/
│   │       ├── contact-operations/
│   │       │   ├── SKILL.md
│   │       │   ├── agents/openai.yaml
│   │       │   └── references/
│   │       ├── pipeline-operations/
│   │       │   ├── SKILL.md
│   │       │   └── agents/openai.yaml
│   │       ├── activity-context/
│   │       │   ├── SKILL.md
│   │       │   └── agents/openai.yaml
│   │       └── reconciliation/
│   │           ├── SKILL.md
│   │           ├── agents/openai.yaml
│   │           ├── references/
│   │           └── scripts/             # only deterministic local helpers
│   ├── config/
│   │   └── my-crm.settings.template.json # optional non-secret defaults
│   └── runtime/
│       └── bos/.mcp.json                 # existing shared route template
├── products/
│   └── my-crm/product.json               # product composition root
├── clients/                              # generated; never edited directly
│   ├── codex/plugins/my-crm/
│   └── claude/plugins/my-crm/
├── tests/                                # composition and package tests
└── Vault/                                # architecture and release knowledge
```

The source leaf name and the installed skill name can differ. The build reads
the `name:` field from each leaf's `SKILL.md` and uses that name for the
generated client directory. For example:

```text
source include:  capabilities/my-crm/contact-operations
SKILL.md name:   my-crm-contact-operations
generated path: clients/<host>/plugins/my-crm/skills/my-crm-contact-operations
```

The product manifest references the canonical leaf directories:

```json
"includes": [
  "platform/bos-mcp-client",
  "platform/submit-feedback",
  "platform/manage-customer-extension",
  "capabilities/my-crm/routing",
  "capabilities/my-crm/contact-operations",
  "capabilities/my-crm/pipeline-operations",
  "capabilities/my-crm/activity-context",
  "capabilities/my-crm/reconciliation"
]
```

The build resolves each include under `source/`, requires a `SKILL.md`, copies
the complete leaf directory, and generates every host package from that one
canonical source.

### Skill-internal references

Each leaf is a self-contained skill package:

```text
contact-operations/
├── SKILL.md                  # workflow and activation instructions
├── agents/openai.yaml        # OpenAI display metadata and MCP dependency
├── references/               # detailed contracts loaded when needed
│   ├── contact-envelope.md
│   └── source-provenance.md
├── scripts/                  # deterministic helpers, when justified
└── assets/                   # templates or static assets, when justified
```

Use relative references only within the same skill leaf, such as
`references/contact-envelope.md`. Reference another packaged skill by its
stable skill name, such as `my-crm-routing` or `bos-mcp-client`, because the
generator flattens selected leaves into the product's `skills/` directory.

The Agent Skills format has no formal skill-to-skill dependency field. Express
composition through:

1. the product manifest's `includes` list;
2. skill descriptions that activate the correct workflow;
3. explicit instructions in `SKILL.md` to follow another packaged skill;
4. the MCP dependency in `agents/openai.yaml`; and
5. package validation that all named skills and routes are present.

An MCP-bound My CRM skill follows the existing Education Center shape:

```yaml
interface:
  display_name: "My CRM Contact Operations"
  short_description: "Search and manage authorized CRM contacts"
  default_prompt: "Use $my-crm-contact-operations to find this contact."
dependencies:
  tools:
    - type: "mcp"
      value: "bos_my_crm"
      description: "BOS remote gateway for the Lead Director My CRM group"
      transport: "streamable_http"
      url: "https://dfsm.ai/mcp/apps/leaddirector/my-crm"
policy:
  allow_implicit_invocation: true
```

The URL in this metadata, the product manifest route, the generated Claude MCP
configuration, the registered OpenAI app resource, and the Lead Director server
route must match exactly. Add a parity test so these references cannot drift.

### Generated client layout

The existing package builder would generate this Codex/OpenAI shape:

```text
clients/codex/plugins/my-crm/
├── .bos-product.json
├── .codex-plugin/plugin.json
├── .app.json
├── config/customer-settings.template.json  # only when configured
└── skills/
    ├── bos-mcp-client/
    ├── submit-feedback/
    ├── manage-customer-extension/
    ├── my-crm-routing/
    ├── my-crm-contact-operations/
    ├── my-crm-pipeline-operations/
    ├── my-crm-activity-context/
    └── my-crm-reconciliation/
```

Codex `.app.json` points to the stable registered app ID. The registered app
owns `https://dfsm.ai/mcp/apps/leaddirector/my-crm`.

Claude receives the parallel generated shape:

```text
clients/claude/plugins/my-crm/
├── .bos-product.json
├── .claude-plugin/plugin.json
├── .mcp.json                 # exact leaddirector/my-crm URL
├── config/customer-settings.template.json
└── skills/                   # same canonical skill content
```

Root marketplace manifests reference these generated product directories. They
do not reference individual canonical skill leaves.

### Lead Director server layout

The executable My CRM MCP behavior remains in the Lead Director repository:

```text
lead_director/
├── backend/platform_orchestration/
│   ├── mcp_operational_profiles.py       # register leaddirector/my-crm
│   ├── agent_operation_catalog.py        # semantic tool contracts
│   ├── agent_mcp_application.py          # compose registry and executors
│   ├── my_crm_agent_service.py           # new app-owned CRM PO coordination
│   ├── federated_record_service.py       # existing reusable federation PO
│   ├── agent_provider_bindings.py        # installed-plugin bindings
│   ├── agent_lead_sis_crm_adapters.py    # Lead Director/GHL/Calimatic adapters
│   └── google_agent_provider_bindings.py # Gmail/Calendar/Drive bindings
├── backend/graph_orchestration/
│   └── agent_federation_repository.py    # existing scoped plans/audit state
├── backend/database/seeds/
│   └── lead_director_*_graph_data.json   # group enablement, roles, plugins
├── backend/tests/
│   ├── unit/                             # tools, federation, authorization
│   └── contract/                         # exact named-route contract
└── Vault/docs/design/
    └── my_crm_mcp.md                     # application-owned runtime design
```

Add a new GO repository only when My CRM introduces persistence that the
existing federation repository does not own. Keep provider-specific code with
the owning OS plugin or adapter.

### Cross-repository references

BOS Operations Center and Lead Director should have no runtime filesystem
import, symlink, or editable-source dependency on each other. They align through
an explicit contract:

| Contract | Operations Center owner | Lead Director owner |
|---|---|---|
| Application slug | `product.json: application_name` | resource group `application_id` |
| Group slug | `product.json: mcp_group_name` | `resource_group_id` and seed enablement |
| OAuth resource | generated client metadata | protected-resource and token validation |
| Tool names | skill instructions and dependencies | operation catalog and group allowlist |
| Tool schemas | client-facing references/tests | server registry and executors |
| Skill content | `source/capabilities/my-crm/` | no filesystem dependency |
| Runtime behavior | no provider implementation | PO/GO and OS-plugin adapters |

Contract tests should compare the Operations Center product declaration with
the Lead Director route/tool inventory before release. Deployment remains
independent: server capabilities can evolve within the approved contract, and
client skills can evolve without importing server source.

### When a sibling repository becomes justified

Keep My CRM in Operations Center for the first product. A separate repository
becomes useful only when My CRM has an independent maintainer community,
release cadence, marketplace, or governance boundary. That split would require
a declared package dependency and vendoring/version-resolution mechanism in the
Operations Center build. The current generator intentionally resolves every
canonical skill include from its own `source/` directory, so a sibling
repository would add a new packaging abstraction.

## Implementation sequence

### 1. Freeze the alignment contract

- Approve `leaddirector/my-crm`.
- Approve the client product, skill names, and initial tool catalog.
- Decide which tools are app-owned federated operations and which remain
  source-specific.

### 2. Add the Lead Director MCP group

- Register the `my-crm` resource group.
- Add an explicit plugin-domain and tool allowlist.
- Enable `my-crm` in the intended Lead Director installed-app metadata.
- Add role capabilities and plugin execution-role coverage.

### 3. Complete the CRM application surface

- Bind Lead Director records to the federated service.
- Complete GoHighLevel search and production provider binding.
- Add application-owned federated CRM operations where needed.
- Preserve source provenance, versions, partial coverage, idempotency, and
  audit.

### 4. Create the client product

- Add canonical My CRM skills.
- Add `products/my-crm/product.json`.
- Generate Claude and Codex packages from the same composition.
- Register the OpenAI app against the exact Lead Director My CRM route.

### 5. Validate the complete stack

- Install and connect from Claude and OpenAI.
- Verify the exact OAuth resource and tool discovery.
- Verify one Lead Director-only context and one context with an external CRM.
- Verify cross-tenant, cross-installation, cross-role, and cross-provider
  rejection.
- Verify partial reads, provider recovery, idempotent writes, and
  reconciliation.

### 6. Add providers without changing the product model

- Add Salesforce, HubSpot, SAP, or another source as an OS-level plugin.
- Enable it in the relevant Lead Director installation.
- Add its semantic operations to the My CRM group or consume it through the
  app-owned federation operations.
- Run the same conformance and tenant-isolation gates.

## Decisions to make next

1. **Public tool shape:** lead with unified `my_crm_*` operations and retain
   source-specific tools for provider-specific behavior. Recommended.
2. **Initial writable source:** use Lead Director and GoHighLevel for the first
   controlled implementation. Recommended.
3. **Source of truth:** configure one primary writable source per entity type
   inside the installed Lead Director app. Recommended.
4. **Identity reconciliation:** return candidates and require confirmation for
   ambiguous matches. Recommended.
5. **Skill granularity:** ship one routing skill plus four focused operational
   skills. Recommended.

## Verified evidence

- BOS Operations Center owns source composition and generated client packages:
  [`Vault/docs/architecture.md`](architecture.md)
- Every runtime product binds one application/group route and one host-managed
  OAuth connection:
  [`Vault/specs/named-mcp-application-group-routing.md`](../specs/named-mcp-application-group-routing.md)
- Education Center and Video Ads are both groups under Lead Director:
  [`products/education-center/product.json`](../../products/education-center/product.json)
  and [`products/video-ads/product.json`](../../products/video-ads/product.json)
- BOS plugins exist at OS level and are enabled/configured through installed
  application state:
  [`lead_director/Vault/docs/architecture.md`](../../../lead_director/Vault/docs/architecture.md)
- The current server resource-group primitive filters application-scoped OS
  plugin tools:
  [`lead_director/backend/platform_orchestration/mcp_operational_profiles.py`](../../../lead_director/backend/platform_orchestration/mcp_operational_profiles.py)
- Lead Director already has provider-neutral federation and CRM adapter
  foundations:
  [`lead_director/backend/platform_orchestration/federated_record_service.py`](../../../lead_director/backend/platform_orchestration/federated_record_service.py)
  and
  [`lead_director/backend/platform_orchestration/agent_lead_sis_crm_adapters.py`](../../../lead_director/backend/platform_orchestration/agent_lead_sis_crm_adapters.py)
