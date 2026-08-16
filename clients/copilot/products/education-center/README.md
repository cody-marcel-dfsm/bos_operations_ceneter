# Education Center for GitHub Copilot

Copy `skills/` into the target repository's `.agents/skills/` directory.
Copy `.github/mcp.json` into the target repository for Copilot CLI, or
copy the server entry into `.vscode/mcp.json` for Copilot in VS Code.

Run `/mcp auth education-center` in Copilot CLI, or select `Auth`
above the server entry in VS Code, then complete BOS sign-in. The host
discovers BOS OAuth and stores and refreshes the resource-scoped grant.
GitHub Copilot cloud agent and code review cannot use this remote OAuth
connection until those hosts support OAuth-authenticated MCP servers.

This package is fixed to `/mcp/apps/leaddirector/education-center`.
The package does not select or provision a BOS application.
