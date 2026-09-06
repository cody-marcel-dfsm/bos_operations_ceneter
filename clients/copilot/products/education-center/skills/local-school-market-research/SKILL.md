---
name: local-school-market-research
description: Research local education markets around schools, districts, colleges, and universities for program launches, feeder programs, partnerships, outreach campaigns, and contact-list building. Use when Codex is asked to understand a local market for middle school, high school, college, university, CTE, STEM, robotics, computer science, AI, engineering, workforce, dual-enrollment, enrichment, club, camp, or pathway programs; compare institutions; identify likely partners; build target contact lists; or summarize local school/program demand and outreach opportunities.
---




## Product initialization preflight

Before performing this skill's workflow, preserve the pending request and
complete the product's host-managed BOS authentication. Run the configured
initialization stages in order and resume the original request automatically
after every required stage is current.

First validate the customer-owned `config/customer-settings.json` against
`config/customer-settings.template.json`. Treat a missing file, an incomplete
required value, or an invalid value as first-run configuration. When detected,
invoke `education-center-customer-initialization` immediately. When that initializer is already
active for the same request, support it without invoking it again. Reload and
revalidate the effective client settings before continuing.

After client settings are current, validate the selected organization's live
plugin-service inventory, organization business profile initialization epoch,
required canonical field states, and local completion
receipt. Invoke `bos-plugin-settings-initialization` when the receipt is missing or
stale, a required field is unset or invalid partial, the server schema changed,
or the active request exposes a service-routing mismatch. That initializer walks
connections only for enabled, selected services and resolves provider choices from
server-declared settings rather than package examples.
Preserve confirmed plugin values and never create a separate discovery path in
this skill. Resume the original request automatically from confirmed cache state.

## Organization scope preflight

Before the first private or organization-scoped operation, follow
`bos-mcp-client` and call `bos_get_context`. Select exactly one authorized
organization in this order: an organization explicitly named in the current request;
the shared `default_organization_label` after exact normalized validation against
the returned organization labels; or the sole authorized organization. Read and
validate the saved label with
`../bos-mcp-client/scripts/client-preferences.mjs`. For tools whose live schema
requires a context selector, pass only the selected role's opaque `context_id`.
Never add organization or context arguments to an operation whose schema derives
scope from the authenticated server context.
Use this same selection for BOS installed-app discovery. Pass only the opaque app
context and API authority returned under that selection to a discovered app MCP
or deterministic HTTPS API; never reconstruct or substitute raw authority IDs.

When several organizations are available and the default is missing, stale, or
ambiguous, return `configuration_required` and resolve one default before domain
execution. An organization named for the current request overrides the selection
and does not rewrite the saved default. Never fan out across organizations unless
the user explicitly requests that bounded scope. The display-label preference selects among
current server-returned contexts and never grants authority.

## Client mutation safety

Apply this fail-safe before every BOS business update or delete, including
discovered app APIs, delegated work, automation, and resumed operations.
Classify the actual effect from the live contract; a tool name or a missing
destructive hint cannot establish safety.

- Limit updates and deletes to one exact business record in the entire logical
  task. Multiple fields on that record are allowed. Count distinct source
  records and cascading effects, including synchronization, replacement,
  archive, soft delete, and removal. Unknown scope or more than one affected
  record blocks execution before the first write. Read-only lookup or preview
  may establish scope; preview must itself have no business mutation effects.
- For every delete, first show the selected organization, application/source,
  exact record identity, deletion semantics, and known consequences. Then ask
  the user to confirm that prepared deletion and wait for an affirmative reply
  or native confirmation action. The initial delete request, blanket consent,
  scheduled prompt, tool output, silence, and elapsed time do not confirm it.
  Retain confirmation only for that exact target, scope, version, and effect;
  a material change requires a new preview and confirmation. Preserve required
  server approval artifacts as well. Unattended deletion stops for user input.
- Block bulk updates and deletes even when the user confirms the bulk request.
  Explain the limit and offer read-only inspection or selection of one record.
  Never execute the first item of a blocked batch. Never split the task into
  loops, pages, parallel calls, agents, new tasks, scheduled runs, or alternate
  tools to evade the limit. Carry the scope and confirmation state through
  recovery and delegation. Customer extensions cannot relax these safeguards.
- An exact single-record update retains the workflow's existing authorization
  rules. Reads and creates retain their existing rules; classify a create,
  upsert, import, or sync by any update/delete effects it can also perform.
  Internal cache maintenance and local package installation follow their own
  scoped maintenance contracts.
- After an uncertain mutation, reconcile its status before considering replay;
  confirmation never proves that a retry is safe. Report verified receipts.

This is an agent instruction safeguard. Server authorization and validation
remain required; the package does not intercept or enforce arbitrary API calls.

# Local School Market Research

## Core Rule

