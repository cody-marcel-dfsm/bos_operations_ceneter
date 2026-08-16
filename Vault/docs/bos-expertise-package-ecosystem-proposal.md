# BOS developer product ecosystem proposal

Status: superseded draft; developer packaging, registration, capability,
licensing, and monetization mechanisms are withdrawn pending the staged design
in `Vault/docs/my-crm-developer-platform-work-matrix.md`
Date: 2026-08-15
Owner: BOS Operations Center, Lead Director, and Subscription Director

## Corrected decision

The material below is retained as historical proposal context. It is not an
approved description of an existing SDK, publisher process, route-registration
process, license flow, or developer workflow.

An external developer builds and monetizes a complete product comparable to
My CRM. Each developer product has an identity and commercial lifecycle
independent from My CRM.

The developer owns the product's client-side expertise, brand, pricing, and
release repository. BOS supplies reusable server capabilities, provider
integrations, authentication, tenant isolation, authorization, audit,
confirmation, provider-recovery flows, and billing infrastructure. Lead
Director remains the current BOS application through which the product reaches
those server capabilities.

Every published developer product receives:

- its own installable Claude, Codex, and ChatGPT product identity;
- its own immutable named Lead Director MCP resource;
- its own declared set of versioned BOS capability dependencies;
- its own server-owned tool and integration allowlist;
- its own customer entitlement and pricing plan; and
- its own publisher, support, release, and revenue identity.

My CRM is the first reference product built with this system. A developer can
use the same system to create `Acme CRM`, `Collision Shop Manager`, `HVAC Sales
Operator`, or another product without placing its source inside My CRM or BOS
Operations Center.

## The platform model

Use four separately versioned concepts:

1. **BOS product package** — the developer's installable client-side product,
   including skills, domain expertise, host metadata, and BOS dependency
   declarations.
2. **BOS capability contract** — a stable semantic server operation such as
   `crm.contacts.search@1` or `communications.email.draft.create@1`.
3. **BOS MCP product registration** — the Lead Director-owned binding from one
   product identity and named route to approved capability contracts, tools,
   plugins, and entitlement policy.
4. **BOS integration plugin** — the server-side adapter that implements one or
   more capability contracts against GoHighLevel, Gmail, Calimatic,
   Salesforce, or another provider.

This separates product expertise from provider implementation. A CRM developer
can build against `crm.contacts.search@1` once. The customer's installed
GoHighLevel, Salesforce, or future CRM integration can satisfy that contract.

## Complete stack

```text
Developer-owned product repository
  skills + product manifest + tests
                 |
                 | built with the open BOS product SDK
                 v
Claude / Codex / ChatGPT product
                 |
                 | OAuth to this product's exact resource
                 v
/mcp/apps/leaddirector/{developer-product-group}
                 |
                 | product entitlement + server-owned allowlists
                 v
Versioned BOS capability contracts
                 |
                 | PO orchestration and GO persistence
                 v
Installed BOS integration plugins
  Lead Director / GHL / Gmail / Calimatic / Salesforce / ...
```

The product's skills tell the model how to perform domain work. BOS determines
which authorized provider can perform each operation for the selected customer
context.

## How a product refers to BOS building blocks

Developers should depend on semantic capability identifiers. Lead Director
Python classes, database models, provider APIs, private tool registries, and
deployment URLs remain sealed implementation surfaces.

Example developer-owned `bos-product.json`:

```json
{
  "schema_version": "1",
  "product_id": "com.acme.acme-crm",
  "name": "acme-crm",
  "display_name": "Acme CRM",
  "version": "1.3.0",
  "publisher": {
    "id": "com.acme",
    "name": "Acme Automation",
    "url": "https://example.com"
  },
  "skills": [
    "skills/contact-operations",
    "skills/pipeline-operations",
    "skills/follow-up-automation"
  ],
  "bos": {
    "application": "leaddirector",
    "requires": {
      "crm.contacts.search": "^1.0",
      "crm.contacts.update": "^1.0",
      "crm.pipeline.read": "^1.0",
      "communications.email.draft.create": "^1.0"
    },
    "optional": {
      "calendar.events.create": "^1.0"
    }
  },
  "commercial": {
    "model": "subscription",
    "subscription_director_product": "com.acme.acme-crm"
  }
}
```

The manifest declares what the product needs. BOS product registration assigns
and approves the deployment binding:

