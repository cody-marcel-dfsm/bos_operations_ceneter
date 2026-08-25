# Education Operation Center OpenAI submission packet

Status: pre-submission working packet; no OpenAI draft has been created and no
application has been submitted.

Prepared: 2026-08-23

Publisher: Infinite State Machines LLC

Submission type: skills plus MCP

Production MCP URL:
`https://dfsm.ai/mcp/apps/leaddirector/education-center`

Official checklist: [Submit plugins](https://developers.openai.com/plugins/deploy/submission)

## Decision summary

Use a new MCP-backed plugin submission with the fixed production URL entered as
a Universal URL. Upload the final Education Operation Center skill bundle and
let the portal scan the MCP server. The existing development integration ID is
not a submission input.

## Prepared in this packet

- `listing.md`: paste-ready public listing fields, prompts, audience, and
  availability recommendation.
- `reviewer-tests.md`: five positive and three negative reviewer cases.
- `reviewer-access.md`: safe reviewer-account and fixture requirements.
- `tool-annotation-audit.md`: all 45 contract tools with proposed OpenAI hints.
- `legal-and-support-drafts.md`: privacy, terms, support, data handling, and
  deletion copy for business/counsel review before publication.
- `release-notes.md`: initial-submission release notes.
- `portal-readiness.md`: current portal and production prerequisite status.
- `checklist.md`: line-by-line completion status against OpenAI's final
  checklist.
- `assets/icon-candidate.png`: original marketplace icon candidate requiring
  brand approval.

A staging skills-only upload bundle is generated at
`Vault/tmp/openai-submission/education-operation-center-skills-0.4.46.zip` from
the current generated Codex skill tree. Regenerate it from the release commit
after runtime remediation and final package validation.

## Submission gates

The packet is ready for implementation review. These gates remain before an
OpenAI draft should be created:

1. Deploy accurate per-tool annotations from `tool-annotation-audit.md`, rerun
   the live contract suite, and scan the production route.
2. Publish approved product website, privacy, terms, and support pages at stable
   HTTPS URLs.
3. Confirm the Infinite State Machines LLC business identity is verified in the
   same OpenAI organization used for submission.
4. Prepare a reviewer identity that signs in without MFA, SMS, email
   confirmation, or private-network access and is restricted to the synthetic
   review tenant.
5. Obtain the portal domain-verification token and deploy it exactly at the
   portal-selected `/.well-known/openai-apps-challenge` origin.
6. Approve the marketplace icon, listing copy, United States availability, and
   policy attestations.

## Submission-time sequence

1. Create a new **With MCP** plugin draft.
2. Select the verified Infinite State Machines LLC developer identity.
3. Paste the fields from `listing.md`.
4. Enter the production endpoint as **Universal**.
5. Add the reviewer credential through the portal secret field.
6. Complete domain verification.
7. Select **Scan Tools** and reconcile every result with
   `tool-annotation-audit.md`.
8. Upload the final skills bundle.
9. Paste the starter prompts and reviewer tests.
10. Select the approved availability and paste `release-notes.md`.
11. Review every policy attestation with the business owner and counsel.
12. Submit only after the evidence record is complete.
