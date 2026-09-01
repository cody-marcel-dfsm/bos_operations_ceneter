#!/usr/bin/env python3
"""Incrementally index the canonical Vault into the shared Chroma store."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Iterable

PROJECT_ROOT = Path(__file__).resolve().parent.parent
VAULT_ROOT = PROJECT_ROOT / "Vault"
CHROMA_DIR = Path(
    os.environ.get(
        "BOS_VAULT_CHROMA_ROOT",
        VAULT_ROOT / "index" / "chroma" / "knowledge",
    )
)
MANIFEST_DIR = Path(
    os.environ.get(
        "BOS_VAULT_MANIFEST_ROOT",
        VAULT_ROOT / "index" / "manifests",
    )
)
PID_FILE = VAULT_ROOT / "tmp" / "vault-index" / "watcher.pid"
LOCK_FILE = VAULT_ROOT / "tmp" / "vault-index" / "watcher.lock"
SYNC_LOCK_FILE = VAULT_ROOT / "tmp" / "vault-index" / "sync.lock"
SYNC_LOCK_TIMEOUT_SECONDS = 5.0
SYNC_LOCK_RETRY_SECONDS = 0.05
COLLECTION_NAME = "vault_knowledge"
INDEX_VERSION = 1
CHUNK_CHARACTERS = 3_000
OVERLAP_CHARACTERS = 300
TEXT_SUFFIXES = {
    ".md",
    ".mdx",
    ".txt",
    ".rst",
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".csv",
    ".html",
    ".htm",
}
EXCLUDED_PARTS = {"index", "tmp", ".git", "__pycache__", "node_modules"}


def ensure_stable_chroma_runtime() -> None:
    """Keep Chroma's native binding off unsupported Homebrew Python 3.14."""
    if sys.version_info < (3, 14):
        return
    configured = os.environ.get("VAULT_INDEX_PYTHON")
    candidates = [
        Path(configured).expanduser() if configured else None,
        Path("/opt/anaconda3/bin/python"),
    ]
    current = Path(sys.executable).resolve()
    for candidate in candidates:
        if candidate is None or not candidate.is_file():
            continue
        resolved = candidate.resolve()
        if resolved == current:
            continue
        os.execv(
            str(resolved),
            [str(resolved), str(Path(__file__).resolve()), *sys.argv[1:]],
        )
    raise RuntimeError(
        "Vault indexing requires Python 3.12 or 3.13 because the installed "
        "Chroma native binding crashes under Python 3.14. Set "
        "VAULT_INDEX_PYTHON to a supported interpreter."
    )


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")


