# Claude persistent Connect button review

Date: 2026-08-23

## Findings

No material findings remain.

## Evidence

- `Vault/decisions/2026-08-23-claude-persistent-account-connectors.md:12-31`
  records the reproduced Claude Desktop defect and makes account-level Web
  connector provisioning the controlling product contract.
- `scripts/build-packages.mjs:98-150` generates `claude_account` scope, keeps
  `mcpServers` out of the Claude manifest, and writes credential-free immutable
  connector metadata with the persistent **Connect** requirement.
- `scripts/check-package.mjs:292-329` rejects `.mcp.json`, `mcpServers`,
  `userConfig`, wrong account scope, route drift, and missing connector guidance
  for every active Claude runtime product.
- `clients/claude/plugins/education-center/.bos-product.json:1-10` records the
  exact product route, OAuth 2.1 authentication, and `claude_account` scope.
- `clients/claude/plugins/education-center/.claude-plugin/plugin.json:1-17`
  contains no session-scoped runtime declaration, while
  `clients/claude/plugins/education-center/CONNECTORS.md:1-16` supplies the exact
  account connector name, resource URL, **Connect** control, and credential
  containment guidance.
- `source/platform/bos-mcp-client/SKILL.md:36-50` restores a missing private
  connector only from generated metadata and prohibits reconstructed or modified
  package routes.
- `tests/package-model.test.mjs:1182-1217` prevents regression to
  **Connects in sessions** and proves the generated resource remains
  `https://dfsm.ai/mcp/apps/leaddirector/education-center`.
- Version `0.4.44` is consistent across the repository, active products, and
  generated client packages, allowing marketplace consumers to discover the
  corrected package.

## Validation

- `npm run release:check` regenerated all clients, passed package structure and
  credential scanning, and passed all 122 tests.
- `claude plugin validate clients/claude/plugins/education-center` and
  `claude plugin validate clients/claude/plugins/bos` passed.
- `git diff --check` passed.
- `python3 tools/vault_index.py sync --quiet` completed and the latest manifest
  includes the controlling decision, architecture, constitution, and review.

## Architecture conclusion

The change preserves the immutable application/group route, one host-managed
resource grant, tenant and role authority derivation on BOS, customer extension
isolation, and credential-free generated packages. It changes only Claude's
host adapter from session-scoped plugin MCP ownership to the account-level Web
connector surface that supplies the requested persistent **Connect** control.

APPROVED
