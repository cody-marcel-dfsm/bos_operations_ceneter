---
name: openai-plugin-publishing
description: Prepare OpenAI plugin submissions and create, review, and validate their marketplace test cases against the plugin's published behavior. Use when a user is preparing a BOS or dependent plugin for OpenAI publication.
---



## Scoped authorization preflight
For an explicit BOS sign-out request, first follow `bos-mcp-client`'s
current-connection sign-out branch. Invoke only discovered `bos_logout`
with empty arguments and terminate after its receipt or canonical challenged
401. This connection-level action precedes context/default selection and
authentication recovery; do not sign in to perform logout.


First apply the versioned identity-context workflow in `bos-mcp-client`.
For live `bos-identity-mcp/v2`, resolve explicit request scope or the saved
customer default against fresh authorized contexts, discover tools for the
selected handle, and execute with that same handle. This branch governs
context selection throughout this skill, including older scoped-grant wording.
A missing operation never permits changing organization or role to find it.
The following single-context rules apply only to legacy scoped-grant discovery.

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context` to validate the exact scoped OAuth
connection. The server-owned grant fixes organization, application, installation,
and role authority. Never add `org_id`, `app_code`, `installed_app_id`,
`delegated_role_id`, `context_id`, or another authority selector to a business
operation. Invoke only the operation's live-declared business arguments.
Use the same scoped connection for BOS installed-app discovery. Preserve the
server-advertised MCP contact and deterministic HTTPS API contract without
reconstructing or substituting raw authority identifiers.

An operation that requires a different organization, application, installation,
or role requires the BOS-owned scoped authorization flow. The client never changes
authority by adding request arguments.

## Client mutation safety

Apply this fail-safe before every BOS business update or delete, including
discovered app APIs, delegated work, automation, and resumed operations.
Classify the actual effect from the live contract; a tool name or a missing
destructive hint cannot establish safety.

- Limit updates and deletes to one exact conceptual business record in the
  entire logical task. Multiple fields on that record are allowed. That record
  may resolve to one through five explicit source-record targets in one
  discovered service request. Count distinct conceptual records and cascading
  effects, including synchronization, replacement, archive, soft delete, and
  removal. Unknown scope, more than five source targets, or more than one
  conceptual record blocks execution before the first write. Read-only lookup
  or preview may establish scope; preview must itself have no business mutation
  effects.
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
- An exact one-conceptual-record update retains the workflow's existing
  authorization rules. Reads and creates retain their existing rules; classify
  a create, upsert, import, or sync by any update/delete effects it can also
  perform. Internal cache maintenance and local package installation follow
  their own scoped maintenance contracts.
- After an uncertain mutation, invoke only the exact service-returned bodyless
  state action and service-declared timing. Never replay the mutation or
  construct a status route, selector, retry schedule, or reconciliation
  request. Confirmation never proves that another mutation is safe. Report
  verified receipts.

This is an agent instruction safeguard. Server authorization and validation
remain required; the package does not intercept or enforce arbitrary API calls.

# OpenAI Plugin Publishing

Help the user prepare a truthful OpenAI plugin submission, with concrete test
cases that exercise the plugin's actual skills and advertised capabilities.

## Define marketplace test cases

1. Identify the owning plugin and its canonical submission manifest, public
   skills, advertised BOS operations, test organization, and existing approved
   cases. Read the relevant contracts and fixture evidence before proposing a
   prompt.
2. Keep one canonical public test-case document for the plugin. In BOS
   Operations Center, use the manifest's `openai_submission.import_file`, which
   points to `openai-marketplace-test-cases.json`. Do not create a second list
   in another document.
3. Make each prompt concrete, repeatable, and answerable with the plugin's
   published skills and current advertised tools. Fix dates, entities, role,
   and other input that affects the result. Do not ask the plugin to access a
   source system or data it cannot reach. Use synthetic identities only in
   public test material.
4. Give each case one clear acceptance criterion. Ground the expected result
   in the operation contract, stable test fixture, and observed server
   behavior. For natural-language answers, validate the required facts and
   behavior rather than exact wording. Require an exact operation or tool name
   only when that is the point of the case. Mark negative cases explicitly and
   specify the expected error or rejection.
5. Preserve user-approved prompts and expected results. Ask before changing an
   approved case. When the observed response proves the gold result was wrong,
   explain the evidence and update only within the user's authorization.

## Run and report each case

- Use the configured OpenAI reviewer workflow and its dedicated test identity.
  Before execution, confirm the reviewer organization, plugin, installation,
  and role match the case. A current user's session, a login link, local tests,
  or a prior run does not prove the reviewer case passed.
- Submit the exact prompt from the canonical document against the published
  plugin version. Run one case at a time when the user is reviewing cases in
  sequence. Retain the version, commit, run evidence, and sanitized actual
  response in the approved private evidence location; never put reviewer
  credentials, tokens, customer data, or private traces in public files.
- Compare the actual response and observed tool calls with that case's single
  acceptance criterion. Diagnose a failure at the layer shown by the run
  evidence, make the smallest authorized correction, and rerun the same prompt.
  Do not make a case pass by quietly changing its prompt, removing an approved
  requirement, or relaxing the assertion to fit a broken result.
- Report `PASS` only after an actual reviewer attempt satisfies the criterion.
  Report `FAIL` only after an actual attempt does not satisfy it. If execution
  was not attempted or the reviewer could not run, report `NOT RUN` with the
  concrete reason; never infer a result from source inspection or local tests.
- Use the user's requested concise format:

  Test Case name: <canonical case name>
  Prompt: <exact prompt>
  Answer: <actual reviewer response>
  PASS or FAIL

  For a case that was not attempted, state `Answer: Not run — <reason>` and
  `NOT RUN` instead of supplying a fabricated response or PASS/FAIL.

## Submission boundary

Keep public submission files limited to approved prompts, assertions, and
synthetic examples. Keep reviewer configuration, credentials, raw traces, and
run receipts private. Distinguish source/package validation from validation of
the published installation. Treat preparation, a reviewer run, and submission
to OpenAI as separate actions; perform an external submission only when the
user asks for it.
