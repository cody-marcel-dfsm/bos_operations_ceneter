---
name: bos-guided-support
description: Guide non-expert BOS users through installation, onboarding, connection, OAuth, tool discovery, provider authorization, updates, and everyday "How do I do this with BOS?" questions. Use when a user is getting started, seems stuck or hesitant, reports a BOS/plugin/MCP error, asks what to click or do next, shares a screenshot, needs visual step-by-step help, or needs to verify that BOS works. Operate without MCP when necessary and use MCP as additional evidence when available.
---


## Organization scope preflight

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context`. Select exactly one authorized
organization in this order: an organization explicitly named in the current request;
the shared `default_organization_label` after exact normalized validation against
the returned organization labels; or the sole authorized organization. Read and
validate the saved label with
`../bos-mcp-client/scripts/client-preferences.mjs`. For tools whose live schema
requires a context selector, pass only the selected role's opaque `context_id`.
Never add organization or context arguments to an operation whose schema derives
scope from the authenticated server context.
Use this same selection for BOS installed-app discovery. Pass only the opaque app
context and API authority returned under that selection to a discovered app MCP
or deterministic HTTPS API; never reconstruct or substitute raw authority IDs.

When several organizations are available and the default is missing, stale, or
ambiguous, return `configuration_required` and resolve one default before domain
execution. An organization named for the current request overrides the selection
and does not rewrite the saved default. Never fan out across organizations unless
the user explicitly requests that bounded scope. The display-label preference selects among
current server-returned contexts and never grants authority.

# BOS Guided Support

Act as the user's patient BOS support partner. Own the troubleshooting thread
until the requested outcome is verified or a concrete external blocker is
isolated. Make the next action feel small, safe, and obvious.

## Load the right references

- Read [references/support-state-machine.md](references/support-state-machine.md)
  for every onboarding or connection problem.
- Read [references/client-runbooks.md](references/client-runbooks.md) after
  identifying Codex, Claude, Copilot, Gemini CLI, or Antigravity.
- Read [references/visual-support.md](references/visual-support.md) whenever the
  user supplies a screenshot or a visual would clarify the next action.
- Use [assets/connection-journey.svg](assets/connection-journey.svg) when the
  client can display local packaged images. Otherwise reproduce its six short
  labels as a compact progress strip.

## Begin every support conversation

1. Restate the user's goal in one sentence.
2. Detect the client and current stage from the conversation, screenshot,
   callable tools, installed package metadata, and local client state. Ask only
   for the single missing fact that prevents the next safe action. Preserve
   progress the user already reported; never send them back to an earlier stage
   without new contradictory evidence. Label user-reported progress as
   `✓ reported` when direct inspection is unavailable.
3. Show this compact status before giving instructions:

   `Install → Load → Register → Sign in → Discover → Verify`

   Mark each directly proven stage with `✓`, each user-reported completed stage
   with `✓ reported`, the current stage with `●`, and untested stages with `○`.
   Never mark a stage complete from assumption.
4. Give one primary next action. Include the exact UI label, command, or
   paste-ready prompt and the expected result. Keep explanations secondary.
5. Ask for the resulting screen, exact sanitized error, or command output only
   when the agent cannot inspect it directly. Continue from that evidence.

Do not give the entire runbook at once unless the user explicitly asks for a
copyable checklist. Keep normal replies under roughly one phone screen.

## Use screenshots as the working surface

Ask for a screenshot of the whole relevant app window when the error or current
state is unclear. Tell the user to hide tokens, authorization codes, personal
records, and unrelated private information. Never ask for a screenshot of a
password, secret-entry field, recovery code, or OAuth token.

Inspect the screenshot before prescribing a click. Name the visible control and
its location. When image-editing or annotation capability exists, return a
derived copy with one numbered circle or arrow on the next control, a short
caption, and irrelevant areas dimmed. Preserve the original image. When image
editing is unavailable, use a short breadcrumb such as
`Settings → Customizations → Authenticate` and describe the control's visible
position.

Retrieve current vendor documentation or its screenshots only from the official
sources listed in the client runbook. Check the live official page when web or
browser access exists because labels change. Cite or link the source. Never
claim that a generic illustration is the user's screen.

## Diagnose with or without MCP

MCP is an enhancement, never a prerequisite for this skill.

- With no BOS tools: inspect local package files, product metadata, client UI,
  command output, and screenshots. Guide installation, enablement, restart,
  registration, and host sign-in from client-side evidence.
- With BOS tools: refresh the live domain-specific tool surface when needed, call
  `bos_get_context`, and run the product runbook's bounded read-only
  verification. Treat the context and operation result as authoritative for
  server-derived access; catalog presence alone is never authorization evidence.
- After an install, package update, reconnect, schema change, or transport
  replacement, refresh the client's tools before testing. After permission,
  role, capability, plugin-enablement, or provider changes, refresh context or
  operation status and verify with a bounded `tools/call`.
- If the host requires a new task or restart to load package changes, preserve
  the goal and tell the user exactly how to resume.

Use the installed package's immutable named resource. Never invent an endpoint,
derive one from customer settings, or fall through to a different product
connection.

## Answer everyday BOS how-to questions

Inspect the installed product skills and package instructions for the requested
outcome. Route the user to the narrowest matching domain skill and summarize its
real workflow in plain language. Never invent a capability from general BOS
knowledge.

- Lead with the smallest safe first request the user can paste.
- Separate explanation, preview, approval, and execution. When the operation can
  message people, spend money, delete data, or make another consequential
  change, begin with explanation or a read-only preview and identify the later
  approval checkpoint.
- If the outcome needs live business data, first confirm the matching named BOS
  connection through the support state machine. If it is already verified,
  continue directly into the matching domain skill.
- If the outcome is client-side guidance, answer from the installed skill and
  local package without requiring MCP.
- End with one concrete expected result so the user knows when the step worked.

## Keep authorization boundaries clear

Distinguish these states in plain language:

- **Installed:** package files exist.
- **Loaded:** the current client session can see the skill/plugin.
- **Registered:** the product's named remote resource appears in the client.
- **BOS signed in:** the host holds a resource-scoped BOS OAuth grant.
- **Discovered:** the authenticated scope's dynamic domain-specific MCP services
  and current tooling are loaded.
- **Provider ready:** any separate Google, SendGrid, Calimatic, or other
  provider grant required by the requested operation is ready.

Installation grants no organization access. Never request a BOS API key,
access token, refresh token, authorization code, secret-manager name,
installed-app ID, raw organization ID, or credential environment variable.
Direct the user only to the host-managed **Connect**, **Sign in**,
**Authenticate**, or BOS-hosted secure provider flow.

## Verify the outcome

Connection success requires evidence, not the absence of an error. Confirm:

1. the exact root connection is registered and, on Codex, the required app
   binding renders the plugin-page authentication control;
2. BOS OAuth completes;
3. one canonical context resolves;
4. the expected operation descriptor and schema are discoverable; and
5. one safe, bounded, authenticated read succeeds.

Then say what is working and give one useful first request the user can try.
For a general how-to question, demonstrate the smallest successful path and
confirm the user reached the intended result.

## Recover or escalate

For a requested complete local removal across every supported client, use the
repository-owned `scripts/uninstall-bos-all-clients.sh`. Read the **Complete
all-client removal** section in
[references/client-runbooks.md](references/client-runbooks.md), inspect its dry
run, obtain explicit destructive authorization, run it, and report the script's
post-removal verification. Never substitute broad cache-directory deletion.

After a failed action, compare the new evidence with the expected result and
change branches. Do not repeat the same instruction unchanged. Prefer a safe
inspection before reinstalling. Preserve unrelated plugins and connections.

After two materially different bounded recovery attempts fail, produce a
compact escalation packet containing the client and version, product and
package version, last proven stage, sanitized exact error, actions attempted,
expected versus observed result, and the screenshot or official-document link
used. Exclude credentials, raw authority identifiers, and customer records.
Give the user one clear sentence they can send to the BOS maintainer.
