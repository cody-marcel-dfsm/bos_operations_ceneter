# Deterministic skill-package release

Owner-authorized correction: package source verification uses deterministic tests,
not model proposals or model approval. Historical Oracle records remain historical.
The distinct `boc-deterministic-package/1` VERIFIED receipt is not an Oracle verdict
or deployment authority. The existing source-maintenance lane retains its own scope.

The fixed `feedback-discovery-and-release-tool/2` profile covers the BOS connection
and feedback instructions, the exact feedback-contract and identity-context references,
the feedback-evidence and native-compatibility regressions, transitive skill version pins, generated consumers,
release versions, the version-bump script and the verifier's own implementation,
tests and CI wiring. Other skill behavior, runtime scripts, provider/credential
configuration, dependencies, contracts and existing selected validation contracts
are outside this profile. Unsupported scope fails closed and requires an explicit
profile amendment with corresponding complete tests. Nothing selects a model as a
fallback. Per-commit scope inspection retains reverted/out-of-scope source history.

The version 2 profile preserves existing unpublished history when integrating the
published main line. A two-parent merge must have exactly one parent that is an
ancestor of the exact publication base; its result is classified against that
trusted parent. Every unpublished nonmerge edge is still inspected, including
out-of-scope changes later reverted. Unanchored and octopus merges fail closed.
The only retired validation-selection exception is the exact path
`tools/validation-selection.json` with one of three immutable historical SHA-256
blobs pinned in the verifier, and only when absent from the final candidate tree.
Those bytes are historical evidence, never current or executable validation
contracts. Unknown selections, retained/reintroduced final selections, arbitrary
deletions and unrelated reference or test paths remain inadmissible. The complete
fixed category includes both mapped regressions and the verifier's full negative
suite; changed profile, commands, source or publication base invalidate readiness.

From clean committed canonical main, after fetching and integrating origin/main:

```sh
python3 tools/deterministic_package.py validate --base EXACT_PUBLICATION_BASE --requested-at ORIGINAL_REQUEST_ISO_TIME
python3 tools/deterministic_package.py verify
python3 tools/deterministic_package.py push --ref codex/release-vPACKAGE_VERSION
```

Validation regenerates all packages, requires an unchanged source tree, runs package,
privacy and publication sanity, the exact complete public contract/connection/context/
feedback/skill/version/package/parity test modules, and the verifier's complete native
negative-test module. Node and Python collections must be positive and complete,
with zero failures, cancellations, skips or TODOs. All outputs, including failures,
are retained under private Git-local custody. The receipt binds the committed
source/tree, complete publication range, executable/dependency/environment inputs,
fixed commands and original output bytes. Changed inputs, changed commands, unsafe
outputs or a subsequent failed execution invalidate readiness. No prior receipt is
rewritten or relabeled. If the original request time was not retained by the host,
use `--requested-at unknown`: the receipt preserves that absence and records
`BREACHED_ORIGINAL_TIME_UNAVAILABLE`, never a restarted clock or an SLA success.

Repository CI independently executes the same fixed profile on that exact release
branch, against the current main base. Under the user's existing release instruction,
publish with the existing authenticated Git transport:

```sh
python3 tools/deterministic_package.py promote --ref codex/release-vPACKAGE_VERSION
```

The promotion consumer verifies original local custody, exact destination/base/head,
and the latest successful repository-owned Actions run/job/fixed verification step
through the public GitHub API. It then performs an ordinary fast-forward main push.
The sole push destination must identify this exact GitHub repository using HTTPS
or its standard SSH URL. Existing host-managed Git authentication is reused;
credentials are never copied into source or command output.
It rereads remote main and requires the exact verified package commit.
No administrator override or protection change is permitted. Fetch and fast-forward
canonical main after publication; install through supported host release controls.
Remote CI is its own execution observation and supplies no original-task SLA proof.
Publication does not establish installation or native client acceptance.
An optional PR-based route remains available through `merge --pr NUMBER`; the
normal SSH route requires no GitHub CLI credential or model approval.
