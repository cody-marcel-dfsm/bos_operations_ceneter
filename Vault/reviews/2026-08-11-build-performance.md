# Build performance review

- **Date:** 2026-08-11
- **Objective:** Reduce complete-build latency without weakening the live MCP
  release gate or changing generated package functionality.
- **Controlling sources:** `Vault/docs/architecture.md`,
  `Vault/docs/CONSTITUTION.md`,
  `Vault/specs/named-mcp-application-group-routing.md`,
  `Vault/specs/named-mcp-server-implementation.md`

## Evidence reviewed

- Artifact generation remains deterministic and unchanged; the measured local
  package, archive, and customer-ZIP phases complete in less than one second.
- Protocol initialization and live tool discovery still complete before any
  operational tool call: `scripts/smoke-icode-director-query.mjs:271` and
  `scripts/smoke-icode-director-query.mjs:311`.
- The enrollment query starts only after the complete required live tool
  contract succeeds, and it supplies only the bounded local-week query:
  `scripts/smoke-icode-director-query.mjs:339`.
- The authenticated context and enrollment reads execute concurrently and are
  both awaited before either result can satisfy the gate:
  `scripts/smoke-icode-director-query.mjs:352`.
- Existing fail-closed context, tool-catalog, enrollment-shape, and camp-field
  checks remain active: `scripts/smoke-icode-director-query.mjs:362`.
- Progress output contains only fixed phase/state labels and HTTP status; the
  final report retains its credential- and PII-safe aggregate contract:
  `scripts/smoke-icode-director-query.mjs:430`.
- The focused regression test proves discovery precedes both read calls, the
  reads overlap, both complete, and progress/report output excludes the bearer:
  `tests/icode-director-live-smoke.test.mjs:123`.

## Performance evidence

- Baseline live gate: 52.22 seconds.
- Optimized live gate: 37.82 seconds.
- Improvement: 14.40 seconds, or 27.6%.
- The remaining latency is server-side: live discovery took about 14 seconds,
  authenticated context about 20 seconds, and enrollment about 14–17 seconds.

## Validation

- `npm run release:check`: passed; live scoped query passed and 105 tests
  passed.
- `node --test tests/icode-director-live-smoke.test.mjs`: passed, 16 tests.
- `git diff --check`: passed.
- Package structure, generated-client parity, artifact inventory, and
  credential scan passed.

## Findings

No material architecture, tenant-isolation, authentication-context,
credential-safety, product-composition, deterministic-build, or
release-readiness findings remain. The change affects only independent,
read-only validation scheduling after live discovery; it adds no mutation,
authority selector, endpoint fallback, credential storage, or customer data.

APPROVED
