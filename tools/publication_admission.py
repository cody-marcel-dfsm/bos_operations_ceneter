#!/usr/bin/env python3
"""Owner-local distributed-plugin publication; review refs remain available."""
from __future__ import annotations

import argparse
import json
import os
import re
import stat
import subprocess
import time
import uuid
from datetime import datetime
from pathlib import Path

try:
    from . import oracle_approval as o
    from . import shipment_state as shipment
    from . import publication_status as public_status
except ImportError:
    import oracle_approval as o
    import shipment_state as shipment
    import publication_status as public_status


def _source_receipt(root: Path, commit: str) -> tuple[dict, bytes]:
    if shipment.checkpoint_path(root).exists():
        receipt, raw = shipment.validated_receipt(root, commit)
        if "publication_scope" not in receipt:
            raise o.OracleApprovalError("Publication requires a current source/effect technical receipt")
        return receipt, raw
    else:
        # Historical releases retain their original accepted-state transport.
        o.verify_commit(root, commit)
        message = o._git(root, "show", "-s", "--format=%B", commit)
        digest = o._trailers(message)[o.TRAILER_KEYS[2]]
        raw = o._custody_read(root, o._technical_archive(root, digest))[1]
    if o._sha(raw) != digest:
        raise o.OracleApprovalError("Publication technical receipt digest changed")
    receipt = json.loads(raw)
    o._shape(receipt)
    tree = o._git(root, "show", "-s", "--format=%T", commit).strip()
    if receipt["candidate_tree"] != tree or "publication_scope" not in receipt:
        raise o.OracleApprovalError("Publication requires a current source/effect technical receipt")
    if receipt["authority_digests"] != o._authorities(root, tree):
        raise o.OracleApprovalError("Publication technical authorities changed")
    if receipt["validation_evidence"] != o._files(root, list(receipt["validation_evidence"])):
        raise o.OracleApprovalError("Publication technical evidence changed")
    rounds = o._read_rounds(o._series_directory(root, receipt["base_commit"]))
    matches = [row for row in rounds if row["candidate_tree"] == tree
               and row["outcome"] == "APPROVED"
               and o._sha(o._canonical(row["review"])) == receipt["review_digest"]]
    if not matches or matches[-1]["review"].get("review_status") != "COMPLETE":
        raise o.OracleApprovalError("Publication lacks the original complete technical decision")
    if matches[-1]["review"].get("protected_effects") != receipt["protected_effects"]:
        raise o.OracleApprovalError("Publication effects differ from the native technical decision")
    o._receipt_current_context(root, receipt, {}, validation_base=receipt["base_commit"])
    o._validate_api_version_assessment(receipt["api_version_assessment"], "APPROVED", root,
                                     receipt["validation_evidence"])
    return receipt, raw


def _remote_admission(root: Path, selected: dict, *, pr=None, execute=subprocess.run,
                      wait_seconds=120, pause=time.sleep) -> dict:
    """Complete required remote admission during validation, preserving real failures."""
    response = execute(["gh", "api", f"repos/{public_status.REPOSITORY}/branches/main"],
                       cwd=root, capture_output=True, text=True, check=True)
    branch = json.loads(response.stdout)
    if not isinstance(branch.get("protected"), bool):
        raise o.OracleApprovalError("Validation remote required-check policy is unavailable")
    deadline = time.monotonic() + wait_seconds
    while True:
        observed = execute(["gh", "pr", "view", str(pr or selected["release_ref"]), "--repo", public_status.REPOSITORY,
            "--json", "number,state,headRefOid,baseRefOid,headRefName,baseRefName,mergeStateStatus,statusCheckRollup"],
            cwd=root, capture_output=True, text=True, check=True)
        row = json.loads(observed.stdout)
        if (row.get("state") != "OPEN" or row.get("headRefOid") != selected["candidate_commit"]
                or row.get("headRefName") != selected["release_ref"] or row.get("baseRefName") != "main"
                or row.get("baseRefOid") != selected["publication_scope"]["baseline_commit"]):
            raise o.OracleApprovalError("Validation remote admission has a different PR source, ref or baseline")
        checks = row.get("statusCheckRollup") or []
        actions = [item for item in checks if item.get("name") == "verify-public-repository"
                   and item.get("workflowName") == "Publication safety"]
        failed = [item for item in checks if (item.get("status") == "COMPLETED"
                  and item.get("conclusion") != "SUCCESS") or item.get("state") in {"FAILURE", "ERROR"}]
        if failed:
            raise o.OracleApprovalError("Validation remote admission contains a failed required check: "
                                       + ", ".join(item.get("name", item.get("context", "unknown")) for item in failed))
        complete = checks and actions and all(item.get("conclusion", item.get("state")) == "SUCCESS" for item in checks)
        if complete and row.get("mergeStateStatus") == "CLEAN":
            break
        if time.monotonic() >= deadline:
            raise o.OracleReviewIncomplete("Validation remote admission remains pending; retain completed local command coverage")
        pause(min(2, max(0, deadline - time.monotonic())))
    for action in actions:
        match = re.fullmatch(r"https://github\.com/" + re.escape(public_status.REPOSITORY)
                            + r"/actions/runs/([1-9][0-9]*)/job/[1-9][0-9]*", action.get("detailsUrl", ""))
        if not match:
            raise o.OracleApprovalError("Required Actions check lacks its repository-owned run identity")
        response = execute(["gh", "api", f"repos/{public_status.REPOSITORY}/actions/runs/{match.group(1)}"],
                           cwd=root, capture_output=True, text=True, check=True)
        run = json.loads(response.stdout)
        if (run.get("head_sha") != selected["candidate_commit"] or run.get("head_branch") != selected["release_ref"]
                or run.get("repository", {}).get("full_name") != public_status.REPOSITORY
                or run.get("head_repository", {}).get("full_name") != public_status.REPOSITORY
                or run.get("event") != "pull_request" or run.get("path") != ".github/workflows/publication-safety.yml"
                or run.get("status") != "completed" or run.get("conclusion") != "success"):
            raise o.OracleApprovalError("Required Actions run differs from the exact source/repository/workflow admission")
    return {"kind": "boc-remote-validation-admission-v1", "source_commit": selected["candidate_commit"],
            "source_tree": selected["candidate_tree"], "pr": row["number"], "observation_sha256": o._sha(o._canonical(row)),
            "branch_protected": branch["protected"], "branch_observation_sha256": o._sha(o._canonical(branch)),
            "required_workflow": ".github/workflows/publication-safety.yml", "required_job": "verify-public-repository",
            "run_ids": [int(re.search(r"/runs/([0-9]+)/", item["detailsUrl"])[1]) for item in actions]}


