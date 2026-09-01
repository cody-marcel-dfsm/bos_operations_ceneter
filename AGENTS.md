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

## Repository execution boundary

- This checkout owns BOS package contracts, skills, generated client packages,
  release metadata, and customer installation guidance.
- Never edit, commit, push, merge, or deploy BOS server code or infrastructure
  from work performed in this checkout. Do not create or use a sibling server
  worktree as part of an Operations Center task.
- When a client or package change depends on server behavior, stop at this
  repository boundary and return a paste-ready prompt for an agent operating in
  the owning server repository. Include the observed evidence, required
  invariant, deployment scope, and post-deployment verification. Make the
  client-owned acceptance suite mandatory in that prompt: `npm run
  contract:check`, `npm run contract:oauth-discovery-live -- --resource-url
  "$BOS_MCP_RESOURCE_URL" --format json`, and `npm run contract:oauth-live --
  --authorize-url "$BOS_OAUTH_AUTHORIZE_URL" --format json`. The server-side
  agent owns implementation and release choices. Return exactly one continuous
  Markdown prompt as the entire handoff response. Keep the contract, commands,
  and acceptance criteria together in that single copyable prompt.

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

- The repository-local `.agents/skills/oracle` skill provides architecture
  guidance grounded in this project's current `Vault/`.
- Oracle is a repository-maintainer workflow. Customer BOS plugins and generated
  client packages never distribute it.
- Repository-change approval requires review of the actual diff and validation
  evidence. Loading the skill alone grants no approval.
- Oracle findings identify exact files and lines and end with `APPROVED` or
  `REJECTED`.
- Application repositories own their own local Oracle skills, architecture, and
  external approval services. Those services remain owned by the application
  repository.
