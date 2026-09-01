# Operations Center Vault and local Oracle specification

## Vault

The Vault provides one discoverable home for architecture, constitutional
rules, specifications, decisions, issue history, review evidence, and durable
operational knowledge. `tools/vault_index.py` incrementally chunks Git-visible
Vault text into the local Chroma `vault_knowledge` collection. Timestamped
manifests record source count, the canonical source snapshot digest, collection
count, changed sources, removed sources, and indexed chunks. Embedding and
search remain local and send no project knowledge to an external service.

## Local Oracle ownership

The repository-local Oracle at `.agents/skills/oracle` supports two use cases:

- answer architecture and implementation-pattern questions from current
  canonical evidence;
- review a completed package change for architecture and release compliance.

The Oracle also owns durable issue history under `Vault/docs/issues/`. Every
implementation workflow queries that history for related failures and accepted
patterns, records new resolution knowledge, and submits its complete actual diff
plus validation evidence for Oracle review. `REJECTED` blocks completion; each
correction requires a fresh review until the literal verdict is `APPROVED`.

For guidance, it cites the controlling source and separates known facts from
recommendations. For review, it inspects the actual diff and validation
evidence, reports actionable findings with exact locations, and ends with one
verdict: `APPROVED` or `REJECTED`.

The local skill reads this repository's `Vault/`, actual diff, and validation
evidence. It is a repository-maintainer workflow and is excluded from the BOS
product manifest and every generated customer package. Installed `bos:oracle`
skills are never an authority for this repository.

Skill invocation supplies the workflow and context. Independent approval, when
required by an owning application or high-risk deployment, comes from that
repository's own local reviewer or external approval service.

## Package-specific review gates

- tenant neutrality and explicit authorization scope;
- absence of secrets and customer data;
- native remote MCP authentication, provider recovery, and log redaction;
- product-manifest completeness;
- canonical-source to generated-client parity;
- deterministic build, package validation, and tests;
- preservation of customer-owned extensions;
- version and release-manifest consistency.

## Local tooling

- `python3 tools/vault_index.py sync --quiet` updates the Chroma collection.
- `python3 tools/vault_index.py query "<question>"` returns semantic matches
  with source, chunk, timestamp, distance, and indexed text.
- `python3 tools/vault_index.py watch --daemon` keeps the index current during a
  Vault-editing session.
- `tools/requirements-dev.txt` pins the same Chroma major/minor line used by the
  sibling BOS Oracle implementation.
- `.githooks/pre-commit` creates exact manifest evidence for staged Vault source
  changes when repository hooks are enabled.
