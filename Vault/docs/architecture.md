# BOS Operations Center architecture

## Purpose

BOS Operations Center is the canonical source, composition, validation, and
release system for portable BOS skills and native remote MCP client adapters.

## Ownership boundaries

- `source/platform/` owns tenant-neutral BOS operating and architecture skills.
- `source/capabilities/` owns reusable business capabilities.
- `source/verticals/` owns industry and franchise specialization.
- `products/bos/product.json` is the sole authored BOS product authority. It
  owns the MCP resource URL. Build scripts generate every client transport
  artifact and repository contract from it.
- The root BOS Codex package owns one generated remote MCP declaration.
  Subservice products contain no additional BOS connection binding.
- `products/` declares versioned compositions; build scripts generate client
  packages from those declarations.
- The BOS service owns authentication, authorization, tenant data, provider
  credentials, and business mutations.
- Client packages contain instructions and transports. They never contain
  customer credentials, reusable authority, or customer data.
- Operations Center work stops at this repository boundary. Server requirements
  leave as one continuous copyable contract prompt containing the client-owned
  acceptance suite; implementation, review, merge, infrastructure, and
  deployment remain in the owning server repository.

## Runtime invariants

1. Resolve authenticated tenant, organization, application, installation,
   subservice, role, plugin, capability, provider, and tool scope on the server
   before private execution. The client uses the root BOS connection and never
   supplies or selects operational authority.
2. Keep platform behavior application-neutral and place business behavior in
   the owning application graph or capability.
3. Route mutations through PO orchestration and GO persistence.
4. Store provider credentials only in BOS-managed credential storage.
5. Authenticate Claude, ChatGPT/Codex desktop, OAuth-capable GitHub Copilot
   hosts, Gemini CLI, and Google Antigravity 2.0 Desktop once through the root
   BOS OAuth 2.1 MCP connection. Claude declares one BOS account or organization
   Web connector; Copilot and Gemini declare the BOS resource directly;
   ChatGPT/Codex declares it through the generated package `.mcp.json`.
   The Codex server entry binds `oauth_resource` to that same canonical URL and
   is required at startup so every task reaches BOS's authoritative credential
   acceptance or OAuth challenge instead of omitting a pending optional server.
   Its product-owned 45-second startup budget exceeds BOS's 30-second discovery
   deadline and the client's default startup budget.
   Subservice plugins contain no additional BOS connection binding. No package contains an API-key field, authorization
   header template, or credential environment-variable binding. The host
   discovers BOS authorization metadata, launches consent, stores and refreshes
   the grant, and attaches a resource-scoped token. Recover missing underlying
   provider grants through the BOS service's server-returned OAuth or secure
   provider-credential flow in the active request, then verify and resume the
   interrupted operation automatically; keep secrets out of
   model chat, package files, customer settings, setup scripts, and logs.
   A successful authenticated BOS context or provider call establishes the root
   identity boundary for its recovery transaction. The server-returned provider
   URL proceeds directly to provider consent or secure credential collection and
   never gates on a second BOS web session. The client refuses any root BOS
   sign-in presented inside provider recovery, preserves the transaction, and
   reports `provider_recovery_identity_boundary`.
6. Fail closed on missing, malformed, unauthorized, or ambiguous canonical
   state.
7. Generate every client package from canonical `source/`; generated client
   copies are build outputs rather than editing surfaces.
8. Preserve customer extension skills while package-owned skills are replaced
   deterministically during updates.
9. Keep customer identity and operating defaults out of canonical skills and
   generated release content. Product manifests may declare a settings template
   containing reusable defaults, customer-facing brand terminology, and typed
   source roles. Installers validate and
   write customer-specific values as a customer-owned settings overlay that
   package updates preserve. Skills resolve effective settings from the template
   plus that overlay; builds never copy customer brand names, mailboxes,
   provider selectors, or location values into managed skills or regenerated
   package files. A source
   role may select a separately connected client service for read-only evidence
   without changing BOS identity, scope, or mutation authority.