def _prepared_result(root: Path, path: Path, record: dict) -> dict:
    return dict(record, status="PREPARED", prepared_file=str(path), prepared_record=str(path),
                prepared_record_sha256=o._sha(o._pretty(record)),
                publish_argv=["python3", str(root / "tools/publication_admission.py"),
                              "publish", "--prepared", str(path)], environment={})


def _prepared_authority(root: Path, record: dict) -> None:
    """Consume the captured authority and current instruction before its effect."""
    if not record["plan"]["human_authority_required"]:
        return
    reference = record.get("publication_authority")
    if (not isinstance(reference, dict) or set(reference) != {"paths", "custody"}
            or not isinstance(reference["paths"], list) or not reference["paths"]
            or any(not isinstance(path, str) or not path for path in reference["paths"])
            or len(set(reference["paths"])) != len(reference["paths"])
            or reference["custody"] != o._custody_files(root, reference["paths"])):
        raise o.OracleApprovalError("Prepared publication authority custody changed or is unavailable")
    _check_authorization(root, record["plan"], reference["paths"])


@o._metadata_owner
def prepare(root: Path, candidate: str, release_ref: str, operation: str, *,
            authorization=None, pr=None, refresh: bool = True, execute=subprocess.run) -> dict:
    """Finish validation/preflight and persist the exact Git publication inputs."""
    selected = plan(root, candidate, release_ref, operation, refresh=refresh)
    if selected.get("state") == "NO_CHANGES":
        return selected
    _check_authorization(root, selected, authorization)
    if __package__:
        from . import command_coverage
    else:
        import command_coverage
    target = selected["destination"]["ref"]
    expected = selected["publication_scope"]["baseline_commit"] if target == "refs/heads/main" else None
    payload = {"kind": "boc-prepared-git-publication-v1", "plan": selected,
               "source_commit": selected["candidate_commit"], "source_tree": selected["candidate_tree"],
               "remote_url": selected["destination"]["remote_url"], "target_ref": target,
               "expected_remote_commit": expected,
               "command": ["git", "push", selected["destination"]["remote_url"],
                           selected["candidate_commit"] + ":" + target]}
    if selected["human_authority_required"]:
        paths = list(dict.fromkeys(str(path) for path in _authorization_paths(authorization)))
        payload["publication_authority"] = {"paths": paths, "custody": o._custody_files(root, paths)}
    directory = o.receipt_path(root).parent / "publication-prepared"
    index = directory / "by-plan" / (o._sha(o._canonical(payload)) + ".json")
    if index.exists():
        reference = json.loads(o._custody_read(root, index)[1])
        path = Path(reference["path"])
        raw = o._custody_read(root, path)[1]
        record = json.loads(raw)
        bound = {key: value for key, value in record.items() if key not in {"prepared_sha256", "remote_admission"}}
        if (path.parent != directory or o._sha(raw) != reference["sha256"] or bound != payload
                or path.name != record["prepared_sha256"] + ".json"
                or record["prepared_sha256"] != o._sha(o._canonical({key:value for key,value in record.items() if key != "prepared_sha256"}))):
            raise o.OracleApprovalError("Immutable prepared publication changed")
        _prepared_authority(root, record)
        return _prepared_result(root, path, record)
    if command_coverage.requirements(root, selected["candidate_tree"]):
        # Review-source upload and its opaque native coverage transport are
        # validation preparation. Unchanged completed preparation is reused.
        execute(["git", "push", selected["destination"]["remote_url"],
                 selected["candidate_commit"] + ":refs/heads/codex/validation-" + selected["candidate_commit"]], cwd=root, check=True)
        # CI waits for native approval. Publish the entire required command
        # transport first, so its first import sees completed coverage.
        command_coverage.publish_statuses(root, selected, execute=execute)
        public_status.publish_status(root, selected, execute=execute)
        # An existing PR starts Actions on this ref update. Its first CI read
        # therefore sees the entire original native command transport already.
        execute(["git", "push", selected["destination"]["remote_url"],
                 selected["candidate_commit"] + ":refs/heads/" + release_ref], cwd=root, check=True)
        payload["remote_admission"] = _remote_admission(root, selected, pr=pr, execute=execute)
    else:
        payload["remote_admission"] = None  # Synthetic repositories without the owner's release contract.
    record = dict(payload, prepared_sha256=o._sha(o._canonical(payload)))
    path = directory / (record["prepared_sha256"] + ".json")
    if __package__:
        from . import oracle_lifecycle
    else:
        import oracle_lifecycle
    oracle_lifecycle._publish(o, root, path, record)
    oracle_lifecycle._publish(o, root, index, {"path": str(path), "sha256": o._sha(o._pretty(record))})
    return _prepared_result(root, path, record)


def _prepared_record(root: Path, prepared: Path) -> tuple[dict, str, list[str]]:
    path = Path(prepared)
    if not path.is_absolute():
        path = root / path
    raw = o._custody_read(root, path)[1]
    record = json.loads(raw)
    payload = {key: value for key, value in record.items() if key != "prepared_sha256"}
    digest = o._sha(o._canonical(payload))
    directory = o.receipt_path(root).parent / "publication-prepared"
    if (path.parent != directory or path.name != digest + ".json" or raw != o._pretty(record)
            or record.get("kind") != "boc-prepared-git-publication-v1" or record.get("prepared_sha256") != digest
            or record.get("remote_url") != o.PUBLICATION_REMOTE
            or not re.fullmatch(r"[0-9a-f]{40}", record.get("source_commit", ""))
            or not re.fullmatch(r"refs/heads/(main|codex/release-v[0-9]+\.[0-9]+\.[0-9]+)", record.get("target_ref", ""))):
        raise o.OracleApprovalError("Publication requires its immutable owner-local prepared Git inputs")
    command = ["git", "push", record["remote_url"], record["source_commit"] + ":" + record["target_ref"]]
    if record.get("command") != command:
        raise o.OracleApprovalError("Prepared publication Git command changed")
    return record, digest, command


