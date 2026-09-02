---
name: ship-it
description: Create the next repository release version, review and validate all current work, regenerate client packages, commit everything, and merge it through a release pull request. Use when the user says “ship it,” “send it,” or asks to release and publish the current work.
---

# Ship It

Complete the current repository's release loop. A successful invocation creates a new version even when the pending source change did not edit version metadata. A merged version-bump pull request is the publication event used by Claude organization marketplace GitHub sync when an owner has enabled **Sync automatically**. Independently added Claude marketplaces and official marketplace submissions have separate host-owned publication lifecycles.

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
runtime invariant, deployment scope, and post-deployment verification. Require
the server release to pass the client-owned Operations Center acceptance suite:
`npm run contract:check`, `npm run contract:oauth-discovery-live --
--resource-url "$BOS_MCP_RESOURCE_URL" --format json`, `npm run
contract:oauth-tool-auth-live -- --resource-url "$BOS_MCP_RESOURCE_URL" --tool
bos_get_context --format json`, and `npm run contract:oauth-live --
--authorize-url "$BOS_OAUTH_AUTHORIZE_URL" --format json`. Leave implementation,
review, merge, and deployment decisions to that
server-side agent. Return exactly one continuous Markdown prompt as the entire
server handoff response. Keep every contract requirement, command, and
acceptance criterion in that single copyable prompt.

## Preflight

1. Resolve the repository root, current branch, default branch, upstream, remotes, and complete status, including staged, unstaged, untracked, renamed, and deleted files.
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

## Create the release branch

1. Never push a release commit directly to the default branch. A merged release pull request provides an auditable release boundary and supplies Claude's organization-marketplace trigger when that distribution path is configured.
2. When the current branch is the default branch, create a release branch named `codex/release-v<next-version>` before changing version metadata. Preserve the complete current worktree when creating the branch.
3. When the current branch is already a non-default working branch, use it as the release branch when its upstream and intended default-branch target are unambiguous.
4. Stop if the release branch already exists locally or remotely and cannot be identified as the current release safely. Never delete, reset, or overwrite an existing branch.

## Create the release version

1. After preflight and initial change review, increment the repository release version before generating packages. Use the repository's native version command when it exists. In BOS Operations Center, run `npm run version:next` for the default patch release.
2. Default to a patch increment. Use a minor, major, or exact version only when the user or repository release policy specifies it.
3. Require the bump to update canonical package metadata, every active product manifest, and current-release documentation. Leave disabled products on their independent versions.
4. Treat generated client manifests and marketplaces as outputs of the canonical
   package build. Do not hand-edit generated copies. Do not create ZIP, tarball,
   customer-archive, or release-manifest artifacts.
5. If the worktree is clean, the new version itself is the release change. Do not skip the release or create an empty commit.

## Validate and build

Regenerate versioned client packages after the bump. Run the strongest
repository-defined credential-free local checks that are practical for the
complete release diff, including focused tests plus canonical package
validation. Do not invoke a live MCP release smoke or require a release OAuth
access token. Apply any repository-required review skill or approval contract
to the actual diff and evidence. GPT screenshots are post-release verification
and never block the source release or pull-request merge. Preserve the explicit
post-release acceptance command. When screenshot evidence is supplied, Oracle
must inspect it and author the hash-bound review receipt; file presence,
dimensions, or a PNG signature never complete client verification.

Run the repository-local Oracle remediation loop before committing:

1. Use `operations-center-review` on the complete release diff and validation
   evidence.
2. Submit that same complete diff and evidence to the repository-local `oracle`
   skill.
3. Require findings with exact file-and-line evidence and exactly one verdict:
   `APPROVED` or `REJECTED`.
4. Resolve every rejection with `operations-center-implementation`, rerun all
   affected validation, refresh the Vault index, and request a fresh complete
   Oracle review.
5. Continue until the literal verdict is `APPROVED`. Any mutation after approval
   invalidates that verdict and returns the release to this review loop.

