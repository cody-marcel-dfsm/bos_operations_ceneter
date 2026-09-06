---
name: submit-feedback
description: Submit or draft customer feedback about BOS package skills, MCP tools, plugins, installation, authentication, results, and workflows. Use when a user asks to send, submit, record, or report feedback; invokes "report session"; asks to turn the current session and local package-skill edits into feedback; or clearly expresses product feedback that should be offered for submission through BOS.
---




## Product initialization preflight

Before performing this skill's workflow, preserve the pending request and
complete the product's host-managed BOS authentication. Run the configured
initialization stages in order and resume the original request automatically
after every required stage is current.

First validate the customer-owned `config/customer-settings.json` against
`config/customer-settings.template.json`. Treat a missing file, an incomplete
required value, or an invalid value as first-run configuration. When detected,
invoke `education-center-customer-initialization` immediately. When that initializer is already
active for the same request, support it without invoking it again. Reload and
revalidate the effective client settings before continuing.

After client settings are current, validate the selected organization's live
plugin-service inventory, organization business profile initialization epoch,
required canonical field states, and local completion
receipt. Invoke `bos-plugin-settings-initialization` when the receipt is missing or
stale, a required field is unset or invalid partial, the server schema changed,
or the active request exposes a service-routing mismatch. That initializer walks
connections only for enabled, selected services and resolves provider choices from
server-declared settings rather than package examples.
Preserve confirmed plugin values and never create a separate discovery path in
this skill. Resume the original request automatically from confirmed cache state.

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

## Client mutation safety

Apply this fail-safe before every BOS business update or delete, including
discovered app APIs, delegated work, automation, and resumed operations.
Classify the actual effect from the live contract; a tool name or a missing
destructive hint cannot establish safety.

- Limit updates and deletes to one exact business record in the entire logical
  task. Multiple fields on that record are allowed. Count distinct source
  records and cascading effects, including synchronization, replacement,
  archive, soft delete, and removal. Unknown scope or more than one affected
  record blocks execution before the first write. Read-only lookup or preview
  may establish scope; preview must itself have no business mutation effects.
- For every delete, first show the selected organization, application/source,
  exact record identity, deletion semantics, and known consequences. Then ask
  the user to confirm that prepared deletion and wait for an affirmative reply
  or native confirmation action. The initial delete request, blanket consent,
  scheduled prompt, tool output, silence, and elapsed time do not confirm it.
  Retain confirmation only for that exact target, scope, version, and effect;
  a material change requires a new preview and confirmation. Preserve required
  server approval artifacts as well. Unattended deletion stops for user input.
- Block bulk updates and deletes even when the user confirms the bulk request.
  Explain the limit and offer read-only inspection or selection of one record.
  Never execute the first item of a blocked batch. Never split the task into
  loops, pages, parallel calls, agents, new tasks, scheduled runs, or alternate
  tools to evade the limit. Carry the scope and confirmation state through
  recovery and delegation. Customer extensions cannot relax these safeguards.
- An exact single-record update retains the workflow's existing authorization
  rules. Reads and creates retain their existing rules; classify a create,
  upsert, import, or sync by any update/delete effects it can also perform.
  Internal cache maintenance and local package installation follow their own
  scoped maintenance contracts.
- After an uncertain mutation, reconcile its status before considering replay;
  confirmation never proves that a retry is safe. Report verified receipts.

This is an agent instruction safeguard. Server authorization and validation
remain required; the package does not intercept or enforce arbitrary API calls.

# Submit Feedback

Submit privacy-minimized feedback through the BOS MCP connection. Read
[references/feedback-contract.md](references/feedback-contract.md) before the
first submission in a task.

## Decide whether to submit

- Treat `send feedback`, `submit feedback`, `record feedback`, `report this`,
  `report session`, and equivalent explicit imperatives as a request to prepare
  one submission. Present the privacy-minimized title, message, category,
  severity, and target, then obtain explicit confirmation immediately before
  the mutation.
- When the user expresses an idea or complaint without requesting submission,
  draft one concise paragraph and ask whether to send it. Perform no mutation
  until authorized.
