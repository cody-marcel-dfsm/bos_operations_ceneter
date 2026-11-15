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

The bounded `/7` cold-scan repair additionally admits exactly
`scripts/lib/privacy-coverage.mjs`, `scripts/lib/privacy-scan-pool.mjs`,
`scripts/lib/privacy-scan-worker.mjs` and `tests/privacy-coverage.test.mjs`. Eight
fixed evaluation workers independently bind the same source/policy/rule identity;
only two input file reads are buffered, with eight-MiB worker bodies and bounded
worker heaps. Oversized inputs retain the complete direct scanner. The parent
alone signs atomic per-file content/context observations and sorts merged results.
No file, phrase, archive, customer rule or transition guard is omitted.

The measured four-worker cold category exceeded the lifecycle SLA. The fixed
CPU worker bound is eight on this ten-CPU/64-GiB validation host, retaining two
concurrent input reads, eight-MiB per-worker input bounds, and independent
384-MiB old/32-MiB young generation limits. No old-policy result is adopted
for this changed policy; full cold timing and the original breach are retained.

A second bounded exact-phrase boolean memo retains at most 65,536 entries and
four MiB of phrase characters per worker. Whole-generation reset avoids costly
per-entry deletion churn; misses always compute the original SHA-256 membership.
Matcher identity changes discard every cached result. Eviction/oversized-word,
mutated-rule and complete original one-to-eight-word equivalence tests remain
required, alongside the fresh full-policy cold category.

The `/7` scheduler preserves sequential vendor parity, regeneration, clean-source
and package checks, then invokes the identical privacy Node entry directly with
a private inherited readiness pipe. Privacy captures the complete current file
membership before sending a bounded nonce/source/tree/policy/count message.
Only after validating that message does the parent launch the fixed publication,
Node and Python suites concurrently. Their unique disposable fixtures cannot
enter the captured membership; the following scan still discovers new files.
Every command retains its original timeout, output, exit status and completeness
requirements. The parent records results in fixed category order, binds the
privacy result back to the snapshot, preserves every concurrent failure and
rechecks the complete candidate/runtime before issuing a receipt. Receipt
freshness compares maximum completion time across all commands. Missing, stale
or malformed readiness launches no dependent suite and prevents verification.

The measured parallel cold category retained all checks and took 192.59 seconds.
Its remaining bounded repair changes only window-memo eviction bookkeeping:
whole-generation reset replaces per-entry oldest-key iteration at the same
32,768-entry/four-MiB character bounds. Every cache miss still evaluates the
complete original phrase set; generation eviction and mutable-rule equivalence
remain tested. An immutable 4.3-MiB full-file diagnostic measured 5.54 seconds
with iterative eviction and 3.94 seconds with generation reset. This diagnostic
is evidence for the repair, while the complete fresh-policy cold category
remains the acceptance measurement. All prior timing breaches are retained.

An evaluated `/7` scheduling-tail correction dispatched the entire captured
membership by descending metadata size, with canonical path ordinal tie-break.
Two bounded metadata readers retain only sizes/ordinals; every actual byte/mode/
context snapshot is still independently captured at observation time. Completed
observations write/sign immediately, with no canonical-order write barrier or
body buffer. Only compact result records occupy their canonical ordinal slots.
All attempted independent errors are collected and rejected in canonical order;
no aggregate pass is emitted after any error. Missing metadata fails closed.
The exact input membership, two body-read bound, worker/body/heap bounds, original
phrase rules, FD admission and fixed category remain unchanged. Representative
long-tail timing, immediate-short-result durability and serial-equivalent
findings/content/context identities are required before one fresh cold category.

Bounded parent-persistence diagnostics bind explicit native privacy I/O settings
and preserve phase metrics for reads, context, input hashing, retained lookup,
worker evaluation, signing and atomic persistence. The native privacy process
starts with exactly `UV_THREADPOOL_SIZE=8`; policy applicability includes that
variable and the parent rejects a different reported value. The eight CPU
workers, two input readers, existing heap/body limits, immutable atomic signed
records and transition guards remain unchanged. A metadata-only persistence
queue was assessed against the original coupled path with controlled real-worker
and atomic-writer timing; its measured benefit governs final selection. All
experimental source remains recoverable in Git, with no publication or activation.

