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

An active Codex runtime product also declares its stable registered
`asdk_app_*` identifier. The registered app owns the derived route; the Codex
package references that app and does not duplicate the URL in `.mcp.json`.

## Client responsibilities

A client package:

- contains its immutable application and skill-group names;
- connects only to its generated route, directly through a client-native
  remote MCP adapter or indirectly through a registered app that owns the
  route;
- uses the host-managed OAuth grant for Claude, ChatGPT/Codex desktop,
  OAuth-capable GitHub Copilot hosts, Gemini CLI, and Google Antigravity 2.0
  Desktop product connections;
- discovers the live tool manifest returned by that route;
- reconnects the same route after recoverable transport failure; and
- treats server-returned operational context as authorization evidence, never
  as input for constructing another endpoint.

Multiple runtime products may be active in one client. Each named connection
uses its own host-managed grant or approved client-specific adapter and may
resolve a different organization or principal. The triggered domain skill
chooses its product connection; it never chooses a tenant, organization, actor,
role, token, or key value. The server maps each authenticated principal to
exactly one authorized installation, organization, user, and delegated role
for that route. Authority never falls through to another product connection.

A client package never asks for, stores, derives, or substitutes an
`installed_app_id` into its MCP URL. It never selects or provisions an
application during marketplace installation.

## Server responsibilities

The BOS service:

- validates the resource-scoped OAuth access token or the approved
  client-specific release authorization;
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
- one-segment `/mcp/apps/{value}` routes;
- profile routes outside the named application/group hierarchy; and
- a Codex runtime plugin that declares the route through `.mcp.json` or
  `mcpServers` instead of its registered app binding.

Canonical sources, manifests, generators, adapters, installers, skills, tests,
and release artifacts must migrate together. Validation rejects obsolete forms
with a correction that identifies the expected named two-segment route.

## Required validation

For every runtime product, automated evidence must establish:

1. Manifest route slugs satisfy the schema and approved inventory.
2. Claude, ChatGPT/Codex, the single Gemini extension umbrella, and Copilot
   adapters resolve the same immutable URL; Codex does so through its
   registered app. The Gemini directory supports Gemini CLI through
   `gemini-extension.json` and Antigravity Desktop through `plugin.json` plus
   `mcp_config.json`, while sharing one skill tree and product identity.
3. No generated package contains an installation-ID route setting or unresolved
   route substitution.
4. Unknown or unauthorized application/group combinations fail closed.
5. The server derives operational installation scope from authenticated state.
6. Connection recovery returns to the same immutable named endpoint.
7. Credential and customer-data scans pass for public artifacts.
8. Each active Claude, ChatGPT/Codex, OAuth-capable Copilot, or Gemini runtime product obtains one
   host-managed resource-scoped grant without package credential fields or
   cross-product fallback.
