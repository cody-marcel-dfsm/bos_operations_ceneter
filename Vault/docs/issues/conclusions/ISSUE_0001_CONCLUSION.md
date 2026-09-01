# Issue #0001 conclusion: Codex BOS login and callable-tool exposure

- Status: FIXED IN 0.4.71; host verification pending
- Resolution version: 0.4.71
- Date: 2026-09-01
- Category: Codex package binding and authentication readiness
- Related incident: `Vault/docs/codex-registered-app-incident.md`

## User-visible symptom and impact

The BOS plugin and its skills appeared installed, while the plugin page exposed
no login control and active tasks received no BOS callable tools. Users had no
native way to authorize the connection and the diagnostic response incorrectly
described the callable manifest as generally unavailable.

## Root cause

Skill loading, authentication display, MCP activation, and callable discovery
are independent. Commit `e46546c` converted the Education Center login to the
root BOS app and used
`plugin_asdk_app_6a7cb1cc330c81918aa63d96aeeaba91`; the user observed that
configuration working. Later changes replaced the identity and then removed
the registered-app declaration for a direct `.mcp.json`. Releases 0.4.55 through
0.4.64 and 0.4.70 therefore rendered the Platform MCP row while omitting Login.
The 0.4.70 review verified receipt and callable-tool packaging, then incorrectly
treated those as evidence for the separate display contract.

## Fix applied

The correction restores the exact proven root BOS `.app.json` binding with
`required: true`, removes the direct Codex `.mcp.json`, keeps subservices
transport-free, and migrates both direct-MCP packages and the later replacement
app IDs. Product validation, installation verification, runtime verification,
and focused regression tests all pin the exact identity and required display
contract independently from server OAuth discovery.

## Verification

- Deterministic generated-client parity and package validation.
- Positive and negative Codex install, login-surface, cleanup, and runtime tests.
- `npm run release:check` and `npm run contract:check`.
- Post-install live acceptance remains a separate host check: OAuth discovery
  and grant, declared tool discovery, `bos_get_context`, and one bounded
  authenticated read.
- Repository-local Oracle review of the complete diff and evidence.

## Prevention

- Query the issue history before changing Codex authentication or transport.
- Preserve the last user-proven root BOS app identity until an intentional,
  independently verified replacement is accepted.
- Validate install, skills, connection, OAuth, callable discovery, and execution
  as separate gates.
- Require plugin-page Login display evidence in addition to transport receipt,
  OAuth discovery, and callable-tool evidence.
- Record failed attempts and the accepted correction in the Vault, then refresh
  the Chroma index.
