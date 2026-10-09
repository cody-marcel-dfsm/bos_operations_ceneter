---
name: openai-plugin-publishing
description: Prepare OpenAI plugin submissions and create, review, and validate their marketplace test cases against the plugin's published behavior. Use when a user is preparing a BOS or dependent plugin for OpenAI publication.
---

# OpenAI Plugin Publishing

Help the user prepare a truthful OpenAI plugin submission, with concrete test
cases that exercise the plugin's actual skills and advertised capabilities.

## OpenAI publication requirements

Before building or revising an MCP submission, read
[the maintained submission requirements](references/submission-requirements.md)
and check the current official OpenAI documentation linked there. Initial MCP
review requires exactly five positive and three negative cases. Final remote
MCP submission also requires exactly five positive and three negative cases.
Skills-only plugins do not need MCP review cases.

Keep the case types distinct. Each positive case needs a description, exact user
prompt, expected tool names, and observable expected result, and must be run
with the dedicated reviewer test account before submission. Each negative case
needs a concrete prompt or scenario, why the plugin must not complete it, and
the expected refusal, clarification, or safe fallback. Make each case test one
acceptance criterion; use the negative list for supported safety, authority,
and scope boundaries, not for extra positive scenarios. Keep attachments and
example-output URLs optional and limited to what the case needs.

For a single-MCP plugin, plugin-level review metadata can carry the two case
lists. For multiple MCP servers, define cases separately on each server in the
MCP configuration; do not combine per-server cases with plugin-level review
cases. Keep reviewer credentials and sign-in instructions in OpenAI's secure
review-details form, outside the public package. Use a reviewer-ready test
account with sample data and required permissions; never include credentials,
tokens, or private login links in public files.

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
