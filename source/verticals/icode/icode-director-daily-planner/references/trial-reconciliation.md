# Trial schedule reconciliation

Use this workflow for requests to list scheduled trials over a day or date
range, identify families needing confirmation or follow-up, or prepare
appropriate drafts. The BOS MCP supplies source primitives. The GPT client
owns query planning, identity expansion, matching, classification, and output.

## Required primitive composition

1. Resolve the local date range in `America/Denver`. Interpret “next seven
   days” as now through the same local time seven days later, and include the
   local date containing that endpoint in date-based primitive searches.
2. Search Calendar for the entire range:
   - run one unfiltered date-window search because event titles vary;
   - optionally run a second date-window search with booking terms such as
     `trial`;
   - retain every returned event's source identity, calendar id, status,
     start/end, summary, description, attendees, and stable event id.
3. Search Lead Director for trials in the range and for active leads requiring
   scheduling or confirmation.
4. Search Gmail for:
   - trial inquiries received in the relevant intake window;
   - booking and confirmation messages whose appointment falls in the range.
   Supply bounded Gmail-native syntax in the primitive's `q` field, including
   `after:`/`before:` dates and a term group such as
   `{trial "Book a Free Trial Class" "trial class"}`. Do not use `query`; the
   current Gmail primitive ignores it.
5. Hydrate every relevant Gmail search result with `gmail_get_thread`. The
   search projection contains identifiers and mailbox identity; extract the
   candidate name, email, phone, student, and request details from the thread
   headers, snippet, and decoded body.
6. Build candidate family identities from all three sources. Retain normalized
   full name, email, phone, student name, and stable provider ids when present.
7. For every Gmail or Lead Director candidate without a direct Calendar match,
   expand the search before classifying:
   - search Calendar by exact email using the primitive's `q` filter;
   - search Calendar by normalized full name using the `q` filter;
   - search Calendar by another strong identity field or booking term returned
     by the source when the live schema supports it (`q`, not `query`, for the
     current Google Calendar primitive);
   - search Lead Director by exact email, phone, and full name as needed.
8. Merge expanded results and classify only after the candidate-specific
   searches finish.

An empty broad Calendar result never proves that a particular family has no
appointment when another source produced that family as a candidate.

## Identity matching

Use matches in this order:

1. Same stable provider or booking id.
2. Exact normalized email.
3. Exact normalized phone.
4. Exact full family name plus compatible trial date/time or student identity.

Treat last-name-only, first-name-only, or generic narrative-word matches as
weak candidates requiring another strong field. Do not match a family named
`Patience` to an unrelated event merely because its notes contain the word
`patience`.

Keep conflicting matches separate and label them `Needs review`.

## Classification

- `Scheduled`: a Calendar or configured booking-system event falls within the
  requested range, has an exact family match, and is not cancelled.
- `Needs confirmation`: the trial is scheduled and exact-matched, while the
  available Gmail/Lead Director evidence lacks a completed confirmation.
- `Needs scheduling follow-up`: a qualified inquiry exists, all required
  identity-expanded Calendar and Lead Director searches completed, and no
  scheduled event matched.
- `Needs review`: identity evidence conflicts or remains weak.
- `Source incomplete`: a required primitive failed, timed out, lacked the
  required fields, or could not search the exact identity. Never convert this
  state into `Needs scheduling follow-up`.

Gmail inquiry language such as “I would like an email reminder for my trial
class” proves intent and communication preference. It does not independently
prove that an appointment is scheduled.

## Draft selection

Prepare a draft only when the user requested drafts and classification is
complete:

- Scheduled and unconfirmed: confirmation draft containing the source-backed
  date, time, and class.
- Qualified inquiry with no matched event after query expansion: scheduling
  follow-up requesting availability.
- Needs review or source incomplete: prepare no family-facing draft; report the
  exact evidence conflict or source gap.

Use the published BOS draft primitive and preserve the connected mailbox
identity. Do not send Gmail.

## Output checks

Before responding, verify:

- every reported scheduled trial has an exact identity match and source-backed
  date/time;
- every family marked for scheduling follow-up has a completed targeted search
  trace;
- every family marked for confirmation has a scheduled event;
- counts equal the displayed classified records;
- the report states the resolved date range;
- source limitations are separated from genuine zero results.

For machine-checkable workflows, record the reconciliation trace as JSON and
run `scripts/validate_trial_reconciliation_trace.py TRACE.json`. The validator
rejects the Testy regression pattern: scheduling follow-up inferred without a
completed identity-targeted Calendar search, a weak name match used as final
evidence, or a scheduled classification lacking an exact event id.
