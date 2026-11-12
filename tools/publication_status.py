#!/usr/bin/env python3
"""Exact-commit native approval transport as a git-native attestation over SSH.

The trusted owner-local publisher first verifies the private independent native
receipt, then pushes one attestation commit to ``refs/boc/attestations/<commit>``
of the owned repository. Its first parent is the exact candidate commit and its
tree holds only ``attestation.json``, binding the repository, commit, tree,
receipt digest and the approval/command-coverage rows. CI and fresh-clone
verification fetch and validate that record; repository push access replaces the
former status creator login as the issuer boundary. Historical commits that only
carry GitHub commit statuses remain readable through unauthenticated public REST.
Private evidence is never uploaded and no ``gh`` CLI is used.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import time
import urllib.request
from pathlib import Path

try:
    from . import oracle_approval as o
except ImportError:
    import oracle_approval as o

REPOSITORY = "cody-marcel-dfsm/bos_operations_ceneter"
PUBLISHER = "cody-marcel-dfsm"
CONTEXT = "oracle/native-approval"
SSH_REMOTE = "git" + chr(64) + "github.com:" + REPOSITORY + ".git"
# The owned repository's push destinations: the SSH remote on owner hosts and the
# HTTPS identity actions/checkout configures (with or without the .git suffix).
OWNED_REMOTES = (SSH_REMOTE, "https://github.com/" + REPOSITORY + ".git", "https://github.com/" + REPOSITORY)
ATTESTATION_PREFIX = "refs/boc/attestations/"
ATTESTATION_KIND = "boc-native-attestation-v1"
ATTESTATION_FILE = "attestation.json"
ATTESTATION_ISSUER = "git-attestation:" + REPOSITORY
_ROW_KEYS = {"context", "state", "description", "target_url"}
_RECORD_KEYS = {"kind", "repository", "candidate_commit", "candidate_tree", "technical_receipt_sha256", "statuses"}
# Fixed identity and time keep an identical record an identical attestation object.
_ATTESTATION_ENVIRONMENT = {"GIT_AUTHOR_NAME": "BOC native attestation", "GIT_AUTHOR_EMAIL": "attestation@invalid",
                            "GIT_COMMITTER_NAME": "BOC native attestation", "GIT_COMMITTER_EMAIL": "attestation@invalid",
                            "GIT_AUTHOR_DATE": "@0 +0000", "GIT_COMMITTER_DATE": "@0 +0000"}


def _description(tree: str, digest: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{40}", tree) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise o.OracleApprovalError("Publication status requires an exact tree and native receipt digest")
    return "tree:" + tree + " receipt:" + digest


def _target(commit: str) -> str:
    return "https://github.com/" + REPOSITORY + "/commit/" + commit


def push_url(root: Path) -> str:
    """The raw configured origin push destination, exactly one owned repository URL."""
    values = subprocess.run(["git", "config", "--get-all", "remote.origin.pushurl"], cwd=root,
                            capture_output=True, text=True).stdout.split()
    if not values:
        values = subprocess.run(["git", "config", "--get-all", "remote.origin.url"], cwd=root,
                                capture_output=True, text=True).stdout.split()
    if len(values) != 1 or values[0] not in OWNED_REMOTES:
        raise o.OracleApprovalError("Publication requires exactly one owned repository push destination")
    return values[0]


def github_read(path: str):
    """Unauthenticated public REST read of the owned public repository."""
    request = urllib.request.Request("https://api.github.com/repos/" + REPOSITORY + path,
                                     headers={"Accept": "application/vnd.github+json",
                                              "User-Agent": "boc-publication-admission"})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def remote_refs(root: Path, url: str, refs: list[str], *, execute=subprocess.run) -> dict:
    """Read exact remote ref heads with git ls-remote; an absent ref is omitted."""
    completed = execute(["git", "ls-remote", url, *refs], cwd=root, capture_output=True, text=True, check=True)
    result = {}
    for line in (completed.stdout or "").splitlines():
        parts = line.split("\t")
        if (len(parts) != 2 or not re.fullmatch(r"[0-9a-f]{40}", parts[0])
                or parts[1] not in refs or parts[1] in result):
            raise o.OracleApprovalError("Remote ref observation is malformed")
        result[parts[1]] = parts[0]
    return result


def is_ancestor(root: Path, ancestor: str, commit: str) -> bool:
    return not subprocess.run(["git", "merge-base", "--is-ancestor", ancestor, commit], cwd=root,
                              capture_output=True).returncode


def lease_command(url: str, commit: str, ref: str, expected: str | None) -> list[str]:
    """Push one ref only while the remote still holds the expected old value."""
    return ["git", "push", "--force-with-lease=" + ref + ":" + (expected or ""), url, commit + ":" + ref]


def push_ref(root: Path, url: str, commit: str, ref: str, expected: str | None, *, execute=subprocess.run) -> dict:
    """Fast-forward ``ref`` from ``expected`` (None: absent) to ``commit`` and read it back."""
    if expected is not None and not is_ancestor(root, expected, commit):
        raise o.OracleApprovalError("Remote " + ref + " is not an ancestor of the published commit")
    command = lease_command(url, commit, ref, expected)
    execute(command, cwd=root, check=True)
    if remote_refs(root, url, [ref], execute=execute).get(ref) != commit:
        raise o.OracleApprovalError("Remote " + ref + " publication is unconfirmed; read state before retrying")
    return {"ref": ref, "commit": commit, "expected": expected, "command": command}


def trusted(row: dict) -> bool:
    """A git attestation row, or a legacy status created by the owner account."""
    return row.get("issuer") == ATTESTATION_ISSUER or (row.get("creator") or {}).get("login") == PUBLISHER


def attestation_record(root: Path, selected: dict, rows=()) -> dict:
    try:
        from .publication_admission import _source_receipt
    except ImportError:
        from publication_admission import _source_receipt
    commit, tree, digest = (selected[key] for key in
                            ("candidate_commit", "candidate_tree", "technical_receipt_sha256"))
    receipt, raw = _source_receipt(root, commit)
    if receipt["candidate_tree"] != tree or o._sha(raw) != digest:
        raise o.OracleApprovalError("Public attestation differs from the current independent native receipt")
    statuses = [{"context": CONTEXT, "state": "success", "description": _description(tree, digest),
                 "target_url": _target(commit)}]
    statuses += [{"context": context, "state": "success", "description": summary, "target_url": _target(commit)}
                 for context, summary in rows]
    if len({row["context"] for row in statuses}) != len(statuses):
        raise o.OracleApprovalError("Public attestation has duplicate contexts")
    return {"kind": ATTESTATION_KIND, "repository": REPOSITORY, "candidate_commit": commit,
            "candidate_tree": tree, "technical_receipt_sha256": digest, "statuses": statuses}


def publish_attestation(root: Path, selected: dict, rows=(), *, execute=subprocess.run) -> dict:
    """Push the exact-commit attestation over SSH; an unchanged record is reused."""
    record = attestation_record(root, selected, rows)
    commit, url = record["candidate_commit"], push_url(root)
    ref = ATTESTATION_PREFIX + commit
    existing = remote_refs(root, url, [ref], execute=execute).get(ref)
    parents = [commit]
    if existing:
        current = read_attestation(root, commit, execute=execute)
        if current is None or current["object"] != existing:
            raise o.OracleApprovalError("Remote attestation moved during publication")
        if current["record"] == record:
            return {"ref": ref, "object": existing, "record": record, "reused": True}
        # A replacement keeps the earlier record in history and stays a fast-forward.
        parents.append(existing)
    environment = dict(os.environ, **_ATTESTATION_ENVIRONMENT)
    blob = subprocess.run(["git", "hash-object", "-w", "--stdin"], cwd=root, input=o._pretty(record),
                          capture_output=True, check=True).stdout.decode().strip()
    tree = subprocess.run(["git", "mktree"], cwd=root, input=("100644 blob " + blob + "\t" + ATTESTATION_FILE + "\n").encode(),
                          capture_output=True, check=True).stdout.decode().strip()
    arguments = ["git", "commit-tree", tree]
    for parent in parents:
        arguments += ["-p", parent]
    obj = subprocess.run([*arguments, "-m", "BOC native attestation " + commit], cwd=root, env=environment,
                         capture_output=True, check=True).stdout.decode().strip()
    pushed = push_ref(root, url, obj, ref, existing, execute=execute)
    return {"ref": ref, "object": obj, "record": record, "reused": False, "command": pushed["command"]}


def read_attestation(root: Path, commit: str, *, execute=subprocess.run) -> dict | None:
    """Fetch and validate the owned exact-commit attestation; None when absent."""
    url = push_url(root)
    ref = ATTESTATION_PREFIX + commit
    head = remote_refs(root, url, [ref], execute=execute).get(ref)
    if head is None:
        return None
    execute(["git", "fetch", "--no-tags", "--no-write-fetch-head", url, "+" + ref + ":" + ref],
            cwd=root, capture_output=True, text=True, check=True)
    try:
        if o._git(root, "rev-parse", ref + "^{commit}").strip() != head:
            raise o.OracleApprovalError("Fetched attestation differs from the remote ref")
        parents = o._git(root, "show", "-s", "--format=%P", head).split()
        entries = o._git(root, "ls-tree", head).splitlines()
        raw = o._git_bytes(root, "show", head + ":" + ATTESTATION_FILE)
        tree = o._git(root, "show", "-s", "--format=%T", commit).strip()
        record = json.loads(raw)
    except (ValueError, UnicodeDecodeError) as exc:
        raise o.OracleApprovalError("Public attestation is malformed") from exc
    statuses = record.get("statuses") if isinstance(record, dict) else None
    if (not parents or parents[0] != commit or len(parents) > 2
            or len(entries) != 1 or not re.fullmatch(r"100644 blob [0-9a-f]{40}\t" + re.escape(ATTESTATION_FILE), entries[0])
            or raw != o._pretty(record) or set(record) != _RECORD_KEYS
            or record["kind"] != ATTESTATION_KIND or record["repository"] != REPOSITORY
            or record["candidate_commit"] != commit or record["candidate_tree"] != tree
            or not isinstance(record["technical_receipt_sha256"], str)
            or not isinstance(statuses, list) or not statuses
            or any(not isinstance(row, dict) or set(row) != _ROW_KEYS
                   or any(not isinstance(row[key], str) for key in _ROW_KEYS) for row in statuses)
            or len({row["context"] for row in statuses}) != len(statuses)):
        raise o.OracleApprovalError("Public attestation has a wrong repository, commit, tree or record shape")
    return {"object": head, "record": record,
            "statuses": [dict(row, issuer=ATTESTATION_ISSUER) for row in statuses]}


def legacy_statuses(commit: str, *, read=None) -> list[dict]:
    """Historical GitHub commit statuses through unauthenticated public REST, newest first."""
    read = read or github_read
    rows, page = [], 1
    while True:
        batch = read("/commits/" + commit + "/statuses?per_page=100&page=" + str(page))
        if not isinstance(batch, list) or any(not isinstance(row, dict) for row in batch):
            raise o.OracleApprovalError("Public Oracle status response is malformed")
        # Only the attestation reader can mark a row as a git-attestation issuer.
        rows += [{key: value for key, value in row.items() if key != "issuer"} for row in batch]
        if len(batch) < 100:
            return rows
        page += 1


def statuses_for(root: Path, commit: str, *, execute=subprocess.run, read=None) -> list[dict]:
    attestation = read_attestation(root, commit, execute=execute)
    if attestation is not None:
        return attestation["statuses"]
    return legacy_statuses(commit, read=read)


def _check_status(status: dict, commit: str, tree: str, *, digest: str | None = None) -> str:
    match = re.fullmatch(r"tree:([0-9a-f]{40}) receipt:([0-9a-f]{64})", status.get("description", ""))
    if (status.get("context") != CONTEXT or status.get("state") != "success"
            or not trusted(status)
            or status.get("target_url") != _target(commit) or not match
            or match.group(1) != tree or digest is not None and match.group(2) != digest):
        raise o.OracleApprovalError("Public Oracle status has a wrong issuer, commit, tree, receipt or outcome")
    return match.group(2)


def verify_publication(root: Path, candidate: str, *, execute=subprocess.run, read=None, wait_seconds: float = 30,
                       monotonic=time.monotonic, sleep=time.sleep) -> dict:
    commit = o._git(root, "rev-parse", candidate + "^{commit}").strip()
    tree = o._git(root, "show", "-s", "--format=%T", commit).strip()
    parents = o._git(root, "show", "-s", "--format=%P", commit).split()
    if len(parents) > 1:
        if len(parents) != 2 or tree != o._git(root, "show", "-s", "--format=%T", parents[1]).strip():
            raise o.OracleApprovalError("Publication merge tree differs from its reviewed pull-request head")
        commit = parents[1]
    deadline = monotonic() + max(0, min(wait_seconds, 60))
    while True:
        statuses = statuses_for(root, commit, execute=execute, read=read)
        # Newest first. A later trusted failure revokes its prior success;
        # untrusted statuses can never create or revoke owner approval.
        approvals = [row for row in statuses if row.get("context") == CONTEXT and trusted(row)]
        if approvals:
            digest = _check_status(approvals[0], commit, tree)
            return {"candidate_commit": commit, "candidate_tree": tree,
                    "technical_receipt_sha256": digest, "publisher": approvals[0].get("issuer", PUBLISHER)}
        if monotonic() >= deadline:
            raise o.OracleApprovalError("Exact committed candidate has no trusted native Oracle publication status")
        sleep(min(2, max(0, deadline - monotonic())))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("candidate", nargs="?", default="HEAD")
    parser.add_argument("--wait-seconds", type=float, default=30)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(verify_publication(o.repository_root(), args.candidate, wait_seconds=args.wait_seconds), sort_keys=True))
        return 0
    except (o.OracleApprovalError, OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=o.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
