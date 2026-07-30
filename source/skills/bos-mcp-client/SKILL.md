---
name: bos-mcp-client
description: Operate, diagnose, and improve the BOS MCP from client-side Codex using browser-free, tenant-scoped backend access. Use for every organization Gmail/email, Calendar, Drive, call, transcript, SMS, review, outreach, and file-download request; for Bright Horizons Gmail-to-Calimatic reconciliation; for iCode operations involving instructors, invoices, students, classes, camps, or parents; and for BOS scope resolution, tool discovery, provider failures, and feedback.
---

# BOS MCP Client

Use BOS as the authoritative integration boundary. Resolve authorization context before domain calls, preserve the returned scope exactly, and distinguish provider data limitations from MCP transport, authorization, discovery, and contract defects.

For reports, reconciliations, planners, or multi-record results, read and follow
the installed `bos-visual-output` skill. Present operational data visually when
the relationship is clearer than prose.

## Backend-only communication boundary

- Route every organization Gmail, mailbox, email, Calendar, Drive, call, transcript, SMS, review, outreach, attachment, and download request through BOS MCP or a published BOS backend API.
- Resolve provider credentials only from the selected organization's canonical plugin settings. The BOS API key establishes client and tenant authority; it never supplies or overrides a provider credential.
- Never inspect or use Chrome, a browser, an in-app browser, Computer Use, interactive login state, or a native/local connector as a credential source, evidence source, retrieval mechanism, download path, or fallback.
- Treat unrelated browser login state as unrelated to BOS provider authorization. A browser opened through a published BOS setup operation is the approved human authorization surface.
- When BOS or a provider reports an authentication error, `reconnect_required`, `authorization_required`, unavailable credentials, or missing scopes, read and follow [references/authentication-recovery.md](references/authentication-recovery.md). Prompt the user to complete the service's secure BOS-hosted login or credential setup, then verify status and retry once.
- Retrieve attachments, transcripts, and files through the owning BOS plugin or backend fetch operation. For Drive transcript/document text, prefer `drive_export_text` when available; it returns bounded text with `server_persisted=false`. Write returned content directly to the requested local destination only when the user asked for a local file.
- Treat phrases such as "Gmail", "search my email", "find the email", "get the thread", and "create a draft" as BOS requests by default.
- Select `bos_icode` for iCode, selected iCode organization, Calimatic, students, camps, enrollments, Bright Horizons, and `@icodeschool.com` context.
- Select `bos_dfsm` for DFSM.ai, Infinite State Machines, ISM, automation-business, and `@dfsm.ai` context.
- When business context is genuinely ambiguous, inspect both BOS contexts before choosing. Keep tenant results separate and state which organization was queried.
- Never use one BOS tenant as a fallback for a missing capability or credential in the other tenant.

Read and enforce [references/backend-only-communications.md](references/backend-only-communications.md) for every communication, transcript, attachment, or provider-file workflow.

Read and enforce [references/authentication-recovery.md](references/authentication-recovery.md)
whenever BOS client authorization or an installed provider authentication fails.

Read and follow
[references/google-business-profile-onboarding.md](references/google-business-profile-onboarding.md)
whenever onboarding or repairing Google Business Profile, reputation, reviews,
or Google Business Profile API access.

## Core workflow

1. Inspect the available `mcp__bos_icode__*` and `mcp__bos_dfsm__*` tools before claiming a BOS capability is unavailable.
2. Call `bos_get_context` once per task or after any authorization failure.
3. Select a scope whose `domain_id` or `plugin_id` matches the requested operation and whose capabilities include the required action.
4. Copy `org_id`, `app_code`, `installed_app_id`, and `delegated_role_id` exactly from that scope into the domain tool call.
5. Supply domain filters inside `query`. Use explicit ISO dates for relative periods and state the resolved range to the user.
6. Validate that returned records contain the fields required for the requested answer. Never infer absent class, enrollment, date, or status values.
7. Present the requested business result first. Mention integration details only when they affect completeness or accuracy.

