---
name: operations-center-planning
description: Plan BOS Operations Center changes using current Vault architecture, issue history, package ownership, repository boundaries, validation, and mandatory Oracle review. Use for features, fixes, migrations, integrations, client packaging, and release proposals.
---

# Operations Center Planning

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


1. Read `AGENTS.md`, `Vault/docs/architecture.md`,
   `Vault/docs/CONSTITUTION.md`, and the relevant product manifests.
2. Run `python3 tools/vault_index.py sync --quiet` and query related designs,
   decisions, reviews, and issue history.
3. Read `Vault/docs/issues/ISSUE_HISTORY.md` and related conclusion records.
4. Identify the canonical source, every generated client consumer, contract
   tests, and the server-repository boundary.
   For BOS Codex connection work, the canonical authority is
   `products/bos/product.json`. Plan deterministic generation of the root
   plugin's `.mcp.json` and framework-derived OAuth discovery. Exclude
   `.app.json`, registered connector IDs, account registry lifecycles, and
   private connector API access.
5. Define positive, negative, regression, and live-client acceptance evidence.
   Scope server prompts using `AGENTS.md`; include client details only when
   they establish a required server contract. Select acceptance checks for
   the affected surface and keep client execution with its owner.
6. Place durable plans and specifications under `Vault/`.
7. Include issue-history maintenance and a final Oracle review of the actual
   implementation diff and validation evidence.
