# Oracle review: issue history and implementation lifecycle

Date: 2026-09-01

## Scope

Review the repository-local Oracle lifecycle added to BOS Operations Center:
Oracle-owned issue history, implementation guidance, mandatory review of every
repository mutation, Chroma-backed Vault indexing, durable design placement,
and regression enforcement. The separate 0.4.70 package release receives its
own complete release-diff review after all release mutations finish.

## Findings

No material findings.

## Evidence

- `AGENTS.md:53-73` makes Oracle review mandatory for every implementation and
  requires a fresh complete review after each correction.
- `.agents/skills/oracle/SKILL.md:12-58` defines the final-review protocol,
  requires the actual diff and validation evidence, and assigns durable issue
  history to the local Oracle.
- `.agents/skills/operations-center-implementation/SKILL.md:8-31` routes every
  implementation through current Vault guidance, issue-history maintenance,
  validation, and the Oracle remediation loop.
- `.agents/skills/operations-center-review/SKILL.md:8-25` defines complete-diff
  review and the literal `APPROVED` or `REJECTED` contract.
- `.agents/skills/operations-center-planning/SKILL.md:8-18` requires plans to
  identify package consumers, acceptance evidence, issue-history work, and the
  final Oracle review.
- `.agents/skills/ship-it/SKILL.md:65-77` applies the same remediation loop to
  the complete release diff before commit.
- `Vault/specs/oracle-and-vault.md:3-62` records the Vault, Chroma, Oracle,
  package-review, watcher, and manifest contracts as canonical project
  knowledge.
- `Vault/docs/issues/ISSUE_HISTORY.md` and
  `Vault/docs/issues/conclusions/ISSUE_0001_CONCLUSION.md:9-52` preserve the
  symptom, causal chain, accepted correction, validation, and prevention
  guidance for the Codex BOS login and callable-tool incident.
- `tools/vault_index.py:90-145` indexes the Git-visible canonical Vault source
  set; `tools/vault_index.py:193-317` maintains the persistent local Chroma
  collection and durable manifests; `tools/vault_index.py:320-455` provides
  synchronized writes, semantic query, and watcher operation.
- `.githooks/pre-commit:38-101` blocks incomplete staged Vault source sets and
  stages exact manifest evidence after synchronization.
- `tests/oracle-governance.test.mjs:8-54` prevents removal of mandatory review,
  issue-history ownership, and maintainer-only skill isolation.
- `tests/vault-index.test.mjs:10-82` builds and queries a real temporary Chroma
  collection and verifies generated-state exclusion and manifest enforcement.
- The six durable design and implementation documents formerly under `docs/`
  now reside under `Vault/docs/`, making them part of the canonical indexed
  knowledge set.

## Validation

- `npm run check`: passed.
- `npm test`: passed, 215 tests, 0 failures.
- `node --test tests/vault-index.test.mjs tests/oracle-governance.test.mjs`:
  passed, 5 tests, 0 failures.
- Local skill validation passed for `oracle`,
  `operations-center-implementation`, `operations-center-review`, and
  `operations-center-planning`.
- Semantic query returned the issue tracker and conclusion for the Codex
  fresh-account portability failure.
- Semantic query returned canonical Oracle review and implementation guidance.
- `git diff --check`: passed before this review record was added and is rerun
  after final synchronization.

## Boundary review

The implementation changes only this Operations Center checkout. It adds no
server implementation, deployment, infrastructure mutation, or sibling server
worktree. Repository-maintainer Oracle skills remain outside generated customer
packages, enforced by regression coverage.

## Conclusion

The local Oracle now maintains durable issue history, supplies indexed guidance
to implementation agents, and serves as the mandatory final reviewer for every
repository mutation. The implementation follows the sibling BOS Oracle design
patterns and Chroma tooling while retaining Operations Center-specific package
and repository boundaries.

APPROVED