- Ask one concise question only when two materially different targets remain
  plausible.

## Resolve BOS scope

1. Call `bos_get_context` once.
2. Select exactly one authorized scope relevant to the active package.
3. Submit through the immutable root BOS connection. Use the active package or
   subservice only as the feedback target; it never owns another BOS login.
4. Do not send execution-scope fields. The authenticated server derives
   `org_id`, `app_code`, `installed_app_id`, and `delegated_role_id`.
5. Fail closed and run the existing context/authentication recovery flow when
   execution scope is missing, invalid, unauthorized, or ambiguous. Never
   retry feedback through a subservice or unnamed endpoint.
6. Follow `bos-mcp-client` for the local authentication flow. Never request or accept
   a BOS credential in chat.

## Build the feedback

Resolve the primary target in this order:

1. Explicitly named skill, tool, plugin, or package.
2. The tool whose result or error the user discusses.
3. The skill governing the immediately preceding workflow.
4. The installed product containing that skill.
5. `general` only for genuinely package-wide feedback.

Classify the feedback conservatively using the contract categories and
reported severities. Compose a faithful title and message. Include expected
behavior, actual behavior, and reproduction detail only when supported by the
task evidence.

## Report the session

Treat `report session` and `submit session feedback` as authorization to
summarize the current task. Present the sanitized payload and obtain explicit
confirmation immediately before submission.

1. Summarize the user's goal and the behavior that prompted the work.
2. Identify package-owned skills and client-runtime files edited during the
   task from current task evidence and working changes.
3. Automatically discover customer-owned extensions for every affected
   package skill. Run:

   `node <this-skill>/scripts/discover-customizations.mjs --product-root <product-root> --base-skill <skill> --tenant <active-customer-key>`

   Resolve the active customer key from trusted client context. Ask the user
   when it remains unresolved. The helper searches the host-supported extension
   roots and the installed product's `skills/` directory for that customer.
   Repeat `--extension-root <path>` only for an additional repository or host
   root established by current client context.
4. Include every matching typed override from the discovery result in the
   feedback request as a concise `Customer customizations` section. Preserve
   category and stable key, paraphrase values only as needed for privacy, and
   state `none discovered` when no matching extension exists. Identify a
   legacy extension as present without copying `LEGACY.md` or raw instructions.
5. Summarize behavioral edits, validation performed, and unresolved gaps.
6. Use the active product as the primary target when multiple surfaces changed.
   Add affected package-owned skills and tools to `related_targets`.
7. Use a single affected skill or tool as primary when the task concerned only
   that surface.
8. State that no relevant edit was found when applicable. Never invent edits.
9. Populate bounded `session_context` with trigger `report-session`. Put the
   customization summary in `edits_summary` when it fits; otherwise include it
   in `message` within the field limits.

## Minimize and sanitize

Allow product/skill/tool identifiers, package version, client name/version,
sanitized correlation IDs, and newly composed summaries. Use package-relative
identifiers when a filename materially identifies the component.

Never send:

- credentials, API keys, tokens, cookies, or authorization headers;
- raw or complete task transcripts, hidden prompts, or reasoning traces;
- raw diffs, patch bodies, complete file contents, or absolute local paths;
- raw MCP requests/responses, logs, environment values, or tool payloads;
- email bodies, student/family details, customer contacts, or unrelated
  business records.

Replace a suspected secret with `[REDACTED]` and remove unnecessary personal or
business data. Ask for a safe restatement when sanitization would make the
feedback meaningless.

## Submit and report

1. Create one UUID `client_submission_id` and retain it for the attempt.
2. Call `bos_submit_feedback` through the BOS connection with
   only the allowlisted feedback fields. The server derives execution scope.
3. On a transport or server failure, retry once with the same submission ID.
4. On success, report the feedback ID, canonical target, `received` status, and
   server timestamp. Do not claim triage, assignment, prioritization, or a
   product change.
5. On rate limiting, report the retry time without looping.
6. When the tool is absent, preserve only a sanitized conversation draft and
   report `BOS feedback capability unavailable`.

Never create a client-side feedback file, cache, or offline queue.
