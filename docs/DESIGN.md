# BOS Operations Packages Design

## Purpose

BOS Operations Packages is the source and package-generation architecture for
portable operational products distributed to Codex, Claude, and GitHub
Copilot. iCode Operations Center is one product generated from this
architecture. Lead Director and future BOS-supported products can select other
capabilities and vertical packs from the same canonical source.

The design separates:

1. BOS platform mechanics;
2. reusable business capabilities;
3. industry or franchise workflows;
4. named product packages; and
5. customer-specific configuration.

This separation keeps the platform and MCP architecture reusable while giving
each user a focused, product-specific client experience.

See [SKILL_HIERARCHY_AND_COMPOSITION.md](SKILL_HIERARCHY_AND_COMPOSITION.md)
for the canonical system, user, plugin, repository, and nested-directory skill
scopes; the `bos:*` package namespace; and the contract for application skills
such as Lead Director to specialize reusable BOS foundations.

The package, customer configuration, and access authority are separate:

```text
generic platform and capability source
    + product and vertical selection
    + client-stored customer configuration
    + authenticated BOS client access
    + authorized tenant/provider capability
    = authorized operation
```

Customer configuration supplies context. It does not supply authority. A
configured client without valid BOS authentication cannot read or change
organization data.

## Architectural layers

```text
BOS platform layer
    ↓
reusable capability skills
    ↓
industry or franchise skill packs
    ↓
named product package
    ↓
customer configuration + authenticated BOS access
```

### BOS platform layer

The platform layer contains mechanics shared by every product:

- MCP protocol and transport rules;
- authenticated BOS client access;
- tenant resolution and isolation;
- plugin and capability discovery;
- provider authorization;
- authentication recovery;
- evidence and mutation rules; and
- no-fallback enforcement.

`bos-mcp-client` is the initial platform skill. BOS terminology belongs in the
repository, MCP and API contracts, authorization surfaces, diagnostics, and
technical documentation.

### Reusable capability skills

Capability skills describe business procedures that can apply across products,
industries, organizations, and provider combinations. Examples include:

- review outreach;
- paid attribution;
- daily operations planning;
- communications;
- invoice reconciliation;
- appointment reconciliation;
- staff onboarding;
- capacity planning;
- Meta Ads operations; and
- Lead Director operations.

A capability skill defines the operating method and required capability
contracts. The selected product, vertical modules, client configuration, and
authenticated tenant context supply terminology, provider mappings, policies,
and scope.

### Industry or franchise packs

Vertical packs contain domain concepts and rules that genuinely belong to an
industry or franchise. The iCode pack can contain students, parents,
instructors, classes, camps, trials, Bright Horizons, Calimatic, and
franchise-specific enrollment rules.

Potential verticals include:

```text
verticals/icode/
verticals/collision-repair/
verticals/home-services/
verticals/automation-agency/
```

The iCode pack may adapt a generic capability into iCode terminology, add
iCode-specific policies, or provide a workflow that is meaningful only within
the franchise.

### Product packages

A product manifest selects the platform, capability, and vertical skills that
belong in a customer-facing product:

```text
products/
├── icode-operations-center/
│   └── product.json
├── lead-director/
│   └── product.json
└── bos-operations/
    └── product.json
```

An iCode product definition can select:

```json
{
  "name": "icode-operations-center",
  "includes": [
    "platform/bos-mcp-client",
    "capabilities/review-outreach",
    "capabilities/paid-attribution",
    "capabilities/daily-operations-planner",
    "verticals/icode/class-operations",
    "verticals/icode/student-operations",
    "verticals/icode/instructor-operations",
    "verticals/icode/parent-communications"
  ]
}
```

A Lead Director product definition can select:

```json
{
  "name": "lead-director",
  "includes": [
    "platform/bos-mcp-client",
    "capabilities/lead-management",
    "capabilities/paid-attribution",
    "capabilities/meta-ads",
    "capabilities/appointment-reconciliation"
  ]
}
```

Product selection prevents unrelated skills from appearing in a user's client
and allows one canonical capability to support multiple products.

Product selection and repository specialization are complementary. A product
manifest selects the BOS foundations, capabilities, and vertical workflows
installed for a user. An application repository can then provide
repository-local skills that apply those foundations to its source,
architecture, tests, and release gates. Lead Director follows this pattern by
composing `bos:*` foundation skills with `lead-director-*` repository skills.

### Customer configuration

Customer configuration supplies the final operating context:

- authenticated tenant and authorized organizations;
- locations;
- providers;
- mailboxes and calendars;
- CRM pipelines;
- advertising accounts;
- terminology;
- provider and entity mappings;
- workflow defaults; and
- customer or location exceptions.

