"""Bounded independent cohorts; the existing native gate owns the receipt."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from contextvars import copy_context
from datetime import datetime, timezone
import copy
import json
from pathlib import Path
import time


AREAS = ("crosscutting-integration", "implementation-consumers", "verification-recovery")
INTEGRATION_CHECKS = ("governing-criteria", "entrypoints", "dependencies", "consumers", "publication", "failure-recovery")
COHORT_POLICY = """You are a trusted independent, read-only Oracle cohort.
Read governing instructions and current criteria first. Reuse unchanged bodies
once per content identity, then inspect bounded assigned changes and evidence.
Your COMPLETE/APPROVED decision applies only to this immutable cohort assignment;
it is not a whole-candidate receipt. The native aggregate and existing gates alone
decide the complete candidate. Cover every assigned path, inspect its actual
dependencies/consumers and failure paths, and return all findings together.
Report coverage only for assigned primary paths; dependency inputs may name any
exact current identity from the sealed parent context when actually consumed.
Use compact area context and original proof pointers; open larger sealed records
only for an unresolved fact. Do not repeat unchanged checks or reread whole history.
Retain existing finding IDs. Only the crosscutting cohort dispositions prior
findings and global integration criteria. Specialists classify their assigned
area only: empty/NONE/NOT_REQUIRED fields describe local absence, while positive
effects must be reported precisely for native reconciliation against the complete
crosscutting assessment. Never write source, stage, commit,
publish a receipt, launch another review, or change proposal/review pointers.
"""


def _area(path):
    if path.startswith(("@", ".agents/", ".claude/")):
        return AREAS[0]
    if path.startswith(("tests/", ".github/", ".githooks/", "scripts/")):
        return AREAS[2]
    return AREAS[1]


def partition(context, binding, digest):
    """Assign only missing/affected coverage; native eligible coverage stays carried."""
    reusable = {item["path"] for item in context["reusable_coverage"]}
    pending = sorted(set(context["required_coverage_paths"]) - reusable)
    groups = {area: [] for area in AREAS}
    for path in pending:
        groups[_area(path)].append(path)
    cohorts = [{"id": area, "required_paths": groups[area],
                "integration_checks": list(INTEGRATION_CHECKS) if area == AREAS[0] else [],
                "new_finding_prefix": f"F{index + 1}000"}
               for index, area in enumerate(AREAS) if groups[area] or area == AREAS[0]]
    plan = {"kind": "boc-parallel-review-plan-v1", "candidate_commit": context["base_commit"],
            "candidate_tree": context["candidate_tree"], "input_binding_sha256": digest(binding),
            "context_sha256": digest(context), "required_paths": pending, "cohorts": cohorts,
            "max_workers": 3, "reviewer_settings": binding["reviewer_settings"]}
    return dict(plan, plan_sha256=digest(plan))


def packet(context, plan, cohort, parent_context, digest):
    assigned = set(cohort["required_paths"])
    selected = set(assigned)
    shared = set(context.get("guards", {}).get("authority_digests", {}))
    for proof in context["reusable_coverage"]:
        if proof["path"] in assigned:
            selected.update(item["path"] for item in proof["inputs"])
    relevant_findings = {key: item for key, item in context["prior_findings"].items()
                         if cohort["id"] == AREAS[0] or
                         assigned & {item.get("file"), *item.get("affected_paths", [])}}
    for finding in relevant_findings.values():
        selected.update([finding["file"], *finding.get("affected_paths", [])])
    selected.update(shared)
    value = {"kind": "boc-parallel-cohort-context-v1", "cohort": cohort,
             "plan_sha256": plan["plan_sha256"], "candidate_commit": plan["candidate_commit"],
             "candidate_tree": plan["candidate_tree"], "input_binding_sha256": plan["input_binding_sha256"],
             "parent_context": str(parent_context), "parent_context_sha256": plan["context_sha256"],
             "input_hashes": {p: value for p, value in context["input_hashes"].items() if p in selected},
             "prior_findings": relevant_findings,
             "path_dispositions": [item for item in context.get("path_dispositions", []) if item.get("path") in assigned],
             "retained_proof_references": {key: context.get(key) for key in
                 ("prior_native_assessment", "prior_rounds", "retained_observation_evidence")},
             "validation_references": [{key: item.get(key) for key in
                 ("evidence_path", "evidence_sha256", "inputs", "environment_digest")}
                 for item in [*context["reusable_validations"], *context["current_validations"]]
                 if assigned & {entry["path"] for entry in item.get("inputs", [])}],
             "publication_scope": context["publication_scope"] if cohort["id"] == AREAS[0] else {
                 "range_sha256": context["publication_scope"]["range_sha256"]},
             "finding_disposition_owner": AREAS[0]}
    return dict(value, packet_sha256=digest(value))


def output_schema(base, plan, cohort):
    string = {"type": "string", "minLength": 1}
    fields = {"plan_sha256": {"enum": [plan["plan_sha256"]]}, "cohort_id": {"enum": [cohort["id"]]},
              "candidate_commit": {"enum": [plan["candidate_commit"]]},
              "candidate_tree": {"enum": [plan["candidate_tree"]]},
              "input_binding_sha256": {"enum": [plan["input_binding_sha256"]]}, "assessment": base,
              "integration": {"type": "array", "items": {"type": "object", "additionalProperties": False,
                  "required": ["concern", "status", "inputs", "reason"], "properties": {
                      "concern": {"enum": list(INTEGRATION_CHECKS)},
                      "status": {"enum": ["REVIEWED", "NOT_APPLICABLE", "UNREVIEWED"]},
                      "inputs": copy.deepcopy(base["properties"]["coverage"]["items"]["properties"]["inputs"]),
                      "reason": string}}}}
    return {"type": "object", "additionalProperties": False, "required": list(fields), "properties": fields}


def _checked(o, envelope, plan, cohort, context):
    expected = {"plan_sha256": plan["plan_sha256"], "cohort_id": cohort["id"],
                "candidate_commit": plan["candidate_commit"], "candidate_tree": plan["candidate_tree"],
                "input_binding_sha256": plan["input_binding_sha256"]}
    if (not isinstance(envelope, dict) or set(envelope) != {*expected, "assessment", "integration"}
            or any(envelope[key] != value for key, value in expected.items())):
        raise o.OracleApprovalError("Cohort returned a foreign plan, assignment or candidate identity")
    assessment = envelope["assessment"]
    if not isinstance(assessment, dict) or assessment.get("review_status") not in {"COMPLETE", "INCOMPLETE", "ERROR"}:
        raise o.OracleApprovalError("Cohort lacks a terminal independent assessment")
    for key in ("coverage", "validations", "findings", "resolutions", "limitations"):
        if not isinstance(assessment.get(key), list):
            raise o.OracleApprovalError("Cohort lacks structured " + key)
    covered, seen = set(), set()
    for item in assessment["coverage"]:
        name = item.get("path")
        if name in seen or name not in cohort["required_paths"]:
            raise o.OracleApprovalError("Cohort coverage is duplicate or outside its assignment")
        seen.add(name)
        if item.get("status") != "UNREVIEWED":
            o._checked_inputs(item.get("inputs"), context, required_path=name)
            covered.add(name)
    integration = envelope["integration"]
    if not isinstance(integration, list):
        raise o.OracleApprovalError("Cohort integration assessment is malformed")
    concerns = [item.get("concern") for item in integration if isinstance(item, dict)]
    if len(concerns) != len(integration) or len(set(concerns)) != len(concerns) or not set(concerns) <= set(cohort["integration_checks"]):
        raise o.OracleApprovalError("Cohort integration scope is duplicate or foreign")
    for item in integration:
        o._checked_inputs(item.get("inputs"), context)
        if not item.get("reason") or item.get("status") not in {"REVIEWED", "NOT_APPLICABLE", "UNREVIEWED"}:
            raise o.OracleApprovalError("Integration criterion lacks an explicit current assessment")
    if assessment["review_status"] == "COMPLETE" and (
            covered != set(cohort["required_paths"]) or set(concerns) != set(cohort["integration_checks"])
            or any(item["status"] == "UNREVIEWED" for item in integration)):
        raise o.OracleReviewIncomplete("Cohort omitted assigned coverage or crosscutting integration")
    if cohort["id"] != AREAS[0] and assessment["resolutions"]:
        raise o.OracleApprovalError("Prior finding dispositions belong to the crosscutting cohort")
    return assessment


def aggregate(o, plan, context, envelopes, failures):
    assessments, by_cohort, errors = [], {}, list(failures)
    for cohort in plan["cohorts"]:
        try:
            assessment = _checked(o, envelopes[cohort["id"]], plan, cohort, context)
            assessments.append(assessment)
            by_cohort[cohort["id"]] = assessment
        except o.OracleReviewIncomplete as exc:
            partial = copy.deepcopy(envelopes[cohort["id"]]["assessment"])
            partial.update(review_status="INCOMPLETE", verdict="INCOMPLETE",
                           limitations=[*partial.get("limitations", []), str(exc)])
            assessments.append(partial)
            by_cohort[cohort["id"]] = partial
        except (o.OracleApprovalError, KeyError, ValueError, TypeError) as exc:
            errors.append(cohort["id"] + ": " + str(exc))
    default_api = {"impact": "NONE", "request_kind": "NOT_REQUIRED", "requested_change": None,
                   "request_quote": None, "request_evidence": None}
    result = {"review_status": "COMPLETE", "verdict": "APPROVED", "summary": "Independent concurrent cohort assessment",
              "coverage": [], "validations": [], "findings": [], "resolutions": [], "limitations": [],
              "repair_plan": "\n".join(item.get("repair_plan", "") for item in assessments if item.get("repair_plan")),
              "authentication_impact": "NONE", "owner_approval_status": "NOT_REQUIRED",
              "api_version_assessment": default_api, "protected_effects": {"active": [], "dispositions": []}}
    # The integration assignment alone assesses the complete publication scope.
    # Local absence in a specialist area never erases a global effect or makes
    # specialists repeat the whole candidate. Positive discoveries must already
    # agree with the complete assessment, otherwise reconciliation is unfinished.
    global_assessment = by_cohort.get(AREAS[0])
    defaults = {"authentication_impact": "NONE", "owner_approval_status": "NOT_REQUIRED",
                "api_version_assessment": default_api, "protected_effects": {"active": [], "dispositions": []}}
    if global_assessment is None:
        errors.append("Missing complete crosscutting classification")
    else:
        for field, default in defaults.items():
            result[field] = copy.deepcopy(global_assessment.get(field))
            for identity, specialist in by_cohort.items():
                if identity == AREAS[0]:
                    continue
                value = specialist.get(field)
                if value == default:
                    continue
                if field == "protected_effects" and isinstance(value, dict) and isinstance(result[field], dict):
                    agrees = set(value) == {"active", "dispositions"} and all(
                        isinstance(value[key], list) and all(item in result[field].get(key, []) for item in value[key])
                        for key in ("active", "dispositions"))
                else:
                    agrees = value == result[field]
                if not agrees:
                    errors.append(identity + ": positive " + field +
                                  " requires crosscutting reconciliation with the complete assessment")
    for field, identity in (("coverage", "path"), ("validations", "evidence_path"), ("findings", "id"), ("resolutions", "id")):
        unique = {}
        for assessment in assessments:
            for item in assessment[field]:
                key = item.get(identity)
                if key in unique and unique[key] != item:
                    errors.append("Contradictory independent " + field + " for " + str(key))
                else:
                    unique[key] = item
        result[field] = list(unique.values())
    if {item.get("id") for item in result["findings"]} & {item.get("id") for item in result["resolutions"]}:
        errors.append("A finding is simultaneously unresolved and resolved")
    if errors:
        result.update(review_status="ERROR", verdict="ERROR", limitations=list(dict.fromkeys(errors)))
    elif any(item["review_status"] != "COMPLETE" for item in assessments):
        status = "ERROR" if any(item["review_status"] == "ERROR" for item in assessments) else "INCOMPLETE"
        result.update(review_status=status, verdict=status, limitations=[reason for item in assessments for reason in item["limitations"]]
                      or ["Required independent cohort assessment remains unfinished"])
    elif result["findings"] or any(item.get("verdict") != "APPROVED" for item in assessments):
        result["verdict"] = "REJECTED"
    return result


def review(o, root, tree, paths, evidence, owner):
    run = o._RUN.get()
    context_path = run / "review-context.json"
    context = json.loads(o._custody_read(root, context_path)[1])
    binding = o._input_binding(root, evidence, owner)
    prepared_settings = o._PREPARED_SETTINGS.get()
    if prepared_settings is not None and binding["reviewer_settings"] != prepared_settings:
        raise o.OracleApprovalError("Selected Oracle model/effort changed before launch")
    if context["candidate_tree"] != tree or context["base_commit"] != binding["base_commit"]:
        raise o.OracleApprovalError("Parallel candidate differs from prepared native context")
    digest = lambda value: o._sha(o._canonical(value))
    plan = partition(context, binding, digest)
    plan_path = run / "cohort-plan.json"
    o._atomic_write(plan_path, o._pretty(plan))
    schema = json.loads(o._custody_read(root, root / ".agents/skills/oracle/review-output.schema.json")[1])
    jobs = []
    for cohort in plan["cohorts"]:
        child = o._metadata_run(root, run / "cohorts", cohort["id"] + "-")
        child_context = packet(context, plan, cohort, context_path, digest)
        o._atomic_write(child / "cohort-context.json", o._pretty(child_context))
        o._atomic_write(child / "output.schema.json", o._pretty(output_schema(schema, plan, cohort)))
        jobs.append((cohort, child))
    started = time.monotonic()

    def worker(cohort, child):
        token = o._RUN.set(child)
        start = time.monotonic() - started
        failure = None
        try:
            prompt = ("Assess only your immutable independent cohort assignment. Governing instructions first. "
                      "Read .agents/skills/oracle/SKILL.md as the isolated trusted approver. Use bounded slices. "
                      "The cohort context supplies exact source identities, scope and sealed historical references: "
                      + str(child / "cohort-context.json") + ". Return the supplied envelope echoing every binding. "
                      "Use existing finding IDs; for new findings use prefix " + cohort["new_finding_prefix"] +
                      ". The crosscutting cohort must independently cover all six integration concerns over the complete "
                      "candidate/publication range and disposition every open prior finding. Other cohorts assess only "
                      "their assigned production/verification area; report local positive effects and use local absence defaults, following current "
                      "governing criteria. No serial final model or new reviewer is permitted.")
            envelope = o._review_process(root, prompt, "reviewer", schema_path=child / "output.schema.json",
                                         cohort_policy=COHORT_POLICY)
            return envelope
        except Exception as exc:
            failure = type(exc).__name__ + ": " + str(exc)
            raise
        finally:
            o._atomic_write(child / "cohort-timing.json", o._pretty({"cohort_id": cohort["id"],
                "started_offset_seconds": start, "finished_offset_seconds": time.monotonic() - started,
                "finished_at": datetime.now(timezone.utc).isoformat(), "error": failure}))
            o._RUN.reset(token)

    envelopes, failures = {}, []
    with ThreadPoolExecutor(max_workers=min(plan["max_workers"], len(jobs))) as executor:
        futures = {executor.submit(copy_context().run, worker, cohort, child): cohort for cohort, child in jobs}
        for future in as_completed(futures):
            cohort = futures[future]
            try:
                envelopes[cohort["id"]] = future.result()
            except Exception as exc:
                failures.append(cohort["id"] + ": " + type(exc).__name__ + ": " + str(exc))
    if json.loads(o._custody_read(root, plan_path)[1]) != plan or digest(json.loads(o._custody_read(root, context_path)[1])) != plan["context_sha256"]:
        failures.append("Prepared partition plan or source context changed during assessment")
    result = aggregate(o, plan, context, envelopes, failures)
    artifacts = o._files(root, [str(path) for _, child in jobs for path in child.iterdir() if path.is_file()])
    artifacts.update(o._files(root, [str(plan_path)]))
    spans = [json.loads(o._custody_read(root, child / "cohort-timing.json")[1]) for _, child in jobs]
    events = sorted([(span["started_offset_seconds"], 1) for span in spans] +
                    [(span["finished_offset_seconds"], -1) for span in spans])
    active, maximum = 0, 0
    for _, change in events:
        active += change; maximum = max(maximum, active)
    manifest = {"kind": "boc-parallel-review-evidence-v1", "plan_sha256": plan["plan_sha256"],
                "candidate_commit": plan["candidate_commit"], "candidate_tree": tree, "artifacts": artifacts,
                "measurement": {"wall_seconds": time.monotonic() - started,
                                "max_observed_concurrency": maximum, "cohorts": spans}}
    o._atomic_write(run / "cohort-evidence.json", o._pretty(dict(manifest, evidence_sha256=digest(manifest))))
    models = [json.loads(o._custody_read(root, child / "model.json")[1]) for _, child in jobs if (child / "model.json").exists()]
    settings = plan["reviewer_settings"]
    if any({"model": model["selected_model"], "reasoning_effort": model["reasoning_effort"]} != settings for model in models):
        result.update(review_status="ERROR", verdict="ERROR", limitations=[*result["limitations"], "Independent cohort settings differ"])
    metadata = dict(models[0]) if models else {"selected_model": settings["model"], "reasoning_effort": settings["reasoning_effort"]}
    metadata.update(aggregator="deterministic-owner-local", cohort_plan_sha256=plan["plan_sha256"])
    o._atomic_write(run / "model.json", o._pretty(metadata))
    o._atomic_write(run / "process.json", o._pretty({"exit_code": 1 if result["review_status"] == "ERROR" else 0,
                                                    "independent_cohorts": len(jobs)}))
    o._atomic_write(run / "result.json", o._pretty(result))
    return result
