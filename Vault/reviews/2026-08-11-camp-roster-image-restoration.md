# Camp roster image restoration review

## Scope

Review the restored five-day camp roster image contract, deterministic renderer,
family-phone separation, tests, and generated client parity. This verdict is
limited to:

- `source/verticals/education-center/education-center-class-operations/`;
- its generated Codex, Claude, Copilot, and Gemini skill copies;
- the camp-roster assertions in `tests/package-model.test.mjs`; and
- the corresponding installed personal camp-capacity presentation guidance.

The worktree contains other in-progress changes outside this scope. This review
does not approve those changes.

## Architecture evidence

- The output rule belongs in the Education Center vertical specialization under
  `source/verticals/`, consistent with `Vault/docs/architecture.md:8-17`.
- Private roster retrieval remains on the named BOS route and server-derived
  scope in `source/verticals/education-center/education-center-class-operations/SKILL.md:14-43`,
  consistent with `Vault/docs/architecture.md:23-40` and
  `Vault/docs/CONSTITUTION.md:3-16`.
- The client only renders verified business state. The renderer accepts five
  day objects, fixed roster categories, and exact student/camp pairs at
  `source/verticals/education-center/education-center-class-operations/scripts/render_week_calendar.py:31-61`;
  it performs no retrieval, reconciliation, mutation, or credential handling.
  This preserves the server-owned-state contract in
  `Vault/docs/CONSTITUTION.md:7-8`.
- The skill requires one `Student — Camp` line per attendance day and keeps
  guardian phones outside the image, once per family, at
  `source/verticals/education-center/education-center-class-operations/SKILL.md:75-100`. Missing or
  uncertain data remains explicit at lines 87-103, preserving fail-closed
  behavior.
- Canonical generation remains intact under
  `Vault/docs/architecture.md:41-44` and `Vault/docs/CONSTITUTION.md:17-20`.
  The renderer SHA-256 is identical in canonical source and all five generated
  client copies.

## Validation evidence

- Recovered-reference render: 1800×760 PNG visually inspected with weekday
  cards, repeated child/day placement, exact camp labels, source groups, and
  daily headcounts.
- `python3 .../quick_validate.py` passed for the personal
  `camp-capacity-planning` skill and canonical `education-center-class-operations` skill.
- `node --test tests/package-model.test.mjs`: 35 passed, 0 failed. The focused
  contract and renderer test is at `tests/package-model.test.mjs:160-224`.
- `npm test`: 115 passed, 0 failed.
- `npm run check`: package structure, generated-source parity, and credential
  scan passed.
- `npm run check:build`: release archive and customer ZIP checks passed.

## Findings

No material findings. The change restores the requested roster image without
moving business-state ownership, authority, credentials, or reconciliation into
the client renderer.

APPROVED
