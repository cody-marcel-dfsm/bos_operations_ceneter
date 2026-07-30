#!/usr/bin/env python3
"""Screen candidate Google click IDs without calling a provider."""

from __future__ import annotations

import argparse
import json
import re


def is_valid_gclid(value: str) -> bool:
    candidate = value.strip()
    return (
        len(candidate) >= 40
        and re.fullmatch(r"[A-Za-z0-9_-]+", candidate) is not None
        and candidate.startswith(("EAIa", "Cj0", "Cjw"))
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidates", nargs="+")
    args = parser.parse_args()
    for candidate in args.candidates:
        print(json.dumps({"candidate": candidate, "valid_format": is_valid_gclid(candidate)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