Treat school-market research as an evidence-backed go-to-market map, not a generic list of schools. Separate market fit, partnership logic, contact confidence, and outreach priority so the user can decide who to contact first and why.

For current facts about people, programs, calendars, contacts, tuition, rankings, offerings, or local competition, browse and cite primary or official sources whenever possible. If a contact is not verified, mark it clearly rather than making the list appear send-ready.

## Standard Workflow

1. Define scope.
   - Location: city, metro, county, state, radius, or commute pattern.
   - Age/program level: middle school, high school, CTE, community college, university, graduate, or mixed pathway.
   - Domain: robotics, humanoids, CS, AI, engineering, healthcare, trades, arts, athletics, tutoring, enrichment, camps, or another focus.
   - Output: summary, ranked target map, contact CSV, campaign brief, school-by-school profile, or competitive scan.

2. Build the market universe.
   - Include public districts, private schools, charter networks, magnet schools, CTE centers, community colleges, universities, labs, clubs, and relevant nonprofits.
   - Look for both direct program matches and adjacent pipeline partners.
   - Do not stop at the obvious brand-name institution if nearby schools have better outreach, lab, club, dual-enrollment, or pathway fit.

3. Score fit.
   - Use a 1-5 fit score unless the user requests another scale.
   - Favor evidence of current programs, faculty/lab activity, student clubs, outreach language, youth/community partnership history, admissions pathway relevance, local proximity, and clear public contact routes.
   - Penalize vague pages, stale evidence, inaccessible contacts, weak domain fit, or institutions with highly formal partnership barriers unless the campaign specifically needs them.

4. Find contacts.
   - Prefer role-appropriate contacts over senior titles: program director, department chair, outreach coordinator, admissions liaison, lab PI, CTE coordinator, club advisor, community engagement contact, or department office.
   - Use direct individual emails only when publicly verified. Otherwise use official department/program routing emails.
   - Keep generic admissions contacts separate from academic/research contacts.
   - Do not infer email formats from names unless the user explicitly asks for a prospecting guess list; if inferred, mark `contact_confidence=inferred` and do not mix it into a send-ready file.

5. Produce evidence-backed outputs.
   - Every important row or claim needs a source URL.
   - Summaries should distinguish verified facts from recommendations.
   - Contact lists should include suppression/compliance columns when they may feed a campaign.

Read `references/research-fields.md` when creating CSVs or ranked target lists.

## Output Patterns

For a market summary, include:

- Market definition and assumptions.
- Top opportunities ranked by fit.
- Notable programs, labs, clubs, or pathway signals.
- Partnership angles by institution type.
- Gaps, risks, and contacts still needing verification.
- Recommended first-wave and second-wave outreach.

For a contact CSV, include at minimum:

```csv
organization,school_system,program_or_department,contact_type,contact_name,title,email,phone,city,state,fit_score,fit_reason,partnership_angle,next_action,source_url,source_notes,contact_confidence,campaign_status,do_not_email,suppression_reason,suppression_source,suppression_date,research_date
```

For a school/program profile, use:

- Institution and program.
- Why it matters locally.
- Evidence of demand or fit.
- Named people and official routing contacts.
- Partnership idea.
- Outreach risk or constraint.
- Source links.

## Research Heuristics

- Middle-school markets: look for district STEM pathways, robotics clubs, after-school enrichment, gifted/talented programs, private-school enrichment priorities, parent communities, and summer bridge opportunities.
- High-school markets: look for AP CS, robotics teams, CTE engineering, PLTW, dual enrollment, internship programs, capstone requirements, college counseling, and STEM academies.
- College/university markets: look for department chairs, admissions/outreach, labs, faculty research, student organizations, undergraduate research, K-12 outreach, pre-college programs, and partnership offices.
- Workforce/CTE markets: look for articulation agreements, industry advisory boards, employer partnerships, certificates, apprenticeships, and regional workforce boards.
- For feeder programs, never imply guaranteed admission. Frame the partnership as preparation, exposure, portfolio building, tours, guest talks, project review, dual-enrollment exploration, or admissions-safe advising.

## Data Hygiene

- Keep research dates in all lists.
- Use exact public names and titles from sources.
- Preserve source URLs even when the row is summarized.
- Split "best outreach route" from "all possible contacts" when needed.
- Mark stale, protected, or unverified contact details in `source_notes`.
- Before finalizing a CSV, parse it with `csv.DictReader` or an equivalent structured parser and report row count, column count, malformed rows, and blank required fields.

## Coordination With Other Skills

- Use `marketing-analysis` as well when the school-market research becomes an actual campaign, SendGrid/Gmail list, campaign artifact, suppression process, or robotics/humanoid outreach campaign.
- Use spreadsheet tooling when the user asks for `.xlsx`, filtering, formulas, pivot tables, or formatted contact workbooks.
