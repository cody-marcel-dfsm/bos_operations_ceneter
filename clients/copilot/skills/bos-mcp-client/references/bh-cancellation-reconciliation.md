# Bright Horizons Cancellation Reconciliation

## Supported automation status

This is a **supported, automated, read-only BOS workflow**. It composes
tenant-scoped Calimatic enrollment reads with tenant-scoped Gmail authorization
and cancellation reads, then deterministically performs parsing,
normalization, deduplication, matching, classification, and reporting.

The explicit user request is the automation trigger. It is not manual
reconciliation and does not make the workflow operator-assisted.

Keep these separate from reconciliation support:

- updating a Calimatic enrollment;
- accepting or declining a Bright Horizons reservation;
- calculating invoice-rate exceptions;
- unattended scheduling;
- persisting discrepancies in a dedicated app queue; and
- rendering a dedicated BOS app screen.

Report unavailable items from that list separately. Never use their absence to
label Bright Horizons cancellation reconciliation `partial`, `unsupported`, or
`not automated`.

## Trigger and scope

Interpret `BH` as Bright Horizons when the prompt concerns cancellations,
care authorizations, camps, students, or enrollments. Treat `reconcile BH
cancellations` as a complete read-only workflow without asking the user to
restate the date range or sources.

Use `bos_icode` exclusively. Resolve and preserve the selected iCode organization scope from
`bos_get_context`. Never query `bos_dfsm` or the native Gmail connector for
this workflow.

Resolve the reporting window in `America/Denver`:

- `start_date`: today's local date at the present moment.
- `end_date`: today's local date plus 60 calendar days.
- Treat both dates as inclusive and state them in the answer.
- Filter by the child/service date. Do not exclude an applicable cancellation
  because its email arrived before `start_date`.

## Source retrieval

1. Call the live Calimatic enrollment-listing tool for the full date window.
2. Retain enrollments identified by provider data as Bright Horizons, BH
   Back-Up Care, Authorization for Care, or an equivalent explicit BH marker.
   Preserve child name, service date, class/course, provider enrollment ID,
   and every returned lifecycle/status field needed to determine whether the
   enrollment remains active.
3. Search Gmail through `bos_icode` using this canonical query:

   `("Authorization for Care" OR "Cancellation" OR "Bright Horizons Enrollment Data") ("iCode organization" OR "iCode organization")`

4. Fetch every matching thread needed to cover the date window. Parse child
   name, service date, care-request number, message type, message date, and
   explicit authorization/cancellation language. Paginate when the live tool
   supports it. If the tool imposes an unpageable limit, disclose the limit and
   mark the reconciliation partial.
5. Deduplicate repeated notices while retaining both authorization and
   cancellation evidence. Never expose unrelated email bodies or contact data.

## Matching and decisions

Build one normalized child-day key per service date:

`normalized child name + service date`

Use normalized contact email and care-request number only as additional
evidence or to disambiguate collisions. Never merge two children solely by
family email.

Classify every child-day:

| Classification | Evidence | Decision |
|---|---|---|
| Matched active | Calimatic enrollment plus Gmail authorization; no cancellation | Active |
| Cancellation reflected | Gmail cancellation plus no Calimatic row, or an explicit cancelled/inactive Calimatic state | Cancelled and reflected |
| Cancellation not reflected | Gmail cancellation plus a Calimatic row that remains explicitly active/enrolled | Cancelled; stale Calimatic enrollment requires action |
| Cancellation status ambiguous | Gmail cancellation plus Calimatic fields that do not prove active or cancelled | Cancelled for attendance; manual Calimatic verification required |
| Calimatic only | Calimatic BH row with no matching Gmail authorization or cancellation | Manual verification |
| Gmail only active | Gmail authorization with no Calimatic enrollment | Missing Calimatic enrollment |
| Conflicting Gmail state | Both active and cancellation evidence for one child-day | Cancellation controls; report conflict |

An explicit Gmail cancellation controls attendance. Do not treat a generic
false boolean as proof of cancellation when another Calimatic lifecycle field
says `enrolled`. Do not infer that deletion occurred merely because a row is
absent; describe it as no matching current Calimatic enrollment.

## Required response

For `reconcile BH cancellations` and close variants, answer only the two
operational questions the user needs:

1. Did Gmail contain any Bright Horizons cancellations?
2. If so, are those cancellations reflected in current Calimatic enrollments?

Lead with a direct `Yes` or `No`. Use this default structure:

```markdown
Yes. I found **N cancellation child-days in Gmail**:

- Child: Month D-D, YYYY

Those cancellations are **[fully reflected / partially reflected / not reflected] in Calimatic**. [State the exact remaining-enrollment result in one sentence.]

Action: [one concise action, or `No action required.`]
```

When Gmail contains no applicable cancellations, say:

```markdown
No. I found no Bright Horizons cancellations in Gmail for service dates from YYYY-MM-DD through YYYY-MM-DD. No Calimatic cancellation action is required.
```

Group consecutive service dates by child for readability while counting each
child-day separately. Mention the resolved date window once. Do not include
general active enrollments, Gmail-only authorizations, Calimatic-only active
records, source audit tables, integration details, or lifecycle-field analysis
in the default answer unless they affect whether a cancellation is reflected.

Provide expanded tables, care-request numbers, email dates, active-enrollment
discrepancies, and the full source audit only when the user explicitly asks for
details, an audit, or troubleshooting.

Keep the result read-only; do not update Calimatic or Gmail unless the user
separately requests and approves a supported write operation.

## Completion checks

- Confirm both sources came through `bos_icode`.
- Confirm every included service date falls within the inclusive 60-day window.
- Confirm every Gmail cancellation was compared with current Calimatic state.
- Confirm every Calimatic BH child-day was compared with Gmail evidence.
- Confirm cancellation evidence controls attendance.
- Confirm no native Gmail connector was invoked.
- Classify a successful reconciliation run as automated. State repair,
  scheduling, or UI limitations separately when requested.