The initial I/O-only correction retained the original per-file await and atomic
record/pointer writes. Its tiny-input queue sample had no consistent gain; the
calibrated mixed-input assessment below controls the subsequent queue selection. Eight I/O threads are configured only in the
spawned native privacy validator before Node startup; the installed companion,
outer shell and other commands receive no tuning. Controlled coupled-path
samples measured 1.233 seconds at four threads and 1.024–1.083 seconds at eight
for 128 real worker/atomic-write observations. Phase durations are cumulative
and may overlap across files; the complete cold category remains the wall-time
acceptance. Effective I/O configuration is policy-bound and report-validated.

Calibrated mixed-input measurements replace the earlier tiny-file-only queue
assessment. At a worker/persistence ratio close to the full cold corpus, identical
input hashes and fresh worker pools measured 705–735 ms coupled versus 627–655 ms
with bounded parent persistence. The final parent queue therefore admits the
next evaluation after compact verified result metadata is enqueued: at most
eight active writers and eight waiting evaluator results, with no retained input
body. Findings above 64 KiB retain evaluator backpressure. Parent-only signing,
both original fsync/atomic write awaits, independent immutable per-input records,
canonical output/error order and all transition guards remain. Every pending
write settles before aggregate output; any failed write prevents PASS. Native
issuance and receipt verification reject missing, mistyped or overbound writer,
waiting, compact-metadata and I/O reports. Held-writer, pointer-custody failure,
unchanged orphan records, exact retry, large findings and input/context
comparisons remain required. Original weak/strong measurements and SLA breaches
are retained; one fresh-policy cold category decides the final wall-time result.

The final `/7` dispatcher restores canonical path FIFO and removes the size
preflight. Actual captured inputs (256 whole files, 25.9 MiB, proportional
origin/type/size strata, verified unchanged hashes, fresh worker pools and
independent stores) measured FIFO 3.32–3.45 seconds versus largest-first
3.74–3.80 seconds. A two-ended dispatcher measured 2.98–3.03 seconds, while FIFO
provides the smaller competitive correction and is retained. The original
heuristic and all weak/strong diagnostics remain in Git/private evidence.
Current required behavior remains bounded parent persistence, canonical result
and error order, immutable byte/mode/context snapshots, parent-only signatures,
unchanged atomic writes and a fully drained queue before any PASS. No size hint
controls scheduling or authority in final source. Canonical-order held-input
checks prove that later completed records persist immediately, and exact input/
context equivalence against the retired dispatcher remains required.

The bounded `/7` correctness repair additionally admits exactly the existing
shared-cache `source/host-runtime/bos-shared-cache/document-cache.mjs` and its
complete `tests/document-cache.test.mjs` suite. Only initial authority-mutation
lock publication changes: completed private 0600 JSON is linked atomically with
no replacement, preserving every token/PID/deadline/liveness/reclaim/heartbeat
check and corrupt-existing-lock failure. Controlled held-publication and losing
contender custody tests plus the existing stale-takeover/heartbeat/invalidation
regressions remain required. No cache schema or public API version changes.
Owned monotonic-duration diagnostics display microsecond precision (0.001 ms)
while preserving raw immutable native evidence, integers, bodies and hashes.
Classifier/phone rules and computation/deadline precision remain unchanged.

Amendment `/8` adds the exact Ada customer-onboarding consumer/reference, protected
customer-onboarding host module, and two named conformance modules enumerated in
the verifier. Existing companion CLI/bridge/installer inventories gain an explicit
disabled onboarding mode. Existing API-key custody can read fixed metadata only;
account execution requires a trusted existing linked OAuth port. No new login,
credential file, business MCP proxy or public API version is added. Runtime
schemas, exact platform audience/origin, current identity generation, stale and
uncertain state recovery and explicit current-subject confirmation are mandatory.
All prior /7 checks, sealed observations, privacy, publication history and
protected installation boundaries remain required. Native tests include actual
loopback HTTPS metadata headers and the closed existing-OAuth transport seam.