@o._metadata_owner
def publish_prepared(root: Path, prepared: Path, *, execute=subprocess.run) -> dict:
    """Publish a captured validated SHA with Git only, independent of later authors."""
    started = time.monotonic()
    record, digest, command = _prepared_record(root, prepared)
    shipment.publication_eligibility(root, record["source_commit"], record["source_tree"],
                                    record["plan"]["technical_receipt_sha256"])
    _prepared_authority(root, record)
    # A normal push rejects non-fast-forward movement and preserves server-side
    # protection. It publishes this captured SHA even while new authors work.
    def result(state, returncode):
        elapsed = time.monotonic() - started
        outcome = {"kind": "boc-git-publication-result-v1", "state": state, "status": state,
            "source_commit": record["source_commit"], "source_tree": record["source_tree"],
            "candidate_commit": record["source_commit"], "destination": record["plan"]["destination"],
            "prepared_sha256": digest, "elapsed_seconds": elapsed,
            "publication_sla_seconds": 10, "publication_sla_breached": elapsed >= 10,
            "returncode": returncode}
        if __package__:
            from . import oracle_lifecycle
        else:
            import oracle_lifecycle
        attempt = o.receipt_path(root).parent / "publication-attempts" / (uuid.uuid4().hex + ".json")
        try:
            oracle_lifecycle._publish(o, root, attempt, outcome)
        except Exception as exc:
            # The terminal Git result is already known. Preserve it even if
            # private journal cleanup fails after the remote effect completed.
            return dict(outcome, attempt_file=None, bookkeeping_error={"stage": "publication_attempt", "error": str(exc)})
        return dict(outcome, attempt_file=str(attempt))
    try:
        execute(command, cwd=root, check=True)
    except (subprocess.CalledProcessError, OSError) as exc:
        exc.publication_result = result("FAILED", getattr(exc, "returncode", None))
        raise
    return result("PUBLISHED", 0)


def plan(root: Path, candidate: str, release_ref: str, operation: str, *, refresh: bool = True) -> dict:
    if operation not in {"review-push", "main-promotion"}:
        raise o.OracleApprovalError("Unknown publication operation")
    if not re.fullmatch(r"codex/release-v[0-9]+\.[0-9]+\.[0-9]+", release_ref):
        raise o.OracleApprovalError("Publication requires the resolved release review ref")
    if o._git(root, "remote", "get-url", "origin").strip() != o.PUBLICATION_REMOTE:
        raise o.OracleApprovalError("Publication destination is outside this owned repository")
    if refresh:
        o._git(root, "fetch", "origin")
    commit = o._git(root, "rev-parse", candidate + "^{commit}").strip()
    if (o._git(root, "branch", "--show-current").strip() != "main"
            or o._git(root, "rev-parse", "HEAD").strip() != commit
            or o._git(root, "status", "--porcelain=v1", "--untracked-files=all").strip()):
        raise o.OracleApprovalError("Publication requires the complete clean canonical-main candidate")
    if shipment.selection(root)["state"] == "NO_CHANGES":
        return {"kind": "boc-publication-plan-v1", "state": "NO_CHANGES", "candidate_commit": commit}
    receipt, raw = _source_receipt(root, commit)
    # The sealed exact-CL decision already assessed every effective receipt in
    # this immutable range. Only the fetched destination baseline can change.
    current = receipt["publication_scope"]
    if not shipment.checkpoint_path(root).exists():
        current = o._publication_scope(root, receipt["candidate_tree"])
    elif current["target_ref"] is not None and o._git(root, "rev-parse", "refs/remotes/origin/main^{commit}").strip() != current["baseline_commit"]:
        raise o.OracleApprovalError("Publication baseline changed; validate only the affected destination/range")
    if current["target_ref"] is None:
        raise o.OracleApprovalError("Publication baseline UNAVAILABLE: fetch origin/main and obtain a complete current range assessment")
    shipment.prepared_release(root, current["baseline_commit"], commit)
    # The just-committed receipt itself is outside the earlier HEAD range; it
    # adds no earlier effect. Preserve every earlier effective origin exactly.
    current = dict(current, prior_effects=[row for row in current["prior_effects"] if row["origin"] != o._sha(raw)])
    if current != receipt["publication_scope"] or current["remote_url"] != o.PUBLICATION_REMOTE:
        raise o.OracleApprovalError("Publication source range or target changed; obtain current technical review")
    o._protected_effects({"protected_effects": receipt["protected_effects"]}, current)
    result = {"kind": "boc-publication-plan-v1", "candidate_commit": commit,
              "candidate_tree": receipt["candidate_tree"], "technical_receipt_sha256": o._sha(raw),
              "publication_scope": current, "protected_effects": receipt["protected_effects"],
              "destination": {"remote_url": o.PUBLICATION_REMOTE,
                              "ref": "refs/heads/" + (release_ref if operation == "review-push" else "main")},
              "release_ref": release_ref, "operation": operation,
              "human_authority_required": operation == "main-promotion" and bool(receipt["protected_effects"]["active"])}
    return dict(result, plan_sha256=o._sha(o._canonical(result)))


def _authorization_paths(authorization) -> list[Path]:
    if authorization is None:
        return []
    return [authorization] if isinstance(authorization, Path) else list(authorization)


