# Claude account connector

This plugin uses the account-level Web connector named `education-center`.
It must appear under **Customize → Connectors** with its own **Connect** control.
The plugin intentionally contains no `.mcp.json` or `mcpServers` declaration;
plugin-owned MCP declarations are session-scoped in Claude.

For a private or development installation, an account owner adds a custom
connector with the package-owned resource URL `https://dfsm.ai/mcp/apps/leaddirector/education-center`, then
each authorized user completes BOS OAuth from **Customize → Connectors**.
For customer distribution, publish the same resource in Anthropic's Connector
Directory or provision it as an organization connector.

The Claude account stores and refreshes the resource-scoped grant. The plugin
never requests, stores, or transports a BOS key or OAuth token.