When an authentication error interrupts this workflow, pause the affected
provider operation, run the authentication-recovery workflow, and continue
unaffected authorized work while the user completes setup.

For current tool patterns, query examples, error classification, and feedback payloads, read [references/bos-mcp-protocol.md](references/bos-mcp-protocol.md).

For `reconcile BH cancellations` and equivalent Bright Horizons cancellation
prompts, read and follow
[references/bh-cancellation-reconciliation.md](references/bh-cancellation-reconciliation.md).

For iCode operations work involving instructors, invoices, students, classes,
camp assignments, parents, calls, texts, or reviews, read and follow
[references/icode-operations-access-patterns.md](references/icode-operations-access-patterns.md).

For iCode GCLID discovery, paid-lead attribution, offline conversion uploads,
or Google Ads updates, also use `icode-paid-attribution-operations`. Keep Gmail,
Calendar, Lead Director, Calimatic, and Google Ads evidence source-specific and
require a live BOS Google Ads mutation capability before execution.

## Tool discovery and compatibility

- Treat the live MCP tool manifest as authoritative for callable names and schemas.
- Match tools by purpose and schema when a configured allowlist name differs from a live tool name.
- Never invoke an unlisted tool name or invent arguments.
- Recheck the manifest after a user says the server or permissions changed.
- If `bos_get_context` works while a capability tool is absent, report a discovery or allowlist mismatch with the exact expected and observed names.
- If the capability appears in context but the call is rejected, report an authorization or contract mismatch with the scope identifiers and sanitized error.

## Read operations

- Prefer the most specific BOS domain tool available.
- For Drive transcript or document-content requests, search with `drive_search` when a file id is not already known, then call `drive_export_text` for Google Docs or text-like files. Treat `server_persisted=false` as the expected result. If the file is binary, video, or too large for bounded text export, report the missing BOS streaming/download-handle capability instead of using browser or native Drive access.
- For class rosters, use an enrollment-listing tool rather than a general student search.
- For date ranges, use inclusive `start_date` and `end_date` in `YYYY-MM-DD` format unless the live schema says otherwise.
- Group, sort, and deduplicate client-side only after retaining source distinctions that matter. A daily drop-in class may legitimately repeat one student on multiple dates.
- Exclude emails, phone numbers, credentials, tokens, and opaque personal identifiers unless the user explicitly needs them.

## Changes and external effects

- Treat create and update calls as consequential actions. Confirm the target and payload when ambiguity could affect live data.
- Follow the live BOS policy. Do not attempt unsupported delete operations or prohibited sending actions.
- Use idempotency keys when the live schema requires them and reuse a key only for retries of the same logical mutation.

## Feedback workflow

Capture feedback when a BOS result is incomplete, a tool is missing, naming or schema is inconsistent, errors are opaque, or the user requests an improvement.

1. Reproduce with the smallest read-only call possible.
2. Record expected behavior, observed behavior, impact, live tool name, sanitized scope, date/time, and correlation ID when present.
3. Classify the issue using the taxonomy in the protocol reference.
4. Inspect the live tool manifest for a feedback operation such as `bos_submit_feedback`, `bos_create_feedback`, or a tool explicitly described as accepting MCP feedback.
5. If a feedback tool exists, inspect its live schema and prepare the payload. Submit only when the user asked to send/file/submit feedback or previously authorized automatic submission.
6. If no feedback tool exists, provide the structured report in the response. State clearly that it has not been submitted.

Never place secrets, bearer tokens, customer contact data, or full sensitive records in feedback. Include only the minimum identifiers needed to reproduce the issue.

## Response standard

For successful business queries, provide the result in the user's requested grouping and include the resolved date range when relative dates were used.

## Capability support classification

Classify support at the business-workflow level as well as the source-operation
level. A deterministic skill workflow that composes executable BOS operations
is **supported automation**, even when the user explicitly triggers it, no
single composite MCP tool represents it, it is read-only, it is unscheduled, or
it has no dedicated app screen.

