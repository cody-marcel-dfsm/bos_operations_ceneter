# BOS Operations Center architecture

## Purpose

BOS Operations Center is the canonical source, composition, validation, and
release system for portable BOS skills and native remote MCP client adapters.

## Ownership boundaries

- `source/platform/` owns tenant-neutral BOS operating and architecture skills.
- `source/capabilities/` owns reusable business capabilities.
- `source/verticals/` owns industry and franchise specialization.
- `source/runtime/` owns credential-free remote MCP connection templates.
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
5. Authenticate scoped product clients only with an API key supplied through
   the client's native sensitive-configuration surface. Claude runtime plugins
   declare a required sensitive install-time field that Claude stores in its
   secure credential store; other clients use their approved host credential
   binding. Never launch a second BOS login or password flow.
   Recover missing underlying provider grants through the BOS service's
   server-returned OAuth or secure provider-credential flow in the active agent
   interface; keep secrets out of model chat, package files, and logs.
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
10. Initialize customer settings with a derive-then-ask workflow: preserve
    confirmed values, derive only unambiguous non-secret client and canonical
    BOS metadata, and ask the user once for unresolved or conflicting values.
    Derived configuration never grants authority.
11. Connect clients directly to BOS over HTTPS Streamable HTTP. Use the native
    remote MCP configuration in Codex and Claude, and configure the equivalent
    remote connection in Copilot. Every runtime product declares one immutable
    package-owned route using the exact static form
    `/mcp/apps/{application-name}/{skill-group-name}`. Both path segments are
    stable human-readable slugs, never IDs or customer settings. Each active
    runtime product declares exactly one product-owned credential binding. That
    bearer resolves exactly one server-owned principal,
    organization, installation, delegated role, plugin, and capability scope
    for that named connection. Products may resolve different organizations
    and principals in the same client process. Domain-skill routing chooses the
    matching named connection and its declared credential; credentials never
    fall through between products. Claude's native sensitive plugin
    configuration prompts for and stores the value; the local package wrapper
    never reads it or places it in a subprocess argument, environment variable,
    file, or model chat. Claude substitutes that option directly into the
    authorization header. Codex remote servers bind the declared
    product variable through `bearer_token_env_var` so the host can resolve it
    without exposing it.
12. Treat deployment artifacts as build outputs. The complete cross-platform
    build generates client packages, deterministic product archives, the
    release manifest, and versioned and stable OS-neutral customer ZIPs.
    Release workflows publish only artifacts produced and validated by that
    build.
13. Apply tenant-specific skill changes through customer-owned typed extensions.
    Extension terminology, defaults, policies, and exceptions may specialize
    declared customer-configurable behavior. System instructions, package
    invariants, authentication, authorization, canonical scope, credentials,
    MCP endpoints, and tool grants remain sealed. Every product ships the same
    extension manager and versioned product metadata for Codex, Claude,
    Copilot, and Gemini CLI.
14. Route feedback mutations through the runtime product's canonical named MCP
    route. Keep organization, application, installation, and delegated-role
    scope out of feedback arguments. Derive operational scope from the
    authenticated server context and fail closed on missing or ambiguous
    authority without broad-endpoint fallback.
15. Make the agent responsible for the MCP client lifecycle during an active
    request. When a transport stream or MCP session closes, reconnect the same
    configured endpoint, rediscover its live tools, revalidate canonical
    context, and resume the interrupted request with bounded retry. Reconcile
    uncertain mutations by operation or idempotency identity before replay.
    Require user action only for secure provider authorization or credential
    entry surfaces that inherently need direct user interaction.
16. Distribute pre-publication Claude products from the local source or
    customer package with one installer entry point. The installer validates
    and registers the package's local Claude catalog, then installs and enables
    the selected plugin through Claude's native plugin CLI. Runtime Claude
    plugins declare one required sensitive API-key option; Claude asks for it
    through its native masked configuration prompt, securely stores the value,
    and substitutes it into the exact package-generated named HTTPS MCP route.
    The package wrapper never handles the credential.
    Product application and skill-group names remain immutable package
    metadata.
17. Treat a Codex bearer registration as current only when the selected
    product's declared credential exists in the active host process, matches
    the installer process binding when one is supplied, and successfully
    initializes that product's exact named route with its required scoped tool
    group. On macOS, launch the desktop host with each installed product's
    process-scoped credential fetched from approved managed storage.
    Require a directly attached interactive terminal and explicit typed user
    confirmation before replacing a running desktop host. Never schedule,
    detach, retry-loop, or force-terminate the desktop host from installation,
    verification, reconciliation, or agent workflows.
    Never persist a bearer in package files or publish it into the global GUI
    launch environment.
    Installers register and inspect only the product's declared credential
    binding. During a product rename, preserve the bearer through approved
    managed storage and relaunch the host with the declared binding. Remove
    retired binding identifiers from package source and client configuration.
18. Gate every complete build and customer release on a credentialed,
    read-only live query through each active operational product's exact named
    MCP route using that product's declared build-process credential. Disabled
    or unreleased products are excluded from generated marketplaces, customer
    archives, installation instructions, and release gates. A missing provider
    credential or disabled provider plugin blocks only its owning product or
    operation and never another organization's connection, tools, build, or
    release. For Education Center director
    reporting, the gate must discover the complete
    report read-tool contract, prove one server-derived Education Center context, and
    execute a bounded enrollment query for the customer-configured local week.
    A well-formed empty record array is a valid seasonal result. When camp data
    exists, report student and family-phone field presence as aggregate
    data-quality evidence without treating provider-record completeness as a
    transport failure. Emit only allowlisted status/error codes, validated
    correlation IDs, tool names, and aggregate field-presence counts.
    Artifact-only development builds may remain credential-free but provide no
    production-readiness evidence.
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