- Fix failures caused by the pending changes when the correction is clearly within their scope, then rerun affected checks.
- Stop without committing or pushing when a required check still fails, a required external gate is unavailable, or a safe correction would materially change intent.
- Record commands and outcomes for the final report.

## Commit everything

1. Run `git add -A` only after review and required validation pass. This intentionally includes every modification, deletion, rename, and untracked file in the current repository.
2. Verify that the staged diff represents the reviewed change set and that no unstaged or untracked files remain. If new files appeared after review, inspect them and rerun relevant checks before staging them.
3. Infer a concise commit message from the complete diff and the repository's recent commit style. Do not amend, squash, rebase, skip hooks, or create an empty commit.
4. Create one commit containing the complete staged change set. If a commit hook changes files, inspect those changes, rerun relevant validation, stage the complete result, and create a new commit only when the original commit did not succeed.

## Publish through a pull request

1. Push the release branch to its configured upstream under the invocation's
   existing authorization. When no upstream exists, set one only when the
   release branch and a single intended remote are unambiguous. Push the full
   evolving, reviewed release payload without pausing for confirmation. Never
   ask a question and never force-push. For this repository, require the
   resolved push remote to equal
   `https://github.com/cody-marcel-dfsm/bos_operations_ceneter.git`; a mismatch
   is an unresolved target blocker rather than a reason to seek approval for a
   different destination.
2. Open a pull request from the release branch to the resolved default branch. The title must identify the new release version, and the body must summarize generated clients and validation evidence.
3. Wait for all required pull-request checks. Fix in-scope failures on the release branch, rerun affected local validation, push the correction, and wait again.
4. Merge the pull request under the invocation's existing authorization only
   after every required check passes and the repository reports that it is
   mergeable. Use a repository-supported merge method; GitHub must record the
   pull request as merged. Merge without asking a question, and do not bypass
   protections or required reviews.
5. Verify that the remote default branch contains the release version after the merge. For a connected Claude organization marketplace with **Sync automatically** enabled, this merge supplies its synchronization event.
6. Treat independent Claude marketplace publication as a separate host lifecycle. The merged commit makes the new version discoverable, while each account must refresh the marketplace through Claude's supported control. The publisher cannot force a refresh across independently added marketplaces.
7. Treat official Anthropic marketplace publication as a separate reviewed submission. A Git commit or pull request does not publish a new official-marketplace version.
8. Treat OpenAI publication as a separate host lifecycle. The merged commit makes the release available to the tracked Git ref, while private Codex marketplaces still require `codex plugin marketplace upgrade` and public ChatGPT/Codex directory releases still require submission and publication through the OpenAI Platform.

Push existing unpushed commits with the release commit only when they are part of the reviewed release branch and the pull-request target is unambiguous.

## Restore the default-branch workspace

After GitHub records the pull request as merged:

1. Switch the current workspace to the resolved default branch and fast-forward it from its configured remote. Never leave the workspace checked out on the merged release branch.
2. Verify the local default branch and its remote-tracking branch resolve to the same commit and that the worktree is clean.
3. Verify the release branch used by this invocation is an ancestor of the updated default branch, then delete that local release branch with the safe merged-branch deletion command. Delete only the release branch used by this invocation; preserve unrelated user branches.
4. Report a failed release cleanup when the workspace cannot return to the default branch, the branches differ, the worktree is dirty, or the merged local release branch remains. Do not call the release complete until these invariants hold.

## Report

After a successful merge and cleanup, report the previous and new release versions, pull-request URL and number, release commit, merge commit, source and default branches, remote destination, included file count, generated packages, validation/build results, and confirmation that the workspace is on a clean, current default branch with the merged local release branch removed. State which publication path was actually triggered: Claude organization sync, independent Claude marketplace availability, or neither. State that independent Claude account refresh, official Anthropic publication, Codex Git marketplace refresh, and public ChatGPT/Codex directory publication remain separate host-owned actions. If stopped, state the blocking evidence and leave the repository unchanged beyond clearly scoped fixes made before the blocker was known.
