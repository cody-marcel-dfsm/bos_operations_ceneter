# Claude account connector separation

## Status

Superseded on 2026-08-23 by
`2026-08-23-automatic-plugin-and-provider-authentication.md`.

This decision failed the product installation requirement because installing
the plugin did not register its BOS connector. It required a separate owner or
user action to enter the package-owned URL manually.

## Evidence

Claude Desktop classifies a remote MCP declared by a marketplace plugin's
`.mcp.json` as **Web / Plugin** with status **Connects in sessions**. Restarting
the desktop client preserves that classification. Claude's account connector
surface separately provides Web connectors with persistent **Connect** controls
under **Customize → Connectors**.

Anthropic documents plugin MCP servers as connecting at session startup and
documents Claude account connectors as connections configured in Claude and
made available across Claude surfaces.

## Decision

Claude marketplace plugins distribute BOS skills and immutable account-connector
metadata. They contain no `.mcp.json`, no `mcpServers`, no authorization header,
and no credential field.

The runtime resource is provisioned separately as a Claude account or
organization Web connector. Private and development installations use Claude's
custom connector flow. Public customer distribution requires an Anthropic
Connector Directory entry for the same immutable resource.

Each user completes BOS OAuth from the connector's account-level **Connect**
control. Claude owns secure grant storage and refresh. Starting, restarting, or
replacing a conversation may load connector tools and never creates a new BOS
login requirement while the account grant remains valid.

## Consequences

- Installing or updating a Claude marketplace plugin cannot create an
  account-level connector by itself.
- Generated Claude runtime plugins record `connection_scope: claude_account`
  and the immutable resource URL in `.bos-product.json`.
- Generated Claude runtime plugins include `CONNECTORS.md` and remain free of
  runtime MCP declarations.
- `Connects in sessions` is a package validation failure for a BOS runtime
  product.
- Organization owners may provision the connector centrally. Public one-click
  discovery remains an external release dependency until Anthropic approves the
  Connector Directory listing.
