---
name: landing-page-copywriting
description: Write, revise, audit, or structure high-converting landing pages, sales pages, funnel pages, hero sections, offers, headlines, calls to action, benefit copy, proof, FAQs, and risk reversal. Use when Codex works on landing-page strategy or copy, offer clarity, conversion messaging, Life-Force 8 psychological desires, fifth-grade readability, plain-language persuasion, or matching page content to an audience's strongest desire.
---

# Landing Page Copywriting

Write clear, specific pages that connect one audience, one problem, one offer, and one primary action.

## Required inputs

Establish these facts from the user's prompt and available source material:

- audience and current situation
- primary problem and desired outcome
- offer, price or commitment when known, and delivery mechanism
- credible proof
- primary call to action
- constraints, exclusions, and claims that require support

Ask for a missing fact only when guessing would materially change the offer or create an unsupported claim. Otherwise, state a reasonable assumption and draft.

When a canonical offer or campaign source exists, read it first and preserve its promise, qualifications, terms, and mechanism unless the user asks to change them.

## Workflow

1. Write a one-sentence message brief: `For [audience], this page offers [outcome] through [offer/mechanism], supported by [proof], with [CTA] as the next step.`
2. Select one primary Life-Force 8 desire and up to two supporting desires. Read `references/life-force-8.md` when selecting or applying them.
3. Turn the offer into a plain-language value statement: outcome, timeframe when supported, mechanism, price or effort, risk reversal, and next step.
4. Build the page in decision order using `references/page-framework.md`.
5. Draft the headline and hero first. Make the desired outcome clear within seconds.
6. Add proof next to the claims it supports. Use real evidence only.
7. Run `scripts/check_copy.py` on saved copy when practical. Revise until prose is near grade 5 and flagged jargon is removed or explained.
8. Audit the final page with the quality gates below.

## Copy rules

- Target a Flesch-Kincaid grade level of 5.0 or lower. Accept up to 6.0 when required names or regulated terms raise the score.
- Prefer short, familiar words, active voice, and sentences averaging 8–14 words.
- Use one idea per sentence and short paragraphs of one to three sentences.
- Remove technical jargon. Keep a necessary technical term only when accuracy requires it, then explain it immediately in everyday words.
- Translate features into customer outcomes. State what changes in the visitor's life or work.
- Make claims concrete and provable. Never invent results, reviews, scarcity, credentials, guarantees, or customer pain.
- Use the customer's language from interviews, reviews, calls, search terms, or source materials when available.
- Lead with the strongest desired outcome. Support emotion with clear facts, proof, and risk reduction.
- Address fear without exaggeration, shame, or coercion. Respect visitor agency.
- Use second person when natural. Keep the company out of the headline unless its identity is the value.
- Give each section one job and each page one primary CTA.
- Write button labels that describe the next step, such as `Book My Free Call` or `See Available Times`.
- Preserve legal, medical, financial, safety, and platform-required qualifications.

## Offer test

Confirm a visitor can answer these questions quickly:

1. Is this for me?
2. What will I get?
3. Why should I care now?
4. How does it work?
5. Why should I believe it?
6. What will it cost me in money, time, or effort?
7. What happens if it does not work?
8. What do I do next?

Strengthen the offer before polishing prose when any answer is missing.

## Output

For a full-page draft, provide paste-ready copy in page order with section labels, headlines, body copy, CTA labels, proof placeholders only where evidence is still needed, and brief implementation notes when useful.

For an audit, lead with the conversion issue, cite the exact copy causing it, recommend replacement language, and finish with the revised section or page.

## Quality gates

- One clear audience, offer, primary desire, and CTA
- Headline states a meaningful outcome in plain language
- Hero explains the offer without scrolling or insider knowledge
- Every major claim has nearby evidence or is softened to an honest statement
- Benefits are specific; jargon and filler are absent
- Reading level is grade 5 or lower, or a documented accuracy exception is present
- CTA says what happens next
- Objections, effort, risk, and expectations are answered
- Desire appeal matches the real offer and customer evidence
- Mobile scanning works through short sections, useful headings, and concise copy