Examples include iCode Cherry Creek, DFSM, another iCode franchise location, or
a Lead Director customer. Customer-specific facts belong in customer
configuration. Shared franchise semantics belong in a vertical pack. Reusable
procedures belong in capability skills.

## Classification rule

Classify every skill or rule using these boundaries:

| Question | Destination |
|---|---|
| Does it control authentication, tenant isolation, transport, recovery, or capability routing? | Platform |
| Is it a reusable procedure across industries or products? | Capability |
| Does it encode industry or franchise terminology and rules? | Vertical pack |
| Does it identify a customer, location, account, mapping, preference, or exception? | Customer configuration |
| Does it decide which capabilities a named user-facing product includes? | Product manifest |

The current skills should evolve as follows:

| Current skill | Target |
|---|---|
| `bos-mcp-client` | Platform |
| `bos-google-review-outreach` | Generic review-outreach capability plus Google Business Profile contract |
| `icode-paid-attribution-operations` | Generic paid-attribution capability plus iCode adapter |
| `icode-director-daily-planner` | Generic location planner plus iCode planner modules |
| `icode-class-operations` | iCode vertical |
| `icode-student-operations` | iCode vertical |
| `icode-instructor-operations` | iCode vertical |
| `icode-parent-communications` | Generic communications capability plus iCode policies and terminology |
| `icode-invoice-operations` | Generic invoice capability plus Bright Horizons and Calimatic iCode modules |
| `icode-trial-reconciliation` | Generic appointment reconciliation plus iCode adapter |

## Source and generated clients

The target canonical source layout is:

```text
source/
├── platform/
├── capabilities/
├── verticals/
│   └── icode/
└── config/
products/
├── icode-operations-center/
└── lead-director/
clients/
├── codex/
├── claude/
└── copilot/
scripts/
docs/
```

The current `source/skills/` directory remains canonical during migration.
Skill instructions and supporting resources are edited only in the canonical
source layer.

`clients/codex/`, `clients/claude/`, and `clients/copilot/` are generated
distributions. The build resolves each product manifest, selects its platform,
capability, and vertical skills, and assembles the requested Codex, Claude, and
Copilot packages. It preserves the platform-specific manifests and adapters
maintained for each client.

Generated skill copies are not independent sources. Changes made only under a
generated client directory will be replaced by the next build. The development
workflow is:

1. Edit a canonical platform, capability, or vertical skill.
2. Update a product manifest when product composition changes.
3. Run `npm run build`.
4. Run `npm run release:check`.
5. Commit the canonical change and regenerated client distributions together.

This keeps all clients synchronized without manually copying individual files.

## What build means

Building is deterministic package assembly. `npm run build` runs
`scripts/build-packages.mjs`, which:

1. Reads the canonical platform, capability, and vertical skills.
2. Reads the product manifests.
3. Resolves each product's selected skill set.
4. Replaces the generated skill directory for each product/client
   distribution.
5. Assembles the selected skills into Codex, Claude, and Copilot package
   layouts.

A build does not:

- install a client package;
- connect a customer to BOS;
- authenticate a user;
- create or change customer configuration;
- authorize a tenant or provider;
- call Gmail, Calendar, Drive, Calimatic, or another organization service;
- deploy or publish a release.

`npm run release:check` builds all clients and then validates package structure
and scans the repository for credentials, private keys, tokens, unsafe
credential files, and local user paths. A successful build proves that the
distribution can be assembled. Platform installation tests and authenticated
end-to-end tests remain separate release checks.

The current builder copies the iCode skill set into three clients. The target
builder adds product-manifest selection while retaining deterministic,
single-source generation.

## MCP and API capability model

BOS should expose stable, business-oriented capabilities such as:

- `communications.search`;
- `communications.draft`;
- `calendar.list_events`;
- `ads.list_campaigns`;
- `attribution.reconcile`;
- `classes.list`;
- `students.lookup`;
- `reviews.create_outreach`; and
- `lead_director.search_leads`.

The authenticated client key resolves tenant authority. The request selects an
authorized capability and operational scope. Provider implementations remain
behind the stable capability contract, allowing a reusable skill to work
across appropriate provider combinations.

This model provides one execution layer, reusable skills, stable provider
contracts, tenant isolation, and product-specific client experiences.

## Customer configuration

Customer and location configuration may be stored by the installed client.
This includes non-secret operating context such as organization and location
selection, timezone, business rules, provider mappings, and workflow defaults.
The exact client storage mechanism may differ across Codex, Claude, and
Copilot.

Customer configuration remains outside the generic package source and generated
public distribution. Updating the generic package does not overwrite the
client's customer configuration.

Credentials and access authority are not customer configuration. BOS client
keys, provider API keys, OAuth client secrets, access tokens, refresh tokens,
passwords, cookies, service-account files, and private keys must never be
written into skill files, generated packages, prompts, chat messages, MCP
arguments, or ordinary client configuration. They are handled through the
client's secure BOS connection and BOS-hosted provider setup.

