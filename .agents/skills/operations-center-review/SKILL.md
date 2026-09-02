---
name: operations-center-review
description: Review BOS Operations Center repository changes against its architecture, constitution, issue history, client-package contracts, repository boundary, tests, and release gates. Use for diffs, pull requests, documentation, skills, generated clients, and release readiness.
---

# Operations Center Review

1. Read `AGENTS.md`, `Vault/docs/architecture.md`,
   `Vault/docs/CONSTITUTION.md`, and `Vault/docs/issues/ISSUE_HISTORY.md`.
2. Run `python3 tools/vault_index.py sync --quiet` and query the Vault for the
   touched behavior and related regressions.
3. Inspect the complete actual diff and focused validation evidence.
4. Verify package ownership, server-repository boundaries, tenant and authority
   scope, one BOS connection, and client/server contract separation.
5. Verify canonical-source to generated-client parity, deterministic generation,
   version consistency, extension preservation, and credential-free artifacts.
   For BOS connector changes, verify every identity-bearing artifact derives
   from `products/bos/product.json`, the established ID did not change,
   supported name and description updates require an existing exact ID and
   post-read that ID plus the BOS resource, missing or misbound established
   records cause zero account mutation and a registry-owner correction, cleanup
   targets only declared retired IDs, and only a different disabled `UNPROVISIONED_NEW`
   product with a matching requested source name and no retired IDs can
   provision after complete metadata-fingerprint reconciliation. Reject any
   identity-migration concept or replacement-ID repair.
6. Verify positive, negative, regression, and live-client evidence required by
   the touched surface. GPT screenshots are nonblocking post-release evidence;
   preserve their acceptance commands while allowing source publication.
   Inspect supplied screenshots visually and require an
   Oracle-authored review receipt that binds the exact screenshot SHA-256,
   product version, client surface, and observed native action. A PNG signature
   or file size never proves visual acceptance.
7. Verify durable rules, issue history, and resolution guidance are current in
   the Vault and present in the Chroma index.
8. Report findings first with exact file and line evidence.
9. End with exactly one verdict: `APPROVED` or `REJECTED`.

Return `APPROVED` only when no material finding remains. A repository mutation
after review requires a fresh complete review.
