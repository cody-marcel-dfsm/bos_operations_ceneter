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
COMPLETE requires limitations=[]; put nonblocking area boundaries in summary.
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


def packet(context, plan, cohort, parent_context, digest, prepared_source=None):
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
             "proposal_scope": context.get("proposal_scope"),
             "previous_proposal_scope": context.get("previous_proposal_scope"), "scope_changed": context.get("scope_changed"),
             "unadopted_assessments": [item for item in context.get("unadopted_assessments", [])
                 if cohort["id"] == AREAS[0] or assigned &
                 ({entry.get("path") for entry in item.get("observations", [])} |
                  {entry.get("file") for entry in item.get("finding_references", [])})],
             "retained_proof_references": {key: context.get(key) for key in
                 ("prior_native_assessment", "prior_rounds", "retained_observation_evidence")},
             "validation_references": [{key: item.get(key) for key in
                 ("evidence_path", "evidence_sha256", "inputs", "environment_digest")}
                 for item in [*context["reusable_validations"], *context["current_validations"]]
                 if assigned & {entry["path"] for entry in item.get("inputs", [])}],
             "publication_scope": context["publication_scope"] if cohort["id"] == AREAS[0] else {
                 "range_sha256": context["publication_scope"]["range_sha256"]},
             "finding_disposition_owner": AREAS[0]}
    if prepared_source is not None:
        value['prepared_source'] = prepared_source
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


def _assigned_result(o, envelope, plan, cohort):
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
    return assessment


def _checked(o, envelope, plan, cohort, context):
    assessment = _assigned_result(o, envelope, plan, cohort)
    status = assessment["review_status"]
    if status == "COMPLETE" and assessment["limitations"]:
        raise o.OracleReviewIncomplete("Cohort reports unfinished limitations despite COMPLETE")
    if status != "COMPLETE" and (not assessment["limitations"] or assessment.get("verdict") != status):
        raise o.OracleApprovalError("Unfinished cohort requires limitations and matching verdict")
    if status == "COMPLETE" and assessment.get("verdict") not in {"APPROVED", "REJECTED"}:
        raise o.OracleApprovalError("Complete cohort lacks an independent verdict")
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


def _unadopted_result(o, root, child, plan_path, plan, cohort, context, original_packet, reason):
    """Retain a safely assigned native response without adopting any of its claims."""
    raw = o._custody_read(root, child / 'result.json')[1]
    envelope = json.loads(raw)
    _assigned_result(o, envelope, plan, cohort)
    admission_error = None
    try:
        _checked(o, envelope, plan, cohort, context)
    except (o.OracleReviewIncomplete, o.OracleApprovalError) as error:
        admission_error = type(error).__name__ + ': ' + str(error)
    # Preparation may itself have changed. Preserve the controller's original
    # assignment bytes, rather than relabeling altered preparation as original.
    provenance_paths = []
    for path, expected, archive in (
            (child / 'cohort-context.json', original_packet, child / 'unadopted-context.json'),
            (plan_path, o._pretty(plan), child / 'unadopted-plan.json')):
        try:
            unchanged = o._custody_read(root, path)[1] == expected
        except (OSError, ValueError, o.OracleApprovalError):
            unchanged = False
        if not unchanged:
            o._atomic_write(archive, expected)
            path = archive
        provenance_paths.append(path)
    context_file, original_plan = provenance_paths
    return {'cohort_id': cohort['id'], 'actual_outcome': 'ERROR', 'eligibility': 'NONE',
            'reason': reason, 'admission_error': admission_error,
            'reported_review_status': envelope['assessment']['review_status'],
            'reported_verdict': envelope['assessment'].get('verdict'),
            'assessment': envelope['assessment'], 'result_file': str(child / 'result.json'),
            'result_sha256': o._sha(raw), 'cohort_context_file': str(context_file),
            'cohort_context_sha256': o._custody_read(root, context_file)[0]['sha256'],
            'plan_file': str(original_plan), 'plan_file_sha256': o._custody_read(root, original_plan)[0]['sha256'],
            'provenance_custody': o._custody_files(root, [child / 'result.json', context_file, original_plan])}


