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


def _decision_directory(root: Path, commit: str, tree: str) -> Path:
    if not all(o.re.fullmatch(r"[0-9a-f]{40}", value) for value in (commit, tree)):
        raise o.OracleApprovalError("Publication currentness requires exact candidate identities")
    return o.receipt_path(root).parent / "publication-decisions" / (commit + "-" + tree)


def _applicability(record: dict, scope: dict) -> str:
    review = record["review"]
    criteria = {key: record.get("guards", {}).get(key) for key in
                ("authority_digests", "review_policy_digest", "environment_digest")}
    scope = {key: value for key, value in (scope or {}).items() if key not in {"prior_effects", "history_limitations"}}
    effects = review.get("protected_effects", {})
    return o._sha(o._canonical({"criteria": criteria, "publication_scope": scope,
        "protected_effects": effects.get("active", []),
        "api_version_assessment": review.get("api_version_assessment")}))


def _decision_read(root: Path, directory: Path) -> dict:
    pointer = json.loads(o._custody_read(root, directory / "current.json")[1])
    path = Path(pointer["decision_file"])
    raw = o._custody_read(root, path)[1]
    decision = json.loads(raw)
    identity = o._sha(o._canonical({key: value for key, value in decision.items() if key != "decision_sha256"}))
    if (path.parent != directory or path.name != identity + ".json" or o._sha(raw) != pointer["sha256"]
            or decision.get("decision_sha256") != identity or decision.get("kind") != "boc-publication-currentness-v1"):
        raise o.OracleApprovalError("Publication candidate currentness identity changed")
    return decision


@o._metadata_owner
def observe_decision(root: Path, record: dict, round_path: Path, *, only_if_absent=False,
                     technical_receipt_sha256=None, publication_scope=None) -> None:
    """Seal explicit defects/invalidations; unfinished execution preserves a pass."""
    review = record.get("review", {})
    invalidations = [item for item in review.get("validations", []) if item.get("status") == "INVALIDATED"]
    defects = review.get("findings", []) if record.get("outcome") == "REJECTED" else []
    if record.get("outcome") == "APPROVED" and review.get("review_status") == "COMPLETE":
        state = "APPROVED"
    elif defects or invalidations or review.get("publication_failure"):
        state = "INVALIDATED"
    else:
        return
    commit, tree = record["base_commit"], record["candidate_tree"]
    if state == "APPROVED" and not o.re.fullmatch(r"[0-9a-f]{64}", technical_receipt_sha256 or ""):
        raise o.OracleApprovalError("Publication currentness requires its sealed technical receipt identity")
    directory = _decision_directory(root, commit, tree)
    applicability = _applicability(record, publication_scope) if state == "APPROVED" else None
    receipts = [technical_receipt_sha256] if state == "APPROVED" else []
    if (directory / "current.json").exists() and state == "APPROVED":
        previous = _decision_read(root, directory)
        if previous["state"] == "APPROVED" and previous.get("applicability_sha256") == applicability:
            receipts = sorted(set([*previous.get("valid_receipts", [previous.get("technical_receipt_sha256")]), *receipts]))
    payload = {"kind": "boc-publication-currentness-v1", "source_commit": commit, "source_tree": tree,
        "state": state, "native_round": o._custody_name(root, round_path),
        "native_round_sha256": o._sha(o._pretty(record)), "outcome": record["outcome"],
        "technical_receipt_sha256": technical_receipt_sha256,
        "valid_receipts": receipts, "applicability_sha256": applicability,
        "finding_ids": [item["id"] for item in defects], "invalidations": invalidations}
    result = dict(payload, decision_sha256=o._sha(o._canonical(payload)))
    if __package__:
        from . import oracle_lifecycle
    else:
        import oracle_lifecycle
    path = directory / (result["decision_sha256"] + ".json")
    oracle_lifecycle._publish(o, root, path, result)
    pointer = {"decision_file": str(path), "sha256": o._sha(o._pretty(result))}
    if only_if_absent:
        try:
            oracle_lifecycle._publish(o, root, directory / "current.json", pointer)
        except o.OracleApprovalError:
            if not (directory / "current.json").exists():
                raise
    else:
        o._atomic_write(directory / "current.json", o._pretty(pointer))


