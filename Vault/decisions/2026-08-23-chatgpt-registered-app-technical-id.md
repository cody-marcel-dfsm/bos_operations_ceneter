# ChatGPT registered app technical identifier

Date: 2026-08-23

## Decision

Codex and ChatGPT runtime plugins bind their required registered MCP connection
through the complete technical identifier copied from the ChatGPT connection
URL. That identifier has the form `plugin_asdk_app_*`.

Product manifests, generated `.app.json` files, installers, and package
validators preserve the complete identifier exactly. A suffix-only
`asdk_app_*` value is invalid and fails closed because ChatGPT cannot resolve it
to the registered connector.

The Education Center connection is
`plugin_asdk_app_6a7cb1cc330c81918aa63d96aeeaba91`, which owns the immutable
resource `https://dfsm.ai/mcp/apps/leaddirector/education-center` and its
host-managed OAuth 2.1 flow.

## Evidence

The `0.4.44` package used the suffix-only identifier and ChatGPT displayed
`Couldn't load connector` before OAuth began. The live BOS protected-resource
metadata, authorization-server metadata, refresh scope, and unauthenticated MCP
challenge were healthy. Current OpenAI plugin packaging documentation requires
the `.app.json` mapping to reference the full `plugin_asdk_app_*` technical ID.
