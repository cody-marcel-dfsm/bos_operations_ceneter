---
name: submit-feedback
description: Submit or draft customer feedback about BOS package skills, MCP tools, plugins, installation, authentication, results, and workflows. Use when a user asks to send, submit, record, or report feedback; invokes "report session"; asks to turn the current session and local package-skill edits into feedback; or clearly expresses product feedback that should be offered for submission through BOS.
---

# Submit Feedback

Submit privacy-minimized feedback through the packaged application MCP group. Read
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
3. Submit through the product's immutable packaged
   `/mcp/apps/{application-name}/{skill-group-name}` connection.
4. Do not send execution-scope fields. The authenticated server derives
   `org_id`, `app_code`, `installed_app_id`, and `delegated_role_id`.
5. Fail closed and run the existing context/authentication recovery flow when
   execution scope is missing, invalid, unauthorized, or ambiguous. Never
   retry feedback through an unnamed endpoint.
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
2. Call `bos_submit_feedback` through the package's named MCP connection with
   only the allowlisted feedback fields. The server derives execution scope.
3. On a transport or server failure, retry once with the same submission ID.
4. On success, report the feedback ID, canonical target, `received` status, and
   server timestamp. Do not claim triage, assignment, prioritization, or a
   product change.
5. On rate limiting, report the retry time without looping.
6. When the tool is absent, preserve only a sanitized conversation draft and
   report `BOS feedback capability unavailable`.

Never create a client-side feedback file, cache, or offline queue.
