# BOS marketplace and agent-harness distribution plan

Status: partially implemented; desktop authentication amended 2026-08-11
Date: 2026-08-09
Owner: BOS Operations Center

## Outcome

Publish BOS client skill groups through the native distribution mechanisms for
Claude, OpenAI, Gemini, and Copilot while preserving the BOS application and
MCP grouping architecture.

Every distributed product is a client-side package of skills, instructions,
metadata, and a remote MCP connection. A package connects directly to a fixed,
human-readable application and skill-group route. Installing a marketplace
package never selects, creates, or provisions a BOS application.

The confirmed Education Center Operations route is:

```text
https://dfsm.ai/mcp/apps/leaddirector/education-center
```

The work includes correcting the current ID-based Vault language, runtime
templates, package generation, installers, skills, tests, and generated client
artifacts. Those sources are migration targets rather than constraints on this
plan.

## Canonical route contract

The remote MCP route has two stable, human-readable path segments:

```text
/mcp/apps/{application-name}/{skill-group-name}
```

For the confirmed route:

- `leaddirector` names the BOS application.
- `education-center` names the MCP and client skill grouping exposed through
  Lead Director.
- Both names are declared by the product and application owners at build time.
- Neither segment is an identifier, database key, installation ID, tenant
  selector, or customer-provided value.

One BOS application may expose multiple named MCP groups. Multiple client skill
packages may therefore map to the same application while connecting to
different group routes. Education Center Operations and the video skill package both map
to Lead Director. Future BOS applications may expose their own named groups
when those applications are implemented.

The current canonical video group route is:

```text
/mcp/apps/leaddirector/video-ads
```

The BOS platform product is skills-only and registers no MCP connection. All
application packages use their fixed named routes.

## Architecture boundaries

### Client package responsibilities

Each client package owns:

- the included canonical skills and instructions;
- the fixed BOS application name and MCP group name;
- native harness connection metadata;
- marketplace name, description, prompts, icons, screenshots, version, and
  support links;
- declaring each runtime product's immutable MCP resource and using the native
  host authorization mechanism;
- connection recovery and rediscovery within the active request; and
- client-side composition of server-advertised MCP tools.

### BOS service responsibilities

The BOS service continues to own:

- authentication and authorization;
- tenant, organization, actor, role, and plugin scope;
- the Lead Director application graph and each named MCP tool group;
- provider credentials and BOS-hosted provider authorization recovery;
- PO orchestration, GO persistence, and all business mutations;
- audit, idempotency, and fail-closed enforcement; and
- the tool manifest advertised by each named MCP route.

### Explicit exclusions

Marketplace installation does not:

- provision a BOS application;
- select an application or MCP group at runtime;
- accept an application ID or installed-app ID;
- infer a route from a tenant, organization, prompt, or credential;
- combine tools or credentials from multiple BOS routes into one operation; or
- accept credentials or authority through plugin configuration fields.

Each active Claude or ChatGPT/Codex runtime product has one host-managed OAuth
grant for its named connection. Different products may resolve different
organizations and actors while each domain skill selects its matching named
connection.
Underlying provider authorization
continues through BOS-hosted secure flows when a server operation reports that
authorization is required.

## Canonical product manifest design

Product manifests must replace the ambiguous `mcp_resource_group` and
installed-application routing model with explicit human-readable route fields:

```json
{
  "application_name": "leaddirector",
  "mcp_group_name": "education-center",
  "codex_app_id": "asdk_app_<registered-id>"
}
```

The package generator derives the immutable URL:

```text
https://dfsm.ai/mcp/apps/{application_name}/{mcp_group_name}
```

The manifest schema must require lowercase human-readable slugs composed of
letters, numbers, and hyphens. Route fields are package-owned and cannot appear
in customer settings or enable-time prompts.

The same product manifest remains the canonical source for Claude, Codex,
ChatGPT, Gemini CLI, and Copilot output. Generated client packages are build
artifacts and must not be edited directly.

## Harness designs

### Claude Code

Distribute each skill group as a native Claude plugin from the repository-root
Claude marketplace.

