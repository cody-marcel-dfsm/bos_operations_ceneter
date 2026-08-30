# BOS product licensing and user experience

Current BOS Operations Center release: `0.4.55`.

## Connection ownership

BOS owns one authenticated MCP connection per user-facing client context.
Licensing, product installation, and plugin enablement are server-evaluated
authorization dimensions behind that connection. They never create additional
BOS OAuth grants.

## User journey

1. Install BOS.
2. Select Connect once and complete BOS sign-in.
3. Install or enable Education Center, CRM, Marketing Director, or another
   subservice.
4. Use its workflows immediately when the server confirms the applicable
   license, installation, role, plugin, capability, and provider state.
5. Complete a provider-specific authorization only when the requested operation
   requires it.

## License evaluation

For every tool request, BOS evaluates the authenticated actor and canonical
organization, application, installation, subservice, product entitlement,
plugin, role, capability, provider, and tool records. Missing or ambiguous
authorization fails closed. License changes refresh context and tool discovery
through the existing BOS connection.

## Product presentation

The BOS plugin presents the sole BOS Connect control. Subservice plugins present
their brand, description, workflows, settings, and provider readiness. A
subservice never presents a BOS login or connector.
