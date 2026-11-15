# Deterministic skill-package release

Owner-authorized correction: package source verification uses deterministic tests,
not model proposals or model approval. Historical Oracle records remain historical.
The distinct `boc-deterministic-package/1` VERIFIED receipt is not an Oracle verdict
or deployment authority. The existing source-maintenance lane retains its own scope.

The fixed `feedback-discovery-and-release-tool/2` profile covers the BOS connection
and feedback instructions, the exact feedback-contract and identity-context references,
the feedback-evidence and native-compatibility regressions, transitive skill version pins, generated consumers,
release versions, the version-bump script and the verifier's own implementation,
tests and CI wiring.

Amendment `/2` (owner-directed, 2026-11-04) adds exactly the BOS customer
initialization feature: the files of `source/platform/bos-customer-initialization`
(`SKILL.md`, `agents/openai.yaml`, `scripts/customer-profile.mjs`), the MCP
discovery-fallback instructions in `bos-plugin-settings-initialization/SKILL.md`,
`bos-plugin-console/SKILL.md` and `bos-mcp-client/references/identity-context.md`,
its test `tests/bos-customer-profile.test.mjs`, and a single
`platform/bos-customer-initialization` addition to `products/bos/product.json`
`includes` with no other product change. The fixed test set adds that test plus
the plugin console and plugin settings modules. It also admits owner-approved
repairs to stale tests, by exact path with a stated reason in
`STALE_TEST_REPAIRS`: workflow assertions made stale when CI moved to this gate,
reasoning-effort expectations superseded by the owner delivery policy, a renamed
lifecycle helper, and zombie-aware process termination. The publication safety
module joins the fixed test set. Two owner-approved tool fixes are admitted
(`tools/command_coverage.py`, `tools/oracle_approval.py`), and
`scripts/build-marketplace-update.mjs` accepts a published commit through Oracle
trailers or `python3 tools/deterministic_package.py verify-published --source SHA`,
which requires origin/main ancestry and the same exact-source release-branch CI
evidence that `promote` requires. Other skill behavior, runtime scripts, provider/credential
configuration, dependencies, contracts and existing selected validation contracts
are outside this profile. Unsupported scope fails closed and requires an explicit
profile amendment with corresponding complete tests. Nothing selects a model as a
fallback. Per-commit scope inspection retains reverted/out-of-scope source history.

Amendment `/3` (owner-directed Ada implementation, 2026-11-14) adds exactly
`source/platform/ada/SKILL.md`, `agents/openai.yaml`,
`references/turn-safeguards.md`, `scripts/turn-safeguards.mjs` within that skill,
`tests/ada-client.test.mjs`, and one `platform/ada` include in the BOS product.
The fixed category adds the Ada behavioral safeguards and generated-consumer
parity module. Its pure local helpers perform no execution or authorization;
existing transport, credentials, public API versions and service state ownership
remain unchanged. Unknown Ada files and unrelated product changes fail closed.
All earlier fixed tests, publication, privacy and exact-source custody remain.
This amendment verifies package source; live Ada operations, provider effects,
voice/SMS adapters and native host acceptance require independent runtime evidence.

Amendment `/4` (owner-directed graphical co-design, 2026-11-14) adds exactly
`source/platform/ada/scripts/journey-view.mjs`, its
`references/journey-view.md`, and `tests/ada-journey-view.test.mjs`. The fixed
category adds closed client-presentation model validation, deterministic inert
Mermaid/text rendering, bounded stdin CLI, injection/currentness/evidence tests
and five-host consumer parity. This grants no network, credential, execution,
service contract or delivery authority. All earlier checks remain required.

Amendment `/5` (owner-directed generic Ada runtime artifact, 2026-11-14) adds
exactly `source/platform/ada/references/behavior-core.md`,
`references/runtime-export.md`, `runtime-export.json` within that skill,
`scripts/lib/runtime-skill-export.mjs`, `scripts/export-runtime-skill.mjs`, and
`tests/runtime-skill-export.test.mjs`. Ada's host wrapper references its shared
host-neutral core. The fixed category adds exact dependency/file integrity,
closed entry-role inventory, explicit preview separation, production native
publication admission, tamper and five-host parity checks. Existing publication
ancestry/CI/history gates remain authoritative. No consumer source writer,
network API, credential change or source-only publication exemption is added.

Amendment `/6` (owner-directed item discussion facade, 2026-11-14) adds exactly
`source/platform/submit-feedback/scripts/item-discussion.mjs`, its
`references/item-discussion.md`, and `tests/feedback-item-discussion.test.mjs`.
The fixed category includes dynamic current-schema checks, false-by-default
trusted-host capability, item/scope isolation, atomic cursor/queue and explicit
consumer ACK, bounded replay/reconnect, gap recovery and committed comment ACK.
The existing feedback skill links the facade; its exact runtime dependency and
transitive skill pins remain validated. No socket implementation, credential
access, arbitrary URL dispatch, host companion extension, native wake or release
exemption is added. All earlier fixed categories remain required.

Amendment `/7` (owner-directed protected item socket source, 2026-11-14)
adds the exact protected companion feedback-socket/feedback-discussion-host modules,
the existing companion bridge/CLI/README and installer, the pinned ws vendor
bundle/license/provenance, its build script and entry, and
`tests/feedback-socket-host.test.mjs`. Exact paths are enumerated by the verifier.
The only dependency addition is build-only `ws@8.23.0` with its exact registry
integrity; its pure-JavaScript runtime is bundled with optional native extensions
disabled and installed under the same immutable file/mode inventory. The fixed
category adds vendor regeneration parity, existing notification host/installer
regressions and new header/item/scope/queue/retirement/socket acceptance. All
prior checks remain. No installed host change, enabled hook, live connection,
credential trust change or publication exemption follows from source validation.
The exact upstream ws MIT notice is classified as public legal attribution only
at its canonical vendor source path with SHA-256
`2b29dcfe0d6471f7e8c92c5fb38c9f93edee10330937055440192f1832b1ecef`.
Altered bytes, copied paths and all customer digest/phone checks remain enforced;
no domain/email allowlist or archive exclusion is introduced. The fixed category
adds the complete customer-data privacy and privacy-coverage modules. Its changed
policy identity receives a fresh complete scan, with zero old-policy bridge/reuse.
Existing signed transition authorization machinery is unchanged.
The owner-directed fresh-scan performance repair chunks normalized words into
bounded 128-word memo entries with seven-word overlap. Every one-to-eight-word
digest window, path/line boundary and all input bytes remain covered; existing
memory bounds and failure rules remain. The complete privacy suite compares
chunk boundaries against the original matcher. Its new policy digest receives
fresh full coverage without adopting old-policy passes or forged transitions.
SHA-256 uses Node's equivalent one-shot primitive when available, retaining the
original streaming fallback on earlier supported runtimes. Digest bytes and
all input/result identities remain identical; no phrase or file is skipped.
Each normalized phrase is extended directly instead of allocating a sliced
array for every digest; enumeration order changes only for an internal boolean
match and preserves the exact complete one-to-eight-word set and findings.

The version 7 profile preserves existing unpublished history when integrating the
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