Amendment `/9` is the owner-directed preserved-history publication-readiness
repair. A two-parent integration may additionally use its first parent as the
resolution baseline when that parent uniquely descends from the exact published
base and the other parent shares an older published fork. Every unpublished
nonmerge edge remains inspected, including changes later reverted; every merge
resolution is classified. Unrelated, ambiguous dual-published/dual-descendant,
octopus, shallow, replacement-ref and grafted histories remain rejected. This
adds no witness, supplied-PASS mode, history rewrite or task-base publication.

The exact `LEGACY_FEATURE_PATHS` inventory covers five preserved feature edges:

- Automatic bound OAuth handoff: OAuth live-contract helper/test and the exact
  README paragraph transition; whole OAuth contract regressions retain direct
  redirects, bounded same-origin transaction-preserving handoffs, rejected human
  pages/foreign origins, provider account choice and rate-limit termination.
- Shared host identity: package guidance transformer, existing dependency/v1
  digest manifest, authentication-context/adapter skills and their exact
  references/adapter; existing handoff, adapter and package-model suites retain
  session multiplexing, current context isolation, no token export and 429/503
  retry gates. Existing dependency public identity/schema remains unchanged;
  only bound executable/bundle digests migrate.
- Retained criterion navigation: exact Oracle parallel helper and its full
  deterministic module retain every original locator, parent/input hash,
  current applicability, finding state and tamper rejection. These are synthetic
  wrapper tests; no model is invoked or adopts an approver role.
- Thrown notification retry gates: the same adapter, exact contract digests and
  complete journey-notifications suite preserve 429/503/Retry-After without
  sign-in or hidden replay, plus current execution-scope checks.
- Publication fixtures: the exact command-coverage, isolated cohort, API-version
  and performance fixtures and their complete named modules preserve input
  discovery, bounded process cleanup, public-version request and sealed native
  custody. The retired exact historical full-suite release command is recognized
  only as the prior migration input; the current fixed native command remains.

All `/8` checks remain. The fixed Python invocation additionally runs the full
command-coverage and Oracle-parallel modules; the fixed Node set adds the named
OAuth/adapter/notification/API-version/performance/cohort/history modules. The
ninth bounded category is `scripts/check-publication-history.mjs`, consuming the
native parent's exact source/publication base through validation-only environment
fields. It runs in the existing bounded pool after privacy membership capture;
all command results remain canonically ordered, completely settled and source
rechecked. Its complete source/base/inventory/policy PASS is checked at issuance
and receipt consumption. A path inventory alone grants no readiness.

The history guard scans every distinct unpublished changed path/blob, both merge
inputs and resolution bytes, including removed/reverted bodies. Exact base tree
pairs remain trusted. The existing full privacy decoder, customer digest rules,
ZIP/binary policy and unchanged shared credential patterns apply; archive entries
also receive the credential checks. Sequential input bodies are bounded to
16 MiB, inventories/archives are bounded and disposable archive copies are
removed. Errors and findings prevent PASS and expose only hashes/classifications.
No historical customer/secret exception, privacy exclusion or installed runtime
setting is added. The shared credential module is an import-only extraction from
the existing package checker with identical patterns and instruction treatment.
Native tests cover reverted side-branch secrets/customer content, merge-only
content, archive credentials, immutable input/policy identity and foreign proof.
Actual remote main must equal the final receipt base; genuine exact-source CI
and published-main ancestry remain required before production artifact admission.

The historical-content acceptance retains one exact public protocol-syntax
classification at `scripts/lib/runtime-skill-export.mjs`, Git blob
`7dab470bc8e3a1f647a2d2a5ec094e48be25f401`, SHA-256
`49ae97294c1c9e0b3fa09ca0dba20603e2d02685fa5a65aee3fc847f9b4db242`.
After verifying both raw hashes, relative path and exactly one occurrence, only
the public Git SSH transport user receives email-match classification. Original
bytes retain every credential/digest/phone check; the remaining email-bearing
bytes receive the unchanged decoder. This is no whole-blob exemption or domain
allowlist. Mutation, copied path and appended customer/credential tests preserve
ordinary rejection. The original fail-before history finding remains immutable.

