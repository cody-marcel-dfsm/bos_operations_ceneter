---
name: operations-center-implementation
description: Implement BOS Operations Center repository changes using its architecture, Vault, issue history, validation, repository boundary, and mandatory Oracle review requirements. Use for code, tests, skills, manifests, generated clients, documentation, and release changes in this repository.
---

# Operations Center Implementation

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


1. Read `AGENTS.md`, `Vault/docs/architecture.md`, and
   `Vault/docs/CONSTITUTION.md`.
2. Run `python3 tools/vault_index.py sync --quiet` and query related designs,
   decisions, and issue history before planning the change.
3. Read `Vault/docs/issues/ISSUE_HISTORY.md` and relevant conclusion records.
4. Inspect the current source, generated clients, tests, and dirty worktree.
5. Preserve unrelated user changes and the repository execution boundary.
   Apply the server-handoff scope in `AGENTS.md`: extract only requirements
   needed by the server owner and select acceptance checks for the touched
   contract. Client workflow instructions never expand server implementation.
6. Add focused positive and negative regression coverage before changing
   behavior when practical.
7. Implement in canonical sources and regenerate derived client packages through
   repository tooling.
   For Codex, generate the root plugin's `.mcp.json` directly from the product
   MCP resource. Reject `.app.json`, registered connector identifiers, and
   private account connector APIs. The host derives OAuth from the packaged
   resource and BOS discovery metadata.
8. Store durable architecture, design, issue, and implementation knowledge under
   `Vault/`; store disposable evidence under `Vault/tmp/<workflow>/`.
9. Run focused validation and every applicable package, contract, and release
   gate. GPT screenshots are post-release verification and never block source
   publication. Keep the version-matched screenshot and an
   Oracle-authored review receipt that binds its SHA-256 to the observed native
   action and surface; file presence alone is never acceptance.
10. Update issue history with root cause, resolution, evidence, and prevention
    guidance when the work fixes or materially reclassifies an issue.
11. Synchronize the Vault index after every Vault mutation.
12. Submit the complete actual diff and validation evidence to the
    repository-local `oracle` skill. Resolve every rejection and request a fresh
    review after each correction until Oracle returns `APPROVED`.

Report changed files, generated outputs, validation, issue-history updates,
Oracle verdict, and remaining risks.
