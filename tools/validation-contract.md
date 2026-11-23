# Fixed change validation

The independent proposal chooses the executable contract before implementation.
Its approved selection is written to `tools/validation-selection.json` and bound
to the original proposal/review hashes, base commit/tree, catalog and Node runtime.
Commit that generated selection with the authored work; do not write a selection
or claim Oracle approval yourself. A later revision names the prior contract hash
and requires a new native proposal. Old contracts, results and failures remain in
native history. Source, catalog, command, fixture or runtime changes require fresh
matching execution or an explicitly approved revision.

| Class | Required execution |
| --- | --- |
| `docs_only` | Minimal whitespace, privacy and publication sanity for genuine documentation changes. Executable skills, instructions or source require another class. |
| `bug_fix` | Sanity, the focused reproduction failing before the fix and passing after it, without integration or automatic broader regression. |
| `deep_bug_fix` | The bug-fix checks and every relevant interaction selected by Oracle, including failure and recovery paths. |
| `feature` | Sanity, complete relevant interactions, thorough acceptance; select curated recurrence checks only for an evidenced risk. |

The hard end-to-end limits are `docs_only` 120 seconds, `bug_fix` 180 seconds,
`deep_bug_fix` 300 seconds and `feature` 300 seconds. The build host owns the
original request admission clock, including upload, network, validation, build,
deployment and live verification when applicable; these source-only repositories
finish at verified remote Git publication. Retries, revisions and handoffs retain
`request_started_at` and `deadline_at`; they never start a fresh clock. A late
completion is an SLA failure, never a reported pass or a partial pass. Local
category results are phase results and cannot certify end-to-end completion.
Record an overrun as `BREACHED` with the original clock and measured phases on the
review receipt and release report and correct it as an architecture defect. The
Oracle approves or rejects on correctness and complete validation; a recorded
breach alone is no rejection finding (owner direction, 2026-11-23).

Rank and pare the relevant checks before Oracle freezes the executable contract,
then execute every selected check completely. A small `bug_fix` uses only sanity
and its small deterministic fail-before/pass-after reproduction, with no
integration or automatic broader regression. Authentication, security, cross-area
or uncertain impact requires `deep_bug_fix` and the complete relevant interactions.
The small curated regression registry is opt-in for a demonstrated recurring risk,
not an automatic addition to every change. Feature acceptance remains thorough
within its selected impact. The authenticated platform JEV ranking seam may help
classify and prioritize; it never supplies authorization or replaces Oracle.
Use low reasoning for simple documentation and small bugs, medium for hard/deep
changes and features; medium is the maximum. The native launcher bounds inherited
higher settings. No paid inference fallback is authorized.

The catalog supplies class minima and the small regression registry. Oracle
chooses exact planned test files and supporting fixture paths under `tests/` for focused,
interaction and acceptance categories;
commands do not accept name filters or silently expand to a full system suite.
Unknown impact is classified as deep work before scope is fixed. User input, interface, authentication, authorization,
security and prompt-injection boundaries receive the appropriate full scrutiny.
Preserve independent source, privacy and publication gates.

## Sealed Oracle spec — owner direction, 2026-11-11

The approved contract is the self-contained implementation spec
(`boc.validation-contract/v2`, `kind: oracle-spec/1`). Beside the fields above it
holds `selection.acceptance` (publishable criteria), `selection.acceptance_tests`
(`module`, `covers` criterion indices, `purpose`; every criterion covered by a
selected focused/interactions/acceptance test), a `stamp` (`engine`, `model`,
`oracle_sha256` over the Oracle skill, output schema, `tools/oracle_approval.py`,
`tools/validation_contract.py` and `tools/oracle_spec_seal.py`, `host`, UTC `time`,
`origin_main`, `request_sha256` or null, `proposal_sha256`) and `seal`:
`sha256(b"oracle-spec/1\0" + json.dumps(contract_without_seal, sort_keys=True,
separators=(",", ":"), ensure_ascii=False, allow_nan=False))` from
`tools/oracle_spec_seal.py`. The seal is a sanity check, not security. Sealing
refuses secret-like text and local absolute paths; proposal and request text enter
only as digests. The proposal fetches `origin/main` first and refuses when `HEAD`
does not contain it.

