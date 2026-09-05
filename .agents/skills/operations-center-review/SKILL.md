---
name: operations-center-review
description: Review BOS Operations Center repository changes against its architecture, constitution, issue history, client-package contracts, repository boundary, tests, and release gates. Use for diffs, pull requests, documentation, skills, generated clients, and release readiness.
---

# Operations Center Review

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
   `Vault/docs/CONSTITUTION.md`, and `Vault/docs/issues/ISSUE_HISTORY.md`.
2. Run `python3 tools/vault_index.py sync --quiet` and query the Vault for the
   touched behavior and related regressions.
3. Inspect the complete actual diff and focused validation evidence.
4. Verify package ownership, server-repository boundaries, tenant and authority
   scope, one BOS connection, and client/server contract separation.
5. Verify canonical-source to generated-client parity, deterministic generation,
   version consistency, extension preservation, and credential-free artifacts.
   For BOS Codex connection changes, verify `products/bos/product.json`
   deterministically generates one `.mcp.json` remote HTTP entry, the plugin
   manifest references it through `mcpServers`, OAuth discovery targets BOS,
   and no `.app.json`, registered connector ID, account lifecycle, or private
   connector API remains.
6. Verify positive, negative, regression, and live-client evidence required by
   the touched surface. GPT screenshots are nonblocking post-release evidence;
   preserve their acceptance commands while allowing source publication.
   Inspect supplied screenshots visually and require an
   Oracle-authored review receipt that binds the exact screenshot SHA-256,
   product version, client surface, and observed native action. A PNG signature
   or file size never proves visual acceptance.
7. Verify durable rules, issue history, and resolution guidance are current in
   the Vault and present in the Chroma index.
8. Report findings first with exact file and line evidence.
9. End with exactly one verdict: `APPROVED` or `REJECTED`.

Return `APPROVED` only when no material finding remains. A repository mutation
after review requires a fresh complete review.
