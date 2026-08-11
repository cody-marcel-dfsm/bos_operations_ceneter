#!/usr/bin/env python3
"""Validate trial-reconciliation traces before family classification."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


FOLLOW_UP = "Needs scheduling follow-up"
SCHEDULED = {"Scheduled", "Needs confirmation"}


def _completed_searches(candidate: dict[str, Any]) -> set[tuple[str, str]]:
    searches: set[tuple[str, str]] = set()
    for item in candidate.get("targeted_searches", []):
        if item.get("completed"):
            searches.add((str(item.get("source", "")).lower(), str(item.get("field", "")).lower()))
    return searches


def validate_trace(trace: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not trace.get("date_range"):
        errors.append("trace: missing resolved date_range")
    if not trace.get("gmail_search_completed"):
        errors.append("trace: Gmail candidate search did not complete")

    candidates = trace.get("candidates")
    if not isinstance(candidates, list):
        return errors + ["trace: candidates must be a list"]

    for index, candidate in enumerate(candidates):
        label = candidate.get("name") or candidate.get("email") or f"candidate[{index}]"
        classification = candidate.get("classification")
        searches = _completed_searches(candidate)

        if "gmail" in candidate.get("sources", []) and not candidate.get("gmail_thread_hydrated"):
            errors.append(f"{label}: Gmail candidate requires gmail_get_thread hydration")

        if classification == FOLLOW_UP:
            has_calendar_identity_search = any(
                source == "calendar" and field in {"email", "full_name", "phone", "provider_id"}
                for source, field in searches
            )
            if not has_calendar_identity_search:
                errors.append(
                    f"{label}: {FOLLOW_UP} requires a completed identity-targeted Calendar search"
                )
            if candidate.get("source_incomplete"):
                errors.append(
                    f"{label}: source-incomplete evidence cannot be classified as {FOLLOW_UP}"
                )

        if classification in SCHEDULED and not candidate.get("matched_event_id"):
            errors.append(f"{label}: {classification} requires an exact matched_event_id")

        if candidate.get("match_basis") in {"first_name", "last_name", "narrative_word"}:
            errors.append(f"{label}: weak match_basis cannot support final classification")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("trace", type=Path, help="JSON reconciliation trace")
    args = parser.parse_args()

    with args.trace.open(encoding="utf-8") as handle:
        trace = json.load(handle)

    errors = validate_trace(trace)
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1

    print("trial reconciliation trace is valid")
    return 0


if __name__ == "__main__":
    sys.exit(main())
