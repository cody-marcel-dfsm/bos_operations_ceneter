# Director daily planner content contract

Render one compact visual operating brief in this order. Follow
`bos-visual-output`. Omit an optional field only when the source does not
provide it, then summarize important omissions under Data checks.

## Header and snapshot

- Title: `Director Daily Planner — <Weekday, Month D, YYYY>`
- Location and time zone
- Generated-at time
- Snapshot totals: classes, enrolled students, trials, and new leads requiring calls
- First scheduled class and final scheduled activity

Present the snapshot as no more than three useful headline metrics. When the
day contains three or more scheduled items, lead with a chronological timeline
that combines classes, trials, callbacks, and operational deadlines.

## Priority actions

List up to five time-sensitive actions derived from the retrieved records. Use explicit times and action verbs. Prioritize imminent trials, missing trial confirmations, urgent new-lead callbacks, roster/contact gaps, and schedule conflicts.

## Today's schedule

Combine classes and trials into one chronological visual timeline. Retain this
compact table only when exact contacts or preparation details are operationally
necessary:

| Time | Activity | Student/family | Contact | Preparation or status |
|---|---|---|---|---|

Keep the class rosters below as the detailed source for enrolled students; the schedule can summarize a class by enrollment count.

## Classes and family contacts

Create one subsection per class, ordered by start time.

Class heading: `<start–end time> — <class name>`

Include the course or age band and instructor only when returned by BOS. Show the roster count, then:

| Student | Parent/guardian | Primary phone | Primary email | Operational note |
|---|---|---|---|---|

Use Operational note only for a source-backed item that affects today's service, such as first visit, pickup authorization gap, schedule conflict, or missing contact detail. Never expose sensitive narrative notes or infer attendance.

## Trials scheduled today

Order by scheduled time:

| Time | Student | Parent/guardian | Phone | Email | Trial/class | Status and preparation |
|---|---|---|---|---|---|---|

Status and preparation should show source-backed confirmation status, assigned class, owner when returned, and the next concrete preparation step. Flag a missing time, contact method, class assignment, or confirmation as `Action required`.

## New leads to call

Include active leads received within the planner's stated intake window that still require an initial call:

| Priority | Received | Parent/guardian | Student | Phone | Email | Interest/source | Last touch | Call objective |
|---|---|---|---|---|---|---|---|---|

Set Priority using source-backed operational urgency:

1. `Now`: same-day request, trial interest for today, or explicit urgent timing.
2. `High`: received more than four business hours ago with no completed connection.
3. `Standard`: all other qualified new leads awaiting initial contact.

Write a short Call objective grounded in the record, such as schedule a trial, confirm age/program fit, or reach the family for the first time. Do not invent an objective when interest data is absent; use `Qualify interest and next step`.

## Data checks

List only actionable issues:

- missing family phone or email;
- trial without a time, class, or confirmation state;
- roster record that could not be matched confidently to family details;
- duplicate or conflicting lead/trial records;
- source or capability unavailable;
- generation after an activity's scheduled time.

End with `Planner scope: content prepared only; no distribution performed.`
