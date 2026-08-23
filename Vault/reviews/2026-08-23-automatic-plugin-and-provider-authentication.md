# Automatic plugin and provider authentication review

Date: 2026-08-23

## Findings

No material findings remain.

## Evidence

- `scripts/build-packages.mjs:100-137` generates a credential-free Claude
  product connector from the immutable application and group route, mirrors it
  inline in `plugin.json`, and writes the CLI-compatible `.mcp.json`.
- `scripts/check-package.mjs:292-339` rejects missing, extra, mismatched,
  user-configured, header-bearing, or manually documented Claude connectors.
- `source/platform/bos-mcp-client/SKILL.md:29-79` keeps connection recovery
  agent-owned, preserves the original request, excludes credentials and raw
  authority from continuation state, and forbids customer-entered connector
  URLs.
- `source/platform/bos-mcp-client/SKILL.md:83-123` preserves the immutable
  application/group route, derives tenant, organization, installation, actor,
  and role authority from BOS, presents provider authorization in the active
  request, polls its installation-scoped transaction, and resumes the original
  operation once.
- `source/verticals/education-center/education-center-customer-initialization/SKILL.md:55-101`
  completes BOS authentication before configuration elicitation, activates
  Claude authorization from the first eligible request, and preserves provider
  authorization as a separate BOS-owned recovery flow.
- `tests/package-model.test.mjs` validates generated parity across Claude,
  Codex, Copilot, and Gemini; automatic first-run initialization; exact Claude
  connector shape; absence of manual connector setup; request-driven BOS
  authorization; and provider authorization resume behavior.
- `npm run release:check` regenerated all clients and passed package structure,
  product/skill parity, credential scanning, and all 121 tests.
- `claude plugin validate clients/claude/plugins/education-center` passed the
  native Claude validator.
- A live unauthenticated MCP initialize request returned HTTP 401 with the
  scoped `WWW-Authenticate` protected-resource metadata for
  `/mcp/apps/leaddirector/education-center`, proving host OAuth discovery is
  exposed without a packaged credential.

## Architecture conclusion

The change satisfies explicit authority, application neutrality, credential
containment, canonical generation, customer-safe updates, and request-owned
recovery. Plugin installation registers one product-scoped BOS connector.
Direct customer interaction is limited to secure host or provider consent and
credential-entry surfaces. Missing Gmail, Calimatic, or another provider grant
does not alter product connection scope and the agent resumes the pending
operation after BOS confirms readiness.

APPROVED
