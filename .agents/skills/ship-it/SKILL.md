---
name: ship-it
description: Ship changed committed work through four phases with reusable validation and an exact-commit release checkpoint; skip unchanged delivered candidates. Use when the user says “ship it,” “send it,” or asks to release and publish the current work.
---

# Ship It

## Four phases — controlling owner workflow, October 21, 2026

Keep the original user-instruction timestamp as the release clock. Record one
contiguous duration for each phase, including tool and coordination time. Bootstrap
must finish in less than 120 seconds; validation has the 180-second lifecycle SLA
and the complete release has the original 300-second SLA. Retain original clocks
across retries. Record breaches and complete authorized work with intact evidence.

Read governing instructions first, then bounded candidate changes and validation
results. Read governing/document/source/diff/context bodies once per content
identity and reuse unchanged loaded bodies throughout this workflow. Query compact
plan/context fields and bounded targeted slices. Avoid concatenating entire large
artifacts; choose output limits and batch sizes that prevent truncation and
repeated reads. Expand inspection only for a changed input or unresolved behavior.

1. **Bootstrap.** Read governing instructions and applicable authority once,
   before interpreting validation results or changes. Reuse current loaded
   context. Use the coordinator's one complete family inventory when supplied;
   perform no second inventory. Run `python3 tools/shipment_state.py status`.
   `NO_CHANGES` ends this member immediately with zero test, model-review, build,
   version-bump or publication work. A clean tree can still have unvalidated
   committed work: `VALIDATE` selects it. `DELIVER` resumes the existing exact
   validated candidate's authorized delivery and skips steps 2 and 3. Missing or
   stale checkpoints grant no approval. Resolve `INTEGRATE` against the fetched
   published baseline in canonical main while preserving all authored work.
2. **Prepare.** Commit all authored work with direct Git commands. Use no Git-only
   agent or guardian, and require no approval or Oracle trailer to commit. Prepare
   the release version and canonical package outputs before the final preparation
   commit so validation and delivery use the same SHA. `npm run version:next`
   skips unchanged candidates and an already prepared version. Preserve private
   Vault material, source integrity and secrets. Commit repairs directly too.
3. **Validate.** The Projects coordinator launches this entire member-local
   lifecycle concurrently with every other family member that has unvalidated
   commits. It includes applicable lint/tests, independent review, all repairs,
   direct repair commits, affected revalidation and the successful checkpoint;
   it is never serialized as one member's complete lifecycle after another's.
   Confirm governing instructions first. Make one complete assessment per new
   commit/range through real production entrypoints, construction, consumers,
   publication and recovery paths, then return all established findings together.
   Retain unchanged content-bound coverage and test results across repair commits
   and instruction changes; examine only new, missing and affected files/criteria.
   Retain sealed original observations when native eligibility changes and assess
   their current applicability without blanket rereads or test runs. Capture
   affected tests with `npm run oracle:validate -- --output
   Vault/tmp/<workflow>/validation.json --input <path> -- <command>` and supply
   each record to `npm run oracle:review -- --evidence <record>`. Commit all repairs
   and continue the same review series until complete. The native review command
   atomically advances `.git/oracle/shipment-state.json:last_validated_commit`
   only after the clean exact commit has complete independent native approval.
   `INCOMPLETE`, `ERROR`, failed tests and unresolved findings retain checkpoints.
4. **Deploy.** Reuse the exact validated SHA, original release instruction and
   described effects. Recheck remote freshness and receipt custody, then use
   `tools/publication_admission.py` for review push and protected main promotion.
   Review push transports the verified exact-SHA/tree receipt digest through the
   trusted publisher's `oracle/native-approval` GitHub status; CI independently
   checks that status and the exact PR merge tree, with a bounded race wait.
   Reuse valid test/build evidence. A new commit returns only that member to
   affected validation. Confirm successful merge before recording the distinct
   `last_released_commit`; a failed delivery leaves the validated candidate pending.
   Repeating a delivered candidate returns `NO_CHANGES`. Preserve package,
   authentication, API-version, permission, privacy and cost-control gates.

This workflow controls older staged-before-commit and trailer instructions below.
Technical review governs release readiness; authored commits remain independent.

