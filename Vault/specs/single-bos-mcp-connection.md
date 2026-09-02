# Single BOS MCP connection

Status: canonical
Owner: BOS platform
Date: 2026-09-01

## Objective

Give each user-facing client context one host-managed BOS authentication and
one immutable BOS MCP connection. BOS evaluates every subservice request on the
server from canonical authenticated state.

## Client connection contract

- The root BOS plugin owns the client-visible BOS connection and OAuth grant.
- A user completes BOS authentication once. Installing or invoking Education
  Center, CRM, Marketing Director, or another BOS-maintained subservice never
  asks the user to authenticate to BOS again.
- Subservice plugins contribute skills, product metadata, and server
  capabilities. They contain no independent BOS app binding,
  connector, MCP server declaration, OAuth grant, token field, or fallback
  connection.
- ChatGPT/Codex loads the root BOS plugin's package-owned `.app.json`. It
  declares exactly one registered BOS app using the permanent identity in
  `products/bos/product.json` with `required: true`, and contains no direct
  `.mcp.json`. That product file is the sole authored identity and MCP-resource
  source. Generated package and contract files derive from it. Established
  metadata changes update that same ID in place; a missing record is an
  integrity failure and never authorizes a replacement. There is no identity
  migration.
  Claude exposes one persistent
  BOS Web connector. Copilot, Gemini, and Antigravity expose one BOS MCP server
  connection through their native adapter.
- Platform BOS operations always use the BOS connection. A subservice plugin is
  never the transport or authentication owner for platform behavior.
- A token-endpoint `invalid_client` response identifies a stale host-owned
  public-client registration. The client keeps the immutable BOS resource,
  replaces that registration through current OAuth metadata, restarts
  authorization once, refreshes tools and context, and resumes the preserved
  request. Registration recovery never creates a subservice connection.
- The GPT plugin detail page always renders exactly one root BOS authentication
  action after the plugin declaration loads. Connector-metadata resolution,
  connection inventory, grant validity, and callable-tool discovery never gate
  visibility. The action reads **Connect** when no usable connection exists and
  **Reconnect** when a connection exists with a valid, expired, or invalid
  grant. A valid server OAuth response never satisfies this independent display
  contract.
- A missing Codex authentication action after the root app declaration loads
  identifies a GPT client display defect. Package correction is applicable only
  when the root declaration itself is absent or malformed. Resolver, connection,
  and server OAuth failures remain separate states and never explain a hidden
  action.
- A Codex request-time or MCP-startup `reauthenticationRequired` response
  identifies a missing or unusable grant for the selected BOS tool. Before
  consent, the host receives the requested tool descriptor with
  `securitySchemes: [{ type: "oauth2", scopes: [...] }]`. This metadata permits
  tool selection while customer data and business execution remain protected.
  The selected tool returns `isError: true` and
  `_meta["mcp/www_authenticate"]` with `resource_metadata`, `error`, and
  `error_description`; that tool-bound challenge causes the native inline
  **Sign in** action to render. After consent, the client refreshes the server
  authority-scoped callable state, validates context with `bos_get_context`,
  and resumes the original request. A missing descriptor or challenge is a
  tool-auth-contract defect; a received challenge without a native action is an
  authentication-activation defect. Generic app permissions, CLI login,
  agent-launched browser authentication, anonymous bootstrap business tools,
  and plugin-install recommendations never substitute for this lifecycle.
- A token-endpoint `invalid_grant`, including `Refresh token replay detected`,
  identifies an unusable host-held grant. The client stops refresh retries,
  preserves the active request, obtains fresh consent through the same native
  root BOS authentication action, refreshes tools and context, and resumes.
  This state does not indicate missing skills or authorize another connection.

## Repository handoff boundary

