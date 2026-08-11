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
5. Authenticate scoped product clients only with the API key provisioned in
   their client environment. Never launch a second BOS login or password flow.
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
   containing reusable defaults and typed source roles. Installers validate and
   write customer-specific values as a customer-owned settings overlay that
   package updates preserve. Skills resolve effective settings from the template
   plus that overlay; builds never copy customer mailboxes, provider selectors,
   or location values into managed skills or regenerated package files. A source
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
    stable human-readable slugs, never IDs or customer settings. The BOS API
    key configured once for the client authenticates every named connection;
    the service derives
    and validates actor, tenant, organization, installation, role, plugin, and
    capability authority. A client may load multiple runtime products while
    retaining exactly one BOS identity. Domain-skill routing chooses the
    matching named connection without selecting tenant scope. Codex remote
    servers bind `BOS_API_KEY` through
    `bearer_token_env_var` so the host can resolve it without exposing it.
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
16. Distribute Claude products through a repository-root native marketplace or
    Claude's native manual plugin-upload control. Keep remote release downloads
    out of conversational installation workflows. Runtime Claude plugins use
    the one client-global `BOS_API_KEY` already configured by the host and the
    exact package-generated named HTTPS MCP route. Individual plugins never
    declare independent key fields. Product application and skill-group names
    remain immutable package metadata.
17. Treat a Codex bearer registration as current only when `BOS_API_KEY` exists
    in the active host process, matches the installer process binding when one
    is supplied, and successfully initializes the product's exact named route
    with its required scoped tool group. On macOS, launch the desktop host with
    that one process-scoped credential fetched from approved managed storage.
    Never persist a bearer in package files or publish it into the global GUI
    launch environment.
18. Gate every complete build and customer release on a credentialed,
    read-only live query through each operational product's exact named MCP
    route using the same build-process `BOS_API_KEY`. For iCode director
    reporting, the gate must discover the complete
    report read-tool contract, prove one server-derived iCode context, and
    execute a bounded enrollment query for the customer-configured local week.
    A well-formed empty record array is a valid seasonal result. When camp data
    exists, report student and family-phone field presence as aggregate
    data-quality evidence without treating provider-record completeness as a
    transport failure. Emit only allowlisted status/error codes, validated
    correlation IDs, tool names, and aggregate field-presence counts.
    Artifact-only development builds may remain credential-free but provide no
    production-readiness evidence.

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
