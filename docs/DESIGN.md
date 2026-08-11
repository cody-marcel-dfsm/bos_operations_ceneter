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

Every product that owns a BOS runtime connection includes `bos-mcp-client` so
the active agent owns transport recovery, live tool discovery, context
validation, and safe request resumption. The BOS product publishes the other
general foundations. Runtime products such as iCode Operations Center carry
their fixed named application/group connection and the shared client-lifecycle
skill. Products requiring a restricted tool surface register a uniquely named
server and a BOS-owned named route. Current mappings include
`/mcp/apps/leaddirector/icode-operations`,
`/mcp/apps/leaddirector/video-ads`; the BOS platform package is skills-only.

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
├── copilot/
└── gemini/
scripts/
docs/
```

`source/platform/`, `source/capabilities/`, and `source/verticals/` are the
canonical skill sources. Skill instructions and supporting resources are
edited only in their owning canonical layer.

`clients/codex/`, `clients/claude/`, `clients/copilot/`, and `clients/gemini/` are generated
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
the installed product skills or in the host's customer-owned skills directory.
Every product includes `manage-customer-extension`, so a user can request the
change in natural language. An extension:

- has its own distinct skill name;
- declares the qualified product and base skill it extends;
- records the base product version it was tested against;
- invokes the base skill as its operating procedure;
- contains only customer terminology, defaults, policies, and exceptions; and
- defers unspecified behavior to the base skill.

The extension manifest uses schema version 2 and records:

```json
{
  "schema_version": "2",
  "ownership": "customer",
  "tenant": { "key": "example-center" },
  "extends": {
    "product": "icode-operations-center",
    "skill": "icode-class-operations",
    "tested_version": "0.4.9"
  },
  "overrides": {
    "terminology": {},
    "defaults": {},
    "policies": {},
    "exceptions": {}
  }
}
```

Each override has a stable key and a bounded text value. Repeating the same
update is idempotent; changing a key replaces that tenant value; removing a key
requires an explicit user request. Schema-version-1 extensions migrate by
preserving their original skill as `LEGACY.md` and composing typed overrides
over it.

Precedence follows the owning authority:

1. System, developer, workspace, and repository instructions remain
   authoritative.
2. BOS authentication, authorization, canonical scope, tool grants, and
   package invariants remain authoritative.
3. The packaged base skill supplies the reusable workflow.
4. The tenant extension replaces only its declared customer-configurable
   terminology, defaults, policies, and exceptions.
5. A task-specific user choice may replace a default for that task when the
   base workflow permits it.

The manager rejects keys or directives that attempt to change tenant or
organization identifiers, roles, credentials, authentication, authorization,
MCP endpoints, tool grants, system instructions, or other protected authority
surfaces.

The installer preserves files absent from its managed-path inventory. It
validates extension references and reports a compatibility warning when the
installed base version differs from the extension's tested version. Package
updates never merge prose with an LLM and never alter customer-owned extension
content.

Customer-owned storage is selected by the host: Codex user extensions use
`~/.agents/skills`, Claude user extensions use `~/.claude/skills`, and Copilot
repository extensions use `.agents/skills`. The BOS managed local installer
also supports extensions beside the installed product because its ownership
inventory preserves them. Product metadata in `.bos-product.json` gives the
same manager deterministic product, client, and version context everywhere.

When a user asks to update a packaged skill for one customer, the agent invokes
`manage-customer-extension`, resolves the product, base skill, and customer key,
inspects the current overlay, maps requested changes to typed keys, applies the
atomic update, and validates it. A request intended for every customer routes
to canonical product development instead of a tenant extension.

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

Building is deterministic, OS-neutral package and deployment-artifact
assembly. `npm run build`:

1. Reads the canonical platform, capability, and vertical skills.
2. Reads the product manifests.
3. Resolves each product's selected skill set.
4. Replaces the generated skill directory for each product/client
   distribution.
5. Assembles the selected skills into Codex, Claude, Copilot, and Gemini package
   layouts.
6. Creates deterministic per-product/client archives and a checksum manifest.
7. Creates versioned and stable cross-platform customer ZIPs containing the
   generated Codex, Claude, Copilot, and Gemini distributions.

`npm run build:packages` performs steps 1–5 for development.

A build does not:

- install a client package;
- connect a customer to BOS;
- authenticate a user;
- create or change customer configuration;
- authorize a tenant or provider;
- call Gmail, Calendar, Drive, Calimatic, or another organization service;
- deploy or publish a release.

`npm run release:check` runs the complete build, verifies all nine product
archives and both customer ZIP names, validates ZIP contents, checks package
structure, runs tests, and scans for credentials, private keys, tokens, unsafe
credential files, and local user paths. Platform installation tests and
authenticated end-to-end tests remain separate release checks.

The builder reads every product manifest, resolves its selected canonical
skills, and generates deterministic Codex, Claude, Copilot, and Gemini distributions.

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

Initialization follows a derive-then-ask contract. The installer creates a
customer-owned initialization draft and derives the local IANA timezone. The
customer-initialization skill preserves confirmed settings, reads unambiguous
display metadata from the active client and authenticated BOS context, and
uses connected-account metadata to identify a mailbox only when there is one
clear candidate. It asks one consolidated question for every remaining or
conflicting value. Billing identity is never inferred from unrelated messages
or public web data. The completed file replaces the draft after validation.

Customer-owned extension skills may consume this non-secret configuration to
specialize a packaged operating procedure. Extensions cannot grant tenant,
organization, application, role, plugin, capability, or provider authority.

Package settings templates contain reusable defaults and the schema for
customer-configurable source roles. The installed `customer-settings.json` is
a customer-owned overlay containing confirmed customer values. Skills resolve effective settings by
recursively overlaying it on the template. Builds replace templates and managed
skills while preserving the overlay; they never copy customer mailboxes,
provider selectors, or location values back into generated package files.

Source routing is domain-specific. One customer can route Calimatic, Lead
Director, Calendar, and general parent communications through BOS while routing
Care.com evidence through an exact account in the client's normal Gmail
connector. External connector evidence never expands BOS identity or authority.

Credentials and access authority remain outside customer configuration. Each
active runtime product declares one organization-scoped credential binding.
Claude packages expose that binding as a required sensitive `userConfig`
field. Claude collects the value through its native masked configuration
prompt, stores it in its secure credential store, and substitutes it directly
into the named MCP authorization header. The local package wrapper never reads
or transports the value. Other clients use their approved host credential
binding. Each named MCP connection forwards only its declared key as a Bearer
header over HTTPS. Skill files, generated packages, logs, customer settings,
customer-entered commands, and model chat remain credential-free. BOS owns encrypted provider-credential
persistence. For a missing provider grant, BOS returns a short-lived HTTPS
authorization or credential-collection URL. The customer completes that flow
with BOS through the active agent interface, and BOS handles validation,
callback processing, token exchange, and storage.

## MCP transport and client boundary

BOS runs as an independently deployed Streamable HTTP MCP server. Codex and
Claude use their native remote MCP transports. Copilot packages contain skills
and configure the same remote endpoint through the host's supported MCP
settings. The distribution contains configuration and skills; it contains no
proxy executable, Python runtime, subprocess server, loopback listener, mobile
client, or OS-specific transport adapter.

The BOS platform package registers no MCP endpoint. Application products use
their own immutable named routes. The BOS service authenticates the API key,
resolves tenant and installation context, and advertises only the tools
authorized for that endpoint. Tool discovery, routing, administrative-tool
suppression, and provider recovery are server responsibilities.

This follows the transport guidance published by OpenAI, Anthropic, and the
MCP maintainers: Streamable HTTP serves remote integrations; stdio serves
local process integrations that require direct machine access.

Controlling external references:

- [OpenAI Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp)
- [Anthropic Claude Code MCP](https://code.claude.com/docs/en/mcp)
- [MCP transport specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [Official MCP TypeScript SDK server guidance](https://ts.sdk.modelcontextprotocol.io/server)

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

Codex can install from a published customer ZIP. Before public marketplace
listing, Claude installs from an extracted source or customer package through
the package's single `npm run install:claude` entry point. That entry point
validates the local catalog and performs Claude's internal registration,
installation, and enablement operations. The installation contains only the
capabilities and vertical modules selected for that product. Installation
alone grants no organization access.

### 2. Load customer configuration

The client loads or receives its customer and location configuration. This
configures how the generic skills apply to that customer. It does not
authenticate BOS and does not authorize provider access.

### 3. Connect the account

The client loads each selected product's declared credential binding and
connects directly to its matching named HTTPS MCP endpoint. For Claude, the
plugin's required sensitive field supplies a one-question setup wizard: the
Claude configuration prompt accepts the administrator-provided key through
masked input and retains it in secure credential storage; the package wrapper
never handles it. BOS validates that route-bound key on every
secured request and fails closed when it is absent, invalid, expired, or
outside the endpoint's authorized product scope. A failed product connection
or provider credential cannot affect another product or organization. The
customer completes no second BOS password or login flow.

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
- Calimatic, SendGrid, and other API-key providers return a short-lived BOS
  HTTPS credential-collection URL and transaction identifier. The agent opens
  the URL, the customer submits the value directly to BOS, and the agent polls
  the sanitized transaction status.

Both flows keep provider credentials, OAuth passwords, and tokens out of the
conversation and client package.

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
4. Open the BOS-returned provider OAuth or HTTPS credential-collection URL
   through the active agent interface.
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
4. Codex, Claude, Copilot, and Gemini installation smoke tests pass;
5. BOS connection and authentication recovery are tested;
6. tenant isolation and no-fallback behavior are verified; and
7. release archives contain no credentials or customer data.