BOS Operations Center owns the portable client contract, skills, generated
packages, and client-owned acceptance probes. It never edits, commits, pushes,
merges, or deploys the owning BOS server repository or infrastructure. A server
requirement leaves this repository as exactly one continuous copyable Markdown
prompt containing the protocol contract, deployment acceptance criteria, and
the complete client-owned acceptance suite. The server-side repository owns
implementation, review, merge, and deployment.

## Server evaluation contract

Every request over the BOS connection is evaluated independently. The server
derives and validates the authenticated actor, tenant, organization,
application, installation, subservice, plugin, interactive role, capability,
provider readiness, and requested tool from the OAuth grant, opaque context,
tool identity, and canonical records.

Before authentication, the BOS tool manifest exposes only capability descriptors,
input schemas, and per-tool OAuth `securitySchemes` required for selection. It
contains no customer data, authority context, or permission to execute business
logic. After authentication, the refreshed live tool state contains only
capabilities available to the current authenticated context. Plugin installation,
enablement, role changes, capability changes, and provider readiness trigger tool
and context refresh; they never create another BOS authentication boundary.

Subservice skills select a workflow or semantic operation. They never select a
connection, token, organization, installation, or authority scope. Missing or
ambiguous server state fails closed.

## Present-product completeness

Implement and validate every product from its current contract and complete
current user journey. A future product, future package split, anticipated
growth, or expected composition never satisfies a missing present capability.
When a current product depends on unavailable runtime behavior, record and
implement that behavior under its current owner before release.

## Provider authorization

Provider authorization remains scoped to the server-resolved organization,
installation, and plugin. A provider may require its own direct consent or
secure credential-entry flow. That provider flow does not create another BOS
login or BOS MCP connection.

## Validation requirements

1. The root BOS product exposes the BOS MCP resource.
2. Every supported client binds to that one resource.
3. Subservice packages contain no BOS app, connector, server, or grant binding.
4. The BOS resource exposes tools through server-side authorization evaluation.
5. Tenant, application, installation, role, plugin, provider, audit,
   idempotency, and PO/GO boundaries remain enforced.
6. Package manifests, generators, tests, installation guidance, and marketplace
   submission assets express the same connection topology.
7. A clean user connects to BOS once and uses every authorized installed
   subservice without another BOS authentication prompt.
8. A stale host-owned public client receives `invalid_client`, replaces its
   registration for the same BOS resource, and resumes through the single BOS
   connection.
9. ChatGPT/Codex packages require exactly one package-owned root BOS app
   binding with the proven identity and `required: true`, contain no direct
   `.mcp.json`, and reject optional, replacement, or additional bindings.
10. ChatGPT/Codex readiness jointly verifies the native plugin registry,
    marketplace registration, one current managed-cache version per active
    product, the required registered-app declaration, and every product-declared
    runtime verification tool in the callable catalog. A package cache alone is
    not installation evidence.
11. ChatGPT/Codex cleanup removes only product-declared retired accidental
    account records and local state owned by the BOS marketplace or immutable
    BOS resource URL, preserves the permanent established account record, and
    backs up any edited host state. It reinstalls nothing. The user installs the
    intended package explicitly after cleanup succeeds.
12. Claude readiness follows the active user-scoped plugin registry entry and
    its `installPath`, verifies the current package version and BOS metadata,
    and reports inactive seven-day cache retention separately. Claude recovery
    removes only the BOS marketplace cache and registrations before reinstalling
    both products.
13. Gemini CLI readiness verifies its native extension install metadata and
    every installed package file against the current generated extension.
    Recovery removes only validated BOS extension copies, invokes native
    uninstall and install operations, restarts the host, and reruns readiness.
14. Antigravity readiness requires exact symlinks from every active BOS product
    path to the current generated Gemini extension and validates release
    metadata after installation.
15. Copilot readiness compares the selected product's repository MCP and skill
    files directly against generated output. The Copilot repository adapter has
    no BOS package-cache state.
