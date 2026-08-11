# Director daily planner content contract

Render one compact, camp-first operating brief for the selected local day.
Follow `bos-visual-output` and
[mobile-visual.md](mobile-visual.md). Include only the minimum student and
family details needed for authorized daily school operations.

## Header

- Title: `Director Daily Planner — <Weekday, Month D, YYYY>`
- Location and time zone
- Generated-at time
- Source status: complete or source-specific partial
- Snapshot totals: camps, expected camp students, camp-family calls, trials,
  and qualified new leads requiring calls

## Camps today

Place this section first. Create one subsection per camp in chronological
order.

Camp heading: `<start–end time> — <camp name>`

Show instructor, room, age band, capacity, supplies or preparation, and
schedule changes only when BOS returns them. Then list every student expected
for that camp today:

| Student | Parent/guardian | Primary family phone | Enrollment source | Attendance/arrival state | Parent note or action |
|---|---|---|---|---|---|

Use exactly these enrollment-source labels:

- `Paid enrollment` for a source-backed paid Calimatic enrollment;
- `Care.com` for a confirmed Care.com backup-care child-day explicitly assigned
  to this camp occurrence and date;
- `Bright Horizons` for a published BOS record explicitly identifying Bright
  Horizons and assigning the student to this camp occurrence and date; or
- `Needs review` when evidence is missing, conflicting, or cannot establish
  the payer.

Keep confirmed but unassigned Care.com or Bright Horizons child-days out of a
camp roster. List them under Camp-family calls and exceptions as `Needs review`
placement demand.

Attendance/arrival state may include a source-backed expected arrival or
departure time, confirmed absence, late arrival, early pickup, checked-in
state, or `Not returned by source`. Never infer attendance from enrollment.
Write `Missing in BOS — call list incomplete` when the primary phone is absent.

Parent note or action contains only a relevant operational fact from a
source-backed communication, such as an attendance change, pickup issue,
schedule question, accommodation requiring preparation, or requested callback.
Omit message bodies, sensitive narrative, and unrelated family information.

If no camps are returned, state `No camps returned for this day` only after a
successful date-bound camp search. When the source is unavailable, retain this
section and name the missing capability instead of reporting zero camps.

## Camp-family calls and exceptions

List today's camp-related calls and corrections in urgency order:

| Priority/time | Family/student | Phone | Camp | Reason | Next action |
|---|---|---|---|---|---|

Prioritize a camp starting soon, unconfirmed attendance, changed attendance,
pickup or schedule conflicts, missing contacts, duplicate payer records, and
preparation needs. Never invent a reason, owner, or deadline.

## Today's timeline and upcoming events

Combine camps, trials, callbacks, operational deadlines, and material Calendar
events into one chronological timeline. Include relevant events in the next 48
hours when they require preparation today.

| Time | Activity or event | People/count | Operational impact | Preparation or action |
|---|---|---|---|---|

State `No upcoming events returned by Calendar` only after a successful bounded
Calendar search.

## Other classes and trials

After camps, list non-camp classes and today's trials when exact contacts or
preparation are operationally necessary:

| Time | Activity | Student/family | Phone | Status | Preparation or action |
|---|---|---|---|---|---|

Flag a missing time, phone, class assignment, or confirmation as
`Action required`.

## New leads to call

Include active qualified leads received within the stated daily intake window
that still require an initial call:

| Priority | Received | Parent/guardian | Student | Phone | Interest/source | Last touch | Call objective |
|---|---|---|---|---|---|---|---|

Set Priority using source-backed urgency: `Now` for same-day timing, `High` for
an overdue first connection, and `Standard` for other qualified new leads.
Use `Qualify interest and next step` when the record does not support a more
specific objective.

## Data checks

List only actionable issues:

- missing camp, roster, family phone, or enrollment-source evidence;
- camp student without a source-backed attendance or arrival state;
- trial without a time, class, phone, or confirmation state;
- roster record that cannot be matched confidently to family details;
- duplicate or conflicting payer, lead, trial, or schedule records;
- source or capability unavailable; or
- generation after an activity's scheduled time.

End with `Planner scope: content prepared only; no distribution performed.`
