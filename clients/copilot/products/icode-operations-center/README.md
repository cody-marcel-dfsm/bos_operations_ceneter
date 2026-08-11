# iCode Operations Center for GitHub Copilot

Copy `skills/` into the target repository's `.agents/skills/` directory.
Copy `.github/mcp.json` into the target repository, or paste its JSON into
Settings > Copilot > MCP servers for Copilot cloud agent and code review.

Create an Agents secret named `COPILOT_MCP_ICODE_OPERATIONS_BOS_API_KEY` containing the
organization-scoped BOS API key. GitHub exposes only `COPILOT_MCP_`-prefixed
secrets and variables to repository MCP configuration.

This package is fixed to `/mcp/apps/leaddirector/icode-operations`.
The package does not select or provision a BOS application.
