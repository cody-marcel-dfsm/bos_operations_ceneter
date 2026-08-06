# BOS Operations Center Vault

`Vault/` is the canonical knowledge root for the BOS Operations Center package
repository.

## Structure

- `docs/` — architecture, constitution, decisions, reviews, and durable
  operational knowledge.
- `specs/` — feature specifications, implementation plans, and contracts.
- `schemas/` — schemas governing Vault records.
- `index/manifests/` — generated inventories of indexed Vault source bytes.
- `tmp/<workflow>/` — disposable builders, logs, inspections, and other
  workflow intermediates.

Executable skills remain in `source/`, tests remain in `tests/`, generated
clients remain in `clients/`, and release artifacts remain in `dist/`.

## Lifecycle

Synchronize the source manifest:

```bash
python3 tools/vault_index.py sync
```

Search canonical knowledge:

```bash
python3 tools/vault_index.py query "credential handoff"
```

The index is credential-free and deterministic. It inventories Git-visible
text sources and excludes `Vault/index/` and `Vault/tmp/`.