def _authorization_effects(root: Path, selected: dict, authorization: Path) -> set[str]:
    """An immutable exact-plan attempt contributes only its genuinely authorized subset."""
    raw = o._custody_read(root, authorization)[1]
    record = json.loads(raw)
    if record.get("kind") == "boc-direct-publication-authorization-v1":
        return _direct_authorization_effects(root, selected, record, raw)
    required = {"kind", "plan", "requested_effect_ids", "verdict", "review_status", "owner_evidence",
                "native_result", "native_evidence", "authorization_sha256"}
    if not isinstance(record, dict) or set(record) not in (required, required | {"authorization_request_sha256"}):
        raise o.OracleApprovalError("Publication authorization record has invalid fields")
    payload = {key: value for key, value in record.items() if key != "authorization_sha256"}
    requested = record.get("requested_effect_ids")
    active = {row["id"] for row in selected["protected_effects"]["active"]}
    if (raw != o._pretty(record) or record.get("kind") != "boc-publication-authorization-v1"
            or record.get("authorization_sha256") != o._sha(o._canonical(payload))
            or record.get("plan") != selected or record.get("verdict") != "APPROVED"
            or record.get("review_status") != "COMPLETE"
            or not isinstance(requested, list) or not requested or len(set(requested)) != len(requested)
            or not set(requested).issubset(active) or not record.get("owner_evidence")
            or record.get("owner_evidence") != o._files(root, list(record.get("owner_evidence", {})))):
        raise o.OracleApprovalError("Publication authority is stale, mismatched or lacks original evidence")
    evidence = record.get("native_evidence")
    if not isinstance(evidence, dict) or evidence != o._files(root, list(evidence)):
        raise o.OracleApprovalError("Publication authorization native evidence changed")
    result_path = Path(record["native_result"])
    if (result_path.name != "result.json" or result_path.parent.parent != o.receipt_path(root).parent / "runs"
            or not re.fullmatch(r"authorize-[0-9a-f]{32}", result_path.parent.name)):
        raise o.OracleApprovalError("Publication authority is outside the native authorization run")
    if "authorization_request_sha256" in record:
        request_path = result_path.parent / "authorization-request.json"
        if o._custody_name(root, request_path) not in evidence:
            raise o.OracleApprovalError("Publication authorization request lacks its original input proof")
        request = json.loads(o._custody_read(root, request_path)[1])
        if (record["authorization_request_sha256"] != o._sha(o._canonical(request))
                or request.get("plan") != selected or request.get("owner_evidence") != record["owner_evidence"]
                or request.get("requested_effect_ids") != requested):
            raise o.OracleApprovalError("Publication authorization request has a different plan/effect/evidence scope")
    result = json.loads(o._custody_read(root, result_path)[1])
    process = json.loads(o._custody_read(root, result_path.parent / "process.json")[1])
    model = json.loads(o._custody_read(root, result_path.parent / "model.json")[1])
    outcome = json.loads(o._custody_read(root, result_path.parent / "outcome.json")[1])
    inputs = json.loads(o._custody_read(root, result_path.parent / "authorization-inputs.json")[1])
    if (result.get("verdict") != "APPROVED" or result.get("review_status") != "COMPLETE"
            or result.get("plan_sha256") != selected["plan_sha256"]
            or set(result.get("authorized_effect_ids", [])) != set(requested)
            or process.get("exit_code") != 0 or model.get("reviewer_role") != "independent-oracle-approver"
            or outcome.get("outcome") != "APPROVED" or not outcome.get("reviewer_invoked")
            or inputs != {"plan": selected, "requested_effect_ids": requested,
                          "owner_evidence": record["owner_evidence"]}
            or any(o._custody_name(root, result_path.parent / name) not in evidence
                   for name in ("result.json", "process.json", "model.json", "request.txt", "authorization-inputs.json"))):
        raise o.OracleApprovalError("Publication lacks genuine complete scoped authorization")
    return set(requested)


def _covered_authorizations(root: Path, selected: dict, authorization) -> tuple[set[str], list[dict]]:
    covered, observations = set(), []
    for path in _authorization_paths(authorization):
        try:
            effects = _authorization_effects(root, selected, path)
            covered.update(effects)
            observations.append({"path": str(path), "authorized_effect_ids": sorted(effects)})
        except (o.OracleApprovalError, OSError, ValueError, TypeError, KeyError, AttributeError) as exc:
            # Preserve stale/rejected attempts as observations. A later genuine
            # exact authorization can supply the missing scope independently.
            observations.append({"path": str(path), "error": str(exc)})
    return covered, observations


def _check_authorization(root: Path, selected: dict, authorization) -> None:
    if not selected["human_authority_required"]:
        return
    covered, observations = _covered_authorizations(root, selected, authorization)
    missing = {row["id"] for row in selected["protected_effects"]["active"]} - covered
    if missing:
        detail = "; ".join(item["error"] for item in observations if "error" in item)
        raise o.OracleApprovalError("Protected product publication requires scoped deployment authority for "
                                    + ", ".join(sorted(missing)) + (": " + detail if detail else ""))


def _authorization_request(root: Path, candidate: str, release_ref: str, owner_path: str, *, authorization=None, effect_ids=None) -> dict:
    selected = plan(root, candidate, release_ref, "main-promotion")
    if selected.get("state") == "NO_CHANGES":
        return {"candidate_input": candidate, "release_ref_input": release_ref, "plan": selected,
                "owner_evidence": None, "prior_authorizations": [],
                "selected_effect_ids": None if effect_ids is None else sorted(set(effect_ids)),
                "requested_effect_ids": []}
    prior = o._custody_files(root, [str(path) for path in _authorization_paths(authorization)], allow_absent=True)
    owner = o._files(root, [owner_path])
    covered, _ = _covered_authorizations(root, selected, authorization) if selected.get("state") != "NO_CHANGES" else (set(), [])
    active = {row["id"] for row in selected.get("protected_effects", {}).get("active", [])}
    chosen = active if effect_ids is None else set(effect_ids)
    if not chosen.issubset(active):
        raise o.OracleApprovalError("Publication authorization selects an unknown current effect")
    return {"candidate_input": candidate, "release_ref_input": release_ref, "plan": selected,
            "owner_evidence": owner, "prior_authorizations": prior,
            "selected_effect_ids": None if effect_ids is None else sorted(chosen),
            "requested_effect_ids": sorted(chosen - covered)}


def _authorization_result(root: Path, request: dict, result: dict) -> None:
    if result.get("authorization_request_sha256") != o._sha(o._canonical(request)):
        raise o.OracleApprovalError("Observed publication authorization belongs to a different request")
    if request["plan"].get("state") == "NO_CHANGES":
        if {key: value for key, value in result.items() if key != "authorization_request_sha256"} != request["plan"]:
            raise o.OracleApprovalError("Observed publication selection changed")
    elif (result.get("requested_effect_ids") != request["requested_effect_ids"]
          or result.get("plan") != request["plan"] or result.get("owner_evidence") != request["owner_evidence"]):
        raise o.OracleApprovalError("Observed publication authority changed its plan/effect/evidence scope")