def git_visible_source_paths() -> set[str] | None:
    """Return Git-visible Vault paths in the canonical checkout."""
    if VAULT_ROOT.resolve() != (PROJECT_ROOT / "Vault").resolve():
        return None
    result = subprocess.run(
        [
            "git",
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
            "Vault",
        ],
        cwd=PROJECT_ROOT,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        return None
    return {
        os.fsdecode(raw_path)
        for raw_path in result.stdout.split(b"\0")
        if raw_path
    }


def iter_sources() -> Iterable[Path]:
    visible_paths = git_visible_source_paths()
    for path in sorted(VAULT_ROOT.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        relative = path.relative_to(VAULT_ROOT)
        if any(part in EXCLUDED_PARTS for part in relative.parts):
            continue
        if visible_paths is not None:
            project_relative = path.relative_to(PROJECT_ROOT).as_posix()
            if project_relative not in visible_paths:
                continue
        yield path


def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def snapshot() -> dict[str, str]:
    return {
        path.relative_to(PROJECT_ROOT).as_posix(): file_digest(path)
        for path in iter_sources()
    }


def chunks(text: str) -> list[str]:
    normalized = text.replace("\x00", "").strip()
    if not normalized:
        return []
    output = []
    start = 0
    while start < len(normalized):
        end = min(start + CHUNK_CHARACTERS, len(normalized))
        output.append(normalized[start:end])
        if end == len(normalized):
            break
        start = end - OVERLAP_CHARACTERS
    return output


class _ReadableHTMLParser(HTMLParser):
    """Extract readable text while excluding script and style content."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden_depth = 0

    def handle_starttag(self, tag: str, _attrs) -> None:
        if tag.lower() in {"script", "style"}:
            self.hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style"} and self.hidden_depth:
            self.hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.hidden_depth and data.strip():
            self.parts.append(data.strip())


def read_source_text(path: Path) -> str:
    text = path.read_text(encoding="utf-8", errors="replace")
    if path.suffix.lower() not in {".html", ".htm"}:
        return text
    parser = _ReadableHTMLParser()
    parser.feed(text)
    return "\n".join(parser.parts)


def get_collection():
    try:
        import chromadb
    except ImportError as exc:
        raise RuntimeError(
            "ChromaDB is required. Install tools/requirements-dev.txt."
        ) from exc

    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine", "index_version": INDEX_VERSION},
    )


def write_manifest(payload: dict) -> Path:
    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    path = MANIFEST_DIR / f"{payload['indexed_at']}.json"
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    latest = MANIFEST_DIR / "latest.json"
    latest.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    return path


def _sync_unlocked(*, quiet: bool = False, force_manifest: bool = False) -> dict:
    started = time.monotonic()
    indexed_at = utc_timestamp()
    source_hashes = snapshot()
    collection = get_collection()
    existing = collection.get(include=["metadatas"])

    ids_by_source: dict[str, list[str]] = {}
    hashes_by_source: dict[str, str] = {}
    for item_id, metadata in zip(
        existing.get("ids", []), existing.get("metadatas", [])
    ):
        metadata = metadata or {}
        source = str(metadata.get("source", ""))
        if not source:
            continue
        ids_by_source.setdefault(source, []).append(item_id)
        hashes_by_source[source] = str(metadata.get("source_sha256", ""))

    removed = sorted(set(ids_by_source) - set(source_hashes))
    changed = sorted(
        source
        for source, digest in source_hashes.items()
        if hashes_by_source.get(source) != digest
    )

    for source in removed + changed:
        stale_ids = ids_by_source.get(source, [])
        if stale_ids:
            collection.delete(ids=stale_ids)

    chunk_count = 0
    for source in changed:
        path = PROJECT_ROOT / source
        try:
            text = read_source_text(path)
        except OSError:
            text = ""
        source_chunks = chunks(text)
        if not source_chunks:
            source_chunks = [f"Empty knowledge file: {source}"]
        digest = source_hashes[source]
        ids = [
            hashlib.sha256(f"{source}:{index}:{digest}".encode()).hexdigest()
            for index in range(len(source_chunks))
        ]
        metadatas = [
            {
                "source": source,
                "source_sha256": digest,
                "chunk": index,
                "chunk_count": len(source_chunks),
                "indexed_at": indexed_at,
                "index_version": INDEX_VERSION,
            }
            for index in range(len(source_chunks))
        ]
        for offset in range(0, len(ids), 100):
            collection.upsert(
                ids=ids[offset: offset + 100],
                documents=source_chunks[offset: offset + 100],
                metadatas=metadatas[offset: offset + 100],
            )
        chunk_count += len(source_chunks)

    payload = {
        "index_version": INDEX_VERSION,
        "indexed_at": indexed_at,
        "collection": COLLECTION_NAME,
        "source_count": len(source_hashes),
        "canonical_source_snapshot_sha256": hashlib.sha256(
            json.dumps(
                source_hashes, sort_keys=True, separators=(",", ":")
            ).encode()
        ).hexdigest(),
        "collection_count": collection.count(),
        "changed_sources": changed,
        "removed_sources": removed,
        "indexed_chunks": chunk_count,
        "duration_seconds": round(time.monotonic() - started, 3),
    }
    manifest = (
        write_manifest(payload)
        if changed or removed or force_manifest
        else None
    )
    if not quiet:
        print(
            f"Vault index synchronized: {len(changed)} changed, "
            f"{len(removed)} removed, {chunk_count} chunks"
        )
        print(f"Timestamp: {indexed_at}")
        if manifest is not None:
            try:
                relative_manifest = manifest.relative_to(PROJECT_ROOT)
            except ValueError:
                relative_manifest = manifest
            print(f"Manifest: {relative_manifest}")
        else:
            print("Manifest: unchanged (no Vault source changes)")
    return payload


def sync(
    *,
    quiet: bool = False,
    force_manifest: bool = False,
    lock_timeout_seconds: float = SYNC_LOCK_TIMEOUT_SECONDS,
    lock_retry_seconds: float = SYNC_LOCK_RETRY_SECONDS,
) -> dict:
    """Serialize Chroma writers across the watcher and one-shot commands."""
    if lock_timeout_seconds < 0:
        raise ValueError("Vault sync lock timeout must be non-negative")
    if lock_retry_seconds <= 0:
        raise ValueError("Vault sync lock retry interval must be positive")
    SYNC_LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + lock_timeout_seconds
    with SYNC_LOCK_FILE.open("a+") as sync_lock:
        while True:
            try:
                fcntl.flock(
                    sync_lock.fileno(),
                    fcntl.LOCK_EX | fcntl.LOCK_NB,
                )
                break
            except BlockingIOError as exc:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise RuntimeError(
                        "Vault sync lock "
                        f"{SYNC_LOCK_FILE} was unavailable for "
                        f"{lock_timeout_seconds:g} seconds"
                    ) from exc
                time.sleep(min(lock_retry_seconds, remaining))
        return _sync_unlocked(quiet=quiet, force_manifest=force_manifest)


def query(text: str, limit: int = 5) -> list[dict]:
    collection = get_collection()
    if collection.count() == 0:
        return []
    results = collection.query(
        query_texts=[text],
        n_results=min(limit, collection.count()),
        include=["documents", "metadatas", "distances"],
    )
    matches = []
    for document, metadata, distance in zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ):
        matches.append(
            {
                "source": metadata["source"],
                "chunk": metadata["chunk"],
                "indexed_at": metadata["indexed_at"],
                "distance": round(float(distance), 6),
                "text": document,
            }
        )
    return matches


def watch(interval: float, *, daemon: bool = False) -> None:
    watcher_lock = None
    if daemon:
        PID_FILE.parent.mkdir(parents=True, exist_ok=True)
        watcher_lock = LOCK_FILE.open("a+")
        try:
            fcntl.flock(watcher_lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            existing_pid = (
                PID_FILE.read_text().strip() if PID_FILE.exists() else "unknown"
            )
            print(f"Vault watcher already running as PID {existing_pid}")
            watcher_lock.close()
            return
        if PID_FILE.exists():
            try:
                existing_pid = int(PID_FILE.read_text().strip())
                os.kill(existing_pid, 0)
                print(f"Vault watcher already running as PID {existing_pid}")
                return
            except (ValueError, OSError):
                PID_FILE.unlink(missing_ok=True)
        pid = os.fork()
        if pid:
            print(f"Vault watcher started as PID {pid}")
            return
        os.setsid()
        null_fd = os.open(os.devnull, os.O_RDWR)
        for descriptor in (0, 1, 2):
            os.dup2(null_fd, descriptor)
        if null_fd > 2:
            os.close(null_fd)
        PID_FILE.write_text(f"{os.getpid()}\n")

    def stop(_signum, _frame):
        try:
            if int(PID_FILE.read_text().strip()) == os.getpid():
                PID_FILE.unlink(missing_ok=True)
        except (FileNotFoundError, ValueError):
            pass
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    previous = snapshot()
    sync(quiet=daemon)
    while True:
        time.sleep(interval)
        current = snapshot()
        if current != previous:
            sync(quiet=daemon)
            previous = current


def main() -> None:
    ensure_stable_chroma_runtime()
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    sync_parser = subparsers.add_parser("sync")
    sync_parser.add_argument("--quiet", action="store_true")
    sync_parser.add_argument("--force-manifest", action="store_true")
    query_parser = subparsers.add_parser("query")
    query_parser.add_argument("text")
    query_parser.add_argument("--limit", type=int, default=5)
    watch_parser = subparsers.add_parser("watch")
    watch_parser.add_argument("--interval", type=float, default=2.0)
    watch_parser.add_argument("--daemon", action="store_true")
    args = parser.parse_args()

    if args.command == "sync":
        sync(quiet=args.quiet, force_manifest=args.force_manifest)
    elif args.command == "query":
        print(json.dumps(query(args.text, args.limit), indent=2))
    else:
        watch(args.interval, daemon=args.daemon)


if __name__ == "__main__":
    main()