10. Initialize customer settings only after the BOS connection is
    authenticated. Preserve confirmed values, derive unambiguous non-secret
    client and canonical BOS metadata, and present sourced suggestions for
    unresolved or conflicting display values. Ask the user once to accept or
    correct the complete recommendation; persist suggested values only after
    confirmation. Derived configuration never grants authority.
    A product that declares a customer-settings template also declares one
    included settings-initialization skill. During deterministic client
    generation, every domain workflow in that product receives the same first-run
    preflight: validate the preserved customer overlay before its normal
    workflow, invoke the initializer when the overlay is missing, incomplete,
    or invalid, preserve the pending request through authentication and
    confirmation, then reload settings and resume it automatically. Apply this
    composition equally to Claude, Codex, Copilot, and Gemini packages. Root BOS
    control-plane routing remains initialization-independent so connection,
    plugin-console, and broad server-settings status requests can diagnose and
    configure the product without creating a customer overlay.
11. Connect clients to one BOS HTTPS Streamable HTTP resource. Use the
    package-owned BOS MCP declaration in Codex, one BOS account-level Web
    connector in Claude, one OAuth-discovered BOS connection in Copilot
    IDE/CLI, and one BOS connection in Gemini CLI and Antigravity 2.0 Desktop.
    Subservice packages add skills and metadata behind that connection. The
    Gemini product directory
    contains shared skills and product metadata, `gemini-extension.json` with
    OAuth enabled for Gemini CLI, and Antigravity's `plugin.json` plus a runtime
    `mcp_config.json` using `serverUrl`. A repository-local installer resolves
    its source tree from its own file location, deletes prior active or disabled
    BOS product entries without backups, and creates exactly one generated-product
    symlink per active product in Antigravity's global plugin directory. A Git pull
    and host restart then load current source without recopying packages. This
    clean bootstrap explicitly deletes local customizations along with prior
    BOS product entries. Before any filesystem mutation, the installer displays
    the destructive scope and target, warns that local BOS product customizations
    have no backup, and requires the exact typed confirmation
    `DELETE ALL BOS ANTIGRAVITY CUSTOMIZATIONS`. The root Claude BOS plugin owns
    account-connector metadata with no packaged MCP declaration. The root
    ChatGPT/Codex BOS plugin contains `mcpServers: "./.mcp.json"`; the MCP file
    records exactly one required remote HTTP BOS resource whose `oauth_resource`
    equals its URL and whose startup timeout is 45 seconds, and the package contains no
    `.app.json`. Subservice plugins contain
    neither connection declaration. One host-managed BOS grant identifies the
    actor and available organizations. After the token proves access to at least
    one organization, `tools/list` returns the complete static BOS
    operation/schema catalog without per-tool, role, plugin, capability, or
    provider filtering. Catalog presence grants no authority. `tools/call`
    validates the selected opaque context and evaluates application,
    installation, subservice, role, plugin, capability, provider, and tool state
    for the requested operation. Domain skills choose semantic operations while
    connection selection stays fixed on BOS. No plugin package reads, prompts
    for, substitutes, or persists BOS access or refresh tokens.
    Client readiness follows each host's authoritative state: Claude's active
    registry `installPath`; Gemini CLI's native extension metadata plus copied
    package bytes; Antigravity's exact repository symlinks; Copilot's selected
    repository MCP and skill files; and Codex's registry, managed package cache,
    required package MCP declaration and callable-tool
    catalog. Retained inactive Claude
    versions are informational and never satisfy installation readiness.
12. Treat generated client packages as build outputs. The complete
    cross-platform build materializes Codex, Claude, Copilot, and Gemini clients
    directly under `clients/` and validates them against canonical `source/`
    and product manifests. Repository release workflows do not generate ZIPs,
    tarballs, customer archives, or release manifests.
13. Apply tenant-specific skill changes through customer-owned typed extensions.
    Extension terminology, defaults, policies, and exceptions may specialize
    declared customer-configurable behavior. System instructions, package
    invariants, authentication, authorization, canonical scope, credentials,
    MCP endpoints, and tool grants remain sealed. Every product ships the same
    extension manager and versioned product metadata for Codex, Claude,
    Copilot, and the combined Gemini CLI/Antigravity Desktop client. Generated
    Antigravity `plugin.json` descriptions repeat the product release version
    so the plugin information UI exposes it directly.
14. Route feedback mutations through the root BOS MCP connection. Keep
    organization, application, installation, and delegated-role
    scope out of feedback arguments. Derive operational scope from the
    authenticated server context and fail closed on missing or ambiguous
    authority without broad-endpoint fallback.