@o._metadata_owner
def _import_currentness(root: Path, receipt: dict) -> None:
    """One-time legacy decision import; original command proofs remain sealed."""
    selected = None
    for record in o._read_rounds(o._series_directory(root, receipt["base_commit"])):
        if record["base_commit"] != receipt["base_commit"] or record["candidate_tree"] != receipt["candidate_tree"]:
            continue
        review = record.get("review", {})
        if (record["outcome"] == "APPROVED" and review.get("review_status") == "COMPLETE"
                or record["outcome"] == "REJECTED" and review.get("findings")
                or review.get("publication_failure")
                or any(item.get("status") == "INVALIDATED" for item in review.get("validations", []))):
            selected = record
    if selected is None:
        raise o.OracleApprovalError("Shipment lacks its sealed native candidate decision")
    scope = receipt.get("publication_scope")
    if selected["outcome"] == "APPROVED" and o._sha(o._canonical(selected["review"])) != receipt["review_digest"]:
        rounds = o._read_rounds(o._series_directory(root, receipt["base_commit"]))
        original = next((item for item in rounds if item["outcome"] == "APPROVED"
                         and item["base_commit"] == receipt["base_commit"] and item["candidate_tree"] == receipt["candidate_tree"]
                         and o._sha(o._canonical(item["review"])) == receipt["review_digest"]), None)
        context = json.loads(o._custody_read(root, selected["context_file"])[1])
        scope = context["publication_scope"]
        if (not original or o._sha(o._canonical(context)) != selected["context_sha256"]
                or _applicability(original, receipt.get("publication_scope")) != _applicability(selected, scope)):
            raise o.OracleApprovalError("Shipment current criteria/effects supersede sealed validation")
    path = o._series_directory(root, receipt["base_commit"]) / f"round-{selected['round']:04d}.json"
    observe_decision(root, selected, path, only_if_absent=True,
                     technical_receipt_sha256=o._sha(o._pretty(receipt)) if selected["outcome"] == "APPROVED" else None,
                     publication_scope=scope)


def _current_native_decision(root: Path, receipt: dict) -> None:
    directory = _decision_directory(root, receipt["base_commit"], receipt["candidate_tree"])
    if not (directory / "current.json").exists():
        _import_currentness(root, receipt)
    publication_eligibility(root, receipt["base_commit"], receipt["candidate_tree"], o._sha(o._pretty(receipt)))


def publication_eligibility(root: Path, commit: str, tree: str, digest: str) -> None:
    """Consume candidate-scoped revocation without replaying completed validation."""
    directory = _decision_directory(root, commit, tree)
    decision = _decision_read(root, directory)
    if (decision.get("source_commit") != commit or decision.get("source_tree") != tree
            or not o.re.fullmatch(r"[0-9a-f]{64}", digest)):
        raise o.OracleApprovalError("Publication candidate currentness identity changed")
    if decision["state"] != "APPROVED":
        raise o.OracleApprovalError("Shipment latest native exact-candidate decision explicitly invalidates sealed validation")
    if digest not in decision.get("valid_receipts", [decision.get("technical_receipt_sha256")]):
        raise o.OracleApprovalError("Shipment current criteria/effects supersede sealed validation")


def validated_receipt(root: Path, commit: str | None = None, *, revalidate: bool = False) -> tuple[dict, bytes]:
    """Read the sealed validation result for an immutable committed candidate.

    Full validation happens before record_validated writes its checkpoint. Status
    and publication consume that completed result; they never replay its tests or
    private proof closure. Explicit validation entrypoints can request a recheck.
    """
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
    o._shape(receipt)
    _current_native_decision(root, receipt)
    if revalidate:
        o._verify_receipt(root, receipt, raw)
    if (receipt["base_commit"] != commit
            or receipt["candidate_tree"] != o._git(root, "rev-parse", commit + "^{tree}").strip()
            or o._git(root, "status", "--porcelain=v1", "--untracked-files=all").strip()):
        raise o.OracleApprovalError("Shipment requires the complete clean validated commit")
    return receipt, raw


@o._metadata_owner
def record_validated(root: Path) -> dict:
    if o._git(root, "status", "--porcelain=v1", "--untracked-files=all").strip():
        raise o.OracleApprovalError("Commit the complete candidate before advancing validation")
    commit = o._git(root, "rev-parse", "HEAD").strip()
    record = _load(root)
    if record.get("last_validated_commit") == commit:
        try:
            validated_receipt(root, commit)
        except o.OracleApprovalError:
            pass  # An explicitly changed criterion requires the new completed receipt.
        else:
            reference = record.get("command_tracking", {})
            if reference and o._sha(o._custody_read(root, reference["path"])[1]) == reference["sha256"]:
                return record
    receipt, raw = o.verify_staged(root)
    if receipt["base_commit"] != commit or receipt["candidate_tree"] != o._git(root, "rev-parse", "HEAD^{tree}").strip():
        raise o.OracleApprovalError("Validation receipt does not bind the exact committed candidate")
    tracking = record_command_tracking(root, record, receipt, raw, commit)
    record.update(last_validated_commit=commit, validated_tree=receipt["candidate_tree"],
                  technical_receipt_sha256=o._sha(raw), command_tracking=tracking)
    baseline = receipt.get("publication_scope", {}).get("baseline_commit")
    if baseline:
        try:
            record["release_preparation"] = {"candidate_commit": commit, "baseline_commit": baseline,
                                              "result": release_preparation(root, baseline, commit)}
        except o.OracleApprovalError as exc:
            record.pop("release_preparation", None)
            record["release_preparation_invalidation"] = str(exc)
    return _save(root, record)