def _host_sessions_root() -> Path:
    return Path.home() / ".codex" / "sessions"


def _instruction_host_records(root: Path, host: dict) -> tuple[dict, dict]:
    """Read only selected native host records; ordinary journal append is safe."""
    required = {"session_file", "thread_id", "question_call_id", "question_index", "question_text",
                "approved_answer", "user_message_id", "turn_id", "records"}
    if (not isinstance(host, dict) or set(host) != required or host["approved_answer"] != "Approved"
            or not re.fullmatch(r"[0-9a-f-]{36}", host["thread_id"])
            or type(host["question_index"]) is not int or host["question_index"] < 0):
        raise o.OracleApprovalError("Invalid direct native user instruction")
    path = Path(host["session_file"])
    home = _host_sessions_root()
    if (not path.is_absolute() or ".." in path.parts or not path.is_relative_to(home)
            or list(home.rglob("*" + host["thread_id"] + ".jsonl")) != [path]):
        raise o.OracleApprovalError("Instruction source is outside its unique native host journal")
    before = o._custody_read(root, path, content=False)[0]
    if before["source"].get("links"):
        raise o.OracleApprovalError("Instruction journal has a linked route")
    parent = []
    o._owner_source_walk(Path(path.anchor), str(path.parent).lstrip(os.sep), content=False,
                         directory_fd=parent, custody=True)
    records, descriptor = {}, None
    try:
        descriptor = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW, dir_fd=parent[0])
        original = os.fstat(descriptor)
        identity = lambda value: (value.st_dev, value.st_ino, value.st_mode, value.st_uid)
        if not stat.S_ISREG(original.st_mode) or original.st_uid != os.getuid():
            raise o.OracleApprovalError("Instruction journal is not an owned regular file")
        selections = host["records"]
        if not isinstance(selections, dict) or set(selections) != {"meta", "question", "acceptance", "answer"}:
            raise o.OracleApprovalError("Instruction lacks original host record ranges")
        end = 0
        for name in ("meta", "question", "acceptance", "answer"):
            row = selections[name]
            if (not isinstance(row, dict) or set(row) != {"offset", "length", "sha256"}
                    or type(row["offset"]) is not int or type(row["length"]) is not int
                    or row["offset"] < end or not 0 < row["length"] <= 65536
                    or name == "meta" and row["offset"] != 0):
                raise o.OracleApprovalError("Invalid native instruction byte range")
            raw = os.pread(descriptor, row["length"], row["offset"])
            if (len(raw) != row["length"] or not raw.endswith(b"\n") or raw.count(b"\n") != 1
                    or row["offset"] and os.pread(descriptor, 1, row["offset"] - 1) != b"\n"
                    or o._sha(raw) != row["sha256"]):
                raise o.OracleApprovalError("Native instruction bytes changed or are incomplete")
            records[name] = json.loads(raw)
            end = row["offset"] + row["length"]
        later = []
        with os.fdopen(os.dup(descriptor), "rb") as suffix:
            suffix.seek(end)
            while suffix.tell() < original.st_size:
                line = suffix.readline(1_000_001)
                if len(line) > 1_000_000:
                    raise o.OracleApprovalError("Native instruction suffix exceeds its bounded record size")
                if not any(value.encode() in line for value in (host["question_call_id"], host["user_message_id"])):
                    continue
                event = json.loads(line); payload = event.get("payload", {})
                if (event.get("type") == "event_msg" and payload.get("type") == "item_completed"
                        and payload.get("item", {}).get("type") == "UserMessage"):
                    later.append(payload["item"])
        if (identity(os.fstat(descriptor)) != identity(original)
                or identity(os.stat(path.name, dir_fd=parent[0], follow_symlinks=False)) != identity(original)
                or o._custody_read(root, path, content=False)[0] != before):
            raise o.OracleApprovalError("Native instruction route changed during consumption")
        custody = {"route": before, "identity": list(identity(original)), "records": selections}
    finally:
        if descriptor is not None:
            os.close(descriptor)
        os.close(parent[0])
    meta, question, accepted, answer = (records[name] for name in ("meta", "question", "acceptance", "answer"))
    source = meta.get("payload", {})
    call, response, user = (item.get("payload", {}) for item in (question, accepted, answer))
    if (meta.get("type") != "session_meta" or source.get("id") != host["thread_id"]
            or source.get("thread_source") != "user" or source.get("source") != "vscode"
            or source.get("originator") != "Codex Desktop"
            or question.get("type") != "response_item" or call.get("type") != "function_call"
            or call.get("name") != "request_user_input_async" or call.get("call_id") != host["question_call_id"]
            or accepted.get("type") != "response_item" or response.get("type") != "function_call_output"
            or response.get("call_id") != host["question_call_id"] or json.loads(response.get("output", "null")) != {"accepted": True}
            or answer.get("type") != "event_msg" or user.get("type") != "item_completed"
            or user.get("thread_id") != host["thread_id"] or user.get("turn_id") != host["turn_id"]
            or user.get("item", {}).get("type") != "UserMessage" or user["item"].get("id") != host["user_message_id"]
            or not question["ordinal"] < accepted["ordinal"] < answer["ordinal"]):
        raise o.OracleApprovalError("Instruction lacks the original native question and direct UserMessage")
    questions = json.loads(call.get("arguments", "{}"))["questions"]
    chosen = questions[host["question_index"]]
    if chosen.get("title") != host["question_text"] or chosen.get("options") != ["Approved", "Hold publication"]:
        raise o.OracleApprovalError("Native prepared question differs from the bound instruction")
    content = user["item"].get("content", [])
    if len(content) != 1 or content[0].get("type") != "text":
        raise o.OracleApprovalError("Direct user instruction content is unavailable")
    text = content[0].get("text", "").strip()
    opening, closing = "<send_user_message_question_reply>", "</send_user_message_question_reply>"
    if not text.startswith(opening) or not text.endswith(closing):
        raise o.OracleApprovalError("Derived prose is not a native user question reply")
    replies = json.loads(text[len(opening):-len(closing)])
    if (not isinstance(replies, list) or len(replies) != 1 or set(replies[0]) != {"questionItemId", "question", "answer"}
            or json.loads(replies[0]["questionItemId"]) != ["request_user_input_async", host["question_call_id"], host["question_index"]]
            or replies[0]["question"] != host["question_text"]
            or replies[0]["answer"] not in {"Approved", "Hold publication"}):
        raise o.OracleApprovalError("Native user reply has a different question, call or decision")
    for item in later:
        contents = item.get("content", [])
        changed = "".join(row.get("text", "") for row in contents).strip()
        if item.get("id") == host["user_message_id"] and changed != text:
            raise o.OracleApprovalError("Native user instruction was superseded")
        if changed.startswith(opening) and changed.endswith(closing):
            for reply in json.loads(changed[len(opening):-len(closing)]):
                if reply.get("questionItemId") == replies[0]["questionItemId"] and reply != replies[0]:
                    raise o.OracleApprovalError("Native user instruction was superseded")
    return {"decision": replies[0]["answer"], "question_timestamp": question["timestamp"]}, custody