```json
{
  "product_id": "com.acme.acme-crm",
  "application_name": "leaddirector",
  "mcp_group_name": "acme-crm",
  "mcp_resource": "https://dfsm.ai/mcp/apps/leaddirector/acme-crm",
  "contract_set": "sha256:<approved-contract-set>",
  "entitlement_policy": "subscription-required",
  "status": "approved"
}
```

The product builder combines the developer manifest with this BOS-issued
registration and generates the exact Claude MCP metadata and OpenAI registered
app binding. The developer never chooses an arbitrary production endpoint or
grants their product additional tools.

### Capability catalog

Publish a machine-readable BOS capability catalog containing:

- stable capability ID and version;
- purpose and data classification;
- read, create, update, transition, or other action classification;
- input and output schema;
- confirmation and idempotency requirements;
- provider-neutral error and partial-result behavior;
- compatible integration plugins; and
- sandbox fixtures and conformance tests.

The capability catalog becomes the developer API. Current MCP operation names
can seed the first catalog, with a stable mapping from capability IDs to the
server-owned operation catalog and route-specific aliases.

### Shared client building blocks

Expose reusable client packages separately from server capabilities:

- `bos-mcp-client` for context discovery, live tool discovery, recovery, and
  bounded retries;
- `submit-feedback` for product feedback through the product's route;
- `manage-customer-extension` for protected customer specialization; and
- optional skill-authoring patterns for confirmation, provenance, and partial
  results.

A developer can depend on these packages by version. Their product source
refers to logical capability IDs, and the BOS builder generates host-specific
MCP dependency metadata from the approved registration.

## Physical repository ownership

### Developer-owned product repository

```text
acme-crm/
├── bos-product.json                    # product and capability dependencies
├── bos-registration.lock.json          # exact BOS-issued route/contract binding
├── skills/
│   ├── contact-operations/
│   │   ├── SKILL.md
│   │   ├── agents/openai.template.yaml
│   │   └── references/
│   ├── pipeline-operations/
│   └── follow-up-automation/
├── tests/
│   ├── activation/
│   ├── capability-contract/
│   └── safety/
├── clients/                            # generated; publisher releases these
│   ├── claude/
│   └── codex/
├── README.md
├── CHANGELOG.md
└── LICENSE
```

This repository is the canonical editable source for Acme CRM. The developer
controls its GitHub visibility, contributors, release cadence, and licensing.

### BOS Operations Center

```text
bos_operations_center/
├── source/                             # first-party product and shared source
│   ├── platform/
│   └── capabilities/my-crm/
├── developer-kit/
│   ├── schemas/                        # product and dependency schemas
│   ├── bos-product-cli/                # build, validate, test, and sign
│   ├── conformance-fixtures/
│   └── examples/
│       └── reference-crm/
├── catalog/
│   ├── capabilities/                   # public semantic contract catalog
│   └── products/                       # approved product metadata only
└── products/my-crm/                    # first-party reference product
```

External product skill source remains exclusively in the developer-owned
repository. Operations Center owns the open packaging specification, shared
client building blocks, generated-host rules, certification tests, first-party
products, and public product catalog.

### Lead Director

Lead Director owns the executable service side:

```text
lead_director/
├── backend/platform_orchestration/
│   ├── agent_operation_catalog.py      # capability-to-operation contracts
│   ├── mcp_operational_profiles.py     # product resource groups/allowlists
│   ├── agent_mcp_application.py        # MCP execution composition
│   ├── provider_dependency_service.py  # integration dependency resolution
│   └── plugins/                        # built-in provider implementations
├── backend/database/seeds/
│   └── ...                             # installed-product/group enablement
└── backend/tests/
    ├── contract/
    └── integration/
```

The existing `McpResourceGroup` already binds a named route to explicit plugin
and tool allowlists. The developer platform should make those registrations
data-driven and reviewable as the product catalog grows while preserving
server ownership and fail-closed startup validation.

### Subscription Director

Subscription Director owns the developer's pricing plan, checkout, subscriber
status, connected Stripe account, BOS platform fee, and payout relationship.
Its existing model already treats each developer software product as an
independent subscription business.

Treat Subscription Director as the BOS **commerce control plane**. It owns the
normalized product, offer, customer entitlement, revenue-share, refund,
cancellation, and payout-reconciliation model even when a host marketplace
becomes the payment rail. The payment rail remains authoritative for its own
transaction and settlement records; Subscription Director converts verified
rail events into one BOS entitlement state.

Add a bridge from Subscription Director's product/subscriber status to the BOS
MCP authorization layer:

