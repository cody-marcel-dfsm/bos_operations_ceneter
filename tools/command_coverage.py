#!/usr/bin/env python3
"""Native command applicability and opaque, commit-bound CI result reuse.

An applicability decision combines original observations and focused repairs. It
does not turn a failed aggregate into a passing execution witness.
"""
from __future__ import annotations

import argparse
import json
import platform
import re
import shlex
import subprocess
import sys
from pathlib import Path

try:
    from . import oracle_approval as o
    from . import publication_status as public_status
except ImportError:
    import oracle_approval as o
    import publication_status as public_status

PREFIX = "validation/native-command/"
ENVIRONMENT_PREFIX = "validation/native-environment/"
PLATFORMS = {"Linux", "Darwin", "Windows", "FreeBSD", "OpenBSD", "NetBSD", "SunOS", "AIX", "unknown"}


def _original_environment(value) -> dict:
    """Retain only display facts present in original execution evidence."""
    result = dict.fromkeys(("platform", "python", "node", "npm"), "unknown")
    if isinstance(value, dict):
        for name in result:
            fact = value.get(name)
            pattern = r"v?[0-9]+(?:\.[0-9]+)*"
            if isinstance(fact, str) and (fact in PLATFORMS if name == "platform" else re.fullmatch(pattern, fact)):
                result[name] = fact
    elif isinstance(value, str):
        for pattern, name in ((r"\b(?:Linux|ubuntu(?:-latest)?)\b", "Linux"),
                              (r"\b(?:Darwin|macOS)\b", "Darwin"), (r"\bWindows\b", "Windows")):
            if re.search(pattern, value):
                result["platform"] = name
                break
        for name in ("python", "node", "npm"):
            match = re.search(r"\b" + name + r"\s*:?\s*(v?[0-9]+(?:\.[0-9]+)*)\b", value, re.I)
            if match:
                result[name] = match.group(1)
    return result


def original_command_environments(root: Path, coverage: list, evidence: dict) -> list:
    """Bind original per-command provenance; assessment never supplies execution."""
    originals, outputs = {}, {}
    kinds = {"oracle-validation-record-v1", "external-ci-actual-observation-v1", "privacy-production-measurement-v1"}
    for name, identity in evidence.items():
        raw = o._custody_read(root, name)[1]
        if o._sha(raw) != identity:
            raise o.OracleApprovalError("Original command environment evidence changed")
        try:
            record = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            continue
        if not isinstance(record, dict) or record.get("kind") not in kinds:
            continue
        value = record.get("execution_environment", record.get("environment"))
        originals[name] = {"evidence_path": name, "evidence_sha256": identity,
            "environment_digest": record.get("environment_digest"),
            "execution_environment": _original_environment(value), "original_environment": value}
        linked = dict(record.get("output_hashes", {}))
        if isinstance(record.get("log"), str) and isinstance(record.get("log_sha256"), str):
            linked[record["log"]] = record["log_sha256"]
        for output, digest in linked.items():
            canonical = o._custody_name(root, output)
            actual = evidence.get(canonical, evidence.get(output))
            if actual == digest:
                outputs.setdefault(canonical, []).append(name)
    rows = []
    for row in coverage:
        selected = set()
        for name in row["evidence_paths"]:
            canonical = o._custody_name(root, name)
            selected.update(outputs.get(canonical, []))
            if name in originals:
                selected.add(name)
            elif canonical in originals:
                selected.add(canonical)
        observations = [originals[name] for name in sorted(selected)]
        if not observations:
            observations = [{"evidence_path": name, "evidence_sha256": evidence[name],
                "environment_digest": None, "execution_environment": _original_environment(None),
                "original_environment": None} for name in row["evidence_paths"]]
        rows.append({"id": row["id"], "observations": observations})
    return rows


def _environment_description(environment: dict) -> str:
    metadata = _original_environment(environment)
    return ("origin:" + metadata["platform"] + " python:" + metadata["python"]
            + " node:" + metadata["node"] + " npm:" + metadata["npm"])


def _environment_set(descriptions: list[str]) -> tuple[list[str], str]:
    values = sorted(set(descriptions))
    return values, o._sha(o._canonical(values))


