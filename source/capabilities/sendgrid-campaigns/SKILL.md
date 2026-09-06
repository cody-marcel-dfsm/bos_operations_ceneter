---
name: sendgrid-campaigns
description: Prepare, validate, send, and reconcile permission-based, tenant-scoped SendGrid campaigns using deterministic tooling, suppression hygiene, tracking verification, and durable result artifacts.
---

# SendGrid Campaigns

Treat tenant, provider credential, sender, reply-to, physical address,
suppression group, category, audience, template, CTA domain, and artifacts as
one execution boundary.

Use only organization-owned audiences where every external recipient has
documented marketing permission for the campaign's sender, purpose, and
content. Never use purchased, rented, scraped, harvested, or inferred addresses.
Source membership or prior correspondence alone does not establish consent.
Never bypass or evade unsubscribe, suppression, complaint, bounce,
do-not-email, frequency, or provider controls. Exclude any recipient whose
permission is missing, ambiguous, withdrawn, or incompatible with the campaign.

## Workflow

1. Resolve the campaign through `marketing-analysis` and verify the owning BOS
   context and SendGrid provider readiness.
2. Inspect the HTML for hosted HTTPS images, valid CTA URLs, UTMs, unsubscribe
   behavior, sender identity, address, and mobile-safe rendering.
3. Validate the recipient source for email shape, duplicates, bounces,
   suppression status, unsubscribe evidence, and tenant ownership.
4. Use a reviewed deterministic send entrypoint for dry run, test, and list
   sends. Require a category, tracking configuration, attribution arguments,
   recipient mode, and result path in the prepared payload.
5. Send a test through the same entrypoint. Record acceptance, message ID,
   recipient, subject, category, template identity, and timestamp without
   exposing credentials or full lists.
6. Require explicit authorization before a list send. Save the result CSV and
   summary under the campaign's established `send_results/` directory.
7. For metrics, query current SendGrid activity, exclude test/internal activity
   and scanner clicks, and keep clicks distinct from bookings or purchases.

Stop on any tenant mismatch, missing suppression check, broken link, local
image, missing category, unverified sender, or unavailable deterministic send
path. Never substitute another ESP or account. A calendar-link click is a CTA
click; a booking requires Calendar, confirmation, or booking-system evidence.