```text
Subscription Director product + active subscriber
                    |
                    v
BOS product entitlement
  product_id + customer identity + status + tier + expiry
                    |
                    v
OAuth authorization for that product's named MCP resource
```

This entitlement is resolved and revalidated on the server. Client packages do
not carry license keys, subscription status, or reusable authority.

### Marketplace commerce adapters

Give Subscription Director a commerce-adapter boundary:

```text
Subscription Director checkout / Stripe Connect
OpenAI marketplace commerce
Claude marketplace commerce
enterprise invoice or private contract
                    |
                    v
MarketplaceCommerceAdapter
  checkout + receipt verification + cancellation + refund + payout events
                    |
                    v
Subscription Director normalized ledger and product entitlement
                    |
                    v
BOS MCP resource authorization
```

The adapter contract should normalize:

- marketplace and merchant identity;
- BOS product ID and marketplace listing ID;
- customer and organization binding;
- offer, tier, billing interval, and price;
- purchase, renewal, cancellation, refund, dispute, and expiry events;
- marketplace receipt or transaction proof;
- publisher proceeds, marketplace fees, BOS fees, and payout status; and
- reconciliation cursor, timestamps, and idempotency identity.

Use three commercial rails behind that interface:

1. **Subscription Director native checkout** — the current baseline for
   software-product subscriptions and direct/private distribution.
2. **Host marketplace commerce** — preferred when a host supports the required
   software subscription, verified receipt, cancellation, and payout contract.
3. **Enterprise/private commerce** — invoiced or contract entitlements entered
   through an audited Subscription Director workflow.