def _valid_environment_description(value: str) -> bool:
    match = re.fullmatch(r"origin:([A-Za-z]+) python:(?:unknown|v?[0-9.]+) node:(?:unknown|v?[0-9.]+)(?: npm:(?:unknown|v?[0-9.]+))?", value)
    return bool(match and match.group(1) in PLATFORMS)


def requirements(root: Path, tree: str) -> list[dict]:
    package = json.loads(o._git_bytes(root, "show", tree + ":package.json"))
    scripts = package.get("scripts", {})
    aggregate = scripts.get("release:check")
    if not aggregate:
        return []
    commands = [shlex.split(value.strip()) for value in aggregate.split("&&")]
    if "check:publication" in scripts:
        commands.append(["npm", "run", "check:publication"])
    if any(not command or any(token in {";", "||", "|", ">", "<"} for token in command) for command in commands):
        raise o.OracleApprovalError("Release command coverage requires explicit bounded command argv")
    return [{"id": o._sha(o._canonical(command)), "command": command} for command in commands]


def validate_decisions(root: Path, review: dict, context: dict) -> list[dict]:
    required = {item["id"]: item for item in context.get("required_commands", [])}
    rows = review.get("command_coverage", [])
    if not isinstance(rows, list):
        raise o.OracleApprovalError("Native command coverage must be an explicit list")
    seen = set()
    for row in rows:
        identity = row.get("id")
        if identity not in required or identity in seen or row.get("command") != required[identity]["command"]:
            raise o.OracleApprovalError("Native command coverage is duplicate, unknown or changes its exact argv")
        seen.add(identity)
        if row.get("status") not in {"COMPLETE", "INCOMPLETE"} or row.get("basis") != "INDEPENDENT_APPLICABILITY":
            raise o.OracleApprovalError("Native command coverage requires an independent applicability decision")
        o._checked_inputs(row.get("inputs"), context, required_path="package.json")
        paths = row.get("evidence_paths")
        if (row.get("environment_digest") != context["guards"]["environment_digest"]
                or not row.get("reason", "").strip() or not isinstance(paths, list) or not paths
                or any(not isinstance(name, str) for name in paths) or len(set(paths)) != len(paths)):
            raise o.OracleApprovalError("Native command applicability lacks environment, original evidence or rationale")
        for name in row["evidence_paths"]:
            if name not in context["input_hashes"]:
                raise o.OracleApprovalError("Native command applicability references unbound observations")
            actual = "sha256:" + o._files(root, [name])[o._custody_name(root, name)]
            if context["input_hashes"][name] != actual:
                raise o.OracleApprovalError("Native command applicability observation changed")
    if review.get("verdict") == "APPROVED" and (seen != set(required) or any(row["status"] != "COMPLETE" for row in rows)):
        raise o.OracleReviewIncomplete("Complete release command applicability is required before validation completes")
    return rows


def environment_metadata() -> dict:
    result = {"platform": platform.system(), "python": platform.python_version()}
    for executable in ("node", "npm"):
        completed = subprocess.run([executable, "--version"], capture_output=True, text=True, check=True)
        result[executable] = completed.stdout.strip()
    return result


def execution_metadata(root: Path, custody: list, environment: dict, *, execute=subprocess.run) -> dict:
    """Describe the captured executable chain; default PATH is no substitute."""
    result = dict.fromkeys(("python", "node", "npm"), "unknown")
    result["platform"] = platform.system()
    for entry in custody:
        token = Path(entry["token"]).name
        name = ("python" if re.fullmatch(r"python(?:[0-9]+(?:\.[0-9]+)*)?", token)
                else token if token in {"node", "npm"} else None)
        if name is None:
            continue
        path = Path(entry["resolved"])
        path = path if path.is_absolute() else root / path
        try:
            completed = execute([str(path), "--version"], cwd=root, env=environment,
                                capture_output=True, text=True, check=True)
            text = completed.stdout.strip() or completed.stderr.strip()
            if name == "python":
                match = re.fullmatch(r"Python ([0-9]+(?:\.[0-9]+)*)", text)
                version = match.group(1) if match else None
            else:
                version = text if re.fullmatch(r"v?[0-9]+(?:\.[0-9]+)*", text) else None
            if version is not None:
                result[name] = version
        except (OSError, subprocess.CalledProcessError):
            pass  # Original custody still binds this runtime; display is unknown.
    return result


