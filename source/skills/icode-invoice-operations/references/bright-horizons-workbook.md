# Bright Horizons Attendance Invoice Workbook

This is an invoice-generation workflow. Do not load or run the Bright Horizons
cancellation-reconciliation workflow unless the user explicitly asks for
cancellation reconciliation in the same prompt.

## Source workflow

1. Resolve the user's requested period to inclusive ISO `start_date` and
   `end_date`. State the resolved dates.
2. Call `bos_icode.bos_get_context` and copy the authorized Calimatic, Gmail,
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
7. Use the authorization's approved hours. Use the configured Bright Horizons
   rate of `$103.00` per child-day unless the user explicitly supplies a
   different rate.
8. Build the workbook from the JSON contract below, inspect values/formulas,
   scan formula errors, render the invoice sheet, and visually verify it before
   delivery.

If any retained row lacks employee name, employer, case number, or approved
hours, stop before generation and report the exact unresolved fields and
records. Do not ask the user for the daily rate; `$103.00` is configured.

## Workbook contract

Pass this JSON shape to `scripts/build_bh_invoice.mjs`:

```json
{
  "date_submitted": "2026-06-14",
  "center_name": "iCode organization",
  "address": "[REDACTED_ADDRESS] Unit J, Glendale, CO 80246, USA",
  "billing_contact_name": "iCode [REDACTED_LOCATION]",
  "phone_number": "[REDACTED_PHONE]",
  "invoice_reference_number": "iCodeCC_5",
  "period_start": "2026-06-01",
  "period_end": "2026-06-12",
  "rows": [
    {
      "employee_name": "Joi Bowen",
      "employer": "Children's Hospital Colorado",
      "case_number": "10R-0T33-9CW1G",
      "number_of_children": 1,
      "date_of_care": "2026-06-01",
      "hours_of_care": 7,
      "other_comments": ""
    }
  ]
}
```

`rate_per_day` is optional. The generator applies the configured `$103.00`
child-day rate when it is absent. Include it only when the user explicitly
specifies a different approved rate.

Omit the script's output argument to use the configured directory:
`./output/invoices/bright-horizons/`. The generated filename is
`BH_Invoice_<period_start>_to_<period_end>.xlsx`. Supply an explicit second
argument only when the user requests another destination or filename.

## Layout and calculations

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
