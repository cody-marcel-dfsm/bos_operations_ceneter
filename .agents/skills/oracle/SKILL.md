---
name: oracle
description: Ground BOS Operations Center architecture guidance and repository reviews in this repository's canonical Vault. Use for architecture questions, implementation patterns, constitutional compliance, release readiness, or review of an actual BOS Operations Center diff. This is a repository-maintainer workflow and is never distributed in customer BOS plugins.
---

# Operations Center Oracle

## Release-only client delivery

- Never hot-patch installed client files, managed plugin caches, or personal
  skill directories. Never copy unpublished repository files into an installed
  product, create a local override or symlink to bypass release delivery, or
  change installed package contents while retaining a released version label.
- This prohibition applies to debugging, prompt validation, emergency fixes,
  and recovery. Backups and a request to fix or verify behavior grant no
  exception.
- Make changes in canonical repository sources and generate packages inside
  the repository. Deliver through the Git release workflow: version bump,
  validation, Oracle approval, release branch, pull request, required checks,
  and merge. Install or upgrade the published release through the client's
  supported release controls.
- Validate ordinary prompts against that published, versioned installation.
  Record the release version and commit with the result. Local source checks
  establish source validation only.
- If an installed package already contains unpublished edits, disclose the
  state and restore it through supported installation of a published release.
  Never repair an earlier hot-patch by directly rewriting client files again.


Use current evidence from this repository and its local `Vault/`. Never answer
Operations Center architecture questions from a packaged BOS plugin or from
memory alone.

## Mandatory reviewer role

Oracle is the final reviewer for every repository mutation. Skill invocation
supplies review instructions and never substitutes for the review itself.

For every implementation, fix, refactor, test mutation, documentation mutation,
generated-package mutation, or release change:

1. Review the complete actual diff after focused validation.
2. Read the controlling architecture, constitution, specifications, decisions,
   and current issue history.
3. Query the current Chroma-backed Vault index for related implementation and
   regression history.
4. Report findings with exact file and line evidence.
5. End with exactly one verdict: `APPROVED` or `REJECTED`.

`REJECTED` blocks completion. Any corrective repository mutation invalidates a
prior verdict and requires a fresh Oracle review of the complete updated diff.

## Evidence workflow

1. Run `python3 tools/vault_index.py sync --quiet` from this repository root.
2. Read `AGENTS.md`, `Vault/docs/architecture.md`, and
   `Vault/docs/CONSTITUTION.md` completely.
3. Read `Vault/docs/issues/ISSUE_HISTORY.md`, relevant issue conclusions under
   `Vault/docs/issues/conclusions/`, and the relevant local specification under
   `Vault/specs/`, plus the owning
   source, product manifest, tests, and package documentation.
   For a missing Codex BOS login action, unavailable BOS connection, or absent
   callable tools, also read
   `Vault/docs/codex-registered-app-incident.md`.
4. Query the local Vault for related architecture, decisions, and issue history:
   `python3 tools/vault_index.py query "<question>"`.
5. Cite exact repository files and lines for every material conclusion.

## Issue-history ownership

- Record active issues in `Vault/docs/issues/ISSUE_HISTORY.md` using
  `Vault/schemas/ISSUE_HISTORY_TEMPLATE.md`.
- Preserve problem evidence, root cause, failed attempts, accepted correction,
  validation, review verdict, and prevention guidance.
- Move resolved detail into a conclusion record under
  `Vault/docs/issues/conclusions/` while retaining the tracker entry and
  bidirectional links.
- Update issue history after resolution or material reclassification, then
  synchronize the Vault index before review.
- Reuse proven implementation and prevention guidance from related issues.

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
- Evaluate Codex package MCP binding, OAuth activation, grant state, and
  callable-tool discovery as distinct readiness layers. Require the package MCP
  endpoint to drive BOS OAuth discovery.
- Treat GPT screenshots as post-release verification. Their absence never
  blocks source publication; a supplied screenshot requires visual inspection
  and a hash-bound Oracle receipt before client verification is complete.
- Treat `products/bos/product.json` as the sole authored BOS transport
  authority. Require generated Codex `.mcp.json`, reject `.app.json` and
  registered connector IDs, and reject repository access to private account
  connector APIs.
- Flag conflicts between source and Vault. The constitution and accepted Vault
  decisions control until an explicit decision updates them.

## Repository review

Review the completed diff and focused validation evidence. Verify:

- fulfillment of the user's requested deliverable, correct maintainer skill
  routing, and evidence for server attribution; require completed client-owned
  implementation, applicable source validation, and Oracle review before a
  request for server work. Require the explicit **Server handoff** label and
  distinguish pending deployed acceptance from completed source validation;
- explicit tenant, organization, app, installation, role, and plugin scope;
- application-neutral platform behavior and correct specialization ownership;
- server prompts contain only requirements relevant to the requested server
  outcome; client workflow text does not expand authentication, authorization,
  or provider recovery scope, and acceptance checks match the touched contract;
- Router-to-PO-to-GO mutation boundaries where service behavior is described;
- credential-free tracked sources, generated artifacts, and logs;
- one host-managed BOS OAuth connection per user-facing client context;
- product-manifest completeness and canonical-source/client-package parity;
- deterministic builds, version consistency, tests, and extension preservation;
- updated Vault knowledge when a change establishes a durable rule; and
- visual inspection of supplied screenshot evidence plus an Oracle-authored
  receipt binding the exact SHA-256, product version, client surface, and
  observed native action; and
- repository-maintainer workflows remain local under `.agents/skills` and are
  absent from every generated customer plugin.

Report findings first, ordered by severity, with exact locations. A finding
must state the violated contract and required correction. End with exactly one
verdict:

- `APPROVED` when no material finding remains.
- `REJECTED` when any material finding remains or required evidence is absent.

Loading this skill supplies local review instructions. It never grants external
approval authority or substitutes for an owning repository's external gate.
