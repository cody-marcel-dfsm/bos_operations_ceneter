---
name: collision-call-audit-email
description: Turn collision-repair prospect calls, transcripts, CRM evidence, public research, and audit artifacts into evidence-controlled profiles and personalized follow-up email drafts.
---



## Scoped authorization preflight

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

# Collision Call Audit Email

Build a traceable chain from conversation to profile, audit, offer, email, and
measured next action.

## Workflow

1. Resolve the prospect and preserve CRM, transcript, and public-shop evidence
   separately. Label inferred, conflicting, or unverified fields.
2. Extract an evidence ledger containing facts, pains, desired outcomes,
   objections, systems, metrics, commitments, prices actually quoted, and open
   questions. Preserve a source pointer for every consequential claim.
3. Keep leads, opportunities, booked repairs, completed repairs, and paid work
   as distinct funnel stages. Normalize every calculation to a stated period.
4. Reconcile each proposed claim against the call, audit, and the active
   canonical offer. Block unsupported prices, outcomes, timelines,
   integrations, guarantees, or payment links.
5. When an audit is promised, verify the exact attachment before referring to
   it. Summarize no more than three findings tied to the conversation.
6. Draft one canonical `email.html` plus a matching plain-text version. Use one
   primary CTA, concise paragraphs, email-safe HTML, inline CSS, accessible
   links, and the tenant's approved sender and branding.
7. Validate recipient, subject, attachment, CTA, price, guarantee, unsubscribe,
   sender identity, and mobile rendering. Send only after explicit approval of
   the final recipient and content through the owning mailbox route.

Store internal evidence, claims, tracking, and readiness separately from the
customer email. Checkout clicks indicate intent; only verified payment events
prove purchase. Never send during design or template refinement.
