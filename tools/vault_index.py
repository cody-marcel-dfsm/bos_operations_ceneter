#!/usr/bin/env python3
"""Incrementally index the canonical Vault into the shared Chroma store."""

from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
import signal
import sys
import time
import subprocess
import tempfile
from importlib.metadata import version
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
SYNC_LOCK_FILE = CHROMA_DIR.resolve().parent / f".{CHROMA_DIR.resolve().name}.access.lock"
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


def iter_sources() -> Iterable[Path]:
    """Yield private local Vault sources without consulting Git visibility."""
    found = []
    for directory, subdirectories, filenames in os.walk(VAULT_ROOT):
        subdirectories[:] = [name for name in subdirectories if name not in EXCLUDED_PARTS]
        for name in filenames:
            path = Path(directory) / name
            if name not in EXCLUDED_PARTS and path.suffix.lower() in TEXT_SUFFIXES and path.is_file():
                found.append(path)
    yield from sorted(found)


def canonical_digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def index_configuration() -> dict:
    return {"index_version": INDEX_VERSION, "collection": COLLECTION_NAME,
            "chunk_characters": CHUNK_CHARACTERS, "overlap_characters": OVERLAP_CHARACTERS,
            "embedding": "Chroma DefaultEmbeddingFunction/all-MiniLM-L6-v2",
            "chromadb_version": version("chromadb"),
            "indexer_sha256": file_digest(Path(__file__))}


def atomic_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        try:
            output.write((json.dumps(payload, indent=2, sort_keys=True) + "\n").encode())
            output.flush()
            os.fsync(output.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


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


def read_source_text(path: Path, raw: bytes | None = None) -> str:
    text = (path.read_bytes() if raw is None else raw).decode("utf-8", errors="replace")
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
    atomic_json(path, payload)
    latest = MANIFEST_DIR / "latest.json"
    atomic_json(latest, payload)
    return path


def _sync_unlocked(*, quiet: bool = False, force_manifest: bool = False) -> dict:
    started = time.monotonic()
    indexed_at = utc_timestamp()
    source_hashes = snapshot()
    configuration = index_configuration()
    configuration_sha256 = canonical_digest(configuration)
    collection = get_collection()
    existing = collection.get(include=["metadatas"])

    ids_by_source: dict[str, list[str]] = {}
    hashes_by_source: dict[str, str] = {}
    incompatible_sources: set[str] = set()
    chunks_by_source: dict[str, list[int]] = {}
    counts_by_source: dict[str, set[int]] = {}
    for item_id, metadata in zip(
        existing.get("ids", []), existing.get("metadatas", [])
    ):
        metadata = metadata or {}
        source = str(metadata.get("source", ""))
        if not source:
            raise RuntimeError("Vault collection contains an unbound source")
        ids_by_source.setdefault(source, []).append(item_id)
        hashes_by_source[source] = str(metadata.get("source_sha256", ""))
        if metadata.get("source_sha256") != source_hashes.get(source):
            incompatible_sources.add(source)
        if metadata.get("index_configuration_sha256") != configuration_sha256:
            incompatible_sources.add(source)
        chunk, count = metadata.get("chunk"), metadata.get("chunk_count")
        if type(chunk) is not int or type(count) is not int or chunk < 0 or count <= 0:
            incompatible_sources.add(source)
        else:
            chunks_by_source.setdefault(source, []).append(chunk)
            counts_by_source.setdefault(source, set()).add(count)

    for source, identifiers in ids_by_source.items():
        if counts_by_source.get(source) != {len(identifiers)} or sorted(chunks_by_source.get(source, [])) != list(range(len(identifiers))):
            incompatible_sources.add(source)

    removed = sorted(set(ids_by_source) - set(source_hashes))
    changed = sorted(
        source
        for source, digest in source_hashes.items()
        if hashes_by_source.get(source) != digest or source in incompatible_sources
    )

    for source in removed + changed:
        stale_ids = ids_by_source.get(source, [])
        if stale_ids:
            collection.delete(ids=stale_ids)

    chunk_count = 0
    for source in changed:
        path = PROJECT_ROOT / source
        try:
            raw = path.read_bytes()
            text = read_source_text(path, raw)
        except OSError as exc:
            raise RuntimeError(f"Vault source disappeared during indexing: {source}") from exc
        if hashlib.sha256(raw).hexdigest() != source_hashes[source]:
            raise RuntimeError(f"Vault source changed during indexing: {source}")
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
                "index_configuration_sha256": configuration_sha256,
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

    if snapshot() != source_hashes:
        raise RuntimeError("Vault sources changed during indexing; manifest was not published")

    payload = {
        "index_version": INDEX_VERSION,
        "indexed_at": indexed_at,
        "collection": COLLECTION_NAME,
        "source_count": len(source_hashes),
        "canonical_source_snapshot_sha256": canonical_digest(source_hashes),
        "source_hashes": source_hashes,
        "index_configuration": configuration,
        "index_configuration_sha256": configuration_sha256,
        "collection_count": collection.count(),
        "changed_sources": changed,
        "removed_sources": removed,
        "indexed_chunks": chunk_count,
        "duration_seconds": round(time.monotonic() - started, 3),
    }
    manifest = (
        write_manifest(payload)
        if changed or removed or force_manifest or not (MANIFEST_DIR / "latest.json").is_file()
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


def _native_operation(command: list[str], *,
                      lock_timeout_seconds: float = SYNC_LOCK_TIMEOUT_SECONDS,
                      lock_retry_seconds: float = SYNC_LOCK_RETRY_SECONDS):
    """Parent owns the lock until the native child has fully terminated.

    The child inherits the locked descriptor, retaining exclusion even if its
    parent exits unexpectedly. Native objects never outlive the lock owner.
    """
    if lock_timeout_seconds < 0 or lock_retry_seconds <= 0:
        raise ValueError("Vault lock timeout/retry must be non-negative/positive")
    SYNC_LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + lock_timeout_seconds
    with SYNC_LOCK_FILE.open("a+") as lock:
        while True:
            try:
                # Embedded engine initialization may write even for a query.
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError as exc:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise RuntimeError(f"Vault access lock {SYNC_LOCK_FILE} unavailable for {lock_timeout_seconds:g} seconds") from exc
                time.sleep(min(lock_retry_seconds, remaining))
        completed = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), "--native-worker-lock-fd", str(lock.fileno()), *command],
            pass_fds=(lock.fileno(),), capture_output=True, text=True,
        )
        if completed.returncode:
            raise RuntimeError("Vault native operation failed: " + (completed.stderr or completed.stdout).strip())
        return json.loads(completed.stdout)


