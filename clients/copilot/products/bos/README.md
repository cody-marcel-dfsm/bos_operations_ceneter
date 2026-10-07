# BOS Platform for GitHub Copilot

BOS is a service gateway: give AI agents controlled execution of complex business workflows through permissioned state machines, with your roles, rules, and approval gates. Your service infrastructure, authoritative business state and data stores, and private implementation IP stay outside the agent host. Authorized inputs and results, public skills, and permitted scoped caches can reach the agent. BOS Operations Center helps your AI workspace understand the objective, discover supported services, and present evidence; BOS retains execution authority, state, transitions, and recovery. When the required authoring and runtime contracts are available, the client can author an ad hoc dynamic workflow. BOS is the required foundation for dependent products and owns the authenticated BOS platform MCP connection. MCP discovers authorized contracts; deterministic HTTPS APIs execute the sanctioned work, with server-authorized organization, application, installation, and role selection per operation and server-enforced scope, evidence, and approvals. Availability depends on authorized discovery, configuration, and provider readiness. Access is invite-only: request an invite at https://dfsm.ai/apps/bos/#request-invite.

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