Use these classifications:

1. **Automated workflow**: Codex executes the defined workflow from authorized
   BOS sources and returns the required business result without the user
   manually retrieving, joining, classifying, or transforming records.
2. **Partial workflow**: Codex executes only part of the required business
   result, or the user must manually supply, join, classify, or transform
   required evidence.
3. **Unsupported workflow**: a required source operation, credential,
   deterministic workflow, or output path is absent.
4. **Unavailable operation**: a specific provider read/create/update effect
   cannot execute. State this separately from any automated workflow that
   remains complete.
5. **Unscheduled automation**: an automated workflow lacks a verified
   scheduler. Report scheduling separately; never downgrade the workflow.

Never downgrade a supported workflow because a separate provider mutation,
scheduler, persisted queue, or dedicated UI is unavailable. For composed
workflows, report reconciliation or analysis, provider repair, scheduling, and
UI packaging as separate capabilities.

Do not infer that a workflow is unsupported because `bos_get_context` lists
only primitive source operations. The manifest proves authorization for those
operations; the selected skill and its workflow contract prove the composed
automation. Inspect both before classifying support.

For capability inventory requests, use the live
`bos-capability-report/v1` operation details when available. Keep these layers
separate:

1. **Executable BOS operations**: authorized operations whose
   `operations[].executable` value is `true`. Report the source, plain-language
   action, effect (`read`, `create`, or `update`), and callable tool.
2. **Authorized but unavailable BOS operations**: operations whose
   `executable` value is `false`. Report their exact status and the concrete
   repair action. A declared capability is not evidence that it can currently
   execute.
3. **Skill workflows**: relevant available Codex skills and the business
   workflows they orchestrate across BOS operations. Label qualifying
   deterministic workflows as automated workflows, not provider capabilities.
   A skill combines authorized operations but does not independently authorize
   provider access.
4. **Platform limits**: state global restrictions such as unavailable delete
   operations or prohibited Gmail sending once, after the inventory.

Use this concise report structure:

- group executable BOS operations by tenant and source in one compact table;
- list unavailable operations only when they require action or contradict prior
  execution evidence;
- list relevant skill workflows in one compact table or grouped bullet list;
- end with one repair recommendation when unavailable operations exist.

Do not include tenant-level capability counts, authorized/executable/unavailable
totals, a report-generation preamble, source identifiers, installed-app IDs, or
tool names unless the user explicitly requests technical detail. Prefer
plain-language operations and combine closely related actions in one row.

Describe skill workflows as generic, reusable capabilities. Do not expose skill
names, client names, industries, campaign names, prospect types, internal
projects, historical examples, or narrow use cases unless the user explicitly
requests that detail. Generalize specialized workflows into capability language,
for example:

- generate researched PDF reports and supporting artifacts;
- analyze calls, transcripts, records, and operational evidence;
- design email and text outreach;
- create, manage, and report on outreach campaigns;
- reconcile records across authorized systems;
- produce plans, audits, forecasts, and recommendations.

Capability inventories describe what the system can do. They must not reveal
who a workflow was built for or the specific scenario that originally motivated
it.

For older BOS deployments that omit `operations`, derive the authorized
capability list from `capabilities`, inspect the live tool manifest for exact
callable tools, and label executability as `unverified` rather than inferring it
from source status. Never describe a previously successful operation as
unimplemented solely because a current discovery response says `unsupported`;
classify that contradiction as a capability-resolution or tool-discovery
regression and include the prior execution evidence.

Never describe a documented, executable composed workflow as unsupported
solely because no same-named composite MCP tool exists.

For partial results, state:

- what BOS returned;
- which required fields were absent;
- whether the limitation is provider data, capability scope, tool discovery, contract, or transport;
- the next concrete action.

For feedback, use the concise template in the protocol reference and distinguish `prepared`, `submitted`, and `submission failed` states.
