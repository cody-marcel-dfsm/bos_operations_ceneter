# Issue #0001 conclusion: Codex BOS login display regression

- Status: source correction complete; GPT UI visual acceptance pending manual install
- Resolution version: 0.4.71 candidate
- Date: 2026-09-02
- Category: Codex product identity, package binding, and login display
- Related incident: `Vault/docs/codex-registered-app-incident.md`
- Negative client evidence:
  `Vault/evidence/codex-login/0.4.71-missing-connect-current.png`

## Symptom

The BOS plugin and skills appeared installed while its detail page exposed no
native **Connect** or **Reconnect** action. Later diagnostics incorrectly tied
display to connection, metadata, or callable-tool availability. A failed repair
also created a second private “Created by you” BOS product with a new ID.

## Root cause

Commit `e46546c` converted the working Education Center login into one root BOS
login. Later changes replaced that working product identity, removed the
required app declaration, and used a direct MCP binding. At least ten builds
carried one or more parts of that regression. An ad-hoc account connector POST
then minted another ID and changed generated package files to follow it.

The tooling allowed this because identity, resource metadata, generated
contracts, cleanup IDs, and tests were spread across several files. A calling
agent could choose an account-creation path instead of the established-product
update path. Connection receipt and metadata resolution were also treated as
evidence for the separate plugin-page display contract.

## Correction

`products/bos/product.json` is now the single authored product authority. It
contains the permanent established connector, MCP resource URL, immutable and
mutable lifecycle policies, and retired accidental IDs. There is no identity
migration.

All client packages and root contracts are generated from that file. The Codex
package contains one required root `.app.json` declaration and no direct
`.mcp.json`. Subservices contain no separate connection declaration.

Established metadata synchronization requires the permanent ID, updates that
record in place, and post-reads the same ID before success. HTTP 404 is a
registry-integrity failure; authentication and registry outages remain distinct
failures and never create a replacement. The account API boundary converts the
package-facing `plugin_asdk_app_*` form to the raw `asdk_app_*` connector path,
and tests prove both accepted inputs inspect the same URL. A new ID can be created only for a
different disabled product explicitly authored as `UNPROVISIONED_NEW`, with a
matching requested source name and no retired IDs; retry first reconciles its
complete declared metadata fingerprint.

Cleanup preserves the permanent record, deletes only product-declared retired
IDs, verifies each exact record is HTTP 404 afterward, never installs, and is
idempotent. Repository diagnostics emit correlated, bounded, redacted
request/response logs by default.

## Verification

- Generated `.app.json`, `.bos-product.json`, cross-client MCP artifacts, and
  both contracts match `products/bos/product.json`.
- Regression tests cover immutable identity, update-in-place and post-read,
  package-to-account ID normalization, distinct registry failures, explicit
  new-product creation, interrupted-create reconciliation, retired-only cleanup,
  and a second cleanup run.
- `npm run build:packages`, `npm run check`, and `npm run contract:check` pass.
  The complete repository run passes 277 of 279 tests. Its two failures are the
  separately owned Issue #0001 plugin-detail screenshot and Issue #0002
  request-time chat screenshot gates. Issue #0001's source, lifecycle, cleanup,
  package-shape, contract, and Antigravity tests all pass; the explicit Issue
  #0001 evidence verifier reports the exact missing artifact.
- The final host acceptance artifact is a version-matched screenshot showing the
  native BOS **Connect** or **Reconnect** action after the user manually installs
  the candidate. Oracle visually inspects it and authors a matching review
  receipt binding its SHA-256, version, surface, and observed action. The source
  task does not operate the GPT client.

## Prevention

- Start every product operation from `products/bos/product.json`.
- Generate identity-bearing artifacts and contracts; never author them by hand.
- Use established inspect/update commands for BOS maintenance.
- Use explicit `UNPROVISIONED_NEW` provisioning only for a different disabled
  product with a matching requested source name and no prior IDs; reconcile its
  complete metadata before retry.
- Treat display, metadata, connection, OAuth, tool discovery, and execution as
  independent acceptance layers.
- Require Oracle review of the actual diff and validation evidence after every
  repository mutation.
- Bind visual acceptance to an Oracle-inspected screenshot hash and explicit
  observed **Connect** or **Reconnect** action; image format alone never passes.
