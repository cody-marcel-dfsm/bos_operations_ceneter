# Oracle

Oracle turns a conceptual implementation proposal into a bounded, sealed implementation specification. It selects context from an explicitly configured public corpus, keeps retrieved text separate from trusted project policy, and invokes an explicitly selected read-only model CLI. Deterministic validation checks the returned structure and the existing `oracle-spec/1` seal.

The source is maintained in the public Operations Center repository. This export is prepared from its canonical committed input before upstream source promotion; the source pin records bytes and makes no upstream-promotion claim. This distribution contains an exact committed allowlist with its Apache-2.0 license, original NOTICE and source/member hashes in `oracle-export-manifest.json`. It contains no product packages, private project knowledge, operational history or credential configuration.

## Requirements

The core supports Python 3.12 or 3.13. The hash-locked dependency environment targets Linux x86_64 Python 3.13.5; local development can reuse an already configured compatible Chroma runtime. Use an existing embedding cache and an existing authenticated Codex or Claude CLI for a live proposal. A separately declared CI setup may install the hash-locked binary dependencies and verify the public model archive before tests. Offline `CI_ONLY` validation proves that bounded path; full publication verification separately requires the actual model-adapter demonstration. Indexing refuses missing dependencies or cached embedding files; it never installs packages or downloads a model automatically. Model usage belongs to the user's selected CLI account. Unsupported runner capabilities fail closed before model invocation. No provider credentials are stored here.

The example selects Codex explicitly. Review `oracle.project.json` and supply your own project-owned policy, catalog, public corpus, state directory and model selection. All configured paths resolve inside the configuration's project root. Start with the synthetic example included here.

```sh
python -m oracle_core.cli index --config oracle.project.json
python -m oracle_core.cli proposal --config oracle.project.json --proposal examples/proposal.txt --output .oracle/spec.json
```

A conceptual proposal run can return APPROVED, REJECTED, ERROR or UNCERTAIN. Inspect the result, its exact configuration/context/model evidence and its specification. The specification describes required implementation and tests; it grants no deployment authority and performs no implementation or completed-source model review. A seal detects inconsistent bytes and is not a signature or security boundary.

An uncertain run retains its operation identity. Use the explicit recovery command to inspect that operation; do not repeat a model invocation automatically.

```sh
python -m oracle_core.cli recover --config oracle.project.json --operation OPERATION_ID --output .oracle/spec.json
python -m unittest discover -s tests -v
```

## Retrieval benchmark scaffold

```sh
python benchmarks/run.py --config oracle.project.json --labels benchmarks/public_cases.json --output .oracle/benchmark.json
```

This command runs actual local Chroma retrieval over the declared synthetic corpus. It records measured timing, returned sources/distances, independently authored expected source labels and exact corpus/configuration/embedding identities. The labels describe these small examples only. There is no Meko backend, comparative result, model-quality score, spec-quality estimate or demonstrated improvement in this foundation. First-pass outcomes, reference use, regression labels and downstream defect attribution require independently observed implementation events and separate integration work. An offline or test fixture must always retain its synthetic/replay label.

## Boundaries

Keep private policy, source, feedback, prompts, execution records and credentials outside any public export. The example policy is trusted configuration; retrieved corpus text is untrusted evidence. Corpus content cannot select executable commands, filesystem scope, model capabilities or publication authority. Generated state and model output live under the ignored `.oracle` directory. Publish only a separately verified, curated public corpus.

Copyright and modification attribution remain in LICENSE and NOTICE. The generated manifest identifies the exact originating public source commit, source tree, export map and member bytes.

## Independent repository CI

The included read-only workflow explicitly provisions Python 3.13.5, hash-locked binary dependencies and the hash-verified public embedding cache. It runs all four standalone test modules with zero skipped/expected-failure cases and the actual synthetic-corpus retrieval benchmark. It uses no model calls, secrets or private maintainer profiles. Its result verifies the exported artifact and public fixtures; native model-adapter acceptance and upstream source promotion remain separately evidenced outcomes.

The generated manifest records the exact export `source_commit` and `source_tree`
separately from `origin_main`, the reachable baseline frozen in the source's
sealed generation input. The raw generation spec stays private. A proposal for
an owning Git project binds that project's HEAD/tree and fetched reachable
`origin/main`; an admitted extracted artifact uses its frozen manifest triple.
The installed tool's source commit remains separate from the reviewed project's
source identity. These records establish provenance without claiming upstream
promotion or a model evaluation.