def record_command_tracking(root: Path, previous: dict, receipt: dict, raw: bytes, commit: str) -> dict:
    """Retain actual validated changelists and original native command identities."""
    existing = previous.get("command_tracking")
    if previous.get("last_validated_commit") == commit and existing:
        prior_raw = o._custody_read(root, existing["path"])[1]
        prior = json.loads(prior_raw)
        if o._sha(prior_raw) != existing["sha256"]:
            raise o.OracleApprovalError("Immutable validated changelist command tracking changed")
        if prior.get("technical_receipt_sha256") == o._sha(raw):
            return existing
    baseline = previous.get("last_validated_commit")
    if not baseline or not _ancestor(root, baseline, commit):
        baseline = receipt.get("publication_scope", {}).get("baseline_commit")
    commits = o._git(root, "rev-list", "--reverse", baseline + ".." + commit).splitlines() if baseline else [commit]
    if commit not in commits:
        commits.append(commit)
    commands = []
    command_coverage, required_commands, native_decision = [], [], None
    for name in receipt["validation_evidence"]:
        path = Path(name) if Path(name).is_absolute() else root / name
        if path.parent.parent != o.receipt_path(root).parent / "series" or not path.name.startswith("round-"):
            continue
        round_raw = o._custody_read(root, path)[1]
        round_record = json.loads(round_raw)
        if (round_record.get("candidate_tree") != receipt["candidate_tree"] or round_record.get("outcome") != "APPROVED"
                or o._sha(o._canonical(round_record["review"])) != receipt["review_digest"]):
            continue
        native_decision = {"path": o._custody_name(root, path), "sha256": o._sha(round_raw)}
        command_coverage = round_record["review"].get("command_coverage", [])
        context = json.loads(o._custody_read(root, round_record["context_file"])[1])
        required_commands = context.get("required_commands", [])
        for proof in round_record.get("verified_validations", []):
            validation = json.loads(o._custody_read(root, proof["evidence_path"])[1])
            commands.append({"command": validation["command"],
                "command_sha256": o._sha(o._canonical(validation["command"])),
                "evidence_path": proof["evidence_path"], "evidence_sha256": proof["evidence_sha256"],
                "inputs_sha256": o._sha(o._canonical(validation["inputs"])),
                "environment_digest": validation["environment_digest"],
                "output_hashes": validation["output_hashes"]})
    if __package__:
        from .command_coverage import environment_metadata
    else:
        from command_coverage import environment_metadata
    payload = {"kind": "boc-validation-command-tracking-v1", "validated_commit": commit,
        "candidate_tree": receipt["candidate_tree"], "technical_receipt_sha256": o._sha(raw),
        "previous_validated_commit": previous.get("last_validated_commit"),
        "changelists": [{"commit": value, "tree": o._git(root, "rev-parse", value + "^{tree}").strip()}
                        for value in commits], "commands": commands, "required_commands": required_commands,
        "command_coverage": command_coverage, "execution_environment": environment_metadata()}
    payload["native_decision"] = native_decision
    result = dict(payload, tracking_sha256=o._sha(o._canonical(payload)))
    path = o.receipt_path(root).parent / "command-tracking" / (commit + "-" + o._sha(raw) + ".json")
    if __package__:
        from . import oracle_lifecycle
    else:
        import oracle_lifecycle
    oracle_lifecycle._publish(o, root, path, result)
    return {"path": str(path), "sha256": o._sha(o._pretty(result))}


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


def prepared_release(root: Path, baseline: str, commit: str) -> dict:
    retained = _load(root).get("release_preparation", {})
    if retained.get("candidate_commit") == commit and retained.get("baseline_commit") == baseline:
        return retained["result"]
    return release_preparation(root, baseline, commit)


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
        result["release_preparation"] = prepared_release(root, baseline, commit)
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
