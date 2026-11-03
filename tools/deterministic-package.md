# Deterministic skill-package release

Owner-authorized correction: package source verification uses deterministic tests,
not model proposals or model approval. Historical Oracle records remain historical.
The distinct `boc-deterministic-package/1` VERIFIED receipt is not an Oracle verdict
or deployment authority. The existing source-maintenance lane retains its own scope.

The fixed `feedback-discovery-and-release-tool/1` profile covers the BOS connection
and feedback instructions, transitive skill version pins, generated consumers,
release versions, the version-bump script and the verifier's own implementation,
tests and CI wiring. Other skill behavior, runtime scripts, provider/credential
configuration, dependencies, contracts and existing selected validation contracts
are outside this profile. Unsupported scope fails closed and requires an explicit
profile amendment with corresponding complete tests. Nothing selects a model as a
fallback. Per-commit scope inspection retains reverted/out-of-scope source history.

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

Create the ordinary pull request for that exact pushed release ref. Repository CI
independently executes the same fixed profile against the actual PR head and base.
Then, under the user's existing release instruction:

```sh
python3 tools/deterministic_package.py merge --ref codex/release-vPACKAGE_VERSION --pr NUMBER
```

The merge consumer verifies original local custody, exact destination/base/head,
successful repository-owned Actions admission, and the normal matching-head merge.
The sole push destination must identify this exact GitHub repository using HTTPS
or its standard SSH URL. Existing host-managed Git authentication is reused;
credentials are never copied into source or command output.
It rereads remote main and requires its tree to equal the verified package tree.
No administrator override or protection change is permitted. Fetch and fast-forward
canonical main after publication; install through supported host release controls.
Remote CI is its own execution observation and supplies no original-task SLA proof.
Publication does not establish installation or native client acceptance.
