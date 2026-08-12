# Codex Education Center registered-app binding review

## Scope

Review the `0.4.23` package change that replaces the Codex Education Center
headless MCP declaration with a host-managed OpenAI app connection while
preserving Claude's direct remote MCP declaration and the existing tenant,
application, installation, role, and provider boundaries.

## Defect confirmed

The `0.4.22` Codex plugin declared `mcpServers: "./.mcp.json"`. Codex enabled
that entry as an unauthenticated headless server and did not associate the
plugin detail page with a connection. The result was `Auth: Unknown` and no
Connect control.

## Implementation reviewed

- Registered `https://dfsm.ai/mcp/apps/leaddirector/education-center` as the
  development app `asdk_app_6a7cb1cc330c81918aa63d96aeeaba91`.
- Added `codex_app_id` to canonical product metadata and fail-closed validation
  for active Codex runtime products.
- Generated Codex `apps: "./.app.json"` with one required Education Center app
  and removed Codex `.mcp.json` and `mcpServers` output.
- Preserved Claude's credential-free `.mcp.json` Streamable HTTP adapter.
- Added installer validation, rejection of mixed app/direct-MCP packages, and
  migration of the obsolete unmanaged direct-MCP layout.
- Updated customer installation and authentication-recovery guidance.
- Rebuilt and reinstalled `bos` and `education-center` version `0.4.23`; the
  active Codex configuration contains no standalone `education-center` MCP
  registration.

## Validation evidence

- ChatGPT plugin registration displayed Connect and discovered OAuth for the
  registered app.
- BOS Google sign-in resolved the Cherry Creek organization, exposed the
  Director role, and reported Calimatic SIS enabled.
- `npm run check`: passed.
- `npm run check:build`: passed.
- `npm test`: 130 of 130 tests passed.
- `node --test tests/package-model.test.mjs`: 40 of 40 passed.
- `node --test tests/installer.test.mjs`: 44 of 44 passed.
- Release archives were generated deterministically for `0.4.23`; the customer
  ZIP checksum is
  `45de3fb20a15cffe739b6f077cfa78779f4673aa1b7b0511f51c9f52a0423ba1`.
- The current bundled plugin-validator rejects the `required` app field on this
  package and on OpenAI's installed Gmail package. Host installation and the
  repository's schema validation accept the field, so this is recorded as a
  validator-schema mismatch rather than a product failure.

## Live release gate

The deployed BOS application currently rejects the MCP agent handoff after
organization and role selection with `Authenticated BOS session is required`.
The credentialed director smoke also could not run because
`EDUCATION_CENTER_BOS_API_KEY` and `EDUCATION_CENTER_SMOKE_TIME_ZONE` are absent
from this process. Release remains gated on a server-owned handoff repair,
successful `bos_get_context`, and a bounded
`education_center_list_enrollments` result. The package must continue to report
authentication-required state and fail closed until that gate passes.

## Review result

The repository diff preserves application neutrality, tenant isolation,
explicit registered-app scope, credential containment, and client-specific
adapter ownership. The package implementation is approved for commit. Live
release approval remains withheld pending the server gate above.

APPROVED
