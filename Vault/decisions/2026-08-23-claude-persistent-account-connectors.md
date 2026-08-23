# Claude persistent account connectors

## Status

Accepted on 2026-08-23. Reaffirms
`2026-08-22-claude-account-connector-separation.md` and supersedes the Claude
product-connection portion of
`2026-08-23-automatic-plugin-and-provider-authentication.md`.

## Evidence

Direct Claude Desktop inspection shows the generated Education Center plugin
connector as **Web / Plugin** with status **Connects in sessions** and no
**Connect** control. Account-level Web connectors on the same screen provide a
persistent **Connect** control. This reproduces the earlier host behavior and
disproves the assumption that a plugin-owned `.mcp.json` produces the required
account connection experience.

## Decision

- Claude marketplace plugins distribute BOS skills plus immutable account
  connector metadata. They contain no `.mcp.json` or `mcpServers` declaration.
- The runtime resource is provisioned as an account or organization Web
  connector. Private installations use Claude's custom connector flow; public
  distribution uses Anthropic's Connector Directory.
- Each user selects **Connect** under **Customize → Connectors** and completes
  host-managed BOS OAuth once per account grant.
- Generated metadata records `connection_scope: claude_account`, and
  `CONNECTORS.md` records the immutable package-owned resource URL.
- Package validation rejects **Connects in sessions** topology for every active
  Claude runtime product.

## Consequences

Plugin installation and account-connector provisioning are separate host
operations. The package continues to contain no token, API key, authorization
header, customer authority, or provider credential.
