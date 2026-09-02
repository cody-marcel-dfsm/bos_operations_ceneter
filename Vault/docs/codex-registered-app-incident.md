# Codex BOS skill and tool exposure RCA

Status: active; the immutable connector record is missing and the current GPT
plugin page exposes no Connect/Reconnect action
Date: 2026-09-01

## Authoritative 2026-09-02 correction

`products/bos/product.json` is the sole active product authority. Its established
connector ID is immutable, its metadata is mutable in place, and its retired IDs
are cleanup evidence. There is no identity migration. The 2026-09-01 attempt to
create and adopt another private connector was a failed repair that produced the
duplicate “Created by you” BOS product. Any later section describing that
replacement as the live or canonical identity records interim evidence and is
superseded by this correction and the Issue #0001 conclusion.

The source correction generates every identity-bearing client artifact and
contract from the product file, restores one required root `.app.json`, removes
the second authored runtime URL file, and gives established maintenance and new
product creation separate deterministic workflows. One 0.4.71 attempt rendered
Connect and opened `auth.openai.com/about-you`; the later clean install again
rendered no action. The external record that carries the BOS MCP resource is
absent in both reproductions.

## Failed registry recovery attempt

On 2026-09-01 an account-side diagnostic used the native ChatGPT
connector-settings contract to create a replacement metadata record for
`https://dfsm.ai/mcp/apps/bos/platform` with automatic connection disabled.
ChatGPT returned `asdk_app_6a97966a296c8191a5f9b937e7650be3`. Its exact GET
returned HTTP 200, `plugin/read` resolved friendly BOS metadata, and
`plugin/install` reported it under `appsNeedingAuth`. No OAuth link endpoint was
called.

That operation was still a failed repair: it minted a second private BOS
product, changed the product identity, and did not restore the native action.
The replacement is a retired accidental ID in `products/bos/product.json`.
The package and generated contracts derive the permanent established ID from
that product authority. Connector lookup or downstream request failure may
select state and label; it never controls Connect/Reconnect visibility.

## Executive conclusion

Codex did expose the installed BOS workflow skills. It did not expose the BOS
callable tools. The two surfaces load independently: `skills/` supplied the
instructions visible in the task, while the root MCP connection was responsible
for the callable tool catalog.

The package regression began after commit `e46546c` successfully moved the
Education Center login to the root BOS plugin with the exact last-known-good
technical identifier
`plugin_asdk_app_6a7cb1cc330c81918aa63d96aeeaba91`. The package declaration,
host cache, and connector route used that same complete prefixed value. Later
changes replaced the proven identity and then removed `.app.json` for a direct
`.mcp.json`.
Direct MCP receipt rendered a Platform server row; it never owned the separate
plugin-page Login display.

Release 0.4.70 repeated the direct-MCP implementation and therefore repeated
the missing Login defect. The first 0.4.71 candidate restored the historical
root BOS wrapper, but its connector metadata had already been deleted. The
current 0.4.73 source candidate restores the permanent established ID from
`products/bos/product.json` with `required: true`; every subservice continues
through that same root connection. The independent GPT display
contract remains: render first, then use connection and grant state only to
select **Connect** or **Reconnect**. Metadata, connection-inventory,
initialization, and tool-discovery request failures are recovery inputs; none
may remove the action.

Comparison with official build 26.825.41651 shows the same plugin-detail
filter and call site as 26.825.51511. The renderer defect was already latent.
The concrete account-state trigger occurred on 2026-08-29 when the obsolete
all-client uninstaller executed `plugin/uninstall` for the installed 6a932
created-by-me BOS wrapper before its following remote-delete call failed 404.
The current app-server now marks every historical BOS identity missing.

## Incident chronology

1. Commit `e46546c` moved the working Education Center app dependency to the
   root BOS plugin. The user observed BOS Login working with the exact
   complete `plugin_asdk_app_6a7cb1cc330c81918aa63d96aeeaba91` technical
   identifier. Commit `16b44bc` had replaced the bare `asdk_app_6a7cb...` form
   after that earlier declaration failed connector resolution.
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
7. Git history identified the exact root-login package shape and permanent
   working identity. The final correction restores both from
   `products/bos/product.json`. Replacement IDs minted during failed repairs are
   product-declared retired cleanup inputs.
8. Read-only inspection of GPT build 26.825.51511
   (`app.asar` SHA-256
   `f56ac8d5254a10fc4a04e7417fa787d135c3bbca49bad7d668d4ae65833d40c7`)
   showed that the plugin loader returned the declared BOS app, the connector
   metadata lookup returned no BOS entry, and the plugin detail merge removed
   the app before row/action rendering. That historical missing action was a
   client visibility regression rather than a connection-state result.
9. The same build's install/connect lifecycle uses a separate merge that falls
   back from connector metadata to directory data and then the plugin
   declaration without removing the app. The plugin-detail merge can adopt that
   established fallback instead of filtering unresolved declarations.
10. The historical desktop diagnostic recorded authenticated connector HTTP 404
    for the permanent BOS ID, while the archived 0.4.66 Issue #0002 customer turn
    made no BOS transport call. The later failed registry-recovery attempt proved
    only that the accidental replacement could resolve friendly metadata and
    return HTTP 200; it did not supersede the permanent identity. The deployed
    Issue #0002 server contract now passes unauthenticated `initialize`,
    `tools/list`, and signed-out `tools/call`, including the OAuth descriptor and
    canonical tool-bound authentication challenge. Clean 0.4.72 and
    installed-0.4.73 direct-MCP evidence supersedes `mcp_servers: []`,
    `not_installed`, and zero-invocation observations as current Issue #0002
    evidence: the exact prompt mounts, selects, and invokes `bos_get_context`,
    and its challenge reaches the Desktop renderer event. Issue #0002 now awaits
    only its renderer screenshot. The registered-app catalog evidence remains
    scoped to this Issue #0001 plugin-page incident.