def _instruction_question(root: Path, approved: dict, identities: list[str], pr: int) -> str:
    version = json.loads(o._git_bytes(root, "show", approved["candidate_commit"] + ":package.json"))["version"]
    url = "https://github.com/" + public_status.REPOSITORY + "/pull/" + str(pr)
    if identities == ["codex-invalid-refresh-handoff-removal"]:
        return (f"May I include the additional OAuth contract change in the {version} repository publication from PR #{pr} ({url})? "
                "Rejected refreshes would require HTTP 400 invalid_grant with no access, refresh or ID token fields, "
                "replacing the temporary Codex handoff response. Technical review and required checks passed. "
                "This decision covers repository publication; service deployment remains separate.")
    effects = sorted((row for row in approved["protected_effects"]["active"] if row["id"] in identities), key=lambda row: row["id"])
    return (f"May I publish {version} from PR #{pr} ({url}) with these exact protected effects: "
            + o._canonical(effects).decode() + "? This decision covers repository publication; service deployment remains separate.")


def _instruction_binding_contents(root: Path, selected: dict, owner_path: str, requested: list[str]) -> dict:
    instruction = json.loads(o._custody_read(root, owner_path)[1])
    if (not isinstance(instruction, dict) or set(instruction) != {"kind", "prepared_plan", "prepared_review", "effect_ids", "host_message"}
            or instruction["kind"] != "boc-direct-publication-instruction-input-v1"
            or not isinstance(instruction["effect_ids"], list) or not instruction["effect_ids"]
            or len(set(instruction["effect_ids"])) != len(instruction["effect_ids"])
            or not set(requested).issubset(instruction["effect_ids"])):
        raise o.OracleApprovalError("Publication requires exact native direct-human instruction evidence")
    reference = instruction["prepared_plan"]
    if not isinstance(reference, dict) or set(reference) != {"path", "sha256"}:
        raise o.OracleApprovalError("Instruction lacks its original prepared plan")
    plan_fact, raw = o._custody_read(root, reference["path"])
    approved = json.loads(raw)
    if (o._sha(raw) != reference["sha256"] or approved.get("plan_sha256") != o._sha(o._canonical(
            {key: value for key, value in approved.items() if key != "plan_sha256"}))):
        raise o.OracleApprovalError("Original prepared instruction plan changed")
    origin_raw = o._custody_read(root, o._technical_archive(root, approved["technical_receipt_sha256"]))[1]
    origin = json.loads(origin_raw)
    o._shape(origin); o._archived_origin(root, origin)
    if (o._sha(origin_raw) != approved["technical_receipt_sha256"]
            or origin["candidate_tree"] != approved["candidate_tree"]
            or origin["publication_scope"] != approved["publication_scope"]
            or origin["protected_effects"] != approved["protected_effects"]
            or o._git(root, "rev-parse", approved["candidate_commit"] + "^{tree}").strip() != approved["candidate_tree"]
            or approved.get("operation") != "main-promotion" or not approved.get("human_authority_required")
            or any(approved.get(key) != selected.get(key) for key in ("kind", "destination", "release_ref", "operation"))
            or approved["destination"] != {"remote_url": o.PUBLICATION_REMOTE, "ref": "refs/heads/main"}):
        raise o.OracleApprovalError("Instruction has a different original technical scope or publication destination")
    if subprocess.run(["git", "merge-base", "--is-ancestor", approved["candidate_commit"], selected["candidate_commit"]],
                      cwd=root, capture_output=True).returncode:
        raise o.OracleApprovalError("Instruction candidate is outside the reviewed publication history")
    def effects(plan):
        # Prose reporting permission status can change; the actual boundary and
        # every consumed contract/source identity remain exact.
        return {row["id"]: {**{key: value for key, value in row.items() if key not in {"description", "paths", "inputs"}},
                            "paths": sorted(row["paths"]), "inputs": sorted(row["inputs"], key=lambda item: item["path"])}
                for row in plan["protected_effects"]["active"]}
    original, current = effects(approved), effects(selected)
    if any(identity not in original or current.get(identity) != original[identity] for identity in instruction["effect_ids"]):
        raise o.OracleApprovalError("Instruction's protected effect or consumed source changed")
    assets = ("clients", "products", "source", "contracts", "scripts", "package.json", "package-lock.json",
              "package-manifest.json", "skill-release-manifest.json")
    if o._git(root, "diff", "--name-only", approved["candidate_commit"], selected["candidate_commit"], "--", *assets).strip():
        raise o.OracleApprovalError("Prepared product assets changed after the instruction question")
    review_reference = instruction["prepared_review"]
    if not isinstance(review_reference, dict) or set(review_reference) != {"path", "sha256"}:
        raise o.OracleApprovalError("Instruction lacks the pre-question native PR preparation")
    review_path = Path(review_reference["path"])
    captured, _, _ = _prepared_record(root, review_path)
    review_fact, review_raw = o._custody_read(root, review_path)
    admission = captured.get("remote_admission") or {}
    if (o._sha(review_raw) != review_reference["sha256"] or captured["source_commit"] != approved["candidate_commit"]
            or captured["source_tree"] != approved["candidate_tree"]
            or captured["plan"]["technical_receipt_sha256"] != approved["technical_receipt_sha256"]
            or captured["plan"]["operation"] != "review-push" or captured["plan"]["release_ref"] != approved["release_ref"]
            or admission.get("source_commit") != approved["candidate_commit"] or admission.get("source_tree") != approved["candidate_tree"]
            or type(admission.get("pr")) is not int or admission["pr"] <= 0
            or instruction["host_message"]["question_text"] != _instruction_question(root, approved, instruction["effect_ids"], admission["pr"])):
        raise o.OracleApprovalError("Native question has a different prepared PR, release or effect scope")
    decision, custody = _instruction_host_records(root, instruction["host_message"])
    question_time = datetime.fromisoformat(decision["question_timestamp"].replace("Z", "+00:00")).timestamp()
    if max(Path(reference["path"]).stat().st_mtime, review_path.stat().st_mtime) > question_time:
        raise o.OracleApprovalError("Instruction plan was not prepared before its native question")
    return {"decision": decision["decision"], "approved_plan_sha256": approved["plan_sha256"],
            "prepared_plan_custody": plan_fact, "prepared_review_custody": review_fact, "host_custody": custody,
            "effect_ids": instruction["effect_ids"]}


