---
name: icode-invoice-operations
description: Handle iCode invoice discovery, reconciliation, and Excel workbook generation for Bright Horizons, Calimatic, and Care.com through the tenant-scoped BOS MCP. Use when asked to find invoices, compare billing evidence with enrollments or child-days, reconcile cancellations affecting invoices, identify missing invoice records, produce a Bright Horizons attendance invoice for a specified period, or report provider capability gaps.
---

# iCode Invoice Operations

Use `bos_icode` and follow the `bos-mcp-client` context workflow. Identify the
invoice system of record before using Gmail, Drive, or enrollment evidence.
Use `bos-visual-output` for billing variances, child-day comparisons, exception
counts, and multi-period invoice summaries.
Use only BOS MCP or published BOS backend APIs with the iCode organization's
plugin credentials. Browser sessions and native/local connectors provide no
authorization, evidence, or fallback.
When Gmail, Drive, Calimatic, or an invoice provider reports an authentication
error, follow `bos-mcp-client` authentication recovery and prompt the user to
complete the service-specific secure BOS browser flow.

## Bright Horizons

- Treat Bright Horizons cancellation reconciliation as a supported automated
  read-only BOS workflow. An explicit user trigger and an unavailable
  Calimatic write operation do not make reconciliation partial.
- Classify reconciliation, provider repair, invoice generation, invoice-rate
  adjudication, scheduling, and app/UI packaging separately.
- Route by user intent before retrieving evidence:
  - For `generate`, `create`, `produce`, or `make an invoice`, run only the
    invoice-generation workflow. Do not invoke, summarize, or mention the
    cancellation-reconciliation workflow.
  - For `reconcile cancellations`, `check cancellations`, or equivalent
    cancellation-specific prompts, run the cancellation-reconciliation
    workflow.
  - For a combined request, run both and keep their results in separate
    sections.
- Use the configured invoice/accounting source as primary when available.
- For invoice generation, use BOS Gmail or Drive for Bright Horizons
  authorization fields and Calimatic for service/enrollment child-days.
- Invoke the BOS Bright Horizons cancellation reconciliation workflow only
  when the user explicitly requests cancellation work.
- For requests to create the attendance invoice workbook, read
  [references/bright-horizons-workbook.md](references/bright-horizons-workbook.md)
  and follow it exactly.
- Generate the workbook with
  `scripts/build_bh_invoice.mjs <input.json> [output.xlsx]`. When the output
  argument is omitted, save it in `./output/invoices/bright-horizons/` as
  `BH_Invoice_<period_start>_to_<period_end>.xlsx`. The script requires
  `@oai/artifact-tool`; use the Codex workspace dependency loader and make a
  temporary `node_modules` symlink to its reported Node package directory.
- Keep builders, normalized inputs, previews, inspections, and other working
  files under a workflow-specific temporary directory. Keep only final
  workbooks, manifests, and required exception reports in the established
  operational invoice directory. Never place generated invoice artifacts or
  support files in a project root.

## Calimatic

- Use a Calimatic billing/invoice capability when the live manifest publishes
  one.
- Treat student and enrollment tools as attendance/enrollment evidence only.
  Never label those records as invoices.

## Care.com

- Use the Care.com plugin when it is configured and authorized.
- If absent, report `Care.com provider capability unavailable`.
- Never infer Care.com invoice state solely from Gmail.

## Reconciliation output

State provider, invoice period, primary invoice records, supporting evidence,
reconciled amount/count differences, cancellations affecting billing, and
action-required records. Preserve invoice and student privacy.

Classify successful Bright Horizons cancellation reconciliation as automated.
When cleanup cannot be applied in Calimatic, report
`reconciliation automated; Calimatic repair unavailable`.

## Invoice-generation output

For a generated Bright Horizons invoice, return the resolved inclusive period,
invoice reference, child-day count, invoice total, and a link to the final
`.xlsx` workbook. Do not include cancellation commentary in an invoice-only
response. Never claim the workbook is ready while required authorization fields
are unresolved.