11. A repository-owned correlated diagnostic reproduced the complete split on
    the authenticated client. `plugin/read` returned BOS 0.4.71 installed and
    enabled with the required prefixed app, while the created-by-me plugin list
    was empty and the connector GET returned HTTP 404. This replaces inference
    from detached desktop logs with a repeatable request/response probe.
12. The archived 2026-08-29 task records the account-state transition. Its dry
    run found the installed 6a932 created-by-me wrapper. The authorized command
    executed `plugin/uninstall` first and then failed on `plugin/share/delete`.
    The wrapper was therefore removed before the task stopped. A read-only
    comparison of desktop builds 26.825.41651 and 26.825.51511 found the same
    renderer predicate in both, reclassifying the desktop defect as latent and
    the partial account uninstall as its trigger.
13. The 2026-09-02 manual install renders Connect and exposes the next boundary:
    invoking it opens ChatGPT account onboarding and fails `duplicate_email`.
    A fresh read-only diagnostic reports the immutable 6a7 ID missing from
    `app/read` and the complete app catalog, an empty account-owned catalog, and
    connector HTTP 404. Live BOS discovery independently resolves the exact
    product-owned issuer and authorization endpoint. The active correction is
    therefore exact connector binding and target acceptance. Repository-native
    sync updates supported metadata only when the permanent record already
    exists; a missing or misbound record produces a zero-mutation registry-owner
    correction report.
14. A later clean-install screenshot again showed no Connect or Reconnect.
    Live `product:codex sync` returned HTTP 404 for the immutable ID. Inspection
    also found that the earlier sync path used an obsolete native publisher and
    overstated its ability to recreate a deleted registry record. The corrected
    path uses exact-ID connector-settings PATCH operations only for supported
    name and description drift, verifies the same ID and BOS resource afterward,
    and never invokes connector creation for established BOS.

## Five whys

1. **Why were BOS tools absent?** The task had no resolved BOS MCP connection,
   so no BOS callable manifest could be loaded.
2. **Why did Login remain absent after the package declaration was restored?**
   The GPT plugin detail renderer discarded the declaration when connector
   metadata was missing.
3. **Why was connector metadata missing?** A prior account-maintenance path
   partially uninstalled the created-by-me BOS wrapper, and every historical
   BOS ID is now unresolved for the account.
4. **Why did receiving the MCP server not fix it?** Transport receipt and Login
   display are independent client contracts.
5. **Why did release validation pass?** Tests asserted the direct MCP server
   and callable catalog while omitting the exact last-known-good app identity
   and plugin-page display contract.
6. **Why was the initial diagnosis confusing?** Commentary conflated skills,
   registered connections, OAuth, and tools, and the first review used the
   customer-packaged `bos:oracle` instead of this repository's local Oracle and
   Vault.

## Correct readiness model

Evaluate these layers independently:

1. **Install:** the marketplace and current product versions are registered.
2. **Skill load:** the current task exposes expected packaged workflow skills.
3. **Login display binding:** the root plugin contains the exact required BOS
   `.app.json`; subservices contain no transport binding; GPT always renders
   **Connect** or **Reconnect** from that declaration even when metadata,
   connection inventory, grant state, or tools are unavailable or their
   discovery requests fail.
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
- The GPT plugin-detail merge preserves every declared app and resolves
  optional display fields from connector metadata, directory data, then the
  declaration. A missing friendly name never hides the authentication action.
- Runtime verification reports registered-app state and callable-tool state
  separately.
- Installation converges local direct-MCP packages and any
  `products/bos/product.json`-declared retired binding to the generated
  permanent BOS binding while preserving unrelated state. This is local package
  convergence; product identity never migrates.
- OpenAI Platform submission drafts remain a publication lifecycle. They are
  never used as private package runtime identities.
- `npm run diagnose:codex-app` logs every app-server and connector request with
  a correlated response or error. Logging is enabled by default, uses redacted
  bounded NDJSON on standard error, and preserves machine-readable standard
  output. OAuth credentials, cookies, account identifiers, and organization
  identifiers never appear in the trace.
- Repository diagnostics expose no connector deletion method. Cache reset and
  package maintenance remain local and never uninstall or delete created-by-me
  account registration.
- Architecture and release review use `.agents/skills/oracle` with the current
  local `Vault/`. Customer packages never contain an Oracle skill.

## Acceptance

Source-publication acceptance requires deterministic generation, focused
package and installer tests, `npm run release:check`, `npm run contract:check`,
and a local Oracle review of the actual diff. Post-release client acceptance
requires a read-only lookup proving the exact immutable connector resolves to
the product-owned BOS MCP resource, plus a version-matched GPT client screenshot
visibly showing the native BOS Login or Connect control. The current verifier
reports connector HTTP 404 and stops before screenshot inspection. Live
signed-in acceptance additionally requires the current task to load the
package-owned resource, complete OAuth, discover every declared tool, resolve
one canonical context, and complete one bounded authenticated read.

Public OpenAI submission, domain verification, tool scanning, review, and
publication are separate release activities and do not control private Git
marketplace package identity.
