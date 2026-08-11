# Client Feedback Implementation Design

Status: Proposed
Owner: BOS Operations Center client package
Backend dependency: [BOS Feedback Service PRD](BOS_FEEDBACK_CAPABILITY_PRD.md)

## 1. Purpose

Implement client-side support that lets a user submit feedback about any skill,
MCP tool, plugin, installation, or package behavior through the BOS MCP. This
document is authoritative for changes in this repository. The backend PRD is
authoritative for the service and persistence contract.

The client captures the user's intent, resolves the affected package surface,
removes sensitive context, submits one tenant-scoped MCP mutation, and displays
the durable server receipt.

## 2. Client behavior

### Explicit feedback request

Treat “send,” “submit,” “record,” or “report” feedback as authorization for one
submission when the content and target are clear.

Examples:

- “Submit feedback that the camp report needs a Care.com total.”
- “Report that BOS authentication keeps losing its context.”
- “Send feedback about the tool that just failed.”
- “Record this as feedback for the Education Center package.”

Do not ask for a second confirmation. Resolve context, sanitize the payload,
submit it, and show the receipt.

### Session report command

Treat the exact command `report session` and close imperative variants such as
`submit session feedback` as explicit authorization to create and submit one
feedback record from the current task. This command supports prompts such as:

> Take the information from the session and the edits we've made to our local
> skills and create feedback based on it.

The command performs these actions without a second confirmation:

1. Summarize the user's goal and the behavior that prompted the work.
2. Identify package-owned skills and client-runtime files edited during the
   current task.
3. Describe the behavioral changes made, validation performed, and unresolved
   gaps.
4. Select the active package as the primary target and include affected skills
   or tools as structured related targets.
5. Sanitize the summary and submit it through `bos_submit_feedback`.
6. Display the durable receipt.

Use the current task and current working changes as evidence. Summarize them;
never attach or transmit the raw transcript, raw diff, file contents, tool
payloads, or absolute paths. Include customer-owned extension skills only when
the user explicitly identifies them as part of the feedback. When no relevant
edit exists, state that in the summary rather than inventing one.

### Conversational feedback

When a user expresses dissatisfaction or an enhancement idea without asking to
submit it, draft a concise feedback summary and ask whether to send it. Perform
no mutation until the user authorizes submission.

### Ambiguous target

Ask one concise question when two or more materially different skills, tools,
or packages could be the target. Use the active skill/tool/package when it is
unambiguous from the immediately preceding operation.

## 3. Repository changes

### Canonical skill

Create the skill with the skill initializer:

```text
source/platform/submit-feedback/
├── SKILL.md
├── agents/openai.yaml
└── references/feedback-contract.md
```

Skill name: `submit-feedback`

Skill description:

> Submit or draft customer feedback about BOS package skills, MCP tools,
> plugins, installation, authentication, results, and workflows. Use when a
> user asks to send, submit, record, or report feedback, or clearly expresses
> product feedback that should be offered for submission through BOS.

Keep `SKILL.md` concise. Put the complete request/response schema, error map,
field limits, and examples in `references/feedback-contract.md`.

### Product composition

Add `platform/submit-feedback` to `products/bos/product.json`.

Make the skill available with every customer-facing product that uses BOS. The
current product validator prevents non-BOS products from including platform
skills, so implementation must choose and test one composition mechanism:

1. Add reusable product dependencies to the package model and make
   `education-center` depend on the BOS foundation product; or
2. Allowlist `platform/submit-feedback` as a shared platform include and add it
   explicitly to each intended product.

Use the second mechanism for the first release when product dependency support
would materially expand scope. Preserve a single canonical source directory in
both cases.

Update a default prompt only when it can fit within the existing maximum of
three prompts without displacing a higher-value product entry point.

### BOS MCP service

Implement the feedback tool in the BOS service repository:

1. Add `bos_submit_feedback` to the endpoint's authorized tool contract.
2. Use the exact input schema in the backend PRD.
3. Resolve the API key, tenant, installation, plugin, and `org_id` on the
   server before execution.