15. Make the agent responsible for the MCP client lifecycle during an active
    request. Refresh the callable manifest after initial connection, OAuth
    reconnection, package or server-schema updates, and transport or MCP session
    replacement. Refresh context or operation status after permission,
    execution-role, plugin-enablement, capability, or provider changes. Reconnect
    the same configured endpoint, rediscover live schemas, revalidate canonical
    context, and resume the interrupted request with bounded retry. Preserve a
    sanitized continuation envelope containing a task-local request reference
    and sanitized request hash, server-owned workflow identities, approval
    bindings, completed/pending steps, and stable
    idempotency keys. Exclude tokens, credentials, raw authority IDs, provider
    payloads, and customer records. When a host cannot refresh tools in place,
    create or continue a same-task session, transfer that envelope, and resume
    automatically. Reconcile uncertain mutations by operation or idempotency
    identity before replay. Require user action only for secure provider
    authorization or credential-entry surfaces that inherently need direct
    user interaction.
    Treat token-endpoint `invalid_client` as a stale host-owned public-client
    registration: preserve the active request, keep the BOS resource fixed,
    replace the registration through current OAuth metadata, restart
    authorization once, refresh tools and context, and resume through the same
    BOS connection.
    Treat Codex request-time and MCP-startup `reauthenticationRequired` as a
    **Sign in** state. The package-owned root connection exposes the requested
    BOS tool descriptor with a per-tool OAuth `securitySchemes` declaration
    before consent. Descriptor visibility permits capability selection only;
    customer data and business execution remain protected. The selected tool's
    signed-out result returns `isError: true` and
    `_meta["mcp/www_authenticate"]` with `resource_metadata`, `error`, and
    `error_description`, causing the host to render the simple inline **Sign
    in** action. The user completes consent; the host refreshes the complete
    static BOS operation/schema catalog, the agent calls `bos_get_context`, and the
    original request resumes. A missing descriptor or challenge is a tool-auth
    contract defect; a received challenge without the action is a host
    authentication-activation defect. Never
    invoke CLI login or launch browser authentication on the user's behalf.
    Generic app permissions do not represent or repair MCP OAuth.
16. Distribute pre-publication Claude and Codex products through their native
    local or private Git marketplaces. Claude uses
    `clients/claude/.claude-plugin/marketplace.json`; Codex uses
    `clients/codex/.agents/plugins/marketplace.json`. Generate matching
    repository-root entrypoints at `.claude-plugin/marketplace.json` and
    `.agents/plugins/marketplace.json` so a Git URL resolves without a sparse
    checkout. Preserve those source manifests during every local uninstall.
    Keep separate host manifests and share canonical skills through deterministic generation. Installation adds the
    marketplace and installs the product skills. Claude account or organization
    connector provisioning registers the BOS resource once and presents
    the persistent **Connect** action under **Customize → Connectors**. A new task loads
    the installed skills after updates. Git marketplace installation is the
    skill-distribution path; repository release workflows create no customer archive.
    Publish Claude organization-marketplace releases through a version-bump pull
    request merged into the connected repository's default branch. That merge is
    the Claude GitHub synchronization event only when the organization owner has
    enabled automatic marketplace sync. Independently added Git marketplaces are
    refreshed by each account through Claude's supported marketplace controls;
    repository publishers hold no authority to mutate or force-refresh those
    accounts. Official Anthropic marketplace releases use its reviewed submission
    and publication process. Keep the generated plugin's `plugin.json` as the single
    Claude version authority and omit duplicate marketplace-entry versions. Keep
    Claude plugin sources as paths relative to the Git marketplace root so the
    Desktop native marketplace reader resolves the bumped manifest after the user
    selects the BOS marketplace's **Check for updates** action under the Code tab.
    The Anthropic-tab refresh action targets `claude-plugins-official` and is not
    the refresh control for independently added Code marketplaces.
    OpenAI Git marketplace consumers refresh the tracked repository snapshot through
    the Codex marketplace upgrade control; public ChatGPT/Codex directory releases
    require a separately reviewed and published OpenAI submission. Git pull-request
    history grants neither OpenAI publication nor client refresh authority.
    Portable business workflows belong to canonical product composition instead of
    a developer's personal skill directory. BOS owns its reusable operating,
    marketing, counsel, communications, and visual-output skills. Education
    Operation Center owns camp capacity, local school market research, and
    partnership proposal skills, and invokes BOS visual output through the
    installed BOS foundation. Deterministic
    generation places those skills in the Codex, Claude, Copilot, and Gemini
    packages. Oracle review and Codex token-usage analysis remain
    repository-maintainer skills under `.agents/skills` because they operate on
    this repository's local Vault or Codex-local session data rather than
    delivering customer product capabilities. Generated client packages never
    contain the Oracle skill.
