#!/usr/bin/env python3
"""Inventory and search the canonical BOS Operations Center Vault."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
VAULT_ROOT = PROJECT_ROOT / "Vault"
MANIFEST_ROOT = Path(
    os.environ.get("BOS_VAULT_MANIFEST_ROOT", VAULT_ROOT / "index" / "manifests")
)
TEXT_SUFFIXES = {
    ".csv", ".html", ".json", ".md", ".mdx", ".rst", ".toml",
    ".txt", ".yaml", ".yml",
}
EXCLUDED_PARTS = {"index", "tmp", ".git", "__pycache__", "node_modules"}


def sources() -> list[Path]:
    return [
        path
        for path in sorted(VAULT_ROOT.rglob("*"))
        if path.is_file()
        and path.suffix.lower() in TEXT_SUFFIXES
        and not any(part in EXCLUDED_PARTS for part in path.relative_to(VAULT_ROOT).parts)
    ]


def source_inventory() -> dict[str, dict[str, int | str]]:
    inventory: dict[str, dict[str, int | str]] = {}
    for path in sources():
        payload = path.read_bytes()
        inventory[path.relative_to(PROJECT_ROOT).as_posix()] = {
            "sha256": hashlib.sha256(payload).hexdigest(),
            "bytes": len(payload),
        }
    return inventory


def sync(*, quiet: bool = False) -> dict:
    inventory = source_inventory()
    indexed_at = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    manifest = {
        "schema_version": "bos-vault-manifest/v1",
        "indexed_at": indexed_at,
        "source_count": len(inventory),
        "sources": inventory,
    }
    encoded = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
    MANIFEST_ROOT.mkdir(parents=True, exist_ok=True)
    (MANIFEST_ROOT / f"{indexed_at}.json").write_bytes(encoded)
    (MANIFEST_ROOT / "latest.json").write_bytes(encoded)
    if not quiet:
        print(f"Indexed {len(inventory)} Vault sources at {indexed_at}")
    return manifest


def query(text: str) -> int:
    terms = {term.lower() for term in re.findall(r"[A-Za-z0-9_-]+", text) if len(term) > 1}
    if not terms:
        raise ValueError("query must contain a searchable term")
    matches: list[tuple[int, str, list[str]]] = []
    for path in sources():
        content = path.read_text(encoding="utf-8", errors="replace")
        lines = content.splitlines()
        hits = [
            f"{number}: {line.strip()}"
            for number, line in enumerate(lines, 1)
            if terms.intersection(re.findall(r"[a-z0-9_-]+", line.lower()))
        ]
        score = sum(content.lower().count(term) for term in terms)
        if score:
            matches.append((score, path.relative_to(PROJECT_ROOT).as_posix(), hits[:5]))
    for score, relative, hits in sorted(matches, key=lambda item: (-item[0], item[1]))[:10]:
        print(f"{relative} ({score})")
        for hit in hits:
            print(f"  {hit}")
    return len(matches)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    sync_parser = commands.add_parser("sync", help="write the current source manifest")
    sync_parser.add_argument("--quiet", action="store_true")
    query_parser = commands.add_parser("query", help="search canonical Vault text")
    query_parser.add_argument("text")
    args = parser.parse_args()
    if args.command == "sync":
        sync(quiet=args.quiet)
        return 0
    return 0 if query(args.text) else 1


if __name__ == "__main__":
    raise SystemExit(main())
