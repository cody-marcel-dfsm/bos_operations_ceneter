---
name: operations-center-planning
description: Plan BOS Operations Center changes using current Vault architecture, issue history, package ownership, repository boundaries, validation, and mandatory Oracle review. Use for features, fixes, migrations, integrations, client packaging, and release proposals.
---

# Operations Center Planning

1. Read `AGENTS.md`, `Vault/docs/architecture.md`,
   `Vault/docs/CONSTITUTION.md`, and the relevant product manifests.
2. Run `python3 tools/vault_index.py sync --quiet` and query related designs,
   decisions, reviews, and issue history.
3. Read `Vault/docs/issues/ISSUE_HISTORY.md` and related conclusion records.
4. Identify the canonical source, every generated client consumer, contract
   tests, and the server-repository boundary.
   For BOS connector work, the canonical product authority is
   `products/bos/product.json`. Plan only supported name and description updates
   against an existing established ID, followed by an exact-ID and BOS-resource
   post-read. A missing record or resource mismatch requires a registry-owner
   correction and zero account mutation because the available create route
   mints a different identity. There is no identity migration. Reserve connector creation for a different
   disabled product explicitly marked `UNPROVISIONED_NEW`, with a matching
   requested source name, no retired IDs, and complete-metadata reconciliation
   before retry.
5. Define positive, negative, regression, and live-client acceptance evidence.
6. Place durable plans and specifications under `Vault/`.
7. Include issue-history maintenance and a final Oracle review of the actual
   implementation diff and validation evidence.