Each generated plugin contains:

- `.claude-plugin/plugin.json`;
- `.mcp.json` with the product's fixed remote MCP URL;
- the product's generated `skills/` tree;
- marketplace metadata, documentation, and default prompts.

The Education Center plugin connects to:

```text
https://dfsm.ai/mcp/apps/leaddirector/education-center
```

Claude enablement presents Connect and completes host-managed BOS OAuth. The
package never requests an application, group, or BOS key. The root marketplace lists each independently
installable skill group and points at its generated plugin directory.

Claude Code validation covers marketplace discovery, installation, enablement,
MCP tool discovery, skill activation, reads, confirmed mutations, provider
authorization recovery, transport recovery, updates, and uninstall/reinstall.

### Claude Desktop

Use the same generated skills and fixed MCP route as Claude Code. Prefer the
native Claude plugin when Desktop supports the same plugin package. If the
Desktop marketplace requires a connector-specific registration, generate that
adapter from the same product manifest.

Claude Code and Claude Desktop must expose equivalent skill content, use the
same named route, and produce equivalent tool discovery. Any Desktop-only
metadata remains an adapter concern and cannot change the BOS route or tool
authority.

### OpenAI Codex

Distribute each skill group as an OpenAI plugin containing Codex skills and a
required registered app binding.

The generated registration contains only:

```json
{
  "apps": {
    "education-center": {
      "id": "asdk_app_6a7cb1cc330c81918aa63d96aeeaba91",
      "required": true
    }
  }
}
```

The registered app owns the fixed Education Center MCP resource. Codex presents
Connect/Sign in and stores and refreshes the resulting grant. The package
contains no credential field, route setting, `.mcp.json`, or `mcpServers`.
A fresh Codex task must discover the installed skill group and registered app
without manual reconstruction.

Codex validation covers plugin installation, skill discovery, OAuth discovery
and connection, MCP discovery, a representative read, a confirmed
mutation, provider authorization recovery, transport reconnection, task
continuation, package update, and credential containment.

### ChatGPT

Represent each public product as an MCP-backed OpenAI app and associate its
workflow skills with the corresponding Plugin Directory listing.

The ChatGPT app definition points to the same fixed named route as Codex. It
must classify tools and actions accurately, expose clear confirmation behavior
for mutations, and provide complete public metadata:

- product name, concise and long descriptions;
- icons, screenshots, category, and example prompts;
- privacy policy, terms, support, and developer identity;
- tool purpose, read/write classification, and data handling; and
- test credentials or a review environment when required by the submission
  process.

ChatGPT developer-mode validation precedes public submission. Validation covers
connection, tool discovery, action controls, workspace access controls,
confirmation behavior, reads, mutations, provider authorization recovery,
revoked or invalid credentials, and server tool-manifest updates.

ChatGPT remains a client adapter. Its directory connection flow cannot create,
choose, rename, or remap a BOS application or MCP group.

### Gemini CLI

Distribute each product as a GitHub-hosted Gemini CLI extension with tagged
releases and gallery metadata.

The generated `gemini-extension.json` contains:

- the product name, version, and description;
- the fixed remote MCP URL;
- a declared sensitive product credential setting for each named BOS
  connection;
- the generated skills directory; and
- optional context or commands derived from canonical product sources.

The Education Center extension uses:

```json
{
  "mcpServers": {
    "education-center": {
      "httpUrl": "https://dfsm.ai/mcp/apps/leaddirector/education-center",
      "headers": {
        "Authorization": "Bearer ${EDUCATION_CENTER_BOS_API_KEY}"
      }
    }
  }
}
```

Gemini validation covers extension structural validation, installation from a
public GitHub URL, sensitive-setting storage, named-route discovery, skill
activation, reads, mutations, provider authorization recovery, restart,
extension update, and removal. After direct GitHub installation passes, submit
the extension for Gemini Extensions Gallery discovery.

### GitHub Copilot

Continue generating a Copilot adapter from the same product manifest so the
repository preserves its declared cross-client parity.

