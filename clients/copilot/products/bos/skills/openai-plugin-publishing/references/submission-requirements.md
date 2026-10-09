# OpenAI MCP plugin submission requirements

Use this reference when preparing a ChatGPT plugin submission that includes an
MCP server. Recheck the official pages before each submission because OpenAI's
requirements can change.

## Review cases

Initial MCP review requires exactly five positive cases and exactly three
negative cases. Final submission of a remote MCP plugin also requires exactly
five positive cases, three negative cases, and release notes. An upload can
accept partial case lists, but that does not make the package ready to submit.
Skills-only plugins do not need MCP review cases or a demo recording.

Every case has a description and a user prompt. For positive cases, OpenAI
requires the expected tool names and observable expected behavior. A positive
case must be run using the dedicated test account before submission. A negative
case describes a prompt or scenario where the plugin should not complete the
request, explains why, and states the expected refusal, clarification, or safe
fallback. Keep each case concrete and bounded to one acceptance criterion.
Optional fields include file attachment URLs and an expected-output URL.

Plugin-level `review.test_cases` supports one MCP server. When a plugin has
multiple MCP servers, declare cases separately for each server in the MCP
configuration; do not combine those per-server declarations with plugin-level
review cases.

## Reviewer access and demo

When sign-in is required, provide a dedicated test account with sample data,
the permissions needed by the cases, and working access that does not depend on
MFA approval, email or SMS codes, magic links, or a private network. Enter
reviewer credentials and sign-in instructions in the secure Review details
form. Keep credentials, tokens, and private login links out of the package.

Remote MCP review requires an accessible demo-recording URL showing the main
use cases and tools across supported platforms. Final remote MCP submission
also requires a successful current tool scan and a verified production HTTPS
server URL with domain verification complete.

## Remaining remote-MCP submission checks

- Supply valid HTTPS website, support, privacy-policy, and terms-of-service
  URLs.
- Include release notes for the submitted package.
- Set `readOnlyHint`, `openWorldHint`, and `destructiveHint` on every MCP tool,
  with a justification for each annotation.
- Complete the developer or business identity verification and required policy
  attestations; pass safety and security scans for every bundled skill.
- Add screenshots only when the MCP server provides custom UI. When screenshots
  are supplied, include one PNG or JPEG per starter prompt, exactly 706 pixels
  wide and 400–860 pixels tall.

## Official sources

- [Upload and submit your plugin](https://developers.openai.com/plugins/deploy/submission)
- [Plugin submission errors](https://developers.openai.com/plugins/deploy/submission-errors)
