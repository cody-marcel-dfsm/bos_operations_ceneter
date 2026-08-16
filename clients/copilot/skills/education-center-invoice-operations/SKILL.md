---
name: education-center-invoice-operations
description: Generate the exact Bright Horizons reimbursement Excel report from the distributed client template, answer Bright Horizons process, forwarding, billing, cancellation, and payment questions, and handle separate invoice discovery or reconciliation workflows through tenant-scoped BOS. Use for commands such as "create a Bright Horizons report for last week," "generate the Bright Horizons reimbursement sheet," "make the Bright Horizons attendance invoice," invoice discovery, cancellation reconciliation, child-day comparison, or provider capability gaps.
---

# Education Center Invoice Operations

## Tenant terminology

Load effective customer settings and resolve the brand through
`education-center-service-routing`. Use `brand_display_name`, or the active
skill extension's `terminology.brand_display_name` override, wherever
customer-facing output names the franchise or brand. Keep technical product,
skill, route, server, environment-variable, tool, capability, authorization,
and record identifiers unchanged.

Use `bos_education_center` and follow the `bos-mcp-client` context workflow. Identify the
invoice system of record before using Gmail, Drive, or enrollment evidence.
Use `bos-visual-output` for explicitly requested billing variances, child-day
comparisons, exception counts, and multi-period invoice summaries. Never invoke
it for a Bright Horizons reimbursement-report generation request; the Excel
workbook is the requested visual artifact.
Use only BOS MCP or published BOS backend APIs with the Education Center organization's
plugin credentials. Browser sessions and native/local connectors provide no
authorization, evidence, or fallback.
When Gmail, Drive, Calimatic, or an invoice provider reports an authentication
error, follow `bos-mcp-client` authentication recovery and prompt the user to
complete the service-specific secure BOS browser flow.

## Bright Horizons

- Read
  [references/bright-horizons-operating-rules.md](references/bright-horizons-operating-rules.md)
  for every Bright Horizons inquiry. Apply its intent routing, evidence
  precedence, addresses, cancellation policy, payment controls, and
  fail-closed exception handling.
- Treat Bright Horizons cancellation reconciliation as a supported automated
  read-only BOS workflow. An explicit user trigger and an unavailable
  Calimatic write operation do not make reconciliation partial.
- Classify reconciliation, provider repair, invoice generation, invoice-rate
  adjudication, scheduling, and app/UI packaging separately.
- Route by user intent before retrieving evidence:
  - Treat `create`, `generate`, `produce`, `make`, or `build` followed by a
    Bright Horizons `report`, `sheet`, `spreadsheet`, `invoice`, `attendance
    report`, or `reimbursement report` as one deterministic reimbursement
    workbook-generation intent. A period phrase such as `last week` is enough;
    never ask whether the user wants information or reconciliation.
  - For reimbursement workbook generation, run only the invoice-generation
    workflow. As a mandatory internal generation step, reconcile every
    candidate child-day against confirmation, cancellation, Calimatic, and
    written-exception evidence before building the workbook. Do not invoke or
    summarize the separate user-facing cancellation-reconciliation workflow,
    build an inline visualization, or return a roster-only report.
  - For `reconcile cancellations`, `check cancellations`, or equivalent
    cancellation-specific prompts, run the cancellation-reconciliation
    workflow.
  - For a combined request, run both and keep their results in separate
    sections.
- Use the configured invoice/accounting source as primary when available.
- For invoice generation, use BOS Gmail or Drive for Bright Horizons
  authorization, confirmation, cancellation, and written-exception evidence,
  and Calimatic for service/enrollment child-days.
- Invoke the BOS Bright Horizons cancellation reconciliation workflow only
  when the user explicitly requests cancellation work. The mandatory
  pre-invoice evidence reconciliation remains part of invoice generation and
  is not a second user-facing workflow.
- For requests to create the attendance invoice workbook, read
  [references/bright-horizons-workbook.md](references/bright-horizons-workbook.md)
  and follow it exactly.
- Require the distributed
  `assets/bright-horizons-reimbursement-template.json` and let the packaged
  builder consume it. Never recreate, restyle, substitute, or summarize the
  reimbursement layout from memory. Treat a missing or invalid template as a
  package error and stop before creating a workbook.
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
`.xlsx` workbook. Keep the user-facing response to one short summary plus the
attached workbook. Do not include cancellation commentary, reconciliation
counts, rosters, visualizations, builder paths, previews, or local HTML paths in
an invoice-only response. Never claim the workbook is ready while required
authorization fields, billing settings, source evidence, or the distributed
template are unresolved.