## Authentication and authorization

Every organization operation requires:

1. a valid authenticated BOS client connection;
2. an explicitly resolved BOS tenant;
3. authorization for the requested BOS plugin and capability; and
4. a healthy tenant-scoped provider credential when the capability uses an
   external provider.

The authenticated key or session is the access gate. Local customer
configuration never bypasses that gate.

Tenant isolation is mandatory. A credential, provider connection, capability,
or configuration from one tenant cannot be substituted for another tenant.

## No-fallback access policy

There is no non-logged-in usage mode for secured organization operations.
There is also no:

- unauthenticated execution;
- local-data execution fallback;
- direct-provider fallback;
- native connector fallback;
- browser-session or cookie fallback;
- Chrome, Computer Use, or interactive-login fallback;
- alternate-tenant fallback;
- mock or example-data fallback presented as a real operation;
- configuration-only access path.

When authentication or authorization is unavailable, the affected operation
stops. The client reports the exact tenant, plugin, capability, and credential
state available from BOS and starts the applicable recovery flow.

## First-time user flow

### 1. Install the client distribution

The user installs a named product, such as iCode Operations Center or Lead
Director, for Codex, Claude, or GitHub Copilot. The installation contains only
the capabilities and vertical modules selected for that product. Installation
alone grants no organization access.

### 2. Load customer configuration

The client loads or receives its customer and location configuration. This
configures how the generic skills apply to that customer. It does not
authenticate BOS and does not authorize provider access.

### 3. Connect the account

The user selects **Connect your account** and completes the client's secure BOS
authentication flow. The resulting BOS client authorization must be handled by
the client connection mechanism and must never be pasted into chat or written
into the package.

### 4. Resolve tenant and capabilities

After connection, the client asks BOS for the authenticated context. BOS
resolves the authorized tenant and reports installed plugins, capabilities, and
credential states. If more than one authorized organization or location is
available and the request does not identify one, the client asks the user to
select the intended scope.

### 5. Authorize required providers

When a workflow requires an unconfigured provider:

- Calimatic or another API-key provider opens the secure BOS-hosted
  credential-entry flow.
- Gmail or another Google OAuth provider opens the BOS-hosted Google
  authorization flow.
- Another supported provider uses its published BOS-hosted authorization
  flow.

Provider credentials never pass through the conversation or skill arguments.

### 6. Verify and run

The client verifies connection and capability status, then runs the requested
operation within the resolved tenant and location scope. The result should name
the operational scope clearly enough for the user to verify it.

## Authentication recovery

When BOS client authentication or provider authorization fails:

1. Stop the affected operation.
2. Classify the failure as BOS client authorization, capability authorization,
   or provider credential authorization.
3. Report the exact tenant, plugin, capability, and credential state returned
   by BOS.
4. Direct the user to **Connect your account** or the appropriate BOS-hosted
   setup flow.
5. Verify the connection after the user completes authorization.
6. Retry the affected operation once.
7. Stop and report the unresolved state if verification or the retry fails.

Recovery restores the required authenticated path. It never selects another
data source or execution path.

## Package updates

Package updates replace the selected generic, capability, vertical, and client
adapter content while preserving customer configuration managed by the client.
After an update, the client continues using its existing customer configuration
and authenticated BOS connection when those remain valid.

If BOS authentication, provider authorization, or configuration is no longer
valid, the client follows the standard recovery flow. An update never creates a
fallback path.

## Client terminology

The client presents the named product and its operational vocabulary.

An iCode user should see concepts such as:

- iCode Operations Center;
- classes;
- students;
- parents;
- instructors;
- camps;
- trials; and
- reviews.

A Lead Director user should see concepts such as:

- Lead Director;
- leads;
- pipeline;
- appointments;
- Meta Ads;
- attribution; and
- follow-up.

BOS platform terminology remains available in authorization screens, technical
details, diagnostics, and support documentation. Daily client workflows use
the product's language. A secondary “Powered by BOS” label may identify the
execution platform without making platform architecture part of the normal
workflow.

## Repository identity

The repository should be renamed before standalone Git history and public
release. The recommended internal repository name is
`bos-operations-packages`.

`iCode Operations Center` remains the customer-facing name of the iCode product
generated from the repository. Other product manifests produce independent
customer-facing distributions from the same platform and capability source.

## Release boundary

A public release is ready only when:

1. canonical skills and product manifests generate every intended client
   package;
2. `npm run release:check` passes;
3. generated clients match the canonical source;
4. Codex, Claude, and Copilot installation smoke tests pass;
5. BOS connection and authentication recovery are tested;
6. tenant isolation and no-fallback behavior are verified; and
7. release archives contain no credentials or customer data.
