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
└── bos/
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

Product selection prevents unrelated skills from appearing in a user's client
and allows one canonical capability to support multiple products.

Product selection and repository specialization are complementary. A product
manifest selects the BOS foundations, capabilities, and vertical workflows
installed for a user. An application repository can then provide
repository-local skills that apply those foundations to its source,
architecture, tests, and release gates. Lead Director follows this pattern by
composing `bos:*` foundation skills with `lead-director-*` repository skills.
Lead Director therefore has no companion plugin that republishes BOS
foundations.

Install the `bos` foundation plugin once per client. It owns the single BOS MCP
connection. Companion product plugins such as iCode Operations Center package
vertical and capability skills and use the BOS connection without registering
a second server with the same name.

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

`source/platform/`, `source/capabilities/`, and `source/verticals/` are the
canonical skill sources. Skill instructions and supporting resources are
edited only in their owning canonical layer.

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

## Installed skill ownership and customer extensions

Generated and installed product skills are immutable, package-owned files.
Installers mark managed files read-only, create a recoverable backup, and
replace managed content with the selected release. A direct modification to a
managed file is treated as disposable local state and is restored from the
package during the next apply.

Customer behavior is expressed through customer-owned extension skills beside
the installed product skills. An extension:

- has its own distinct skill name;
- declares the qualified product and base skill it extends;
- records the base product version it was tested against;
- invokes the base skill as its operating procedure;
- contains only customer terminology, defaults, policies, and exceptions; and
- defers unspecified behavior to the base skill.

The installer preserves files absent from its managed-path inventory. It
validates extension references and reports a compatibility warning when the
installed base version differs from the extension's tested version. Package
updates never merge prose with an LLM and never alter customer-owned extension
content.

Official product development changes the canonical source layers. Customer
experimentation changes an extension skill. A generally useful customer
behavior is promoted deliberately into canonical source and released through
the normal build.

An authorized package developer may opt into machine-local Codex development
links. The local link command backs up active cached skill directories and
symlinks them to canonical source directories. This makes the active Codex
skill and repository skill one filesystem object and removes local
reconciliation from the developer loop. The mode is deliberately outside
release artifacts and customer installation; a Codex plugin reinstall may
replace its cache and requires the developer to re-run the link command.

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

The builder reads every product manifest, resolves its selected canonical
skills, and generates deterministic Codex, Claude, and Copilot distributions.

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

A product that needs customer-specific values declares an empty settings
template in its product manifest. The package builder copies that template to
each supported client distribution. During installation, the completed JSON is
validated and written as `config/customer-settings.json` with customer
ownership and restrictive permissions. Managed package hashes exclude the
completed file, so upgrades preserve it. Skills read required values from that
file and return `configuration_required` when a required value is absent.

Customer settings may contain display names, location names, IANA timezones,
mailbox selectors, billing identity, and non-secret workflow defaults. They
never grant authority and never contain credentials, provider tokens, API
keys, tenant grants, or role assignments.

Customer-owned extension skills may consume this non-secret configuration to
specialize a packaged operating procedure. Extensions cannot grant tenant,
organization, application, role, plugin, capability, or provider authority.

Credentials and access authority are not customer configuration. They must
never be written into skill files, generated packages, logs, ordinary client
configuration, or chat. The MCP opens a nonce-bearing, expiring loopback page
for BOS credentials and provider API keys. The customer submits the secret
directly to the MCP process. BOS owns encrypted provider-credential persistence.
OAuth passwords, authorization codes, access tokens, and refresh tokens never
pass through Codex; the customer signs in directly with the provider and BOS
handles the callback and token exchange.

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

The customer gives Codex a GitHub release ZIP URL. Codex downloads, verifies,
extracts, and installs the named product without asking the customer to run a
shell command. The installation contains only the capabilities and vertical
modules selected for that product. Installation alone grants no organization
access.

### 2. Load customer configuration

The client loads or receives its customer and location configuration. This
configures how the generic skills apply to that customer. It does not
authenticate BOS and does not authorize provider access.

### 3. Connect the account

Before authentication, the packaged MCP advertises a stable fail-closed tool
contract. When the first secured operation requires BOS access, Codex calls
`bos_start_authentication`. The broker opens an expiring one-time page bound to
`127.0.0.1`; the customer enters the credential there. The broker keeps it only
in MCP session memory. It never enters chat or is written to the package,
configuration, shell history, or logs.

### 4. Resolve tenant and capabilities

After connection, the client asks BOS for the authenticated context. BOS
resolves the authorized tenant and reports installed plugins, capabilities, and
credential states. If more than one authorized organization or location is
available and the request does not identify one, the client asks the user to
select the intended scope.

### 5. Authorize required providers

When a domain request requires a missing, expired, revoked, or insufficient
provider credential, BOS returns a structured `authorization_required` result
with an original operation identifier.

- Gmail, Calendar, Drive, Outlook, and other OAuth providers return a
  short-lived authorization URL and transaction identifier. Codex opens the
  URL, the customer signs in directly with the provider, BOS receives the
  callback and stores the tokens, and Codex polls
  `bos_get_authorization_status`.
- Calimatic, SendGrid, and other API-key providers return a sensitive-field
  request. Codex calls `bos_start_provider_credential_handoff`, and the customer
  enters the value in the one-time local page. BOS validates, encrypts, and stores it within
  server-validated tenant, installed-app, plugin, provider, and credential
  scope.

Neither flow echoes credential values. Credentials, OAuth passwords, and tokens
never enter the conversation. Provider keys enter only the write-only MCP call
created internally by the broker after local submission.

### 6. Verify and run

The client verifies connection and capability status, then runs the requested
operation within the resolved tenant and location scope. After successful
credential recovery, Codex calls `bos_resume_operation` and retries the original
operation exactly once. The result names the operational scope clearly enough
for the user to verify it.

## Authentication recovery

When BOS client authentication or provider authorization fails:

1. Stop the affected operation.
2. Classify the failure as BOS client authorization, capability authorization,
   or provider credential authorization.
3. Report the exact tenant, plugin, capability, and credential state returned
   by BOS.
4. Start the local BOS credential handoff, provider OAuth, or local provider-key
   handoff according to the structured recovery response.
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
