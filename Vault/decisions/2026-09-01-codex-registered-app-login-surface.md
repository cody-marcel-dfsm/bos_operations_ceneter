# Codex registered BOS app and native login surface

## Status

Accepted on 2026-09-01 and corrected on 2026-09-02 after the replacement-ID
attempt reproduced the regression. Supersedes
`2026-08-29-codex-package-owned-mcp.md` for Codex.

## Decision

`products/bos/product.json` is the sole authored source for the BOS product,
including its MCP resource URL, permanent Codex connector ID, lifecycle state,
mutable metadata, and retired accidental IDs. The established connector ID is
immutable. BOS has no identity-migration workflow.

Every Codex package and repository contract is generated from that product
file. The root BOS plugin declares `apps: "./.app.json"`; the app declaration
contains exactly the product-owned connector ID and `required: true`. The
package contains no direct `.mcp.json`. Subservice plugins contain neither app
nor MCP bindings and continue through the root BOS connection.

Established-product metadata updates pass the permanent connector ID to the
native update-in-place workflow, then read that same ID and prove the metadata
is current. A missing established record is a registry-integrity failure and
never authorizes a replacement. Connector creation is available only to a
distinct disabled product explicitly authored as `UNPROVISIONED_NEW`, whose
source name matches the requested product and whose retired-ID set is empty.
Such a candidate is excluded from active builds and contracts. Interrupted
creation is reconciled by its complete declared metadata fingerprint before any
retry.

The registered app declaration owns the plugin-page **Connect** or
**Reconnect** surface. Display is independent of connector metadata resolution,
connection inventory, grant validity, MCP receipt, and callable-tool discovery.
Those inputs select state and label; they never suppress the action.

## Evidence and reason

Commit `e46546c` converted the Education Center login to the root BOS app and
displayed the intended single BOS login. Later commits changed the ID, removed
`required: true`, and replaced `.app.json` with direct `.mcp.json`; at least ten
builds reproduced the missing action. The ad-hoc 2026-09-01 connector creation
minted another private “Created by you” product and still did not restore the
action. That replacement is retired evidence, not the product identity.

Connection receipt never satisfies the independent display contract. Package
shape, lifecycle behavior, and visual UI acceptance are validated separately.

## Consequences

- Generators, installers, cleanup tools, validators, and tests load product
  identity from `products/bos/product.json`.
- Cleanup preserves the permanent product record and deletes only explicitly
  retired accidental IDs using exact GET–DELETE–GET verification.
- Product maintenance uses deterministic inspect and update-in-place commands;
  new-product provisioning is explicit and retry-safe.
- Repository diagnostics log correlated, bounded, redacted request/response
  events by default while preserving machine-readable standard output.
- A release changing this surface requires a version-matched GPT screenshot
  showing the native BOS **Connect** or **Reconnect** action.