def _description(tree: str, coverage: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{40}", tree) or not re.fullmatch(r"[0-9a-f]{64}", coverage):
        raise o.OracleApprovalError("Command attestation requires exact tree and coverage identities")
    return "tree:" + tree + " coverage:" + coverage


def publish_statuses(root: Path, selected: dict, *, execute=subprocess.run) -> list[dict]:
    try:
        from . import shipment_state as shipment
    except ImportError:
        import shipment_state as shipment
    checkpoint = shipment._load(root)
    reference = checkpoint.get("command_tracking")
    if not reference:
        raise o.OracleApprovalError("Validation preparation requires native changelist command tracking")
    raw = o._custody_read(root, reference["path"])[1]
    tracking = json.loads(raw)
    payload = {key: value for key, value in tracking.items() if key != "tracking_sha256"}
    if (o._sha(raw) != reference["sha256"] or tracking.get("tracking_sha256") != o._sha(o._canonical(payload))
            or tracking.get("validated_commit") != selected["candidate_commit"]
            or tracking.get("candidate_tree") != selected["candidate_tree"]
            or tracking.get("technical_receipt_sha256") != selected["technical_receipt_sha256"]):
        raise o.OracleApprovalError("Native command tracking differs from the prepared validated candidate")
    required = requirements(root, selected["candidate_tree"])
    coverage = tracking.get("command_coverage", [])
    expected = {row["id"]: row["command"] for row in required}
    if (len(coverage) != len(required) or {row["id"] for row in coverage} != set(expected)
            or any(row.get("basis") != "INDEPENDENT_APPLICABILITY" or row.get("status") != "COMPLETE"
                   or row.get("command") != expected.get(row.get("id")) for row in coverage)):
        raise o.OracleApprovalError("Native command tracking lacks complete independent required-command applicability")
    receipt, receipt_raw = shipment.validated_receipt(root, selected["candidate_commit"])
    decision = tracking.get("native_decision")
    if not decision or receipt["validation_evidence"].get(decision["path"]) != decision["sha256"]:
        raise o.OracleApprovalError("Command applicability lacks its original independent native decision")
    decision_raw = o._custody_read(root, decision["path"])[1]
    native = json.loads(decision_raw)
    if (o._sha(receipt_raw) != selected["technical_receipt_sha256"] or o._sha(decision_raw) != decision["sha256"]
            or native.get("outcome") != "APPROVED" or native.get("candidate_tree") != selected["candidate_tree"]
            or native.get("review", {}).get("review_status") != "COMPLETE"
            or o._sha(o._canonical(native["review"])) != receipt["review_digest"]
            or native["review"].get("command_coverage") != coverage):
        raise o.OracleApprovalError("Command applicability differs from the original complete native decision")
    digest = tracking["tracking_sha256"]
    description = _description(selected["candidate_tree"], digest)
    rows = [(PREFIX + row["id"], description) for row in coverage]
    environments = tracking.get("command_environments", [])
    if len(environments) != len(required) or {item["id"] for item in environments} != set(expected):
        raise o.OracleApprovalError("Command tracking lacks original per-command execution provenance")
    metadata_rows = set()
    for row in environments:
        observations = row.get("observations", [])
        if not observations or any(not item.get("evidence_sha256") for item in observations):
            raise o.OracleApprovalError("Original command execution provenance is unbound")
        values, identity = _environment_set([_environment_description(item["execution_environment"]) for item in observations])
        rows.append((ENVIRONMENT_PREFIX + digest + "/" + row["id"], "origins:" + str(len(values)) + " sha256:" + identity))
        metadata_rows.update((ENVIRONMENT_PREFIX + identity + "/" + o._sha(value.encode()), value) for value in values)
    rows.extend(sorted(metadata_rows))
    statuses = []
    for context, summary in rows:
        completed = execute(["gh", "api", "--method", "POST",
            f"repos/{public_status.REPOSITORY}/statuses/{selected['candidate_commit']}",
            "-f", "state=success", "-f", "context=" + context, "-f", "description=" + summary,
            "-f", "target_url=" + public_status._target(selected["candidate_commit"])],
            cwd=root, capture_output=True, text=True, check=True)
        status = json.loads(completed.stdout)
        if (status.get("context") != context or status.get("state") != "success" or status.get("description") != summary
                or status.get("creator", {}).get("login") != public_status.PUBLISHER
                or status.get("target_url") != public_status._target(selected["candidate_commit"])):
            raise o.OracleApprovalError("Command attestation transport changed issuer, candidate, coverage or outcome")
        statuses.append(status)
    return statuses


def _native_coverage(statuses: list, commit: str, tree: str, command: dict) -> tuple[str | None, str | list]:
    trusted = [row for row in statuses if row.get("context") == PREFIX + command["id"]
               and row.get("creator", {}).get("login") == public_status.PUBLISHER]
    if not trusted:
        return None, "No prior trusted command coverage for this changelist"
    row = trusted[0]
    match = re.fullmatch(r"tree:([0-9a-f]{40}) coverage:([0-9a-f]{64})", row.get("description", ""))
    if (row.get("state") != "success" or row.get("target_url") != public_status._target(commit)
            or not match or match.group(1) != tree):
        return None, "Latest trusted command coverage is invalidated, failed or bound to different source"
    environment = next((item for item in statuses if item.get("context") == ENVIRONMENT_PREFIX + match.group(2) + "/" + command["id"]
        and item.get("creator", {}).get("login") == public_status.PUBLISHER), None)
    selected = re.fullmatch(r"origins:([1-9][0-9]*) sha256:([0-9a-f]{64})", environment.get("description", "")) if environment else None
    if (not environment or environment.get("state") != "success"
            or environment.get("target_url") != public_status._target(commit)
            or not selected):
        return None, "Original validation environment metadata is missing or invalidated"
    prefix = ENVIRONMENT_PREFIX + selected.group(2) + "/"
    latest = {}
    for item in statuses:
        context = item.get("context", "")
        if context.startswith(prefix) and item.get("creator", {}).get("login") == public_status.PUBLISHER:
            latest.setdefault(context, item)
    descriptions = []
    for context, item in latest.items():
        summary = item.get("description", "")
        if (item.get("state") != "success" or item.get("target_url") != public_status._target(commit)
                or not _valid_environment_description(summary) or context != prefix + o._sha(summary.encode())):
            return None, "Original execution environment observation is invalidated"
        descriptions.append(summary)
    values, identity = _environment_set(descriptions)
    if len(values) != int(selected.group(1)) or identity != selected.group(2):
        return None, "Original execution environment set is incomplete or changed"
    return match.group(2), values


def ci(root: Path, candidate: str, *, execute=subprocess.run) -> list[dict]:
    # The exact native approval independently binds command applicability to this
    # commit. An original Darwin result remains a Darwin result when consumed by
    # a Linux runner; only the declared command contract can require another OS.
    approved = public_status.verify_publication(root, candidate, execute=execute)
    commit, tree = approved["candidate_commit"], approved["candidate_tree"]
    if o._git(root, "rev-parse", "HEAD^{tree}").strip() != tree:
        raise o.OracleApprovalError("CI checkout differs from the exact native-approved source tree")
    response = execute(["gh", "api", f"repos/{public_status.REPOSITORY}/commits/{commit}/statuses",
                        "--paginate", "--slurp"], cwd=root, capture_output=True, text=True, check=True)
    pages = json.loads(response.stdout)
    statuses = [row for page in pages for row in page] if pages and isinstance(pages[0], list) else pages
    if not isinstance(statuses, list) or any(not isinstance(row, dict) for row in statuses):
        raise o.OracleApprovalError("Command attestation response is malformed")
    outcomes = []
    for command in requirements(root, tree):
        digest, reason = _native_coverage(statuses, commit, tree, command)
        if digest:
            outcomes.append({"command": command["command"], "status": "REUSED_NATIVE_APPLICABILITY",
                             "coverage_sha256": digest, "original_environments": reason,
                             "original_environment": "; ".join(reason)})
        else:
            print(json.dumps({"command": command["command"], "status": "RUN_REQUIRED", "reason": reason}), flush=True)
            execute(command["command"], cwd=root, check=True)
            outcomes.append({"command": command["command"], "status": "PASSED_CURRENT_EXECUTION", "reason": reason})
    return outcomes


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["ci"])
    parser.add_argument("--candidate", default="HEAD")
    args = parser.parse_args(argv)
    try:
        print(json.dumps(ci(o.repository_root(), args.candidate), indent=2))
        return 0
    except (o.OracleApprovalError, OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
