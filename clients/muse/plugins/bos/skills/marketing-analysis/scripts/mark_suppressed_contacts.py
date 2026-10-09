#!/usr/bin/env python3
"""Mark email addresses as suppressed/unsubscribed in a campaign CSV."""

from __future__ import annotations

import argparse
import csv
from datetime import date
from pathlib import Path


EMAIL_FIELDS = ("email", "email_address", "to_email", "recipient", "Email", "Email Address")
SUPPRESSION_FIELDS = [
    "campaign_status",
    "do_not_email",
    "suppression_reason",
    "suppression_source",
    "suppression_date",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv_path", help="CSV contact list to update in place")
    parser.add_argument("emails", nargs="+", help="Email address(es) to suppress")
    parser.add_argument("--reason", default="unsubscribe", help="Suppression reason")
    parser.add_argument("--source", default="manual", help="Suppression source")
    parser.add_argument("--date", default=date.today().isoformat(), help="Suppression date, YYYY-MM-DD")
    return parser.parse_args()


def find_email_field(fieldnames: list[str]) -> str:
    for field in EMAIL_FIELDS:
        if field in fieldnames:
            return field
    lower_map = {field.lower(): field for field in fieldnames}
    for field in EMAIL_FIELDS:
        if field.lower() in lower_map:
            return lower_map[field.lower()]
    raise SystemExit(f"could not find email field; columns: {', '.join(fieldnames)}")


def main() -> int:
    args = parse_args()
    csv_path = Path(args.csv_path).expanduser().resolve()
    targets = {email.strip().lower() for email in args.emails if email.strip()}
    if not targets:
        raise SystemExit("no email addresses supplied")

    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        if not reader.fieldnames:
            raise SystemExit("CSV has no header row")
        rows = list(reader)
        fieldnames = list(reader.fieldnames)

    email_field = find_email_field(fieldnames)
    for field in SUPPRESSION_FIELDS:
        if field not in fieldnames:
            fieldnames.append(field)

    matched: set[str] = set()
    for row in rows:
        email = (row.get(email_field) or "").strip().lower()
        if email in targets:
            row["campaign_status"] = "unsubscribed"
            row["do_not_email"] = "true"
            row["suppression_reason"] = args.reason
            row["suppression_source"] = args.source
            row["suppression_date"] = args.date
            matched.add(email)

    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)

    missing = sorted(targets - matched)
    print(f"updated rows: {len(matched)}")
    if missing:
        print("not found:")
        for email in missing:
            print(f"  {email}")

    return 0 if not missing else 2


if __name__ == "__main__":
    raise SystemExit(main())
