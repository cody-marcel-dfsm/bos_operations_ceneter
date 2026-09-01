# Oracle review: Codex Login regression restoration

Date: 2026-09-01

## Scope

Review the complete Operations Center diff restoring the user-proven root BOS
registered-app binding after release 0.4.70 again displayed the Platform MCP
server row without Login. The review includes canonical source, generated
clients, installers and cache migration, verification, contracts, regression
tests, repository-local Oracle guidance, and corrected Vault issue history.
BOS server code and infrastructure are outside this diff.

## Findings

No blocking or advisory findings.

## Evidence

- `products/bos/product.json:46-50` pins the exact root BOS app identity from
  working commit `e46546c`. `clients/codex/plugins/bos/.codex-plugin/plugin.json:29-30`
  binds `.app.json`, and `clients/codex/plugins/bos/.app.json:1-8` contains one
  BOS entry with that identity and `required: true`; the generated Codex
  package contains no direct `.mcp.json`.
- `scripts/lib/package-model.mjs:214-252` reserves a registered app for the
  active root Codex runtime and rejects app ownership on subservices. Lines
  524-540 deterministically emit the required binding.
- `scripts/install-package.mjs:130-167` rejects missing, optional, malformed,
  mismatched, or shadowed app bindings. Lines 646-700 migrate both recognized
  replacement identities and the 0.4.70 direct-MCP package without accepting
  unrelated connection files.
- `scripts/verify-codex-runtime.mjs:74-106` verifies the app declaration,
  plugin pointer, exact identity, required flag, and absence of `.mcp.json`.
  Lines 163-220 report app binding and callable discovery as independent gates.
- `tests/codex-login-surface-contract.test.mjs:7-64` pins the exact working
  identity and keeps Login display independent from server OAuth discovery.
  `tests/installer.test.mjs:718-764` proves upgrades from both regressed package
  forms converge on the proven binding. Runtime tests reject missing, optional,
  and direct-MCP-shadow states.
- `contracts/single-bos-mcp-connection.v1.json:5-22` and
  `scripts/lib/single-bos-contract.mjs` make the exact required app part of the
  portable client contract while preserving the immutable BOS resource and
  transport-free subservices.
- `Vault/docs/issues/ISSUE_HISTORY.md:25-80` records the user-observed working
  conversion, the 0.4.55-through-0.4.70 regression chain, the failed direct-MCP
  remediation, the accepted correction, and prevention. The prior 0.4.70
  review is explicitly retained as invalidated failed-review history.
- `.agents/skills/oracle/SKILL.md` now requires future reviews to evaluate
  registered-app display, OAuth activation, grant state, and callable discovery
  independently. Generated customer plugins remain free of Oracle.

## Validation

- Focused Codex login, runtime, installer, package-model, cleanup, and cache
  suites: passed; 123 tests passed.
- `npm run contract:check`: passed with zero violations.
- `npm run check`: passed.
- `npm run release:check`: passed; 214 tests passed.
- `git diff --check`: passed.
- Vault sync and Chroma query returned the corrected incident, accepted
  registered-app decision, and superseded direct-MCP decision.

## Conclusion

The diff restores the exact root BOS app declaration that previously displayed
Login, removes the direct-MCP display regression, safely migrates affected
installations, and prevents receipt of an MCP server from being accepted as
proof of the independent Login display contract. It preserves one root BOS
connection, keeps subservices transport-free, and makes no server-side change.

APPROVED
