---
name: local-school-market-research
description: Research local education markets around schools, districts, colleges, and universities for program launches, feeder programs, partnerships, outreach campaigns, and contact-list building. Use when Codex is asked to understand a local market for middle school, high school, college, university, CTE, STEM, robotics, computer science, AI, engineering, workforce, dual-enrollment, enrichment, club, camp, or pathway programs; compare institutions; identify likely partners; build target contact lists; or summarize local school/program demand and outreach opportunities.
---

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
