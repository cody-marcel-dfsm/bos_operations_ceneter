# Desktop private marketplace and OAuth installation

## Status

Accepted on 2026-08-11.

## Decision

BOS distributes pre-publication Claude Cowork/Desktop and ChatGPT/Codex
Desktop plugins through native local or private Git marketplaces. Claude uses
`.claude-plugin/marketplace.json`; Codex uses
`.agents/plugins/marketplace.json`. The same repository may publish both
catalogs, with host-specific plugin manifests generated from shared canonical
skills.

Claude runtime plugins contain the immutable remote HTTPS Streamable HTTP MCP
URL. Codex runtime plugins contain a required `.app.json` entry referencing a
registered `asdk_app_*` connection that owns that immutable URL. Neither has a
customer credential binding. The desktop host performs OAuth 2.1 MCP
discovery, presents Connect/Sign in, stores and refreshes the grant, and sends
the resource-scoped access token. BOS derives tenant, organization,
application, installation, actor role, plugin execution role, and capabilities
from the validated grant and canonical server records.

Customer installation requires three actions: add the BOS marketplace, install
the product, and connect to BOS. A browser window may appear for authorization
and consent while the desktop product remains the installation and operating
surface.

## Consequences

- Claude runtime manifests have no `userConfig` API-key field.
- Codex runtime manifests use `apps: "./.app.json"`, contain no `.mcp.json` or
  `mcpServers`, and have no `bearer_token_env_var`.
- Claude `.mcp.json` files have no literal authorization header.
- Codex Environments and setup scripts are not credential stores.
- OS-specific launchers are outside the customer installation path.
- Git marketplaces are the customer distribution path. Repository release
  workflows create no customer ZIP.
- Each active Codex runtime product records its stable registered app ID in the
  canonical product manifest and fails package validation when that binding is absent.
- Education Center uses `ON_INSTALL` because authenticated live data is core to
  the product.
- Copilot and Gemini retain their current adapters until their own migration is
  explicitly approved.

## Development and update loop

Developers add a local checkout as a marketplace, validate both catalogs,
install the plugin through the desktop host, connect, and test in a new task.
After source changes they rebuild generated packages, update or reinstall the
marketplace package, clear or advance the host cache through supported product
controls, and test in another new task. Public marketplace publication promotes
the same package after private validation.

## Rollout dependency

The client packages may ship only when the BOS server exposes the OAuth and MCP
protected-resource discovery contract required by Claude and OpenAI. Until the
server is ready, installation may complete while Connect remains unavailable;
the client must report `authentication_required` and must never translate that
state into unavailable business data.