17. Treat a client as BOS-ready only when the root BOS plugin points to its
    immutable MCP resource—through one account connector for Claude and directly
    for Codex, Copilot, and Gemini—OAuth
    discovery succeeds, the host holds a valid BOS grant, the server returns an
    authorized context, and the complete static BOS operation catalog is
    discoverable. Context, operation status, and `tools/call` results determine
    current subservice authorization. A missing or expired BOS grant triggers the host's single
    authentication flow. The protected-resource challenge establishes Codex's
    runtime `notLoggedIn` state.
    Installation and recovery never request a BOS key, manipulate the
    desktop process environment, or use an OS-specific launcher. Plugin source
    changes require marketplace update or reinstall, cache refresh as supported
    by the host, and a new task.
    Codex installation acceptance is an atomic cross-layer check: the native
    registry and marketplace contain the active products, each product resolves
    to the current direct-source or managed-cache version, the required BOS MCP
    declaration matches the product-owned resource, and the callable catalog
    contains every product-declared runtime verification tool. Remediation is identity-bounded
    to the BOS marketplace and immutable resource URL and backs up host state before
    removing BOS-owned catalog entries.
    The repository-owned cache reset is a filesystem-only maintenance lifecycle.
    Its deletion authority is limited to validated BOS package caches below
    `~/.codex/plugins/cache` and `~/.claude/plugins/cache`. It performs no account mutation,
    plugin or marketplace registration change, client configuration edit,
    personal-skill removal, process restart, or traversal of a source repository,
    generated client package, Gemini installation, or Copilot project. Resolve
    every target from those fixed client cache roots, validate BOS identity before
    deletion, reject symlinked package roots, and complete all preflight checks
    before removing any path.
18. Keep repository builds and release checks credential-free and local. They
    regenerate clients, validate canonical-source parity, scan for credentials
    and customer data, and run deterministic tests without a live MCP query or
    noninteractive OAuth access token. Verify live product connectivity after
    installation through each supported host's managed OAuth flow. Disabled or
    unreleased products are excluded from generated marketplaces, installation
    instructions, and release checks.
19. Give every BOS-family plugin on one OS user account a shared local
    document cache. The packaged `bos-mcp-client` resolves the same
    platform-native cache root from every client and product. It partitions
    indexes by a hash of the current server-derived authority and source
    account, deduplicates immutable document versions in a content-addressed
    object store, and coordinates refreshes with atomic cross-process leases.
    Skills validate current authority first, reuse covered cache intervals, and
    request only the source changes after the committed per-file or per-query
    watermark through a fixed refresh upper bound. A refresh publishes new
    documents, tombstones, coverage, cursor, and sync time in one atomic commit
    after every page succeeds. Failed or partial refreshes retain the previous
    watermark. See `Vault/specs/shared-local-document-cache.md`.
20. Resolve interactive execution roles from the authenticated user's current
    installed-app membership. When `bos_get_context` returns several
    organizations, select exactly one before selecting its role. An explicit
    organization in the request overrides the shared local default for that
    request; otherwise use the validated `default_organization_label` client
    preference or the sole available organization. The preference stores only
    a display label in a private platform-native file, is revalidated against
    the current authenticated context, and grants no authority. Missing, stale,
    or ambiguous selection stops before a domain data call. Cross-organization
    execution requires explicit user scope. Product initialization establishes
    or repairs this preference after authentication and before calling an
    organization-scoped plugin-settings inventory. A sole available
    organization may be committed directly; multiple organizations require the
    default in the initializer's consolidated confirmation. Within the selected organization,
    `bos_get_context` returns one opaque context for each assigned role and
    marks the unique highest `agent_authority_rank` as the default. An explicit
    lower-role request uses only another returned context and applies to that
    request. Clients preflight against the selected context and pass only its
    `context_id`; the service revalidates membership, capabilities,
    installation and plugin grants, semantic operation support, tenant scope,
    and provider readiness before every read or mutation. Plugin `run_as_role`
    remains reserved for callbacks and autonomous service work and never
    elevates an interactive OAuth actor. Role capability administration uses
    explicit `bos.roles.read` and `bos.roles.update`, complete replacement
    lists, optimistic revisions, and server-side audit. See
    `Vault/specs/role-aware-mcp-client.md`.
