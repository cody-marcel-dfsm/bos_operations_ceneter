# BOS Operations Packages Design

## Purpose

BOS Operations Packages is the source and package-generation architecture for
portable operational products distributed to Codex, Claude, and GitHub
Copilot. Education Center is one product generated from this
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
industry or franchise. The Education Center pack can contain students, parents,
instructors, classes, camps, trials, Bright Horizons, Calimatic, and
franchise-specific enrollment rules.

Potential verticals include:

```text
verticals/education-center/
verticals/collision-repair/
verticals/home-services/
verticals/automation-agency/
```

The Education Center pack may adapt a generic capability into Education Center terminology, add
Education Center-specific policies, or provide a workflow that is meaningful only within
the franchise.

### Product packages

A product manifest selects the platform, capability, and vertical skills that
belong in a customer-facing product:

```text
products/
├── education-center/
│   └── product.json
└── bos/
    └── product.json
```

An Education Center product definition can select:

```json
{
  "name": "education-center",
  "includes": [
    "platform/bos-mcp-client",
    "capabilities/review-outreach",
    "capabilities/paid-attribution",
    "capabilities/daily-operations-planner",
    "verticals/education-center/class-operations",
    "verticals/education-center/student-operations",
    "verticals/education-center/instructor-operations",
    "verticals/education-center/parent-communications"
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

The BOS product owns the single runtime connection and includes
`bos-mcp-client` so the active agent owns transport recovery, live tool
discovery, context validation, and safe request resumption. Education Center,
CRM, Marketing Director, and every other subservice package contribute skills
without an app binding, connector, MCP declaration, or separate login. All
operations use `/mcp/apps/bos/platform`; the server filters tools and validates
organization, application, installation, subservice, plugin, role, capability,
provider, and tool scope on every request.

### In-memory BOS Plugin Console

The BOS package includes `bos-plugin-console` as the cross-product interaction
contract. The console uses the authenticated BOS connection and server-returned
subservice state. It does not enumerate local plugin folders or execute a
command-line plugin listing.

The BOS route exposes the authorized plugin-service snapshot as MCP
`structuredContent`. BOS orders the rows, supplies display-safe properties and
opaque action selectors, and associates the status response with a remotely
served MCP App resource. The active client renders the component directly in
its conversation or content window. Clients with another compatible native
structured-content surface may render the same response there; a client without
interactive component support retains the same table and accepts equivalent
natural-language actions.

Console queries write no report, cache, HTML, Markdown, or state file; execute
no packaged renderer; bind no localhost port; and start no local process,
browser, or service. The component's selected row, expanded property state, and
pending indicator exist only for the active client view. Canonical plugin state,
provider readiness, optimistic revisions, and audits remain server-owned.

**Connect** invokes the BOS route's scoped provider-authorization
tool. The **Enabled** toggle invokes its revisioned, idempotent PO/GO mutation.
Neither action installs, removes, starts, stops, or edits software on the user's
machine. See `Vault/specs/plugin-service-console.md` for the response, action,
security, and cross-client contracts.

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

Examples include Education Center Cherry Creek, DFSM, another Education Center franchise location, or
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
| `education-center-paid-attribution-operations` | Generic paid-attribution capability plus Education Center adapter |
| `education-center-director-daily-planner` | Generic location planner plus Education Center planner modules |
| `education-center-class-operations` | Education Center vertical |
| `education-center-student-operations` | Education Center vertical |
| `education-center-instructor-operations` | Education Center vertical |
| `education-center-parent-communications` | Generic communications capability plus Education Center policies and terminology |
| `education-center-invoice-operations` | Generic invoice capability plus Bright Horizons and Calimatic Education Center modules |
| `education-center-trial-reconciliation` | Generic appointment reconciliation plus Education Center adapter |

## Source and generated clients

The target canonical source layout is:

```text
source/
├── platform/
├── capabilities/
├── verticals/
│   └── education-center/
└── config/
products/
├── education-center/
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
capability, and vertical skills, and assembles the requested Codex, Claude,
Copilot, and Gemini packages. The single Gemini package includes Gemini CLI and
Antigravity Desktop native manifests around one shared skill tree and product
identity. It preserves the platform-specific manifests and adapters maintained
for each client.

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
    "product": "education-center",
    "skill": "education-center-class-operations",
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
generated customer packages and customer installation; a Codex plugin reinstall may
replace its cache and requires the developer to re-run the link command.

## What build means

Building is deterministic, OS-neutral client-package assembly. `npm run build`:

1. Reads the canonical platform, capability, and vertical skills.
2. Reads the product manifests.
3. Resolves each product's selected skill set.
4. Replaces the generated skill directory for each product/client
   distribution.
5. Assembles the selected skills into Codex, Claude, Copilot, and Gemini package
   layouts.

`npm run build:packages` performs the same client generation directly.

A build does not:

- install a client package;
- connect a customer to BOS;
- authenticate a user;
- create or change customer configuration;
- authorize a tenant or provider;
- call Gmail, Calendar, Drive, Calimatic, or another organization service;
- deploy or publish a release.