## Controlling review and publication placement — October 18, 2026

Complete independent technical proposal/review and commit checks without human deployment permission. Missing permission is not a technical finding. Existing human-approval wording below applies only to an actual protected deployment/publication effect: concrete credential-trust, permission-authority, tenant-isolation or incompatible-public-contract behavior. Authentication labels, filenames and ordinary compatible corrections create no gate. Keep the explicit public API version request and cost controls.

Use `python3 tools/publication_admission.py plan --release-ref <resolved-ref>` to inspect the exact publication. Source review pushes use its `push` command and require no deployment permission; PR creation/review remain available. Actual distributed-plugin main promotion uses its `merge --pr <number> --release-ref <resolved-ref>` command after required checks. When its exact protected effect lacks scoped human authority, finish all technical work and pause only that actual publication effect; use its `authorize --owner-evidence <direct-human-evidence> --release-ref <resolved-ref>` command to assess later evidence separately, then supply the resulting `--authorization <record>` to merge. Use repeatable `--effect-id <current-effect>` when supplied evidence covers selected missing scopes; omitted selection assesses all remaining scopes. Repeat `--authorization` for cumulative exact-effect decisions; `authorize` requests only effects still missing valid authority. Preserve every rejected/stale attempt alongside later valid evidence. Preserve the original technical receipt, full effective range and current effect dispositions. Never hot-patch installations.

## Model inheritance

Spawn native agents without a model override so they inherit the current task's
selected model. Oracle CLI launchers pass that model explicitly to isolated
`codex exec` processes and stop if it is unknown. Do not silently select a
different model during release recovery.

## Release-only client delivery

- Never hot-patch installed client files, managed plugin caches, or personal
  skill directories. Never copy unpublished repository files into an installed
  product, create a local override or symlink to bypass release delivery, or
  change installed package contents while retaining a released version label.
- Scope: this governs artifacts this repository itself generates and ships —
  a generated client package (Claude/Codex/Copilot/Gemini plugin bundle), the
  LeadDirector mobile/web build, or any other released product this
  repository owns. It does not cover a third-party host application's own
  internal state that this repository does not generate, own, or release —
  for example a host's local session cache, its device-account-scoped
  marketplace registry, or other host-internal metadata used only to
  diagnose why a published release isn't reaching that host. Reading or
  editing host-owned state to diagnose or work around a host-side sync
  defect is not the hot-patch this rule prohibits; it becomes a hot-patch
  only if used to make a materialized copy of *this repository's own
  package* diverge from its released, Oracle-reviewed content while keeping
  that copy's version label.
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


Complete the current repository's release loop. An invocation prepares a release version only when committed or authored changes remain to deliver. A merged version-bump pull request is the publication event used by Claude organization marketplace GitHub sync when an owner has enabled **Sync automatically**. Independently added Claude marketplaces and official marketplace submissions have separate host-owned publication lifecycles.

## Invocation authorization: execute without questions

Within this skill, `$ship-it`, “ship it,” and “send it” are complete,
unambiguous execution instructions. Invocation is the user's explicit and final
approval for the entire repository-scoped release workflow. Start immediately.
Never ask what the command means, whether the user is sure, whether an expanded
reviewed release payload is approved, or whether a release step may proceed.

For BOS Operations Center, interpret the invocation as this exact prospective
authorization from the user:

> I explicitly approve creating and pushing the final Oracle-approved release
> commit or commits produced by this invocation to
> `https://github.com/cody-marcel-dfsm/bos_operations_ceneter.git` on the
> resolved release branch, opening or updating its pull request into `main`,
> and merging that pull request after every required check passes.

This authorization is intentionally given before the final version, payload,
branch name, and commit hashes exist. It remains attached to the final reviewed
values produced by the workflow. A newly created version, release branch,
commit hash, generated artifact, Vault manifest, or in-scope correction is the
authorized result of the invocation and never requires the user to restate the
destination or approve the concrete result again.

