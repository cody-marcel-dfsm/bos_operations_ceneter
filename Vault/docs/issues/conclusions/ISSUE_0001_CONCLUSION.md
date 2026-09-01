# Issue #0001 conclusion: Codex BOS login and callable-tool exposure

- Status: RESOLVED
- Resolution version: 0.4.70
- Date: 2026-09-01
- Category: Codex package binding and authentication readiness
- Related incident: `Vault/docs/codex-registered-app-incident.md`

## User-visible symptom and impact

The BOS plugin and its skills appeared installed, while the plugin page exposed
no login control and active tasks received no BOS callable tools. Users had no
native way to authorize the connection and the diagnostic response incorrectly
described the callable manifest as generally unavailable.

## Root cause

Skill loading and MCP connection loading are independent. The package had moved
from a portable package-owned MCP resource to an optional registered app in
0.4.65. Adding `required: true` in 0.4.66 could influence the display binding,
yet the referenced `asdk_app_*` value remained an account-scoped OpenAI Platform
submission draft. The deleted first identity returned `Connector not found`;
the replacement draft also lacked customer-directory registration. A package
could therefore pass shape checks while failing fresh-account resolution.

## Fix applied

Release 0.4.70 restored one credential-free root `.mcp.json` pointing to the
immutable BOS HTTPS resource, removed account-scoped app IDs from the portable
product contract, kept subservices transport-free, and added bounded migration
for the known stale app identities. Runtime verification now reports package
binding and callable discovery independently.

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
- Keep portable package runtime identity credential-free and account-neutral.
- Validate install, skills, connection, OAuth, callable discovery, and execution
  as separate gates.
- Require fresh-account portability evidence for any externally registered
  identity.
- Record failed attempts and the accepted correction in the Vault, then refresh
  the Chroma index.
