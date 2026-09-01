# Codex BOS skill and tool exposure RCA

Status: fixed in 0.4.71; host verification pending
Date: 2026-09-01

## Executive conclusion

Codex did expose the installed BOS workflow skills. It did not expose the BOS
callable tools. The two surfaces load independently: `skills/` supplied the
instructions visible in the task, while the root MCP connection was responsible
for the callable tool catalog.

The durable regression began after commit `e46546c` successfully moved the
Education Center login to the root BOS plugin with
`plugin_asdk_app_6a7cb1cc330c81918aa63d96aeeaba91`. Later changes replaced
that proven identity and then removed `.app.json` for a direct `.mcp.json`.
Direct MCP receipt rendered a Platform server row; it never owned the separate
plugin-page Login display.

Release 0.4.70 repeated the direct-MCP implementation and therefore repeated
the missing Login defect. The accepted correction restores the exact proven
root BOS app declaration with `required: true`; every subservice continues
through that same root connection.

## Incident chronology

1. Commit `e46546c` moved the working Education Center app dependency to the
   root BOS plugin. The user observed BOS Login working with the exact
   `plugin_asdk_app_6a7cb1cc330c81918aa63d96aeeaba91` identity.
2. Later commits replaced the proven identity, then release 0.4.55 removed the
   registered-app declaration for direct `.mcp.json`. Releases 0.4.55 through
   0.4.64 inherited the missing Login display.
3. Release 0.4.65 restored `.app.json` with an optional replacement identity;
   the expected control remained absent. Release 0.4.66 added `required: true`
   without restoring the proven identity.
4. The desktop resolver returned HTTP 404 `Connector not found` for
   `asdk_app_6a932992592081919cdc88c60e4ff2dd`. Installed package caches and
   skills remained present, which made the failure look like missing skills.
5. The app owner identified and configured the replacement Platform draft
   `asdk_app_6a95a014a0a08191a9e6d16453a8b831`. Runtime verification still
   found no BOS callable catalog because the submission draft was not a
   published directory entry or a private developer-mode connection.
6. Release 0.4.70 returned to direct `.mcp.json`. Live UI showed the Platform
   row and still no Login, invalidating the claimed resolution.
7. Git history identified the exact working root BOS identity. The correction
   restores it and retains later identities only in bounded migration and
   cleanup allowlists.

## Five whys

1. **Why were BOS tools absent?** The task had no resolved BOS MCP connection,
   so no BOS callable manifest could be loaded.
2. **Why was Login absent?** The root plugin no longer declared the required
   registered BOS app that owns the display surface.
3. **Why did receiving the MCP server not fix it?** Transport receipt and Login
   display are independent client contracts.
4. **Why did release validation pass?** Tests asserted the direct MCP server
   and callable catalog while omitting the exact last-known-good app identity
   and plugin-page display contract.
5. **Why was the initial diagnosis confusing?** Commentary conflated skills,
   registered connections, OAuth, and tools, and the first review used the
   customer-packaged `bos:oracle` instead of this repository's local Oracle and
   Vault.

## Correct readiness model

Evaluate these layers independently:

1. **Install:** the marketplace and current product versions are registered.
2. **Skill load:** the current task exposes expected packaged workflow skills.
3. **Login display binding:** the root plugin contains the exact required BOS
   `.app.json`; subservices contain no transport binding.
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

- `products/bos/product.json` pins the exact proven root BOS app ID.
- `clients/codex/plugins/bos/.codex-plugin/plugin.json` points to
  `./.app.json`; the generated app file contains one required BOS identity.
- Package validation rejects direct-MCP-only output, optional or replacement
  identities, extra app fields, and subservice transports.
- Runtime verification reports registered-app state and callable-tool state
  separately.
- Installation migrates direct-MCP packages and both known replacement app
  identities to the proven BOS app and preserves unrelated state.
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
