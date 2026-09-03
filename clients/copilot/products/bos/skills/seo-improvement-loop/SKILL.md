---
name: seo-improvement-loop
description: Run recurring tenant-scoped SEO and Google Business Profile review measurement, diagnosis, proposal, reconciliation, and exit decisions through BOS MCP evidence.
---

# SEO Improvement Loop

Use BOS for configured sites, provider health, Search Console, SERP, page,
conversion, reputation, and proposal evidence. Operate in
`observe_and_propose` mode unless the user authorizes a separate mutation
workflow and its `tools/call` result confirms server authorization. A static
catalog descriptor alone never grants mutation authority.

## Workflow

1. Resolve BOS context, plugin settings, site timezone, and the latest validated
   report for the same server-issued scope and site.
2. Read [references/mcp-tool-map.md](references/mcp-tool-map.md), then execute
   every useful available operation. Record executed, skipped, unavailable,
   and failed operations separately.
3. Keep Search Console, SERP, public-page, conversion, and reputation evidence
   source-specific. Label missing, delayed, modeled, and partial data.
4. Paginate reputation reviews through the trailing 26-week window. Deduplicate
   by provider review ID and calculate 7-, 30-, 90-day, last-complete-week, and
   weekly counts from provider timestamps in the configured timezone.
5. Reconcile active proposals, cooldowns, evaluation windows, protected
   winners, and page/query conflicts. Apply the detectors in
   [references/action-playbook.md](references/action-playbook.md).
6. Choose one proposal, `HOLD_AND_OBSERVE`, or a partial result. Require human
   review for every proposal and include exact changes, evidence, expected
   effect, risk, validation, and evaluation date.
7. Write only beneath the configured report root, validate against
   [references/report-contract.md](references/report-contract.md), and publish
   atomically with `scripts/validate_report.py`.

Lead the report with Google review performance and a 26-week chart, followed by
review analysis, operation status, evidence, decision, completeness, and next
action. Never infer zero from missing review rows or claim that BOS implemented
an externally observed page change.