`python3 tools/validation_contract.py gate --base <publication base>` admits a
documentation-only range without a spec and otherwise fails immediately unless the
candidate's spec was sealed within that range, recomputes and covers every changed
path. `ci` additionally runs the spec's selected commands. Local lane admission also
requires the exact spec to match an APPROVED native proposal record in
`.git/oracle/proposals/`. A current v1 contract is superseded only by a native
revision naming its `contract_sha256`; nobody reseals a contract by hand.

The proposal launcher runs `--engine claude|codex|auto` (or `BOC_ORACLE_ENGINE`).
Claude runs `claude -p --output-format json --json-schema` with `--restricted`,
`--strict-mcp-config` and only Read, Grep and Glob; inputs outside the checkout,
such as the declared family authority, arrive as hash-bound prompt copies.

## Feature design approval

### Bounded additive native proposal revisions

`npm run oracle:proposal -- --delta ...` uses a closed internal delta response.
The parent captures the intact prior contract, current commit/tree and exact Git
path/test inventories. Their immutable hashes are schema constants. The reviewer
returns only added criteria, selected modules/fixtures and coverage of the new
criteria. The parent retains all earlier criteria, categories, fixtures, mapping
purposes and original criterion/module pairs, and materializes a full literal
scope from the prior scope, captured source changes and newly selected tests.
Unknown paths, missing/wrong hashes, replay, source movement, removal and changed
old mapping purposes reject. No glob or supplied whitelist expands that scope.
Added tests and fixtures must exist in the captured source tree. Initial designs
with future planned files retain the full proposal mode.

The response schema fixes each binding property with a scalar constant, requires
every key and permits no additional properties. Complete binding equality is
checked independently at intake. This preserves the exact closed binding while
supporting the provider's scalar-constant schema subset. Non-feature deltas carry
null design; feature design and test-plan validation remain required. Incompatible
model responses are retained as intake failures and receive no normalized approval.

Current capture uses the same native publication-scope resolver as full-range
review and admission. Its inventory includes every pending published-base-to-tree
path, including older foreign changes and deletions. Retained reviewed patterns
materialize only finite tracked membership from the bound publication baseline
and candidate trees. The existing inventory hash commits to that exact membership
and the resolved baseline, destination and binary range projection; the parent
stores the projection in its normalized audit. No caller or model selects another
baseline. Current enrollment recaptures native scope before materialization.
Historical audits without this projection retain their original local-base path
hash semantics. Both original raw binding shapes remain reconstructible after
the remote advances; replay verifies their original immutable observations and
never grants them a widened inventory or fresh approval.
The parent also binds a matching canonical APPROVED/COMPLETE native prior
proposal archive. A sanity seal alone cannot start this mode. For an earlier
closed response that bound only the exact prior contract, consumption establishes
its actual native prior archive independently and reconstructs the same original
selection/audit. Old raw responses, seals and receipts remain unchanged; absent
or altered prior proof rejects. New responses carry the archive hash explicitly.

The raw independent response and normalization/input hashes remain in native
custody. Only a genuine APPROVED/COMPLETE response reaches the existing seal;
receipt consumption reconstructs the same materialization and prior projection.
The final `oracle-spec/1` contract format and deterministic source gates remain.
Ordinary full proposal responses also bind their prior revision digest as a
schema constant, avoiding model transcription of immutable references.

Native reviewer processes continuously drain both private streams with a combined
eight-MiB bound. A private progress record reports elapsed time and byte counts,
without source or output bodies. The 180-second reviewer limit yields an
INCOMPLETE checkpoint with original bounded output and cleans up only the
registered process group. Timeouts and output bounds never create approval.
Original clocks, failures and complete-source verification remain required.