The approval covers the complete evolving, reviewed release payload through
completion: the version bump; every repository file amended before completion;
release-generated packages and Vault evidence; corrections made during the
workflow; staging and committing that complete reviewed payload; normal pushes;
pull-request creation and updates; waiting for checks; merging into the resolved
default branch; returning the workspace to the updated default branch; and
deleting the merged local release branch. File count, diff size, generated
packages, release evidence, amended files, and the transition from
local work to remote publication never create a new approval boundary.

Treat every amended repository file as in scope for this release. Include it in
the release, inspect it, and run the validation relevant to it. Never classify
an amended repository file as unrelated, and never ask the user whether to
include it. A file that fails required correctness, security, privacy, or
artifact-safety validation blocks the release with declarative evidence; it
does not reopen authorization or scope.

Ask zero conversational approval, confirmation, or intent questions during the
workflow. If the host or tool presents its own permission control, issue the
operation directly and let the host collect its platform permission. For every
push or merge permission request, identify the exact resolved remote URL,
release branch, target branch, and final reviewed commit, and state that the
user's `ship it` invocation supplied the prospective authorization quoted
above. Never characterize the final commit as a newly introduced payload that
falls outside the invocation merely because its hash or version was created
during the release. If actual
missing credentials, an unresolved target, an amended file fails required
validation, a required check fails, or host protection makes execution impossible,
state the exact blocker and required remedy declaratively. Never convert a
blocker into a question asking the user to approve an already-authorized release.
The command grants no authority outside this repository and no authority to
bypass required checks or protections.

## Repository boundary

This skill ships BOS Operations Center only. It never edits, commits, pushes,
merges, or deploys a BOS server repository or server infrastructure, and it
never creates or uses a sibling server worktree. A request to "ship it" grants
release authority only for this repository.

When the release depends on a server change, complete only the independently
valid Operations Center work. Report the server dependency separately and
return a paste-ready prompt for an agent operating in the owning server
repository. Include sanitized failure evidence, the required protocol or
runtime invariant, deployment scope, and post-deployment verification. For
changes affecting the BOS MCP authentication or discovery contract, require
the server release to pass the client-owned Operations Center acceptance suite:
`npm run contract:check`, `npm run contract:oauth-discovery-live --
--resource-url "$BOS_MCP_RESOURCE_URL" --format json`, `npm run
contract:oauth-live -- --authorize-url "$BOS_OAUTH_AUTHORIZE_URL" --format
json`. Leave implementation,
review, merge, and deployment decisions to that
server-side agent. Return exactly one continuous Markdown prompt as the entire
server handoff response. Keep every contract requirement, command, and
acceptance criterion in that single copyable prompt.

## Server handoff scope

Write the prompt around the user's requested server outcome. Treat attached
client specifications and prior conversations as evidence; extract the relevant
server requirements instead of forwarding their instructions wholesale.
Include only the affected server behavior, API or data contract, necessary graph
wiring, existing-data migration, deployment scope, and observable acceptance
criteria that the request requires. Retain client evidence only when it explains
a server defect or a required response the server must provide.

Omit unrelated client installation, package layout, UI rendering, local cache,
and agent recovery procedures. Preserve existing authentication, authorization,
and provider recovery behavior unless the user requests a change or observed
evidence establishes a necessary dependency; identify that dependency explicitly.
A graph or profile-data change alone does not imply an authentication change.

Choose validation for the touched server surface. Include the OAuth acceptance
suite above only when its stated condition applies, and label those commands as
running from BOS Operations Center against the deployed candidate. Keep client
execution with its owner; request the server endpoint and deployment evidence
needed for that verification. For other server work, use the owning repository's
focused tests and relevant post-deployment checks. Before returning the prompt,
remove each detail that does not help the server agent implement or verify the
requested outcome.

## Preflight

1. Fetch the configured remote default branch and record its SHA. Resolve the
   repository root, current branch, upstream, remotes, divergence from that
   default branch, and complete status, including staged, unstaged, untracked,
   renamed, and deleted files.
