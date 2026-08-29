# CRM platform work matrix

| Area | Required implementation | Owner |
|---|---|---|
| Connection | Use `https://dfsm.ai/mcp/apps/bos/platform` | BOS |
| Authentication | Use the existing BOS OAuth grant | BOS |
| Discovery | Server-filter CRM tools for the authenticated context | BOS service |
| Workflows | Package CRM skills without an MCP or app binding | CRM subservice |
| Authorization | Revalidate installation, role, plugin, capability, provider, and tool scope per call | BOS service |
| Provider recovery | Resume CRM operations after scoped provider authorization | BOS service |
| Packaging | Record `connection_owner: bos` and `authentication: bos_managed` | BOS Operations Center |
| Validation | Prove CRM works after one BOS login and exposes no separate connection | BOS Operations Center |
