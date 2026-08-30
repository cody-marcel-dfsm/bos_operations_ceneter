---
name: marketing-analysis
description: Organize, audit, and analyze tenant-scoped marketing campaigns across SendGrid, email, Calendar, GA4, Google Ads, attribution, contact hygiene, suppressions, and campaign artifacts.
---

# Marketing Analysis

Treat the campaign's explicit business objective as the reporting contract.
Keep provider metrics separated until attribution is verified.

## Workflow

1. Resolve the campaign metadata: goal, ID, lifecycle, audience, channel,
   timestamp, primary KPI, required sources, and source artifacts.
2. Derive source priority from the objective. Partnership and appointment work
   requires mailbox and Calendar outcomes; announcements require delivery and
   analytics; paid ads require ad-platform and funnel evidence.
3. Route email through `email-account-routing`. Query all other providers
   through the server-issued BOS context or an explicitly authorized connector.
4. Pull current evidence before reporting current performance. Local artifacts
   identify the campaign and baseline; they do not prove live outcomes.
5. Separate sends, delivery, bounces, opens, human-filtered clicks, replies,
   bookings, sessions, events, spend, conversions, revenue, and suppressions.
   Exclude tests, internal recipients, and scanner activity by default.
6. Compare against the latest compatible snapshot when change is requested.
   Use one date window, timezone, and attribution definition.

## Output

Lead with `Bottom line`, `KPIs`, `What it means`, `Recommendation`, and `Next
action`. Use `BLOCKED: <source> access unavailable` when a required source
cannot be checked, and limit conclusions to verified facts. Create files only
when requested or when a durable source snapshot is part of the task.

For new campaigns, define the goal, KPI, audience, channel, source identifiers,
UTMs, provider categories, expected mailbox and Calendar keys, follow-up plan,
and effectiveness rule before a send. Preserve suppression fields and maintain
one person per contact row.
