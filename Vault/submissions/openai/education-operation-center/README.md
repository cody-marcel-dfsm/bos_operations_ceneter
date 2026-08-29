# Education Operation Center OpenAI submission packet

Status: pre-submission working packet; no OpenAI draft has been created and no
application has been submitted.

Prepared: 2026-08-23

Publisher: Infinite State Machines LLC

Submission type: skills subservice using the separately installed BOS plugin

Official checklist: [Submit plugins](https://developers.openai.com/plugins/deploy/submission)

## Decision summary

Submit Education Operation Center as a BOS subservice package. It contains no
MCP URL, registered app, connector, OAuth grant, or separate login. Reviewer
instructions install and connect BOS once, then exercise Education Operation
Center through the BOS server-evaluated tool catalog.

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

## Submission gates

The packet is ready for implementation review. These gates remain before an
OpenAI draft should be created:

1. Validate accurate per-tool annotations through the BOS connection and rerun
   the live contract suite.
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

1. Create the Education Operation Center skills-subservice draft.
2. Select the verified Infinite State Machines LLC developer identity.
3. Paste the fields from `listing.md`.
4. Declare BOS as the required connection-owning plugin and add no MCP endpoint.
5. Complete domain verification.
6. Upload the final skills bundle.
7. Paste the starter prompts and reviewer tests.
8. Select the approved availability and paste `release-notes.md`.
9. Review every policy attestation with the business owner and counsel.
10. Submit only after the evidence record is complete.
