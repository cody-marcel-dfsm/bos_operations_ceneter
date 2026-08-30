#!/usr/bin/env python3
"""Summarize campaign artifact folders and likely source-of-truth files."""

from __future__ import annotations

import argparse
import os
from collections import Counter, defaultdict
from pathlib import Path


DEFAULT_ROOT = Path.cwd()
KEY_DIRS = {"contact_lists", "email_templates", "send_results", "campaign_strategy", "creatives_artifacts"}
SOURCE_HINTS = ("source", "truth", "prospect", "contact", "results", "activity", "summary")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", nargs="?", default=str(DEFAULT_ROOT), help="Campaign root to inspect")
    parser.add_argument("--max-files", type=int, default=80, help="Maximum likely-important files to print")
    return parser.parse_args()


def is_hidden(path: Path) -> bool:
    return any(part.startswith(".") for part in path.parts)


def main() -> int:
    args = parse_args()
    root = Path(args.root).expanduser().resolve()
    if not root.exists():
        raise SystemExit(f"missing root: {root}")

    extension_counts: Counter[str] = Counter()
    folder_counts: Counter[str] = Counter()
    key_dirs: dict[str, list[Path]] = defaultdict(list)
    important: list[Path] = []

    for dirpath, dirnames, filenames in os.walk(root):
        current = Path(dirpath)
        dirnames[:] = [name for name in dirnames if not name.startswith(".")]
        if is_hidden(current.relative_to(root)):
            continue

        for dirname in dirnames:
            if dirname in KEY_DIRS:
                key_dirs[dirname].append(current / dirname)

        for filename in filenames:
            if filename.startswith("."):
                continue
            path = current / filename
            rel = path.relative_to(root)
            suffix = path.suffix.lower() or "[none]"
            extension_counts[suffix] += 1
            folder_counts[str(rel.parent)] += 1
            lower_name = filename.lower()
            if path.suffix.lower() in {".csv", ".json", ".html", ".txt", ".md"} and any(
                hint in lower_name for hint in SOURCE_HINTS
            ):
                important.append(rel)

    print(f"Campaign root: {root}")
    print(f"Total files: {sum(extension_counts.values())}")
    print("\nExtensions:")
    for suffix, count in extension_counts.most_common():
        print(f"  {suffix}: {count}")

    print("\nKey directories:")
    for dirname in sorted(KEY_DIRS):
        paths = key_dirs.get(dirname, [])
        if paths:
            for path in paths:
                print(f"  {dirname}: {path.relative_to(root)}")

    print("\nLikely important files:")
    for rel in sorted(important)[: args.max_files]:
        print(f"  {rel}")

    if len(important) > args.max_files:
        print(f"  ... {len(important) - args.max_files} more")

    print("\nLargest folders by file count:")
    for folder, count in folder_counts.most_common(12):
        print(f"  {folder}: {count}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