OpenAI's current plugin monetization documentation recommends external checkout
as the generally available route and limits the present commerce approval and
embedded checkout beta to narrower eligible commerce cases. It does not yet
establish a generally available software-plugin subscription and entitlement
rail. Subscription Director should therefore remain the production software
checkout path while the OpenAI adapter is designed for future marketplace
support. See the official
[OpenAI plugin monetization guidance](https://developers.openai.com/plugins/build/monetization).

A marketplace install event is product discovery and installation evidence. A
verified marketplace purchase or Subscription Director subscription creates
commercial entitlement. BOS still resolves identity, organization,
installation, role, product, and capability authority independently before
issuing or accepting MCP access.

## Product monetization

The developer monetizes their own product directly:

1. The developer registers `Acme CRM` as a product with BOS.
2. Subscription Director creates the developer's product account, pricing
   plan, Stripe Connect relationship, checkout, and subscriber records.
3. The developer publishes Acme CRM through the Claude, Codex, or ChatGPT
   distribution channel generated by the BOS SDK.
4. A customer subscribes through Subscription Director or a supported native
   marketplace commerce rail.
5. Subscription Director verifies or originates the transaction and records
   the normalized active product entitlement.
6. The customer installs Acme CRM and connects to BOS.
7. BOS OAuth authorizes the exact `leaddirector/acme-crm` resource only when the
   customer has a current entitlement and an eligible Lead Director context.
8. Acme CRM uses approved BOS capability contracts; BOS resolves the
   customer's installed provider integrations.
9. The selected commerce rail pays the developer and reports settlement to
   Subscription Director for BOS fee, revenue-share, and payout
   reconciliation.

The developer's reason to build on BOS is concrete: they can sell domain
intelligence without building a multi-tenant backend, OAuth system, CRM and
communications connectors, provider credential vault, authorization system,
audit system, subscription system, or integration-recovery UX.

The developer can set their price. BOS can monetize through one or more of:

- a percentage of the developer's subscription revenue through Subscription
  Director;
- metered BOS capability or integration usage;
- premium provider integrations;
- certification and managed distribution; and
- enterprise/private product hosting.

The first commercial implementation should use the existing Subscription
Director transaction-fee model and add product-scoped MCP entitlements plus the
commerce-adapter interface. Marketplace-specific adapters can then be added
without changing product packaging or MCP authorization.

## Third-party server integrations

Treat integrations as a second package type with a separate trust and
deployment model. A developer product package runs in the agent client. An
integration package runs inside BOS-controlled server infrastructure.

Example integration manifest:

```json
{
  "schema_version": "1",
  "integration_id": "com.acme.salesforce-crm",
  "version": "1.0.0",
  "implements": {
    "crm.contacts.search": "1.0",
    "crm.contacts.update": "1.0",
    "crm.pipeline.read": "1.0"
  },
  "authorization": {
    "type": "oauth2",
    "required_scopes": ["<declared-provider-scopes>"]
  },
  "egress": ["<declared-provider-host>"],
  "webhooks": [],
  "data_classes": ["customer-contact", "customer-pipeline"]
}
```

For the first phase, third-party integration source can remain in the
developer's repository and enter Lead Director through a reviewed contribution
or vendored, pinned server package. Lead Director owns deployment, credential
storage, egress controls, installation state, provider provenance, monitoring,
and rollback.

Later, BOS can operate a signed integration runtime that loads isolated adapter
artifacts. The same capability conformance suite certifies that an integration
implements the advertised contracts. A product may declare required
capabilities and compatible providers; it never installs or authorizes a
server integration by itself.

Integration developers can also monetize through per-install licensing,
usage-based revenue share, or a premium connector fee. That entitlement is
evaluated independently from the client product entitlement, allowing a
customer to pay one publisher for Acme CRM and another publisher for a
Salesforce adapter.

## Registration, trust, and release flow

1. The developer creates a product repository using the open BOS developer
   kit.
2. The manifest declares versioned BOS capability requirements.
3. Local tests run against synthetic conformance fixtures or a BOS sandbox.
4. The developer submits the product identity, release digest, capability set,
   pricing identity, support metadata, and publisher signature.
5. BOS reviews the skills, data use, actions, capability set, and publisher.
6. Lead Director provisions the immutable product resource registration and
   exact allowlists.
7. Subscription Director provisions commercial configuration and selects the
   available native or marketplace commerce rail.
8. BOS issues a signed registration lock consumed by the client builder.
9. The developer publishes generated host products from their repository.
10. Production authorization validates product registration, subscription,
    BOS context, role, installed plugins, provider provenance, and operation
    scope for every request.

Use visible trust tiers for BOS first-party, BOS verified, community, and
private products. A catalog listing can discover an external repository and
release without taking ownership of its skill source.

## Security boundaries

- A product manifest requests capability contracts; it grants none.
- Lead Director owns MCP product registration, tools, plugins, and route
  execution.
- Subscription Director supplies commercial status; BOS authorization decides
  resource access.
- Installed integration plugins and provider credentials remain scoped to the
  selected organization and application installation.
- Provider credentials never enter client packages or model chat.
- Every product receives one host-managed OAuth grant for its one immutable MCP
  resource.
- Product and integration releases use exact versions, digests, publisher
  signatures, provenance, and revocation records.
- Client skill packages and server integration packages have separate review,
  permission, and deployment pipelines.

## Required foundation work

### 1. BOS capability contracts

- extract stable provider-neutral contracts from the current operation
  catalog;
- assign IDs, versions, schemas, risk metadata, and conformance fixtures; and
- publish the catalog through Operations Center.

### 2. External product SDK

- define `bos-product.json` and the signed registration lock;
- make the current Operations Center generator usable from an external repo;
- generate Claude, Codex, and ChatGPT bindings from one product source; and
- validate route, skill, contract, and client parity.

### 3. Lead Director product registry

- evolve hardcoded resource-group declarations into a reviewed, immutable
  product registry;
- map approved capability contracts to existing operations, aliases, plugins,
  and provider dependencies; and
- preserve explicit allowlists and fail-closed startup validation.

### 4. Product entitlement bridge

- link a BOS `product_id` to its Subscription Director product account;
- create server-owned customer product entitlements;
- validate entitlement during OAuth issuance and every protected request; and
- support cancellation, expiry, tier changes, revocation, and audit.

### 5. Marketplace commerce adapters

- define normalized checkout, receipt, entitlement, refund, cancellation, and
  payout-reconciliation contracts;
- ship Subscription Director and Stripe Connect as the first adapter;
- add host adapters only when their verified software-product commerce
  contracts meet BOS entitlement requirements; and
- preserve one product entitlement model across every commercial rail.

### 6. Integration developer system

- publish a provider adapter interface and conformance suite;
- begin with reviewed Lead Director contributions or pinned packages;
- add egress, secret, provenance, sandbox, and operational review; and
- introduce isolated signed adapter deployment after the contract is proven.

## Immediate recommendation

Build My CRM as the first-party reference implementation of a general BOS
product SDK. In parallel, extract the initial CRM, communications, calendar,
and customer-data operations into versioned semantic capability contracts.
Then build a second CRM product in a separate repository using only the public
SDK and those contracts.

That second product is the decisive architecture test. It should have its own
brand, GitHub repository, plugin releases, named Lead Director MCP resource,
Subscription Director plan, customer entitlement, and revenue flow while
reusing BOS provider integrations. Passing that test proves the platform gives
external developers a real reason to build and monetize products on BOS.
