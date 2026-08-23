---
name: ship-it
description: Create the next repository release version, review and validate all current work, regenerate client packages, commit everything, and merge it through a release pull request. Use when the user says “ship it,” “send it,” or asks to release and publish the current work.
---

# Ship It

Complete the current repository's release loop. A successful invocation creates a new version even when the pending source change did not edit version metadata. The invocation itself authorizes the repository-native version bump, generated package updates, staging all current changes, one commit, creation of a release branch and pull request, and merging that pull request into the default branch. The merged version-bump pull request is the publication event used by the Claude organization marketplace GitHub sync. Do not request redundant confirmation.

## Preflight

1. Resolve the repository root, current branch, default branch, upstream, remotes, and complete status, including staged, unstaged, untracked, renamed, and deleted files.
2. Read the repository's applicable instructions and release/build documentation. Use its native review, validation, build, and release checks.
3. Stop before mutation when the repository is in a merge, rebase, cherry-pick, conflicted, or detached-HEAD state; when the default branch, push target, or pull-request target is ambiguous; or when completing the workflow requires credentials or authority the user has not provided.
4. Review the entire pending change set. Inspect untracked files before staging. Treat every existing change as user-owned and in scope for this invocation.
5. Block the shipment and report exact findings when the changes expose credentials or private data, contain a material correctness or security defect, include an obviously accidental large artifact, or conflict with repository instructions. Never discard or rewrite the user's work while resolving a blocker.

## Create the release branch

1. Never push a release commit directly to the default branch. Claude's organization marketplace sync recognizes a plugin version bump merged through a pull request.
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
to the actual diff and evidence.

- Fix failures caused by the pending changes when the correction is clearly within their scope, then rerun affected checks.
- Stop without committing or pushing when a required check still fails, a required external gate is unavailable, or a safe correction would materially change intent.
- Record commands and outcomes for the final report.

## Commit everything

1. Run `git add -A` only after review and required validation pass. This intentionally includes every modification, deletion, rename, and untracked file in the current repository.
2. Verify that the staged diff represents the reviewed change set and that no unstaged or untracked files remain. If new files appeared after review, inspect them and rerun relevant checks before staging them.
3. Infer a concise commit message from the complete diff and the repository's recent commit style. Do not amend, squash, rebase, skip hooks, or create an empty commit.
4. Create one commit containing the complete staged change set. If a commit hook changes files, inspect those changes, rerun relevant validation, stage the complete result, and create a new commit only when the original commit did not succeed.

## Publish through a pull request

1. Push the release branch to its configured upstream. When no upstream exists, set one only when the release branch and a single intended remote are unambiguous. Never force-push.
2. Open a pull request from the release branch to the resolved default branch. The title must identify the new release version, and the body must summarize generated clients and validation evidence.
3. Wait for all required pull-request checks. Fix in-scope failures on the release branch, rerun affected local validation, push the correction, and wait again.
4. Merge the pull request only after every required check passes and the repository reports that it is mergeable. Use a repository-supported merge method; GitHub must record the pull request as merged. Do not bypass protections or required reviews.
5. Verify that the remote default branch contains the release version after the merge. This merge is the event the Claude organization marketplace uses when **Sync automatically** is enabled for the connected GitHub marketplace.
6. Treat OpenAI publication as a separate host lifecycle. The merged commit makes the release available to the tracked Git ref, while private Codex marketplaces still require `codex plugin marketplace upgrade` and public ChatGPT/Codex directory releases still require submission and publication through the OpenAI Platform.

Push existing unpushed commits with the release commit only when they are part of the reviewed release branch and the pull-request target is unambiguous.

## Report

After a successful merge, report the previous and new release versions, pull-request URL and number, release commit, merge commit, source and default branches, remote destination, included file count, generated packages, and validation/build results. Confirm that the merged version-bump pull request emitted the Claude marketplace synchronization trigger. State that Codex Git marketplace refresh and public ChatGPT/Codex directory publication remain separate host-owned actions. If stopped, state the blocking evidence and leave the repository unchanged beyond clearly scoped fixes made before the blocker was known.