def _invalidated_projection(o, root, context, item):
    """Canonicalize source-list omissions only for the exact registered invalid execution."""
    name = item.get('evidence_path')
    if (root is None or item.get('status') != 'INVALIDATED' or not item.get('reason')
            or name not in {row['evidence_path'] for row in context.get('invalid_current_validations', [])}):
        return item
    expected = context['input_hashes'].get(name)
    try:
        fact, raw = o._custody_read(root, name)
        record = json.loads(raw)
        if (expected != 'sha256:' + fact['sha256'] or record.get('kind') != 'oracle-validation-record-v1'
                or item.get('environment_digest') != record['environment_digest']):
            return item
        original = {entry['path']: entry['digest'] for entry in record['inputs']}
        original[name] = expected
        declared = item.get('inputs')
        if (not isinstance(declared, list) or any(not isinstance(entry, dict)
                or set(entry) != {'path', 'digest'} or original.get(entry['path']) != entry['digest']
                for entry in declared) or len({entry['path'] for entry in declared}) != len(declared)):
            return item
        # Keep original raw claims in the child artifacts. This projection only
        # describes an already INVALIDATED record and supplies no eligibility.
        return dict(item, inputs=record['inputs'])
    except (OSError, ValueError, KeyError, TypeError, o.OracleApprovalError):
        return item


