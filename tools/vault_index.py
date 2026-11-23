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

try:
    from .oracle_core.index import chunks as _portable_chunks, read_source_text as _portable_read_source_text
    from .oracle_oc_adapter import vault_store
except ImportError:
    from oracle_core.index import chunks as _portable_chunks, read_source_text as _portable_read_source_text
    from oracle_oc_adapter import vault_store

def _portable_store():
    return vault_store(sys.modules[__name__])

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


# The Vault index and its Chroma dependency run only inside this checkout: the self-contained
# runtime Vault/index/venv (Git-ignored by the venv rule, pruned from indexing by the index rule).
# Chroma's native binding needs Python 3.12 or 3.13; nothing outside the project is used.
INDEX_RUNTIME = Path("Vault/index/venv")
RUNTIME_EXECUTABLE = INDEX_RUNTIME / "bin" / "python"
RUNTIME_MARKER = "BOS_VAULT_INDEX_RUNTIME"
SUPPORTED_RUNTIMES = {(3, 12), (3, 13)}
RUNTIME_PROBE_SECONDS = 10


def _runtime_unavailable(reason: str) -> RuntimeError:
    return RuntimeError(
        "Vault indexing runs only in the project-local Python 3.12 or 3.13 runtime "
        f"Vault/index/venv ({reason}). Provision it as described in "
        "Vault/docs/operations/vault-index-runtime.md."
    )


def running_in_project_runtime() -> bool:
    """This process is the supported runtime inside this checkout, executable and prefix alike."""
    runtime = (PROJECT_ROOT / INDEX_RUNTIME).resolve()
    return (tuple(sys.version_info[:2]) in SUPPORTED_RUNTIMES
            and runtime.is_relative_to(PROJECT_ROOT.resolve())
            and Path(sys.executable).resolve().is_relative_to(runtime)
            and Path(sys.prefix).resolve().is_relative_to(runtime))


def ensure_stable_chroma_runtime() -> None:
    """Continue inside the project runtime; otherwise re-execute once under it."""
    if running_in_project_runtime():
        return
    if os.environ.get(RUNTIME_MARKER):
        raise _runtime_unavailable("the re-executed process is not that runtime")
    root = PROJECT_ROOT.resolve()
    try:
        interpreter = (PROJECT_ROOT / RUNTIME_EXECUTABLE).resolve(strict=True)
    except OSError:
        raise _runtime_unavailable("it is not installed") from None
    if not interpreter.is_relative_to(root):
        raise _runtime_unavailable("its interpreter resolves outside the project")
    if not interpreter.is_file() or not os.access(interpreter, os.X_OK):
        raise _runtime_unavailable("its interpreter is not executable")
    try:
        probe = subprocess.run(
            [str(interpreter), "-c", "import sys; print('%d.%d' % sys.version_info[:2])"],
            capture_output=True, text=True, timeout=RUNTIME_PROBE_SECONDS, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise _runtime_unavailable(f"its version check failed: {type(error).__name__}") from None
    version = probe.stdout.strip()
    if probe.returncode or version not in {f"{major}.{minor}" for major, minor in SUPPORTED_RUNTIMES}:
        raise _runtime_unavailable(f"it reports {version or 'no version'!r}")
    os.execve(
        str(interpreter),
        [str(interpreter), str(Path(__file__).resolve()), *sys.argv[1:]],
        {**os.environ, RUNTIME_MARKER: "1"},
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
            "indexer_sha256": file_digest(Path(__file__)),
            "indexer_core_sha256": file_digest(PROJECT_ROOT / "tools/oracle_core/index.py"),
            "adapter_sha256": file_digest(PROJECT_ROOT / "tools/oracle_oc_adapter.py")}


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


def chunks(text):
    return _portable_chunks(text)


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


def read_source_text(path, raw=None):
    return _portable_read_source_text(path, raw)


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


def _sync_unlocked(*, quiet=False, force_manifest=False):
    return _portable_store()._sync_unlocked(quiet=quiet, force_manifest=force_manifest)


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


def _current_manifest():
    return _portable_store()._current_manifest()


def _snapshot_evidence_unlocked(text, supplemental, limit):
    return _portable_store()._snapshot_evidence_unlocked(text, supplemental, limit)


def _query_unlocked(text, limit=5):
    return _portable_store()._query_unlocked(text, limit)


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