A feature design includes a test plan. A `feature` selection names its design
`.md` file in `design`, and the plan sits beside it as `<design>.test-plan.json`:

```json
{
  "kind": "boc.feature-test-plan/v1",
  "feature": "What the feature does",
  "design": "Vault/docs/design/example.md",
  "design_sha256": "<SHA-256 of the exact design bytes>",
  "runtime_paths": ["source/example.mjs"],
  "tests": [
    {"module": "tests/example.test.mjs", "covers": ["source/example.mjs"], "purpose": "What it proves"}
  ]
}
```

The Oracle refuses to seal a feature contract, whatever its proposal verdict, when
the plan is missing or malformed, names another design or another revision of this
design, covers a runtime path outside the selected scope, leaves a runtime path
without a test, or names a test that is not selected in `interactions` or
`acceptance`. This is a deterministic shape check in
`tools/validation_contract.py`; no model judges plan quality. The sealed contract
keeps the design and plan hashes. Planned tests may be written after approval, but
a candidate that lacks one fails contract verification, and a changed design or
plan needs an explicit revision wherever those files are available.

For a bug, first commit the selected test/fixture and the generated contract while
leaving implementation source at its approved baseline. Capture the original
failure with `python3 tools/validation_contract.py run --category focused --phase
before`. An assertion failure in a complete nonempty test run is required; a
missing executable, syntax error or timeout is not reproduction. Keep those test
bytes unchanged for the after run; changing the acceptance test requires a new
explicit contract/reproduction.

Run each selected category through `oracle:validate`, for example
`npm run oracle:validate -- -- python3 tools/validation_contract.py run --category
focused`. The runner executes the exact selected command, captures immutable
source/catalog/runtime/output identities and requires the complete TAP totals:
positive tests, all passed, zero skipped/todo/cancelled. A zero exit code alone is
insufficient. The full selected set must pass for the exact current tree before
source review; later failures supersede earlier passing attempts for admission.
Implementation and `release:check` use those same category commands. CI imports
only the existing independently approved, exact-source native command evidence or
executes those same commands; it cannot invent a partial green result.

The initial catalog/tooling bootstrap retains its original already-approved
proposal and existing broad checks because its base predates this selector. Once
the catalog exists in a proposal base, absent selection is a hard error. This
transition is not a permanent fallback for ordinary new work.

The regression registry is a reviewed recurrence set, not an archive of every
feature test. Each entry names the recurring boundary and reason for retention;
adding or removing one changes the catalog identity and requires review. Feature
acceptance remains scoped to the feature and is not automatically promoted into
regression. Local source validation does not prove live-client acceptance.

New proposal seals declare `--test-concurrency=1` in every selected Node command.
The file list, supporting fixtures and actual case requirements remain exact.
Verification recognizes only the complete canonical bounded vector or the exact
complete legacy vector of an immutable historical seal; mixed or arbitrary
options reject. Current deterministic package admission requires the bounded
vector and its genuine proposal origin. Updating the command producer never
rewrites an old seal or supplies a new decision through manual resealing.

### Interrupted native output custody

Native executions retain actual binary stdout/stderr reads before forwarding them
into the existing supervisor. Each private run beneath
`.git/oracle/validation-contract-results/` binds the selected command, source/tree,
fixtures, runtime, environment digest and directory identity. Immutable numbered
chunks and final stream manifests bind every byte, order, size and digest. These
bodies stay private; publication carries existing metadata/digests only.

A signal, missing completion manifest, changed member, substituted directory or
source mismatch remains incomplete or failing. Successful summary input keeps
legacy stdout-then-stderr order. Existing original records retain their pinned
legacy digest checks; new stream fields receive full custody validation when
present. Current package profile19 requires complete native stream witnesses.
CI continues to execute the exact sealed vectors directly. The original900second
category guard and explicit file concurrency one remain unchanged.