def _instruction_binding(root: Path, selected: dict, owner_path: str, requested: list[str]) -> dict:
    try:
        return _instruction_binding_contents(root, selected, owner_path, requested)
    except (KeyError, TypeError, IndexError, AttributeError, ValueError, OverflowError) as exc:
        raise o.OracleApprovalError("Native direct-human instruction fields are malformed") from exc


def _direct_authorization_effects(root: Path, selected: dict, record: dict, raw: bytes) -> set[str]:
    required = {"kind", "plan", "requested_effect_ids", "verdict", "review_status", "owner_evidence",
                "native_result", "native_evidence", "authorization_request_sha256", "instruction_binding", "authorization_sha256"}
    requested, owner = record.get("requested_effect_ids"), record.get("owner_evidence")
    if (set(record) != required or raw != o._pretty(record)
            or record["authorization_sha256"] != o._sha(o._canonical({k:v for k,v in record.items() if k != "authorization_sha256"}))
            or record["plan"] != selected or record["verdict"] != "APPROVED" or record["review_status"] != "COMPLETE"
            or not isinstance(requested, list) or not requested or len(set(requested)) != len(requested)
            or not set(requested).issubset({row["id"] for row in selected["protected_effects"]["active"]})
            or not isinstance(owner, dict) or len(owner) != 1 or owner != o._files(root, list(owner))):
        raise o.OracleApprovalError("Direct publication authority is stale, mismatched or lacks original evidence")
    binding = _instruction_binding(root, selected, next(iter(owner)), requested)
    evidence, path = record["native_evidence"], Path(record["native_result"])
    names = ("result.json", "authorization-inputs.json", "authorization-request.json", "instruction-binding.json")
    if (binding != record["instruction_binding"] or binding["decision"] != "Approved"
            or path.name != "result.json" or path.parent.parent != o.receipt_path(root).parent / "runs"
            or not re.fullmatch(r"authorize-[0-9a-f]{32}", path.parent.name)
            or not isinstance(evidence, dict) or evidence != o._files(root, list(evidence))
            or any(o._custody_name(root, path.parent / name) not in evidence for name in names)):
        raise o.OracleApprovalError("Direct publication instruction custody changed")
    result = json.loads(o._custody_read(root, path)[1])
    request = json.loads(o._custody_read(root, path.parent / "authorization-request.json")[1])
    outcome = json.loads(o._custody_read(root, path.parent / "outcome.json")[1])
    if (result != {"authority_source": "native-direct-user-instruction", "decision": "Approved",
                   "plan_sha256": selected["plan_sha256"], "authorized_effect_ids": requested}
            or record["authorization_request_sha256"] != o._sha(o._canonical(request))
            or request["plan"] != selected or request["owner_evidence"] != owner or request["requested_effect_ids"] != requested
            or outcome.get("outcome") != "APPROVED" or outcome.get("reviewer_invoked")):
        raise o.OracleApprovalError("Publication lacks its genuine native user-instruction binding")
    return set(requested)


@o._serialized_review(request_binding=_authorization_request, result_validator=_authorization_result)
def authorize(root: Path, candidate: str, release_ref: str, owner_path: str, *, authorization=None, effect_ids=None) -> dict:
    request_binding = _authorization_request(root, candidate, release_ref, owner_path,
                                             authorization=authorization, effect_ids=effect_ids)
    request_digest = o._sha(o._canonical(request_binding))
    selected = request_binding["plan"]
    if selected.get("state") == "NO_CHANGES":
        return dict(selected, authorization_request_sha256=request_digest)
    covered, observations = _covered_authorizations(root, selected, authorization)
    active = {row["id"] for row in selected["protected_effects"]["active"]}
    chosen = active if effect_ids is None else set(effect_ids)
    if not chosen.issubset(active):
        raise o.OracleApprovalError("Publication authorization selects an unknown current effect")
    requested = sorted(chosen - covered)
    if not requested:
        return {"verdict": "APPROVED", "review_status": "COMPLETE", "requested_effect_ids": [],
                "plan": selected, "owner_evidence": request_binding["owner_evidence"],
                "authorization_request_sha256": request_digest,
                "summary": "All selected current effects already have exact authority", "prior_attempts": observations}
    owner = o._files(root, [owner_path])
    original = o._custody_read(root, o._technical_archive(root, selected["technical_receipt_sha256"]))[1]
    request = {"plan": selected, "requested_effect_ids": requested, "owner_evidence": owner}
    o._atomic_write(o._RUN.get() / "authorization-inputs.json", o._pretty(request))
    o._atomic_write(o._RUN.get() / "authorization-request.json", o._pretty(request_binding))
    binding = _instruction_binding(root, selected, owner_path, requested)
    result = {"authority_source": "native-direct-user-instruction", "decision": binding["decision"],
              "plan_sha256": selected["plan_sha256"],
              "authorized_effect_ids": requested if binding["decision"] == "Approved" else []}
    o._atomic_write(o._RUN.get() / "instruction-binding.json", o._pretty(binding))
    o._atomic_write(o._RUN.get() / "result.json", o._pretty(result))
    if (_authorization_request(root, candidate, release_ref, owner_path, authorization=authorization, effect_ids=effect_ids) != request_binding
            or plan(root, candidate, release_ref, "main-promotion") != selected or owner != o._files(root, [owner_path])):
        raise o.OracleApprovalError("Publication authorization inputs changed")
    if o._custody_read(root, o._technical_archive(root, selected["technical_receipt_sha256"]))[1] != original:
        raise o.OracleApprovalError("Original technical receipt changed during authority assessment")
    run = o._RUN.get()
    if _instruction_binding(root, selected, owner_path, requested) != binding:
        raise o.OracleApprovalError("Native user instruction changed during binding")
    payload = {"kind": "boc-direct-publication-authorization-v1", "plan": selected,
               "authorization_request_sha256": request_digest,
               "requested_effect_ids": requested, "verdict": "APPROVED" if binding["decision"] == "Approved" else "REJECTED",
               "review_status": "COMPLETE", "owner_evidence": owner, "instruction_binding": binding,
               "native_result": str(run / "result.json"),
               "native_evidence": o._files(root, [str(run / name) for name in ("result.json", "instruction-binding.json", "authorization-inputs.json", "authorization-request.json")])}
    record = dict(payload, authorization_sha256=o._sha(o._canonical(payload)))
    path = o.receipt_path(root).parent / "publication" / (record["authorization_sha256"] + ".json")
    # Every completed attempt has a separate immutable content-addressed record;
    # execution failures also retain their native run and actual outcome.
    o._atomic_write(path, o._pretty(record))
    if binding["decision"] != "Approved":
        raise o.OracleCandidateRejected("Publication instruction is Hold publication")
    return dict(record, path=str(path), prior_attempts=observations)