The adapter contains the fixed named MCP route, references the product-specific
key through Copilot's supported secret configuration, and carries prompts or
instructions derived from the canonical skills. Validate organization-level
installation, policy controls, MCP discovery, representative reads and
mutations, and credential containment.

Copilot marketplace publication can follow the Anthropic, OpenAI, and Google
rollout. Delaying its public listing does not permit its generated package or
tests to retain the obsolete ID-based route model.

## Affected surfaces and owners

| Surface | Classification | Owner | Required change |
| --- | --- | --- | --- |
| Vault architecture and specifications | Platform knowledge | BOS Operations Center | Replace ID-based endpoint language with the named application/group contract. |
| Product manifests | Product composition | BOS Operations Center | Declare `application_name` and `mcp_group_name`. |
| Runtime MCP template | MCP client adapter | BOS Operations Center | Remove `BOS_INSTALLED_APP_ID`; accept a build-generated fixed URL. |
| Package model and build scripts | Build infrastructure | BOS Operations Center | Generate equivalent native configurations from the two route fields. |
| Installers and launchers | Client shell | BOS Operations Center | Remove application-ID collection and materialization. |
| Platform and vertical skills | Client instructions | Owning canonical source | Remove installed-app-ID lifecycle instructions and preserve server-returned operational context. |
| Lead Director route/tool implementation | Application graph and MCP capability | Lead Director owning repository | Expose and certify the named routes and their server-advertised tool groups. |
| Claude artifacts | Plugin/client adapter | BOS Operations Center | Generate native marketplace plugins with fixed routes. |
| OpenAI artifacts | Plugin/app/client adapter | BOS Operations Center | Generate Codex plugins and ChatGPT app submission assets. |
| Gemini artifacts | Extension/client adapter | BOS Operations Center | Generate a gallery-ready GitHub extension. |
| Copilot artifacts | Client adapter | BOS Operations Center | Preserve parity with the named route model. |
| Tests and release checks | Validation | BOS Operations Center and owning application repository | Reject obsolete routes and certify live behavior. |

## Parallel execution model

The work should run as coordinated tracks with narrow dependency gates. A
track owns a distinct surface and may proceed concurrently whenever its listed
entry gate is satisfied.

### Gate 0: Route decisions

Complete these decisions before implementation branches diverge:

1. Confirm `leaddirector/education-center` as the Education Center mapping.
2. Record `leaddirector/video-ads` as the current video mapping.
3. Record the BOS platform product as skills-only with no MCP mapping.
4. Approve the manifest fields `application_name` and `mcp_group_name`.
5. Approve the rule that neither route segment is customer configuration or an
   identifier.

Gate output: a product-to-route inventory covering every product targeted for
the first marketplace release.

### Track A: Canonical architecture and contracts

Owner: BOS Operations Center platform knowledge
Entry gate: Gate 0
Can run with: Tracks B, C, and D design

Deliverables:

- named application/group routing specification;
- corrected Vault architecture and constitution language;
- corrected feedback, authentication, and MCP client contracts;
- product manifest schema changes;
- migration rules for obsolete ID-based language and fields; and
- synced Vault index and current source manifest.

Exit gate: active canonical knowledge defines only the named two-segment
client route model.

### Track B: Lead Director named MCP routes

Owner: Lead Director owning repository
Entry gate: Gate 0
Can run with: Tracks A, C, D, and E

Deliverables:

- live `/mcp/apps/leaddirector/education-center` route;
- approved and live Lead Director video-group route;
- group-specific server-advertised tool manifests;
- API-key authentication and authorization enforcement;
- unknown and unauthorized route rejection;
- provider authorization, audit, PO/GO, and idempotency evidence; and
- application-repository approval evidence for each public route.

Exit gate: each marketplace-targeted named route is live and contract-tested.

### Track C: Marketplace identity and submission assets

Owner: product/release operations
Entry gate: product names from Gate 0
Can run with: all engineering tracks

Deliverables:

