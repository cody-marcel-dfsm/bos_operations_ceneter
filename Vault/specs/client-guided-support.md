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
   run, require exact destructive authorization, automatically delete the
   retired developer-owned **Created by you** account app through the authenticated
   ChatGPT connector resource before removing local state, delete no unrelated client or source
   state, create no backup, verify account, registry, and filesystem absence,
   and refresh the authenticated account catalog. When ChatGPT/Codex Desktop is
   running, schedule a forced restart after reporting success so stale process
   state cannot be persisted again and no manual restart is required. Preserve the
   root repository marketplace manifests because they are package source and the
   Git URL installation entrypoints. Preserve generated installable catalogs under
   their client package roots. Remove deprecated personal BOS and Education skill
   copies only after their exact directory and declared skill identities match the
   migration inventory. Preserve unrelated personal and system skills.

## Composition

Canonical source lives at `source/platform/bos-guided-support`. The BOS product
manifest composes it into generated Codex, Claude, Copilot, and Gemini packages.
Runtime-product skills may invoke it from the installed BOS foundation product.
Generated copies remain build outputs.

Portable workflow ownership follows the same product model. BOS composes reusable
business capabilities from `source/capabilities` plus BOS visual output from
`source/platform`. Education Operation Center composes camp capacity, local school
market research, and partnership proposal workflows from
`source/verticals/education-center`; installed Education workflows may invoke the
BOS product's visual output without republishing that platform skill. Codex-only
repository maintenance workflows live under `.agents/skills` and are excluded from
customer packages.