4. Pass the allowlisted request through PO orchestration and GO persistence.
5. Preserve the service result and error contract while keeping request bodies
   out of transport logs.

The client package stores no feedback and provides no offline queue.

### Generated clients

Run the existing build so canonical changes generate:

- Codex BOS plugin skill output.
- Codex customer-product plugin skill output.
- Claude skill/plugin output.
- Copilot skill/product output.

Never edit generated client copies directly.

## 4. Skill workflow

The new skill follows this sequence:

1. Determine whether the user authorized submission or requested only a draft.
2. Call `bos_get_context` once.
3. Use the package's fixed named application/group MCP connection. Send no
   execution scope fields; BOS derives the unique authorized scope from the
   credential.
4. Resolve the target:
   - Prefer the skill/tool that handled the immediately preceding operation.
   - Otherwise use the explicitly named target.
   - Ask one question if the choice remains ambiguous.
5. Classify `category` and `severity` conservatively.
6. Compose a title and message faithful to the user's words.
7. Include expected behavior, actual behavior, and reproduction summary only
   when supported by the current conversation.
8. Sanitize every outbound free-text field.
9. For `report session`, build bounded `related_targets` and `session_context`
   from the current task and working changes.
10. Generate one UUID `client_submission_id` and retain it for the submission
   attempt and one retry.
11. Call `bos_submit_feedback` through the package's named MCP connection with
    `delegated_role_id` and the allowlisted payload. Never put route scope in
    the body or retry through an unnamed transport.
12. Display the receipt ID, canonical target, status, and received time.

Never imply that the feedback has been triaged, prioritized, assigned, or
implemented.

## 5. Target resolution

Target precedence:

1. Explicitly named skill, tool, plugin, or product.
2. The tool that returned the error discussed by the user.
3. The skill actively governing the immediately preceding workflow.
4. The installed product containing that skill.
5. `general` only when the feedback genuinely applies across the package.

For `report session`, use the active product as the primary target when the
task touched multiple skills or tools. Add each affected package-owned skill or
tool to `related_targets`. Use a single skill/tool as the primary target when
the session concerned only that surface.

Populate only applicable target fields. Client-provided names are selectors;
the service returns the canonical target in the receipt.

Examples:

| User wording | Target |
|---|---|
| “The camp report should separate Care.com.” | `skill: camp-capacity-planning` |
| “The enrollment tool returned stale data.” | The exact MCP tool called. |
| “Installing BOS was confusing.” | `installation: bos` |
| “This entire package needs better error messages.” | The active product. |

## 6. Category and severity rules

Categories:

- `bug`: behavior violates a defined contract or fails unexpectedly.
- `enhancement`: requested new behavior.
- `usability`: confusing interaction or avoidable friction.
- `documentation`: missing or incorrect guidance.
- `incorrect-result`: returned business result is wrong or incomplete.
- `missing-capability`: required MCP/tool capability is absent.
- `other`: no category fits confidently.

Severity:

- `blocking`: the requested workflow cannot proceed.
- `high`: core workflow produces an incorrect result or unsafe behavior.
- `medium`: material friction or partial degradation with a workaround.
- `low`: minor clarity, polish, or convenience issue.

Store these as reported classifications. Future server triage may assign a
separate internal priority.

## 7. Privacy and sanitization

Allow:

- Product name/version, skill name, plugin name, and MCP tool name.
- Client name/version and platform when discoverable.
- User-authored feedback.
- Newly composed expected/actual behavior and reproduction summaries.
- A sanitized server correlation ID.
- A newly composed session goal, edit summary, validation summary, and
  unresolved-item summary.
- Package-relative skill identifiers and filenames when they materially help
  identify the affected component.

Exclude:

- Credentials, API keys, tokens, cookies, and authorization headers.
- Complete chat transcripts, hidden prompts, and chain-of-thought.
- Raw MCP requests/responses, execution logs, and environment values.
- Raw session transcripts, raw diffs, patch bodies, and complete file contents.
- Raw email bodies, student/family details, customer contact information, and
  unrelated business records.
- Absolute local paths and file contents.