def aggregate(o, plan, context, envelopes, failures, *, root=None):
    assessments, by_cohort, errors = [], {}, list(failures)
    for cohort in plan["cohorts"]:
        try:
            assessment = _checked(o, envelopes[cohort["id"]], plan, cohort, context)
            assessments.append(assessment)
            by_cohort[cohort["id"]] = assessment
        except o.OracleReviewIncomplete as exc:
            partial = copy.deepcopy(envelopes[cohort["id"]]["assessment"])
            partial.update(review_status="INCOMPLETE", verdict="INCOMPLETE",
                           limitations=[cohort["id"] + ": " + str(reason)
                                        for reason in [*partial.get("limitations", []), str(exc)]])
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
        for cohort_id, assessment in by_cohort.items():
            for item in assessment[field]:
                if field == 'validations':
                    projected = _invalidated_projection(o, root, context, item)
                    if projected != item:
                        result.setdefault('validation_projection_origins', []).append({
                            'cohort_id': cohort_id, 'original_claim': copy.deepcopy(item),
                            'canonical_claim': copy.deepcopy(projected), 'eligibility': 'NONE',
                            'record_sha256': context['input_hashes'][item['evidence_path']]})
                    item = projected
                key = item.get(identity)
                if key in unique and unique[key] != item:
                    prior = unique[key]
                    if field == 'validations' and ({k: v for k, v in prior.items() if k != 'reason'}
                            == {k: v for k, v in item.items() if k != 'reason'}):
                        # Explanations supplement one identical bound execution.
                        # A different status, source, environment or proof stays
                        # a contradiction and cannot become passing evidence.
                        prior = copy.deepcopy(prior)
                        prior['reason'] = '\n'.join(sorted(set(prior.get('reason', '').split('\n')
                                                            + item.get('reason', '').split('\n'))))
                        unique[key] = prior
                    else:
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
    if __package__:
        from . import oracle_source_frontier as frontier
    else:
        import oracle_source_frontier as frontier
    with o._phase("source_frontier_seconds"):
        source_snapshot = frontier.snapshot(o, root, context, plan["required_paths"])
    jobs, prepared_seals, source_prompts, original_packets = [], {}, {}, {}
    for cohort in plan["cohorts"]:
        child = o._metadata_run(root, run / "cohorts", cohort["id"] + "-")
        prepared, source_seal, source_prompt = frontier.prepare(o, root, context, plan, cohort, child, source_snapshot)
        child_context = packet(context, plan, cohort, context_path, digest, prepared)
        original_packets[cohort['id']] = o._pretty(child_context)
        o._atomic_write(child / "cohort-context.json", original_packets[cohort['id']])
        o._atomic_write(child / "output.schema.json", o._pretty(output_schema(schema, plan, cohort)))
        source_seal.update(o._files(root, [str(child / "cohort-context.json"), str(child / "output.schema.json")]))
        prepared_seals[cohort['id']] = source_seal
        source_prompts[cohort['id']] = source_prompt
        jobs.append((cohort, child))
    seals_path = run / "prepared-source-seals.json"
    seals_raw = o._pretty(prepared_seals)
    o._atomic_write(seals_path, seals_raw)
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
            prompt += ("\nMechanically prepared immutable source pages follow. They provide navigation, grant no coverage or approval, "
                       "and preserve mandatory governing-original reads. Complete unit/page and original-source locators, budget gaps "
                       "and unresolved construction dependencies remain in source-frontier.json. Read remaining pages only as needed.\n"
                       + source_prompts[cohort['id']])
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

    envelopes, failures, unadopted = {}, [], []
    with ThreadPoolExecutor(max_workers=min(plan["max_workers"], len(jobs))) as executor:
        futures = {executor.submit(copy_context().run, worker, cohort, child): cohort for cohort, child in jobs}
        for future in as_completed(futures):
            cohort = futures[future]
            try:
                envelopes[cohort["id"]] = future.result()
            except Exception as exc:
                failure = cohort["id"] + ": " + type(exc).__name__ + ": " + str(exc)
                failures.append(failure)
                child = next(path for item, path in jobs if item["id"] == cohort["id"])
                try:
                    unadopted.append(_unadopted_result(o, root, child, plan_path, plan, cohort, context,
                                                      original_packets[cohort['id']], failure))
                except (OSError, ValueError, KeyError, TypeError, o.OracleApprovalError) as recovery:
                    failures.append(cohort["id"] + ": final output remains unavailable/unbound: " + str(recovery))
    seal_manifest_current = o._custody_read(root, seals_path)[1] == seals_raw
    for cohort, child in jobs:
        expected = prepared_seals[cohort['id']]
        try:
            unchanged = seal_manifest_current and o._files(root, list(expected)) == expected
        except (OSError, ValueError, o.OracleApprovalError):
            unchanged = False
        if not unchanged:
            reason = cohort['id'] + ': prepared source/context/schema integrity failed; raw output remains unadopted'
            failures.append(reason)
            retained = next((item for item in unadopted if item['cohort_id'] == cohort['id']), None)
            if retained is None:
                try:
                    retained = _unadopted_result(o, root, child, plan_path, plan, cohort, context,
                                                original_packets[cohort['id']], reason)
                    unadopted.append(retained)
                except (OSError, ValueError, KeyError, TypeError, o.OracleApprovalError) as recovery:
                    failures.append(cohort['id'] + ': final output remains unavailable/unbound: ' + str(recovery))
            if retained is not None:
                retained['prepared_integrity_error'] = reason
            envelopes.pop(cohort['id'], None)
            o._atomic_write(child / 'prepared-source-error.json', o._pretty({
                'cohort_id': cohort['id'], 'original_seal': expected,
                'eligibility': 'NONE', 'reason': 'Prepared material changed; no coverage from this cohort is admitted'}))
    if json.loads(o._custody_read(root, plan_path)[1]) != plan or digest(json.loads(o._custody_read(root, context_path)[1])) != plan["context_sha256"]:
        failures.append("Prepared partition plan or source context changed during assessment")
    result = aggregate(o, plan, context, envelopes, failures, root=root)
    if unadopted:
        result["unadopted_cohort_assessments"] = unadopted
    artifacts = o._files(root, [str(path) for _, child in jobs for path in child.iterdir() if path.is_file()])
    artifacts.update(o._files(root, [str(plan_path), str(seals_path)]))
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
