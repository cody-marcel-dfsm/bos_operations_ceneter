# Oracle Review: Codex Package-Owned BOS MCP

Date: 2026-08-29

## Scope

Review of the release diff that replaces the deleted account-scoped Codex app
identity with a package-owned MCP declaration, removes stale BOS discovery state,
eliminates the running-client clean-install race, regenerates every supported
client package, and updates runtime verification.

## Findings

No blocking findings.

## Architecture and implementation evidence

- `clients/codex/plugins/bos/.codex-plugin/plugin.json:30` delegates the root
  runtime connection to the package-owned `.mcp.json` file.
- `clients/codex/plugins/bos/.mcp.json:2-6` declares exactly one HTTP MCP server
  at the canonical BOS platform resource.
- `scripts/clean-install-codex.mjs:22-42` detects a running ChatGPT process and
  schedules the detached clean-install helper. Lines 172-181 return before any
  registry or cache mutation, preventing the running client from writing stale
  in-memory state over the completed install.
- `scripts/clean-install-codex.mjs:207-241` backs up and removes bounded BOS
  discovery state, reinstalls the local marketplace, and installs both BOS and
  Education Center while the client is stopped.
- `scripts/verify-codex-runtime.mjs:60-90` validates direct-source identity and
  the exact package-owned MCP declaration. Lines 129-182 accept current local or
  managed-cache packages and fail closed on missing registry, package, binding,
  catalog, or required-tool evidence.
- `tests/codex-clean-install.test.mjs` covers bounded cleanup, unrelated-tool
  preservation, exact destructive confirmation, and deferral before mutation.
- `tests/codex-runtime-verification.test.mjs` covers managed-cache and direct
  local marketplace installs plus missing registry and missing-tool failures.

## Validation evidence

- `npm run release:check`: package build, structure and credential scan, single
  BOS connection contract, and 182 tests passed.
- Codex BOS plugin validation passed with the system plugin validator.
- Focused clean-install and runtime-verification suites passed eight tests.
- `git diff --check` passed.

APPROVED