def publish(root: Path, candidate: str, release_ref: str, operation: str, *, pr: str | None = None,
            authorization=None, execute=subprocess.run, refresh: bool = True) -> dict:
    selected = plan(root, candidate, release_ref, operation, refresh=refresh)
    if selected.get("state") == "NO_CHANGES":
        return selected
    _check_authorization(root, selected, authorization)
    if operation == "review-push":
        command = ["git", "push", "--set-upstream", "origin",
                   selected["candidate_commit"] + ":refs/heads/" + release_ref]
    else:
        if not pr or not re.fullmatch(r"[1-9][0-9]*", pr):
            raise o.OracleApprovalError("Publication requires the exact reviewed PR number")
        observed = execute(["gh", "pr", "view", pr, "--repo", "cody-marcel-dfsm/bos_operations_ceneter",
                            "--json", "headRefOid,baseRefOid,headRefName,baseRefName,mergeStateStatus,statusCheckRollup"],
                           cwd=root, capture_output=True, text=True, check=True)
        row = json.loads(observed.stdout)
        checks = row.get("statusCheckRollup")
        if (row.get("headRefOid") != selected["candidate_commit"] or row.get("headRefName") != release_ref
                or row.get("baseRefName") != "main" or row.get("baseRefOid") != selected["publication_scope"]["baseline_commit"]
                or row.get("mergeStateStatus") != "CLEAN" or not checks
                or any(item.get("conclusion", item.get("state")) not in {"SUCCESS", "NEUTRAL", "SKIPPED"} for item in checks)):
            raise o.OracleApprovalError("Publication PR source, base, mergeability or required checks changed")
        # Recheck after the remote read and immediately before the product effect.
        if plan(root, candidate, release_ref, operation, refresh=refresh) != selected:
            raise o.OracleApprovalError("Publication plan changed before promotion")
        _check_authorization(root, selected, authorization)
        command = ["gh", "pr", "merge", pr, "--repo", "cody-marcel-dfsm/bos_operations_ceneter",
                   "--merge", "--match-head-commit", selected["candidate_commit"]]
    execute(command, cwd=root, check=True)
    if operation == "review-push":
        public_status.publish_status(root, selected, execute=execute)
    else:
        confirmed = execute(["gh", "pr", "view", pr, "--repo", public_status.REPOSITORY,
                             "--json", "state,headRefOid,mergeCommit"],
                            cwd=root, capture_output=True, text=True, check=True)
        merged = json.loads(confirmed.stdout)
        merge_commit = (merged.get("mergeCommit") or {}).get("oid")
        if (merged.get("state") != "MERGED" or merged.get("headRefOid") != selected["candidate_commit"]
                or not isinstance(merge_commit, str) or not re.fullmatch(r"[0-9a-f]{40}", merge_commit)):
            raise o.OracleApprovalError("Publication merge completion is unconfirmed; retain pending delivery")
        if shipment.checkpoint_path(root).exists():
            shipment.record_released(root, selected["candidate_commit"], merge_commit)
    return selected


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["plan", "prepare", "publish", "push", "authorize", "merge"])
    parser.add_argument("--candidate", default="HEAD")
    parser.add_argument("--release-ref")
    parser.add_argument("--prepared", type=Path)
    parser.add_argument("--operation", choices=["review-push", "main-promotion"], default="main-promotion")
    parser.add_argument("--pr")
    parser.add_argument("--authorization", type=Path, action="append", default=[])
    parser.add_argument("--owner-evidence")
    parser.add_argument("--effect-id", action="append", default=None)
    args = parser.parse_args(argv)
    root = o.repository_root()
    try:
        if args.command in {"publish", "push", "merge"}:
            if args.prepared is None:
                raise o.OracleApprovalError("Complete validation with prepare, then publish --prepared <record>")
            result = publish_prepared(root, args.prepared)
        elif not args.release_ref:
            raise o.OracleApprovalError("Validation preparation requires the resolved release ref")
        elif args.command == "plan":
            result = plan(root, args.candidate, args.release_ref, args.operation)
        elif args.command == "prepare":
            result = prepare(root, args.candidate, args.release_ref, args.operation,
                             authorization=args.authorization, pr=args.pr)
        elif args.command == "authorize":
            if not args.owner_evidence:
                raise o.OracleApprovalError("Scoped direct-human evidence is required for publication authorization")
            result = authorize(root, args.candidate, args.release_ref, args.owner_evidence,
                               authorization=args.authorization, effect_ids=args.effect_id)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except (o.OracleApprovalError, OSError, ValueError, subprocess.CalledProcessError) as exc:
        if hasattr(exc, "publication_result"):
            print(json.dumps(exc.publication_result, indent=2, sort_keys=True))
        print(str(exc), file=o.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
