---
name: operations-center-implementation
description: Implement BOS Operations Center repository changes using its architecture, Vault, issue history, validation, repository boundary, and mandatory Oracle review requirements. Use for code, tests, skills, manifests, generated clients, documentation, and release changes in this repository.
---

# Operations Center Implementation

1. Read `AGENTS.md`, `Vault/docs/architecture.md`, and
   `Vault/docs/CONSTITUTION.md`.
2. Run `python3 tools/vault_index.py sync --quiet` and query related designs,
   decisions, and issue history before planning the change.
3. Read `Vault/docs/issues/ISSUE_HISTORY.md` and relevant conclusion records.
4. Inspect the current source, generated clients, tests, and dirty worktree.
5. Preserve unrelated user changes and the repository execution boundary.
6. Add focused positive and negative regression coverage before changing
   behavior when practical.
7. Implement in canonical sources and regenerate derived client packages through
   repository tooling.
   For BOS connector work, treat `products/bos/product.json` as the only
   authored product authority. An `ESTABLISHED` connector ID is immutable;
   update mutable metadata in place with `npm run product:codex -- sync`, then
   verify the same ID. Never infer new-product status from a missing registry
   record. Provisioning applies only to a different disabled product explicitly
   authored as `UNPROVISIONED_NEW`, with a matching requested source name and no
   retired IDs; retries reconcile the complete metadata fingerprint first.
8. Store durable architecture, design, issue, and implementation knowledge under
   `Vault/`; store disposable evidence under `Vault/tmp/<workflow>/`.
9. Run focused validation and every applicable package, contract, and release
   gate. GPT screenshots are post-release verification and never block source
   publication. Keep the version-matched screenshot and an
   Oracle-authored review receipt that binds its SHA-256 to the observed native
   action and surface; file presence alone is never acceptance.
10. Update issue history with root cause, resolution, evidence, and prevention
    guidance when the work fixes or materially reclassifies an issue.
11. Synchronize the Vault index after every Vault mutation.
12. Submit the complete actual diff and validation evidence to the
    repository-local `oracle` skill. Resolve every rejection and request a fresh
    review after each correction until Oracle returns `APPROVED`.

Report changed files, generated outputs, validation, issue-history updates,
Oracle verdict, and remaining risks.
