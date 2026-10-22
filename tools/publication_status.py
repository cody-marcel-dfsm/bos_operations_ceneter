#!/usr/bin/env python3
"""Public exact-commit approval transport over existing GitHub commit statuses.

The trusted owner-local publisher first verifies the private independent native
receipt. CI trusts that publisher identity, as it previously trusted its accepted
commit trailers; private evidence is never uploaded.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
from pathlib import Path

try:
    from . import oracle_approval as o
except ImportError:
    import oracle_approval as o

REPOSITORY = "cody-marcel-dfsm/bos_operations_ceneter"
PUBLISHER = "cody-marcel-dfsm"
CONTEXT = "oracle/native-approval"


def _description(tree: str, digest: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{40}", tree) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise o.OracleApprovalError("Publication status requires an exact tree and native receipt digest")
    return "tree:" + tree + " receipt:" + digest


def _target(commit: str) -> str:
    return "https://github.com/" + REPOSITORY + "/commit/" + commit


def publish_status(root: Path, selected: dict, *, execute=subprocess.run) -> dict:
    try:
        from .publication_admission import _source_receipt
    except ImportError:
        from publication_admission import _source_receipt
    commit, tree, digest = (selected[key] for key in
                            ("candidate_commit", "candidate_tree", "technical_receipt_sha256"))
    receipt, raw = _source_receipt(root, commit)
    if receipt["candidate_tree"] != tree or o._sha(raw) != digest:
        raise o.OracleApprovalError("Public status differs from the current independent native receipt")
    description = _description(tree, digest)
    completed = execute(["gh", "api", "--method", "POST", f"repos/{REPOSITORY}/statuses/{commit}",
                         "-f", "state=success", "-f", "context=" + CONTEXT,
                         "-f", "description=" + description, "-f", "target_url=" + _target(commit)],
                        cwd=root, capture_output=True, text=True, check=True)
    status = json.loads(completed.stdout)
    _check_status(status, commit, tree, digest=digest)
    return status


def _check_status(status: dict, commit: str, tree: str, *, digest: str | None = None) -> str:
    match = re.fullmatch(r"tree:([0-9a-f]{40}) receipt:([0-9a-f]{64})", status.get("description", ""))
    if (status.get("context") != CONTEXT or status.get("state") != "success"
            or status.get("creator", {}).get("login") != PUBLISHER
            or status.get("target_url") != _target(commit) or not match
            or match.group(1) != tree or digest is not None and match.group(2) != digest):
        raise o.OracleApprovalError("Public Oracle status has a wrong issuer, commit, tree, receipt or outcome")
    return match.group(2)


def verify_publication(root: Path, candidate: str, *, execute=subprocess.run, wait_seconds: float = 30,
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
        completed = execute(["gh", "api", f"repos/{REPOSITORY}/commits/{commit}/statuses", "--paginate", "--slurp"],
                            cwd=root, capture_output=True, text=True, check=True)
        pages = json.loads(completed.stdout)
        statuses = [row for page in pages for row in page] if pages and isinstance(pages[0], list) else pages
        if not isinstance(statuses, list) or any(not isinstance(row, dict) for row in statuses):
            raise o.OracleApprovalError("Public Oracle status response is malformed")
        # GitHub returns newest first. A later trusted failure revokes its prior
        # success; untrusted statuses can never create or revoke owner approval.
        trusted = [row for row in statuses if row.get("context") == CONTEXT
                   and row.get("creator", {}).get("login") == PUBLISHER]
        if trusted:
            digest = _check_status(trusted[0], commit, tree)
            return {"candidate_commit": commit, "candidate_tree": tree,
                    "technical_receipt_sha256": digest, "publisher": PUBLISHER}
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
