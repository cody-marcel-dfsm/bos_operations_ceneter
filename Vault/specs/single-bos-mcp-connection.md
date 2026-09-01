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
  declares exactly one registered BOS app with the proven
  `plugin_asdk_app_6a7cb1cc330c81918aa63d96aeeaba91` identity and
  `required: true`, and contains no direct `.mcp.json`.
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
- A missing Codex authentication action after the plugin loads identifies a
  registered-app display defect. Repair and reload the root `.app.json`
  declaration before evaluating server behavior. A valid server OAuth response
  never satisfies this independent display contract.
- A Codex MCP-startup `reauthenticationRequired` response identifies a missing
  or unusable grant for the package-owned root resource. The resource's
  unauthenticated discovery response returns HTTP 401 with the canonical
  protected-resource `WWW-Authenticate` challenge so Codex classifies the
  runtime connection as `notLoggedIn` and activates OAuth through the
  host-managed connection.
  The user selects that action and completes consent; the client then refreshes
  the same MCP connection and callable manifest, validates context, and resumes.
  A missing native action is an authentication-activation defect. Generic app
  permissions, CLI login, and agent-launched browser authentication never
  substitute for the native MCP OAuth lifecycle.
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

The live tool manifest contains only capabilities available to the current
authenticated context. Plugin installation, enablement, role changes,
capability changes, and provider readiness trigger tool and context refresh;
they never create another BOS authentication boundary.

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
11. ChatGPT/Codex recovery removes only state owned by the BOS marketplace or
    immutable BOS resource URL, backs up any edited host state, reinstalls both active
    products, restarts the host, and reruns the same readiness verification.
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
16. Codex installation loads the required registered-app declaration that owns
    the native authentication display. Reauthentication
    requires an unauthenticated resource GET to return HTTP 401, the exact protected-resource
    `WWW-Authenticate` challenge, and `authentication_required`. An authenticated
    resource GET remains HTTP 405 with `Allow: POST`. The client never invokes
    CLI login or launches authentication for the user.
17. Every server release that changes MCP authentication passes the complete
    client-owned Operations Center acceptance suite before release acceptance.

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
npm run contract:oauth-live -- \
  --authorize-url "$BOS_OAUTH_AUTHORIZE_URL" \
  --format json
```

The signed-out discovery probe requires HTTP 401, the exact canonical
`WWW-Authenticate` challenge, `authentication_required`, and no violations.
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