2. Read the repository's applicable instructions and release/build documentation. Use its native review, validation, build, and release checks.
3. Stop before mutation when the repository is in a merge, rebase,
   cherry-pick, conflicted, or detached-HEAD state; when the default branch,
   push target, or pull-request target is ambiguous; or when required
   credentials are absent. Resolve targets deterministically from the current
   branch's upstream, the configured default branch, and configured remotes
   before declaring ambiguity. Treat the invocation authorization above as complete
   user authority for the resolved repository-scoped release operations. A
   concrete authentication failure, authorization denial, or host protection
   is a blocker to report with its exact evidence and remedy in declarative
   form. Ask no question about the already-authorized push or merge.
4. Review the entire pending change set. Inspect untracked files before staging. Treat every existing change as user-owned and in scope for this invocation.
5. Block the shipment and report exact findings when the changes expose credentials or private data, contain a material correctness or security defect, include an obviously accidental large artifact, or conflict with repository instructions. Never discard or rewrite the user's work while resolving a blocker.
6. If canonical main is behind the remote default branch, preserve all of
   its original work intact and integrate the newer remote in that same checkout.
   Account for every amended file while reconciling its intended
   behavior with current code; retain newer remote safeguards and stop when
   an overlap cannot be resolved safely. Re-fetch before final Oracle review
   and publication; if the remote base moved, integrate it and repeat affected
   validation and review. Never publish the stale tree wholesale.

## Create the release branch

1. Never push a release commit directly to the default branch. A merged release pull request provides an auditable release boundary and supplies Claude's organization-marketplace trigger when that distribution path is configured.
2. Work on canonical main throughout implementation, validation, review and commit. Resolve the release ref name `codex/release-v<next-version>` before changing version metadata, then create that branch ref at the final approved release commit without switching the checkout.
3. If the checkout is on another branch, preserve all work and reconcile that state with the controlling canonical-main requirement before implementation or release. Existing branch names supply no authority for branch switching or a new worktree.
4. Stop if the release branch already exists locally or remotely and cannot be identified as the current release safely. Never delete, reset, or overwrite an existing branch.

## Create the release version

1. After preflight and initial change review, increment the repository release version before generating packages. Use the repository's native version command when it exists. In BOS Operations Center, run `npm run version:next` for the default patch release.
2. Default to a patch increment. Use a minor, major, or exact version only when the user or repository release policy specifies it.
3. Require the bump to update canonical package metadata, every active product manifest, and current-release documentation. Leave disabled products on their independent versions.
4. Treat generated client manifests, marketplaces, and manifest-owned OpenAI
   skill-snapshot ZIPs as outputs of the canonical package build. Do not
   hand-edit generated copies. Do not create ad-hoc release ZIPs, tarballs,
   customer archives, or ad-hoc release-manifest artifacts. The owner-requested
   `skill-release-manifest.json` is a canonical build output: preserve its exact
   skill versions, requirements, whole-file inventories and repository release.
5. A clean already delivered candidate returns `NO_CHANGES`; create a version only for actual work. Reuse an existing prepared version and resume its pending delivery.

## Validate committed candidates

Follow step 3 above on the complete committed candidate. `operations-center-review`
returns `READINESS_PASS` or actionable `READINESS_FAIL`; the independent native
Oracle remains authoritative. Capture the initial credential-free release baseline
with `npm run oracle:validate -- --output Vault/tmp/<workflow>/release-check.json
-- npm run release:check` when no valid baseline exists. Use exact `--input` closures
for repairs, retain valid baseline and passing-case observations, and run only
affected checks. `npm run oracle:review -- --evidence <native-record>` seals a
fresh exact-commit receipt after complete independent approval. Source work
continues through `INCOMPLETE` and `ERROR` with retained checkpoints. Commit every
repair directly and resume that same series. Do not amend approval into a commit.

GPT screenshots remain post-release verification and never block source release.
Retain the explicit post-release acceptance command. When screenshot evidence is
supplied, require an Oracle-authored hash-bound observation of the native action;
file presence, dimensions or a PNG signature supplies no native acceptance.
A GitHub merge must preserve the exact approved pull-request tree. New remote
source requires integration and affected validation before publication.

## Publish through a pull request

