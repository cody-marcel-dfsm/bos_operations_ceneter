# Installed-app feedback and Gemini client review

## Scope

Reviewed the completed diff for installed-app-bound feedback submission,
Gemini CLI client generation, the concurrent `use-bos` boundary clarification,
generated-client parity, release packaging, and credential containment.

## Findings

No material findings.

## Evidence

- `source/runtime/bos/.mcp.json:3-8` keeps the installed-app selector in the
  native remote MCP URL and the organization credential in the bearer header.
- `source/platform/submit-feedback/SKILL.md:27-38` resolves canonical context,
  omits route scope from feedback arguments, and fails closed without broad
  endpoint fallback.
- `source/platform/submit-feedback/SKILL.md:95-119` preserves explicit
  confirmation, privacy minimization, stable retry identity, and receipt
  wording.
- `source/platform/use-bos/SKILL.md:8-31` separates client runtime from
  developer infrastructure and keeps credentials outside chat and arguments.
- `scripts/lib/package-model.mjs:250-293` generates Gemini-native Streamable
  HTTP MCP configuration, declares the bearer credential sensitive, and keeps
  installed-app identity as connection configuration.
- `scripts/build-packages.mjs:110-129` generates Gemini product metadata,
  canonical skills, and customer settings without a parallel source tree.
- `tests/package-model.test.mjs:124-180` verifies Gemini transport, bearer
  handling, installed-app routing, feedback argument minimization, retry
  identity, receipts, and structured error documentation.
- `npm run release:check` generated 12 deterministic archives, passed package
  and credential scans, and passed all 44 tests.
- JavaScript syntax checks and `git diff --check` passed.

## Residual validation

A live Gemini CLI installation smoke test requires Gemini CLI on the release
host. The generated manifest follows the official Gemini extension and MCP
configuration contracts, and the absence of that executable does not alter the
deterministic package evidence above.

APPROVED
