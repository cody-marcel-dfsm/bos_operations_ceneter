# Named MCP application/group routing

Status: canonical

## Purpose

Define the public client-routing contract for BOS remote MCP products. This
contract separates a package's human-readable tool-group route from the
server-owned installation and authorization context used during execution.

## Route contract

Every runtime client product connects through exactly one HTTPS Streamable HTTP
endpoint with this path form:

```text
/mcp/apps/{application-name}/{skill-group-name}
```

Both route segments are stable, package-owned, human-readable slugs. They use
lowercase ASCII letters, numbers, and hyphens. They are neither database IDs
nor customer configuration.

Current product mappings are:

| Product | Application name | Skill-group name | Route |
| --- | --- | --- | --- |
| Education Center | `leaddirector` | `education-center` | `/mcp/apps/leaddirector/education-center` |
| Video Ads | `leaddirector` | `video-ads` | `/mcp/apps/leaddirector/video-ads` |
| BOS | — | — | Skills-only; no MCP route |

Future applications and groups enter this table only after their owning
application exists and approves the route.

## Product declaration

Runtime product manifests declare:

```json
{
  "application_name": "leaddirector",
  "mcp_group_name": "education-center"
}
```

The build derives the complete route from these values. Route fields cannot be
overridden by customer settings, installer prompts, environment variables, or
model instructions. Every generated harness adapter for one product uses the
same derived route.

## Client responsibilities

A client package:

- contains its immutable application and skill-group names;
- supplies the product's declared organization-scoped bearer using the
  harness's supported secret mechanism;
- connects only to its generated route;
- discovers the live tool manifest returned by that route;
- reconnects the same route after recoverable transport failure; and
- treats server-returned operational context as authorization evidence, never
  as input for constructing another endpoint.

Multiple runtime products may be active in one client. Each named connection
uses its own package-declared credential binding and may resolve a different
organization or principal. The triggered domain skill chooses its product
connection; it never chooses a tenant, organization, actor, role, or key value.
The server maps each bearer principal to exactly one authorized installation,
organization, user, and delegated role for that route. A credential never
falls through to another product connection.

A client package never asks for, stores, derives, or substitutes an
`installed_app_id` into its MCP URL. It never selects or provisions an
application during marketplace installation.

## Server responsibilities

The BOS service:

- authenticates the API key;
- resolves tenant, organization, actor, application installation, role, plugin,
  and capability scope from canonical server-owned state;
- verifies that the authenticated principal may use the named application and
  tool group;
- exposes only the tool manifest owned by that named group;
- preserves provider authorization, PO/GO mutation, audit, idempotency, and
  fail-closed controls; and
- rejects unknown, malformed, unauthorized, ambiguous, broad, or one-segment
  application routes.

An installation ID may remain in server-side records, authenticated context,
audit data, idempotency keys, and persistence schemas. Its presence there does
not make it a client route input or a source of authority supplied by a client.

## Migration contract

The following are obsolete client-routing forms:

- `/mcp/apps/{installed_app_id}`;
- `BOS_INSTALLED_APP_ID` in client configuration;
- customer- or installer-supplied application/group route values;
- unnamed endpoint fallback;
- one-segment `/mcp/apps/{value}` routes; and
- profile routes outside the named application/group hierarchy.

Canonical sources, manifests, generators, adapters, installers, skills, tests,
and release artifacts must migrate together. Validation rejects obsolete forms
with a correction that identifies the expected named two-segment route.

## Required validation

For every runtime product, automated evidence must establish:

1. Manifest route slugs satisfy the schema and approved inventory.
2. Claude, Codex, ChatGPT, Gemini CLI, and Copilot adapters use the same URL.
3. No generated package contains an installation-ID route setting or unresolved
   route substitution.
4. Unknown or unauthorized application/group combinations fail closed.
5. The server derives operational installation scope from authenticated state.
6. Connection recovery returns to the same immutable named endpoint.
7. Credential and customer-data scans pass for public artifacts.
8. Multiple runtime products reuse the one client-configured key without
   creating product-specific credential bindings.