16. Codex installation loads the required registered-app declaration and its
    OAuth-declared BOS tool descriptors. Request-time authentication selects the
    tool required by the prompt; its unauthenticated result returns
    `_meta["mcp/www_authenticate"]`, which renders the inline action. Descriptor
    visibility and selection precede consent, while business execution and
    customer data remain denied. After consent, the host refreshes the server
    authority-scoped callable state, validates context with `bos_get_context`,
    and resumes the original request.
    Protected-resource discovery returns the exact canonical
    `WWW-Authenticate` challenge and `authentication_required`. An authenticated
    resource GET remains HTTP 405 with `Allow: POST`. The client never invokes
    CLI login or launches authentication for the user.
17. Every server release that changes MCP authentication passes the complete
    client-owned Operations Center acceptance suite before release acceptance.
18. Every Codex package release that changes the request-time authentication
    contract includes a version-matched signed-out conversation screenshot at
    `Vault/evidence/codex-login/<version>-request-time-sign-in-button.png`. It
    must show a BOS-dependent customer prompt and the simple native inline
    **Sign in**, **Connect**, or **Authenticate** button in that same chat.
    Startup status, protocol output, manual settings instructions, and a plugin
    page control never substitute for this visual request-time artifact.
19. Every Codex package release that changes the Login display binding includes
    a version-matched GPT client screenshot at
    `Vault/evidence/codex-login/<version>-connect-button.png`. A matching
    `<version>-connect-button.review.json` binds the screenshot SHA-256 to an
    Oracle-approved visual finding of **Connect** or **Reconnect** on the GPT
    plugin-detail surface. The screenshot
    must visibly show the native BOS **Connect** or **Reconnect** control on the BOS
    plugin page. Package shape, a Platform MCP server row, OAuth discovery, and
    callable-tool evidence never substitute for this visual acceptance artifact.
20. GPT renders the root BOS **Connect** or **Reconnect** action for every state
    in `contracts/codex-login-surface.v1.json`. Connector metadata, connection
    inventory, OAuth grant validity, and callable-tool presence or request
    failures may select the label, recovery state, or subsequent flow; none may
    suppress the action. Optional display metadata resolves from connector
    metadata, then directory data, then the plugin declaration. A raw technical
    ID remains renderable with the native action.

## Portable contract verification

`contracts/single-bos-mcp-connection.v1.json` is the machine-readable client
contract. The BOS server repository and release CI invoke
`npm run contract:check` from this repository and consume the JSON result and
process exit code. A passing result proves that BOS owns the only client
connection artifacts, every subservice remains transport-free, canonical and
generated skills contain no subservice connection identifiers, and every
client points to the immutable BOS root resource.

The complete client-owned server acceptance suite is:

```bash
npm run contract:check
npm run contract:oauth-discovery-live -- \
  --resource-url "$BOS_MCP_RESOURCE_URL" \
  --format json
npm run contract:oauth-tool-auth-live -- \
  --resource-url "$BOS_MCP_RESOURCE_URL" \
  --tool bos_get_context \
  --format json
npm run contract:oauth-live -- \
  --authorize-url "$BOS_OAUTH_AUTHORIZE_URL" \
  --format json
```

The signed-out discovery probe requires HTTP 401 with the exact canonical
`WWW-Authenticate` challenge and `authentication_required`. The tool-auth probe
then requires the pre-consent `bos_get_context` descriptor and OAuth scopes,
followed by its signed-out `mcp/www_authenticate` result with no business data.
Registered-app and connector diagnostics separately prove that the host can
resolve the installed app. Any violation fails the applicable probe.
The authorization probe requires a valid provider redirect for the same
immutable resource with explicit Google account selection.

Marketplace and host install smoke tests pass the captured OAuth authorization
URL to the same verifier:

```bash
node scripts/verify-single-bos-contract.mjs \
  --format json \
  --oauth-authorize-url "<captured-authorize-url>"
```

The verifier accepts only an OAuth `resource` equal to the immutable BOS root
resource. This makes a marketplace record, cached client package, or host
adapter that attempts to create a subservice connection fail the portable
contract before release acceptance.
