# Bright Horizons Attendance Invoice Workbook

This is the Bright Horizons reimbursement-report generation workflow. Commands
such as `create a Bright Horizons report for last week` mean this exact Excel
deliverable. Do not load or run the Bright Horizons cancellation-reconciliation
workflow unless the user explicitly asks for cancellation reconciliation in the
same prompt.

## Source workflow

1. Resolve the user's requested period to inclusive ISO `start_date` and
   `end_date`. State the resolved dates.
2. Call `bos_education_center.bos_get_context` and copy the authorized Calimatic, Gmail,
   and Drive scope identifiers exactly.
3. List Calimatic enrollments for the period. Retain only records whose course
   is `Bright Horizons Enrollment` or whose class name begins
   `Bright Horizons Camp -`.
4. Treat each retained student/date record as one child-day only after
   validating that its Calimatic `enrollment_status` is enrolled. Do not search
   for, report, or reconcile cancellation emails during invoice generation.
5. Retrieve the Bright Horizons authorization evidence through BOS Gmail or
   Drive. Match by guardian/employee identity and the service dates. Capture
   `employee_name`, `employer`, and `case_number`. Never infer these fields from
   email domains or Calimatic.
6. Group child-days by `employee_name`, `employer`, `case_number`, and
   `date_of_care`. Set `number_of_children` to the count of distinct enrolled
   students in that group.
7. Load the installed product's `config/customer-settings.json`. Use the
   authorization's approved hours and
   `billing.bright_horizons_rate_per_child_day` unless the user explicitly
   supplies a different approved rate. Stop when required billing settings are
   absent.
8. Verify that the installed skill contains
   `assets/bright-horizons-reimbursement-template.json`. Build the workbook with
   the packaged script, which validates and consumes that template. Never
   recreate the layout from prose or substitute another workbook.
9. Inspect values/formulas, scan formula errors, render the invoice sheet, and
   visually verify it before delivery.

If any retained row lacks employee name, employer, case number, or approved
hours, stop before generation and report the exact unresolved fields and
records. Load the daily rate from the installed customer settings. Never
hardcode or infer a rate; repair an absent setting through
`education-center-customer-initialization` before resuming generation.

## Workbook contract

Pass this JSON shape to `scripts/build_bh_invoice.mjs`:

```json
{
  "date_submitted": "2026-06-14",
  "center_name": "<billing.center_name>",
  "address": "<billing.address>",
  "billing_contact_name": "<billing.billing_contact_name>",
  "phone_number": "<billing.phone_number>",
  "invoice_reference_number": "<billing.invoice_reference_prefix><sequence>",
  "rate_per_day": "<billing.bright_horizons_rate_per_child_day>",
  "period_start": "2026-06-01",
  "period_end": "2026-06-12",
  "rows": [
    {
      "employee_name": "<authorization employee name>",
      "employer": "<authorization employer>",
      "case_number": "<authorization case number>",
      "number_of_children": 1,
      "date_of_care": "2026-06-01",
      "hours_of_care": 7,
      "other_comments": ""
    }
  ]
}
```

`rate_per_day` is required in the normalized builder input. Populate it from
`billing.bright_horizons_rate_per_child_day`. Use another value only when the
user explicitly supplies a different approved rate.

Omit the script's output argument to use the configured directory:
`./output/invoices/bright-horizons/`. The generated filename is
`BH_Invoice_<period_start>_to_<period_end>.xlsx`. Supply an explicit second
argument only when the user requests another destination or filename.

## Layout and calculations

- Treat `assets/bright-horizons-reimbursement-template.json` as authoritative
  for worksheet name, label cells, header cells, colors, borders, formats,
  column widths, row heights, and totals placement.
- Use a single worksheet named `Invoice`.
- Put submission metadata in rows 1–6, labels in column A and values beginning
  in column B.
- Leave row 7 blank.
- Use this exact header order in row 8:
  `Employee Name`, `Employer`, `Case #`, `# of Children`, `Date of Care`,
  `# of Hours of Care`, `Rate per Day`, `Amount`, `Other Comments`.
- Sort rows by employee name, employer, case number, then date of care.
- Calculate each Amount as `# of Children * Rate per Day` with a formula.
- Put `Total Children` and the sum of `# of Children` two rows below the last
  detail row.
- Put `Total:` and the sum of Amount on the same totals row.
- Match the reference style: light-blue bold centered header, black borders,
  white detail rows, dates as `mm/dd/yy`, and currency as `$#,##0.00`.
- Preserve case numbers as text.
- Export `.xlsx`. The reference file happens to be macro-enabled; this invoice
  contains no macros and does not require `.xlsm`.

## Quality checks

- Confirm every detail date is within the inclusive requested period.
- Confirm grouped child counts reconcile to distinct Calimatic student/date
  records.
- Confirm the total amount equals the sum of row amounts.
- Confirm no formula errors, clipped headers, clipped identifiers, or blank
  required fields.

## Delivery contract

Return one short summary containing the inclusive period, invoice reference,
billable child-day count, and invoice total, followed by the attached final
`.xlsx` workbook. Do not emit an inline visualization, roster-only report,
reconciliation commentary, preview file, builder file, or local filesystem
path.