- publisher identity and verified domains;
- icons, screenshots, categories, descriptions, and example prompts;
- privacy policy, terms, support, security, and data-handling pages;
- tool/action catalog and read/write classification;
- review environment instructions where required; and
- per-marketplace submission checklists.

Exit gate: the common asset set and harness-specific submission fields are
ready for final package versions.

### Track D: Shared manifest, runtime, and generator migration

Owner: BOS Operations Center packaging
Entry gate: approved fields from Gate 0; final merge follows Track A contracts
Can run with: Tracks A, B, C, and E design

Deliverables:

- product manifests using `application_name` and `mcp_group_name`;
- one shared fixed-route builder;
- runtime templates without `BOS_INSTALLED_APP_ID`;
- generated Claude, Codex, ChatGPT, Gemini, and Copilot configurations;
- deterministic cross-client parity tests; and
- CI rejection of IDs, broad routes, one-segment routes, and unresolved route
  substitutions.

Exit gate: every generated adapter for a product uses the same exact named
route.

### Track E: Skills, installers, and client lifecycle

Owner: BOS Operations Center canonical skills and installation
Entry gate: Gate 0; final integration follows Tracks A and D
Can run with: Tracks B, C, and D

Deliverables:

- MCP client instructions for immutable named connections;
- removal of installed-app-ID discovery, repair, and materialization;
- preserved server-returned operational authorization context;
- feedback and provider recovery over the configured named connection;
- installers that request no route or application value;
- launchers that bind only approved credentials; and
- customer-extension and settings preservation tests.

Exit gate: a clean client installation requires no application or group input.

### Track F: Claude harnesses

Owner: Claude adapter
Entry gate: stable generated package from Track D; live route from Track B for
end-to-end certification
Can run with: Tracks G, H, and I

Subtracks:

- F1: Claude Code repository marketplace plugin.
- F2: Claude Desktop native plugin or connector adapter.

Deliverables:

- generated plugin manifests, MCP configuration, and skills;
- sensitive BOS API-key enablement;
- marketplace root entries;
- live install, discovery, workflow, recovery, update, and reinstall evidence;
  and
- Anthropic submission bundle.

Exit gate: Claude Code and Desktop use the same route and equivalent skills.

### Track G: OpenAI harnesses

Owner: OpenAI adapter
Entry gate: stable generated package from Track D; live route from Track B for
end-to-end certification
Can run with: Tracks F, H, and I

Subtracks:

- G1: Codex plugin and registered app binding.
- G2: ChatGPT MCP-backed app and Plugin Directory listing.

Deliverables:

- Codex skill/plugin artifacts and required `.app.json` binding;
- ChatGPT app metadata, tool classifications, and confirmation behavior;
- private developer-mode validation;
- live install, discovery, workflow, recovery, update, and access-control
  evidence; and
- OpenAI submission bundle.

Exit gate: Codex and ChatGPT use the same fixed route and pass their native
governance controls.

### Track H: Gemini CLI

Owner: Gemini adapter
Entry gate: stable generated package from Track D; live route from Track B for
end-to-end certification
Can run with: Tracks F, G, and I

Deliverables:

- validated `gemini-extension.json`;
- generated skills and optional canonical context/commands;
- public GitHub repository and tagged releases;
- direct GitHub install, MCP discovery, workflow, restart, update, and removal
  evidence; and
- Gemini Extensions Gallery submission bundle.

Exit gate: the public extension installs directly and passes live Gemini CLI
certification.

### Track I: GitHub Copilot

Owner: Copilot adapter
Entry gate: stable generated package from Track D; live route from Track B for
end-to-end certification
Can run with: Tracks F, G, and H

Deliverables:

- fixed-route MCP registration;
- supported secret binding;
- generated prompts/instructions;
- organization installation and policy-control evidence; and
- future marketplace submission assessment.

Exit gate: Copilot retains full named-route and generated-content parity even
when public marketplace publication follows later.

### Track J: Cross-harness certification and release

Owner: BOS Operations Center release engineering
Entry gate: Tracks B, D, and E complete; harness candidates from F-I available
Can run with: late-stage work in each harness track

