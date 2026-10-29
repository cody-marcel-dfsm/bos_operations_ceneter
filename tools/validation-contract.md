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
| `bug_fix` | Sanity, the focused reproduction failing before the fix and passing after it, plus curated recurrence checks. |
| `deep_bug_fix` | The bug-fix checks and every relevant interaction selected by Oracle, including failure and recovery paths. |
| `feature` | Sanity, complete relevant interactions, thorough acceptance and curated recurrence checks. |

The catalog supplies class minima and the small regression registry. Oracle
chooses exact planned test files and supporting fixture paths under `tests/` for focused,
interaction and acceptance categories;
commands do not accept name filters or silently expand to a full system suite.
Unknown impact expands scope. User input, interface, authentication, authorization,
security and prompt-injection boundaries receive the appropriate full scrutiny.
Preserve independent source, privacy and publication gates.

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
