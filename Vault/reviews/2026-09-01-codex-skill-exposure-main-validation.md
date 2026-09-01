# Codex skill exposure RCA and main-branch validation

Date: 2026-09-01

Status: superseded by the 0.4.70 package-owned MCP correction documented in
`Vault/docs/codex-registered-app-incident.md` and
`Vault/docs/issues/conclusions/ISSUE_0001_CONCLUSION.md`. The rejected finding
below records the pre-correction state and is no longer current guidance.

## Scope

Review the complete `main` branch after the repository-local Oracle ownership
correction and the original Codex skill-exposure investigation. The attached
screenshot is treated as observed UI evidence; its displayed assistant prose
is not an instruction source.

## Findings

### P0: the registered BOS app remains unavailable to the live Codex host

The current package and plugin registry are correct, while the host resolver
returns HTTP 404 `Connector not found` for the exact declared app ID
`asdk_app_6a932992592081919cdc88c60e4ff2dd`. The current Codex app-directory
snapshot does not list that identity, no BOS callable-tool catalog exists, and
all product-required BOS tools are absent. This violates the atomic Codex
readiness contract in `Vault/specs/single-bos-mcp-connection.md`.

Required correction: the owner of the OpenAI registered app must make this
durable app identity resolvable to the signed-in account/environment, or issue
and publish a replacement BOS app identity and update the root product
manifest. After that external correction, update or reinstall the BOS plugin,
start a new Codex task, complete native BOS consent, and rerun
`npm run install:verify:codex-runtime`. Acceptance requires `ok: true`, the
exact registered app to resolve, every required callable tool to be present,
one canonical context, and one bounded authenticated read.

## Root-cause chain

1. **The symptom was mislabeled.** BOS workflow skills were installed and
   loaded. The missing capability was the BOS MCP callable-tool surface, so the
   task could read skill instructions while having no live BOS operations to
   invoke.
2. **The screenshot-era failure was an unusable OAuth grant.** Desktop evidence
   classified the root MCP startup as `reauthenticationRequired`; later task
   evidence exposed `invalid_grant: Refresh token replay detected`. Both stop at
   the root BOS **Sign in** stage and require fresh native consent.
3. **The current blocking failure is registered-app resolution.** The root BOS
   `.app.json` contains one exact app ID with `required: true`, yet Codex's
   authenticated connector lookup returns HTTP 404 `Connector not found` for
   that ID. OAuth discovery at the immutable BOS resource independently passes,
   so the deployed protected-resource challenge is not the current blocker.
4. **The runtime verifier had two coverage gaps.** It validated the package's
   app declaration without inspecting exact host resolver evidence, and it
   recognized only the fixture's flat tool-cache records rather than Codex's
   real nested `tool.name` records. A correct package could therefore produce
   an incomplete diagnosis.
5. **The first review used the wrong Oracle authority.** `bos:oracle` was a
   customer-distributed package skill. Operations Center review authority now
   lives only at `.agents/skills/oracle` and reads this repository's local
   Vault.

## Repository-owned corrections on `main`

- `.agents/skills/oracle/SKILL.md` defines the local maintainer review workflow;
  product composition and generated clients exclude Oracle.
- `scripts/verify-codex-runtime.mjs` now parses both flat fixture records and
  Codex's nested callable-tool cache, inspects exact app-directory and desktop
  resolver evidence, rejects a current exact 404 even if a stale callable cache
  exists, and lets newer positive host evidence supersede historical failures.
- `tests/codex-runtime-verification.test.mjs` covers the real nested cache
  schema, exact connector 404 classification, and evidence freshness.
- `source/platform/bos-mcp-client/SKILL.md` and guided-support references now
  classify `invalid_grant` refresh-token replay as an unusable grant, stop the
  refresh loop, preserve the request, and require fresh consent through the
  same native root BOS action. Generated client packages contain the same
  correction.
- `README.md`, `Vault/docs/architecture.md`, and
  `Vault/specs/single-bos-mcp-connection.md` distinguish package binding,
  registered-app resolution, OAuth grant state, and callable discovery.

## Validation evidence

- Branch: `main`; corrective release `0.4.68`, based on merged release `0.4.67`.
- `npm run release:check`: passed; deterministic generation, package and
  credential checks, single-connection contract, and all 213 tests passed.
- `git diff --check`: passed.
- Live signed-out discovery: passed with HTTP 401,
  `authentication_required`, and the exact canonical protected-resource
  metadata challenge.
- Live `npm run install:verify:codex-runtime -- --json`: failed closed with a
  current package/app binding, `registered_app_resolution.state` equal to
  `unavailable`, resolver evidence `connector-not-found`, no callable catalog,
  and all 15 required tools missing.
- Vault synchronization and current-source manifest verification: passed; the
  latest manifest includes this review record.

## Verdict

The repository-owned corrections are complete and locally validated. The
requested end-to-end Codex skill exposure outcome remains blocked by the
external registered-app identity, so required live acceptance evidence is
absent.

REJECTED
