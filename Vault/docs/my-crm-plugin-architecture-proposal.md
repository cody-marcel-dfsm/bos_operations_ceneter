# CRM plugin architecture

CRM is a BOS subservice plugin. It contributes CRM workflow skills and server
capabilities through the single BOS connection at
`https://dfsm.ai/mcp/apps/bos/platform`.

The CRM package contains no registered app, connector, MCP server declaration,
OAuth grant, resource route, token field, or authority selector. The server
discovers the authenticated actor's authorized CRM installations and filters
the live tool catalog from canonical organization, application, installation,
plugin, role, capability, provider, and tool state.

CRM mutations retain Router-to-PO-to-GO boundaries, tenant isolation,
idempotency, audit, and provider credential scope. Provider authorization may
require direct user consent while preserving the existing BOS connection.
