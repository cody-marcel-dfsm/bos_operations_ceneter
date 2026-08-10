---
name: icode-class-operations
description: Handle iCode class rosters, schedules, capacity, and camp-assignment scenarios through tenant-scoped BOS data plus Care.com confirmations from the configured customer mailbox. Use when asked about classes, camps, enrollment reports, rosters, attendance dates, open seats, Bright Horizons or Care.com placement, or assigning students to camps.
---

# iCode Class Operations

This skill is for authenticated adult school staff performing legitimate
school administration. Students and minors are data subjects, never users or
operators. Access and display only the minimum student or family information
needed for the requested roster, capacity, attendance, or placement task. Do
not publish, export, or distribute it without a separate authorized request.

Use the named `icode-operations` MCP connection and follow the
`bos-mcp-client` context workflow.
Use Calimatic for class/enrollment state and Calendar only as schedule evidence.
Resolve the effective customer settings by loading the packaged settings
template and recursively overlaying the preserved customer settings file. For
Care.com Backup Care evidence, follow `source_routes.care_com`:

- `bos`: use published `icode_search_email_evidence` and
  `icode_get_email_thread` through the named iCode connection.
- `connected_gmail`: invoke `email-account-routing`, select the exact
  `mailboxes.care_com` account, and use the normal Gmail connector's bounded
  search and full-thread retrieval tools.

Stop with a source-specific configuration result when the selected route or
required mailbox is unavailable. Never copy the mailbox into this packaged
skill or silently switch to another account.
Use `bos-visual-output` for multi-class schedules, capacity, attendance, and
camp-assignment results.
When the user requests Calimatic, use the packaged iCode skill-group connection
and omit `org_id`, `app_code`, `installed_app_id`, and `delegated_role_id`; BOS
derives them from the authenticated installation. Never use a direct provider
client or browser session as a fallback for a BOS-routed domain. When BOS
reports an authentication or credential error, follow its secure handoff flow.
When `connected_gmail` reports an account error, use the Gmail connector's
native recovery for the exact configured mailbox. Never request a secret in
chat. If a required capability is unavailable, return a useful partial result
with the exact missing route, capability, scope, and freshness.

## Classes and rosters

- Use the authorized BOS enrollment-listing capability for date-bound rosters.
- Search the configured Care.com evidence source for provider notices. Use a
  bounded lookback of up to 180 days before the
  requested period through its end, then retain only child-days whose service
  date falls inside the requested period. Hydrate every relevant hit with
  the selected route's full-thread tool before interpreting confirmation or
  cancellation.
- Group Care.com messages by numeric job ID. Count a `Backup Care Job
  Confirmation ID: <job_id>` with body status `Confirmed` as active enrollment.
  Retain `New Backup Care Job Request ID: <job_id>` with status `New` as pending
  evidence and never double-count the paired notices.
- Expand each service-date line in a confirmed message into one Care.com
  child-day. Preserve child, job ID, site, date/time, estimated payment, age,
  parent, comments, message timestamp, and source.
- Let an explicit later cancellation for the same job ID/date exclude that
  child-day. Never infer cancellation from silence.
- Preserve class, course, student, service date, and provider provenance.
- Never infer missing class dates or instructor assignments.

## Camp assignment

- Apply the `camp-capacity-planning` seat model and Bright Horizons rules.
- Treat confirmed Care.com child-days as seat-fill demand alongside Bright
  Horizons child-days. Never display Care.com as a camp/class.
- Anchor scenarios in real Calimatic camp sections, dates, paid rosters, and
  capacity.
- Label a Bright Horizons student under a camp/day only when Calimatic or
  another published BOS record explicitly identifies Bright Horizons and
  assigns that student to the exact camp occurrence and date. Keep generic or
  unassigned Bright Horizons child-days out of camp rosters and report them as
  `Needs review` placement exceptions.
- Label a Care.com student under a camp/day only when a confirmed child-day is
  explicitly assigned to that exact camp occurrence and date. Report confirmed
  but unassigned Care.com demand as a `Needs review` placement exception.
- Treat assignment as a proposed scenario until an authorized Calimatic update
  tool is published and the user requests execution.

## Output

State the date range, class roster or capacity result, assignment scenario,
open seats, conflicts, and action required. Never represent a recommendation as
a completed provider update.
