---
name: oracle
description: Ground BOS Operations Center architecture guidance and repository reviews in the canonical project Vault. Use for package architecture questions, implementation-pattern questions, constitutional compliance, credential-safety review, product composition, generated-client parity, remote MCP transport changes, release readiness, or approval of an actual BOS Operations Center diff.
---

# BOS Oracle

Use current repository evidence for architectural intelligence and change
review. Never answer BOS package architecture from memory alone.

## Evidence workflow

1. Run `python3 tools/vault_index.py sync --quiet` from the repository root.
2. Read `AGENTS.md`, `Vault/docs/architecture.md`, and
   `Vault/docs/CONSTITUTION.md`.
3. Read the relevant specification under `Vault/specs/` and owning source,
   product manifest, tests, and package documentation.
4. Query the Vault when the controlling source is unclear:
   `python3 tools/vault_index.py query "<question>"`.
5. Cite exact file and line evidence for conclusions.

## Architecture guidance

- Separate verified architecture facts, inferences, and recommendations.
- Prefer native package composition, remote Streamable HTTP, BOS-hosted
  provider authorization, and existing BOS platform boundaries before
  proposing a new abstraction.
- Keep reusable BOS contracts in this repository and application-specific
  runtime or approval machinery in the owning application repository.
- If source and Vault conflict, flag the conflict. The architecture and
  constitution control until an explicit decision updates them.

## Repository review

Review the completed diff after focused validation. Verify:

- explicit tenant, organization, app, installation, role, and plugin scope;
- application-neutral platform behavior and correct specialization ownership;
- Router-to-PO-to-GO mutation boundaries where service behavior is described;
- credential-free tracked sources, generated artifacts, and logs;
- one declared credential per runtime product connection and BOS-hosted,
  installation-scoped provider authorization;
- product manifest completeness and canonical-source/client-package parity;
- deterministic builds, version consistency, tests, and extension preservation;
- updated Vault knowledge when the change establishes a durable rule.

Report findings first, ordered by severity, with exact locations. A finding
must describe the violated contract and required correction. End with exactly
one verdict:

- `APPROVED` when no material finding remains.
- `REJECTED` when any material finding remains or required evidence is absent.

Loading this skill provides review instructions. It never grants independent
approval authority or substitutes for an owning repository's external gate.
