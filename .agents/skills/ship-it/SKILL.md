---
name: ship-it
description: Review, validate, build, commit, and push every uncommitted change in the current Git repository. Use when the user says “ship it,” “send it,” or explicitly asks to commit all current work and push it to the configured remote.
---

# Ship It

Complete the current repository's delivery loop. The invocation itself authorizes staging all current changes, creating one commit, and pushing the current branch. Do not request redundant confirmation.

## Preflight

1. Resolve the repository root, current branch, upstream, remotes, and complete status, including staged, unstaged, untracked, renamed, and deleted files.
2. Read the repository's applicable instructions and release/build documentation. Use its native review, validation, build, and release checks.
3. Stop before mutation when the repository is in a merge, rebase, cherry-pick, conflicted, or detached-HEAD state; when the push target is ambiguous; or when completing the workflow requires credentials or authority the user has not provided.
4. Review the entire pending change set. Inspect untracked files before staging. Treat every existing change as user-owned and in scope for this invocation.
5. Block the shipment and report exact findings when the changes expose credentials or private data, contain a material correctness or security defect, include an obviously accidental large artifact, or conflict with repository instructions. Never discard or rewrite the user's work while resolving a blocker.

## Validate and build

Run the strongest repository-defined local checks that are practical for the change, including focused tests plus the canonical build or release validation when declared. Apply any repository-required review skill or approval contract to the actual diff and evidence.

- Fix failures caused by the pending changes when the correction is clearly within their scope, then rerun affected checks.
- Stop without committing or pushing when a required check still fails, a required external gate is unavailable, or a safe correction would materially change intent.
- Record commands and outcomes for the final report.

## Commit everything

1. Run `git add -A` only after review and required validation pass. This intentionally includes every modification, deletion, rename, and untracked file in the current repository.
2. Verify that the staged diff represents the reviewed change set and that no unstaged or untracked files remain. If new files appeared after review, inspect them and rerun relevant checks before staging them.
3. Infer a concise commit message from the complete diff and the repository's recent commit style. Do not amend, squash, rebase, skip hooks, or create an empty commit.
4. Create one commit containing the complete staged change set. If a commit hook changes files, inspect those changes, rerun relevant validation, stage the complete result, and create a new commit only when the original commit did not succeed.

## Push

Push the current branch to its configured upstream. When no upstream exists, set one only when the current branch and a single intended remote are unambiguous. Never force-push. Never change branches merely to make a push succeed.

If the worktree is already clean, do not create an empty commit. Push existing unpushed commits only when the invocation clearly targets the current branch and the upstream is unambiguous.

## Report

After a successful push, report the commit hash, subject, branch, remote destination, included file count, and validation/build results. If stopped, state the blocking evidence and leave the repository unchanged beyond clearly scoped fixes made before the blocker was known.
