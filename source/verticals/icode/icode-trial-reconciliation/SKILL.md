---
name: icode-trial-reconciliation
description: Reconcile iCode organization scheduled trials across BOS Lead Director, Google Calendar, and Gmail, identify families needing confirmation or scheduling follow-up, and create appropriate Gmail drafts. Use for requests such as “show every trial during the next seven days,” “which trial families need confirmation or follow-up,” “find Testy’s trial,” “reconcile upcoming trials,” or “prepare trial confirmation/follow-up drafts.”
---

# iCode Trial Reconciliation

Use `bos_icode` exclusively. The MCP provides tenant-scoped primitives; perform
query planning, identity expansion, cross-source matching, classification, and
reporting in the GPT client.
When Gmail or Calendar reports an authentication error, follow
`bos-mcp-client` authentication recovery and prompt the user to complete Google
authorization through the secure BOS setup page before retrying once.
Use `bos-visual-output` for the final result. Prefer a chronological trial
timeline with direct status labels, then a compact family action table and
draft list.
When three or more families or trial states are present, render an actual
timeline or Mermaid status flow before the table; status emoji alone does not
count as the visual.

## Mandatory workflow

1. Resolve the requested window in `America/Denver` and state it. Interpret
   “next seven days” as now through the same local time seven days later; for
   date-based primitives, search from today's local date through the local date
   containing that endpoint.
2. Call `bos_get_context` once. Use the selected iCode organization Lead Director scope and
   verify Lead Director, Gmail, and Google Calendar read capabilities are healthy.
3. Search Calendar across the full window without a text filter. Use
   `start_date`, `end_date`, and `time_zone`.
4. Search Lead Director for:
   - records whose trial date falls in the window;
   - active trial candidates using supported status, node type, date, and
     identity filters.
5. Search Gmail with the primitive's `q` field for trial inquiries, bookings,
   confirmations, reminder requests, reschedules, and cancellations relevant to
   the window. Use bounded Gmail-native queries, including `after:`/`before:`
   dates and terms such as `{trial "Book a Free Trial Class" "trial class"}`,
   then run narrower booking/confirmation/cancellation searches when needed.
   Do not use `query`; the current Gmail primitive reads `q`.
   Gmail is a required candidate source even when Lead Director and broad
   Calendar return zero records.
6. Call `gmail_get_thread` for every relevant Gmail search result. Determine
   relevance from the bounded query and returned metadata; do not hydrate an
   unbounded mailbox listing. Search
   returns message/thread identifiers and mailbox identity; the thread payload
   supplies the subject, sender/recipient, snippet, and body needed to extract
   the family identity. Decode and inspect the message content.
7. Extract each candidate’s exact email, normalized full name, phone, student
   name, requested class, and provider IDs from every returned source.
8. For every Gmail or Lead Director candidate without an exact Calendar match,
   run targeted searches before classification:
   - Calendar `q` with exact email;
   - Calendar `q` with exact full name;
   - Calendar `q` with student name or another source-backed strong identity;
   - Lead Director with exact email, phone, and name as needed.
9. Merge records using this evidence order: stable provider/booking ID, exact
   email, exact phone, then exact full family name plus compatible date or
   student. Keep weak or conflicting matches separate.
10. Classify:
   - `Scheduled`: exact-matched, non-cancelled Calendar/booking event in range.
   - `Needs confirmation`: scheduled with no completed confirmation evidence.
   - `Needs scheduling follow-up`: qualified inquiry plus completed targeted
     searches and no scheduled event.
   - `Needs review`: weak or conflicting identity evidence.
   - `Source incomplete`: any required source or exact-identity search failed.
11. When drafts are requested, create:
    - a confirmation draft only from a source-backed scheduled date/time/class;
    - a scheduling draft only after the full targeted-search loop finds no event.
    Create no draft for `Needs review` or `Source incomplete`. Never send Gmail.

## Completion gates

Before answering, verify all of these:

- Gmail search completed and its candidates were reconciled.
- Every relevant Gmail search hit was hydrated with `gmail_get_thread`.
- Every unmatched candidate received identity-targeted Calendar searches.
- Every scheduled record includes an exact identity match and stable event ID.
- Every follow-up record includes a completed targeted-search trace.
- Counts equal the displayed family records.
- Source failures are reported separately from genuine zero results.

Do not state “Calendar confirmed zero,” “no families need follow-up,” or “no
trials are scheduled” from broad Calendar and Lead Director searches alone.
An empty broad result is the start of candidate expansion, not family-level
absence evidence.

Treat first-name-only, last-name-only, and narrative-word matches as weak.
For example, do not match the family name `Patience` from an unrelated use of
the word “patience.” Gmail language requesting a trial reminder proves inquiry
and communication intent; it does not independently prove an appointment.

If any completion gate fails, continue searching when the primitive is
available. Otherwise report `Source incomplete` with the exact tenant, plugin,
capability, sanitized credential state, and correlation ID.