21. Present the BOS connection, installed subservices, server plugin enablement,
    provider-service readiness, and display-safe properties through the BOS
    Plugin Console inside the active client's content window. A console request
    remains memory-only: it writes no runtime artifact, executes no packaged
    renderer, starts no local renderer or service, and inspects no local plugin
    directory. Its sole local preflight reads the shared display-label default
    through the packaged client-preferences helper and validates it against the
    organizations returned by the current `bos_get_context`. Broad requests for
    plugin settings, server settings, connection status, enablement, services,
    or display properties route here before any product initialization
    preflight. A request for all settings of one unambiguously named plugin
    resolves that plugin from the live inventory and opens the typed settings
    surface directly. The root BOS MCP resource and OAuth grant are shared by the
    installed subservices. The server returns ordered
    `structuredContent`, owns plugin state, revisions, connection actions, and
    audited enablement mutations, and remotely serves the associated MCP App resource.
    Clients render the actual readable values through a mounted component or an
    immediate conversational table; a generic structured-result tool card does
    not satisfy the UI contract. Mounted components invoke the same
    authenticated remote tools for **Connect** buttons and enablement toggles.
    Product initialization reuses this canonical service inventory for
    the selected default or explicit organization, preserves healthy and
    disabled rows, and walks actionable provider connections one at a time
    before organization-scoped plugin-settings discovery. It never queries all
    accessible organizations by default. A failed live console query never
    falls back to a prior task, typed-settings cache, local inventory, or
    cross-organization summary. See
    `Vault/specs/plugin-service-console.md`.
22. Manage typed plugin settings through one application-neutral client
    contract and the shared root BOS connection. Route broad plugin inventory
    and server-settings status requests to the memory-only Plugin Console.
    For a specific required setting that needs sourced discovery, establish
    non-secret recommendation inputs through the customer/client-settings
    initializer first, then run plugin-settings initialization after BOS
    authentication. The BOS service owns profiles, canonical values, revisions,
    preparation, mutations, audit, and initialization epochs. The client owns
    selected-organization connection guidance, source research, consolidated
    confirmation, native or conversational
    controls, bounded delegated recovery, and an authority-scoped local cache
    containing confirmed display-safe snapshots only. Codex Agent Harness
    renders the ordered fields as an in-memory client-native settings table
    with an inline control for each editable value and native **Apply** and
    **Discard** actions. When only the generic tool-result viewer is available,
    it renders the complete readable values and authorized natural-language
    actions directly in the conversation. It creates no file, renderer,
    browser, localhost process, or separate UI service. Validate current
    authority before every cache read or mutation; fetch and cache the canonical
    snapshot on a miss; reconcile uncertain writes before replay; update the
    cache only from confirmed server reads or commits. Required unset or invalid
    partial values resume the same initialization coordinator. See
    `Vault/docs/plugin-settings-streaming-sync-design.md`.
23. Prove current-product completeness from current implemented components.
    Future products, anticipated growth, and expected package composition are
    never dependencies that satisfy missing current behavior. See
    `Vault/specs/single-bos-mcp-connection.md`.

## Knowledge and review

`Vault/` owns durable project knowledge. The repository-local
`.agents/skills/oracle` workflow reads this project's architecture,
constitution, relevant specifications, current diff, and validation evidence
before answering architecture questions or issuing a repository review. Oracle
is not part of the BOS customer product and is absent from generated client
packages.

Lead Director and other BOS applications compose these platform contracts with
their own Vault knowledge and application-specific Oracle gates. External
approval services, signed verdicts, database-patch controls, and cloud runtime
identities remain in the repository that owns those mutations.

Detailed packaging and MCP design remains in `Vault/docs/DESIGN.md` while it is
incrementally promoted into focused Vault specifications. Every canonical
design, specification, decision, review, plan, status record, and durable
operational document lives under `Vault/` and is covered by the Oracle vector
index. Root and component documentation remains beside the interface or
executable component it serves.
