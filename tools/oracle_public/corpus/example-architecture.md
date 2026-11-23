# Synthetic Task Board Architecture

## Title validation

A task has an immutable local identifier and an inert text title. Its create boundary trims outer whitespace and rejects a title that becomes empty. Internal whitespace and ordinary Unicode text remain data. Validation happens before persistence, so rejected input creates no task.

## Regression evidence

An earlier synthetic defect admitted a title made entirely of spaces. The curated regression case asserts rejection with zero persisted records. Separate positive cases retain a nonempty title and preserve internal spacing. No billing, identity, organization or external-provider behavior is implemented by this example.

## Validation

The public proposal-to-spec test verifies the conceptual judge's structured plan and seal. Implementation acceptance must separately exercise both the empty-input boundary and existing valid-title behavior. Context relevance alone proves no implementation correctness or downstream quality improvement.