`npm run release:check` runs the complete credential-free local build, checks
package structure and generated parity, runs tests, and scans for credentials,
private keys, tokens, unsafe credential files, and local user paths. It creates
no archive and performs no live authenticated request.

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
file. The product manifest also names one included settings initializer. The
builder injects an equivalent first-run preflight into every other packaged
skill for Codex, Claude, Copilot, and Gemini. A missing, incomplete, or invalid
overlay invokes that initializer, preserves the pending request through setup,
and resumes the original workflow after the accepted settings are revalidated.

Customer settings may contain customer-facing brand names, organization display
names, location names, IANA timezones, mailbox selectors, billing identity, and
non-secret workflow defaults. They
never grant authority and never contain credentials, provider tokens, API
keys, tenant grants, or role assignments.

Initialization follows a derive-then-ask contract. The installer creates a
customer-owned initialization draft and derives the local IANA timezone. The
customer-initialization skill verifies the BOS connection's host-managed
authentication before eliciting settings, preserves confirmed settings, reads
unambiguous display metadata from the active client and authenticated BOS
context, and uses connected-account metadata to identify a mailbox only when there is one
clear candidate. It proposes a sourced default for every required base value,
labels uncertain inferences as suggestions, and lets the customer accept the
complete recommendation in one reply. Billing identity and customer identity
are never inferred from unrelated messages or public web data. The completed
file replaces the draft after validation.

The Education Center initialization questionnaire always recommends and
confirms `brand_display_name` when it is unresolved. A consistent organization
or location label may supply a suggested brand after explicit brand metadata is
exhausted. Every Education Center skill uses the accepted value for
customer-facing franchise or brand references. A skill-specific typed extension
may override `terminology.brand_display_name`. Neither value is interpolated
into package-owned technical identifiers.

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

Credentials and access authority remain outside customer configuration.
Claude and ChatGPT/Codex authorize the named BOS resource through host-managed
OAuth 2.1. Claude uses an account-level Web connector. Codex packages carry one
credential-free `.mcp.json` declaration for the immutable BOS resource and no
account-scoped `.app.json`. The hosts discover authorization metadata from the resource,
collect consent, store and refresh the grant, and attach its resource-scoped
access token. Skill files, generated packages, logs, customer settings,
customer-entered commands, and model chat remain credential-free. BOS owns encrypted provider-credential
persistence. For a missing provider grant, BOS returns a short-lived HTTPS
authorization or credential-collection URL. The customer completes that flow
with BOS through the active agent interface, and BOS handles validation,
callback processing, token exchange, and storage.

## MCP transport and client boundary

BOS runs as an independently deployed Streamable HTTP MCP server. Codex loads
the package-owned MCP resource, while Claude uses its native
remote MCP transport. Copilot packages contain skills
and configure the same remote endpoint through the host's supported MCP
settings. The distribution contains configuration and skills; it contains no
proxy executable, Python runtime, subprocess server, loopback listener, mobile
client, or OS-specific transport adapter.

The BOS platform package owns the single MCP endpoint at
`/mcp/apps/bos/platform`. Every subservice package contains skills and product
metadata without an MCP declaration, app binding, connector, or login. The BOS
service validates the OAuth token and evaluates organization, installation,
application, subservice, plugin, role, capability, provider, and tool scope for
each request. Tool discovery, routing, administrative-tool suppression, and
provider recovery are server responsibilities.

This follows the transport guidance published by OpenAI, Anthropic, and the
MCP maintainers: Streamable HTTP serves remote integrations; stdio serves
local process integrations that require direct machine access.

Controlling external references:

- [OpenAI plugin package guide](https://developers.openai.com/plugins/build/plugins)
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

The authenticated grant or session is the access gate. Local customer
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

Codex and Claude install from their native private marketplaces. The
installation contains only the
capabilities and vertical modules selected for that product. Installation
alone grants no organization access.

### 2. Load customer configuration

The client loads or receives its customer and location configuration. This
configures how the generic skills apply to that customer. It does not
authenticate BOS and does not authorize provider access.

### 3. Connect the account

The client loads the BOS product's host-native runtime binding. Codex loads the
package-owned BOS server named by `.mcp.json`; Claude uses the account-level BOS Web
connector. The host presents Connect once, completes OAuth discovery and consent,
and stores the BOS resource-scoped grant. Subservice packages load skills and
add no authentication surface. BOS validates the grant and canonical subservice
authority on every secured request. A provider authorization failure affects
only the operation requiring that provider.

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

An Education Center user should see concepts such as:

- Education Center;
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

`Education Center` remains the customer-facing name of the Education Center product
generated from the repository. Other product manifests produce independent
customer-facing distributions from the same platform and capability source.

## Release boundary

A public release is ready only when:

1. canonical skills and product manifests generate every intended client
   package;
2. `npm run release:check` passes;
3. generated clients match the canonical source;
4. deterministic installation tests pass;
5. host-managed BOS connection and authentication recovery are tested outside
   the repository release command; and
6. tenant isolation and no-fallback behavior are verified.
