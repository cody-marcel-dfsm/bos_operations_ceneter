# BOS Operations Center

Canonical architecture: `Vault/docs/architecture.md`
Project constitution: `Vault/docs/CONSTITUTION.md`
Knowledge root: `Vault/`

## Customer installation routing

- This repository owns customer installation instructions for BOS Operations
  Center products across Claude, Codex, Copilot, and Gemini.
- Answer installation and upgrade questions from `README.md`, product
  manifests, and generated client packages in this repository.
- Lead with the paste-ready instruction for the customer's named client.
- Application repositories, including Lead Director, are outside the package
  installation dependency chain. Consult them only when the request explicitly
  concerns that application's server deployment or runtime implementation.

## Vault knowledge contract

- Store authored architecture, decisions, specifications, plans, review records,
  and durable project knowledge under `Vault/`.
- Store disposable workflow artifacts under `Vault/tmp/<workflow>/`.
- Keep executable source, tests, generated client packages, and release outputs
  with their owning components.
- Before knowledge-dependent architecture or review work, run
  `python3 tools/vault_index.py sync --quiet`.
- After changing Vault sources, run the sync again and verify that
  `Vault/index/manifests/latest.json` describes the current sources.

## Oracle review contract

- `bos:oracle` provides architecture guidance grounded in the current Vault.
- Repository-change approval requires review of the actual diff and validation
  evidence. Loading the skill alone grants no approval.
- Oracle findings identify exact files and lines and end with `APPROVED` or
  `REJECTED`.
- Application repositories may specialize the BOS Oracle with their own
  architecture and external approval services. Those services remain owned by
  the application repository.
