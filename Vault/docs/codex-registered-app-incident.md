# Codex BOS skill and tool exposure RCA

Status: resolved in release 0.4.70
Date: 2026-09-01

## Executive conclusion

Codex did expose the installed BOS workflow skills. It did not expose the BOS
callable tools. The two surfaces load independently: `skills/` supplied the
instructions visible in the task, while the root MCP connection was responsible
for the callable tool catalog.

The tool failure came from packaging an OpenAI Platform public-submission draft
ID as though it were a resolvable private connection. The first embedded
`asdk_app_*` identity had been deleted and returned HTTP 404 `Connector not
found`. Its owner-controlled replacement was a valid Platform draft, yet it was
still absent from the signed-in Codex connector directory because draft
configuration and public publication are separate from private developer-mode
connection registration. Changing one draft ID to another could never make the
private Git package portable across customer accounts.

Release 0.4.70 removes that account dependency. The root Codex package now
distributes one credential-free `.mcp.json` pointing to the immutable BOS HTTPS
resource. Codex performs OAuth discovery for that resource, and every
subservice continues through the same root connection.

## Incident chronology

1. Release 0.4.65 changed Codex from a package-owned MCP declaration to an
   `.app.json` dependency to restore a plugin-page login surface. The app was
   initially optional, so the expected control was absent.
2. Release 0.4.66 added `required: true`. Package tests then proved only the
   shape of `.app.json`; they did not prove that the referenced identity
   resolved for a fresh signed-in customer.
3. The desktop resolver returned HTTP 404 `Connector not found` for
   `asdk_app_6a932992592081919cdc88c60e4ff2dd`. Installed package caches and
   skills remained present, which made the failure look like missing skills.
4. The app owner identified and configured the replacement Platform draft
   `asdk_app_6a95a014a0a08191a9e6d16453a8b831`. Runtime verification still
   found no BOS callable catalog because the submission draft was not a
   published directory entry or a private developer-mode connection.
5. Current OpenAI packaging guidance confirmed the split: `.app.json` references
   a registered connection, while `.mcp.json` distributes an MCP server with a
   plugin. A private developer-mode connection is created separately in the
   signed-in ChatGPT account; public submission is another lifecycle.
6. The repository restored its accepted package-owned MCP architecture,
   removed `codex_app_id` from product and portable contracts, regenerated all
   clients, and retained the two stale app IDs only in bounded cleanup
   allowlists so existing installations migrate safely.

## Five whys

1. **Why were BOS tools absent?** The task had no resolved BOS MCP connection,
   so no BOS callable manifest could be loaded.
2. **Why was the connection unresolved?** `.app.json` referenced an identity
   that the signed-in Codex connector resolver could not find.
3. **Why did changing the ID not fix it?** The replacement identified an
   OpenAI Platform submission draft, not a private developer-mode connection or
   published universal-directory plugin.
4. **Why did release validation pass?** Tests asserted the embedded ID and
   `required: true` shape. They lacked a portable-identity invariant and treated
   package presence as evidence for external directory resolution.
5. **Why was the initial diagnosis confusing?** Commentary conflated skills,
   registered connections, OAuth, and tools, and the first review used the
   customer-packaged `bos:oracle` instead of this repository's local Oracle and
   Vault.

## Correct readiness model

Evaluate these layers independently:

1. **Install:** the marketplace and current product versions are registered.
2. **Skill load:** the current task exposes expected packaged workflow skills.
3. **Connection load:** the root plugin contains one current credential-free
   `.mcp.json`; subservices contain no transport binding.
4. **OAuth:** the host completes protected-resource discovery and holds a valid
   resource-scoped grant.
5. **Callable discovery:** the refreshed manifest contains every
   product-declared verification tool.
6. **Execution:** `bos_get_context` and one bounded authenticated product read
   succeed.

Evidence from one layer never proves another. In particular, an installed
skill does not prove a callable tool, and a generated package cache does not
prove that the active task loaded its MCP catalog.

## Corrective controls

- `products/bos/product.json` contains no account or submission app ID.
- `clients/codex/plugins/bos/.codex-plugin/plugin.json` points to
  `./.mcp.json`; the generated MCP file contains one HTTPS resource and no
  credentials.
- Package validation rejects `.app.json`, extra MCP bindings, authorization
  headers, bearer-token environment variables, and subservice transports.
- Runtime verification reports package-owned MCP state and callable-tool state
  separately.
- Installation migrates both known stale app identities to the package-owned
  connection and preserves unrelated account or plugin state.
- OpenAI Platform submission drafts remain a publication lifecycle. They are
  never used as private package runtime identities.
- Architecture and release review use `.agents/skills/oracle` with the current
  local `Vault/`. Customer packages never contain an Oracle skill.

## Acceptance

Repository acceptance requires deterministic generation, focused package and
installer tests, `npm run release:check`, `npm run contract:check`, and a local
Oracle review of the actual diff. Live signed-in acceptance additionally
requires the current task to load the package-owned resource, complete OAuth,
discover every declared tool, resolve one canonical context, and complete one
bounded authenticated read.

Public OpenAI submission, domain verification, tool scanning, review, and
publication are separate release activities and do not control private Git
marketplace package identity.