def sync(*, quiet: bool = False, force_manifest: bool = False,
         lock_timeout_seconds: float = SYNC_LOCK_TIMEOUT_SECONDS,
         lock_retry_seconds: float = SYNC_LOCK_RETRY_SECONDS) -> dict:
    args = ["sync"] + (["--force-manifest"] if force_manifest else [])
    result = _native_operation(args, lock_timeout_seconds=lock_timeout_seconds,
                               lock_retry_seconds=lock_retry_seconds)
    if not quiet:
        print(f"Vault index synchronized: {len(result['changed_sources'])} changed, {len(result['removed_sources'])} removed")
    return result


def query(text: str, limit: int = 5) -> list[dict]:
    return _native_operation(["query", text, "--limit", str(limit)])


def snapshot_evidence(text: str, supplemental: str | None = None, limit: int = 5) -> dict:
    args = ["evidence", text, "--limit", str(limit)]
    if supplemental:
        args += ["--supplemental", supplemental]
    return _native_operation(args)


def _current_manifest() -> tuple[dict, bytes]:
    raw = (MANIFEST_DIR / "latest.json").read_bytes()
    manifest = json.loads(raw)
    if manifest.get("index_configuration_sha256") != canonical_digest(index_configuration()):
        raise RuntimeError("Vault index configuration changed; synchronize before querying")
    if manifest.get("index_configuration_sha256") != canonical_digest(manifest.get("index_configuration")):
        raise RuntimeError("Vault manifest configuration binding is invalid")
    if manifest.get("canonical_source_snapshot_sha256") != canonical_digest(manifest.get("source_hashes")):
        raise RuntimeError("Vault manifest source binding is invalid")
    if manifest.get("source_hashes") != snapshot():
        raise RuntimeError("Vault index is stale for canonical sources; synchronize before querying")
    return manifest, raw


