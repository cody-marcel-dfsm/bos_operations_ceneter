# Codex canonical Education Center binding review

- **Date:** 2026-08-11
- **Scope:** Enforce the canonical Education Center credential identifier in
  package source, generated clients, installer behavior, and the installed
  Codex MCP registration.
- **Controlling sources:** `Vault/docs/architecture.md`,
  `Vault/decisions/2026-08-11-education-center-product-identity.md`, and
  `products/education-center/product.json`.

## Findings

No material repository findings remain.

The installer now registers and inspects only the credential binding declared
by product metadata. It has no compatibility-alias table or fallback path. The
package checker rejects the retired product identity in tracked text and path
names, preventing its reintroduction into canonical source or generated
clients.

The installed Codex MCP registration, installed product metadata, and packaged
MCP declaration all use `EDUCATION_CENTER_BOS_API_KEY`. The preserved tenant
overlay continues to use `brand_display_name` for customer-facing terminology;
that parameter remains outside product and credential identifiers.

## Validation evidence

- `npm run build:artifacts`: passed and regenerated two active products and
  eight deterministic product archives.
- `npm run check:build`: passed.
- `npm run check`: package structure, generated parity, retired-identity gate,
  and credential scan passed.
- `npm test`: 121 passed, 0 failed.
- `git diff --check`: passed.
- `codex mcp get education-center --json`: enabled registration uses the
  canonical Education Center URL and declared credential binding.
- Installed client scan: the only customer brand occurrence is the intentional
  `brand_display_name` value in the preserved tenant settings overlay.

## Runtime transition

The global Codex configuration is canonical. A desktop process started before
this correction retains its launch-time environment until the user-approved
secure relaunch. The launcher must fetch the managed bearer into the declared
binding and strip every undeclared BOS credential from the new process.

APPROVED
