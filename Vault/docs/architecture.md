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
   role, and plugin scope before private execution.
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
   generated release content. Product manifests may declare an empty settings
   template; installers validate and write the completed settings as
   customer-owned configuration that package updates preserve.
10. Initialize customer settings with a derive-then-ask workflow: preserve
    confirmed values, derive only unambiguous non-secret client and canonical
    BOS metadata, and ask the user once for unresolved or conflicting values.
    Derived configuration never grants authority.
11. Connect clients directly to BOS over HTTPS Streamable HTTP. Use the native
    remote MCP configuration in Codex and Claude, and configure the equivalent
    remote connection in Copilot. A BOS product profile owns its endpoint and
    server-advertised tool set; clients never aggregate or invent BOS tools.
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
14. Route feedback mutations through the canonical installed-app-bound MCP URL
    `/mcp/apps/{installed_app_id}`. Store the installation ID as static client
    configuration for that native remote MCP connection and verify it against
    `bos_get_context`. Keep
    organization, application, and installation route scope out of feedback
    arguments, preserve the organization-scoped bearer credential, and fail
    closed without broad-endpoint fallback.

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
