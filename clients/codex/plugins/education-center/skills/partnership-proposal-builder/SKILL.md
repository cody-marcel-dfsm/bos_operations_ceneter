---
name: partnership-proposal-builder
description: Build concise, professional partnership proposal documents and PDFs for school, enrichment, robotics, STEM, education-center, or local partner programs. Use when drafting, revising, formatting, splitting, or exporting a partnership proposal, school proposal, program proposal, option proposal, sales proposal, customer-facing PDF, or editable proposal source, especially when pricing, curriculum, calendars, cohort structure, summer camps, humanoid robotics, or school-year programs are involved.
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

After client settings are current, validate the server plugin-settings
initialization epoch, required canonical field states, and local completion
receipt. Invoke `bos-plugin-settings-initialization` when the receipt is missing or
stale, a required field is unset or invalid partial, or the server schema changed.
Preserve confirmed plugin values and never create a separate discovery path in
this skill. Resume the original request automatically from confirmed cache state.

# Partnership Proposal Builder

## Core Standard

Build proposals as sales documents, not notes dumps.

Lead with the partner's decision, the program structure, and the operational fit. Keep support detail organized in tables. Remove anything that creates friction, confusion, or internal-language overhead.

## Session-Learned Rules

- Write direct affirmative recommendations.
- Keep customer-facing prose concise.
- Do not use negative-contrast framing such as "not X, but Y."
- Do not put normal proposal copy in fenced code blocks.
- Do not include internal curriculum names, belt colors, system labels, or jargon unless the customer already knows and values those terms.
- Translate internal curriculum names into plain outcomes: early STEAM, computing foundations, robotics and design, advanced robotics/coding/AI.
- Do not put a large total price in the hero, top summary, or anywhere the user has said it creates sticker shock.
- If pricing is needed, show rate, unit, weekly fee, or pricing basis. Hide annual totals unless the user explicitly asks for them.
- Remove filler sections such as "Next Steps" when they restate obvious process items.
- Remove decorative metric cards, callout boxes, and big summary blocks when the user says they waste space.
- For schools, avoid implying control over the school day. Say class blocks are scheduled around the school's master schedule.
- Separate materially different offers into separate proposals instead of combining them into one document.

## Proposal Architecture

Use one standalone proposal per distinct buyer decision.

Common split:

| Proposal | Use |
| --- | --- |
| Core school-year program | The clean, easy-to-approve proposal the partner asked for |
| Summer boot camp / enrichment | Parent-paid or school-coordinated summer cohorts |
| Advanced robotics / humanoid track | Strategic, higher-ambition option with showcase and marketing value |

Do not mix the "bankable" core proposal with the speculative strategic proposal unless the user asks for a combined overview.

## Content Rules

### Core School-Year Proposal

Include:

- Title and prepared-for block.
- One short subtitle.
- Program Structure table.
- Pricing table with rate/unit/weekly basis only unless requested otherwise.
- Curriculum by Level table.
- Calendar Basis table when dates matter.
- Proposed dates in a compact format when requested.

Avoid:

- Annual total as a headline metric.
- Internal curriculum labels.
- Explanatory callouts that repeat the table.
- Next steps filler.
- Exact daily timing unless the school supplied it.

Recommended table labels:

| Section | Preferred language |
| --- | --- |
| Core curriculum | Age-banded coding, robotics, engineering, design, and AI curriculum |
| Student scope | Older PreK / ages 5-6 through 8th grade, when applicable |
| Class structure | 7 age-banded class blocks per Wednesday, scheduled around the school's master schedule |
| Pricing basis | $X per scheduled class block |

### Curriculum Language

Use plain customer-facing curriculum areas:

| Age band | Curriculum area |
| --- | --- |
| Older PreK / Kindergarten | Early STEAM |
| 1st-2nd grade | Computing foundations |
| 3rd grade | Computing and robotics bridge |
| 4th-5th grade | Robotics and design |
| 6th-8th grade | Advanced robotics, coding, and AI |

Write curriculum focus as outcomes and activities:

- sequencing, patterns, storytelling, design challenges
- Scratch, logic, circuits, inputs/outputs, AI concepts, prompting
- VEX IQ, sensors, engineering design, 3D design, electricity, troubleshooting
- Python, AI, drones, Arduino, automation, data science, human-robot interaction

### Humanoid Robotics Proposal

Frame as its own strategic pathway.

Include:

- Program Structure.
- Why It Fits the partner.
- Pathway Model: summer boot camp, second boot camp/fall intensive, school-year advanced cohort, showcase.
- School-Year Curriculum Alignment.
- Summer Boot Camp Offer with per-student pricing if requested.
- Showcase Outcome.
- Reference Links.

Position the marketing value plainly:

"Creates a visible innovation project families can rally around during the school year."

Avoid making the whole school-year core program seem dependent on humanoid robotics unless the user explicitly wants that.

### Summer Proposal

Use existing camp inventory when available. Favor already-created camps with students or clear fit.

Group options by use case:

- Minecraft Redstone: logic, circuits, systems thinking.
- VEX / robot squads: robotics teamwork and engineering challenge.
- 3D design / printing: prototyping and spatial reasoning.
- Minecraft / Roblox / Fortnite: coding, game design, creative technical expression.
- Humanoid robotics: advanced AI, robotics, human-robot interaction, testing, documentation, showcase.

## PDF Workflow

When a final customer-facing PDF is requested:

1. Create or update an editable source file first. HTML with print CSS is acceptable and easy to render.
2. Render to PDF.
3. Extract PDF text to verify required content and forbidden terms.
4. Render page previews or thumbnails and visually inspect for:
   - blank pages
   - awkward page breaks
   - cramped columns
   - huge whitespace
   - hero elements that create sales friction
   - pricing displayed too prominently
5. Iterate before final response.

If using HTML:

- Keep design professional and restrained.
- Use tables for structured proposal information.
- Avoid UI-like metric cards unless the user explicitly likes them.
- Use compact section spacing.
- Prefer full-width tables when columns become cramped.
- Use brand-light styling; avoid visual clutter.

## Verification Checklist

Before finalizing a proposal PDF, check:

- No unwanted annual total.
- No internal belt/color labels.
- No "Next Steps" filler if the user objected to it.
- No decorative callout/metric sections if the user objected to them.
- No exact school-day schedule invented by Codex.
- Proposal option boundaries are clear.
- Pricing is where it belongs and framed at the correct level.
- PDF has no blank pages.
- PDF text extraction contains the expected sections.
- Page previews look clean.

## Final Response

Return the PDF path and editable source path. Mention only the important validations performed. Keep the response short.
