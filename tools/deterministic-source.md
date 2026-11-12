# Deterministic source maintenance

This portable repository-owned lane publishes narrowly scoped maintainer
instructions and its own verification controller. It contains no deployment-host
configuration. Controller, test and CI changes are executable maintenance with
complete negative tests, not a docs-only shortcut. The fixed allowlist rejects
all product/package/version changes and every out-of-scope intermediate commit,
including later reverts. Existing selected contracts cannot be overridden.
The validation contract tool, its document and its complete test module are in
scope; that test module is one of the fixed checks.

Owner direction of 2026-11-11: an executable maintenance range also carries its own
sealed Oracle spec (`tools/validation-selection.json`, see
`tools/validation-contract.md`); the lane admits that file and fails immediately
when it is missing, stale or mismatched. Documentation-only ranges need none.

Commit the source normally, then run:

```sh
python3 -B tools/deterministic_source.py validate --base FULL_REMOTE_MAIN_SHA --requested-at ORIGINAL_REQUEST_ISO_TIME
python3 -B tools/deterministic_source.py verify
python3 -B tools/deterministic_source.py push --ref codex/source-DESCRIPTION
```

Use lowercase letters/digits/hyphens in the review ref. Validation requires clean
committed source, installed locked dependencies, privacy/publication sanity and
the complete native negative-test module. It retains actual command outputs,
commit/tree, runtime/dependency/environment hashes and original request time in
private Git-local evidence. Failed/empty/skipped execution never passes; retries
retain the original clock and evidence. VERIFIED is not an Oracle approval.

Pushing that exact review ref starts the push-event Publication safety run. CI
independently executes the same scope checks and full category, without trusting a
supplied success status. Out-of-scope changes route to the existing product
contract. After the required Actions run succeeds, invoke:

```sh
python3 -B tools/deterministic_source.py merge --ref codex/source-DESCRIPTION --pr NUMBER
```

`NUMBER` is retained only as the caller's selector; no pull request is read or
merged and no `gh` CLI is used. The native consumer rechecks exact source, original
outputs and remote baseline, requires one push destination identifying this exact
public repository (its SSH URL or HTTPS identity), admits the exact ref and baseline
heads by `git ls-remote` and the exact-source push run and job by unauthenticated
public REST, then fast-forwards main with
`git push --force-with-lease=refs/heads/main:<base>` and reads it back. No
administrator bypass is used. Read back remote main and tree, fetch and
fast-forward canonical main, and report publication separately from any customer
release. This source lane grants no version bump, package distribution or live
production authority. Public maintainer docs use portable repository references;
private deployment-machine policies remain outside this repository.
