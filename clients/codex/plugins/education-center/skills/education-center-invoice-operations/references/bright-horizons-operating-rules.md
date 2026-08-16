# Bright Horizons Deterministic Operating Rules

Apply these rules to every Bright Horizons inquiry before selecting a report,
reconciliation, explanation, or operational action. They define routing and
evidence treatment; BOS remains the source of authorized business state.

## Intent routing

- `Create`, `generate`, `produce`, `make`, or `build` a Bright Horizons
  `report`, `sheet`, `spreadsheet`, `invoice`, `attendance report`, or
  `reimbursement report` means the exact reimbursement workbook in
  `bright-horizons-workbook.md`.
- A roster, capacity, attendance, placement, or next-week camp request belongs
  to `education-center-class-operations`. Bright Horizons child-days are
  enrollment demand in that report and never become their own camp section.
- A cancellation check or reconciliation request runs the Bright Horizons
  cancellation-reconciliation workflow.
- A question about process, forwarding, billing, payment, complaints, or a
  named issue receives a concise answer from these rules and current
  authorized evidence. It does not generate a workbook unless the user asks
  for one.
- A combined request runs each requested workflow and keeps the deliverables
  separate.

## Evidence precedence

Use the strongest record available for each child and date of care:

1. Current Bright Horizons authorization, confirmation, cancellation, or
   written exception approval retrieved through the authorized BOS evidence
   route.
2. The corresponding Calimatic Bright Horizons record and its processing,
   billing, and payment state.
3. A saved daily Bright Horizons/Calimatic export used only to identify a
   discrepancy when current provider history is unavailable.
4. Peer discussion used only as a risk indicator or search lead.

Peer discussion and a generic Calimatic boolean never override an explicit
Bright Horizons cancellation or written provider decision. Stop on conflicting
records that cannot be resolved by timestamp and child/date/care-request
identity.

## Confirmation and cancellation intake

- Forward every Bright Horizons confirmation and cancellation message
  immediately to `brighthorizonsenrollments@calimatic.com`.
- This is the shared Calimatic parser address. It is not a location-specific
  mailbox. Location and care-request identity come from the forwarded provider
  message and server-side configuration.
- A processed confirmation creates or updates the Bright Horizons class,
  family, student, enrollment, and dashboard record. A processed cancellation
  marks the matching record cancelled.
- Use the provider message timestamp and care-request identity as evidence;
  never use the time the location forwarded the message as the cancellation
  time.
- Verify that Calimatic reflects the forwarded message. A missing, duplicated,
  cross-location, partially cancelled, or still-enrolled record is an explicit
  discrepancy. Preserve the provider message and escalate for repair; never
  silently repair invoice evidence in the client.
- When Bright Horizons failed to generate one or more cancellation messages,
  preserve the provider ticket and classify the affected child-days as
  unresolved until authoritative evidence identifies their status.

## Cancellation billing policy

Calculate one disposition for every child/date before invoice generation.
Use the service location's configured timezone.

- `Active`: a valid authorization/confirmation exists and no cancellation
  controls the child-day. Bill the configured full daily rate.
- `Timely cancellation`: Bright Horizons records the cancellation by 5:00 p.m.
  two business days before the date of care. Exclude the child-day. For a
  Monday date of care, the normal cutoff is the preceding Thursday at 5:00
  p.m.
- `Late cancellation`: Bright Horizons records the cancellation after that
  cutoff and before care begins. Bill 50% of the configured daily rate and
  identify the cancellation timestamp and disposition in `Other Comments`.
- `Post-start cancellation`: the cancellation occurs after care has begun.
  Bill the full daily rate only when written Bright Horizons approval supports
  that treatment. Preserve the approver and approval evidence in
  `Other Comments`.
- `Unresolved`: missing cancellation notices, conflicting provider states,
  Calimatic-only child-days without provider authorization, provider-confirmed
  child-days without Calimatic service evidence, ambiguous care dates, missing
  timestamps, and post-start cancellations without written approval block
  workbook generation. Return the exact child, date, care-request number, and
  missing evidence.

Treat business days as Monday through Friday. When the cutoff interval crosses
a provider-observed holiday and the authorized evidence does not define that
holiday's treatment, classify the disposition as unresolved instead of
guessing.

## Invoice and payment controls

- Reconcile the Bright Horizons dashboard, Calimatic, and newly received
  provider messages each business day. Preserve a dated export or normalized
  snapshot because historical provider portal days may become unavailable.
- Generate invoices weekly by default so confirmation, cancellation, and
  payment evidence remain bounded and reviewable.
- Submit each billable child-day within 45 calendar days of the date of care.
  Flag any unsubmitted child-day at 35 days and block a report that would omit
  an older unresolved child-day merely to meet the deadline.
- Send a completed invoice to `providerbilling@brighthorizons.com` only when
  the user explicitly requests delivery and the workbook passed every quality
  check.
- Keep the invoice-generation operation separate from sending, marking paid,
  and repairing Calimatic.
- Mark Bright Horizons records paid only after ACH, check, or other funds have
  actually arrived. Use the received amount; never infer payment from an
  invoice being sent or accepted.
- After payment, verify that the payment/fee transaction is represented once
  in Calimatic revenue reporting. Treat a mismatch as a reconciliation issue.
- Preserve invoice, remittance, deposit, and exception-approval evidence.

## Known failure modes to check

Check for missing reservation offers, confirmations without offers, partial
multi-day cancellation notices, parser failures, reused care-request IDs across
locations, phantom or stale enrollments, provider records that remain confirmed
after cancellation, inaccessible historical portal days, delayed remittance,
and returned invoices. These are checks, never assumptions that change a
child-day without record-level evidence.
