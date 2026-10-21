---
name: operations-center-review
description: Review BOS Operations Center repository changes against its architecture, constitution, issue history, client-package contracts, repository boundary, tests, and release gates. Use for diffs, pull requests, documentation, skills, generated clients, and release readiness.
---

# Operations Center Review

## Committed validation — controlling owner workflow, October 21, 2026

Commit authored work and repairs directly with Git before independent validation;
approval and trailers never gate commits. Read governing instructions before
changes or results, reusing current loaded authority. Assess each new commit/range
once, consolidate all findings, repair together, commit and validate only new,
missing or affected paths and criteria. Retain unchanged coverage, test evidence
and sealed observations across commits and instruction movement. Current approval
still binds the entire exact candidate. `ship-it` owns the four phases and
atomic `last_validated_commit` checkpoint; its complete validation lifecycle runs
concurrently across selected changed family members. An unchanged delivered
candidate returns `NO_CHANGES` with no review, tests, build, version or publication.
The exact validated SHA is released; `last_released_commit` advances only after
confirmed successful delivery. Source changes continue without locks or freezes.

Covered normal-plan reviews proceed automatically without spending-approval
questions or a separate $0 approval. Explicit approval remains required for
additional monetary spending outside the owner's existing plan.

Identify evidence that may require security-authority review without issuing an
Oracle classification, warning, or verdict. The independent Oracle process owns
authentication-impact classification and concrete protected-publication assessment. Route the
complete staged candidate to `npm run oracle:review` after this readiness pass.

Complete the initial coverage scan before returning a consolidated finding batch.
Supply stable IDs, exact locations, root cause, reproduction, required behavior,
affected paths, concrete repairs and acceptance checks. Keep a coverage and
finding ledger. On resubmission, inspect the repair delta and affected dependency
closure; retain prior evidence only with unchanged source/dependency,
configuration, fixture, environment and artifact hashes. State each invalidation
and the affected rerun. Adding explicit owner authorization preserves unrelated
eligible source observations; assess new auth paths and current permission gates.
Replacement/removal of previously relied-on owner proof invalidates source reuse.
Native tests depend on their selected inputs/configuration/environment/provenance;
owner evidence changes invalidate them only through an actual declared input.
Reusable validation uses the utility's `validate`
command record, including captured source/configuration/environment and retained
output hashes; check that its input list covers the affected dependency closure.
Ordinary logs remain review evidence and gain reuse only with recorded proof.
Explicitly account for every open finding; explain late
discoveries in unchanged reviewed code as missed findings. Unfinished coverage
is `INCOMPLETE`, and tool/runtime failure is `ERROR`; neither establishes a code
defect or grants readiness. Source work continues without review-imposed source,
file or line locks, freezes or work pauses. Include all current changes regardless
of author. Compare actual content, mode/type, consumed dependencies and criteria;
reuse applicable verified coverage and assess new, changed, affected or unfinished
paths. Preserve input-movement errors and raw assessments as unadopted observations
with their original statuses; independently assess applicability on the next
candidate. Accumulate findings through `COMPLETE` for a consolidated repair batch.
After two failed repair rounds, consolidate the
unresolved findings into a concrete repair plan. Oracle alone issues the fresh
complete-current-tree verdict required after every candidate mutation.

Verify that the durable proposal record predates implementation, matches the
implemented Problem/Cause/Recommended change scope, and came from
`npm run oracle:proposal`. A proposal verdict never replaces completed-tree
review. Reject a material implementation divergence until the revised proposal
receives fresh Oracle technical approval. Missing deployment permission never stops the assessment; actual protected publication checks exact scoped authority separately.

## Controlling review and publication placement — October 18, 2026

Complete independent technical proposal/review and commit checks without human deployment permission. Missing permission is not a technical finding. Existing human-approval wording below applies only to an actual protected deployment/publication effect: concrete credential-trust, permission-authority, tenant-isolation or incompatible-public-contract behavior. Authentication labels, filenames and ordinary compatible corrections create no gate. Keep the explicit public API version request and cost controls.

Use `python3 tools/publication_admission.py plan --release-ref <resolved-ref>` to inspect the exact publication. Source review pushes use its `push` command and require no deployment permission; PR creation/review remain available. Actual distributed-plugin main promotion uses its `merge --pr <number> --release-ref <resolved-ref>` command after required checks. When its exact protected effect lacks scoped human authority, finish all technical work and pause only that actual publication effect; use its `authorize --owner-evidence <direct-human-evidence> --release-ref <resolved-ref>` command to assess later evidence separately, then supply the resulting `--authorization <record>` to merge. Preserve the original technical receipt, full effective range and current effect dispositions. Never hot-patch installations.

## Request fulfillment review

For implementation work, compare the actual result with the user's requested
outcome. Verify that relevant skills were selected, attachment content stayed
evidence, and actionable repository-owned corrections reached validation.
Check server attribution against source and execution evidence; a missing
catalog entry alone cannot prove a server implementation defect. Require the
handoff to begin with **Server handoff**, identify the remaining server-owned
dependency, and preserve the AGENTS boundary. Reject a request for server work
issued before client-owned implementation, applicable source validation, and
Oracle review are complete. Pending deployed acceptance must remain explicit.
Keep explicit explanation, plan-only, and review-only requests within their
requested scope. Do not claim a skill wording change proves future
agent behavior or a live product fix.

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
   `Vault/docs/CONSTITUTION.md`, and `Vault/docs/issues/ISSUE_HISTORY.md`.
2. Run `python3 tools/vault_index.py sync --quiet` and query the Vault for the
   touched behavior and related regressions.
3. Inspect the complete actual diff and focused validation evidence.
4. Verify package ownership, server-repository boundaries, tenant and authority
   scope, one BOS connection, and client/server contract separation.
5. Verify canonical-source to generated-client parity, deterministic generation,
   version consistency, extension preservation, and credential-free artifacts.
   For BOS Codex connection changes, verify `products/bos/product.json`
   deterministically generates one `.mcp.json` remote HTTP entry, the plugin
   manifest references it through `mcpServers`, OAuth discovery targets BOS,
   and no `.app.json`, registered connector ID, account lifecycle, or private
   connector API remains.
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
9. End with exactly one readiness result: `READINESS_PASS` or
   `READINESS_FAIL`.

Return `READINESS_PASS` only when no material finding remains. This result is
advisory and cannot approve a repository mutation. A mutation after review
requires a fresh readiness assessment using eligible recorded evidence, followed
by a fresh Oracle utility verdict for the complete candidate.

For Oracle continuations, programmatically project pending paths, open finding IDs,
verified validation summaries and the locations of exact input hashes from the
retained review records. Use bounded source/evidence slices and keep full audit
records separately. Checkpoint every fully assessed path/dependency and generated
parity group so the next continuation advances from applicable completed work.

A failed aggregate retains its actual passing-case observations. Use those original
case outputs with unchanged source/test/fixture/configuration and environment
evidence to decide unaffected coverage; lack of a green native aggregate alone
never justifies repeating unchanged passing cases. Preserve the FAILED record and
each case's actual scope/status. Capture corrected cases with explicit `--input`
source, test, fixture and configuration closures. A full-scope capture requires an
initial-baseline need or a concrete affected-behavior/dependency justification.
Supporting passing-case observations do not relabel a failed aggregate or invent
a reusable native proof.