Deliverables:

- shared live behavioral matrix;
- route, skill, and tool-manifest parity evidence;
- deterministic builds and release archives;
- credential and customer-data scans;
- migration compatibility evidence;
- release manifest and checksums; and
- final Oracle review of the actual diff and validation results.

Exit gate: every claimed harness passes its applicable certification matrix
and no material review finding remains.

### Track K: Submission, pilot, and general availability

Owner: product/release operations
Entry gate: Tracks C and J complete

Submission waves:

1. Claude repository marketplace and manual upload package.
2. Gemini public GitHub release and direct installation.
3. Private Codex/OpenAI plugin and ChatGPT developer-mode rollout.
4. OpenAI public Plugin Directory/app submission.
5. Gemini Extensions Gallery submission.
6. Anthropic partner or directory submission when applicable.
7. Copilot organization distribution and later marketplace submission.

Pilot operations include sanitized monitoring of connection failures, tool
discovery, provider recovery, confirmation behavior, and version adoption.
General availability requires no unresolved routing, tenant-isolation,
credential, or mutation-safety finding.

## Track dependency map

```text
Gate 0: route decisions
  |-- Track A: architecture/contracts ---------|
  |-- Track B: Lead Director routes -----------|
  |-- Track C: marketplace assets -------------|---- Track J: certification
  |-- Track D: generators ----|                |              |
  |                           |-- Tracks F-I ---|              v
  |-- Track E: skills/installers --------------|        Track K: publish/pilot
```

Tracks F, G, H, and I are intentionally parallel. Their shared inputs come from
Tracks B, D, and E; harness-specific implementation and marketplace evidence do
not block one another.

## Detailed work packages and acceptance criteria

### Phase 0: Confirm the route inventory

1. Record `leaddirector/education-center` as the confirmed Education Center route.
2. Inventory every product and the BOS application that owns its MCP tools.
3. Record `video-ads` as the current human-readable MCP group name for the
   video skills.
4. Record the BOS platform product as shipping without an MCP connection.
5. Record future application/group mappings only when their owning applications
   exist; do not create speculative routes.

Exit gate: every currently publishable product has exactly one approved
application name and MCP group name, or is explicitly classified as having no
MCP connection.

### Phase 1: Correct canonical knowledge

1. Update `Vault/docs/architecture.md` and the constitution where necessary.
2. Add a focused specification for named application/group MCP routing.
3. Replace installed-app-ID route instructions in design documents, PRDs,
   implementation plans, and feedback contracts.
4. Preserve operational context fields only where the server actually returns
   them for domain authorization; remove them as client route inputs.
5. Sync the Vault index and verify its latest source manifest.

Exit gate: Vault searches for `installed_app_id`, `BOS_INSTALLED_APP_ID`, and
`/mcp/apps/{installed_app_id}` return only intentional migration history or
server-domain concepts, never the active client routing contract.

### Phase 2: Migrate manifest and runtime schemas

1. Add `application_name` and `mcp_group_name` to the product manifest schema.
2. Remove or migrate `mcp_resource_group` where it represents the obsolete
   one-segment client route.
3. Update all current product manifests.
4. Change the source runtime template so generated packages receive their exact
   fixed URL during the build.
5. Remove `BOS_INSTALLED_APP_ID` from tracked templates, client settings,
   launchers, installers, documentation, and validation.
6. Add deterministic migration checks so legacy product definitions fail with
   a precise correction message.

Exit gate: product validation accepts only the named two-segment route model.

### Phase 3: Update cross-harness generation

1. Implement one shared route builder used by every client generator.
2. Generate Claude, Codex, ChatGPT, Gemini, and Copilot adapters from the same
   product route fields.
3. Keep harness-specific secret syntax and metadata in client adapters.
4. Add package-parity tests asserting that every generated adapter for a
   product targets the same URL.
5. Reject unnamed endpoints, one-segment `/mcp/apps/{value}`, IDs, unresolved
   substitutions, and customer-editable route values.

Exit gate: deterministic builds produce equivalent named routes across every
claimed harness.

