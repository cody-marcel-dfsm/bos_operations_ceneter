# BOS Operations Center architecture

## Purpose

BOS Operations Center is the canonical source, composition, validation, and
release system for portable BOS skills and native remote MCP client adapters.

## Ownership boundaries

- `source/platform/` owns tenant-neutral BOS operating and architecture skills.
- `source/capabilities/` owns reusable business capabilities.
- `source/verticals/` owns industry and franchise specialization.
- `source/runtime/` owns credential-free root BOS MCP connection templates for
  clients that distribute an endpoint directly. The root BOS Codex package
  owns the immutable MCP URL declaration. Subservice products contain
  no additional BOS connection binding.
- `products/` declares versioned compositions; build scripts generate client
  packages from those declarations.
- The BOS service owns authentication, authorization, tenant data, provider
  credentials, and business mutations.
- Client packages contain instructions and transports. They never contain
  customer credentials, reusable authority, or customer data.

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
   Web connector; Copilot and Gemini declare the immutable BOS resource
   directly; ChatGPT/Codex declares the root BOS endpoint through `.mcp.json`.
   Subservice plugins contain no additional BOS connection binding. No package contains an API-key field, authorization
   header template, or credential environment-variable binding. The host
   discovers BOS authorization metadata, launches consent, stores and refreshes
   the grant, and attaches a resource-scoped token. Recover missing underlying
   provider grants through the BOS service's server-returned OAuth or secure
   provider-credential flow in the active request, then verify and resume the
   interrupted operation automatically; keep secrets out of
   model chat, package files, customer settings, setup scripts, and logs.
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
    generation, every other skill in that product receives the same first-run
    preflight: validate the preserved customer overlay before its normal
    workflow, invoke the initializer when the overlay is missing, incomplete,
    or invalid, preserve the pending request through authentication and
    confirmation, then reload settings and resume it automatically. Apply this
    composition equally to Claude, Codex, Copilot, and Gemini packages.
11. Connect clients directly to one BOS HTTPS Streamable HTTP resource. Use the
    package-owned root BOS MCP declaration in Codex, one BOS account-level Web
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
    records the immutable HTTPS BOS endpoint and contains no account-scoped app
    identifier. Subservice plugins contain neither connection
    declaration. One host-managed BOS grant identifies the actor and available
    organizations; every request is evaluated against canonical application,
    installation, subservice, role, plugin, capability, provider, and tool
    state. Domain skills choose semantic operations while connection selection
    stays fixed on BOS. No plugin package reads, prompts for, substitutes, or
    persists BOS access or refresh tokens.
    Client readiness follows each host's authoritative state: Claude's active
    registry `installPath`; Gemini CLI's native extension metadata plus copied
    package bytes; Antigravity's exact repository symlinks; Copilot's selected
    repository MCP and skill files; and Codex's registry, managed package cache,
    package-owned MCP declaration, and callable-tool catalog. Retained inactive Claude
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
    reconnection, permission or execution-role changes, plugin updates,
    capability refreshes, and transport or MCP session replacement. Reconnect
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
16. Distribute pre-publication Claude and Codex products through their native
    local or private Git marketplaces. Claude uses
    `clients/claude/.claude-plugin/marketplace.json`; Codex uses
    `clients/codex/.agents/plugins/marketplace.json`. Keep marketplace manifests
    out of the repository root so merely opening the source project does not
    advertise its plugins. Keep separate host manifests and share
    canonical skills through deterministic generation. Installation adds the
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
    packages. Codex token-usage analysis remains a repository-maintainer skill
    under `.agents/skills` because it inspects Codex-local session data rather than
    delivering a customer product capability.
