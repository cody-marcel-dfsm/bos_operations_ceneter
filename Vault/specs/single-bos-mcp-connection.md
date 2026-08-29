# Single BOS MCP connection

Status: canonical
Owner: BOS platform
Date: 2026-08-28

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
  capabilities. They contain no independent BOS registered-app binding,
  connector, MCP server declaration, OAuth grant, token field, or fallback
  connection.
- ChatGPT/Codex binds the root BOS registered app. Claude exposes one persistent
  BOS Web connector. Copilot, Gemini, and Antigravity expose one BOS MCP server
  connection through their native adapter.
- Platform BOS operations always use the BOS connection. A subservice plugin is
  never the transport or authentication owner for platform behavior.
- A token-endpoint `invalid_client` response identifies a stale host-owned
  public-client registration. The client keeps the immutable BOS resource,
  replaces that registration through current OAuth metadata, restarts
  authorization once, refreshes tools and context, and resumes the preserved
  request. Registration recovery never creates a subservice connection.

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

## Portable contract verification

`contracts/single-bos-mcp-connection.v1.json` is the machine-readable client
contract. The BOS server repository and release CI invoke
`npm run contract:check` from this repository and consume the JSON result and
process exit code. A passing result proves that BOS owns the only client
connection artifacts, every subservice remains transport-free, canonical and
generated skills contain no subservice connection identifiers, and every
client points to the immutable BOS root resource.