### Phase 4: Update skills and client lifecycle instructions

1. Update the BOS MCP client skill to discover and reconnect the installed
   product's fixed named connection.
2. Remove instructions to derive, ask for, repair, or materialize an installed
   application ID.
3. Preserve `bos_get_context` and server-returned operational scope where
   required for authorized tool calls.
4. Update feedback and provider-authorization workflows to use the already
   configured named connection.
5. Update customer initialization so it never treats route fields as customer
   configuration.

Exit gate: client skills treat the route as immutable package configuration
and retain all fail-closed authorization behavior.

### Phase 5: Update installers and release packaging

1. Remove installed-app-ID questions and settings from every installer.
2. Install each product's generated host-native runtime binding.
3. Complete host-managed OAuth for Claude and Codex; keep their packages free
   of BOS credential fields.
4. Preserve customer-owned skill extensions and non-route settings.
5. Regenerate deterministic archives, stable customer ZIPs, release manifests,
   checksums, and marketplace packages.
6. Scan every artifact for secrets, customer data, unresolved variables, and
   obsolete route forms.

Exit gate: a clean installation needs no application or MCP-group input.

### Phase 6: Server and contract validation

The owning Lead Director repository must certify the named routes against the
actual server before marketplace publication.

1. Verify the confirmed Education Center route resolves over HTTPS Streamable HTTP.
2. Verify its advertised tool manifest matches the Education Center Operations workflows.
3. Verify the named video route after its group name is approved.
4. Verify authentication, tenant isolation, role and plugin enforcement,
   provider authorization recovery, PO/GO mutation boundaries, audit, and
   idempotency.
5. Verify that an API key cannot use an unauthorized application/group route.
6. Verify that unknown application and group names fail closed.

Exit gate: signed or otherwise canonical application-repository evidence
confirms each public route and tool group.

### Phase 7: Live harness certification

Run a shared behavioral matrix in Claude Code, Claude Desktop, Codex, ChatGPT,
Gemini CLI, and Copilot:

1. fresh package installation;
2. secure API-key configuration;
3. exact named URL inspection;
4. MCP initialization and tool discovery;
5. skill discovery and activation;
6. representative read-only workflow;
7. confirmed mutation workflow;
8. missing provider authorization and successful BOS-hosted recovery;
9. transport loss, reconnection, and request continuation;
10. uncertain mutation reconciliation without blind replay;
11. invalid or revoked credential rejection;
12. unauthorized application/group rejection;
13. package update and customer-extension preservation; and
14. uninstall and clean reinstall.

Exit gate: every harness claimed by a product passes the applicable matrix and
produces retained sanitized evidence.

### Phase 8: Marketplace submission

Prepare a common submission asset set:

- publisher identity and verified domains;
- product names and descriptions;
- icons, screenshots, categories, and example prompts;
- privacy policy, terms, support, security, and data-handling documentation;
- read/write action classifications and confirmation expectations;
- versioning, release notes, and support lifecycle;
- review environment or credentials when requested; and
- installation, configuration, update, and removal instructions.

Publish in this order:

1. Claude repository marketplace and manual plugin upload package.
2. Gemini public GitHub releases and direct extension installation.
3. Private Codex/OpenAI plugin and ChatGPT developer-mode validation.
4. OpenAI public Plugin Directory/app submission.
5. Gemini Extensions Gallery submission.
6. Anthropic partner or directory submission when a separate public review
   channel applies.
7. Copilot organization distribution and later marketplace submission.

Exit gate: marketplace reviewers can install each package, connect using the
documented credential flow, discover the expected tools, and complete the
approved representative workflows.

### Phase 9: Pilot and general availability

1. Release to internal and selected customer users first.
2. Monitor sanitized connection failures, tool discovery, authorization
   recovery, action confirmation, and version adoption.
3. Reconcile marketplace review findings into canonical sources and regenerate
   all clients.
4. Expand availability after the pilot has no unresolved tenant-isolation,
   credential, routing, or mutation-safety findings.
