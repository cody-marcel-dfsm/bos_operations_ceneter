#!/usr/bin/env python3
"""Commit-bound local shipment selection; this module performs no publication."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess

try:
    from . import oracle_approval as o
except ImportError:
    import oracle_approval as o


def checkpoint_path(root: Path) -> Path:
    return o.receipt_path(root).parent / "shipment-state.json"


def _load(root: Path) -> dict:
    path = checkpoint_path(root)
    if not path.exists():
        return {}
    raw = o._custody_read(root, path)[1]
    record = json.loads(raw)
    payload = {key: value for key, value in record.items() if key != "state_sha256"}
    if (raw != o._pretty(record) or record.get("kind") != "boc-shipment-state-v1"
            or record.get("state_sha256") != o._sha(o._canonical(payload))):
        raise o.OracleApprovalError("Shipment checkpoint is malformed or changed")
    return record


@o._metadata_owner
def _save(root: Path, record: dict) -> dict:
    payload = {key: value for key, value in record.items() if key != "state_sha256"}
    payload.update(kind="boc-shipment-state-v1", updated_at=datetime.now(timezone.utc).isoformat())
    result = dict(payload, state_sha256=o._sha(o._canonical(payload)))
    o._atomic_write(checkpoint_path(root), o._pretty(result))
    return result


def _ancestor(root: Path, earlier: str, later: str) -> bool:
    return subprocess.run(["git", "merge-base", "--is-ancestor", earlier, later],
                          cwd=root, capture_output=True).returncode == 0


def validated_receipt(root: Path, commit: str | None = None) -> tuple[dict, bytes]:
    """Recheck the original independent receipt; checkpoint text grants no approval."""
    record = _load(root)
    commit = commit or o._git(root, "rev-parse", "HEAD").strip()
    if record.get("last_validated_commit") != commit:
        raise o.OracleApprovalError("Candidate has no exact validated-commit checkpoint")
    digest = record.get("technical_receipt_sha256", "")
    if not isinstance(digest, str) or not o.re.fullmatch(r"[0-9a-f]{64}", digest):
        raise o.OracleApprovalError("Shipment checkpoint lacks its native receipt")
    raw = o._custody_read(root, o._technical_archive(root, digest))[1]
    if o._sha(raw) != digest:
        raise o.OracleApprovalError("Shipment technical receipt changed")
    receipt = json.loads(raw)
    o._verify_receipt(root, receipt, raw)
    if (receipt["base_commit"] != commit
            or receipt["candidate_tree"] != o._git(root, "rev-parse", commit + "^{tree}").strip()
            or o._git(root, "status", "--porcelain=v1", "--untracked-files=all").strip()):
        raise o.OracleApprovalError("Shipment requires the complete clean validated commit")
    return receipt, raw


def record_validated(root: Path) -> dict:
    if o._git(root, "status", "--porcelain=v1", "--untracked-files=all").strip():
        raise o.OracleApprovalError("Commit the complete candidate before advancing validation")
    receipt, raw = o.verify_staged(root)
    commit = o._git(root, "rev-parse", "HEAD").strip()
    if receipt["base_commit"] != commit or receipt["candidate_tree"] != o._git(root, "rev-parse", "HEAD^{tree}").strip():
        raise o.OracleApprovalError("Validation receipt does not bind the exact committed candidate")
    record = _load(root)
    record.update(last_validated_commit=commit, validated_tree=receipt["candidate_tree"],
                  technical_receipt_sha256=o._sha(raw))
    return _save(root, record)


def record_released(root: Path, commit: str, merge_commit: str) -> dict:
    record = _load(root)
    if record.get("last_validated_commit") != commit:
        raise o.OracleApprovalError("Released candidate differs from the validated commit")
    record.update(last_released_commit=commit, released_merge_commit=merge_commit)
    return _save(root, record)


def release_preparation(root: Path, baseline: str, commit: str = "HEAD") -> dict:
    """Bind advancing canonical and generated release identities to committed source."""
    inputs = {}
    def read(name):
        raw = o._git_bytes(root, "show", commit + ":" + name)
        inputs[name] = o._sha(raw)
        return json.loads(raw)
    def version(value):
        if not isinstance(value, str) or not o.re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", value):
            raise o.OracleApprovalError("Release version must be canonical x.y.z")
        return tuple(map(int, value.split(".")))
    current = read("package.json")["version"]
    published = json.loads(o._git_bytes(root, "show", baseline + ":package.json"))["version"]
    if version(current) <= version(published):
        raise o.OracleApprovalError("Release preparation requires a version greater than the published version")
    if read("package-manifest.json").get("version") != current or read("skill-release-manifest.json").get("release") != current:
        raise o.OracleApprovalError("Release preparation has inconsistent canonical or generated versions")
    names = o._git(root, "ls-tree", "-r", "--name-only", commit, "--", "products").splitlines()
    active = []
    for name in names:
        if not name.endswith("/product.json"):
            continue
        product = read(name)
        if product.get("release_status") == "active":
            if product.get("version") != current:
                raise o.OracleApprovalError("Active product release version is inconsistent")
            active.append(product["name"])
    if not active:
        raise o.OracleApprovalError("Release preparation requires active generated products")
    prefixes = {"codex": "clients/codex/plugins", "claude": "clients/claude/plugins",
                "copilot": "clients/copilot/products", "gemini": "clients/gemini/extensions",
                "muse": "clients/muse/plugins"}
    for client, prefix in prefixes.items():
        for product in active:
            manifest = read(f"{prefix}/{product}/.bos-product.json")
            if manifest.get("name") != product or manifest.get("client") != client or manifest.get("version") != current:
                raise o.OracleApprovalError("Generated product release identity is inconsistent")
    return {"version": current, "published_version": published, "inputs": inputs}


def selection(root: Path) -> dict:
    commit = o._git(root, "rev-parse", "HEAD").strip()
    result = {"kind": "boc-shipment-selection-v1", "candidate_commit": commit}
    if __package__:
        from . import oracle_lifecycle
    else:
        import oracle_lifecycle
    running = oracle_lifecycle.active(o, root)
    if running and running["identity"]["review_kind"] == "issue":
        return dict(result, state="REVIEW_IN_PROGRESS", controller=running,
                    reason="Follow the verified live native parent controller")
    if o._git(root, "status", "--porcelain=v1", "--untracked-files=all").strip():
        return dict(result, state="PREPARE", reason="Uncommitted authored work requires preparation")
    try:
        baseline = o._git(root, "rev-parse", "refs/remotes/origin/main^{commit}").strip()
    except o.OracleApprovalError:
        return dict(result, state="BASELINE_UNAVAILABLE",
                    reason="Publication baseline UNAVAILABLE: fetch origin/main before delivery")
    result["published_baseline"] = baseline
    if _ancestor(root, commit, baseline):
        return dict(result, state="NO_CHANGES", reason="Candidate already belongs to published main")
    if not _ancestor(root, baseline, commit):
        return dict(result, state="INTEGRATE", reason="Integrate the current published baseline")
    try:
        result["release_preparation"] = release_preparation(root, baseline, commit)
    except (o.OracleApprovalError, OSError, ValueError, TypeError, KeyError) as exc:
        return dict(result, state="PREPARE", reason=str(exc))
    try:
        record = _load(root)
        validated_receipt(root, commit)
    except (o.OracleApprovalError, OSError, ValueError, TypeError, KeyError) as exc:
        return dict(result, state="VALIDATE", reason=str(exc), last_validated_commit=locals().get("record", {}).get("last_validated_commit"))
    return dict(result, state="DELIVER", reason="Exact validated candidate awaits authorized delivery",
                last_validated_commit=commit)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["status", "validated"])
    args = parser.parse_args(argv)
    try:
        root = o.repository_root()
        result = selection(root) if args.command == "status" else record_validated(root)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except (o.OracleApprovalError, OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=o.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
