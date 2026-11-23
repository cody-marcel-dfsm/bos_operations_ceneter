# Deterministic actual Oracle source and export

The closed `portable-actual-oracle/1` profile produces
`boc-deterministic-oracle/1` native `VERIFIED` evidence. It is source/export
verification, with no completed-source model approval or deployment authority.
The existing source-maintenance and skill-package lanes retain their own scopes.

The literal source inventory admits only the selected core, compatibility
entrypoints, exporter, public templates, native controller/catalog/CI wiring and
selected tests/fixtures. The core runtime inventory has 44 paths; the public
archive contains exactly 31 members, including the generated export manifest.
All unpublished history edges are checked, including reverted changes. Unknown
paths, source symlinks, product/dependency/version edits and changes to other
catalog profiles or existing package aliases refuse admission.

From committed canonical main, with the current genuine proposal spec and
publication base, run:

```sh
python3 -B tools/deterministic_oracle.py validate --artifact-only --base 9e817aed58bb85f2799204c70d84b4cac181db58 --requested-at ORIGINAL_REQUEST_ISO_TIME
python3 -B tools/deterministic_oracle.py verify --artifact-only
```

The compatible dispatcher is `tools/deterministic_package.py --profile oracle`.
Existing invocations without that explicit profile retain their existing behavior.
Public CI detects the closed Oracle range before choosing the older lanes.

Native verification executes every current sealed category through the maintained
native contract producer. It binds complete committed inputs, Node dependencies,
existing Chroma Python distribution bytes, cached embedding bytes and environment;
original selected output and execution records remain private. Missing runtime or
cache is setup failure, with no implicit installation, download or paid fallback.
`ORACLE_PUBLIC_PYTHON` may explicitly name the installed Python runtime.

One immutable-commit export is verified and extracted for the cohort. Tests share
`ORACLE_PUBLIC_EXPORTED_ROOT`, `ORACLE_PUBLIC_SHARED_STATE` (the exported config's
`.oracle` state) and the explicit Python. The first Chroma check owns construction;
benchmark and standalone tests reuse the same declared synthetic corpus/index.
The original 31 source members remain byte-identical. Generated index/operation
state is private and never enters the archive. Standalone Python runs isolated
from ambient Python source paths. Every exported test module must execute with
positive complete totals, no skips or expected failures.

The actual conceptual proposal is mandatory in native mode. Exactly one genuine
`native_cli` completed operation must bind the exported source/tree/core/config,
public example proposal, configured engine/model/executable and admitted runtime.
Its original process must exit successfully within 90 seconds under its explicit
capability restrictions. Synthetic test-adapter receipts never substitute. A
truthful proposal rejection remains distinct from an execution failure. Original
model input/output/process records stay private; the deterministic receipt binds
their hashes. No model assesses completed source.

Public CI produces the separately typed `boc-deterministic-oracle-ci/1` result
`CI_ONLY`. Its projection removes exactly the native-only live-proposal module
and executes every other selected module unchanged, including actual Chroma,
export and benchmark checks. It makes no provider call and claims no native model
proof. The CI result cannot satisfy native verification or publish by itself.
Dependency/cache setup, when expressly enrolled, is a separate governed CI step;
the validation runtime itself never provisions missing inputs.

Receipts bind the export map, exporter, archive, every member, standalone inputs,
original outputs and current selected contract. Verification rereads those bytes,
reconstructs the owned cohort and rechecks source/runtime/environment. Changed or
substituted evidence and a later failure for the same candidate invalidate
readiness. Old receipts and failures remain intact. Original request time and
late/unknown timing stay visible; there is no restarted delivery clock.

The owning release agent publishes OC source through:

```sh
python3 -B tools/deterministic_oracle.py push --ref codex/source-oracle-DESCRIPTION
python3 -B tools/deterministic_oracle.py promote --ref codex/source-oracle-DESCRIPTION
```

Promotion requires both the complete current native proof and successful
exact-source repository-owned Publication safety CI. It rechecks the single OC
push destination, exact leased main baseline and review ref before an ordinary
fast-forward main push. Intent is persisted before effects; uncertain outcomes
are read back and never blindly replayed. This command publishes OC source only.
Creating or publishing the independently generated Oracle distribution remains
with its separately authorized artifact owner and target, outside this profile.

## Component artifact purpose

The current requested public delivery uses explicit `--artifact-only` mode. Its
original feature component base is exactly
`9e817aed58bb85f2799204c70d84b4cac181db58`, spanning the entire component through
the current committed candidate rather than only the latest proposal amendment.
The full native receipt retains `status: VERIFIED` with
`verification_scope: COMPONENT_ARTIFACT_VERIFIED` and `source_publication: false`.
It separately records actual OC origin/main observation and makes no source-sync
or upstream-promotion claim. The canonical OC source pin may still be unpublished.

The independent artifact publisher consumes the verified archive/manifest/native
proof handoff and publishes only the generated 31-member artifact with fresh
history. Its own allowlisted `.github/workflows/ci.yml` runs all four public test
modules and the actual labelled synthetic benchmark, using the same pinned public
dependency/cache setup and zero model/provider credentials. Public CI and anonymous
artifact readback remain separate required delivery evidence.

OC `push` and `promote` reject an artifact-only receipt before any effect, even if
origin later reaches the component base. No previous source-range requirement,
predecessor publication, source profile or protection is waived. The source
publication commands above apply solely to a separately verified source-range
receipt and its exact real origin baseline.
