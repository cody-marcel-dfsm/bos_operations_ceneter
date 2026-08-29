# Client guided support

## Purpose

The BOS foundation package composes the tenant-neutral `bos-guided-support`
skill so a user can receive installation, connection, and how-to help before a
BOS MCP tool is callable. The support skill must remain useful from client-side
package evidence, screenshots, and official vendor documentation alone. Live
MCP context and read tools strengthen verification when available.

## Contract

1. Model onboarding as separate Install, Load, Register, Sign in, Discover, and
   Verify stages. Advance only from observed evidence.
2. Give one exact next action and expected result at a time. Prefer annotated
   screenshots and compact progress visuals over long prose.
3. Use the user's current UI as primary visual evidence and current official
   client documentation as the external reference. Label vendor examples.
4. Keep BOS installation, BOS OAuth, and underlying provider authorization
   distinct.
5. Never request, display, or persist a BOS key, token, authorization code,
   secret-manager name, installed-app ID, raw authority identifier, provider
   secret, or customer record.
6. Use only package-owned named resources. Client guidance never constructs or
   changes an MCP endpoint and never grants tenant authority.
7. Confirm success with one canonical server context and one bounded,
   authenticated product read when MCP exists. Missing MCP must not prevent
   client-side diagnosis or recovery guidance.
8. Preserve unrelated plugins and connections during repair. Escalations carry
   only sanitized client, package, stage, error, attempted-action, expected, and
   observed evidence.
9. When a user explicitly requests complete local removal, use the
   repository-owned all-client uninstaller. Inspect its identity-bounded dry
   run, require exact destructive authorization, delete no unrelated client or
   source state, create no backup, verify registry and filesystem absence, and
   restart running clients to discard in-memory catalogs.

## Composition

Canonical source lives at `source/platform/bos-guided-support`. The BOS product
manifest composes it into generated Codex, Claude, Copilot, and Gemini packages.
Runtime-product skills may invoke it from the installed BOS foundation product.
Generated copies remain build outputs.
