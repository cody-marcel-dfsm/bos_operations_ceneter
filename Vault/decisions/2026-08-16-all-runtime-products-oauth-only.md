# OAuth-only BOS runtime product authentication

## Decision

Every BOS runtime product connection authenticates to its immutable named MCP
resource through OAuth 2.1. Product manifests, generated packages, installers,
customer settings, and host launch environments contain no BOS product key,
credential environment binding, or static authorization header.

Claude account or organization Web connectors, Gemini, and OAuth-capable GitHub
Copilot hosts declare the immutable resource directly and use host OAuth
discovery. ChatGPT/Codex binds
the resource through its required registered app. Each connection holds one resource-scoped
grant that the BOS service maps to exactly one server-owned actor,
organization, installation, delegated role, plugin, and capability scope.

GitHub Copilot cloud agent and code review do not currently support remote MCP
OAuth. BOS runtime products remain unavailable on those hosts until GitHub adds
that capability. Copilot IDE and CLI remain supported through their native
interactive OAuth flows.

Release-only live checks may receive a short-lived, resource-scoped OAuth
access token through the CI secret store. Release tooling names and validates
that value as an OAuth access token and never accepts a BOS product key. This
noninteractive evidence path grants no customer installation authority and
does not change the plugin authentication contract.

Underlying provider credentials remain separate. OAuth providers use
BOS-hosted authorization transactions; API-key providers use a short-lived
BOS-hosted credential-entry page. Provider credentials never enter client
packages, environment bindings, tool arguments, model chat, or logs.

## Consequences

- `credential_env_var` and `bearer_env` are invalid product/package fields.
- Generated Copilot MCP configuration contains a URL and tool policy with no
  credential header.
- Generated Claude runtime plugins contain account-connector metadata and no
  `.mcp.json` or `mcpServers`; Claude owns OAuth and grant persistence through
  the account-level Web connector.
- Codex installation accepts only the registered-app OAuth package form; the
  retired environment-injection launcher and direct bearer registration path
  are removed.
- Missing, invalid, expired, revoked, or wrong-resource grants fail closed and
  invoke the host's Connect, Sign in, Auth, or `/mcp auth` recovery flow.
