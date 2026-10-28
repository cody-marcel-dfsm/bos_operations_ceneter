"""Private native-acceptance evidence custody; never a source approval.

The collector and semantic assessor have distinct enrolled keys and original
process records.  These keys trust this host's OS account, not hostile code
running as the same account.  Consumers must still verify the native meaning
and independently fence the deployed service.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets


ROLES = frozenset({"proof", "semantic"})
MAX_FILE_BYTES = 16 * 1024 * 1024
MAX_TOTAL_BYTES = 48 * 1024 * 1024
MAX_FILES = 96
_NAME = re.compile(r"[a-z0-9][a-z0-9_.-]{0,95}\Z")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False).encode()


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def closed(value, fields, label):
    if not isinstance(value, dict) or set(value) != set(fields):
        raise ValueError(f"{label} fields do not match the closed contract")
    return value


def json_bytes(raw):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("Duplicate evidence JSON key")
            result[key] = value
        return result

    def constant(_value):
        raise ValueError("Non-finite evidence JSON value")

    return json.loads(raw, object_pairs_hook=pairs, parse_constant=constant)


def regular(path, *, limit=MAX_FILE_BYTES):
    path = Path(path).absolute()
    if any(part.is_symlink() for part in (path, *path.parents)) or not path.is_file():
        raise ValueError("Evidence must use original regular files without symlinks")
    if path.stat().st_size > limit:
        raise ValueError("Native evidence exceeds its byte bound")
    raw = path.read_bytes()
    if len(raw) > limit:
        raise ValueError("Native evidence exceeds its byte bound")
    return raw


def owner_directory(root):
    root = Path(root).absolute()
    owner = root / ".git/native-auth-acceptance"
    if any(part.is_symlink() for part in (owner, *owner.parents)):
        raise ValueError("Native owner path contains a symlink")
    return owner


def run_directory(root, run):
    owner = owner_directory(root)
    run = Path(run).absolute()
    if run.parent != owner or not _NAME.fullmatch(run.name):
        raise ValueError("Only owner-collected native runs can be verified")
    if any(part.is_symlink() for part in (run, *run.parents)) or not run.is_dir():
        raise ValueError("Native run directory is not original")
    return run


def implementation(root, paths):
    """Bind every declared producer/issuer dependency, not only its entry file."""
    result = {}
    for name in paths:
        relative = Path(name)
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Native implementation path escapes owner")
        result[name] = digest(regular(Path(root) / relative))
    if not result:
        raise ValueError("Native implementation inventory is empty")
    return result


def enroll(root, role, source_inventory):
    """Explicit private host enrollment; callers own source-review admission."""
    if role not in ROLES or not source_inventory:
        raise ValueError("Unsupported native issuer enrollment")
    owner = owner_directory(root)
    owner.mkdir(parents=True, exist_ok=True, mode=0o700)
    key_path = owner / f"{role}.key"
    if key_path.exists():
        key(root, role)
    else:
        fd = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(secrets.token_bytes(32))
    record = {"role": role, "implementation": source_inventory}
    target = owner / f"{role}-enrollment.json"
    if target.exists():
        if json_bytes(regular(target)) != record:
            raise ValueError("Native enrollment changed; explicit reenrollment is required")
    else:
        write_once(target, canonical(record))
    return record


def key(root, role):
    if role not in ROLES:
        raise ValueError("Unsupported native issuer role")
    path = owner_directory(root) / f"{role}.key"
    raw = regular(path, limit=32)
    if len(raw) != 32 or path.stat().st_mode & 0o077:
        raise ValueError("Native issuer key is unavailable or exposed")
    return raw


def enrolled(root, role, expected):
    value = json_bytes(regular(owner_directory(root) / f"{role}-enrollment.json"))
    if value != {"role": role, "implementation": expected}:
        raise ValueError("Native issuer implementation is not currently enrolled")
    key(root, role)
    other = "semantic" if role == "proof" else "proof"
    other_path = owner_directory(root) / f"{other}.key"
    if other_path.exists() and hmac.compare_digest(key(root, role), key(root, other)):
        raise ValueError("Native proof and semantic issuers must be separately enrolled")
    return value


def write_once(path, raw):
    path = Path(path).absolute()
    if any(part.is_symlink() for part in (path, *path.parents)):
        raise ValueError("Native evidence destination contains a symlink")
    if len(raw) > MAX_FILE_BYTES:
        raise ValueError("Native evidence exceeds its byte bound")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as stream:
        stream.write(raw)


def inventory(directory, names):
    if not names or len(names) > MAX_FILES or len(set(names)) != len(names):
        raise ValueError("Native artifact inventory is empty, duplicated or too large")
    result, total = {}, 0
    for name in sorted(names):
        if not isinstance(name, str) or not _NAME.fullmatch(name):
            raise ValueError("Native artifact name is invalid")
        raw = regular(Path(directory) / name)
        total += len(raw)
        if total > MAX_TOTAL_BYTES:
            raise ValueError("Native artifact inventory exceeds its total bound")
        result[name] = {"sha256": digest(raw), "bytes": len(raw)}
    return result


def seal(root, role, payload, source_inventory):
    enrolled(root, role, source_inventory)
    if not isinstance(payload, dict) or "issuer_mac" in payload or "issuer" in payload:
        raise ValueError("Native receipt payload contains reserved fields")
    result = {**payload, "issuer": role}
    return {**result, "issuer_mac": hmac.new(key(root, role), canonical(result), "sha256").hexdigest()}


def authenticate(root, role, record, source_inventory):
    enrolled(root, role, source_inventory)
    if not isinstance(record, dict) or record.get("issuer") != role:
        raise ValueError("Native receipt has the wrong issuer")
    payload = {k: v for k, v in record.items() if k != "issuer_mac"}
    mac = record.get("issuer_mac")
    expected = hmac.new(key(root, role), canonical(payload), "sha256").hexdigest()
    if not isinstance(mac, str) or not hmac.compare_digest(mac, expected):
        raise ValueError("Native receipt was not issued by its enrolled owner")
    return payload
