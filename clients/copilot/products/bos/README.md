# BOS Platform for GitHub Copilot

BOS is a platform for deterministic automated workflows across an agentic mesh of federated services. It is the required foundation for dependent products and owns the authenticated BOS platform MCP connection. Live identity-context discovery supports server-authorized organization, application, installation, and role selection per operation; legacy scoped grants retain their exact boundaries. BOS coordinates authorized platform operations with server-enforced scope, evidence, and approvals.

Copy `skills/` into the target repository's `.agents/skills/` directory.
Copy `.github/mcp.json` into the target repository for Copilot CLI, or
copy the server entry into `.vscode/mcp.json` for Copilot in VS Code.

Run `/mcp auth BOS-Platform` in Copilot CLI, or select `Auth`
above the server entry in VS Code, then complete BOS sign-in. The host
discovers BOS OAuth and stores and refreshes the resource-scoped grant.
GitHub Copilot cloud agent and code review cannot use this remote OAuth
connection until those hosts support OAuth-authenticated MCP servers.

This package owns its scoped MCP connection at `https://dfsm.ai/mcp/apps/bos/platform`.

Verify this product in the target repository with `npm run install:verify:copilot-runtime -- --target <repository> --product bos`.
Copilot reads repository configuration directly and has no BOS package-cache layer.