The first complete `/9` run retained a FIFO acceptance race and a 271.81-second
sequential Python category. The FIFO test now watches only canonical published
record names while an explicitly incomplete `.publish-*` writer file remains
present; production atomic persistence and all assertions remain unchanged.
The same three complete Python modules now run in exactly three isolated
subprocesses after the existing privacy-readiness boundary. Each receives its
own private disposable `TMPDIR`; no outer shell or installed runtime changes.
Every module retains the original 300-second deadline, bounded process-group
cancellation/cleanup, and an eight-MiB combined output limit. Failure, timeout,
output overflow, skipped/empty tests or cancellation prevents aggregate PASS.
No module or criterion is omitted, including the complete original Oracle suite.

The parent joins all three modules and persists their original stdout/stderr
bytes independently, then emits byte-count-framed results in fixed module order.
Receipt issuance and consumption verify every frame/hash, exact module command,
positive complete test count, zero skips, fixed concurrency, source/tree and
runtime binding. Intervening source changes preserve all outputs and prevent
PASS. Actual process, private-temp, cancellation, timeout, output-bound, mixed
failure, malformed-frame and source/environment-tamper regressions remain fixed.
All original failed receipts and clocks remain; only a complete current-base
execution and exact verify can establish local source readiness. CI and actual
publication remain separate future effects.

The module-level parallel measurement passed every check but retained a
215.32-second Oracle module tail. Inspection found three self-contained Oracle
classes (34, 3 and 7 cases), each with independent per-test directories/context
cleanup and no module lifetime hooks. The final scheduler keeps each entire
class and its unittest order together. Those three classes and the other two
whole modules use one global three-process pool; there is no nested worker
increase. Oracle classes enter first to avoid deferring their measured tail.
Discovery seals all three full modules, exact source-file hashes and the
nonduplicated union of all case IDs. Added/missing classes, lifetime hooks,
duplicate/omitted IDs, changed files, unequal testsRun counts or changed
membership prevent PASS. Issuance and consumption independently rediscover the
same complete membership; no synthetic success summary substitutes for actual
cohort results. All original stdout/stderr frames and prior timings remain.

A separate measurement found 476 Git-show launches for 435 immutable commit/path
lookups (3.52 MiB), taking 10.61 seconds in one range classification. The bounded
scope reader now resolves the same explicit queries and captures one parent-owned
in-memory snapshot through Git's batch protocols. It rejects mutable/control-byte
queries, shallow/replaced/grafted history and unsupported object formats, and
checks each resolution, response order, blob type, bounded declared size, exact
body framing/EOF and raw Git hash. No shared file descriptor, authority cache,
source writer or historical witness is introduced. Raw byte equivalence,
malformed/order/type/size/hash/EOF, foreign-repository and changed-ref negatives
remain fixed. Current candidate/runtime/ref checks still control issuance and
consumption. Exact-candidate full-range verification remains required.

Amendment `/10` integrates the owner-requested Muse PR187 workflow display and
feedback guidance. Exactly `source/platform/bos-visual-output/SKILL.md`, its
`references/graph-rendering.md`, and `tests/muse-workflow-guidance.test.mjs` join
the existing profile. The full new module checks verified execution evidence,
transaction/attempt separation, partial evidence, host capability limits,
customer-scoped routing, discovery-only uncertain-result reconciliation and
five-host generated parity. Feedback remains within its existing admitted skill.
All /9 checks, history privacy, negative scope and publication custody remain.
This adds no route, customer authority, runtime effect or API version.

The /10 integration also admits two unpublished parents whose unique complete
merge-base is exactly the current publication base. It classifies resolution
against the explicit first parent and still inspects every unpublished edge on
both lines, including later removed content. Multiple/older ambiguous common
bases, two trusted published parents, octopus/replaced/grafted/shallow history
remain rejected. This preserves Muse attribution without rewriting either line.

Failure diagnostics retain original command output in private native custody and
print only failing fixed command ordinals, exit statuses, output hashes and at
most twenty bounded plain test locators. Failure bodies and unrecognized lines
remain private. This adds no public artifact upload or acceptance exemption.