1. Run `python3 tools/publication_admission.py push --release-ref <resolved-ref>` to push the review branch under the invocation's
   existing authorization. When no upstream exists, set one only when the
   release branch and a single intended remote are unambiguous. Push the full
   evolving, reviewed release payload without pausing for confirmation. Never
   ask a question and never force-push. For this repository, require the
   resolved push remote to equal
   `https://github.com/cody-marcel-dfsm/bos_operations_ceneter.git`; a mismatch
   is an unresolved target blocker rather than a reason to seek approval for a
   different destination.
2. Open a pull request from the release branch to the resolved default branch. The title must identify the new release version, and the body must summarize generated clients and validation evidence.
3. Wait for all required pull-request checks. Fix and commit in-scope failures in canonical main, rerun affected validation, update the release ref at the new validated SHA, push the correction, and wait again.
4. Run `python3 tools/publication_admission.py merge --pr <number> --release-ref <resolved-ref>` to merge under the invocation's existing authorization only
   after every required check passes and the repository reports that it is
   mergeable. Use a repository-supported merge method; GitHub must record the
   pull request as merged. Merge without asking a question, and do not bypass
   protections or required reviews.
5. Verify that the remote default branch contains the release version after the merge. For a connected Claude organization marketplace with **Sync automatically** enabled, this merge supplies its synchronization event.
6. Treat independent Claude marketplace publication as a separate host lifecycle. The merged commit makes the new version discoverable, while each account must refresh the marketplace through Claude's supported control. The publisher cannot force a refresh across independently added marketplaces.
7. Treat official Anthropic marketplace publication as a separate reviewed submission. A Git commit or pull request does not publish a new official-marketplace version.
8. Treat OpenAI publication as a separate host lifecycle. The merged commit makes the release available to the tracked Git ref, while private Codex marketplaces still require `codex plugin marketplace upgrade` and public ChatGPT/Codex directory releases still require submission and publication through the OpenAI Platform.

The repository shipment remains incomplete while any release commit exists
only locally. After merge and cleanup, require local `main` and `origin/main` to
resolve to the same commit and verify that the complete release branch is
reachable from remote `main`.

Push existing unpushed commits with the release commit only when they are part of the reviewed release branch and the pull-request target is unambiguous.

## Restore the default-branch workspace

After GitHub records the pull request as merged:

1. Keep the canonical workspace on main and fast-forward it from its configured remote after the release pull request merges. Create no implementation worktree or branch-switching cleanup step.
2. Verify the local default branch and its remote-tracking branch resolve to the same commit and that the worktree is clean.
3. Verify the release branch used by this invocation is an ancestor of the updated default branch, then delete that local release branch with the safe merged-branch deletion command. Delete only the release branch used by this invocation; preserve unrelated user branches.
4. Report a failed release cleanup when the workspace cannot return to the default branch, the branches differ, the worktree is dirty, or the merged local release branch remains. Do not call the release complete until these invariants hold.

## Report

After a successful merge and cleanup, report the previous and new release versions, pull-request URL and number, release commit, merge commit, source and default branches, remote destination, included file count, generated packages, validation/build results, and confirmation that the workspace is on a clean, current default branch with the merged local release branch removed. State which publication path was actually triggered: Claude organization sync, independent Claude marketplace availability, or neither. State that independent Claude account refresh, official Anthropic publication, Codex Git marketplace refresh, and public ChatGPT/Codex directory publication remain separate host-owned actions. If stopped, state the blocking evidence and leave the repository unchanged beyond clearly scoped fixes made before the blocker was known.

For Oracle continuations, programmatically project pending paths, open finding IDs,
verified validation summaries and the locations of exact input hashes from the
retained review records. Use bounded source/evidence slices and keep full audit
records separately. Checkpoint every fully assessed path/dependency and generated
parity group so the next unchanged continuation advances from completed work.

A failed aggregate retains its actual passing-case observations. Use those original
case outputs with unchanged source/test/fixture/configuration and environment
evidence to decide unaffected coverage; lack of a green native aggregate alone
never justifies repeating unchanged passing cases. Preserve the FAILED record and
each case's actual scope/status. Capture corrected cases with explicit `--input`
source, test, fixture and configuration closures. A full-scope capture requires an
initial-baseline need or a concrete affected-behavior/dependency justification.
Supporting passing-case observations do not relabel a failed aggregate or invent
a reusable native proof.
