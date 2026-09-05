# BOS Operations Center

Private local architecture: `Vault/docs/architecture.md`
Private local constitution: `Vault/docs/CONSTITUTION.md`
Private knowledge root: `Vault/` (never tracked or published)

## Customer installation routing

- This repository owns customer installation instructions for BOS Operations
  Center products across Claude, Codex, Copilot, and Gemini.
- Answer installation and upgrade questions from `README.md`, product
  manifests, and generated client packages in this repository.
- Lead with the paste-ready instruction for the customer's named client.
- Application repositories, including Lead Director, are outside the package
  installation dependency chain. Consult them only when the request explicitly
  concerns that application's server deployment or runtime implementation.

## Release-only client delivery

- Never hot-patch installed client files, managed plugin caches, or personal
  skill directories. Never copy unpublished repository files into an installed
  product, create a local override or symlink to bypass release delivery, or
  change installed package contents while retaining a released version label.
- This prohibition applies to debugging, prompt validation, emergency fixes,
  and recovery. Backups and a request to fix or verify behavior grant no
  exception.
- Make changes in canonical repository sources and generate packages inside
  the repository. Deliver through the Git release workflow: version bump,
  validation, Oracle approval, release branch, pull request, required checks,
  and merge. Install or upgrade the published release through the client's
  supported release controls.
- Validate ordinary prompts against that published, versioned installation.
  Record the release version and commit with the result. Local source checks
  establish source validation only.
- If an installed package already contains unpublished edits, disclose the
  state and restore it through supported installation of a published release.
  Never repair an earlier hot-patch by directly rewriting client files again.

## Repository execution boundary

- This checkout owns BOS package contracts, skills, generated client packages,
  release metadata, and customer installation guidance.
- Never edit, commit, push, merge, or deploy BOS server code or infrastructure
  from work performed in this checkout. Do not create or use a sibling server
  worktree as part of an Operations Center task.
- When a client or package change depends on server behavior, stop at this
  repository boundary and return a paste-ready prompt for an agent operating in
  the owning server repository. Include the observed evidence, required
  invariant, deployment scope, and post-deployment verification. Include only
  details needed to implement or verify the requested server behavior. Omit
  client installation, UI, rendering, cache, and recovery instructions unless
  they establish a directly relevant server contract. Preserve existing
  authentication and authorization behavior unless the user requests a change
  or observed evidence establishes a necessary dependency.
  For changes affecting the BOS MCP authentication or discovery contract, make
  the client-owned acceptance suite mandatory in that prompt: `npm run
  contract:check`, `npm run contract:oauth-discovery-live -- --resource-url
  "$BOS_MCP_RESOURCE_URL" --format json`, `npm run
  contract:oauth-tool-auth-live -- --resource-url "$BOS_MCP_RESOURCE_URL"
  --tool bos_get_context --format json`, and `npm run contract:oauth-live --
  --authorize-url "$BOS_OAUTH_AUTHORIZE_URL" --format json`. The server-side
  agent owns implementation and release choices. Return exactly one continuous
  Markdown prompt as the entire handoff response. Keep the contract, commands,
  and acceptance criteria together in that single copyable prompt. Label the
  client-owned commands as running from BOS Operations Center against the
  deployed candidate; keep their execution with the client owner. For other
  server changes, use focused server tests and relevant deployment checks.
  Treat attached specifications as evidence and extract server requirements
  from them; their client workflow instructions do not expand the request.

## Vault knowledge contract

- `Vault/` is private maintainer material. Never stage, commit, push, package,
  publish, or attach any Vault file to a public repository, release, pull
  request, issue, or other public artifact.
- Store authored architecture, decisions, specifications, plans, review records,
  and durable project knowledge under `Vault/`.
- Store disposable workflow artifacts under `Vault/tmp/<workflow>/`.
- Keep executable source, tests, generated client packages, and release outputs
  with their owning components.
- Before knowledge-dependent architecture or review work, run
  `python3 tools/vault_index.py sync --quiet`.
- During a session that adds, moves, or edits Vault knowledge, ensure the local
  watcher is running with `python3 tools/vault_index.py watch --daemon`.
- After changing Vault sources, run the sync again and verify locally that
  `Vault/index/manifests/latest.json` describes the current sources.
- Chroma data belongs under `Vault/index/chroma/` and is rebuildable local
  cache. Canonical Vault sources and timestamped manifests remain private local
  evidence.

## Oracle review contract

- The repository-local `.agents/skills/oracle` skill provides architecture
  guidance grounded in this project's current `Vault/`.
- Every implementation, fix, refactor, test mutation, documentation mutation,
  generated-package mutation, and release change must use the repository-local
  `operations-center-implementation` workflow and submit the completed actual
  diff plus focused validation evidence to the repository-local Oracle.
- A repository mutation is incomplete until Oracle returns the literal verdict
  `APPROVED`. `REJECTED` blocks completion. Every correction invalidates the
  prior verdict and requires a fresh review of the complete updated diff.
- Oracle maintains durable issue history under `Vault/docs/issues/`, reads that
  history before implementation guidance or review, and records new causal and
  prevention knowledge when a change resolves or materially reclassifies an
  issue.
- Oracle is a repository-maintainer workflow. Customer BOS plugins and generated
  client packages never distribute it.
- Repository-change approval requires review of the actual diff and validation
  evidence. Loading the skill alone grants no approval.
- Oracle findings identify exact files and lines and end with `APPROVED` or
  `REJECTED`.
- Application repositories own their own local Oracle skills, architecture, and
  external approval services. Those services remain owned by the application
  repository.