Before submission, replace any suspected secret with `[REDACTED]`. Remove
unnecessary personal or business data instead of transforming it. If the
feedback cannot remain useful after sanitization, tell the user what category
of information must be omitted and request a safe restatement.

## 8. Authentication and failure behavior

| Condition | Client action |
|---|---|
| BOS API key missing or invalid | Stop and direct the user to repair the approved GCP-managed client configuration. |
| Scope missing/ambiguous | Fail closed and state the missing canonical scope. |
| Tool absent | Preserve the sanitized draft in conversation and report `BOS feedback capability unavailable`. |
| Provider authorization requested | Treat as a server contract defect because feedback has no provider dependency. |
| Rate limited | Show the retry time; do not loop automatically. |
| Transport/server failure | Retry once with the same `client_submission_id`; then report the correlation ID. |
| Validation failure | Name invalid fields without echoing sensitive values. |

The client persists no local feedback queue, transcript, secret, or pending
submission.

## 9. User-facing results

Success:

```text
Feedback submitted: FB-2026-000123
Target: camp-capacity-planning
Status: received
```

Capability unavailable:

```text
BOS feedback capability unavailable. I preserved a sanitized draft in this
conversation and did not store it locally.
```

## 10. Client tests

### Skill tests

- Explicit submission triggers one mutation without redundant confirmation.
- `report session` submits one sanitized session-derived record without a
  second confirmation.
- Session reporting summarizes package-owned edits and validation while
  excluding transcripts, raw diffs, file contents, and absolute paths.
- Multi-skill sessions use the package as primary target and affected skills as
  related targets.
- A session with no relevant edits reports that fact without inventing edits.
- Conversational feedback produces a draft and waits.
- Ambiguous target produces one concise question.
- Active skill/tool context resolves the expected target.
- Category and severity follow the defined mapping.
- Success output uses the server receipt and canonical target.
- No output claims triage or implementation.

### Broker tests

- `bos_submit_feedback` appears before authentication.
- Unauthenticated call fails closed.
- Exact tenant scope selects one upstream.
- Ambiguous/missing scope fails closed.
- Request forwards once and preserves the upstream result.
- One idempotent retry preserves `client_submission_id`.
- Logs exclude all free-text body fields and raw arguments.

### Packaging tests

- Product validation accepts the selected composition mechanism.
- Canonical skill is included in every intended product.
- Codex, Claude, Copilot, and Gemini generated copies match the source.
- Package archives remain credential-free.
- Existing install/update tests continue to pass.

### Security tests

- Secret-like strings are redacted or rejected before submission.
- Cross-tenant scope is never inferred or substituted.
- Transcript, raw payload, email body, environment values, and local paths are
  absent from requests.
- Security scan reports no credentials in source, fixtures, or distributions.

## 11. Implementation sequence

1. Receive a staging backend satisfying the linked PRD and contract tests.
2. Initialize `source/platform/submit-feedback` and generate its UI metadata.
3. Write the concise skill and backend-contract reference.
4. Add the BOS service tool contract and server-owned execution behavior.
5. Add skill, service-contract, security, and packaging tests.
6. Add the skill to BOS and customer-facing product composition.
7. Rebuild all generated clients.
8. Run package checks, unit tests, service-contract tests, secret scanning, and diff
   validation.
9. Run a staging smoke test that submits unique synthetic feedback and verifies
   the receipt.
10. Release after the backend capability is deployed and granted.

## 12. Client acceptance criteria

1. Any installed package user can explicitly submit feedback about the active
   package skill or tool using natural language.
2. `report session` creates one feedback record from the current task and
   package-owned edits without transmitting raw session or file data.
3. The submission uses exact BOS-authenticated scope.
4. The request matches the backend PRD schema exactly.
5. The client sends only privacy-minimized, allowlisted context.
6. Successful submission produces one durable receipt.
7. Safe retry creates no duplicate record.
8. Missing authentication, context, capability, or service health produces an
   accurate and actionable failure state.
9. The implementation is generated consistently for Codex, Claude, and
   Copilot from canonical source.