def _snapshot_evidence_unlocked(text: str, supplemental: str | None, limit: int) -> dict:
    started = time.monotonic()
    sync_started = time.monotonic()
    _sync_unlocked(quiet=True)
    sync_seconds = time.monotonic() - sync_started
    manifest, raw = _current_manifest()
    queries = [{"text": text, "limit": limit, "results": _query_unlocked(text, limit)}]
    if supplemental and supplemental != text:
        queries.append({"text": supplemental, "limit": limit, "results": _query_unlocked(supplemental, limit)})
    after, after_raw = _current_manifest()
    if raw != after_raw or manifest != after:
        raise RuntimeError("Vault index changed during retrieval")
    return {"kind": "vault-query-snapshot-v1", "index_manifest_sha256": hashlib.sha256(raw).hexdigest(),
            "canonical_source_snapshot_sha256": manifest["canonical_source_snapshot_sha256"],
            "source_hashes": manifest["source_hashes"], "indexed_at": manifest["indexed_at"],
            "index_configuration": manifest["index_configuration"],
            "index_configuration_sha256": manifest["index_configuration_sha256"], "queries": queries,
            "timings": {"sync_seconds": round(sync_seconds, 6),
                        "total_seconds": round(time.monotonic() - started, 6)}}


def _query_unlocked(text: str, limit: int = 5) -> list[dict]:
    if limit <= 0:
        raise ValueError("Vault query limit must be positive")
    manifest, _ = _current_manifest()
    collection = get_collection()
    if collection.count() != manifest["collection_count"]:
        raise RuntimeError("Vault collection count does not match its manifest; synchronize before querying")
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
        source = metadata["source"]
        if metadata.get("source_sha256") != manifest["source_hashes"].get(source):
            raise RuntimeError("Vault query source hash does not match its manifest")
        if metadata.get("index_configuration_sha256") != manifest["index_configuration_sha256"]:
            raise RuntimeError("Vault query configuration does not match its manifest")
        source_path = PROJECT_ROOT / source
        raw_source = source_path.read_bytes()
        if hashlib.sha256(raw_source).hexdigest() != metadata["source_sha256"]:
            raise RuntimeError("Vault query source changed during retrieval")
        canonical_chunks = chunks(read_source_text(source_path, raw_source)) or [f"Empty knowledge file: {source}"]
        chunk = metadata["chunk"]
        if not isinstance(chunk, int) or not 0 <= chunk < len(canonical_chunks) or document != canonical_chunks[chunk]:
            raise RuntimeError("Vault query chunk does not match its canonical source")
        matches.append(
            {
                "source": source,
                "source_sha256": metadata["source_sha256"],
                "chunk_sha256": hashlib.sha256(document.encode()).hexdigest(),
                "index_configuration_sha256": metadata["index_configuration_sha256"],
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
    parser.add_argument("--native-worker-lock-fd", type=int, help=argparse.SUPPRESS)
    subparsers = parser.add_subparsers(dest="command", required=True)
    sync_parser = subparsers.add_parser("sync")
    sync_parser.add_argument("--quiet", action="store_true")
    sync_parser.add_argument("--force-manifest", action="store_true")
    query_parser = subparsers.add_parser("query")
    query_parser.add_argument("text")
    query_parser.add_argument("--limit", type=int, default=5)
    evidence_parser = subparsers.add_parser("evidence")
    evidence_parser.add_argument("text")
    evidence_parser.add_argument("--supplemental")
    evidence_parser.add_argument("--limit", type=int, default=5)
    watch_parser = subparsers.add_parser("watch")
    watch_parser.add_argument("--interval", type=float, default=2.0)
    watch_parser.add_argument("--daemon", action="store_true")
    args = parser.parse_args()

    if args.native_worker_lock_fd is not None:
        # Only the lock-holding parent starts this branch. Reject unrelated FDs.
        descriptor = os.fstat(args.native_worker_lock_fd)
        expected = SYNC_LOCK_FILE.stat()
        if (descriptor.st_dev, descriptor.st_ino) != (expected.st_dev, expected.st_ino):
            raise RuntimeError("Invalid native worker lock descriptor")
        # Reacquiring an inherited open-file-description lock succeeds; an
        # unheld descriptor must acquire exclusion before initializing Chroma.
        fcntl.flock(args.native_worker_lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.command == "sync":
            result = _sync_unlocked(quiet=True, force_manifest=args.force_manifest)
        elif args.command == "query":
            result = _query_unlocked(args.text, args.limit)
        elif args.command == "evidence":
            result = _snapshot_evidence_unlocked(args.text, args.supplemental, args.limit)
        else:
            raise RuntimeError("Native worker cannot watch")
        print(json.dumps(result, indent=2))
    elif args.command == "sync":
        sync(quiet=args.quiet, force_manifest=args.force_manifest)
    elif args.command == "query":
        print(json.dumps(query(args.text, args.limit), indent=2))
    elif args.command == "evidence":
        print(json.dumps(snapshot_evidence(args.text, args.supplemental, args.limit), indent=2))
    else:
        watch(args.interval, daemon=args.daemon)


if __name__ == "__main__":
    main()
