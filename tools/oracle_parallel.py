"""Bounded independent cohorts; the existing native gate owns the receipt."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from contextvars import copy_context
from datetime import datetime, timezone
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import time


AREAS = ("crosscutting-integration", "implementation-consumers", "verification-recovery")
INTEGRATION_CHECKS = ("governing-criteria", "entrypoints", "dependencies", "consumers", "publication", "failure-recovery")
RETAINED_NAVIGATION_MAX_BYTES = 32 * 1024
COHORT_PACKET_MAX_BYTES = 256 * 1024


MAX_COHORT_PATHS = 6
# Complete authoritative texts every cohort receives verbatim, in precedence
# order. The first four are the sealed controlling authorities.
GOVERNANCE_PATHS = (".agents/skills/oracle/SKILL.md", ".agents/skills/oracle/review-output.schema.json",
                    "AGENTS.md", "Vault/docs/CONSTITUTION.md", "Vault/docs/architecture.md",
                    "tools/validation-contract.md")
GOVERNANCE_MAX_BYTES = 512 * 1024
JOURNAL_MAX_BYTES = 4 * 1024 * 1024
JOURNAL_NAME = "checkpoint.jsonl"
_FINDING_REQUIRED = ("severity", "file", "line", "message", "id", "root_cause", "reproduction", "required_behavior",
                     "recommendation", "affected_paths", "acceptance_checks", "origin", "origin_reason")


def governance_bundle(o, root, context):
    """Complete current governing bytes with exact provenance; never a summary."""
    authorities = context.get("guards", {}).get("authority_digests", {})
    parts, documents, total = [], [], 0
    for path in GOVERNANCE_PATHS:
        try:
            raw = o._custody_read(root, Path(root) / path)[1]
        except (OSError, o.OracleApprovalError) as exc:
            raise o.OracleReviewIncomplete("Mandatory governance document is missing: " + path) from exc
        sha = hashlib.sha256(raw).hexdigest()
        if path in authorities and authorities[path] != sha:
            raise o.OracleReviewIncomplete("Mandatory governance changed after the sealed context: " + path)
        header = ("=== GOVERNANCE " + path + " sha256=" + sha + " bytes=" + str(len(raw)) + " ===\n").encode()
        parts += [header, raw, b"" if raw.endswith(b"\n") else b"\n",
                  ("=== END GOVERNANCE " + path + " ===\n").encode()]
        documents.append({"path": path, "sha256": sha, "bytes": len(raw)})
        total += len(raw)
        if total > GOVERNANCE_MAX_BYTES:
            raise o.OracleReviewIncomplete("Mandatory governance exceeds its bounded size; no summary is substituted")
    payload = b"".join(parts)
    return payload, {"kind": "boc-cohort-governance-bundle-v1", "sha256": hashlib.sha256(payload).hexdigest(),
                     "bytes": len(payload), "documents": documents, "complete": True}


def _canonical_digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False).encode()).hexdigest()


def integration_scope(candidate_tree, publication_scope, required_paths, input_hashes, prior_findings):
    """The complete scope an integration concern assessed; any change reassigns it."""
    return {"candidate_tree": candidate_tree,
            "publication_range_sha256": (publication_scope or {}).get("range_sha256"),
            "required_identity_sha256": _canonical_digest({name: input_hashes.get(name) for name in sorted(required_paths)}),
            "open_findings_sha256": _canonical_digest({key: value for key, value in sorted(prior_findings.items())
                                                       if isinstance(value, dict) and value.get("state") == "OPEN"})}


def reusable_integration(rows, *, candidate_tree, publication_scope, required_paths, input_hashes, prior_findings,
                         guard_changes):
    """Retained REVIEWED/NOT_APPLICABLE concerns bound to the identical scope and guards."""
    if guard_changes:
        return []
    scope = integration_scope(candidate_tree, publication_scope, required_paths, input_hashes, prior_findings)
    result, seen = [], set()
    for row in rows or []:
        if (not isinstance(row, dict) or row.get("concern") not in INTEGRATION_CHECKS or row["concern"] in seen
                or row.get("status") not in {"REVIEWED", "NOT_APPLICABLE"} or row.get("scope") != scope
                or not isinstance(row.get("reason"), str) or not row["reason"].strip()
                or not isinstance(row.get("inputs"), list) or not row["inputs"]
                or any(not isinstance(item, dict) or input_hashes.get(item.get("path")) != item.get("digest")
                       or item.get("digest") is None for item in row["inputs"])):
            continue
        seen.add(row["concern"])
        result.append(copy.deepcopy(row))
    return result


def integration_complete(reused, current):
    done = {row.get("concern") for row in [*reused, *current]
            if isinstance(row, dict) and row.get("status") in {"REVIEWED", "NOT_APPLICABLE"}}
    return done >= set(INTEGRATION_CHECKS)


def _finding_valid(item, prefix):
    if not isinstance(item, dict) or set(item) != set(_FINDING_REQUIRED):
        return False
    text = ("file", "message", "root_cause", "reproduction", "required_behavior", "recommendation", "origin_reason")
    lists = ("affected_paths", "acceptance_checks")
    return (item["severity"] in {"critical", "high", "medium", "low"}
            and item["origin"] in {"INITIAL", "REPAIR", "MISSED", "REOPENED"}
            and isinstance(item["line"], int) and not isinstance(item["line"], bool) and item["line"] >= 1
            and all(isinstance(item[key], str) and item[key].strip() for key in text)
            and all(isinstance(item[key], list) and all(isinstance(v, str) and v for v in item[key]) for key in lists)
            and isinstance(item["id"], str) and re.fullmatch(prefix[:-3] + r"[0-9]{3}", item["id"]) is not None
            and item["id"] != prefix)


def replay_journal(o, text, plan, cohort, context, packet_sha256):
    """Replay an interrupted cohort's ordered journal; only exactly bound rows survive.

    Rows bind real assigned paths and real sealed input identities only; virtual
    retained-criterion paths belong to native expansion and are never admitted.
    """
    effective = {"input_hashes": {name: value for name, value in context["input_hashes"].items()
                                  if not name.startswith("@retained-criterion/")}}
    virtual = {group["path"] for group in plan.get("retained_criteria", [])}
    assigned = {name for name in cohort["required_paths"]
                if name not in virtual and not name.startswith("@retained-criterion/")
                and name in effective["input_hashes"]}
    concerns = set(cohort.get("integration_checks", []))
    coverage, findings, integration, withdrawn, rejected = {}, {}, {}, set(), []
    conflicted, stopped = set(), None
    for number, line in enumerate(text.split("\n"), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
            if not isinstance(row, dict):
                raise ValueError("not an object")
        except ValueError:
            stopped = number
            break
        if row.get("plan_sha256") != plan["plan_sha256"] or row.get("packet_sha256") != packet_sha256:
            rejected.append({"line": number, "reason": "foreign plan or packet"}); continue
        kind = row.get("type")
        try:
            if kind == "coverage":
                name = row.get("path")
                if name not in assigned or not isinstance(row.get("reason"), str) or not row["reason"].strip():
                    raise ValueError("unassigned path or missing reason")
                o._checked_inputs(row.get("inputs"), effective, required_path=name)
                entry = {"path": name, "status": "REVIEWED", "inputs": row["inputs"], "reason": row["reason"]}
                if name in coverage and coverage[name] != entry:
                    conflicted.add(name)
                coverage.setdefault(name, entry)
            elif kind == "finding":
                item = row.get("finding")
                if not _finding_valid(item, cohort["new_finding_prefix"]):
                    raise ValueError("finding violates the review schema or cohort prefix")
                if item["id"] in findings and findings[item["id"]] != item:
                    raise ValueError("conflicting duplicate finding")
                findings[item["id"]] = item
            elif kind == "withdraw":
                if row.get("path") not in assigned:
                    raise ValueError("unassigned withdrawal")
                withdrawn.add(row["path"])
            elif kind == "integration":
                if row.get("concern") not in concerns or row.get("status") not in {"REVIEWED", "NOT_APPLICABLE", "UNREVIEWED"}:
                    raise ValueError("unassigned integration concern")
                if not isinstance(row.get("reason"), str) or not row["reason"].strip():
                    raise ValueError("integration concern lacks a reason")
                o._checked_inputs(row.get("inputs"), effective)
                entry = {key: row[key] for key in ("concern", "status", "inputs", "reason")}
                prior = integration.get(row["concern"])
                if prior is None or prior == entry:
                    integration[row["concern"]] = entry
                else:
                    # Conflicting dispositions never keep an earlier completion.
                    integration[row["concern"]] = dict(entry, status="UNREVIEWED",
                                                       reason="Conflicting journal dispositions require reassessment")
                    rejected.append({"line": number, "reason": "conflicting integration disposition: " + row["concern"]})
            else:
                raise ValueError("unknown journal type")
        except (ValueError, KeyError, TypeError, o.OracleApprovalError) as exc:
            rejected.append({"line": number, "reason": str(exc)})
    affected = set(withdrawn) | set(conflicted)
    for item in findings.values():
        affected.update([item["file"], *item["affected_paths"]])
    return {"coverage": [entry for name, entry in coverage.items() if name not in affected],
            "findings": list(findings.values()), "integration": list(integration.values()),
            "rejected": rejected, "stopped_at_line": stopped}


def recover_interrupted(o, result, jobs, plan, context, envelopes, original_packets, *, blocked):
    """Admit journals only from interrupted cohorts whose preparation stayed intact."""
    current = []
    for cohort, child in jobs:
        if cohort["id"] in envelopes or result.get("review_status") == "COMPLETE":
            continue
        journal = child / JOURNAL_NAME
        try:
            raw = journal.read_bytes() if journal.is_file() and not journal.is_symlink() else b""
        except OSError as exc:
            result = copy.deepcopy(result)
            result.setdefault("journal_reconciliation", []).append(
                {"cohort_id": cohort["id"], "error": str(exc), "eligibility": "NONE"})
            continue
        if raw:
            # Preserve the reviewer's original bytes beside its journal, write-once.
            original = child / "checkpoint-journal-original.jsonl"
            if not original.exists():
                descriptor = os.open(original, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                with os.fdopen(descriptor, "wb") as handle:
                    handle.write(raw)
        if cohort["id"] in blocked:
            result = copy.deepcopy(result)
            result.setdefault("journal_reconciliation", []).append(
                {"cohort_id": cohort["id"], "error": "Prepared or shared integrity failed; raw journal retained only",
                 "journal_bytes": len(raw), "eligibility": "NONE"})
            continue
        try:
            if len(raw) > JOURNAL_MAX_BYTES:
                raise ValueError("journal exceeds its bound")
            packet = original_packets[cohort["id"]]
            packet_sha256 = o._sha(packet if isinstance(packet, bytes) else packet.encode())
            admitted = replay_journal(o, raw.decode("utf-8", errors="replace"), plan, cohort, context, packet_sha256)
        except (ValueError, KeyError, TypeError, o.OracleApprovalError) as exc:
            result = copy.deepcopy(result)
            result.setdefault("journal_reconciliation", []).append(
                {"cohort_id": cohort["id"], "error": str(exc), "eligibility": "NONE"})
            continue
        result = merge_journal(result, cohort["id"], admitted)
        if cohort["id"] == AREAS[0]:
            current += admitted["integration"]
    return result, current


def merge_journal(result, cohort_id, admitted):
    """Add admitted journal observations to an unfinished aggregate; it stays unfinished."""
    merged = copy.deepcopy(result)
    if merged.get("review_status") == "COMPLETE":
        raise ValueError("Journal observations belong only to an unfinished aggregate")
    have = {row["path"] for row in merged.get("coverage", [])}
    merged.setdefault("coverage", []).extend(row for row in admitted["coverage"] if row["path"] not in have)
    ids = {item["id"] for item in merged.get("findings", [])}
    merged.setdefault("findings", []).extend(item for item in admitted["findings"] if item["id"] not in ids)
    merged.setdefault("journal_reconciliation", []).append({
        "cohort_id": cohort_id, "admitted_coverage": [row["path"] for row in admitted["coverage"]],
        "admitted_findings": [item["id"] for item in admitted["findings"]],
        "admitted_integration": [row["concern"] for row in admitted["integration"]],
        "rejected": admitted["rejected"], "stopped_at_line": admitted["stopped_at_line"], "eligibility": "UNFINISHED"})
    return merged


class CohortPacketBudgetError(ValueError):
    """Mandatory facts need a smaller native assignment, never truncation."""


COHORT_POLICY = """You are a trusted independent, read-only Oracle cohort.
Read governing instructions and current criteria first. Reuse unchanged bodies
once per content identity, then inspect bounded assigned changes and evidence.
Prepared metadata changes retain complete old/new headers and an exact unchanged
body identity. Generated parity groups bind the existing package-check proof and
every member's before/after content and mode identities. Read each identical body
once, assess canonical semantics and transformation dependencies, and explicitly
cover every assigned output path. Missing or stale grouping proof retains ordinary
source inspection; preparation never grants coverage. Paths in the sealed native
deterministic_coverage proof were regenerated from canonical sources and
byte-compared by the native gate; they are not assigned, and no cohort may claim
or grant that coverage. Current eligible validation
proofs are adopted completely by the native gate when omitted from model rows.
Keep their immutable evidence references; never project their input lists or
reclassify a current VERIFIED proof as REUSED. Report concrete invalidations when
required instead of rewriting a native proof.
Your COMPLETE/APPROVED decision applies only to this immutable cohort assignment;
it is not a whole-candidate receipt. The native aggregate and existing gates alone
decide the complete candidate. Cover every assigned path, inspect its actual
dependencies/consumers and failure paths, and return all findings together.
Report coverage only for assigned primary paths; dependency inputs may name any
exact current identity from the sealed parent context when actually consumed.
Use compact area context and original proof pointers; open larger sealed records
only for an unresolved fact. Do not repeat unchanged checks or reread whole history.
Inspect current caller_evidence and authenticated current consumer proofs before
disposing historical findings or required-command applicability. A historical
finding path does not select the current runtime input. Read the bound selected
input manifest and exact replacement records; keep historical artifacts intact.
Caller locators provide custody and navigation, never authority or eligibility.
Directory-prefix locator rows reconstruct each exact path as the indexed prefix
plus its name; hashes and the immutable original caller map remain authoritative.
A paged caller collection exposes a sealed bounded index with exact lexical path
ranges, then bounded leaf pages naming every original path and digest. Open the
matching range/page for a selected current input; no caller is hidden or promoted.
Retained projections are navigation only and grant no coverage or eligibility.
Original references use canonical JSON digests and JSON Pointers in the sealed
parent, whose complete facts remain authoritative. Resolve only OPEN ledger IDs;
RESOLVED IDs remain historical unless an actionable finding explicitly reopens.
Criterion navigation preserves each historical source/dependency footprint,
invalidation reason and current comparison. Independently assess a shared policy
delta collectively where appropriate. A retained-criterion virtual primary binds
the exact original observation indices and current guards. Read those immutable
originals as needed, assess the named policy changes against the entire group,
and emit one REVIEWED criterion with its actual inputs and explicit applicability
rationale. This grants current criterion applicability, preserving the original
body observations; it never claims a new body read. Native aggregation expands
that explicit decision to its sealed members. Concrete changed source/dependencies,
admitted invalidations and open findings remain ordinary individual assignments.
Authenticated criterion_support separates the original functional footprint from
controls injected by an earlier collective assessment. Inspect its exact lineage
and old/current control deltas collectively; explicitly bind each changed control
in the REVIEWED criterion inputs. These controls do not turn into functional
dependencies of every member. Unknown lineage or changed functional support stays
individual. Every original observation and original control hash remains intact.
An unadopted-observation group additionally binds authentic original native
result/model/process bytes and every completed per-file footprint. Its original
ERROR remains literal. Explicitly assess current applicability before adopting
that group; neither preparation nor unchanged identities grant eligibility.
Identity matching alone never
grants applicability, coverage or approval; inspect unresolved differences.
COMPLETE requires limitations=[]; put nonblocking area boundaries in summary.
Retain existing finding IDs. Only the crosscutting cohort dispositions prior
findings and global integration criteria. Specialists classify their assigned
area only: empty/NONE/NOT_REQUIRED fields describe local absence, while positive
effects must be reported precisely for native reconciliation against the complete
crosscutting assessment. Never write source, stage, commit,
publish a receipt, launch another review, or change proposal/review pointers.
Only the crosscutting cohort emits command_coverage for every required_commands
entry. Emit each exact id/argv once, status COMPLETE or INCOMPLETE, basis
INDEPENDENT_APPLICABILITY, a nonempty unique inputs list including exactly one
current package.json identity, the current environment_digest, nonempty unique
directly bound original evidence_paths, and your independent reason. The sealed
command_coverage_contract supplies required identities and original locators;
it grants no coverage or decision. Copy current input identities, not historical
execution input hashes. A nested output locator in a record is not itself a
bound evidence_path: cite its directly supplied record or a separately bound
original output. Never repair, prefill or relabel an earlier model decision.
Assess preserved original passing cases and focused repairs against exact
current source/test/dependency/configuration/output hashes and the actual declared
environment contract. Preserve all original failed aggregate statuses. This is
explicit INDEPENDENT_APPLICABILITY, distinct from a passing command witness.
Missing or invalidated applicability stays INCOMPLETE. The existing native gate
checks command completeness, exact identities and original custody independently.
Specialists use command_coverage=[] and report missing relevant proof as findings.
"""


def _area(path):
    if path.startswith(("@", ".agents/", ".claude/")):
        return AREAS[0]
    if path.startswith(("tests/", ".github/", ".githooks/", "scripts/")):
        return AREAS[2]
    return AREAS[1]


def _retained_criteria(context, pending, digest):
    """Group only shared guard deltas; preserve original source observations."""
    blocked = {path for item in context.get('prior_findings', {}).values()
               if item.get('state') == 'OPEN'
               for path in [item.get('file'), *item.get('affected_paths', [])]}
    guard_keys = set(context.get('guards', {}))
    groups, seen = {}, set()
    originals = context.get('invalidated_coverage', [])
    for index, entry in enumerate(originals):
        name, inputs = entry.get('path'), entry.get('inputs', [])
        support = entry.get('criterion_support')
        controls = support.get('control_inputs', []) if support else entry.get('criterion_control_inputs', [])
        if support:
            inputs = support['functional_inputs']
        reasons = entry.get('invalidation_reasons', [])
        raw = entry.get('raw_observation')
        allowed_reasons = guard_keys | ({'unadopted_native_observation'} if raw else set())
        if support:
            allowed_reasons |= {row['path'] + suffix for row in controls
                                for suffix in (' content changed or missing', ' criterion control changed or missing')}
        names = [item.get('path') for item in inputs if isinstance(item, dict)]
        if (name not in pending or name in seen or name in blocked
                or entry.get('status') not in {'REVIEWED', 'CARRIED_FORWARD'}
                or entry.get('criterion_adoption') and not support
                or not reasons or not set(reasons) <= allowed_reasons
                or raw is not None and (not isinstance(raw, dict) or not raw.get('provenance_files')
                                       or 'unadopted_native_observation' not in reasons)
                or entry.get('checkpoint_invalidation_reasons')
                or not inputs or name not in names or len(set(names)) != len(inputs)
                or any(context['input_hashes'].get(row['path']) is None for row in controls)
                or support and any(context['input_hashes'].get(row['path']) != row['digest']
                                   and row['path'] not in support['policy_control_paths'] for row in controls)
                or any(not isinstance(item, dict) or set(item) != {'path', 'digest'}
                       or context['input_hashes'].get(item['path']) != item['digest'] for item in inputs)):
            continue
        facts = {'historical_status': entry['status'],
                 'guard_deltas': sorted(set(reasons) - {'unadopted_native_observation'}),
                 'current_guards_sha256': digest(context.get('guards', {}))}
        if raw:
            facts['unadopted_observation'] = True
        if support:
            facts['control_bindings'] = controls
            facts['control_deltas'] = [{'path': row['path'], 'original_digest': row['digest'],
                                       'current_digest': context['input_hashes'][row['path']]}
                                      for row in controls if context['input_hashes'][row['path']] != row['digest']]
        key = digest(facts)
        groups.setdefault(key, dict(facts, original_coverage_indices=[]))['original_coverage_indices'].append(index)
        seen.add(name)
    result = []
    for key, group in sorted(groups.items()):
        members = [originals[index] for index in group['original_coverage_indices']]
        result.append(dict(group, path='@retained-criterion/' + key, member_count=len(members),
                           members_sha256=digest(members)))
    return result


def _criterion_context(context, plan):
    """Virtual inputs are sealed plan facts, never automatic source eligibility."""
    result = dict(context, input_hashes=dict(context['input_hashes']))
    for group in plan.get('retained_criteria', []):
        raw = json.dumps(group, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()
        # The parent context and plan are independently sealed before dispatch.
        result['input_hashes'][group['path']] = 'sha256:' + hashlib.sha256(raw).hexdigest()
    return result


def partition(context, binding, digest):
    """Assign only missing/affected coverage; native eligible coverage stays carried."""
    reusable = {item["path"] for item in context["reusable_coverage"]}
    # Derived outputs proven by native regeneration take no model time; the
    # cohorts review only canonical deltas (owner direction 2026-10-15).
    if __package__:
        from . import oracle_generated_proof as generated
    else:
        import oracle_generated_proof as generated
    pending = sorted(set(context["required_coverage_paths"]) - reusable - generated.covered_paths(context))
    retained = _retained_criteria(context, set(pending), digest)
    adopted_paths = {context['invalidated_coverage'][index]['path'] for group in retained
                     for index in group['original_coverage_indices']}
    assigned = sorted((set(pending) - adopted_paths) | {group['path'] for group in retained})
    groups = {area: [] for area in AREAS}
    for path in assigned:
        groups[_area(path)].append(path)
    reused = {row.get("concern") for row in context.get("reusable_integration", [])
              if isinstance(row, dict) and row.get("status") in {"REVIEWED", "NOT_APPLICABLE"}}
    cohorts = [{"id": AREAS[0], "required_paths": groups[AREAS[0]],
                "integration_checks": [name for name in INTEGRATION_CHECKS if name not in reused],
                "new_finding_prefix": "F1000"}]
    for area in AREAS[1:]:
        chunks = [groups[area][start:start + MAX_COHORT_PATHS] for start in range(0, len(groups[area]), MAX_COHORT_PATHS)]
        for part, chunk in enumerate(chunks, 1):
            cohorts.append({"id": area if len(chunks) == 1 else f"{area}-{part}", "required_paths": chunk,
                            "integration_checks": [], "new_finding_prefix": f"F{len(cohorts) + 1}000"})
    plan = {"kind": "boc-parallel-review-plan-v1", "candidate_commit": context["base_commit"],
            "candidate_tree": context["candidate_tree"], "input_binding_sha256": digest(binding),
            "context_sha256": digest(context), "required_paths": assigned, "cohorts": cohorts,
            "retained_criteria": retained, "original_required_paths_sha256": digest(pending),
            "max_workers": 3, "reviewer_settings": binding["reviewer_settings"]}
    return dict(plan, plan_sha256=digest(plan))


def caller_navigation(caller, original):
    caller_navigation = {'original': original,
                         'columns': ['path', 'sha256'], 'record_count': len(caller),
                         'records': [[name, identity] for name, identity in sorted(caller.items())],
                         'eligibility': 'NONE'}
    if len(_serialized(caller_navigation)) > RETAINED_NAVIGATION_MAX_BYTES:
        # Repeated owned directories consume the navigation budget without
        # adding facts. Preserve every named locator before using the larger
        # paged fallback; no path normalization or selection is involved.
        prefixes = sorted({name.rpartition('/')[0] + '/' if '/' in name else '' for name in caller})
        indices = {prefix: index for index, prefix in enumerate(prefixes)}
        compact = dict(caller_navigation, encoding='directory-prefix-v1', prefixes=prefixes,
                       columns=['prefix_index', 'name', 'sha256'], records=[
                           [indices[name.rpartition('/')[0] + '/' if '/' in name else ''],
                            name.rpartition('/')[2], identity] for name, identity in sorted(caller.items())])
        if len(_serialized(compact)) <= RETAINED_NAVIGATION_MAX_BYTES:
            caller_navigation = compact
    return caller_navigation


def packet(context, plan, cohort, parent_context, digest, prepared_source=None, prepared_callers=None):
    if digest(context) != plan['context_sha256']:
        raise ValueError('Cohort projection requires the exact sealed parent context')
    assigned = set(cohort["required_paths"])
    effective_context = _criterion_context(context, plan)
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
    if cohort["id"] == AREAS[0] and context.get("required_commands"):
        selected.add("package.json")
    value = {"kind": "boc-parallel-cohort-context-v1", "cohort": cohort,
             "plan_sha256": plan["plan_sha256"], "candidate_commit": plan["candidate_commit"],
             "candidate_tree": plan["candidate_tree"], "input_binding_sha256": plan["input_binding_sha256"],
             "parent_context": str(parent_context), "parent_context_sha256": plan["context_sha256"],
             "input_hashes": {p: value for p, value in effective_context["input_hashes"].items() if p in selected},
             "prior_findings": relevant_findings,
             "proposal_scope": context.get("proposal_scope"),
             "previous_proposal_scope": context.get("previous_proposal_scope"), "scope_changed": context.get("scope_changed"),
             "open_prior_finding_ids": sorted(key for key, item in relevant_findings.items() if item.get('state') == 'OPEN'),
             "resolved_prior_finding_ids": sorted(key for key, item in relevant_findings.items() if item.get('state') == 'RESOLVED'),
             "publication_scope": context["publication_scope"] if cohort["id"] == AREAS[0] else {
                 "range_sha256": context["publication_scope"]["range_sha256"]},
             "finding_disposition_owner": AREAS[0]}
    value["required_commands"] = context.get("required_commands", []) if cohort["id"] == AREAS[0] else []
    def original(pointer, item):
        return {'parent_context': str(parent_context), 'parent_context_sha256': plan['context_sha256'],
                'digest_encoding': 'canonical-json-v1', 'json_pointer': pointer,
                'value_sha256': digest(item), 'navigation_only': True, 'eligibility': 'NONE'}

    if value['required_commands']:
        package = effective_context['input_hashes'].get('package.json')
        environment = context.get('guards', {}).get('environment_digest')
        if not isinstance(package, str) or not package or not isinstance(environment, str) or not environment:
            raise ValueError('Required-command contract lacks current package.json or environment identity')
        value['command_coverage_contract'] = {
            'required_input': {'path': 'package.json', 'digest': package},
            'environment_digest': environment,
            'required_commands': original('/required_commands', context['required_commands']),
            'current_input_identities': original('/input_hashes', context['input_hashes']),
            'original_evidence': original('/caller_evidence', context.get('caller_evidence', {})),
            'grants_coverage': False}

    caller_index = caller_navigation(
        context.get('caller_evidence', {}), original('/caller_evidence', context.get('caller_evidence', {})))
    if len(_serialized(caller_index)) > RETAINED_NAVIGATION_MAX_BYTES:
        if prepared_callers is None:
            raise CohortPacketBudgetError('Caller evidence requires a sealed bounded locator collection')
        caller_index = {key: caller_index[key] for key in ('original', 'record_count', 'eligibility')}
        caller_index.update(columns=['path', 'sha256'], records_via_pages=True, collection=prepared_callers)
    value['caller_evidence'] = caller_index

    if cohort['id'] == AREAS[0]:
        value['retained_criteria'] = {'groups': plan.get('retained_criteria', []),
            'original': original('/invalidated_coverage', context.get('invalidated_coverage', [])),
            'current_guards': context.get('guards', {}), 'eligibility': 'NONE',
            'requires_explicit_independent_review': True}

    dispositions = context.get('path_dispositions', [])
    status_indices = {}
    for index, item in enumerate(dispositions):
        if item.get('path') in assigned:
            status_indices.setdefault(item.get('disposition', 'UNKNOWN'), []).append(index)
    value['path_dispositions'] = {'original': original('/path_dispositions', dispositions),
                                 'assigned_status_indices': status_indices}

    invalidated = context.get('invalidated_coverage', [])
    path_indices = {path: index for index, path in enumerate(cohort['required_paths'])}
    criterion_groups = {}
    for index, entry in enumerate(invalidated):
        if entry.get('path') not in assigned:
            continue
        inputs = entry.get('inputs', [])
        input_paths = [item.get('path') for item in inputs]
        current = (bool(inputs) and entry['path'] in input_paths and len(set(input_paths)) == len(inputs) and
                   all(set(item) == {'path', 'digest'} and context['input_hashes'].get(item['path']) == item['digest']
                       for item in inputs))
        facts = {'historical_status': entry.get('status'),
                 'invalidation_reasons': entry.get('invalidation_reasons', []),
                 'all_recorded_dependencies_current': current}
        key = digest(facts)
        if key not in criterion_groups:
            criterion_groups[key] = dict(facts, criterion_pairs=[])
        criterion_groups[key]['criterion_pairs'].append([path_indices[entry['path']], index])
    criterion_navigation = {'original': original('/invalidated_coverage', invalidated),
                            'pair_columns': ['cohort_required_path_index', 'original_coverage_index'],
                            'groups': list(criterion_groups.values()),
                            'eligibility': 'NONE', 'requires_independent_current_applicability': True}

    unadopted = []
    for index, item in enumerate(context.get('unadopted_assessments', [])):
        observations = [entry for entry in item.get('observations', []) if entry.get('path') in assigned]
        findings = [entry for entry in item.get('finding_references', []) if cohort['id'] == AREAS[0] or
                    assigned & {entry.get('file'), *entry.get('affected_paths', [])}]
        if cohort['id'] != AREAS[0] and not observations and not findings:
            continue
        summary = {key: item.get(key) for key in ('round', 'status', 'actual_outcome', 'reported_review_status',
                   'reported_verdict', 'observed_candidate_tree', 'origin_record_sha256', 'assessment_pointer')}
        summary.update(original=original('/unadopted_assessments/' + str(index), item),
                       observation_count=len(item.get('observations', [])),
                       observations=[{key: entry.get(key) for key in
                           ('path', 'reported_status', 'input_binding_valid', 'binding_error', 'changed_inputs')}
                           for entry in observations],
                       finding_references=findings, finding_ids=item.get('finding_ids', []))
        unadopted.append(summary)
    validations = []
    for key in ('reusable_validations', 'current_validations'):
        for index, item in enumerate(context[key]):
            matched = [entry for entry in item.get('inputs', []) if entry['path'] in assigned]
            if not matched and cohort['id'] != AREAS[0]:
                continue
            validations.append({**{name: item.get(name) for name in
                ('evidence_path', 'evidence_sha256', 'environment_digest', 'status')},
                'original': original('/' + key + '/' + str(index), item), 'assigned_inputs': matched,
                'input_count': len(item.get('inputs', [])), 'inputs_sha256': digest(item.get('inputs', [])),
                'command_sha256': digest(item.get('command'))})
    retained = {'unadopted_assessments': unadopted, 'validation_references': validations,
                'criterion_navigation': criterion_navigation,
                'retained_proof_references': {key: original('/' + key, context.get(key)) for key in
                    ('prior_native_assessment', 'prior_rounds', 'retained_observation_evidence')}}
    if len(_serialized(retained)) > RETAINED_NAVIGATION_MAX_BYTES:
        # Full originals remain immutable and available on demand; omitting
        # navigation never omits current findings, governing facts or checks.
        retained = {'unadopted_assessments': [original('/unadopted_assessments', context.get('unadopted_assessments', []))],
                    'validation_references': [original('/' + key, context[key]) for key in
                        ('reusable_validations', 'current_validations')],
                    'criterion_navigation': criterion_navigation,
                    'retained_proof_references': retained['retained_proof_references']}
    if len(_serialized(retained)) > RETAINED_NAVIGATION_MAX_BYTES:
        # Path-specific reasons can exceed navigation limits on a generated
        # package delta. Preserve every exact original record locator; full
        # status, reasons and dependencies remain mandatory in the sealed parent.
        retained['criterion_navigation'] = {
            **{key: criterion_navigation[key] for key in
               ('original', 'pair_columns', 'eligibility', 'requires_independent_current_applicability')},
            'criterion_pairs': sorted(pair for group in criterion_navigation['groups']
                                      for pair in group['criterion_pairs']),
            'facts_via_original_records': True}
    value.update(retained)
    if prepared_source is not None:
        value['prepared_source'] = {key: item for key, item in prepared_source.items() if key != 'required_paths'}
        value['prepared_source']['required_paths_sha256'] = digest(prepared_source.get('required_paths', []))
        value['prepared_source']['required_path_count'] = len(prepared_source.get('required_paths', []))
    result = dict(value, packet_sha256=digest(value))
    if len(_serialized(retained)) > RETAINED_NAVIGATION_MAX_BYTES or len(_serialized(result)) > COHORT_PACKET_MAX_BYTES:
        raise CohortPacketBudgetError('Mandatory cohort facts exceed the bounded serialized packet; replan without dropping criteria')
    return result


def _serialized(value):
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + '\n').encode()


def output_schema(base, plan, cohort, prepared=None):
    string = {"type": "string", "minLength": 1}
    assessment = copy.deepcopy(base)
    commands = assessment['properties']['command_coverage']
    if cohort['id'] != AREAS[0]:
        commands['maxItems'] = 0
    elif prepared and prepared.get('required_commands'):
        contract = prepared['command_coverage_contract']
        fields = commands['items']['properties']
        fields['id']['enum'] = [row['id'] for row in prepared['required_commands']]
        fields['environment_digest']['enum'] = [contract['environment_digest']]
        fields['inputs']['minItems'] = 1
        fields['inputs']['description'] = (
            'Every command row must contain exactly one current package.json input: '
            + json.dumps(contract['required_input'], sort_keys=True)
            + '. Include other consumed current dependencies; each path is unique. '
            'The native validator checks membership and exact current identities.')
        fields['evidence_paths']['description'] = (
            'Unique original observation paths directly bound in the sealed parent input_hashes. '
            'A nested output locator is not a separately bound input. Preserve original failures; '
            'the native validator checks current bytes and independent applicability.')
    fields = {"plan_sha256": {"enum": [plan["plan_sha256"]]}, "cohort_id": {"enum": [cohort["id"]]},
              "candidate_commit": {"enum": [plan["candidate_commit"]]},
              "candidate_tree": {"enum": [plan["candidate_tree"]]},
              "input_binding_sha256": {"enum": [plan["input_binding_sha256"]]}, "assessment": assessment,
              # The schema admits exactly the cohort's assigned concerns, the same set
              # _assigned_result accepts; a cohort with none returns an empty list.
              "integration": {"type": "array", "minItems": len(cohort["integration_checks"]),
                  "maxItems": len(cohort["integration_checks"]),
                  "items": {"type": "object", "additionalProperties": False,
                  "required": ["concern", "status", "inputs", "reason"], "properties": {
                      "concern": {"enum": list(cohort["integration_checks"] or INTEGRATION_CHECKS)},
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
    effective_context = _criterion_context(context, plan)
    virtual = {group['path'] for group in plan.get('retained_criteria', [])}
    covered, seen = set(), set()
    for item in assessment["coverage"]:
        name = item.get("path")
        if name in seen or name not in cohort["required_paths"]:
            raise o.OracleApprovalError("Cohort coverage is duplicate or outside its assignment")
        seen.add(name)
        if name in virtual and (item.get('status') not in {'REVIEWED', 'UNREVIEWED'} or not item.get('reason', '').strip()):
            raise o.OracleApprovalError('Retained criterion requires an explicit current independent assessment')
        if item.get("status") != "UNREVIEWED":
            o._checked_inputs(item.get("inputs"), effective_context, required_path=name)
            covered.add(name)
    integration = envelope["integration"]
    if not isinstance(integration, list):
        raise o.OracleApprovalError("Cohort integration assessment is malformed")
    concerns = [item.get("concern") for item in integration if isinstance(item, dict)]
    if len(concerns) != len(integration) or len(set(concerns)) != len(concerns) or not set(concerns) <= set(cohort["integration_checks"]):
        raise o.OracleApprovalError("Cohort integration scope is duplicate or foreign")
    for item in integration:
        o._checked_inputs(item.get("inputs"), effective_context)
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


def interrupted_origin(o, root, reference):
    """Authenticate the original inactive owner and preparation afresh on every read."""
    if __package__:
        from . import oracle_lifecycle as lifecycle
    else:
        import oracle_lifecycle as lifecycle
    owners = lifecycle.inactive_source_owners(o, root, reference['series_id'])
    owner = next((row for row in owners if row['controller_id'] == reference['controller_id']), None)
    if owner is None or lifecycle._active_children(o, root, owner):
        raise o.OracleApprovalError('Interrupted reviewer owner is unregistered or still active')
    run = Path(reference['context_file']).parent
    runs = o.receipt_path(root).parent / 'runs'
    if (run.parent != runs or not run.name.startswith('issue-')
            or Path(reference['context_file']) != run / 'review-context.json'):
        raise o.OracleApprovalError('Interrupted context is outside its native source run')
    if o._custody_files(root, list(reference['custody'])) != reference['custody']:
        raise o.OracleApprovalError('Interrupted native provenance content or custody changed')
    context = json.loads(o._custody_read(root, run / 'review-context.json')[1])
    plan = json.loads(o._custody_read(root, run / 'cohort-plan.json')[1])
    seals = json.loads(o._custody_read(root, run / 'prepared-source-seals.json')[1])
    if (context['series_id'] != reference['series_id']
            or plan['context_sha256'] != o._sha(o._canonical(context))
            or plan['plan_sha256'] != _canonical_digest({k: v for k, v in plan.items() if k != 'plan_sha256'})
            or plan['candidate_commit'] != context['base_commit']
            or plan['candidate_tree'] != context['candidate_tree']
            or plan['reviewer_settings'] != owner['reviewer_settings']
            or o._historical_policy_guard(root, context['candidate_tree'],
                    context['guards'].get('review_policy_digest')) is None
            or o._git(root, 'merge-base', '--is-ancestor', context['base_commit'], 'HEAD').strip()):
        raise o.OracleApprovalError('Interrupted native context, plan, settings or ancestry changed')
    registered, successful = {}, set()
    for path in sorted((Path(owner['directory']) / 'children').glob('reviewer-*.json')):
        if not re.fullmatch(r'reviewer-[0-9a-f]{32}\.json', path.name):
            continue
        registration = json.loads(o._custody_read(root, path)[1])
        child = Path(registration['run'])
        if child.parent != run / 'cohorts':
            continue
        process = child / 'process.json'
        outcome = path.with_suffix('.outcome.json')
        process_record = json.loads(o._custody_read(root, process)[1]) if process.exists() else {}
        outcome_record = json.loads(o._custody_read(root, outcome)[1]) if outcome.exists() else {}
        native = {'path': str(path), 'sha256': o._custody_read(root, path)[0]['sha256']}
        succeeded = (process_record.get('exit_code') == 0 and process_record.get('native_registration') == native
                     and outcome_record == {'record_sha256': registration['record_sha256'], 'exit_code': 0})
        model = json.loads(o._custody_read(root, child / 'model.json')[1])
        instructions = '\n\n'.join((o.REVIEWER_ROLE, o.NORMAL_PLAN_REVIEW_POLICY, o.LOCAL_EXECUTION_POLICY,
                                     o.REVIEW_SERIES_POLICY, o.DEPLOYMENT_PLACEMENT_POLICY, COHORT_POLICY))
        if (model.get('reviewer_role') != 'independent-oracle-approver'
                or {'model': model.get('selected_model'), 'reasoning_effort': model.get('reasoning_effort')}
                    != plan['reviewer_settings']
                or model.get('schema_sha256') != o._custody_read(root, child / 'output.schema.json')[0]['sha256']
                or model.get('developer_instructions_sha256') != o._sha(instructions.encode())
                or model.get('model_helper_sha256') != o._sha(o._git_bytes(root, 'show',
                    context['candidate_tree'] + ':tools/codex_child_model.py'))):
            raise o.OracleApprovalError('Interrupted registered reviewer role/settings/schema changed')
        packet = json.loads(o._custody_read(root, child / 'cohort-context.json')[1])
        identity = packet.get('cohort', {}).get('id')
        if (not isinstance(identity, str) or not re.fullmatch(re.escape(identity) + r'-[0-9a-f]{32}', child.name)
                or identity in registered):
            raise o.OracleApprovalError('Interrupted cohort registration is duplicate or outside its native assignment')
        registered[identity] = child
        if succeeded:
            successful.add(identity)
    jobs = []
    for cohort in plan['cohorts']:
        child = registered.get(cohort['id'])
        if child is None:
            continue
        if cohort['id'] not in seals or o._files(root, list(seals[cohort['id']])) != seals[cohort['id']]:
            raise o.OracleApprovalError('Interrupted prepared source seal changed')
        packet = json.loads(o._custody_read(root, child / 'cohort-context.json')[1])
        if (packet.get('parent_context_sha256') != plan['context_sha256']
                or packet.get('packet_sha256') != _canonical_digest({k: v for k, v in packet.items() if k != 'packet_sha256'})
                or packet.get('cohort') != cohort):
            raise o.OracleApprovalError('Interrupted cohort packet changed')
        jobs.append((cohort, child))
    return context, plan, jobs, successful


def ingest_interrupted(o, root, directory):
    """Native ERROR checkpoints retain registered observations after owner loss.

    Current applicability, criteria, findings and the whole verdict still pass
    through the ordinary context/partition and independent review lifecycle.
    """
    if __package__:
        from . import oracle_lifecycle as lifecycle
    else:
        import oracle_lifecycle as lifecycle
    rounds = o._read_rounds(directory)
    consumed = {row.get('raw_assessment', {}).get('interrupted_origin', {}).get('context_file') for row in rounds}
    consumed.update(row['context_file'] for row in rounds)
    consumed.update(str(Path(row['context_file']).parent / 'review-context.json') for row in rounds)
    for owner in lifecycle.inactive_source_owners(o, root, directory.name):
        if lifecycle._active_children(o, root, owner):
            continue
        children = Path(owner['directory']) / 'children'
        candidates = set()
        for path in children.glob('reviewer-*.json'):
            if re.fullmatch(r'reviewer-[0-9a-f]{32}\.json', path.name):
                child = Path(json.loads(o._custody_read(root, path)[1])['run'])
                if child.parent.name == 'cohorts':
                    candidates.add(child.parent.parent)
        for run in sorted(candidates):
            original_file = run / 'review-context.json'
            if str(original_file) in consumed:
                continue
            paths = [original_file, run / 'cohort-plan.json', run / 'prepared-source-seals.json']
            if not all(path.exists() for path in paths):
                continue
            reference = {'controller_id': owner['controller_id'], 'series_id': directory.name,
                         'context_file': str(original_file), 'custody': o._custody_files(root, paths)}
            original, plan, jobs, successful = interrupted_origin(o, root, reference)
            if not jobs:
                continue
            raw_children = []
            for cohort, child in jobs:
                if cohort['id'] not in successful:
                    continue
                try:
                    raw_children.append(_unadopted_result(o, root, child, run / 'cohort-plan.json', plan,
                        cohort, original, o._custody_read(root, child / 'cohort-context.json')[1],
                        'Original registered controller ended before aggregate admission'))
                except (OSError, ValueError, KeyError, TypeError, o.OracleApprovalError):
                    continue
            result = aggregate(o, plan, original, {}, ['Original controller ended before aggregate admission'], root=root)
            result['unadopted_cohort_assessments'] = raw_children
            result, _ = recover_interrupted(o, result, jobs, plan, original, {},
                {cohort['id']: o._custody_read(root, child / 'cohort-context.json')[1] for cohort, child in jobs}, blocked=set())
            if not raw_children and not result['coverage'] and not result.get('findings'):
                continue
            retained_files = [path for _, child in jobs for path in
                (child / JOURNAL_NAME, child / 'checkpoint-journal-original.jsonl', child / 'model.json',
                 child / 'request.txt', child / 'process.json', child / 'result.json') if path.exists()]
            retained_files += [path for path in children.iterdir() if path.is_file()]
            reference['custody'].update(o._custody_files(root, retained_files))
            # The original context is immutable. A new storage context appends
            # the ERROR event to today's chain without rewriting its assignment.
            previous = rounds[-1] if rounds else None
            context = dict(original, round=len(rounds) + 1, mode='resume',
                           previous_record_sha256=previous['record_sha256'] if previous else None)
            context_file = run / ('interrupted-recovery-context-' + str(context['round']) + '.json')
            o._atomic_write(context_file, o._pretty(context))
            raw = {'actual_outcome': 'ERROR', 'reason': result['limitations'][0],
                   'reported_review_status': 'ERROR', 'reported_verdict': 'ERROR',
                   'assessment': result, 'interrupted_origin': reference}
            o._record_round(root, context, {'error': raw['reason']}, 'ERROR', context_file=context_file,
                            raw_assessment=raw, coverage=result['coverage'], validations=[])
            rounds = o._read_rounds(directory)
            consumed.add(str(original_file))


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


def _expanded_criteria(o, context, plan, assessment):
    """Expand only a genuine independent shared-criterion decision, never identity alone."""
    groups = {group['path']: group for group in plan.get('retained_criteria', [])}
    effective = _criterion_context(context, plan)
    rows, adoptions = [], []
    for item in assessment['coverage']:
        group = groups.get(item.get('path'))
        if group is None:
            rows.append(item)
            continue
        indices = group['original_coverage_indices']
        originals = [context['invalidated_coverage'][index] for index in indices]
        if o._sha(o._canonical(originals)) != group['members_sha256']:
            raise o.OracleApprovalError('Retained criterion members changed before aggregation')
        if item.get('status') == 'REVIEWED':
            o._checked_inputs(item.get('inputs'), effective, required_path=group['path'])
        elif item.get('status') != 'UNREVIEWED':
            raise o.OracleApprovalError('Retained criterion was not independently assessed')
        # References remain in the native result, together with the unmodified
        # child result; every expanded row keeps its actual original footprint.
        adoption = {'criterion': group['path'], 'status': item['status'], 'reason': item['reason'],
                    'original_coverage_indices': indices, 'members_sha256': group['members_sha256'],
                    'parent_context_sha256': plan['context_sha256'], 'guard_deltas': group['guard_deltas'],
                    'dependency_roles': 'functional-and-criterion-v1', 'inputs': item.get('inputs', [])}
        adoptions.append(adoption)
        for index, original in zip(indices, originals):
            support = original.get('criterion_support')
            inputs = {entry['path']: entry['digest'] for entry in
                      (support['functional_inputs'] if support else original['inputs'])}
            controls = {entry['path']: entry['digest'] for entry in
                        (support['control_inputs'] if support else original.get('criterion_control_inputs', []))}
            current_controls = {entry['path']: entry['digest'] for entry in item.get('inputs', [])
                                if entry['path'] in context['input_hashes'] and entry['path'] not in inputs}
            if item['status'] == 'REVIEWED' and (any(context['input_hashes'].get(name) != value
                    for name, value in inputs.items()) or any(
                        context['input_hashes'].get(name) != value and
                        current_controls.get(name) != context['input_hashes'].get(name)
                        for name, value in controls.items())):
                raise o.OracleApprovalError('Retained functional support changed or current control delta was not independently bound')
            controls.update(current_controls)
            rows.append({'path': original['path'], 'status': item['status'],
                         'inputs': [{'path': name, 'digest': value} for name, value in sorted(inputs.items())],
                         'reason': 'Independent current criterion applicability; retained original source observation. ' + item['reason'],
                         'retained_observation': {'parent_context_sha256': plan['context_sha256'],
                             'json_pointer': '/invalidated_coverage/' + str(index),
                             'value_sha256': o._sha(o._canonical(original))},
                         'criterion_adoption': group['path'],
                         'criterion_control_inputs': [{'path': name, 'digest': value} for name, value in sorted(controls.items())]})
    return dict(assessment, coverage=rows), adoptions


def _compatible_finding_observations(prior, current):
    """A stable finding may have several actionable descriptions and locations."""
    prose = {'message', 'root_cause', 'reproduction', 'required_behavior',
             'recommendation', 'origin_reason', 'acceptance_checks'}
    required = prose | {'id', 'severity', 'origin', 'affected_paths', 'file', 'line'}
    if not all(required <= set(item) for item in (prior, current)):
        return False
    if any(not isinstance(item['affected_paths'], list) or not item['affected_paths']
           or item['file'] not in item['affected_paths']
           or not isinstance(item['line'], int) or item['line'] < 1 for item in (prior, current)):
        return False
    def technical_identity(item):
        return {key: sorted(value) if key == 'affected_paths' else value
                for key, value in item.items() if key not in prose | {'file', 'line'}}
    return technical_identity(prior) == technical_identity(current)


def _merge_observation_text(prior, current, fields):
    merged = copy.deepcopy(prior)
    for field in fields:
        if field == 'acceptance_checks':
            merged[field] = list(dict.fromkeys([*prior[field], *current[field]]))
        elif prior[field] != current[field]:
            merged[field] = prior[field] + '\n\n' + current[field]
    return merged


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
        result["command_coverage"] = copy.deepcopy(global_assessment.get("command_coverage", []))
        for identity, specialist in by_cohort.items():
            if identity != AREAS[0] and specialist.get("command_coverage"):
                errors.append(identity + ": required-command applicability belongs to the crosscutting assessor")
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
    result['criterion_adoptions'] = []
    for identity, assessment in list(by_cohort.items()):
        try:
            expanded, adoptions = _expanded_criteria(o, context, plan, assessment)
            by_cohort[identity] = expanded
            result['criterion_adoptions'].extend(adoptions)
        except (o.OracleApprovalError, KeyError, ValueError, TypeError) as exc:
            errors.append(identity + ': ' + str(exc))
            by_cohort[identity] = dict(assessment, coverage=[])
    for field, identity in (("coverage", "path"), ("validations", "evidence_path"), ("findings", "id"), ("resolutions", "id")):
        unique = {}
        for cohort_id, assessment in by_cohort.items():
            for item in assessment[field]:
                if field in {'findings', 'resolutions'}:
                    # Keep each role's exact statement alongside the canonical
                    # ledger entry, including compatible secondary locations.
                    result.setdefault(field[:-1] + '_observations', []).append({
                        'cohort_id': cohort_id, 'candidate_commit': plan['candidate_commit'],
                        'candidate_tree': plan['candidate_tree'],
                        'observation': copy.deepcopy(item)})
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
                    elif field == 'findings' and _compatible_finding_observations(prior, item):
                        unique[key] = _merge_observation_text(prior, item, {
                            'message', 'root_cause', 'reproduction', 'required_behavior',
                            'recommendation', 'origin_reason', 'acceptance_checks'})
                    elif field == 'resolutions' and prior.get('inputs') and (
                            {k: v for k, v in prior.items() if k != 'explanation'} ==
                            {k: v for k, v in item.items() if k != 'explanation'}):
                        unique[key] = _merge_observation_text(prior, item, {'explanation'})
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


def prepared_intake(o, root, context, plan, jobs, seals, evidence):
    """Seal coherent preparation facts, without deciding command applicability."""
    effective = _criterion_context(context, plan)
    missing = ["Source identity absent: " + name for name in plan["required_paths"]
               if name not in effective["input_hashes"]]
    observations, unavailable, matched_inputs = [], [], set()
    # Failed/older executions remain observations. Their actual applicability,
    # including strict original-plus-repair composition, belongs to the cohort.
    candidates = {row["evidence_path"] for key in ("current_validations", "reusable_validations", "invalid_current_validations")
                  for row in context.get(key, [])}
    current_proofs = {row["evidence_path"] for key in ("current_validations", "reusable_validations")
                      for row in context.get(key, [])}
    for name in sorted(candidates):
        if name not in evidence:
            continue
        raw = o._custody_read(root, name)[1]
        if o._sha(raw) != evidence[name]:
            missing.append("Original execution identity changed: " + name)
            continue
        value = json.loads(raw)
        if value.get("kind") != "oracle-validation-record-v1":
            continue
        outputs = value.get("output_hashes", {})
        try:
            available = isinstance(outputs, dict) and bool(outputs) and all(
                o._sha(o._custody_read(root, path)[1]) == digest for path, digest in outputs.items())
            reason = "Original execution output identity changed or absent"
        except (OSError, ValueError, TypeError, o.OracleApprovalError) as error:
            available, reason = False, str(error)
        if not available:
            unavailable.append({"path": name, "sha256": evidence[name],
                                "actual_exit_code": value.get("exit_code"),
                                "applicability": "INELIGIBLE; original output unavailable", "reason": reason})
            if name in current_proofs:
                missing.append("Current verified execution output changed or unavailable: " + name)
            continue
        observations.append({"path": name, "sha256": evidence[name], "command": value.get("command"),
                             "actual_exit_code": value.get("exit_code"), "applicability": "UNASSESSED"})
        matched_inputs.update(item["path"] for item in value.get("inputs", [])
                              if context["input_hashes"].get(item["path"]) == item.get("digest"))
    if context.get("required_commands") and not observations:
        missing.append("Required command assessment lacks bound original execution observations")
    affected = {name for name in set(context.get("changed_since_previous", [])) | set(context.get("pending_from_prior", []))
                if name.endswith((".py", ".mjs", ".js", ".ts"))}
    if context.get("required_commands"):
        missing.extend("Affected executable input lacks a matching original/repair observation: " + name
                       for name in sorted(affected - matched_inputs))
    for cohort, child in jobs:
        if o._files(root, list(seals[cohort["id"]])) != seals[cohort["id"]]:
            missing.append("Prepared source/manifest/audit changed: " + cohort["id"])
    payload = {"kind": "boc-review-structural-intake-v1", "candidate_commit": context["base_commit"],
               "candidate_tree": context["candidate_tree"], "plan_sha256": plan["plan_sha256"],
               "required_commands": context.get("required_commands", []), "original_observations": observations,
               "unavailable_original_observations": unavailable,
               "affected_executable_inputs": len(affected), "matched_affected_inputs": len(affected & matched_inputs),
               "missing": missing, "grants_coverage": False}
    o._atomic_write(o._RUN.get() / "structural-intake.json", o._pretty(payload))
    if missing:
        raise o.OracleIntakeIncomplete("Structural reviewer intake is incomplete: " + "; ".join(missing))
    controller = o._CONTROLLER.get()
    late = controller.evidence() if controller else []
    if late:
        raise o.OracleIntakeIncomplete("Queued evidence arrived during source preparation; rebind before workers",
                                      evidence_paths=late)


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
    effective_context = _criterion_context(context, plan)
    with o._phase("source_frontier_seconds"):
        source_snapshot = frontier.snapshot(o, root, effective_context, plan["required_paths"])
    caller = context.get('caller_evidence', {})
    caller_original = {'parent_context': str(context_path), 'parent_context_sha256': plan['context_sha256'],
        'digest_encoding': 'canonical-json-v1', 'json_pointer': '/caller_evidence',
        'value_sha256': digest(caller), 'navigation_only': True, 'eligibility': 'NONE'}
    caller_paged = len(_serialized(caller_navigation(caller, caller_original))) > RETAINED_NAVIGATION_MAX_BYTES
    governance, governance_manifest = governance_bundle(o, root, context)
    governance_path = run / "governance-bundle.txt"
    o._atomic_write(governance_path, governance)
    governance_manifest = dict(governance_manifest, path=str(governance_path))
    jobs, prepared_seals, source_prompts, original_packets = [], {}, {}, {}
    for cohort in plan["cohorts"]:
        child = o._metadata_run(root, run / "cohorts", cohort["id"] + "-")
        prepared, source_seal, source_prompt = frontier.prepare(o, root, effective_context, plan, cohort, child, source_snapshot)
        try:
            prepared_callers = None
            if caller_paged:
                prepared_callers, caller_seal = frontier.prepare_locator_collection(
                    o, root, child, caller_original, sorted(caller.items()))
                source_seal.update(caller_seal)
            child_context = packet(context, plan, cohort, context_path, digest, prepared, prepared_callers)
        except CohortPacketBudgetError as exc:
            raise o.OracleReviewIncomplete(str(exc)) from exc
        child_context["governance_bundle"] = governance_manifest
        child_context["checkpoint_journal"] = {"path": str(child / JOURNAL_NAME), "plan_sha256": plan["plan_sha256"]}
        # The governance and journal bindings join the sealed packet identity.
        child_context["packet_sha256"] = digest({key: value for key, value in child_context.items() if key != "packet_sha256"})
        original_packets[cohort['id']] = o._pretty(child_context)
        o._atomic_write(child / "cohort-context.json", original_packets[cohort['id']])
        o._atomic_write(child / "output.schema.json", o._pretty(output_schema(schema, plan, cohort, child_context)))
        source_seal.update(o._files(root, [str(child / "cohort-context.json"), str(child / "output.schema.json"),
                                           str(governance_path)]))
        prepared_seals[cohort['id']] = source_seal
        source_prompts[cohort['id']] = source_prompt
        jobs.append((cohort, child))
    seals_path = run / "prepared-source-seals.json"
    seals_raw = o._pretty(prepared_seals)
    o._atomic_write(seals_path, seals_raw)
    prepared_intake(o, root, context, plan, jobs, prepared_seals, evidence)
    started = time.monotonic()

    def worker(cohort, child):
        token = o._RUN.set(child)
        budget_token = o._DISPATCH_BUDGET.set({'context_path': child / 'cohort-context.json',
                                               'max_bytes': COHORT_PACKET_MAX_BYTES})
        start = time.monotonic() - started
        failure = None
        try:
            packet_sha256 = o._sha(o._custody_read(root, child / "cohort-context.json")[1])
            prompt = ("Assess only your immutable independent cohort assignment. Governing instructions first: the "
                      "<stdin> block carries the complete current bytes of " + ", ".join(GOVERNANCE_PATHS) +
                      ", each between exact path/sha256 headers, in precedence order, matching cohort-context.json "
                      "governance_bundle. They are the complete authoritative texts, not a summary; "
                      ".agents/skills/oracle/SKILL.md defines your isolated trusted approver role. Do not re-fetch these "
                      "documents with tools; read other referenced material in bounded slices. "
                      "The cohort context supplies exact source identities, scope and sealed historical references: "
                      + str(child / "cohort-context.json") + ". Return the supplied envelope echoing every binding. "
                      "Use existing finding IDs; for new findings use prefix " + cohort["new_finding_prefix"] +
                      ". The crosscutting cohort must independently cover its assigned integration concerns (cohort "
                      "integration_checks; retained concerns stay bound natively) over the complete candidate/publication "
                      "range, make the complete classification, and disposition every open prior finding. Other cohorts assess only "
                      "their assigned production/verification area; report local positive effects and use local absence defaults, following current "
                      "governing criteria. No serial final model or new reviewer is permitted. Checkpoint as you go: "
                      "append one JSON object per line to " + str(child / JOURNAL_NAME) + ", each with \"plan_sha256\": \""
                      + plan["plan_sha256"] + "\" and \"packet_sha256\": \"" + packet_sha256 + "\" plus either "
                      "{\"type\":\"coverage\",\"path\",\"inputs\",\"reason\"} for an assigned path finished with no finding "
                      "(inputs are the exact consumed {path,digest} identities and include the path), "
                      "{\"type\":\"finding\",\"finding\"} with the complete schema finding, "
                      "{\"type\":\"withdraw\",\"path\"} to retract an earlier clean row, or "
                      "{\"type\":\"integration\",\"concern\",\"status\",\"inputs\",\"reason\"} for a finished assigned concern. "
                      "The journal is retained only if you are interrupted; it never approves.")
            prompt += ("\nMechanically prepared immutable source pages follow. They provide navigation, grant no coverage or approval, "
                       "and preserve mandatory governing-original reads. Complete unit/page and original-source locators, budget gaps "
                       "and unresolved construction dependencies remain in source-frontier.json. Read remaining pages only as needed.\n"
                       + source_prompts[cohort['id']])
            if o._sha(o._custody_read(root, governance_path)[1]) != governance_manifest["sha256"]:
                raise o.OracleApprovalError("Sealed governance bundle changed before dispatch")
            envelope = o._review_process(root, prompt, "reviewer", schema_path=child / "output.schema.json",
                                         cohort_policy=COHORT_POLICY, stdin_payload=governance)
            return envelope
        except Exception as exc:
            failure = type(exc).__name__ + ": " + str(exc)
            raise
        finally:
            o._atomic_write(child / "cohort-timing.json", o._pretty({"cohort_id": cohort["id"],
                "started_offset_seconds": start, "finished_offset_seconds": time.monotonic() - started,
                "finished_at": datetime.now(timezone.utc).isoformat(), "error": failure}))
            o._RUN.reset(token)
            o._DISPATCH_BUDGET.reset(budget_token)

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
    # Publish safely assigned observations before any fallible shared preparation
    # read. This ERROR checkpoint grants no coverage or approval.
    pending_unadopted = {item['cohort_id']: item for item in unadopted}
    for cohort, child in jobs:
        if cohort['id'] in envelopes and cohort['id'] not in pending_unadopted:
            try:
                pending_unadopted[cohort['id']] = _unadopted_result(
                    o, root, child, plan_path, plan, cohort, context, original_packets[cohort['id']],
                    'Shared preparation reconciliation pending; original output remains unadopted')
            except (OSError, ValueError, KeyError, TypeError, o.OracleApprovalError) as recovery:
                failures.append(cohort['id'] + ': final output remains unavailable/unbound: ' + str(recovery))
    checkpoint = aggregate(o, plan, context, {}, [*failures, 'Shared preparation reconciliation pending'], root=root)
    checkpoint['unadopted_cohort_assessments'] = list(pending_unadopted.values())
    o._atomic_write(run / 'result.json', o._pretty(checkpoint))
    try:
        seal_manifest_current = o._custody_read(root, seals_path)[1] == seals_raw
    except (OSError, ValueError, o.OracleApprovalError):
        seal_manifest_current = False
    integrity_blocked = set()
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
            integrity_blocked.add(cohort['id'])
            envelopes.pop(cohort['id'], None)
            o._atomic_write(child / 'prepared-source-error.json', o._pretty({
                'cohort_id': cohort['id'], 'original_seal': expected,
                'eligibility': 'NONE', 'reason': 'Prepared material changed; no coverage from this cohort is admitted'}))
    try:
        shared_current = (json.loads(o._custody_read(root, plan_path)[1]) == plan and
                          digest(json.loads(o._custody_read(root, context_path)[1])) == plan['context_sha256'])
    except (OSError, ValueError, TypeError, o.OracleApprovalError):
        shared_current = False
    if not shared_current:
        reason = 'Shared preparation integrity failed; prepared partition plan or source context changed during assessment'
        failures.append(reason)
        envelopes.clear()
        integrity_blocked.update(cohort['id'] for cohort, _ in jobs)
        unadopted = list(pending_unadopted.values())
        for retained in unadopted:
            retained['prepared_integrity_error'] = reason
    result = aggregate(o, plan, context, envelopes, failures, root=root)
    if unadopted:
        result["unadopted_cohort_assessments"] = unadopted
    scope = integration_scope(context["candidate_tree"], context.get("publication_scope"),
                              context["required_coverage_paths"], context["input_hashes"], context.get("prior_findings", {}))
    reused = copy.deepcopy(context.get("reusable_integration", []))
    current = []
    cross = next((cohort for cohort, _ in jobs if cohort["id"] == AREAS[0]), None)
    if cross is not None and AREAS[0] in envelopes and isinstance(envelopes[AREAS[0]].get("integration"), list):
        current = [dict({key: row[key] for key in ("concern", "status", "inputs", "reason")}, scope=scope)
                   for row in envelopes[AREAS[0]]["integration"]
                   if isinstance(row, dict) and row.get("concern") in cross["integration_checks"]]
    # Interrupted cohorts keep only their exactly bound journal observations.
    result, recovered = recover_interrupted(o, result, jobs, plan, context, envelopes, original_packets,
                                            blocked=integrity_blocked)
    current += [dict(row, scope=scope) for row in recovered]
    result["integration_checkpoints"] = [*reused, *[row for row in current
                                                    if row["concern"] not in {item["concern"] for item in reused}]]
    if result.get("review_status") == "COMPLETE" and not integration_complete(reused, current):
        result.update(review_status="INCOMPLETE", verdict="INCOMPLETE",
                      limitations=[*result.get("limitations", []),
                                   "Integration concerns remain unfinished: " + ", ".join(
                                       name for name in INTEGRATION_CHECKS if name not in
                                       {row["concern"] for row in result["integration_checkpoints"]
                                        if row.get("status") in {"REVIEWED", "NOT_APPLICABLE"}})])
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