17. Treat a client as BOS-ready only when the root BOS plugin points to its
    immutable MCP resource—through one account connector for Claude, directly
    for Copilot and Gemini, and directly from the root package for Codex—OAuth
    discovery succeeds, the host holds a valid BOS grant, the server returns an
    authorized context, and tools for authorized installed subservices are
    discoverable. A missing or expired BOS grant triggers the host's single
    **Connect** or **Sign in** flow. Installation and recovery never request a BOS key, manipulate the
    desktop process environment, or use an OS-specific launcher. Plugin source
    changes require marketplace update or reinstall, cache refresh as supported
    by the host, and a new task.
    Codex installation acceptance is an atomic cross-layer check: the native
    registry and marketplace contain the active products, each product resolves
    to the current direct-source or managed-cache version, the package-owned MCP declaration
    matches the immutable BOS resource URL, and the callable catalog contains every
    product-declared runtime verification tool. Remediation is identity-bounded
    to the BOS marketplace and immutable resource URL and backs up host state before
    removing BOS-owned catalog entries.
    A user-authorized complete local uninstall is a separate destructive
    lifecycle: the repository-owned shell command uses active Codex ChatGPT
    authentication to remove any retired account-app record left by releases
    before the package-owned MCP migration. It then unregisters BOS and active
    subservice packages from every detected
    client and deletes only validated package/app/catalog artifacts and the shared
    BOS document/settings cache. It also removes the exact deprecated personal
    skill directories after validating each skill's declared identity; canonical
    sources and generated client packages remain intact for later installation.
    The lifecycle accepts explicit repository-scoped Copilot targets, preserves unrelated
    plugins and source repositories, creates no backup, and verifies registry
    and filesystem absence before success. The final authenticated account
    refresh verifies the source used by subsequent host catalog reads; a
    preexisting rendered view cannot recreate deleted account or disk state.
    A running ChatGPT/Codex Desktop process is force-restarted after the command
    reports success so stale in-memory plugin enablement cannot be persisted.
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
    installed-app membership. `bos_get_context` returns one opaque context for
    each assigned role and marks the unique highest `agent_authority_rank` as
    the default. An explicit lower-role request uses only another returned
    context and applies to that request. Clients preflight against the selected
    context and pass only its `context_id`; the service revalidates membership,
    capabilities, installation and plugin grants, semantic operation support,
    tenant scope, and provider readiness before every read or mutation. Plugin
    `run_as_role` remains reserved for callbacks and autonomous service work and
    never elevates an interactive OAuth actor. Role capability administration
    uses explicit `bos.roles.read` and `bos.roles.update`, complete replacement
    lists, optimistic revisions, and server-side audit. See
    `Vault/specs/role-aware-mcp-client.md`.
21. Present the BOS connection, installed subservices, server plugin enablement,
    provider-service readiness, and display-safe properties through the BOS
    Plugin Console inside the active client's content window. A console request
    remains memory-only: it writes no runtime artifact, executes no packaged
    renderer, starts no local process or service, and inspects no local plugin
    directory. The root BOS MCP resource and OAuth grant are shared by the
    installed subservices. The server returns ordered `structuredContent`, owns plugin
    state, revisions, connection actions, and audited enablement mutations, and
    remotely serves the associated MCP App resource. Clients render that state
    through their native structured-content or component surface and invoke the
    same authenticated remote tools for **Connect** buttons and enablement
    toggles. See `Vault/specs/plugin-service-console.md`.
22. Manage typed plugin settings through one application-neutral client
    contract and the shared root BOS connection. Establish
    non-secret recommendation inputs through the customer/client-settings
    initializer first, then run plugin-settings initialization after BOS
    authentication. The BOS service owns profiles, canonical values, revisions,
    preparation, mutations, audit, and initialization epochs. The client owns
    source research, consolidated confirmation, native or conversational
    controls, bounded delegated recovery, and an authority-scoped local cache
    containing confirmed display-safe snapshots only. Validate current
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

`Vault/` owns durable project knowledge. `bos:oracle` reads the architecture,
constitution, relevant specifications, current diff, and validation evidence
before answering architecture questions or issuing a repository review.

Lead Director and other BOS applications compose these platform contracts with
their own Vault knowledge and application-specific Oracle gates. External
approval services, signed verdicts, database-patch controls, and cloud runtime
identities remain in the repository that owns those mutations.

Detailed packaging and MCP design remains in `docs/DESIGN.md` while it is
incrementally promoted into focused Vault specifications.
