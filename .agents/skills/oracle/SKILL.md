---
name: oracle
description: Ground BOS Operations Center architecture guidance and repository reviews in this repository's canonical Vault. Use for architecture questions, implementation patterns, constitutional compliance, release readiness, or review of an actual BOS Operations Center diff. This is a repository-maintainer workflow and is never distributed in customer BOS plugins.
---

# Operations Center Oracle

Use current evidence from this repository and its local `Vault/`. Never answer
Operations Center architecture questions from a packaged BOS plugin or from
memory alone.

## Evidence workflow

1. Run `python3 tools/vault_index.py sync --quiet` from this repository root.
2. Read `AGENTS.md`, `Vault/docs/architecture.md`, and
   `Vault/docs/CONSTITUTION.md` completely.
3. Read the relevant local specification under `Vault/specs/`, plus the owning
   source, product manifest, tests, and package documentation.
4. Query the local Vault when the controlling source is unclear:
   `python3 tools/vault_index.py query "<question>"`.
5. Cite exact repository files and lines for every material conclusion.

## Architecture guidance

- Separate verified facts, inferences, and recommendations.
- Keep reusable BOS package contracts in this repository and
  application-specific runtime or approval machinery in the owning application
  repository.
- Evaluate products from their current contract. Future products or anticipated
  growth never satisfy missing present behavior.
- Preserve one host-managed BOS authentication connection. Subservice plugins
  contribute workflows through that connection and never own independent BOS
  logins or platform traffic.
- Flag conflicts between source and Vault. The constitution and accepted Vault
  decisions control until an explicit decision updates them.

## Repository review

Review the completed diff and focused validation evidence. Verify:

- explicit tenant, organization, app, installation, role, and plugin scope;
- application-neutral platform behavior and correct specialization ownership;
- Router-to-PO-to-GO mutation boundaries where service behavior is described;
- credential-free tracked sources, generated artifacts, and logs;
- one host-managed BOS OAuth connection per user-facing client context;
- product-manifest completeness and canonical-source/client-package parity;
- deterministic builds, version consistency, tests, and extension preservation;
- updated Vault knowledge when a change establishes a durable rule; and
- repository-maintainer workflows remain local under `.agents/skills` and are
  absent from every generated customer plugin.

Report findings first, ordered by severity, with exact locations. A finding
must state the violated contract and required correction. End with exactly one
verdict:

- `APPROVED` when no material finding remains.
- `REJECTED` when any material finding remains or required evidence is absent.

Loading this skill supplies local review instructions. It never grants external
approval authority or substitutes for an owning repository's external gate.
