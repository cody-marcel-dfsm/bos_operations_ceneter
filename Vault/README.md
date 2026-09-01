# BOS Operations Center Vault

`Vault/` is the canonical knowledge root for the BOS Operations Center package
repository.

## Structure

- `docs/` — architecture, constitution, decisions, reviews, and durable
  operational knowledge.
- `specs/` — feature specifications, implementation plans, and contracts.
- `schemas/` — schemas governing Vault records.
- `docs/issues/` — Oracle-owned active and resolved issue history.
- `index/chroma/` — rebuildable local Chroma vector data.
- `index/manifests/` — timestamped canonical-source/index snapshots.
- `tmp/<workflow>/` — disposable builders, logs, inspections, and other
  workflow intermediates.

Executable skills remain in `source/`, tests remain in `tests/`, generated
clients remain in `clients/`. Repository release workflows create no archive
artifacts.

## Lifecycle

Synchronize the local Chroma index and source manifest:

```bash
python3 tools/vault_index.py sync
```

Search canonical knowledge:

```bash
python3 tools/vault_index.py query "credential handoff"
```

Keep the index synchronized while editing Vault knowledge:

```bash
python3 tools/vault_index.py watch --daemon
```

The index is credential-free and local. It chunks Git-visible text sources,
stores vectors under `Vault/index/chroma/`, writes durable manifests under
`Vault/index/manifests/`, and excludes `Vault/index/` and `Vault/tmp/` from its
canonical source set.
