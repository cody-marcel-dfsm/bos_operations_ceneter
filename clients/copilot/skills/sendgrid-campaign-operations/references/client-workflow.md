# Education Center SendGrid client workflow

## 1. Start and preserve state

Select only the installed `education-center` connection. Call
`bos_get_context`, discover tools, and fingerprint names plus input schemas.
Create a sanitized campaign continuation envelope containing a task-local
request reference and request hash, manifest fingerprint, server-owned
draft/audience/campaign/operation identities,
approval bindings, idempotency keys, completed/pending steps, and reporting
cutoff. Apply `bos-mcp-client/references/runtime-continuation-contract.md` after
every refresh trigger.

Never put authority IDs, tokens, credentials, provider payloads, recipient
addresses, or source records in the envelope. If tools cannot refresh in place,
create a same-task continuation, transfer the envelope, rediscover, revalidate
context, and resume automatically.

## 2. Assemble the audience

Resolve explicit dates and source routes. Query configured Calimatic, Lead
Director, Gmail, Calendar, camp, enrollment, family, inquiry, lead, and trial
capabilities through the Education Center MCP. Treat a configured native
connector route as a missing BOS workflow capability and create the governed
issue; never switch to a native Gmail or Calendar connector. Support
priority-ordered, overlapping cohorts such as returning
seasonal families, camp customers, current customer families, recent leads,
recent trials, and approved internal recipients. Preserve all tags and source
provenance; use priority only for ordering and conflict resolution.

Request one normalized responsible-guardian identity per address. Apply current
unsubscribe, global suppression, hard/soft bounce policy, complaint,
invalid-address, do-not-email, review-required, ambiguity, duplicate, and
eligibility state. Ask the server to add named recipients through the governed
audience-update operation, then rebuild the audience version and suppression
preview.

Display aggregate matched, unique, eligible, excluded, and suppressed counts;
counts by source, cohort, and exclusion/suppression reason; audience version;
source cutoffs; and named-recipient inclusion status. Hide raw addresses unless
the user explicitly requests them.

## 3. Render and approve

Request the server-owned campaign preview and display exactly:

- UTF-8 subject, rendered HTML, and plain-text alternative;
- sender and reply-to identity;
- campaign/effective dates and customer contact information;
- SendGrid category;
- unsubscribe/ASM configuration;
- open/click and link-attribution tracking configuration; and
- compliant physical address.

Show broken-link, local-image, missing-unsubscribe, sender, suppression, and
tracking readiness checks. Bind explicit approval to the draft/content hash,
audience identity/version/hash, category, and action. Any change invalidates the
affected approval and requires the exact preview again.

## 4. Test and list send

Create distinct stable idempotency keys for test and live modes. Use the same
server campaign path and content/audience bindings for both.

1. Execute one test send to a governed test recipient.
2. Record requested, suppressed, prepared, accepted/rejected, category, and
   cutoff. Treat HTTP 202 as accepted.
3. Reconcile an uncertain test outcome before retry. Continue only after a
   canonical successful test result.
4. Execute the approved list send exactly once under the live idempotency key.
5. Reconcile an uncertain live outcome before retry or further transition.

Never fall back to a filesystem token, repository sender script, direct
database access, raw SendGrid request, browser session, or another MCP product.

## 5. Reconcile and report

Retrieve authenticated provider events through BOS. Report test and live modes
separately with requested, suppressed, prepared, accepted, rejected, delivered,
bounced, unique human opens/clicks, unsubscribes, complaints, conversions,
category, reporting cutoff, and last reconciliation timestamp. Count delivery
only from authenticated delivery events. Attribute conversions only from the
owning Calendar, enrollment, purchase, reply, review, or other business source.

Keep raw recipients out of results and diagnostics. Use server-owned identities
or salted/tenant-scoped hashes. Never use an unsalted email hash as a public or
cross-tenant stable identifier.

## 6. Missing capability

On a missing required operation, refresh the manifest, recover authorization
when indicated, revalidate context, and retry discovery once. Preserve all
completed work and approval/idempotency state. If the operation remains absent,
upsert the structured issue defined in `capability-contract.md` and return its
durable ID with the blocked step and exact acceptance criteria.
