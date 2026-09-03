# Desktop private marketplace OAuth

## Status

Accepted and corrected on 2026-09-02 by
`2026-08-29-codex-package-owned-mcp.md`.

## Decision

Pre-publication Codex products are distributed through the repository's Git
marketplace. The root BOS package contains one generated `.mcp.json` remote
HTTP entry for `https://dfsm.ai/mcp/apps/bos/platform`. Codex derives OAuth
from that resource's discovery challenge. The package contains no independent
registered-app mapping or account connector identifier.

Claude uses an account-level Web connector. Copilot and Gemini use their
generated native MCP declarations. Subservice packages add workflows and
contain no additional BOS connection.

## Security

Packages contain no credentials, tokens, authorization headers, installed
application IDs, or private account-management code. BOS evaluates actor,
tenant, organization, application, installation, role, capability, provider,
and tool authorization for every private request.
