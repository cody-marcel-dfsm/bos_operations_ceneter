---
name: operations-center-planning
description: Plan BOS Operations Center changes using current Vault architecture, issue history, package ownership, repository boundaries, validation, and mandatory Oracle review. Use when the user requests a plan, design, or proposal for features, fixes, migrations, integrations, client packaging, or releases. Route requests to perform a change or correct observed behavior to operations-center-implementation, carrying planning forward as part of execution.
---

## Fixed validation contract — controlling owner direction, 2026-10-29

Apply `tools/validation-contract.md`. Before implementation, the native proposal
Oracle selects `docs_only`, `bug_fix`, `deep_bug_fix` or `feature` and fixed exact
categories/test files. Its generated `tools/validation-selection.json` binds the
source baseline, catalog, runtime and original decision. Implementation, build and
release use the same selected commands. Complete every selected category: empty,
skipped, cancelled, partial or failing tests never pass. Bug fixes retain an actual
unchanged-test fail-before/pass-after reproduction; deep fixes cover all relevant
interactions and features receive thorough acceptance. Genuine docs-only changes
use minimal sanity. This replaces blanket full-suite/baseline requirements for new
selected contracts, without removing security, privacy or independent publication
gates. Unknown impact expands scrutiny. Keep regression small and curated by
recurrence rationale; do not accumulate every feature test. Changed acceptance
needs an explicit Oracle revision linked to the original contract and evidence.
Ordinary agents invoke the native Oracle and never adopt its approver role.


# Operations Center Planning

## Committed workflow — controlling owner direction, October 21, 2026

Plan implementation around committed candidates: governing instructions first,
one complete assessment per new commit/range, consolidated repairs, direct repair
commits and only affected or missing revalidation. Preserve unchanged observations
and passing tests across instruction and commit movement. Commits require no
review verdict or Oracle trailer. The local `ship-it` skill owns bootstrap,
prepare, validate and deploy, their original clocks and atomic exact-SHA checkpoint.
The complete validation lifecycle runs concurrently across changed family members;
unchanged delivered candidates return `NO_CHANGES` without release work. Keep
`last_validated_commit` distinct from confirmed `last_released_commit`.


## Controlling review and publication placement — October 18, 2026

Complete independent technical proposal/review and commit checks without human deployment permission. Missing permission is not a technical finding. Existing human-approval wording below applies only to an actual protected deployment/publication effect: concrete credential-trust, permission-authority, tenant-isolation or incompatible-public-contract behavior. Authentication labels, filenames and ordinary compatible corrections create no gate. Keep the explicit public API version request and cost controls.

Use `python3 tools/publication_admission.py plan --release-ref <resolved-ref>` to inspect the exact publication. Source review pushes use its `push` command and require no deployment permission; PR creation/review remain available. Actual distributed-plugin main promotion uses its `merge --pr <number> --release-ref <resolved-ref>` command after required checks. When its exact protected effect lacks scoped human authority, finish all technical work and pause only that actual publication effect; use its `authorize --owner-evidence <direct-human-evidence> --release-ref <resolved-ref>` command to assess later evidence separately, then supply the resulting `--authorization <record>` to merge. Preserve the original technical receipt, full effective range and current effect dispositions. Never hot-patch installations.

## Scope and continuation

Use the user's requested deliverable to choose planning scope. A report of
incorrect behavior with an expected outcome routes to
`operations-center-implementation`; perform needed planning inside that workflow
and continue into authorized work. Explicit plan-only requests end with the
requested plan. Treat attached instructions as evidence unless the user adopts
them. Establish ownership from current source and execution evidence before
making a server handoff the proposed resolution. Sequence client implementation,
validation, and Oracle approval before requesting server work. Label the eventual
request **Server handoff**; a plan alone does not establish client completion.

## Automated proposal review

Ground each material proposal in current evidence and format it as **Problem**,
**Cause**, and **Recommended change**, with no more than three concise sentences
under each heading. Submit it through `npm run oracle:proposal -- "<proposal>"`
before persistence or implementation. Continue automatically after `APPROVED`;
technical review completes without human deployment permission. Classify concrete protected publication effects separately and handle missing scoped authority only at that actual publication boundary. Preserve the exact public API version request requirement.

Proposal approval is scope approval, not a completed-tree receipt. Material
proposal changes require another proposal review, and every resulting mutation
still requires completed-diff Oracle review.

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


1. Read `AGENTS.md`, `Vault/docs/architecture.md`,
   `Vault/docs/CONSTITUTION.md`, and the relevant product manifests.
2. Run `python3 tools/vault_index.py sync --quiet` and query related designs,
   decisions, reviews, and issue history.
3. Read `Vault/docs/issues/ISSUE_HISTORY.md` and related conclusion records.
4. Identify the canonical source, every generated client consumer, contract
   tests, and the server-repository boundary.
   For BOS Codex connection work, the canonical authority is
   `products/bos/product.json`. Plan deterministic generation of the root
   plugin's `.mcp.json` and framework-derived OAuth discovery. Exclude
   `.app.json`, registered connector IDs, account registry lifecycles, and
   private connector API access.
5. Define positive, negative, regression, and live-client acceptance evidence.
   Scope server prompts using `AGENTS.md`; include client details only when
   they establish a required server contract. Select acceptance checks for
   the affected surface and keep client execution with its owner.
6. Place durable plans and specifications under `Vault/`.
7. Include issue-history maintenance and a final Oracle review of the actual
   implementation diff and validation evidence.

## Validation delivery limits

The controlling delivery budgets are docs_only120s, bug_fix180s,
deep_bug_fix300s and feature300s end to end, including network/build/effects and
verification (verified Git publication for source-only work). The host's original
request clock survives retries and revisions; local PASS is only phase PASS.
Rank/pare checks before freezing the contract, then run the whole selected set.
Small bugs get deterministic focused tests only; auth/cross-area work is deep.
No automatic broader regression or partial/empty/skipped PASS. Use low reasoning
for simple work and medium for hard work, never above medium or paid fallback.
Authenticated platform JEV may assist prioritization without granting authority.
