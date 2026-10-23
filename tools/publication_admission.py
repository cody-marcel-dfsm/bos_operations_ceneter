#!/usr/bin/env python3
"""Owner-local distributed-plugin publication; review refs remain available."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import time
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


@o._metadata_owner
def prepare(root: Path, candidate: str, release_ref: str, operation: str, *,
            authorization=None, refresh: bool = True, execute=subprocess.run) -> dict:
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
    record = dict(payload, prepared_sha256=o._sha(o._canonical(payload)))
    path = o.receipt_path(root).parent / "publication-prepared" / (record["prepared_sha256"] + ".json")
    if path.exists() and o._custody_read(root, path)[1] != o._pretty(record):
        raise o.OracleApprovalError("Immutable prepared publication changed")
    if not path.exists():
        if command_coverage.requirements(root, selected["candidate_tree"]):
            # Review-source upload and its opaque native coverage transport are
            # validation preparation. Unchanged completed preparation is reused.
            execute(["git", "push", selected["destination"]["remote_url"],
                     selected["candidate_commit"] + ":refs/heads/" + release_ref], cwd=root, check=True)
            public_status.publish_status(root, selected, execute=execute)
            command_coverage.publish_statuses(root, selected, execute=execute)
        o._atomic_write(path, o._pretty(record))
    return dict(record, prepared_file=str(path))


def publish_prepared(root: Path, prepared: Path, *, execute=subprocess.run) -> dict:
    """Publish a captured validated SHA with Git only, independent of later authors."""
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
    # A normal push rejects non-fast-forward movement and preserves server-side
    # protection. It publishes this captured SHA even while new authors work.
    started = time.monotonic()
    execute(command, cwd=root, check=True)
    elapsed = time.monotonic() - started
    return {"kind": "boc-git-publication-result-v1", "state": "PUBLISHED",
            "candidate_commit": record["source_commit"], "destination": record["plan"]["destination"],
            "prepared_sha256": digest, "elapsed_seconds": elapsed,
            "publication_sla_seconds": 10, "publication_sla_breached": elapsed >= 10}


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
    current = o._publication_scope(root, receipt["candidate_tree"])
    if current["target_ref"] is None:
        raise o.OracleApprovalError("Publication baseline UNAVAILABLE: fetch origin/main and obtain a complete current range assessment")
    shipment.release_preparation(root, current["baseline_commit"], commit)
    # The just-committed receipt itself is outside the earlier HEAD range; it
    # adds no earlier effect. Preserve every earlier effective origin exactly.
    current["prior_effects"] = [row for row in current["prior_effects"] if row["origin"] != o._sha(raw)]
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
    prompt = """Independently assess genuine direct-human deployment authority for this exact protected product publication. The original technical review is complete and immutable. Do not repeat or alter it. Verify the supplied owner's human provenance, exact concrete effect/boundary, refusals, destination and scope. A filename, AUTHENTICATION label, generic release instruction or an agent assertion alone supplies no protected deployment permission. Existing exact scoped authority persists through in-scope corrections; versions/hashes alone create no new protected effect. Assess only requested_effect_ids. Existing exact authority retains its scope without repeated human permission; this request grants no authority for unrequested effects, which may remain missing. Approve only all requested current effect IDs under the exact plan hash. Missing or mismatched authority rejects this publication authorization, never the technical review. Keep normal spending and public API version request gates unchanged. Return the supplied closed authorization JSON schema.\n""" + json.dumps(request, sort_keys=True)
    result = o._review_process(root, prompt, "authorization_reviewer",
                              schema_path=root / "tools/publication-authorization.schema.json")
    if (_authorization_request(root, candidate, release_ref, owner_path, authorization=authorization, effect_ids=effect_ids) != request_binding
            or plan(root, candidate, release_ref, "main-promotion") != selected or owner != o._files(root, [owner_path])):
        raise o.OracleApprovalError("Publication authorization inputs changed")
    if o._custody_read(root, o._technical_archive(root, selected["technical_receipt_sha256"]))[1] != original:
        raise o.OracleApprovalError("Original technical receipt changed during authority assessment")
    run = o._RUN.get()
    payload = {"kind": "boc-publication-authorization-v1", "plan": selected,
               "authorization_request_sha256": request_digest,
               "requested_effect_ids": requested, "verdict": result["verdict"],
               "review_status": result["review_status"], "owner_evidence": owner,
               "native_result": str(run / "result.json"),
               "native_evidence": o._files(root, [str(run / name) for name in ("result.json", "process.json", "model.json", "request.txt", "authorization-inputs.json", "authorization-request.json")])}
    record = dict(payload, authorization_sha256=o._sha(o._canonical(payload)))
    path = o.receipt_path(root).parent / "publication" / (record["authorization_sha256"] + ".json")
    # Every completed attempt has a separate immutable content-addressed record;
    # execution failures also retain their native run and actual outcome.
    o._atomic_write(path, o._pretty(record))
    if result["review_status"] == "INCOMPLETE":
        raise o.OracleReviewIncomplete(result["summary"])
    if result["review_status"] != "COMPLETE":
        raise o.OracleApprovalError(result["summary"])
    if (result["verdict"] != "APPROVED" or result["plan_sha256"] != selected["plan_sha256"]
            or set(result["authorized_effect_ids"]) != set(requested)):
        raise o.OracleCandidateRejected("Publication authorization rejected: " + result["summary"])
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
                             authorization=args.authorization)
        elif args.command == "authorize":
            if not args.owner_evidence:
                raise o.OracleApprovalError("Scoped direct-human evidence is required for publication authorization")
            result = authorize(root, args.candidate, args.release_ref, args.owner_evidence,
                               authorization=args.authorization, effect_ids=args.effect_id)
        print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    except (o.OracleApprovalError, OSError, ValueError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=o.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
