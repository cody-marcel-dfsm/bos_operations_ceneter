# BOS Operations Center architecture

## Purpose

BOS Operations Center is the canonical source, composition, validation, and
release system for portable BOS skills and native remote MCP client adapters.

## Ownership boundaries

- `source/platform/` owns tenant-neutral BOS operating and architecture skills.
- `source/capabilities/` owns reusable business capabilities.
- `source/verticals/` owns industry and franchise specialization.
- `source/runtime/` owns credential-free remote MCP connection templates for
  clients that distribute an endpoint directly. Product manifests own the
  stable registered Codex app ID for each Codex runtime product.
- `products/` declares versioned compositions; build scripts generate client
  packages from those declarations.
- The BOS service owns authentication, authorization, tenant data, provider
  credentials, and business mutations.
- Client packages contain instructions and transports. They never contain
  customer credentials, reusable authority, or customer data.

## Runtime invariants

1. Resolve authenticated tenant, organization, application, installation,
   role, and plugin scope on the server before private execution. Client route
   names select an application-owned MCP tool group; they do not supply or
   grant operational authority.
2. Keep platform behavior application-neutral and place business behavior in
   the owning application graph or capability.
3. Route mutations through PO orchestration and GO persistence.
4. Store provider credentials only in BOS-managed credential storage.
5. Authenticate Claude, ChatGPT/Codex desktop, OAuth-capable GitHub Copilot
   hosts, Gemini CLI, and Google Antigravity 2.0 Desktop product connections
   through the host's OAuth 2.1 MCP
   authorization flow. Claude account or organization Web connectors and Gemini
   packages declare the immutable HTTPS MCP resource directly. Claude marketplace
   plugins remain skills-only and contain no `.mcp.json` or `mcpServers`, preventing
   Claude from classifying the resource as `Connects in sessions`. Codex packages declare a required
   registered app in `.app.json`; that app owns the immutable resource. None of
   these packages contains an API-key field, authorization header template, or
   credential environment-variable binding. The host
   discovers BOS authorization metadata, launches consent, stores and refreshes
   the grant, and attaches a resource-scoped token. Recover missing underlying
   provider grants through the BOS service's server-returned OAuth or secure
   provider-credential flow in the active agent interface; keep secrets out of
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
10. Initialize customer settings only after the runtime product connection is
    authenticated. Preserve confirmed values, derive unambiguous non-secret
    client and canonical BOS metadata, and present sourced suggestions for
    unresolved or conflicting display values. Ask the user once to accept or
    correct the complete recommendation; persist suggested values only after
    confirmation. Derived configuration never grants authority.
11. Connect clients directly to BOS over HTTPS Streamable HTTP. Use a registered
    app binding in Codex, an account-level Web connector in Claude, the
    OAuth-discovered remote connection in Copilot IDE/CLI, and one Gemini extension umbrella
    for Gemini CLI and Antigravity 2.0 Desktop. The Gemini product directory
    contains shared skills and product metadata, `gemini-extension.json` with
    OAuth enabled for Gemini CLI, and Antigravity's `plugin.json` plus a runtime
    `mcp_config.json` using `serverUrl`. A Claude runtime plugin contains
    account-connector metadata and no MCP declaration. A Codex runtime plugin contains
    `apps: "./.app.json"` and no `.mcp.json` or `mcpServers`; its product
    manifest records the stable `asdk_app_*` identifier. Every runtime product declares one immutable
    package-owned route using the exact static form
    `/mcp/apps/{application-name}/{skill-group-name}`. Both path segments are
    stable human-readable slugs, never IDs or customer settings. Each active
    Claude, ChatGPT/Codex, OAuth-capable Copilot, or Gemini runtime product obtains exactly one host-managed
    OAuth grant for its named MCP resource. That grant resolves exactly one
    server-owned actor, organization, installation, delegated role, plugin,
    and capability scope for that connection. Products may resolve different
    organizations and actors in the same client. Domain-skill routing chooses
    the matching named connection; authorization never falls through between
    products. The plugin package never reads, prompts for, substitutes, or
    persists BOS access or refresh tokens.
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
    Copilot, and the combined Gemini CLI/Antigravity Desktop client.
14. Route feedback mutations through the runtime product's canonical named MCP
    route. Keep organization, application, installation, and delegated-role
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
16. Distribute pre-publication Claude and Codex products through their native
    local or private Git marketplaces. Claude uses
    `.claude-plugin/marketplace.json`; Codex uses
    `.agents/plugins/marketplace.json`. Keep separate host manifests and share
    canonical skills through deterministic generation. Installation adds the
    marketplace and installs the product skills. Claude account or organization
    connector provisioning registers the runtime resource separately and presents
    the persistent Connect action under Customize → Connectors. A new task loads
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
    Claude version authority and omit duplicate marketplace-entry versions.
    OpenAI Git marketplace consumers refresh the tracked repository snapshot through
    the Codex marketplace upgrade control; public ChatGPT/Codex directory releases
    require a separately reviewed and published OpenAI submission. Git pull-request
    history grants neither OpenAI publication nor client refresh authority.
17. Treat a Claude, ChatGPT/Codex, OAuth-capable Copilot, Gemini CLI, or Antigravity Desktop product
    connection as ready only when the
    installed product points to its exact immutable MCP resource—through an
    account connector for Claude, directly for Copilot and Gemini, and through
    its required registered app for Codex—OAuth
    discovery succeeds, the host holds a valid resource-scoped grant, the
    server returns one canonical context, and the required scoped tool group is
    discoverable. A missing or expired grant triggers the host's Connect/Sign
    in flow. Installation and recovery never request a BOS key, manipulate the
    desktop process environment, or use an OS-specific launcher. Plugin source
    changes require marketplace update or reinstall, cache refresh as supported
    by the host, and a new task.
18. Keep repository builds and release checks credential-free and local. They
    regenerate clients, validate canonical-source parity, scan for credentials
    and customer data, and run deterministic tests without a live MCP query or
    noninteractive OAuth access token. Verify live product connectivity after
    installation through each supported host's managed OAuth flow. Disabled or
    unreleased products are excluded from generated marketplaces, installation
    instructions, and release checks.
19. Give every BOS-family runtime product on one OS user account a shared local
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