5. Maintain one compatibility table covering product version, harness version,
   endpoint, and certification date.

## Validation strategy

### Unit tests

- route slug validation;
- exact URL generation;
- legacy field rejection;
- manifest validation;
- harness-specific secret binding; and
- deterministic metadata generation.

### Contract tests

- every product maps to one declared application/group pair;
- every generated client uses the same route;
- route fields are absent from customer configuration;
- the package contains no IDs or unresolved endpoint substitutions;
- tool manifests match the owning product contract; and
- write tools retain clear mutation semantics.

### Integration tests

- remote Streamable HTTP initialization;
- bearer authentication;
- server context validation;
- read and write workflows;
- provider authorization recovery;
- connection recovery; and
- unauthorized route rejection.

### Release tests

- deterministic cross-platform build;
- generated-output parity;
- archive and release-manifest consistency;
- credential and customer-data scans;
- marketplace manifest validation; and
- live harness smoke-test evidence.

## Migration and compatibility

This change intentionally replaces the current client routing contract. Do not
maintain an indefinite client fallback to ID-based or one-segment routes.

During a bounded migration window:

1. deploy and validate the named server routes;
2. release client packages using the named routes;
3. verify active customers have upgraded;
4. measure remaining requests to obsolete routes using sanitized telemetry;
5. remove obsolete routes after the published compatibility window; and
6. reject any later package that reintroduces the old contract.

Customer credentials, provider grants, data, and customer-owned skill
extensions must remain preserved. The route migration changes client transport
configuration and package contracts; it does not migrate or reprovision BOS
applications.

## Rollback conditions

Pause or roll back a client release when:

- the named server route is unavailable or advertises the wrong tool group;
- any harness generates a different route for the same product;
- credentials appear in tracked or released artifacts;
- tenant, role, plugin, or application/group authorization fails closed
  incorrectly;
- a mutation can be replayed without reconciliation after transport loss;
- customer extensions or settings are overwritten; or
- a marketplace package requires application selection, route entry, or
  provisioning.

Rollback uses the last validated client release while the named-route defect is
corrected. Server compatibility for that release remains available for the
bounded support window. Rollback never restores broad MCP fallback authority.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Current Vault and code reinforce the obsolete ID model. | Update knowledge, schema, runtime, generators, skills, installers, and tests in dependency order; reject legacy fields in CI. |
| A package group is mistaken for a separate BOS application. | Require separate `application_name` and `mcp_group_name` fields and assert the complete route in tests. |
| Harnesses drift in endpoint or credentials. | Use one product manifest and one route builder with generated-output parity tests. |
| A group name changes after publication. | Treat names as stable public API; use explicit migration and release notes for any future rename. |
| A marketplace asks for configuration that could alter scope. | Expose only supported secret configuration; keep route fields immutable and fail submission rather than weaken authority. |
| Provider authorization is confused with BOS client authentication. | Keep BOS API-key authentication and BOS-hosted provider recovery as separate documented flows. |
| Public artifacts expose customer information. | Retain deterministic credential and customer-data scans before release. |

## Documentation deliverables

- named application/group MCP routing specification;
- corrected BOS architecture and constitution language;
- product-to-route inventory;
- per-harness installation and configuration guides;
- marketplace privacy, terms, support, security, and data-handling pages;
- tool/action catalog with read/write classification;
- release and compatibility matrix;
- migration guide from obsolete ID-based packages; and
- retained cross-harness certification evidence.

## Completion criteria

The plan is complete when:

1. every active source and generated artifact uses the human-readable
   application/group route contract;
2. Education Center Operations connects to
   `/mcp/apps/leaddirector/education-center` in every harness;
3. every additional published group has an owner-approved stable route;
4. no client requests an application ID, installed-app ID, application
   selection, or provisioning;
5. all claimed harnesses pass the shared certification matrix;
6. public packages pass credential, customer-data, parity, and deterministic
   release checks;
7. the marketplace submission assets are complete; and
8. the selected Anthropic, OpenAI, and Google distribution channels have
   accepted or can directly install the validated packages.
