#!/usr/bin/env python3
"""Issue and verify tree-bound Operations Center approvals."""
from __future__ import annotations
import argparse, ast, hashlib, json, os, re, stat, subprocess, sys, time, platform, shutil, shlex
from contextlib import contextmanager
from datetime import datetime, timezone
from contextvars import ContextVar
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Sequence
if __package__:
    from .codex_child_model import selected_model, selected_reasoning_effort
else:
    from codex_child_model import selected_model, selected_reasoning_effort

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_VERSION = 1
ADOPTION_BASE_COMMIT = "530b07932167318889b2d9491398847c9843dd9b"
ISSUER = "bos-operations-center-oracle-cli"
AUTHORITY_PATHS = ("AGENTS.md", ".agents/skills/oracle/SKILL.md")
TRAILER_KEYS = ("Oracle-Verdict", "Oracle-Reviewed-Tree", "Oracle-Receipt-SHA256")
VAULT_QUERY = "authentication recovery exact canonical condition codes Oracle approval shared product contract"
NORMAL_PLAN_REVIEW_POLICY = """Owner spending clarification, 2026-10-12:
Covered normal-plan operations, including Codex model calls and Oracle reviews
using included allowance, proceed automatically without spending-approval
questions or a separate $0 approval. A missing per-review price does not create
an approval gate for covered normal-plan usage. Explicit owner spending approval
remains required for additional monetary spending: paid API calls or credits
outside the normal plan, purchases, subscription changes, billable cloud work,
and persistent infrastructure costs. Unknown additional charges require a
defined spending limit; unavailable included allowance authorizes no automatic
paid fallback. Apply this clarification to generic paid-review wording in the
reviewer skill. Independent proposal, completed-diff, authentication and public
API-version review requirements remain in force."""
LOCAL_EXECUTION_POLICY = """Owner execution direction, 2026-10-14:
Run locally in the canonical checkout without OS sandbox restrictions. Keep
authored source, the Git candidate and approval records unchanged. Required
repository-owned indexing, semantic queries, tests and generated diagnostic/cache
writes are permitted. Preserve independent approval, all content bindings and
spending controls. This direction supersedes older read-only sandbox requirements.
"""
DEPLOYMENT_PLACEMENT_POLICY = """Controlling owner direction, 2026-10-18:
Technical proposals, completed reviews, commits and review-only source pushes
never require human deployment permission. Complete the independent technical
assessment and reject actual defects, custody failures and unrequested public
API versions. Missing deployment authority is not a technical defect. This
direction supersedes earlier permission placement in the approver skill and
other authorities; ordinary agents still never load or act as the approver.
Classify concrete protected publication effects separately: credential-trust,
permission-authority, tenant-isolation, or incompatible-public-contract changes.
Authentication impact, labels, filenames and ordinary compatible corrections
alone create no protected effect. Review the complete effective publication
baseline-to-candidate range, including earlier unpublished commits. Keep stable
effect IDs; removing an earlier active effect requires current source-bound
SUPERSEDED or REVERTED evidence. Technical APPROVED may carry MISSING or INVALID
owner status. That legacy status never grants publication authority. Only actual
product publication/deployment checks exact scoped authority, separately from
the immutable technical receipt. Later human evidence never rewrites that receipt.
When private historical receipts are unavailable, state their exact commit/tree
identities and independently assess the complete configured fetched published
baseline-to-candidate diff and effects. Seal this current full-range recovery
assessment; never invent historical decisions or block technical review for
missing deployment history. Missing published baseline limits publication until
fetch and a current full-range assessment; technical work remains available.
"""
LEAD_GRAPH_REVIEW = """For changes affecting CRM record lookup routing, skill composition, or graph presentation, explicitly inspect the recurring graph-omission history in Vault/docs/issues/ISSUE_HISTORY.md, Issue #0008, and the October 8 focused student-workflow exception in Issue #0026. Trace the shared source/platform/bos-mcp-client/references/record-journey-display.md contract through each applicable canonical and generated entrypoint. Require focused tests/lead-graph-regression.test.mjs evidence: a successful named lead/contact lookup retains its graph completion rule after a workspace clarification; available topology includes the current node and every intermediate node and edge to a resolved goal; the default view contains one compact preferred route, with a shortest structural fallback and full topology only on explicit request; a partial graph cites the exact missing read and preserves verified state without invented topology. Preserve app-ranking provenance, explicit shortest/text/full-graph requests, and focused student lookup/state-comparison scope. Reject a source candidate that removes this rule, crowds the default with off-route branches and loops, suppresses verified topology because actions/history are empty, or weakens these regressions. Require plain-text node and edge labels with diagram-native emphasis; reject added literal or escaped HTML formatting in labels and require the corresponding response regression cases. Require advertised native inline visualization tools to take priority over Mermaid, allow Mermaid only with established host rendering support, and reject ASCII routes or unrendered Mermaid as graph completion. Keep internal identifiers and unsolicited off-route explanations out of normal graph delivery. Require delivery-selector regressions against the Claude Code raw-code failure shape and generated-script behavior. Distinguish deterministic source/response-contract checks from observed published-client acceptance: synthetic responses and passing prose/reference checks cannot establish native prompt success. Keep the recurring incident open until version-bound published-client output proves both automatic graph completion and compact path presentation; normal source readiness may proceed with that acceptance explicitly pending."""

class OracleApprovalError(RuntimeError): pass
class OracleCandidateRejected(OracleApprovalError): pass
class OracleReviewIncomplete(OracleApprovalError): pass
class OracleSourceBindingError(OracleApprovalError): pass
class OracleIntakeIncomplete(OracleReviewIncomplete):
    """Structural preparation is missing; no independent assessment ran."""
    def __init__(self, message, *, evidence_paths=()):
        super().__init__(message)
        self.evidence_paths = list(evidence_paths)

REVIEWER_ROLE = """This process is the independent BOS Operations Center Oracle
subprocess designated by tools/oracle_approval.py, with the isolated approver
role. Load .agents/skills/oracle/SKILL.md and issue the independent assessment.
AGENTS.md's restriction against ordinary implementation, planning, readiness,
and release agents loading that skill continues to govern those ordinary agents;
this designated subprocess alone is the approver. Do not invoke the Oracle
launcher recursively, mutate authored source, stage, commit, deploy, or write an
approval receipt. Repository-owned diagnostic/index writes remain permitted.
Follow the launcher's content-bound review-series protocol and return its JSON
schema. Report unfinished assessment as INCOMPLETE and infrastructure failures
as ERROR; neither outcome establishes a candidate defect or grants approval.
The wrapper pre-verifies native validation records against current exact inputs,
environment and retained outputs. Its current_validations satisfy those checks:
use that proof without rerunning matching passing commands. A duplicate run
requires a concrete changed input or uncovered behavior, stated before execution
and in the result's validation reason or summary. Targeted diagnostic probes for
uncovered behavior remain available. Omitted validation entries never erase
wrapper-verified proof; explicit invalidation must explain the actual gap.
"""
REVIEW_SERIES_POLICY = """Trusted assessment execution policy:
Read governing instructions and review criteria first, before changes or results.
Read governing/document/source/diff/context bodies once per content identity and
reuse unchanged loaded bodies throughout this lifecycle. After governing criteria,
inspect bounded candidate changes, then retained validation results. Query compact
plan/context fields and bounded targeted slices. Avoid concatenating entire large
artifacts; choose output limits and batch sizes that prevent truncation and
repeated reads. Expand inspection only for a changed input or unresolved behavior.
For completed-candidate review, complete
one thorough pass per new commit/range across all changed paths,
relevant entry points, dependencies, failure paths and applicable authorities
before returning consolidated findings. Record unreviewed coverage explicitly;
an early blocker is no reason to stop scanning independent areas. Findings need
stable IDs, exact location, root cause, reproduction, required behavior,
recommendation, affected paths and acceptance checks so repairs can be made in
one batch. Preserve unresolved finding IDs and account for every one through an
open finding or hash-bound resolution evidence. Never treat omitted findings as
resolved. On follow-up or resume, confirm governing criteria first, then new commits,
then affected dependencies, unresolved findings and unfinished coverage. A global
mechanical guard invalidation alone requires no blanket source rescan or test
rerun. Independently compare current criteria, source hashes and dependencies to
sealed original observations, and explicitly re-attest unchanged applicable facts
with current coverage entries. Carry only eligible recorded coverage automatically;
historical observations support an independent current assessment. Recheck the complete current candidate's consistency and all
owner/authentication/public-version gates, and issue a fresh exact-tree verdict;
carried evidence never carries approval. Newly introduced defects remain in
scope. A newly discovered defect in unchanged previously reviewed code must be
classified MISSED with an explanation of the earlier coverage gap. When a
review cannot finish, retain reviewed checkpoints, limitations and partial
findings and return INCOMPLETE. Resume those checkpoints next round. After two
failed repair rounds, reconcile all unresolved findings into one concrete repair
plan before another repair submission. Review context identifies reusable and
invalidated coverage and validation, with exact reasons. Verify dependency
closure, configuration and environment before granting native validation reuse.
Missing proof requires INVALIDATED native status with the actual reason; it does
not erase the original result or itself justify executing the command again.
Original passing-case outputs can support unchanged behavior even when their
aggregate FAILED or ERROR, or their record is now strictly native-ineligible.
Preserve those statuses and limits; never relabel them as a passing native record.
A missing current green aggregate, a check outside the current focused capture,
or mechanical invalidation alone is no changed-input or uncovered-behavior reason.
Before every validation or diagnostic command, state the concrete changed
consumed input or uncovered behavior requiring it, and retain that reason in the
structured result's validation reason or summary. Run only the affected check.
Use compact projections and bounded source slices; open sealed originals only
for a specific unresolved fact. Checkpoint every fully assessed group before
optional discovery. Coverage dependencies must be actual input identities from
the current context; the context itself cannot be self-binding evidence.
Proposal review applies the same bounded evidence, complete assessment and
protected-change rules; completed-path coverage bookkeeping applies only to
completed-candidate review. Every current technical classification, public-version request, coverage,
native-validation eligibility and exact-candidate approval gate remains mandatory;
specific protected-publication authority is checked only at its actual effect. Historical evidence supplies no current approval.
Source work continues during and between assessments. Impose no source/file/line
lock, checkout freeze or work pause; include changes from every implementation.
Use path_dispositions, attempt_delta and cumulative_pending_since_verified to
separate actual movement since the prior attempt from coverage still awaiting
applicable verification. Compare content, mode/type, consumed dependencies and
criteria before deciding renewed examination; a mechanical guard change alone
does not require a blanket source rescan. unadopted_assessments preserves raw
native output and original statuses after execution/binding errors. It supplies
no verified coverage, resolved finding or approval. Independently inspect its
bounded comparisons and sealed origins, then adopt applicable facts only through
current REVIEWED entries. Explain adoption or inapplicability of relevant raw
findings. Omitted eligible verified coverage is retained automatically; explicit
UNREVIEWED dispositions override reuse. Tests remain distinct from source review.
"""

_RUN = ContextVar("oracle_run", default=None)
_CONTROLLER = ContextVar("oracle_controller", default=None)
_FOLLOW_COMMITS = ContextVar("oracle_follow_commits", default=False)
_PREPARED_SETTINGS = ContextVar("oracle_prepared_settings", default=None)
_DISPATCH_BUDGET = ContextVar("oracle_dispatch_budget", default=None)
_METADATA_ROOT = ContextVar("oracle_metadata_root", default=None)
_SCOPE_AUDIT = ContextVar("oracle_scope_audit", default=None)
LIVE_AUTHORITIES = (*AUTHORITY_PATHS, ".agents/skills/oracle/review-output.schema.json",
                    "Vault/docs/CONSTITUTION.md", "Vault/docs/architecture.md",
                    "Vault/docs/issues/ISSUE_HISTORY.md", "Vault/specs/oracle-and-vault.md")
CONTROLLING_AUTHORITIES = (*AUTHORITY_PATHS, ".agents/skills/oracle/review-output.schema.json",
                          "Vault/docs/CONSTITUTION.md")


def _declared_parent_authorities(root: Path, instructions: str | None = None) -> dict:
    # Ordinary local governance declares the family coordinator's canonical
    # governance. A referenced coordinator command is not a local authority;
    # bind its bytes only when explicitly consumed as evidence/execution input.
    if instructions is None:
        local = root / "AGENTS.md"
        instructions = _custody_read(root, local)[1].decode() if local.is_file() else ""
    declarations = re.findall(r"(/[^\s`\"<>]+/Vault/docs/architecture/bos-product-family\.md)", instructions)
    values = {}
    for declaration in declarations:
        family = Path(os.path.abspath(declaration))
        parent = family.parents[3]
        for path in (parent / "AGENTS.md", family):
            try:
                values[str(path)] = _custody_read(root, str(path))[0]["sha256"]
            except (OSError, OracleApprovalError):
                values[str(path)] = None
    return values


def _declared_parent_execution_inputs(root: Path, selected: Sequence[str]) -> dict:
    """Admit the exact declared coordinator executable only when consumed."""
    local = root / 'AGENTS.md'
    instructions = _custody_read(root, local)[1].decode() if local.is_file() else ''
    families = re.findall(r'(/[^\s`"<>]+/Vault/docs/architecture/bos-product-family\.md)', instructions)
    result = {}
    for name in families:
        command = Path(os.path.abspath(name)).parents[3] / 'tools/projects_oracle.py'
        if str(command) in instructions and str(command) in selected:
            try:
                result[str(command)] = 'sha256:' + _custody_read(root, command)[0]['sha256']
            except OSError:
                pass
    return result


def _controlling_authorities(values: dict) -> dict:
    return {**{name: values.get(name) for name in CONTROLLING_AUTHORITIES},
            **{name: digest for name, digest in values.items() if Path(name).is_absolute()}}


def _metadata_owner(function):
    @wraps(function)
    def wrapped(root: Path, *args, **kwargs):
        root = root.resolve()
        token = _METADATA_ROOT.set(root)
        try:
            return function(root, *args, **kwargs)
        finally:
            _METADATA_ROOT.reset(token)
    return wrapped


def _metadata_directory(root: Path, path: Path) -> dict:
    try:
        parts = path.relative_to(root.resolve()).parts
    except ValueError as exc:
        raise OracleApprovalError("Oracle metadata must stay in the owned private directory") from exc
    prefix = next((value for value in ((".git", "oracle"), ("Vault", "tmp"))
                   if parts[:len(value)] == value), None)
    if prefix is None:
        raise OracleApprovalError("Oracle metadata must stay in the owned private directory")
    return _owned_private_parent(root, path, prefix)


def _atomic_write(path: Path, raw: bytes) -> None:
    root = _METADATA_ROOT.get()
    if root is None:
        raise OracleApprovalError("Oracle metadata publication requires an explicit owner")
    _metadata_directory(root, path.parent)
    _private_witness_write(root, path, raw)


def _metadata_remove(root: Path, path: Path) -> None:
    _metadata_directory(root, path.parent)
    _private_witness_write(root, path, None)




def _metadata_run(root: Path, directory: Path, prefix: str) -> Path:
    _metadata_directory(root, directory)
    descriptor = _private_directory_fd(root, directory, (".git", "oracle"))
    name = prefix + os.urandom(16).hex()
    try:
        os.mkdir(name, 0o700, dir_fd=descriptor)
    finally:
        os.close(descriptor)
    return directory / name


@contextmanager
def _phase(phase: str):
    started = time.monotonic()
    failure = None
    try:
        yield
    except BaseException as exc:
        failure = exc
        raise
    finally:
        try:
            run = _RUN.get()
            if run:
                path = run / "timings.json"
                timings = json.loads(_custody_read(_METADATA_ROOT.get(), path)[1]) if path.exists() else {}
                timings[phase] = round(time.monotonic() - started, 6)
                _atomic_write(path, _pretty(timings))
        except Exception:
            if failure is None:
                raise


def _timed(phase: str, call):
    with _phase(phase):
        return call()


def _review_attempt(function):
    @wraps(function)
    @_metadata_owner
    def wrapped(root: Path, *args, **kwargs):
        directory = receipt_path(root).parent
        runs = directory / "runs"
        run = _metadata_run(root, runs, function.__name__ + "-")
        token = _RUN.set(run)
        controller = _CONTROLLER.get()
        if controller is not None:
            controller.progress = {"state": "REVIEW_IN_PROGRESS", "attempt": str(run)}
        started_at = datetime.now(timezone.utc).isoformat()
        result, failure = None, None
        proposal_before = None
        try:
            if function.__name__ == "review_proposal":
                proposal_before = {path: _custody_read(root, path)[1] if path.is_file() else None
                                   for path in (proposal_path(root), receipt_path(root))}
                for path, raw in proposal_before.items():
                    if raw is not None:
                        _atomic_write(run / ("previous-" + path.name), raw)
            result = _timed("total_seconds", lambda: function(root, *args, **kwargs))
            return result
        except BaseException as exc:
            failure = exc
            if function.__name__ == "issue":
                _revoke_published_review(root, run, exc)
            elif proposal_before is not None:
                _restore_failed_proposal(root, run, proposal_before)
            try:
                _atomic_write(run / "failure.json", _pretty({"error": str(exc)}))
            except OSError:
                pass
            raise
        finally:
            try:
                timings = json.loads(_custody_read(root, run / "timings.json")[1]) if (run / "timings.json").exists() else {}
                verdict = result.get("verdict") if isinstance(result, dict) else None
                review_status = result.get("review_status") if isinstance(result, dict) else None
                if verdict is None and (run / "result.json").exists():
                    try:
                        returned = json.loads(_custody_read(root, run / "result.json")[1])
                        verdict = returned.get("verdict")
                        review_status = returned.get("review_status")
                    except (ValueError, AttributeError):
                        pass
                _atomic_write(run / "outcome.json", _pretty({
                    "kind": function.__name__, "started_at": started_at,
                    "finished_at": datetime.now(timezone.utc).isoformat(),
                    "outcome": "INCOMPLETE" if isinstance(failure, OracleReviewIncomplete)
                               else "REJECTED" if isinstance(failure, OracleCandidateRejected)
                               else "ERROR" if failure is not None
                               else "INCOMPLETE" if review_status == "INCOMPLETE"
                               else "ERROR" if review_status == "ERROR"
                               else "REJECTED" if verdict == "REJECTED" else verdict or "COMPLETED",
                    "reviewer_verdict": verdict,
                    "reviewer_review_status": review_status,
                    "reviewer_invoked": any(key.endswith("reviewer_seconds") for key in timings),
                    "error": {"name": type(failure).__name__, "message": str(failure)} if failure else None,
                }))
            except Exception as exc:
                if failure is None:
                    if function.__name__ == "issue":
                        _revoke_published_review(root, run, exc)
                    elif proposal_before is not None:
                        _restore_failed_proposal(root, run, proposal_before)
                    try:
                        _atomic_write(run / "failure.json", _pretty({"error": str(exc)}))
                        _atomic_write(run / "outcome.json", _pretty({
                            "kind": function.__name__, "started_at": started_at,
                            "finished_at": datetime.now(timezone.utc).isoformat(), "outcome": "ERROR",
                            "reviewer_verdict": result.get("verdict") if isinstance(result, dict) else None,
                            "reviewer_review_status": result.get("review_status") if isinstance(result, dict) else None,
                            "error": {"name": type(exc).__name__, "message": str(exc)},
                        }))
                    except OSError:
                        pass
                    raise
            finally:
                _RUN.reset(token)
    return wrapped


def _serialized_review(function=None, *, request_binding=None, result_validator=None):
    if function is None:
        return lambda selected: _serialized_review(selected, request_binding=request_binding, result_validator=result_validator)
    attempt = _review_attempt(function)
    @wraps(function)
    @_metadata_owner
    def wrapped(root: Path, *args, **kwargs):
        if __package__:
            from . import oracle_lifecycle
        else:
            import oracle_lifecycle
        request = request_binding(root, *args, **kwargs) if request_binding else None
        result = oracle_lifecycle.run(sys.modules[__name__], root, function.__name__, attempt,
                                      args, kwargs, follow_commits=_FOLLOW_COMMITS.get(), request=request)
        if result_validator:
            if request_binding(root, *args, **kwargs) != request:
                raise OracleApprovalError("Scoped native authorization request changed during observation")
            result_validator(root, request, result)
        return result
    return wrapped


def _restore_failed_proposal(root: Path, run: Path, before: dict) -> None:
    prospective = run / "prospective-proposal.json"
    if not prospective.is_file():
        return  # No active publication was attempted.
    proposed = _custody_read(root, prospective)[1]
    for path, original in before.items():
        current = _custody_read(root, path)[1] if path.is_file() else None
        allowed = (original, proposed) if path == proposal_path(root) else (original, None)
        if current not in allowed:
            raise OracleApprovalError("Failed proposal publication has conflicting active custody")
    for path, original in before.items():
        current = _custody_read(root, path)[1] if path.is_file() else None
        if current == original:
            continue
        if original is None:
            _metadata_remove(root, path)
        else:
            _atomic_write(path, original)


def _live_authorities(root: Path) -> dict:
    # Hash bytes without loading approver instructions into an ordinary agent.
    return {**{name: _files(root, [name])[name] if (root / name).is_file() else None
               for name in LIVE_AUTHORITIES}, **_declared_parent_authorities(root)}


def _vault_sources(root: Path) -> dict:
    if not (root / "Vault").is_dir():
        return {}
    if __package__:
        from . import vault_index
    else:
        import vault_index
    previous_root, previous_vault = vault_index.PROJECT_ROOT, vault_index.VAULT_ROOT
    try:
        vault_index.PROJECT_ROOT, vault_index.VAULT_ROOT = root, root / "Vault"
        return _files(root, [str(path) for path in vault_index.iter_sources()])
    finally:
        vault_index.PROJECT_ROOT, vault_index.VAULT_ROOT = previous_root, previous_vault


def _review_settings_binding() -> dict:
    try:
        return {"model": selected_model(), "reasoning_effort": selected_reasoning_effort()}
    except (RuntimeError, ValueError) as exc:
        # Preserve a managed source checkpoint before the normal launcher
        # reports its structured configuration error; never select a fallback.
        return {"configuration_error": {"type": type(exc).__name__, "message": str(exc)}}


PROTECTED_EFFECT_KINDS = {"credential-trust", "permission-authority", "tenant-isolation", "incompatible-public-contract"}
PUBLICATION_REMOTE = "https://github.com/cody-marcel-dfsm/bos_operations_ceneter.git"


def _technical_archive(root: Path, digest: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise OracleApprovalError("Invalid technical receipt digest")
    return receipt_path(root).parent / "receipts" / (digest + ".json")


class _ScopeAudit:
    """One actual audit: immutable CL lookup plus fresh final custody checks."""
    def __init__(self, root):
        self.root = root
        self.directory = _git_file(root, "oracle/approval.json").parent
        self.files, self.inventories, self.series, self.archive, self.trees = {}, {}, {}, {}, {}
        self.head = _git(root, "rev-parse", "HEAD").strip()

    def read(self, path, *, allow_absent=False):
        name = _custody_name(self.root, path)
        if name not in self.files:
            self.files[name] = _custody_read(self.root, path, allow_absent=allow_absent)
        return self.files[name]

    def inventory(self, directory, pattern):
        key = (directory, pattern)
        if key not in self.inventories:
            self.inventories[key] = sorted(directory.glob(pattern))
        return self.inventories[key]

    def commit_tree(self, commit):
        if commit not in self.trees:
            self.trees[commit] = _git(self.root, "show", "-s", "--format=%T", commit).strip()
        return self.trees[commit]

    def receipts(self, commit, tree):
        for path in self.inventory(self.directory / "receipts", "*.json"):
            if path in self.archive:
                continue
            fact, raw = self.read(path, allow_absent=True)
            if fact["source"].get("links"):
                raise OracleApprovalError("Archived technical receipt has an invalid linked route")
            if not fact["source"].get("exists"):
                continue
            record = json.loads(raw)
            self.archive[path] = (record.get("base_commit"), record.get("candidate_tree"), fact, raw)
        return [(path, fact, raw) for path, (source, candidate, fact, raw) in self.archive.items()
                if source == commit and candidate == tree]

    def rounds(self, directory):
        self.series[directory] = _read_rounds_prefix(directory, self.series.get(directory, ()))
        return self.series[directory]

    def settled(self):
        changed = False
        # Every original byte and traversal is checked afresh, including contexts.
        for name, expected in list(self.files.items()):
            actual = _custody_read(self.root, name, allow_absent=True)
            if actual == expected:
                continue
            if not expected[0]["source"].get("exists") and actual[0]["source"].get("exists"):
                self.files[name] = actual
                changed = True
            else:
                raise OracleSourceBindingError("Immutable publication history bytes or custody changed: " + name)
        for (directory, pattern), before in list(self.inventories.items()):
            after = sorted(directory.glob(pattern))
            if not set(before) <= set(after):
                raise OracleSourceBindingError("Immutable publication history inventory lost records")
            if after != before:
                self.inventories[directory, pattern] = after
                changed = True
        if (_git_file(self.root, "oracle/approval.json").parent != self.directory
                or _git(self.root, "rev-parse", "HEAD").strip() != self.head):
            raise OracleSourceBindingError("Publication history source or metadata route changed")
        return not changed


def _scope_read(root, path, *, allow_absent=False):
    audit = _SCOPE_AUDIT.get()
    return audit.read(path, allow_absent=allow_absent) if audit is not None and audit.root == root else _custody_read(root, path, allow_absent=allow_absent)


def _publication_scope(root: Path, tree: str) -> dict:
    audit = _ScopeAudit(root)
    token = _SCOPE_AUDIT.set(audit)
    try:
        for _ in range(8):
            value = _publication_scope_current(root, tree)
            if audit.settled():
                return value
        raise OracleSourceBindingError("Publication history kept receiving new immutable suffixes")
    finally:
        _SCOPE_AUDIT.reset(token)


def _later_support_invalidation(original: dict, rounds: Sequence[dict], evidence: dict | None = None) -> str | None:
    """Use the same admitted per-receipt support rules as prepared currentness."""
    if __package__:
        from . import shipment_state
    else:
        import shipment_state
    support = shipment_state._receipt_support(original, evidence)
    for row in rounds:
        if (row["round"] <= original["round"] or row["base_commit"] != original["base_commit"]
                or row["candidate_tree"] != original["candidate_tree"]):
            continue
        review = row.get("review", {})
        if not row.get("assessment_admitted", not row.get("raw_assessment") and "error" not in review):
            continue
        defects, _, _ = shipment_state._decision_facts(row)
        if defects or review.get("publication_failure"):
            return "Established admitted same-candidate defect"
        reason = shipment_state._support_invalidation(support, row, shipment_state._receipt_support(row, {}))
        if reason:
            return reason
    return None


def _archived_origin(root: Path, receipt: dict) -> tuple[dict, list]:
    series = receipt_path(root).parent / "series"
    for name, digest in receipt["validation_evidence"].items():
        path = Path(name) if Path(name).is_absolute() else root / name
        if path.parent.parent != series or not re.fullmatch(r"round-[0-9]{4}\.json", path.name):
            continue
        rounds = _read_rounds(path.parent)
        try:
            origin = _receipt_origin(root, receipt, path.parent, rounds)
        except OracleApprovalError:
            continue
        if (_sha(_pretty(origin)) == digest and path.name == f"round-{origin['round']:04d}.json"
                and origin["review"].get("protected_effects") == receipt.get("protected_effects")):
            return origin, rounds
    raise OracleApprovalError("Archived receipt lacks its exact native approved origin")


def _committed_receipts(root: Path, commit: str) -> list[tuple[dict, bytes]]:
    """Discover exact committed decisions through immutable native provenance."""
    audit = _SCOPE_AUDIT.get()
    tree = audit.commit_tree(commit) if audit else _git(root, "show", "-s", "--format=%T", commit).strip()
    entries = audit.receipts(commit, tree) if audit else [
        (path, *_custody_read(root, path, allow_absent=True))
        for path in sorted((receipt_path(root).parent / "receipts").glob("*.json"))]
    selected = []
    for path, fact, raw in entries:
        if fact["source"].get("links"):
            raise OracleApprovalError("Archived technical receipt has an invalid linked route")
        if not fact["source"].get("exists"):
            continue
        receipt = json.loads(raw)
        if receipt.get("base_commit") != commit or receipt.get("candidate_tree") != tree:
            continue
        _shape(receipt)
        if raw != _pretty(receipt) or path.stem != _sha(raw):
            raise OracleApprovalError("Archived committed receipt changed")
        origin, rounds = _archived_origin(root, receipt)
        if not _later_support_invalidation(origin, rounds, receipt["validation_evidence"]):
            selected.append((receipt, raw))
    return selected


def _committed_effect_history(root: Path, commit: str) -> tuple[list, list]:
    """Retain known native effects even when their private receipt is absent.

    This registry supplies conservative history only; it never verifies approval.
    """
    prior, limitations = [], []
    directory = receipt_path(root).parent / "committed-history" / commit
    audit = _SCOPE_AUDIT.get()
    for path in audit.inventory(directory, "*.json") if audit else sorted(directory.glob("*.json")):
        raw = _scope_read(root, path)[1]
        record = json.loads(raw)
        body = {key: value for key, value in record.items() if key != "history_sha256"}
        round_path = root / record.get("round_file", "")
        if (raw != _pretty(record) or set(record) != {"kind", "commit", "tree", "receipt_sha256", "round_file", "round_sha256", "history_sha256"}
                or record["kind"] != "oracle-committed-history-v1" or record["commit"] != commit
                or record["tree"] != _git(root, "show", "-s", "--format=%T", commit).strip()
                or record["receipt_sha256"] != path.stem or not re.fullmatch(r"[0-9a-f]{64}", path.stem)
                or record["history_sha256"] != _sha(_canonical(body))
                or round_path.parent.parent != receipt_path(root).parent / "series"):
            raise OracleApprovalError("Committed effect history custody changed")
        rounds = _read_rounds(round_path.parent)
        match = next((row for row in rounds if _sha(_pretty(row)) == record["round_sha256"]
                      and round_path.name == f"round-{row['round']:04d}.json"), None)
        if (not match or match["outcome"] != "APPROVED" or match["base_commit"] != commit
                or match["candidate_tree"] != record["tree"] or match["review"].get("review_status") != "COMPLETE"):
            raise OracleApprovalError("Committed effect history lacks its sealed native origin")
        for effect in match["review"].get("protected_effects", {}).get("active", []):
            prior.append({"origin": path.stem, "effect": effect})
        fact, receipt_raw = _scope_read(root, _technical_archive(root, path.stem), allow_absent=True)
        if fact["source"].get("links"):
            raise OracleApprovalError("Archived technical receipt has an invalid linked route")
        if not fact["source"].get("exists"):
            limitations.append({"commit": commit, "tree": record["tree"], "receipt_sha256": path.stem,
                                "reason": "Private receipt unavailable; sealed native effect history retained and current complete range requires independent assessment"})
        elif _sha(receipt_raw) != path.stem:
            raise OracleApprovalError("Archived technical receipt changed")
    return prior, limitations


def _proposal_origin(root: Path, proposal: dict, candidate: str) -> str:
    origin = proposal.get("lifecycle_origin", proposal["base_commit"])
    path = receipt_path(root).parent / "lifecycle-origin.json"
    if os.path.lexists(path):
        raw = _custody_read(root, path)[1]
        record = json.loads(raw)
        body = {key: value for key, value in record.items() if key != "origin_sha256"}
        if (raw != _pretty(record) or set(record) != {"kind", "origin", "proposal_file", "proposal_sha256", "origin_sha256"}
                or record["kind"] != "oracle-lifecycle-origin-v1"
                or record["origin_sha256"] != _sha(_canonical(body))):
            raise OracleApprovalError("Immutable lifecycle origin custody changed")
        source = _custody_read(root, root / record["proposal_file"])[1]
        original = json.loads(source)
        original_body = {key: value for key, value in original.items() if key != "proposal_review_id"}
        if (record["proposal_sha256"] != _sha(source) or source != _pretty(original)
                or original.get("proposal_review_id") != _sha(_canonical(original_body))
                or original.get("review", {}).get("verdict") != "APPROVED"
                or record["origin"] != original.get("lifecycle_origin", original["base_commit"])):
            raise OracleApprovalError("Lifecycle origin lacks its immutable approved proposal")
        origin = record["origin"]
    if subprocess.run(["git", "merge-base", "--is-ancestor", origin, candidate],
                      cwd=root, capture_output=True).returncode:
        raise OracleApprovalError("Proposal lifecycle origin is outside the candidate history")
    return origin


def _record_lifecycle_origin(root: Path, raw: bytes) -> Path:
    proposal = json.loads(raw)
    origin = _proposal_origin(root, proposal, _git(root, "rev-parse", "HEAD").strip())
    path = receipt_path(root).parent / "lifecycle-origin.json"
    if not path.exists():
        archive = _archive_proposal(root, raw)
        body = {"kind": "oracle-lifecycle-origin-v1", "origin": origin,
                "proposal_file": str(archive.relative_to(root)), "proposal_sha256": _sha(raw)}
        _atomic_write(path, _pretty(dict(body, origin_sha256=_sha(_canonical(body)))))
    return path


def _publication_scope_current(root: Path, tree: str) -> dict:
    """The effective distributed source range, independent of the last commit."""
    base = _git(root, "rev-parse", "HEAD").strip()
    remote_url, target = None, None
    probe = subprocess.run(["git", "rev-parse", "--verify", "refs/remotes/origin/main^{commit}"],
                           cwd=root, capture_output=True, text=True)
    if probe.returncode == 0:
        base = probe.stdout.strip()
        remote_url = _git(root, "remote", "get-url", "origin").strip()
        target = "refs/heads/main"
        if subprocess.run(["git", "merge-base", "--is-ancestor", base, "HEAD"], cwd=root,
                          capture_output=True).returncode:
            raise OracleApprovalError("Integrate the publication baseline before technical review")
    else:
        # A sealed proposal establishes a technical range even before a fetched
        # publication baseline is available. The absent destination still holds delivery.
        try:
            proposal = verify_proposal(root)
            base = proposal["lifecycle_origin"]
        except (OSError, ValueError, KeyError, OracleApprovalError):
            pass
    prior, history_limitations = [], []
    for commit in _git(root, "rev-list", "--reverse", base + "..HEAD").splitlines():
        retained, unavailable = _committed_effect_history(root, commit)
        prior.extend(item for item in retained if item not in prior)
        history_limitations.extend(item for item in unavailable if item not in history_limitations)
        committed = _committed_receipts(root, commit)
        for receipt, raw in committed:
            for effect in receipt.get("protected_effects", {}).get("active", []):
                item = {"origin": _sha(raw), "effect": effect}
                if item not in prior:
                    prior.append(item)
        message = _git(root, "show", "-s", "--format=%B", commit)
        try:
            digest = _trailers(message)[TRAILER_KEYS[2]]
        except OracleApprovalError:
            continue  # The complete current range still requires independent coverage.
        path = _technical_archive(root, digest)
        fact, raw = _scope_read(root, path, allow_absent=True)
        if fact["source"].get("links"):
            raise OracleApprovalError("Archived technical receipt has an invalid linked route")
        if not fact["source"].get("exists"):
            history_limitations.append({"commit": commit, "tree": _git(root, "show", "-s", "--format=%T", commit).strip(), "receipt_sha256": digest,
                                        "reason": "Private historical receipt unavailable; complete current range requires independent technical assessment"})
            continue
        if _sha(raw) != digest:
            raise OracleApprovalError("Archived technical receipt changed")
        receipt = json.loads(raw)
        _shape(receipt)
        if receipt["candidate_tree"] != _git(root, "show", "-s", "--format=%T", commit).strip():
            raise OracleApprovalError("Archived effect receipt belongs to another source")
        for effect in receipt.get("protected_effects", {}).get("active", []):
            item = {"origin": digest, "effect": effect}
            if item not in prior:
                prior.append(item)
    return {"baseline_commit": base, "candidate_tree": tree, "remote_url": remote_url,
            "target_ref": target, "range_paths": _paths(root, base, tree),
            "range_sha256": _sha(_git_bytes(root, "diff", "--binary", "--full-index", base, tree)),
            "prior_effects": prior, "history_limitations": history_limitations}


def _protected_effects(review: dict, scope: dict, context: dict | None = None, *, native: bool = True) -> dict:
    value = review.get("protected_effects")
    if value is None and not native:
        value = {"active": [], "dispositions": []}  # Explicitly synthetic/legacy test reviewers.
    if not isinstance(value, dict) or set(value) != {"active", "dispositions"}:
        raise OracleApprovalError("Technical review lacks explicit protected-effect assessment")
    if not isinstance(value["active"], list) or not isinstance(value["dispositions"], list):
        raise OracleApprovalError("Invalid protected-effect assessment")
    identities = set()
    for effect in value["active"]:
        if (not isinstance(effect, dict) or set(effect) != {"id", "kind", "boundary", "description", "paths", "inputs"}
                or not re.fullmatch(r"[a-z][a-z0-9-]{0,95}", effect.get("id", ""))
                or effect["id"] in identities or effect["kind"] not in PROTECTED_EFFECT_KINDS
                or not all(isinstance(effect[key], str) and effect[key].strip() for key in ("boundary", "description"))
                or not isinstance(effect["paths"], list) or not effect["paths"]
                or not set(effect["paths"]).issubset(scope["range_paths"])):
            raise OracleApprovalError("Invalid concrete protected publication effect")
        identities.add(effect["id"])
        if context is not None:
            _checked_inputs(effect["inputs"], context)
            if not set(effect["paths"]).issubset({item["path"] for item in effect["inputs"]}):
                raise OracleApprovalError("Protected effect lacks its consumed source bindings")
    dispositions = {}
    for item in value["dispositions"]:
        if (not isinstance(item, dict) or set(item) != {"origin", "id", "status", "reason", "inputs"}
                or item["status"] not in {"SUPERSEDED", "REVERTED"} or not item["reason"].strip()
                or (item["origin"], item["id"]) in dispositions):
            raise OracleApprovalError("Invalid protected-effect disposition")
        if context is not None:
            _checked_inputs(item["inputs"], context)
        dispositions[item["origin"], item["id"]] = item
    prior_keys = {(item["origin"], item["effect"]["id"]) for item in scope["prior_effects"]}
    if not set(dispositions).issubset(prior_keys):
        raise OracleApprovalError("Protected-effect disposition has no original assessment")
    for origin, identity in prior_keys:
        if identity not in identities and (origin, identity) not in dispositions:
            raise OracleApprovalError("Earlier protected effect lacks current independent disposition")
    return value


def _input_binding(root: Path, evidence: dict, owner: dict | None) -> dict:
    untracked = [name for name in _git(root, "ls-files", "--others", "--exclude-standard").splitlines()
                 if not name.startswith("Vault/")]
    tools = [name for name in ("tools/oracle_approval.py", "tools/vault_index.py", "tools/codex_child_model.py")
             if (root / name).is_file()]
    sources = _vault_sources(root)
    return {"base_commit": _git(root, "rev-parse", "HEAD").strip(), "candidate_tree": _tree(root),
            "working_diff_sha256": _sha(_git_bytes(root, "diff", "HEAD", "--", ".", ":(exclude)Vault")),
            "untracked": _files(root, untracked), "authority_digests": _live_authorities(root),
            "vault_source_hashes": sources, "tool_digests": _files(root, tools),
            "environment_digest": _environment_digest(),
            "reviewer_settings": _review_settings_binding(),
            "publication_scope": _publication_scope(root, _tree(root)),
            "validation_evidence": _files(root, list(evidence)),
            "owner_approval_evidence": _files(root, list(owner)) if owner is not None else None,
            "route_custody": _custody_files(root, [*evidence, *(owner or {}), *tools, *untracked, *sources,
                                                   *[n for n, d in _live_authorities(root).items() if d is not None]])}


def _assert_binding(root: Path, expected: dict, evidence: dict, owner: dict | None, *, check_environment: bool = True) -> None:
    actual = _input_binding(root, evidence, owner)
    if not check_environment:
        actual = {key: value for key, value in actual.items() if key not in {"environment_digest", "reviewer_settings"}}
        expected = {key: value for key, value in expected.items() if key not in {"environment_digest", "reviewer_settings"}}
    if actual != expected:
        raise OracleSourceBindingError("Oracle review inputs changed during preparation or review")


def _dispatch_budget(command: Sequence[str], context_raw: bytes, schema_raw: bytes, maximum: int) -> dict:
    envelope = {'kind': 'boc-native-review-launch-input-v1', 'argv': list(command),
                'cohort_context_utf8': context_raw.decode('utf-8', errors='strict'),
                'output_schema_utf8': schema_raw.decode('utf-8', errors='strict')}
    raw = _pretty(envelope)
    return {'kind': 'boc-native-review-launch-budget-v1', 'serialized_bytes': len(raw),
            'maximum_bytes': maximum, 'within_budget': len(raw) <= maximum,
            'serialized_sha256': _sha(raw), 'argv_sha256': _sha(_canonical(list(command))),
            'context_sha256': _sha(context_raw), 'context_bytes': len(context_raw),
            'schema_sha256': _sha(schema_raw), 'schema_bytes': len(schema_raw)}


@_metadata_owner
def _review_process(root: Path, prompt: str, prefix: str, *, schema_path: Path | None = None,
                    cohort_policy: str | None = None) -> dict:
    run = _RUN.get()
    if run is None:
        raise OracleApprovalError("Independent Oracle must run under a native controller attempt")
    output = run / "result.json"
    schema_path = schema_path or root / ".agents/skills/oracle/review-output.schema.json"
    try:
        model, effort = selected_model(), selected_reasoning_effort()
    except (RuntimeError, ValueError) as exc:
        raise OracleApprovalError(
            f"Independent Oracle model resolution failed ({type(exc).__name__}): {exc}; "
            f"diagnostics retained at {run}"
        ) from exc
    expected_settings = _PREPARED_SETTINGS.get()
    if expected_settings is not None and expected_settings != {"model": model, "reasoning_effort": effort}:
        raise OracleApprovalError("Selected Oracle model/effort changed before launch")
    developer_instructions = "\n\n".join((REVIEWER_ROLE, NORMAL_PLAN_REVIEW_POLICY,
                                         LOCAL_EXECUTION_POLICY, REVIEW_SERIES_POLICY,
                                         DEPLOYMENT_PLACEMENT_POLICY))
    if cohort_policy is not None:
        developer_instructions += "\n\n" + cohort_policy
    metadata = {"selected_model": model, "reasoning_effort": effort,
                "sandbox": "danger-full-access", "ephemeral": True,
                "ignore_user_config": True,
                "reviewer_role": "independent-oracle-approver",
                "developer_instructions_sha256": _sha(developer_instructions.encode()),
                "schema_sha256": _custody_read(root, schema_path)[0]["sha256"],
                "model_helper_sha256": _custody_read(root, root / "tools/codex_child_model.py")[0]["sha256"]}
    _atomic_write(run / "model.json", _pretty(metadata))
    prompt += "\nReviewer process configuration:\n" + json.dumps(metadata, sort_keys=True)
    _atomic_write(run / "request.txt", prompt.encode())
    cmd = ["codex", "exec", "--ephemeral", "--ignore-user-config", "--model", model,
           "-c", "developer_instructions=" + json.dumps(developer_instructions),
           "--sandbox", "danger-full-access", "--cd", str(root), "--output-schema",
           str(schema_path),
           "--output-last-message", str(output), prompt]
    environment = {**os.environ, "CODEX_SELECTED_MODEL": model}
    if effort is not None:
        cmd[cmd.index("-c"):cmd.index("-c")] = ["-c", "model_reasoning_effort=" + json.dumps(effort)]
        environment["CODEX_SELECTED_REASONING_EFFORT"] = effort
    else:
        environment.pop("CODEX_SELECTED_REASONING_EFFORT", None)
    budget = _DISPATCH_BUDGET.get()
    if budget is not None:
        # Measure the actual complete native argv and artifact bytes after all
        # prompt/metadata/developer/schema wrapping and JSON string escaping.
        # This is an owner launch envelope, not a claim about provider wire bytes.
        context_raw = _custody_read(root, budget['context_path'])[1]
        schema_raw = _custody_read(root, schema_path)[1]
        measurement = _dispatch_budget(cmd, context_raw, schema_raw, budget['max_bytes'])
        _atomic_write(run / 'dispatch-budget.json', _pretty(measurement))
        if not measurement['within_budget']:
            raise OracleApprovalError('Complete serialized native review launch exceeds its bounded input budget')
    controller = _CONTROLLER.get()
    if controller is not None:
        if __package__:
            from . import oracle_lifecycle
        else:
            import oracle_lifecycle
        completed = _timed(prefix + "_seconds", lambda: oracle_lifecycle.reviewer_process(
            sys.modules[__name__], root, run, cmd, environment, controller))
    else:
        completed = _timed(prefix + "_seconds", lambda: subprocess.run(
            cmd, cwd=root, capture_output=True, text=True, env=environment))
    process_record = {"exit_code": completed.returncode}
    if hasattr(completed, "native_registration"):
        process_record["native_registration"] = completed.native_registration
    _atomic_write(run / "process.json", _pretty(process_record))
    _atomic_write(run / "stdout.log", completed.stdout.encode())
    _atomic_write(run / "stderr.log", completed.stderr.encode())
    if completed.returncode:
        raise OracleApprovalError("Independent Oracle process failed; diagnostics retained at " + str(run))
    try:
        return json.loads(_custody_read(root, output)[1])
    except (OSError, json.JSONDecodeError) as exc:
        raise OracleApprovalError("Independent Oracle returned invalid JSON; diagnostics retained at " + str(run)) from exc


def _git(root: Path, *args: str) -> str:
    p = subprocess.run(["git", *args], cwd=root, capture_output=True, text=True)
    if p.returncode: raise OracleApprovalError(p.stderr.strip() or "git command failed")
    return p.stdout

def _git_bytes(root: Path, *args: str) -> bytes:
    p = subprocess.run(["git", *args], cwd=root, capture_output=True)
    if p.returncode: raise OracleApprovalError(p.stderr.decode(errors="replace").strip() or "git command failed")
    return p.stdout

def repository_root(start: Path = ROOT) -> Path:
    return Path(_git(start, "rev-parse", "--show-toplevel").strip()).resolve()

def _git_file(root: Path, relative: str, common: bool = False) -> Path:
    directory = Path(_git(root, "rev-parse", "--git-common-dir" if common else "--git-dir").strip())
    return ((root / directory) if not directory.is_absolute() else directory).resolve() / relative

def receipt_path(root: Path) -> Path:
    audit = _SCOPE_AUDIT.get()
    return audit.directory / "approval.json" if audit is not None and audit.root == root else _git_file(root, "oracle/approval.json")
def proposal_path(root: Path) -> Path: return _git_file(root, "oracle/proposal.json")
def _sha(value: bytes) -> str: return hashlib.sha256(value).hexdigest()
def _canonical(value: dict[str, Any]) -> bytes: return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
def _pretty(value: dict[str, Any]) -> bytes: return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n").encode()
def _tree(root: Path) -> str: return _git(root, "write-tree").strip()
def _paths(root: Path, base: str, tree: str) -> list[str]:
    return sorted(_git(root, "diff", "--name-only", "--diff-filter=ACMRTD", base, tree).splitlines())

def _authorities(root: Path, tree: str) -> dict[str, str]:
    result = {}
    for path in AUTHORITY_PATHS:
        value = subprocess.run(["git", "show", f"{tree}:{path}"], cwd=root, capture_output=True)
        if value.returncode: raise OracleApprovalError(f"Oracle authority is missing: {path}")
        result[path] = _sha(value.stdout)
    instructions = _git_bytes(root, "show", f"{tree}:AGENTS.md").decode()
    external = _declared_parent_authorities(root, instructions)
    if any(digest is None for digest in external.values()):
        raise OracleApprovalError("A required declared parent authority is unavailable")
    return {**result, **external}

def _files(root: Path, values: Sequence[str]) -> dict[str, str]:
    result = {}
    for value in values:
        name = _custody_name(root, value)
        result[name] = _custody_read(root, name)[0]["sha256"]
    return result


def _custody_name(root: Path, value: str | Path) -> str:
    """Keep the requested lexical route; resolving it would erase its custody."""
    path = os.fspath(value)
    if not os.path.isabs(path):
        path = os.path.join(str(root), path)
    owner = str(root.resolve())
    prefix = owner.rstrip(os.sep) + os.sep
    return path[len(prefix):].lstrip(os.sep) if path.startswith(prefix) else "." if path == owner else path


def _custody_read(root: Path, value: str | Path, *, content: bool = True,
                  allow_absent: bool = False) -> tuple[dict, bytes]:
    name = _custody_name(root, value)
    path = Path(name)
    # Explicit external evidence/executables remain supported. Own routes
    # must stay beneath the owner at every hop, including private .git evidence.
    anchor, relative = root, name
    if path.is_absolute():
        anchor = Path(path.anchor)
        instructions = []
        _owner_source_walk(root, "AGENTS.md", content=True, data=instructions)
        for family in re.findall(r"(/[^\s`\"<>]+/Vault/docs/architecture/bos-product-family\.md)",
                                 b"".join(instructions).decode()):
            parent = Path(family).parents[3]
            if path in (parent / "AGENTS.md", Path(family), parent / "tools/projects_oracle.py"):
                anchor = parent
                break
        relative = name[len(str(anchor).rstrip(os.sep) + os.sep):]
    blocks = []
    fact = _owner_source_walk(anchor, relative, content=content, allow_git=True, data=blocks, custody=True)
    target = fact.get("target", fact)
    if allow_absent and not target.get("exists"):
        return {"path": name, "source": fact}, b""
    if not target.get("exists") or target.get("kind") != "file":
        raise OracleApprovalError("Oracle evidence is not a regular file: " + name)
    return {"path": name, "source": fact, **({"sha256": target["sha256"]} if content else {})}, b"".join(blocks)


def _custody_files(root: Path, values: Sequence[str], *, content: bool = True, allow_absent: bool = False) -> dict:
    return {_custody_name(root, name): _custody_read(root, name, content=content,
                                                  allow_absent=allow_absent)[0] for name in values}


def _execution_index(root: Path, fact: dict) -> dict | None:
    if Path(fact["path"]).is_absolute():
        return None
    target = fact["source"]["resolved_path"]
    entries = _git(root, "ls-files", "--stage", "--", target).splitlines()
    if not entries:
        return None
    if len(entries) != 1 or _git(root, "diff", "--name-only", "--", target).strip():
        raise OracleApprovalError("Stage the resolved validation executable before capture or reuse")
    mode, oid, stage = entries[0].split("\t", 1)[0].split()
    if stage != "0" or mode not in {"100644", "100755"}:
        raise OracleApprovalError("Validation executable has an invalid Git mode/type")
    return {"path": target, "mode": mode, "object": oid}


def _execution_custody(root: Path, command: Sequence[str], environment: dict) -> list:
    """Bind PATH selection, script interpreter chains and explicitly named tools."""
    result, pending = [], [command[0]]
    while pending:
        token = pending.pop(0)
        if len(result) >= 8:
            raise OracleApprovalError("Validation interpreter chain exceeds its bound")
        resolved = (os.path.join(str(root), token) if "/" in token and not Path(token).is_absolute() else token)
        if "/" not in resolved:
            search = os.pathsep.join(os.path.join(str(root), entry) if not Path(entry).is_absolute() else entry
                                     for entry in environment.get("PATH", os.defpath).split(os.pathsep))
            resolved = shutil.which(resolved, path=search)
        if not resolved:
            raise OracleApprovalError("Validation command executable is unavailable")
        fact, raw = _custody_read(root, resolved)
        if not os.access(resolved, os.X_OK):
            raise OracleApprovalError("Validation command executable lacks execute permission")
        result.append({"token": token, "resolved": _custody_name(root, resolved), "custody": fact,
                       "index_input": _execution_index(root, fact)})
        if raw.startswith(b"#!"):
            interpreter = shlex.split(raw.split(b"\n", 1)[0][2:].decode())
            if not interpreter:
                raise OracleApprovalError("Validation script interpreter is unavailable")
            pending.append(interpreter[0])
            if Path(interpreter[0]).name == "env":
                if len(interpreter) != 2 or interpreter[1].startswith("-"):
                    raise OracleApprovalError("Validation env interpreter requires an explicit simple executable")
                pending.append(interpreter[1])
    return result


def _private_directory_fd(root: Path, path: Path, prefix: tuple[str, ...], *, ancestor=False) -> int:
    """Return only a checked descriptor within the declared private namespace."""
    descriptor = []
    fact = _owner_source_walk(root, _custody_name(root, path), content=False,
                              allow_git=True, directory_fd=descriptor, custody=True)
    if not descriptor:
        raise OracleApprovalError("Private directory is unavailable")
    resolved = Path(fact["resolved_path"]).parts
    length = min(len(resolved), len(prefix)) if ancestor else len(prefix)
    if resolved[:length] != prefix[:length]:
        os.close(descriptor[0])
        raise OracleApprovalError("Private directory left its admitted namespace")
    return descriptor[0]


def _private_witness_write(root: Path, path: Path, raw: bytes | None) -> None:
    """Publish through the already checked owned directory descriptor."""
    parts = path.relative_to(root.resolve()).parts
    prefix = parts[:2]
    if prefix not in ((".git", "oracle"), ("Vault", "tmp")):
        raise OracleApprovalError("Private publication is outside its admitted namespace")
    directory = _private_directory_fd(root, path.parent, prefix)
    temporary = ".oracle-witness-" + os.urandom(16).hex()
    try:
        try:
            current = os.stat(path.name, dir_fd=directory, follow_symlinks=False)
            if not stat.S_ISREG(current.st_mode):
                raise OracleApprovalError("Private witness destination is not a regular file")
        except FileNotFoundError:
            pass
        if raw is None:
            try: os.unlink(path.name, dir_fd=directory)
            except FileNotFoundError: pass
            return
        file = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=directory)
        with os.fdopen(file, "wb") as output:
            os.fchmod(output.fileno(), 0o600)
            output.write(raw); output.flush(); os.fsync(output.fileno())
        os.replace(temporary, path.name, src_dir_fd=directory, dst_dir_fd=directory)
    finally:
        try: os.unlink(temporary, dir_fd=directory)
        except FileNotFoundError: pass
        os.close(directory)


def _owned_private_parent(root: Path, path: Path, prefix: tuple[str, ...]) -> dict:
    """Admit the private namespace before any directory creation."""
    parts = path.relative_to(root.resolve()).parts
    initial = _owner_source_walk(root, _custody_name(root, path), content=False, allow_git=True, custody=True)
    if not initial.get("target", initial).get("exists") and ".." in initial["resolved_path"].split("/"):
        raise OracleApprovalError("Private directory requires an existing ancestor before parent traversal")
    for count in range(1, len(parts) + 1):
        name = "/".join(parts[:count])
        fact = _owner_source_walk(root, name, content=False, allow_git=True, custody=True)
        resolved = Path(fact.get("resolved_path", name)).parts
        if resolved[:min(len(resolved), len(prefix))] != prefix[:min(len(resolved), len(prefix))]:
            raise OracleApprovalError("Private directory left its admitted namespace")
        target = fact.get("target", fact)
        if target.get("exists") and target.get("kind") != "directory":
            raise OracleApprovalError("Private destination parent is not a directory")
        if not fact.get("exists"):
            descriptor = _private_directory_fd(root, root.joinpath(*parts[:count - 1]), prefix, ancestor=True)
            try:
                try:
                    os.mkdir(parts[count - 1], 0o700, dir_fd=descriptor)
                except FileExistsError:
                    pass  # Concurrent native admission; the full route is rechecked below.
            finally:
                os.close(descriptor)
    fact = _owner_source_walk(root, "/".join(parts), content=False, allow_git=True, custody=True)
    target = fact.get("target", fact)
    resolved = fact.get("resolved_path", "/".join(parts))
    if target.get("kind") != "directory" or Path(resolved).parts[:len(prefix)] != prefix:
        raise OracleApprovalError("Private directory left its admitted namespace")
    return fact


def _private_witness_parent(root: Path, path: Path) -> dict:
    return _owned_private_parent(root, path, ("Vault", "tmp"))


def _candidate_inputs(root: Path, tree: str, evidence: dict) -> dict:
    """Bind tracked bytes/modes with Git objects; private inputs use SHA-256."""
    inputs = {}
    algorithm = _git(root, "rev-parse", "--show-object-format").strip()
    for entry in _git_bytes(root, "ls-tree", "-r", "-z", tree).split(b"\0"):
        if not entry:
            continue
        metadata, name = entry.split(b"\t", 1)
        mode, kind, oid = metadata.decode().split()
        inputs[os.fsdecode(name)] = f"git-{algorithm}:{mode}:{kind}:{oid}"
    for name, digest in {**_vault_sources(root), **evidence, **_declared_parent_authorities(root)}.items():
        inputs.setdefault(name, "sha256:" + digest if digest is not None else None)
    consumed_names = set()
    for name in evidence:
        if Path(name).suffix != '.json':
            continue
        try:
            record = json.loads(_custody_read(root, name)[1])
        except (OSError, ValueError):
            continue
        if not isinstance(record, dict) or record.get('kind') != 'oracle-validation-record-v1':
            continue
        for item in record.get('inputs', []):
            if isinstance(item, dict) and isinstance(item.get('path'), str):
                consumed_names.add(item['path'])
    if consumed_names:
        inputs.update(_declared_parent_execution_inputs(root, sorted(consumed_names)))
    return inputs


VALIDATION_ENVIRONMENT_KEYS = ("PATH", "PYTHONPATH", "VIRTUAL_ENV", "NODE_OPTIONS", "NODE_ENV", "TZ", "LANG", "LC_ALL")
REVIEW_POLICY_NAMES = ("REVIEWER_ROLE", "REVIEW_SERIES_POLICY", "NORMAL_PLAN_REVIEW_POLICY", "LOCAL_EXECUTION_POLICY", "LEAD_GRAPH_REVIEW")


def _validation_environment(extra_keys: Sequence[str] = ()) -> tuple[dict, dict, list]:
    if any(not isinstance(key, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key) for key in extra_keys):
        raise OracleApprovalError("Validation environment inputs require variable names")
    extras = sorted(set(extra_keys) - set(VALIDATION_ENVIRONMENT_KEYS))
    keys = sorted(set(VALIDATION_ENVIRONMENT_KEYS) | set(extras))
    effective = {key: os.environ[key] for key in keys if key in os.environ}
    fingerprints = {key: _sha(effective[key].encode()) if key in effective else None for key in keys}
    return effective, fingerprints, extras


REVIEW_POLICY_MODULES = ("tools/oracle_approval.py", "tools/codex_child_model.py", "tools/vault_index.py",
                         "tools/publication_admission.py", "tools/shipment_state.py", "tools/publication_status.py",
                         "tools/oracle_parallel.py", "tools/oracle_source_frontier.py", "tools/oracle_lifecycle.py",
                         "tools/command_coverage.py")


def _review_policy_sources(root: Path, tree: str | None = None) -> dict:
    """Bind the complete local governance/emission closure without interpreting it.

    Ordered AST includes every declaration, alias, mutation, invocation, import
    and default capture. Git mode and live executable mode are also controlling.
    Comments and source coordinates do not change executed policy.
    """
    result = {}
    for name in REVIEW_POLICY_MODULES:
        if tree:
            entry = _git_bytes(root, "ls-tree", "-z", tree, "--", name).split(b"\0")[0]
            metadata, actual_name = entry.split(b"\t", 1)
            mode, kind, _ = metadata.decode().split()
            if os.fsdecode(actual_name) != name or kind != "blob" or mode not in {"100644", "100755"}:
                raise ValueError("Unavailable original reviewer module")
            source = _git_bytes(root, "show", f"{tree}:{name}")
        else:
            path = Path(__file__).parent / Path(name).name
            if path.is_symlink() or not path.is_file():
                raise ValueError("Unavailable live reviewer module")
            fact, source = _custody_read(root, str(path))
            mode = "100755" if int(fact["source"]["mode"], 8) & 0o111 else "100644"
        result[name] = {"mode": mode, "ast": ast.dump(ast.parse(source), include_attributes=False)}
    return result


def _review_policy_digest(root: Path, tree: str | None = None, *, version: int = 4) -> str | None:
    try:
        modules = _review_policy_sources(root, tree)
        if version == 4:
            return _sha(_canonical({"version": version, "modules": modules}))
        # Earlier literal/builder formats are recognition only. Their digest
        # never establishes equivalence without the complete original closure.
        # The obsolete provider grammar (v3) grants no opaque equivalence.
        if version not in {1, 2}:
            return None
        source = _git_bytes(root, "show", f"{tree}:tools/oracle_approval.py") if tree else _custody_read(root, __file__)[1]
        module = ast.parse(source)
        values, prompts, builders = {}, {}, {}
        for node in module.body:
            if isinstance(node, ast.Assign):
                for target in node.targets:
                    if isinstance(target, ast.Name) and target.id in REVIEW_POLICY_NAMES:
                        if target.id in values:
                            raise ValueError("Ambiguous legacy constant")
                        values[target.id] = ast.literal_eval(node.value)
            if not isinstance(node, ast.FunctionDef):
                continue
            if node.name in {"_oracle", "_proposal_oracle"}:
                for statement in node.body:
                    if isinstance(statement, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "prompt" for target in statement.targets):
                        fragments = statement.value.values if isinstance(statement.value, ast.JoinedStr) else [statement.value]
                        prompts[node.name] = [item.value for item in fragments if isinstance(item, ast.Constant) and isinstance(item.value, str)]
            if node.name in {"_oracle", "_proposal_oracle", "_review_process"}:
                if node.name in builders:
                    raise ValueError("Ambiguous legacy builder")
                builders[node.name] = [ast.dump(node, include_attributes=False)]
        if (set(values) != set(REVIEW_POLICY_NAMES) or any(not isinstance(value, str) for value in values.values())
                or set(prompts) != {"_oracle", "_proposal_oracle"} or not all(prompts.values())
                or set(builders) != {"_oracle", "_proposal_oracle", "_review_process"}):
            return None
        payload = {"constants": values, "prompt_literals": prompts} if version == 1 else {
            "version": version, "constants": values, "emitted_policy_builders": builders}
        return _sha(_canonical(payload))
    except (OSError, OracleApprovalError, SyntaxError, ValueError, TypeError) as exc:
        if tree is None:
            raise OracleApprovalError("Current reviewer policy cannot be bound") from exc
        return None


def _historical_policy_guard(root: Path, tree: str, stored: str | None) -> str | None:
    full = _review_policy_digest(root, tree)
    if full is None:
        return None
    if stored is None or stored == full:
        return full
    for version in (1, 2):
        legacy = _review_policy_digest(root, tree, version=version)
        if legacy is not None and stored == legacy:
            return full
    # An unknown/opaque stored digest cannot substitute for verified original
    # construction, even if it happens to equal the current policy digest.
    return None


def _environment_digest() -> str:
    # Values are hashed, so evidence does not expose environment secrets.
    keys = VALIDATION_ENVIRONMENT_KEYS
    runtimes = {}
    for executable in ("node", "npm"):
        try:
            result = subprocess.run([executable, "--version"], capture_output=True, text=True)
            runtimes[executable] = (result.returncode, result.stdout.strip())
        except OSError:
            runtimes[executable] = None
    return _sha(_canonical({"platform": platform.platform(), "python": sys.version,
                            "runtimes": runtimes,
                            "environment": {key: _sha(os.environ.get(key, "").encode()) for key in keys}}))


def _series_directory(root: Path, base: str) -> Path:
    # Repair commits move HEAD while the same sealed proposal owns the lifecycle.
    if os.path.lexists(receipt_path(root).parent / "lifecycle-origin.json"):
        origin = _proposal_origin(root, {"base_commit": base}, base)
        identity = _sha(_canonical({"repository": str(root.resolve()), "base_commit": origin}))[:24]
        return receipt_path(root).parent / "series" / identity
    try:
        raw = _custody_read(root, proposal_path(root))[1]
        proposal = json.loads(raw)
        body = {key: value for key, value in proposal.items() if key != "proposal_review_id"}
        if (raw == _pretty(proposal) and proposal["proposal_review_id"] == _sha(_canonical(body))
                and proposal["review"]["verdict"] == "APPROVED"
                and not proposal["review"].get("findings")
                and subprocess.run(["git", "merge-base", "--is-ancestor", proposal["base_commit"], base],
                                   cwd=root, capture_output=True).returncode == 0):
            base = _proposal_origin(root, proposal, base)
    except (OSError, ValueError, KeyError, TypeError, OracleApprovalError):
        pass
    identity = _sha(_canonical({"repository": str(root.resolve()), "base_commit": base}))[:24]
    return receipt_path(root).parent / "series" / identity


def _read_rounds(directory: Path) -> list[dict]:
    audit = _SCOPE_AUDIT.get()
    if audit is not None and directory.parents[3] == audit.root:
        return audit.rounds(directory)
    return _read_rounds_prefix(directory)


def _read_rounds_prefix(directory: Path, prefix: Sequence[dict] = ()) -> list[dict]:
    records = list(prefix)
    predecessor = records[-1]["record_sha256"] if records else None
    root = directory.parents[3]
    audit = _SCOPE_AUDIT.get()
    paths = audit.inventory(directory, "round-*.json") if audit else sorted(directory.glob("round-*.json"))
    if [path.name for path in paths[:len(records)]] != [f"round-{index:04d}.json" for index in range(1, len(records) + 1)]:
        raise OracleApprovalError("Oracle review history prefix changed")
    for index, path in enumerate(paths[len(records):], len(records) + 1):
        try:
            raw = _scope_read(root, str(path))[1]; record = json.loads(raw)
            payload = {key: value for key, value in record.items() if key != "record_sha256"}
            valid = (path.name == f"round-{index:04d}.json" and raw == _pretty(record)
                     and record["round"] == index and record["previous_record_sha256"] == predecessor
                     and record["record_sha256"] == _sha(_canonical(payload)))
            context = json.loads(_scope_read(root, record["context_file"])[1])
            valid = valid and record["context_sha256"] == _sha(_canonical(context))
            valid = valid and all(record[key] == context[key] for key in
                                  ("series_id", "round", "mode", "base_commit", "candidate_tree", "guards", "previous_record_sha256"))
            if record.get("repair_plan_file"):
                valid = valid and _scope_read(root, record["repair_plan_file"])[0]["sha256"] == record["repair_plan_sha256"]
        except (OSError, ValueError, KeyError, AttributeError, TypeError) as exc:
            raise OracleApprovalError("Oracle review history is malformed: " + str(path)) from exc
        if not valid:
            raise OracleApprovalError("Oracle review history binding is invalid: " + str(path))
        predecessor = record["record_sha256"]; records.append(record)
    return records


def _coverage_checkpoints(rounds: list[dict]) -> list[tuple[dict, dict]]:
    checkpoints = {}
    for record in rounds:
        review = record.get("review", {})
        admitted = record.get("assessment_admitted", not record.get("raw_assessment") and "error" not in review)
        blocked = {}
        if admitted:
            blocked = {item["path"]: "Explicit affected source assessment: " + item.get("reason", "UNREVIEWED")
                       for item in review.get("coverage", []) if item.get("status") == "UNREVIEWED"}
            invalid = {item["evidence_path"]: item.get("reason", "Supporting validation invalidated")
                       for item in review.get("validations", []) if item.get("status") == "INVALIDATED"}
            for name, (item, origin) in list(checkpoints.items()):
                reasons = ([blocked[name]] if name in blocked else []) + [
                    "Original supporting validation invalidated: " + invalid[entry["path"]]
                    for entry in [*item["inputs"], *item.get('criterion_control_inputs', [])]
                    if entry["path"] in invalid]
                if reasons:
                    checkpoints[name] = (dict(item, checkpoint_invalidation_reasons=list(dict.fromkeys([
                        *item.get("checkpoint_invalidation_reasons", []), *reasons]))), origin)
        # A later execution/structural outcome is not an observation of every
        # previously assessed file. Retain each original and update only actual
        # completed observations; explicit per-path invalidations stay visible.
        for item in record.get("verified_coverage", []):
            if item["path"] not in blocked:
                checkpoints[item["path"]] = (item, record)
    return list(checkpoints.values())


def _observation_guard_changes(root: Path, guards: dict, prior: dict, *, validation=False) -> list[str]:
    previous = dict(prior["guards"])
    previous["review_policy_digest"] = _historical_policy_guard(
        root, prior["candidate_tree"], previous.get("review_policy_digest"))
    changes = []
    for key, value in guards.items():
        if value == previous.get(key):
            continue
        if key == "owner_approval_evidence" and (validation or previous.get(key) is None and value is not None):
            # Added authorization cannot change already assessed behavior.
            # Tests bind authority only through their actual selected inputs.
            continue
        changes.append(key)
    return changes


class _CriterionLineage:
    """Recover native criterion controls separately from observed dependencies."""
    def __init__(self, root, rounds):
        self.root = root
        self.records = {row['context_sha256']: row for row in rounds}
        self.contexts, self.adoptions, self.resolved = {}, {}, {}

    def _origin(self, identity):
        if identity in self.adoptions:
            return self.contexts[identity], self.adoptions[identity]
        record = self.records[identity]
        if _historical_policy_guard(self.root, record['candidate_tree'],
                                    record['guards'].get('review_policy_digest')) is None:
            raise ValueError('Unknown original criterion policy')
        context = json.loads(_scope_read(self.root, record['context_file'])[1])
        if _sha(_canonical(context)) != identity:
            raise ValueError('Original criterion context changed')
        raw = record.get('raw_assessment')
        assessment = raw.get('assessment', {}) if isinstance(raw, dict) else record.get('review', {})
        adopted = {}
        for row in assessment.get('criterion_adoptions', []):
            indices = row['original_coverage_indices']
            members = [context['invalidated_coverage'][index] for index in indices]
            if (row['parent_context_sha256'] != identity or row['status'] != 'REVIEWED'
                    or not indices or len(set(indices)) != len(indices)
                    or _sha(_canonical(members)) != row['members_sha256']):
                continue
            adopted[row['criterion']] = row
        self.contexts[identity], self.adoptions[identity] = context, adopted
        return context, adopted

    def support(self, item, origin=None, visiting=frozenset()):
        """Only authenticated native expansion can identify injected controls."""
        if not item.get('criterion_adoption') or not item.get('retained_observation'):
            return None
        try:
            reference = item['retained_observation']
            identity = reference['parent_context_sha256']
            if origin is not None and origin['context_sha256'] != identity:
                return None
            key = (identity, _sha(_canonical(item)))
            if key in self.resolved:
                return self.resolved[key]
            if key in visiting:
                return None
            context, adoptions = self._origin(identity)
            adoption = adoptions[item['criterion_adoption']]
            match = re.fullmatch(r'/invalidated_coverage/([0-9]+)', reference['json_pointer'])
            if not match or int(match[1]) not in adoption['original_coverage_indices']:
                return None
            original = context['invalidated_coverage'][int(match[1])]
            if (original['path'] != item['path'] or original.get('checkpoint_invalidation_reasons')
                    or _sha(_canonical(original)) != reference['value_sha256']):
                return None
            _checked_inputs(item['inputs'], context, required_path=item['path'])
            previous = self.support(original, visiting=visiting | {key})
            if original.get('criterion_adoption') and previous is None:
                return None
            functional = {row['path']: row['digest'] for row in
                          (previous['functional_inputs'] if previous else original['inputs'])}
            controls = {row['path']: row['digest'] for row in
                        (previous['control_inputs'] if previous else [])}
            actual = {row['path']: row['digest'] for row in item['inputs']}
            if any(actual.get(name) != value for name, value in functional.items()):
                return None
            if 'criterion_control_inputs' in item:
                if actual != functional or adoption.get('dependency_roles') != 'functional-and-criterion-v1':
                    return None
                declared = item['criterion_control_inputs']
                if declared:
                    _checked_inputs(declared, context)
                assessed = [row for row in adoption['inputs'] if row['path'] in context['input_hashes']]
                if assessed:
                    _checked_inputs(assessed, context)
                assessed = {row['path']: row['digest'] for row in assessed if row['path'] not in functional}
                if any(context['input_hashes'].get(name) != value and
                       assessed.get(name) != context['input_hashes'].get(name)
                       for name, value in controls.items()):
                    return None
                controls.update(assessed)
                if declared != [{'path': name, 'digest': value} for name, value in sorted(controls.items())]:
                    return None
            else:
                # Legacy expansion flattened all collective assessor inputs.
                # Only additions absent from the authenticated body footprint
                # are controls; an original functional dependency stays such.
                controls.update({name: value for name, value in actual.items() if name not in functional})
            if set(functional) & set(controls) or any(
                    context['input_hashes'].get(name) != value for name, value in controls.items()):
                return None
            result = {'functional_inputs': [{'path': name, 'digest': value} for name, value in sorted(functional.items())],
                      'control_inputs': [{'path': name, 'digest': value} for name, value in sorted(controls.items())],
                      'lineage': [dict(reference, criterion=item['criterion_adoption'],
                                       recorded_policy_sha256=self.records[identity]['guards']['review_policy_digest']),
                                  *(previous['lineage'] if previous else [])]}
            self.resolved[key] = result
            return result
        except (OSError, OracleApprovalError, ValueError, KeyError, TypeError, IndexError):
            return None


def _prior_native_assessment(directory: Path, rounds: list[dict], tree: str, base: str, guards: dict) -> dict | None:
    """Project immutable classification evidence without transferring a verdict."""
    keys = ("authentication_impact", "owner_approval_status", "api_version_assessment")
    for record in reversed(rounds):
        review = record.get("review", {})
        if (record["outcome"] == "ERROR" or not isinstance(review, dict)
                or review.get("review_status") not in {"COMPLETE", "INCOMPLETE"}
                or not review.get("summary") or any(key not in review for key in keys)):
            continue
        path = directory / f"round-{record['round']:04d}.json"
        return {"historical_evidence_only": True,
                "classification": {key: review[key] for key in keys},
                "summary": review["summary"],
                "origin": {"record_path": str(path), "record_sha256": record["record_sha256"],
                           "round": record["round"], "outcome": record["outcome"],
                           "review_status": review["review_status"], "candidate_tree": record["candidate_tree"],
                           "base_commit": record["base_commit"], "context_path": record["context_file"],
                           "context_sha256": record["context_sha256"], "guards_json_pointer": "/guards",
                           "guards_sha256": _sha(_canonical(record["guards"]))},
                "comparison": {"candidate_tree_equal": record["candidate_tree"] == tree,
                               "base_commit_equal": record["base_commit"] == base,
                               "guards_equal": record["guards"] == guards,
                               "current_guards_sha256": _sha(_canonical(guards)),
                               "changed_guard_keys": sorted(key for key in set(record["guards"]) | set(guards)
                                                            if record["guards"].get(key) != guards.get(key))}}
    return None


def _raw_assessment_origins(root: Path, rounds: list[dict]):
    """Unadopted native output is evidence, never verified coverage or a verdict."""
    for record in rounds:
        raw = record.get("raw_assessment")
        assessment = raw.get("assessment") if isinstance(raw, dict) else record.get("review")
        if not isinstance(assessment, dict):
            continue
        original = json.loads(_custody_read(root, record["context_file"])[1])
        if isinstance(raw, dict):
            yield record, raw, assessment, original
        for index, child in enumerate(assessment.get("unadopted_cohort_assessments", [])):
            # These are controller-authored references, not an adopted child
            # verdict. Recheck every original byte and assignment on each use.
            run = Path(os.path.abspath(record["context_file"])).parent
            def route(value):
                return Path(os.path.abspath(os.path.join(str(root), os.fspath(value))))
            result_file = route(child["result_file"])
            context_file = route(child["cohort_context_file"])
            plan_file = route(child["plan_file"])
            if (result_file.name != "result.json" or result_file.parent.parent != run / "cohorts"
                    or context_file not in {result_file.parent / "cohort-context.json", result_file.parent / "unadopted-context.json"}
                    or plan_file not in {run / "cohort-plan.json", result_file.parent / "unadopted-plan.json"}
                    or child.get("actual_outcome") != "ERROR"):
                raise OracleApprovalError("Unadopted cohort provenance is outside its native run")
            provenance = {}
            values = {}
            for label, path, expected in (("result", result_file, child["result_sha256"]),
                                          ("context", context_file, child["cohort_context_sha256"]),
                                          ("plan", plan_file, child["plan_file_sha256"])):
                fact, content = _custody_read(root, path)
                name = _custody_name(root, path)
                if fact["sha256"] != expected or child.get("provenance_custody", {}).get(name) != fact:
                    raise OracleApprovalError("Unadopted cohort original " + label + " content/custody changed")
                provenance[name] = expected
                values[label] = json.loads(content)
            envelope, packet, plan = values["result"], values["context"], values["plan"]
            plan_body = {key: value for key, value in plan.items() if key != "plan_sha256"}
            packet_body = {key: value for key, value in packet.items() if key != "packet_sha256"}
            identities = ("plan_sha256", "candidate_commit", "candidate_tree", "input_binding_sha256")
            if (plan.get("plan_sha256") != _sha(_canonical(plan_body))
                    or packet.get("packet_sha256") != _sha(_canonical(packet_body))
                    or plan.get("context_sha256") != record["context_sha256"]
                    or packet.get("parent_context_sha256") != record["context_sha256"]
                    or route(packet["parent_context"]) != (run / 'review-context.json'
                        if Path(record['context_file']).name == 'unadopted-review-context.json' else route(record['context_file']))
                    or plan.get("candidate_commit") != record["base_commit"]
                    or plan.get("candidate_tree") != record["candidate_tree"]
                    or any(envelope.get(key) != plan.get(key) or packet.get(key) != plan.get(key) for key in identities)
                    or envelope.get("cohort_id") != child["cohort_id"]
                    or packet.get("cohort", {}).get("id") != child["cohort_id"]
                    or packet["cohort"] not in plan.get("cohorts", [])
                    or envelope.get("assessment") != child.get("assessment")
                    or envelope["assessment"].get("review_status") != child.get("reported_review_status")
                    or envelope["assessment"].get("verdict") != child.get("reported_verdict")):
                raise OracleApprovalError("Unadopted cohort original assignment or candidate binding changed")
            pointer = ("/raw_assessment/assessment" if isinstance(raw, dict) else "/review")
            yield record, dict(child, provenance_files=provenance,
                               assessment_pointer=pointer + "/unadopted_cohort_assessments/" + str(index) + "/assessment"), child["assessment"], original


def _raw_native_provenance(root: Path, raw: dict, assessment: dict) -> dict:
    """Authenticate an original producer without admitting its assessment."""
    path = Path(raw.get("result_file") or "")
    if (not path.is_absolute() or not path.is_relative_to(receipt_path(root).parent / "runs")
            or path.name != "result.json" or not raw.get("result_sha256")):
        return {}
    try:
        _, content = _custody_read(root, path)
        result = json.loads(content)
        model_path, process_path = path.parent / "model.json", path.parent / "process.json"
        model = json.loads(_custody_read(root, model_path)[1])
        process = json.loads(_custody_read(root, process_path)[1])
        if (_sha(content) != raw["result_sha256"]
                or result.get("assessment", result) != assessment
                or model.get("reviewer_role") != "independent-oracle-approver"
                or process.get("exit_code") != 0):
            return {}
        return _files(root, [str(path), str(model_path), str(process_path)])
    except (OSError, ValueError, TypeError, AttributeError, OracleApprovalError):
        return {}


def _raw_criterion_candidates(root: Path, rounds: list[dict], inputs: dict, guards: dict, *, lineage=None) -> list:
    """Retain completed bodies for explicit independent applicability only."""
    latest = {}
    lineage = lineage or _CriterionLineage(root, rounds)
    for record, raw, assessment, original in _raw_assessment_origins(root, rounds):
        if assessment.get("review_status") not in {"COMPLETE", "INCOMPLETE", "ERROR"}:
            continue
        provenance = _raw_native_provenance(root, raw, assessment)
        if not provenance:
            continue
        coverage = assessment.get("coverage")
        if not isinstance(coverage, list):
            continue
        blocked = {name for finding in assessment.get("findings", []) if isinstance(finding, dict)
                   for name in [finding.get("file"), *finding.get("affected_paths", [])]}
        # Every row shares this immutable record's policy/authority binding.
        # Historical Git policy lookup belongs to the record, not each file.
        guard_changes = _observation_guard_changes(root, guards, record)
        for index, item in enumerate(coverage):
            name = item.get("path") if isinstance(item, dict) else None
            if not isinstance(name, str):
                continue
            latest[name] = None
            if (name in blocked or item.get("status") not in {"REVIEWED", "CARRIED_FORWARD"}
                    or not item.get("reason")):
                continue
            try:
                _checked_inputs(item.get("inputs"), original, required_path=name)
            except (OracleApprovalError, KeyError, TypeError):
                continue
            support = lineage.support(item, record)
            functional = support['functional_inputs'] if support else item['inputs']
            if any(inputs.get(entry["path"]) != entry["digest"] for entry in functional):
                continue
            latest[name] = (dict(item,
                invalidation_reasons=[*guard_changes, "unadopted_native_observation"],
                **({'criterion_support': support} if support else {}),
                raw_observation={"actual_outcome": record["outcome"],
                    "record_sha256": record["record_sha256"],
                    "context_sha256": record["context_sha256"],
                    "assessment_pointer": raw.get("assessment_pointer", "/raw_assessment/assessment")
                        + "/coverage/" + str(index),
                    "provenance_files": provenance}), record['round'])
    candidates = []
    for selected in latest.values():
        if selected is None:
            continue
        item, origin_round = selected
        reasons, superseded = [], False
        consumed = {entry['path'] for entry in [*item['inputs'], *item.get('criterion_control_inputs', [])]}
        for record in rounds:
            review = record.get('review', {})
            if not record.get('assessment_admitted', not record.get('raw_assessment') and 'error' not in review):
                continue
            # A later admitted individual assessment owns its actual footprint.
            # Collective criterion expansion cannot erase a concrete obligation.
            individual = any(row.get('path') == item['path'] and row.get('status') == 'REVIEWED'
                             and not row.get('criterion_adoption') for row in record.get('verified_coverage', []))
            if individual:
                if record['round'] > origin_round:
                    superseded = True
                    break
                reasons = []
            reasons.extend('Explicit affected source assessment: ' + row.get('reason', 'UNREVIEWED')
                           for row in review.get('coverage', [])
                           if row.get('path') == item['path'] and row.get('status') == 'UNREVIEWED')
            reasons.extend('Original supporting validation invalidated: ' + row.get('reason', 'Supporting validation invalidated')
                           for row in review.get('validations', [])
                           if row.get('evidence_path') in consumed and row.get('status') == 'INVALIDATED')
        if not superseded:
            if reasons:
                reasons = list(dict.fromkeys(reasons))
                item = dict(item, checkpoint_invalidation_reasons=reasons,
                            invalidation_reasons=[*item['invalidation_reasons'], *reasons])
            candidates.append(item)
    return candidates


def _raw_assessment_files(root: Path, rounds: list[dict]) -> dict:
    retained = {}
    for _, raw, assessment, original in _raw_assessment_origins(root, rounds):
        retained.update(raw.get("provenance_files", {}))
        retained.update(_raw_native_provenance(root, raw, assessment))
        for item in assessment.get("coverage", []) if isinstance(assessment.get("coverage"), list) else []:
            if not isinstance(item, dict):
                continue
            try:
                _checked_inputs(item.get("inputs"), original, required_path=item.get("path"))
            except (OracleApprovalError, KeyError, TypeError):
                continue
            for entry in item["inputs"]:
                digest = entry["digest"]
                if not isinstance(digest, str) or not digest.startswith("sha256:"):
                    continue
                try:
                    current = _files(root, [entry["path"]])
                    if current.get(entry["path"]) == digest.removeprefix("sha256:"):
                        retained.update(current)
                except (OSError, OracleApprovalError):
                    pass  # Missing or changed originals remain visible as inapplicable.
    return retained


def _raw_assessment_navigation(root: Path, rounds: list[dict], inputs: dict, guards: dict) -> list:
    navigation = []
    for record, raw, assessment, original in _raw_assessment_origins(root, rounds):
        observations = []
        for item in assessment.get("coverage", []) if isinstance(assessment.get("coverage"), list) else []:
            if not isinstance(item, dict) or not isinstance(item.get("path"), str):
                continue
            try:
                _checked_inputs(item.get("inputs"), original, required_path=item["path"])
                valid, error = True, None
            except (OracleApprovalError, KeyError, TypeError) as exc:
                valid, error = False, str(exc)
            declared = item.get("inputs") if isinstance(item.get("inputs"), list) else []
            changed = sorted({entry["path"] for entry in declared if isinstance(entry, dict)
                              and isinstance(entry.get("path"), str)
                              and (entry["path"] not in inputs or inputs[entry["path"]] != entry.get("digest"))})
            observations.append({"path": item["path"], "reported_status": item.get("status"),
                                 "input_binding_valid": valid, "binding_error": error,
                                 "changed_inputs": changed})
        findings = assessment.get("findings") if isinstance(assessment.get("findings"), list) else []
        navigation.append({"round": record["round"], "actual_outcome": record["outcome"],
                           "reported_review_status": raw.get("reported_review_status"),
                           "reported_verdict": raw.get("reported_verdict"),
                           "observed_candidate_tree": record["candidate_tree"],
                           "origin_context": record["context_file"],
                           "origin_context_sha256": record["context_sha256"],
                           "origin_record_sha256": record["record_sha256"],
                           "assessment_pointer": raw.get("assessment_pointer", "/raw_assessment/assessment"),
                           **({"cohort_id": raw["cohort_id"], "result_file": raw["result_file"],
                               "result_sha256": raw["result_sha256"], "eligibility": "NONE",
                               "reason": raw.get("reason"),
                               "prepared_integrity_error": raw.get("prepared_integrity_error")} if raw.get("cohort_id") else {}),
                           "guard_changes": _observation_guard_changes(root, guards, record),
                           "finding_ids": [item["id"] for item in findings
                                           if isinstance(item, dict) and isinstance(item.get("id"), str)],
                           "finding_references": [{key: item.get(key) for key in ("id", "file", "affected_paths")}
                                                  for item in findings if isinstance(item, dict)],
                           "observations": observations,
                           "status": "UNADOPTED; independent current applicability assessment required"})
    return navigation


def _owner_source_lexical_name(root: Path, value) -> tuple[str | None, str | None]:
    if (not isinstance(value, str) or not value or value != value.strip()
            or "\\" in value or any(ord(char) < 32 for char in value)):
        return None, "invalid source reference"
    path = Path(value)
    if ".." in path.parts:
        return None, "parent traversal"
    if path.is_absolute():
        prefix = str(root.resolve()).rstrip(os.sep) + os.sep
        if not value.startswith(prefix):
            return None, "outside owner root"
        value = value[len(prefix):].lstrip(os.sep)
    path = Path(value)
    if not path.parts or path.parts[0] in {"@proposal", "@publication"} or ".git" in path.parts:
        return None, "reserved source reference"
    return value, None


def _owner_source_name(root: Path, value) -> tuple[str | None, str | None]:
    """Normalize untrusted references without granting reads outside this owner."""
    name, error = _owner_source_lexical_name(root, value)
    if error:
        return None, error
    try:
        fact = _owner_source_walk(root, name, content=False)
        target = fact.get("target", fact)
        if target.get("exists") and target.get("kind") != "file":
            return None, "source is not a regular file"
    except (OracleApprovalError, ValueError, OSError, RuntimeError):
        return None, "source has an unsafe, changed or unavailable traversal"
    return name, None


def _owner_source_walk(root: Path, name: str, *, content: bool, allow_git: bool = False,
                       data: list | None = None, directory_fd: list | None = None,
                       custody: bool = False) -> dict:
    """Walk beneath an owned directory fd; inspect every link before following it."""
    owner = root.resolve()
    pending, parts, links, descriptors = name.split("/"), [], [], []
    terminal_link, fact, resolved, steps, directories = None, None, None, 0, []
    def signature(value):
        identity = (value.st_dev, value.st_ino, value.st_mode)
        return identity if stat.S_ISDIR(value.st_mode) else (*identity, value.st_size,
                                                           value.st_mtime_ns, value.st_ctime_ns)

    def unsafe():
        raise OracleApprovalError("Raw source traversal is unsafe or changed: " + name)

    def check_parts(values, prefix):
        depth = len(prefix)
        for value in values:
            if (value == ".git" and not allow_git) or "\\" in value or any(ord(char) < 32 for char in value):
                unsafe()
            if value == "..":
                if not depth: unsafe()
                depth -= 1
            elif value not in ("", "."):
                depth += 1

    try:
        descriptors.append(os.open(owner, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW))
        directories.append({"path": ".", "mode": oct(os.fstat(descriptors[-1]).st_mode), "kind": "directory"})
        check_parts(pending, [])
        while pending:
            steps += 1
            if steps > 512: unsafe()
            piece = pending.pop(0)
            if piece in ("", "."):
                continue
            if piece == "..":
                if not parts: unsafe()
                parts.pop(); os.close(descriptors.pop())
                continue
            if piece == ".git" and not allow_git: unsafe()
            resolved = "/".join([*parts, piece, *pending])
            try:
                before = os.stat(piece, dir_fd=descriptors[-1], follow_symlinks=False)
            except FileNotFoundError:
                fact = {"exists": False}
                break
            except NotADirectoryError:
                if custody:
                    raise OracleApprovalError("Oracle evidence has a non-directory ancestor: " + name)
                fact = {"exists": False}
                break
            if stat.S_ISLNK(before.st_mode):
                if len(links) >= 40: unsafe()
                target = os.readlink(piece, dir_fd=descriptors[-1])
                after = os.stat(piece, dir_fd=descriptors[-1], follow_symlinks=False)
                if signature(before) != signature(after): unsafe()
                link = {"path": "/".join([*parts, piece]), "mode": oct(before.st_mode), "target": target}
                links.append(link)
                if not pending and terminal_link is None:
                    terminal_link = {"exists": True, "mode": oct(before.st_mode), "kind": "symlink",
                                     "sha256": _sha(os.fsencode(target))}
                if os.path.isabs(target):
                    prefix = str(owner).rstrip(os.sep) + os.sep
                    if target == str(owner):
                        target_parts = []
                    elif target.startswith(prefix):
                        target_parts = target[len(prefix):].split(os.sep)
                    else:
                        unsafe()
                    check_parts(target_parts, [])
                    while len(descriptors) > 1: os.close(descriptors.pop())
                    parts.clear()
                else:
                    target_parts = target.split(os.sep)
                    check_parts(target_parts, parts)
                pending = [*target_parts, *pending]
                continue
            if stat.S_ISDIR(before.st_mode):
                directories.append({"path": "/".join([*parts, piece]), "mode": oct(before.st_mode),
                                    "kind": "directory"})
            if pending:
                if not stat.S_ISDIR(before.st_mode):
                    if custody:
                        raise OracleApprovalError("Oracle evidence has a non-directory ancestor: " + name)
                    fact = {"exists": False}
                    break
                child = os.open(piece, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptors[-1])
                if signature(os.fstat(child)) != signature(before):
                    os.close(child); unsafe()
                descriptors.append(child); parts.append(piece)
                continue
            fact = {"exists": True, "mode": oct(before.st_mode),
                    "kind": "file" if stat.S_ISREG(before.st_mode) else
                            "directory" if stat.S_ISDIR(before.st_mode) else "special"}
            if stat.S_ISDIR(before.st_mode) and directory_fd is not None:
                child = os.open(piece, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptors[-1])
                if signature(os.fstat(child)) != signature(before):
                    os.close(child); unsafe()
                descriptors.append(child)
            if stat.S_ISREG(before.st_mode):
                descriptor = os.open(piece, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK,
                                     dir_fd=descriptors[-1])
                with os.fdopen(descriptor, "rb") as source:
                    if signature(os.fstat(source.fileno())) != signature(before): unsafe()
                    if content:
                        digest = hashlib.sha256()
                        while block := source.read(1024 * 1024):
                            digest.update(block)
                            if data is not None: data.append(block)
                        fact["sha256"] = digest.hexdigest()
                    if signature(os.fstat(source.fileno())) != signature(before): unsafe()
                    if signature(os.stat(piece, dir_fd=descriptors[-1], follow_symlinks=False)) != signature(before):
                        unsafe()
            break
        if fact is None:
            mode = os.fstat(descriptors[-1]).st_mode
            fact, resolved = {"exists": True, "mode": oct(mode), "kind": "directory"}, "/".join(parts)
        if directory_fd is not None and fact.get("kind") == "directory":
            directory_fd.append(os.dup(descriptors[-1]))
        if terminal_link is not None:
            fact = dict(terminal_link, target=fact)
        if links:
            fact = dict(fact, links=links, resolved_path=resolved)
        if custody:
            fact = dict(fact, directories=directories, resolved_path=resolved)
        return fact
    finally:
        for descriptor in reversed(descriptors): os.close(descriptor)


def _owner_source_fact(root: Path, name: str) -> dict:
    normalized, error = _owner_source_lexical_name(root, name)
    if error or normalized != name:
        raise OracleApprovalError("Raw source reference is unsafe: " + name)
    try:
        return _owner_source_walk(root, name, content=True)
    except (OSError, ValueError, RuntimeError) as exc:
        raise OracleApprovalError("Raw source traversal is unsafe or changed: " + name) from exc


def _raw_source_closure(root: Path, rounds: list[dict], inputs: dict) -> tuple[dict, dict, list]:
    references, bindings, rejected = {}, {}, []
    trusted = set()
    for record in rounds:
        original = json.loads(_custody_read(root, record["context_file"])[1])
        trusted.update(original["input_hashes"])
    for record, _, assessment, _ in _raw_assessment_origins(root, rounds):
        candidates = []
        for item in assessment.get("coverage", []) if isinstance(assessment.get("coverage"), list) else []:
            if isinstance(item, dict):
                candidates.append((item.get("path"), "coverage", None))
                candidates += [(entry.get("path"), "dependency", None) for entry in item.get("inputs", [])
                               if isinstance(entry, dict)] if isinstance(item.get("inputs"), list) else []
        for item in assessment.get("findings", []) if isinstance(assessment.get("findings"), list) else []:
            if isinstance(item, dict):
                candidates.append((item.get("file"), "finding", item.get("id")))
                if isinstance(item.get("affected_paths"), list):
                    candidates += [(name, "affected", item.get("id")) for name in item["affected_paths"]]
        for value, role, identity in candidates:
            name, error = _owner_source_name(root, value)
            origin = {"reference": value, "role": role, "finding_id": identity, "round": record["round"]}
            if error:
                lexical, _ = _owner_source_lexical_name(root, value)
                if lexical in trusted:
                    raise OracleSourceBindingError("Previously bound owner source became unsafe: " + lexical)
                rejected.append(dict(origin, reason=error, status="UNAVAILABLE"))
            else:
                references.setdefault(name, []).append(origin)
    for name in list(references):
        if name not in inputs:
            fact = _owner_source_fact(root, name)
            target = fact.get("target", fact)
            if target.get("exists") and target.get("kind") != "file":
                if name in trusted:
                    raise OracleSourceBindingError("Previously bound owner source became nonregular: " + name)
                rejected.extend(dict(origin, reason="source is not a regular file", status="UNAVAILABLE")
                                for origin in references.pop(name))
                continue
            bindings[name] = fact
            inputs[name] = ("fs-sha256:" + fact["mode"] + ":" + fact["kind"] + ":" + _sha(_canonical(fact))
                            if fact["exists"] else None)
    return references, bindings, rejected


def _assert_raw_sources(root: Path, context: dict) -> None:
    for name, fact in context.get("raw_source_bindings", {}).items():
        try:
            current = _owner_source_fact(root, name)
        except (OracleApprovalError, OSError) as exc:
            raise OracleSourceBindingError("Observed raw source became unavailable or unsafe: " + name) from exc
        if current != fact:
            raise OracleSourceBindingError("Observed raw source changed or appeared: " + name)


def _input_fact(digest) -> dict:
    if digest is None:
        return {"exists": False}
    if isinstance(digest, str) and digest.startswith("git-"):
        _, mode, kind, oid = digest.split(":", 3)
        return {"exists": True, "mode": mode, "kind": kind, "object": oid,
                "type": "symlink" if mode == "120000" else "submodule" if mode == "160000" else kind if kind != "blob" else "file"}
    if isinstance(digest, str) and digest.startswith("fs-sha256:"):
        _, mode, kind, value = digest.split(":", 3)
        return {"exists": True, "mode": mode, "kind": kind, "type": kind, "digest": value}
    return {"exists": True, "type": "byte-evidence", "digest": digest}


def _path_dispositions(root: Path, context: dict, rounds: list[dict]) -> list:
    previous = json.loads(_custody_read(root, rounds[-1]["context_file"])[1])["input_hashes"] if rounds else {}
    verified = {item["path"]: item for item, _ in _coverage_checkpoints(rounds)}
    reusable = {item["path"] for item in context["reusable_coverage"]}
    invalid = {item["path"]: item["invalidation_reasons"] for item in context["invalidated_coverage"]}
    added = set(_git(root, "diff", "--name-only", "--diff-filter=A", context["base_commit"], context["candidate_tree"]).splitlines())
    raw_paths = {item["path"] for origin in context["unadopted_assessments"] for item in origin["observations"]}
    selected = []
    for name in context["required_coverage_paths"]:
        current = context["input_hashes"].get(name)
        prior = verified.get(name)
        old = next((entry["digest"] for entry in prior["inputs"] if entry["path"] == name), None) if prior else None
        reasons = list(invalid.get(name, []))
        if name in reusable:
            disposition = "REUSABLE_VERIFIED"
        elif current is None:
            disposition = "REMOVED"
        elif prior:
            if old != current:
                disposition = "CONTENT_CHANGED"
            elif any(entry["path"] not in context["input_hashes"] or
                     context["input_hashes"][entry["path"]] != entry["digest"] for entry in prior["inputs"]):
                disposition = "DEPENDENCY_CHANGED"
            else:
                disposition = "CRITERIA_APPLICABILITY"
        elif name in previous and previous[name] != current:
            disposition = "CONTENT_CHANGED"
        elif name in raw_paths:
            disposition = "UNADOPTED_ASSESSMENT"
        elif name in context["pending_from_prior"]:
            disposition = "UNFINISHED"
        else:
            disposition = "NEW" if name in added else "UNREVIEWED"
        selected.append({"path": name, "disposition": disposition,
                         "reasons": reasons or [disposition.lower().replace("_", " ")],
                         "current_fact": _input_fact(current),
                         "previous_attempt_fact": _input_fact(previous.get(name)),
                         "last_verified_fact": _input_fact(old) if prior else None})
    return selected


def _review_context(root: Path, tree: str, paths: list, binding: dict, evidence: dict,
                    proposal_record: Path | None = None) -> dict:
    directory = _series_directory(root, binding["base_commit"])
    rounds = _read_rounds(directory)
    previous = rounds[-1] if rounds else None
    validation_invalidations = previous.get("validation_invalidations", {}) if previous else {}
    known_paths = {item["evidence_path"] for item in previous.get("verified_validations", [])} if previous else set()
    known_evidence = dict(evidence)
    retained_observation_evidence = _raw_assessment_files(root, rounds)
    known_evidence.update(retained_observation_evidence)
    registered_evidence = {}
    for name in known_paths | set(validation_invalidations):
        try:
            retained = _files(root, [name])
            known_evidence.update(retained)
            registered_evidence.update(retained)
        except (OSError, OracleApprovalError):
            pass
    # Retained artifacts are actual inputs even when the caller omits them.
    # This also binds a later semantic invalidation to those exact bytes.
    inputs = _candidate_inputs(root, tree, {**known_evidence, **(binding.get("owner_approval_evidence") or {})})
    selected_proposal = proposal_record or proposal_path(root)
    proposal_raw = _custody_read(root, selected_proposal)[1]
    proposal = json.loads(proposal_raw)
    proposal_scope = {"sha256": proposal["proposal_sha256"], "proposal": proposal["proposal"]}
    inputs["@proposal/scope"] = "sha256:" + proposal_scope["sha256"]
    publication_scope = binding["publication_scope"]
    paths = sorted(set(paths) | set(publication_scope["range_paths"]))
    if publication_scope["target_ref"] is not None:
        inputs["@publication/scope"] = "sha256:" + _sha(_canonical(publication_scope))
        paths = sorted(set(paths) | {"@publication/scope"})
    for name in paths:
        inputs.setdefault(name, None)  # Deleted paths are explicit review inputs.
    guards = {key: binding[key] for key in ("authority_digests", "owner_approval_evidence")}
    guards["review_policy_digest"] = _review_policy_digest(root)
    # Relevant issue/design sources belong in each coverage dependency list.
    # An unrelated knowledge addition does not invalidate every reviewed path.
    guards["authority_digests"] = _controlling_authorities(guards["authority_digests"])
    guards["environment_digest"] = binding["environment_digest"]
    changed = _paths(root, previous["candidate_tree"], tree) if previous else paths
    pending_from_prior = previous.get("pending_review_paths", []) if previous else []
    raw_references, raw_bindings, rejected_references = _raw_source_closure(root, rounds, inputs)
    raw_required = {name for name, origins in raw_references.items()
                    if any(origin["role"] != "dependency" for origin in origins)}
    required_paths = sorted(set(paths) | set(changed) | set(pending_from_prior) | raw_required)
    for name in required_paths:
        inputs.setdefault(name, None)
    reusable, invalidated, validations, invalid_validations = [], [], [], []
    ledger = previous.get("finding_ledger", {}) if previous else {}
    lineage = _CriterionLineage(root, rounds)
    if previous:
        source_guards = {}
        for item, origin in _coverage_checkpoints(rounds):
            # Re-evaluate the actual original proof even after an unstructured
            # ERROR; legacy policy equivalence still requires original Git.
            identity = origin["record_sha256"]
            if identity not in source_guards:
                source_guards[identity] = _observation_guard_changes(root, guards, origin)
            reasons = [*source_guards[identity], *item.get("checkpoint_invalidation_reasons", [])]
            reasons += [entry["path"] + " content changed or missing" for entry in item["inputs"]
                        if entry["path"] not in inputs or inputs[entry["path"]] != entry["digest"]]
            reasons += [entry['path'] + ' criterion control changed or missing'
                        for entry in item.get('criterion_control_inputs', [])
                        if inputs.get(entry['path']) != entry['digest']]
            support = lineage.support(item, origin)
            (invalidated if reasons else reusable).append(dict(item, invalidation_reasons=reasons,
                **({'criterion_support': support} if support else {})))
        for item in previous.get("verified_validations", []):
            reasons = _observation_guard_changes(root, guards, previous, validation=True)
            # Evidence from an older round stays eligible only while its exact bytes exist.
            name = item["evidence_path"]
            try:
                current_digest = _files(root, [name])[name]
            except (OSError, OracleApprovalError):
                current_digest = None
            if current_digest != item["evidence_sha256"]:
                reasons.append("validation evidence changed or missing")
            try:
                _validation_record(root, name, item["inputs"], item["environment_digest"])
            except OracleApprovalError as exc:
                reasons.append(str(exc))
            reasons += [entry["path"] + " validation input changed or missing" for entry in item["inputs"]
                        if entry["path"] not in inputs or inputs[entry["path"]] != entry["digest"]]
            (invalid_validations if reasons else validations).append(dict(item, invalidation_reasons=reasons))
    # These observations remain ineligible until the current independent
    # criterion decision. A whole-attempt source movement must not require a
    # fresh body read for an unchanged, authenticated per-file assessment.
    invalidated.extend(_raw_criterion_candidates(root, rounds, inputs, guards, lineage=lineage))
    failed_repairs = 0
    for record in reversed(rounds):
        if record["outcome"] == "APPROVED":
            break
        if record.get("is_repair_round", record["mode"] == "followup") and record["outcome"] == "REJECTED":
            failed_repairs += 1
    if previous and "failed_repair_rounds" in previous:
        failed_repairs = previous["failed_repair_rounds"]
    is_repair_round = bool(previous and (previous["outcome"] == "REJECTED" or
                           previous["outcome"] in {"INCOMPLETE", "ERROR"} and previous.get("is_repair_round")))
    current_validations, invalid_current = _current_validation_proofs(root, known_evidence, inputs,
                                                                     guards["environment_digest"], validation_invalidations)
    unresolved = [value for value in ledger.values() if value["state"] == "OPEN"]
    synthesis = "\n".join(f"{item['id']}: {item['required_behavior']} Repair: {item['recommendation']} Acceptance: "
                          + "; ".join(item["acceptance_checks"]) for item in unresolved)
    context = {"kind": "oracle-review-context-v1", "series_id": directory.name,
               "round": len(rounds) + 1, "mode": "initial" if not previous else
               "resume" if previous["outcome"] in {"INCOMPLETE", "ERROR"} else "followup",
               "candidate_tree": tree, "base_commit": binding["base_commit"], "guards": guards,
               "previous_candidate_tree": previous["candidate_tree"] if previous else None,
               "previous_record_sha256": previous["record_sha256"] if previous else None,
               "changed_paths": paths, "changed_since_previous": changed,
               "required_coverage_paths": required_paths,
               "pending_from_prior": pending_from_prior,
               "proposal_scope": proposal_scope,
               "proposal_record": {"path": str(selected_proposal), "sha256": _sha(proposal_raw)},
               "previous_proposal_scope": previous.get("proposal_scope") if previous else None,
               "scope_changed": bool(previous and previous.get("proposal_scope") != proposal_scope),
               "input_hashes": inputs, "caller_evidence": dict(evidence), "prior_findings": ledger,
               "prior_native_assessment": _prior_native_assessment(directory, rounds, tree, binding["base_commit"], guards),
               "reusable_coverage": reusable, "invalidated_coverage": invalidated,
               "reusable_validations": validations, "invalidated_validations": invalid_validations,
               "current_validations": current_validations, "invalid_current_validations": invalid_current,
               "validation_invalidations": validation_invalidations,
               "registered_validation_evidence": registered_evidence,
               "retained_observation_evidence": retained_observation_evidence,
               "raw_source_references": raw_references, "raw_source_bindings": raw_bindings,
               "rejected_raw_source_references": rejected_references,
               "failed_repair_rounds": failed_repairs,
               "is_repair_round": is_repair_round,
               "repair_synthesis_required": failed_repairs >= 2 and bool(unresolved),
               "repair_plan": synthesis if failed_repairs >= 2 else "",
               "prior_rounds": [{key: item[key] for key in ("round", "candidate_tree", "outcome", "record_sha256")}
                                for item in rounds]}
    context["publication_scope"] = publication_scope
    if __package__:
        from . import command_coverage
    else:
        import command_coverage
    context["required_commands"] = command_coverage.requirements(root, tree)
    context["unadopted_assessments"] = _raw_assessment_navigation(root, rounds, inputs, guards)
    context["path_dispositions"] = _path_dispositions(root, context, rounds)
    context["attempt_delta"] = {"from_candidate": previous["candidate_tree"] if previous else None,
                                "to_candidate": tree, "paths": changed}
    context["cumulative_pending_since_verified"] = sorted(set(required_paths) -
                                                          {item["path"] for item in reusable})
    _atomic_write(_RUN.get() / "review-context.json", _pretty(context))
    return context


def _checked_inputs(entries: Any, context: dict, *, required_path: str | None = None) -> list:
    if not isinstance(entries, list) or not entries:
        raise OracleApprovalError("Review evidence requires explicit input/dependency hashes")
    names = []
    for entry in entries:
        if (not isinstance(entry, dict) or set(entry) != {"path", "digest"}
                or entry["path"] not in context["input_hashes"]
                or context["input_hashes"][entry["path"]] != entry["digest"]):
            raise OracleApprovalError("Review evidence has an unknown or stale input hash")
        names.append(entry["path"])
    if len(set(names)) != len(names) or (required_path and required_path not in names):
        raise OracleApprovalError("Review evidence has duplicate or missing source inputs")
    return entries


def _validation_capture_inputs(root: Path, selected: Sequence[str]) -> tuple[dict, dict]:
    """Inspect only the declared execution closure, including live file bytes."""
    inputs = _candidate_inputs(root, _tree(root), {})
    inputs.update(_declared_parent_execution_inputs(root, selected))
    if not selected or any(name not in inputs for name in selected):
        raise OracleApprovalError("Validation inputs must name existing candidate or canonical knowledge paths")
    tracked = [name for name in selected if isinstance(inputs[name], str) and inputs[name].startswith("git-")]
    if tracked and _git(root, "diff", "--name-only", "--", *tracked).strip():
        raise OracleApprovalError("Stage the selected validation inputs before capture or reuse")
    live = {}
    for name in selected:
        try:
            live[name] = _custody_read(root, name)[0]
        except OSError as exc:
            raise OracleApprovalError("Selected validation input is unavailable: " + name) from exc
    return {name: inputs[name] for name in selected}, live


def record_validation(root: Path, command: Sequence[str], input_paths: Sequence[str], output: Path, *,
                      environment_keys: Sequence[str] = ()) -> dict:
    """Execute a focused check and capture source/configuration/environment proof."""
    if not command:
        raise OracleApprovalError("Validation recording requires a command after --")
    output = root / output
    try:
        output.relative_to(root.resolve() / "Vault" / "tmp")
    except ValueError as exc:
        raise OracleApprovalError("Validation records must stay in private Vault/tmp") from exc
    # Check the output parent before any unlink/write; preserve its lexical route.
    parent_name = str(output.parent.relative_to(root.resolve()))
    parent_fact = _private_witness_parent(root, output.parent)
    if output.is_symlink():
        raise OracleApprovalError("Validation record destination must be a regular private file")
    binding = {"base_commit": _git(root, "rev-parse", "HEAD").strip(), "candidate_tree": _tree(root),
               "authority_digests": _live_authorities(root), "environment_digest": _environment_digest()}
    inputs = _candidate_inputs(root, binding["candidate_tree"], {})
    selected = sorted(set(input_paths)) if input_paths else sorted(inputs)
    selected_inputs, live_inputs = _validation_capture_inputs(root, selected)
    inputs.update(_declared_parent_execution_inputs(root, selected))
    if selected_inputs != {name: inputs[name] for name in selected}:
        raise OracleApprovalError("Selected validation inputs changed during preparation")
    authority = _controlling_authorities(binding["authority_digests"])
    policy = _review_policy_digest(root)
    effective_environment, environment_inputs, extras = _validation_environment(environment_keys)
    executable = _execution_custody(root, command, effective_environment)
    authority_custody = _custody_files(root, list(authority), allow_absent=True)
    if __package__:
        from .command_coverage import execution_metadata
    else:
        from command_coverage import execution_metadata
    execution_environment = execution_metadata(root, executable, effective_environment)
    started = datetime.now(timezone.utc).isoformat()
    _private_witness_write(root, output, None)
    completed = subprocess.run(list(command), cwd=root, capture_output=True, env=effective_environment)
    # Preserve the actual execution diagnostics even if a relevant input drifts.
    stdout, stderr = output.with_suffix(".stdout.log"), output.with_suffix(".stderr.log")
    _private_witness_write(root, stdout, completed.stdout); _private_witness_write(root, stderr, completed.stderr)
    if (_validation_capture_inputs(root, selected) != (selected_inputs, live_inputs)
            or _git(root, "rev-parse", "HEAD").strip() != binding["base_commit"]
            or _controlling_authorities(_live_authorities(root)) != authority
            or _review_policy_digest(root) != policy
            or _environment_digest() != binding["environment_digest"]
            or _execution_custody(root, command, effective_environment) != executable
            or _custody_files(root, list(authority), allow_absent=True) != authority_custody
            or _owner_source_walk(root, parent_name, content=False, allow_git=True, custody=True) != parent_fact):
        raise OracleApprovalError("Selected validation inputs or controlling guards changed during capture")
    if _validation_environment(extras)[1] != environment_inputs:
        raise OracleApprovalError("Validation effective environment changed during capture")
    payload = {"kind": "oracle-validation-record-v1", "command": list(command), "exit_code": completed.returncode,
               "started_at": started, "finished_at": datetime.now(timezone.utc).isoformat(),
               "base_commit": binding["base_commit"], "candidate_tree": binding["candidate_tree"],
               "inputs": [{"path": name, "digest": selected_inputs[name]} for name in selected],
               "live_inputs": live_inputs,
               "environment_digest": binding["environment_digest"],
               "execution_environment": execution_environment,
               "capture_environment": {"platform": platform.system(), "python": platform.python_version()},
               "environment_policy": "bounded-v1", "environment_keys": extras,
               "environment_inputs": environment_inputs,
               "review_policy_digest": policy,
               "authority_digests": authority,
               "provenance_policy": "every-hop-v1", "execution_custody": executable,
               "authority_custody": authority_custody,
               "record_location": {"path": _custody_name(root, output), "parent": parent_fact,
                                   "mode": oct(stat.S_IFREG | 0o600)},
               "output_custody": _custody_files(root, [str(stdout), str(stderr)]),
               "output_hashes": _files(root, [str(stdout), str(stderr)])}
    record = dict(payload, record_sha256=_sha(_canonical(payload)))
    _private_witness_write(root, output, _pretty(record))
    return record


def _validation_record(root: Path, name: str, inputs: list, environment_digest: str, *,
                       check_environment: bool = True, expected_base: str | None = None) -> dict:
    try:
        path = Path(name) if Path(name).is_absolute() else root / name
        record_fact, raw = _custody_read(root, name)
        record = json.loads(raw)
        payload = {key: value for key, value in record.items() if key != "record_sha256"}
        effective, current_environment, extras = _validation_environment(record["environment_keys"])
        selected, live = _validation_capture_inputs(root, [item["path"] for item in inputs])
        if check_environment:
            executable = _execution_custody(root, record["command"], effective)
        else:
            executable = []
            for item in record["execution_custody"]:
                fact = _custody_read(root, item["resolved"])[0]
                executable.append(dict(item, custody=fact, index_input=_execution_index(root, fact)))
        location = {"path": _custody_name(root, name),
                    "parent": _owner_source_walk(root, str(path.parent.relative_to(root)), content=False,
                                                 allow_git=True, custody=True),
                    "mode": record_fact["source"]["mode"]}
        valid = (raw == _pretty(record) and record["kind"] == "oracle-validation-record-v1"
                 and record["provenance_policy"] == "every-hop-v1"
                 and record["record_location"] == location
                 and record["execution_custody"] == executable
                 and record["authority_custody"] == _custody_files(root, list(record["authority_digests"]), allow_absent=True)
                 and record["output_custody"] == _custody_files(root, list(record["output_hashes"]))
                 and record["environment_policy"] == "bounded-v1" and record["environment_keys"] == extras
                 and (not check_environment or record["environment_inputs"] == current_environment)
                 and isinstance(record["review_policy_digest"], str)
                 and re.fullmatch(r"[0-9a-f]{64}", record["review_policy_digest"])
                 and _historical_policy_guard(root, record["candidate_tree"], record["review_policy_digest"]) == _review_policy_digest(root)
                 and record["record_sha256"] == _sha(_canonical(payload)) and record["exit_code"] == 0
                 and record["inputs"] == inputs and selected == {item["path"]: item["digest"] for item in inputs}
                 and record["live_inputs"] == live
                 and subprocess.run(["git", "merge-base", "--is-ancestor", record["base_commit"],
                                     expected_base if expected_base is not None else _git(root, "rev-parse", "HEAD").strip()],
                                    cwd=root, capture_output=True).returncode == 0
                 and record["environment_digest"] == environment_digest
                 and record["authority_digests"] == _controlling_authorities(_live_authorities(root))
                 and record["output_hashes"] == _files(root, list(record["output_hashes"]))
                 and record_fact == _custody_read(root, name)[0])
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        raise OracleApprovalError("Validation lacks recorded input/environment proof: " + name) from exc
    if not valid:
        raise OracleApprovalError("Validation input/environment/output provenance is stale or invalid: " + name)
    return record


def _current_validation_proofs(root: Path, evidence: dict, inputs: dict, environment_digest: str,
                               invalidations: dict) -> tuple[list, list]:
    verified, invalid = [], []
    for name, digest in evidence.items():
        if not name.endswith(".json"):
            continue
        try:
            path = Path(name) if Path(name).is_absolute() else root / name
            record = json.loads(_custody_read(root, name)[1])
        except (OSError, ValueError):
            continue
        if not isinstance(record, dict) or record.get("kind") != "oracle-validation-record-v1":
            continue
        try:
            blocked = invalidations.get(name)
            if blocked and blocked["evidence_sha256"] == digest:
                raise OracleApprovalError("Prior explicit validation invalidation remains: " + blocked["reason"])
            _checked_inputs(record.get("inputs"), {"input_hashes": inputs})
            _validation_record(root, name, record["inputs"], environment_digest)
        except (OracleApprovalError, KeyError) as exc:
            invalid.append({"evidence_path": name, "reason": str(exc)})
            continue
        verified.append({"evidence_path": name, "evidence_sha256": digest, "status": "VERIFIED",
                         "inputs": record["inputs"], "environment_digest": environment_digest,
                         "reason": "Utility verified the passing native command against exact current inputs and retained outputs",
                         "command": record["command"], "output_hashes": record["output_hashes"]})
    return verified, invalid


def _invalidation_digest(context: dict, name: str) -> str:
    value = context["input_hashes"].get(name)
    digest = value.removeprefix("sha256:") if isinstance(value, str) and value.startswith("sha256:") else None
    if digest is None:
        # Missing artifacts can still invalidate a registered original by its
        # prior content binding, including if the same bytes are later restored.
        prior = context["validation_invalidations"].get(name, {})
        digest = prior.get("evidence_sha256")
        for item in [*context["reusable_validations"], *context["invalidated_validations"], *context["current_validations"]]:
            if item["evidence_path"] == name:
                digest = item["evidence_sha256"]
                break
    if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
        raise OracleApprovalError("Validation invalidation lacks an exact registered artifact digest: " + name)
    return digest


def _validate_completed_review(root: Path, review: dict, context: dict, evidence: dict) -> tuple[list, list, dict]:
    status = review.get("review_status")
    if status not in {"COMPLETE", "INCOMPLETE", "ERROR"}:
        raise OracleApprovalError("Oracle result lacks a recognized review_status")
    for key in ("coverage", "validations", "findings", "resolutions", "limitations"):
        if not isinstance(review.get(key), list):
            raise OracleApprovalError("Oracle result lacks structured " + key)
    if status != "COMPLETE" and not review["limitations"]:
        raise OracleApprovalError("Unfinished Oracle result requires explicit limitations")
    if status != "COMPLETE" and review.get("verdict") != status:
        raise OracleApprovalError("Unfinished Oracle verdict must match its review_status")
    if status == "COMPLETE" and review["limitations"]:
        raise OracleApprovalError("Oracle cannot claim complete coverage with unfinished limitations")
    coverage, seen = [], set()
    reusable = {item["path"]: item for item in context["reusable_coverage"]}
    for item in review["coverage"]:
        name = item.get("path")
        if name in seen or name not in context["input_hashes"]:
            raise OracleApprovalError("Oracle coverage path is duplicate or unknown")
        seen.add(name)
        if item.get("status") == "UNREVIEWED":
            continue
        _checked_inputs(item.get("inputs"), context, required_path=name)
        if item.get('criterion_control_inputs'):
            _checked_inputs(item['criterion_control_inputs'], context)
        if item.get("status") == "CARRIED_FORWARD":
            prior = reusable.get(name)
            if not prior or item["inputs"] != prior["inputs"]:
                raise OracleApprovalError("Oracle carried coverage without unchanged dependency proof")
        elif item.get("status") != "REVIEWED":
            raise OracleApprovalError("Oracle coverage status is invalid")
        if not item.get("reason", "").strip():
            raise OracleApprovalError("Oracle coverage requires a review rationale")
        coverage.append(item)
    # Omission preserves independently verified unchanged facts. An explicit
    # UNREVIEWED entry is in seen and therefore cannot be silently carried.
    coverage += [dict(item, status="CARRIED_FORWARD") for item in context["reusable_coverage"]
                 if item["path"] not in seen]
    if status == "COMPLETE" and not set(context["required_coverage_paths"]).issubset({item["path"] for item in coverage}):
        raise OracleReviewIncomplete("Oracle did not finish coverage of every changed path")
    ledger = json.loads(json.dumps(context["prior_findings"]))
    open_ids = {key for key, item in ledger.items() if item["state"] == "OPEN"}
    finding_ids, resolved_ids = set(), set()
    historical, observation_deltas = None, {}
    for item in review["findings"]:
        identity = item.get("id", "")
        if not re.fullmatch(r"F[0-9]{3,}", identity) or identity in finding_ids:
            raise OracleApprovalError("Oracle findings require unique stable F001-style IDs")
        finding_ids.add(identity)
        for key in ("file", "message", "root_cause", "reproduction", "required_behavior", "recommendation", "origin_reason"):
            if not isinstance(item.get(key), str) or not item[key].strip():
                raise OracleApprovalError("Oracle finding lacks actionable " + key)
        if not item.get("affected_paths") or not item.get("acceptance_checks"):
            raise OracleApprovalError("Oracle finding lacks affected paths or acceptance checks")
        if context["round"] > 1 and identity not in ledger:
            if historical is None:
                historical = {}
                for record in _read_rounds(_series_directory(root, context["base_commit"])):
                    if record["round"] >= context["round"]:
                        continue
                    verified = {entry["path"]: entry for entry in record["verified_coverage"]}
                    for entry in record["review"].get("coverage", []):
                        if entry.get("status") == "REVIEWED" and entry["path"] in verified:
                            historical[entry["path"]] = (verified[entry["path"]], record)
            prior = historical.get(item["file"])
            prior_observation, origin = prior if prior else (None, None)
            # Attribution uses genuine observed inputs, independently of the
            # guards controlling automatic coverage/validation eligibility.
            previously_reviewed = bool(prior_observation and all(
                entry["path"] in context["input_hashes"] and
                context["input_hashes"][entry["path"]] == entry["digest"]
                for entry in prior_observation["inputs"]))
            if origin and origin["candidate_tree"] not in observation_deltas:
                observation_deltas[origin["candidate_tree"]] = set(_paths(root, origin["candidate_tree"], context["candidate_tree"]))
            changed_paths = observation_deltas[origin["candidate_tree"]] if origin else set(context["changed_since_previous"])
            affected_delta = bool(set(item["affected_paths"]) & changed_paths)
            changed_scope = bool(origin and origin.get("proposal_scope") != context["proposal_scope"] and item.get("origin") == "REPAIR")
            if previously_reviewed and not affected_delta and not changed_scope and item.get("origin") != "MISSED":
                raise OracleApprovalError("A new finding in unchanged reviewed code must record MISSED coverage")
        if identity in ledger and ledger[identity]["state"] == "RESOLVED" and item.get("origin") != "REOPENED":
            raise OracleApprovalError("A resolved finding must explicitly record why it reopened")
        ledger[identity] = dict(item, state="OPEN")
    for item in review["resolutions"]:
        identity = item.get("id")
        if identity not in open_ids or identity in finding_ids or identity in resolved_ids or not item.get("explanation"):
            raise OracleApprovalError("Oracle finding resolution is unknown, duplicate or unexplained")
        _checked_inputs(item.get("inputs"), context)
        resolved_ids.add(identity); ledger[identity] = dict(ledger[identity], state="RESOLVED", resolution=item)
    if status == "COMPLETE" and not open_ids.issubset(finding_ids | resolved_ids):
        raise OracleApprovalError("Oracle omitted an unresolved prior finding")
    if review.get("verdict") == "APPROVED" and (status != "COMPLETE" or finding_ids):
        raise OracleReviewIncomplete("Oracle approval requires complete coverage and no findings")
    if status == "COMPLETE" and review.get("verdict") not in {"APPROVED", "REJECTED"}:
        raise OracleApprovalError("Complete Oracle result lacks a verdict")
    if status == "COMPLETE" and review.get("verdict") == "REJECTED" and not finding_ids:
        raise OracleApprovalError("A completed rejection requires an actionable candidate finding")
    if context["repair_synthesis_required"] and not review.get("repair_plan", "").strip():
        raise OracleReviewIncomplete("Oracle must reconcile the unresolved repair plan after two failed repair rounds")
    validations, validation_names = [], set()
    prior_validations = {item["evidence_path"]: item for item in context["reusable_validations"]}
    for item in review["validations"]:
        name = item.get("evidence_path")
        if not isinstance(name, str) or not name or name in validation_names:
            raise OracleApprovalError("Validation assessments require unique identified artifacts")
        validation_names.add(name)
        if item.get("status") == "INVALIDATED":
            if not item.get("reason"):
                raise OracleApprovalError("Invalidated validation needs a concrete reason and rerun")
            _invalidation_digest(context, name)
            continue
        _checked_inputs(item.get("inputs"), context)
        if item.get("environment_digest") != context["guards"]["environment_digest"]:
            raise OracleApprovalError("Validation environment proof is stale")
        _validation_record(root, name, item["inputs"], item["environment_digest"])
        if item.get("status") == "REUSED":
            prior = prior_validations.get(name)
            if not prior or item["inputs"] != prior["inputs"]:
                raise OracleApprovalError("Validation reuse lacks unchanged input/dependency/configuration proof")
            validations.append(dict(item, evidence_sha256=prior["evidence_sha256"]))
        elif item.get("status") == "VERIFIED" and name in evidence:
            validations.append(dict(item, evidence_sha256=evidence[name]))
        else:
            raise OracleApprovalError("Validation evidence is unknown or has invalid status")
    assessed_validations = {item["evidence_path"] for item in review["validations"]}
    eligible_proofs = {item["evidence_path"]: item for item in
                       [*context["reusable_validations"], *context["current_validations"]]}
    for item in eligible_proofs.values():
        if item["evidence_path"] not in assessed_validations:
            _validation_record(root, item["evidence_path"], item["inputs"], item["environment_digest"])
            validations.append(item)
    if __package__:
        from . import command_coverage
    else:
        import command_coverage
    command_coverage.validate_decisions(root, review, context)
    return coverage, validations, ledger


def _prepare_round(root: Path, context: dict, review: dict, outcome: str, *, coverage=None, validations=None, ledger=None,
                   context_file: Path | None = None, raw_assessment: dict | None = None) -> tuple[Path, dict]:
    if context_file is None:
        original_context = _RUN.get() / 'review-context.json'
        expected_context = _pretty(context)
        try:
            unchanged = _custody_read(root, original_context)[1] == expected_context
        except (OSError, ValueError, OracleApprovalError):
            unchanged = False
        if not unchanged:
            context_file = _RUN.get() / 'unadopted-review-context.json'
            if context_file.exists() and _custody_read(root, context_file)[1] != expected_context:
                raise OracleApprovalError('Original review context archive conflicts with its sealed input')
            _atomic_write(context_file, expected_context)
    payload = {key: context[key] for key in ("series_id", "round", "mode", "base_commit", "candidate_tree", "guards", "previous_record_sha256")}
    verified_coverage = coverage if coverage is not None else context["reusable_coverage"]
    if validations is None:
        validations = list({item["evidence_path"]: item for item in
                            [*context["reusable_validations"], *context["current_validations"]]}.values())
    current_ledger = ledger if ledger is not None else context["prior_findings"]
    invalidations = dict(context["validation_invalidations"])
    for item in review.get("validations", []):
        if item["status"] == "INVALIDATED":
            name = item["evidence_path"]
            invalidations[name] = {"evidence_sha256": _invalidation_digest(context, name), "reason": item["reason"]}
    for item in validations:
        invalidations.pop(item["evidence_path"], None)
    failed_repairs = 0 if outcome == "APPROVED" else context["failed_repair_rounds"] + int(outcome == "REJECTED" and context["is_repair_round"])
    open_findings = [item for item in current_ledger.values() if item["state"] == "OPEN"]
    plan_path, plan_digest = None, None
    if failed_repairs >= 2 and open_findings:
        plan = "\n".join(f"{item['id']}: {item['required_behavior']} Repair: {item['recommendation']} Acceptance: "
                         + "; ".join(item["acceptance_checks"]) for item in open_findings) + "\n"
        directory = _series_directory(root, context["base_commit"])
        plan_path = str(directory / f"round-{context['round']:04d}-repair-plan.txt")
        _atomic_write(Path(plan_path), plan.encode()); plan_digest = _sha(plan.encode())
        _atomic_write(directory / "repair-plan.txt", plan.encode())
    payload.update(outcome=outcome, review=review, context_sha256=_sha(_canonical(context)),
                   assessment_admitted=ledger is not None,
                   context_file=str(context_file or _RUN.get() / "review-context.json"),
                   proposal_scope=context["proposal_scope"],
                   finding_ledger=current_ledger, validation_invalidations=invalidations,
                   is_repair_round=context["is_repair_round"], failed_repair_rounds=failed_repairs,
                   repair_plan_file=plan_path, repair_plan_sha256=plan_digest,
                   pending_review_paths=sorted(set(context["required_coverage_paths"]) -
                                               {item["path"] for item in verified_coverage}) if outcome in {"INCOMPLETE", "ERROR"} else [],
                   verified_coverage=verified_coverage,
                   verified_validations=validations)
    if raw_assessment is not None:
        payload["raw_assessment"] = raw_assessment
    record = dict(payload, record_sha256=_sha(_canonical(payload)))
    path = _series_directory(root, context["base_commit"]) / f"round-{context['round']:04d}.json"
    if path.exists():
        raise OracleApprovalError("Oracle review history round already exists")
    return path, record


def _record_round(root: Path, context: dict, review: dict, outcome: str, **proofs) -> Path:
    path, record = _prepare_round(root, context, review, outcome, **proofs)
    if __package__:
        from . import shipment_state
    else:
        import shipment_state
    shipment_state.observe_decision(root, record, path)
    _atomic_write(path, _pretty(record))
    return path


def _record_error(root: Path, context: dict, review: dict, error: BaseException, *, coverage=None, validations=None,
                  ledger=None, published_round: tuple[Path, dict] | None = None) -> None:
    _metadata_remove(root, receipt_path(root))
    context_file = None
    if published_round is None:
        possible = _series_directory(root, context["base_commit"]) / f"round-{context['round']:04d}.json"
        if possible.exists():
            raw = _custody_read(root, possible)[1]
            record = json.loads(raw)
            payload = {key: value for key, value in record.items() if key != "record_sha256"}
            if (raw != _pretty(record) or record.get("record_sha256") != _sha(_canonical(payload))
                    or record.get("context_sha256") != _sha(_canonical(context))):
                raise OracleApprovalError("Failed publication left a conflicting history record") from error
            published_round = possible, record
    if published_round and published_round[0].exists():
        # A history rename may succeed before the publishing operation raises.
        # Preserve that immutable event and supersede it with an ERROR checkpoint.
        record = published_round[1]
        if _custody_read(root, published_round[0])[1] != _pretty(record):
            raise OracleApprovalError("Failed publication left a conflicting history record") from error
        context = dict(context, round=context["round"] + 1, mode="resume",
                       previous_record_sha256=record["record_sha256"], previous_candidate_tree=context["candidate_tree"])
        context_file = _RUN.get() / "publication-error-context.json"
        _atomic_write(context_file, _pretty(context))
    outcome = "INCOMPLETE" if isinstance(error, OracleReviewIncomplete) else "ERROR"
    raw_assessment = None
    # The transport can publish its last message before raising or before a
    # diagnostic write fails. Retain those native bytes as unadopted output;
    # they have not passed the source/authority/coverage gates.
    if not isinstance(review, dict) or not review:
        try:
            captured = json.loads(_custody_read(root, _RUN.get() / "result.json")[1])
        except (OSError, ValueError, OracleApprovalError):
            captured = None
        if isinstance(captured, dict):
            review = captured
    if isinstance(review, dict) and review:
        result_file = _RUN.get() / "result.json"
        try:
            result_raw = _custody_read(root, result_file)[1] if result_file.is_file() else None
        except (OSError, OracleApprovalError):
            result_raw = None  # Unsafe output supplies no native-byte provenance.
        raw_assessment = {"actual_outcome": outcome, "reason": str(error),
                          "reported_review_status": review.get("review_status"),
                          "reported_verdict": review.get("verdict"), "assessment": review,
                          "result_file": str(result_file) if result_raw is not None else None,
                          "result_sha256": _sha(result_raw) if result_raw is not None else None}
    checkpoint = dict(review if ledger is not None else {}, error=str(error))
    if published_round:
        checkpoint["publication_failure"] = True
    _record_round(root, context, checkpoint, outcome, raw_assessment=raw_assessment,
                  coverage=coverage, validations=validations, ledger=ledger, context_file=context_file)


def _revoke_published_review(root: Path, run: Path, error: BaseException) -> None:
    """Final timing/outcome failures follow the same publication cleanup."""
    context_file = run / "review-context.json"
    if not receipt_path(root).exists() or not context_file.exists():
        return
    context = json.loads(_custody_read(root, context_file)[1])
    path = _series_directory(root, context["base_commit"]) / f"round-{context['round']:04d}.json"
    if not path.exists():
        _metadata_remove(root, receipt_path(root))
        return
    record = json.loads(_custody_read(root, path)[1])
    if record.get("context_sha256") != _sha(_canonical(context)):
        raise OracleApprovalError("Final metadata failure has conflicting history custody") from error
    _record_error(root, context, record["review"], error, coverage=record["verified_coverage"],
                  validations=record["verified_validations"], ledger=record["finding_ledger"],
                  published_round=(path, record))


def _vault_evidence(root: Path, paths: list[str]) -> Path:
    # One sync/query/manifest child avoids a second native initialization.
    # The required semantic query remains the first query in the package.
    command = [sys.executable, "tools/vault_index.py", "evidence", VAULT_QUERY]
    if paths:
        command += ["--supplemental", "Oracle candidate " + " ".join(paths)
                    + " known regression Issue #0008 named lead graph omission Issue #0026 focused student exception"]
    completed = _timed("vault_preparation_seconds", lambda: subprocess.run(
        command, cwd=root, capture_output=True, text=True))
    run = _RUN.get()
    _atomic_write(run / "vault-stdout.log", completed.stdout.encode())
    _atomic_write(run / "vault-stderr.log", completed.stderr.encode())
    if completed.returncode:
        raise OracleApprovalError("Vault evidence preparation failed; diagnostics retained at " + str(run))
    evidence = json.loads(completed.stdout)
    path = run / "vault-query.json"
    _atomic_write(path, _pretty(evidence))
    return path


def _validate_api_version_assessment(assessment: Any, verdict: str, root: Path | None = None, evidence: dict | None = None) -> None:
    fields = {"impact", "request_kind", "requested_change", "request_quote", "request_evidence"}
    if not isinstance(assessment, dict) or set(assessment) != fields:
        raise OracleApprovalError("Oracle lacks the exact API version assessment")
    impact, kind = assessment["impact"], assessment["request_kind"]
    if impact == "NONE":
        if kind != "NOT_REQUIRED" or any(assessment[field] is not None for field in fields - {"impact", "request_kind"}):
            raise OracleApprovalError("Unchanged API version requires NOT_REQUIRED and null request fields")
        return
    if impact != "CHANGE" or kind not in {"EXPLICIT_REQUEST", "APPROVAL_ONLY", "MISSING"}:
        raise OracleApprovalError("Oracle API version request classification is invalid")
    for field in fields - {"impact", "request_kind"}:
        if assessment[field] is not None and (not isinstance(assessment[field], str) or not assessment[field].strip()):
            raise OracleApprovalError("API version request fields must be nonempty text or null")
    if verdict == "APPROVED" and kind != "EXPLICIT_REQUEST":
        raise OracleApprovalError("API version change requires the human explicit request; approval can never substitute")
    if kind != "EXPLICIT_REQUEST":
        return
    if any(not assessment[field] for field in fields - {"impact", "request_kind"}):
        raise OracleApprovalError("API version change lacks exact requested scope, direct quote or request evidence")
    request_path = Path(assessment["request_evidence"])
    if not request_path.is_absolute():
        raise OracleApprovalError("API version request evidence must be an absolute supplied evidence path")
    if root is not None:
        supplied = {(Path(name) if Path(name).is_absolute() else root / name).resolve() for name in (evidence or {})}
        if request_path.resolve() not in supplied:
            raise OracleApprovalError("API version request evidence was not supplied through --evidence")
        try:
            text = _custody_read(root, request_path)[1].decode() if root is not None else request_path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            raise OracleApprovalError("API version request evidence is unavailable") from exc
        if assessment["request_quote"] not in text:
            raise OracleApprovalError("Direct API version request quote does not match supplied evidence")


def _shape(receipt: dict[str, Any]) -> dict[str, Any]:
    required = {"schema_version","issuer","verdict","base_commit","candidate_tree","changed_paths","authority_digests","authentication_impact","owner_approval_status","validation_evidence","owner_approval_evidence","review_digest","approval_id","api_version_assessment"}
    if set(receipt) not in (required, required | {"publication_scope", "protected_effects"}): raise OracleApprovalError("Oracle receipt fields do not match the current review contract")
    payload = {k: v for k, v in receipt.items() if k != "approval_id"}
    if receipt["approval_id"] != _sha(_canonical(payload)): raise OracleApprovalError("Oracle approval receipt ID is invalid")
    if payload["schema_version"] != SCHEMA_VERSION or payload["issuer"] != ISSUER or payload["verdict"] != "APPROVED": raise OracleApprovalError("Oracle receipt identity is invalid")
    impact, status = payload["authentication_impact"], payload["owner_approval_status"]
    if status not in {"NOT_REQUIRED", "APPROVED", "MISSING", "INVALID"}: raise OracleApprovalError("Oracle receipt has invalid legacy owner status")
    if impact not in {"AUTHENTICATION", "NONE"}: raise OracleApprovalError("Oracle receipt lacks authentication classification")
    _validate_api_version_assessment(payload["api_version_assessment"], payload["verdict"])
    return payload

def _read_local(root: Path) -> tuple[dict[str, Any], bytes]:
    try: raw = _custody_read(root, str(receipt_path(root)))[1]; receipt = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc: raise OracleApprovalError("Local Oracle receipt is missing or invalid") from exc
    if not isinstance(receipt, dict) or raw != _pretty(receipt): raise OracleApprovalError("Oracle receipt is not canonical pretty JSON")
    return receipt, raw

def _receipt_origin(root: Path, payload: dict, directory: Path, records: Sequence[dict]) -> dict:
    for record in reversed(records):
        path = directory / f"round-{record['round']:04d}.json"
        if (record.get("outcome") == "APPROVED" and record.get("review", {}).get("review_status") == "COMPLETE"
                and record["base_commit"] == payload["base_commit"] and record["candidate_tree"] == payload["candidate_tree"]
                and _sha(_canonical(record["review"])) == payload["review_digest"]
                and payload["validation_evidence"].get(_custody_name(root, path)) == _sha(_pretty(record))):
            return record
    raise OracleApprovalError("Oracle receipt is not bound to its exact managed approved origin")


def _receipt_current_context(root: Path, payload: dict, pending_evidence: dict[str, bytes], *, validation_base: str | None = None) -> tuple[dict, Path]:
    """Select live manifests through the managed native round, preserving history."""
    directory = _series_directory(root, payload["base_commit"])
    records = _read_rounds(directory)
    for name, raw in pending_evidence.items():
        path = Path(name) if Path(name).is_absolute() else root / name
        expected = directory / f"round-{len(records) + 1:04d}.json"
        if path.resolve() != expected.resolve() or path.exists():
            raise OracleApprovalError("Prospective Oracle evidence is not the next managed review round")
        try:
            record = json.loads(raw)
            body = {key: value for key, value in record.items() if key != "record_sha256"}
            valid = (raw == _pretty(record) and record["round"] == len(records) + 1
                     and record["previous_record_sha256"] == (records[-1]["record_sha256"] if records else None)
                     and record["record_sha256"] == _sha(_canonical(body)))
        except (ValueError, KeyError, AttributeError, TypeError) as exc:
            raise OracleApprovalError("Prospective Oracle review round is malformed") from exc
        if not valid:
            raise OracleApprovalError("Prospective Oracle review round binding is invalid")
        records.append(record)
    if not records:
        raise OracleApprovalError("Oracle receipt lacks managed review provenance")
    record = _receipt_origin(root, payload, directory, records)
    round_path = directory / f"round-{record['round']:04d}.json"
    round_name = str(round_path.relative_to(root))
    evidence = payload["validation_evidence"]
    if _later_support_invalidation(record, records, evidence):
        raise OracleApprovalError("Oracle receipt original native support was explicitly invalidated")
    try:
        path = Path(os.path.abspath(record["context_file"]))
        if (not path.is_relative_to(_git_file(root, "oracle/runs"))
                or path.name != "review-context.json"):
            raise OracleApprovalError("Oracle current context is outside managed native review custody")
        context_raw = _custody_read(root, str(path))[1]
        context_name = str(path.relative_to(root))
        context = json.loads(context_raw)
        valid = (evidence.get(context_name) == _sha(context_raw)
                 and context.get("kind") == "oracle-review-context-v1"
                 and record["context_sha256"] == _sha(_canonical(context))
                 and all(record[key] == context[key] for key in
                         ("series_id", "round", "mode", "base_commit", "candidate_tree", "guards", "previous_record_sha256")))
    except (OSError, ValueError, KeyError, AttributeError, TypeError) as exc:
        raise OracleApprovalError("Oracle current review context provenance is malformed") from exc
    if not valid:
        raise OracleApprovalError("Oracle current review context binding is invalid")
    selected_proposal = context.get("proposal_record")
    if selected_proposal is not None and _custody_read(root, selected_proposal["path"])[0]["sha256"] != selected_proposal["sha256"]:
        raise OracleApprovalError("Oracle sealed proposal custody changed")
    if verify_proposal(root, selected_proposal["path"] if selected_proposal else None)["proposal_sha256"] != context["proposal_scope"]["sha256"]:
        raise OracleApprovalError("Oracle approval proposal scope changed")
    for proof in record["verified_validations"]:
        _validation_record(root, proof["evidence_path"], proof["inputs"], proof["environment_digest"],
                           check_environment=False, **({"expected_base": validation_base} if validation_base is not None else {}))
    return context, path


def _verify_receipt(root: Path, receipt: dict, raw: bytes, *, pending_evidence: dict[str, bytes] | None = None) -> tuple[dict[str, Any], bytes]:
    payload = _shape(receipt)
    base, tree = _git(root, "rev-parse", "HEAD").strip(), _tree(root)
    if payload["base_commit"] != base: raise OracleApprovalError("Oracle receipt is bound to another base")
    if payload["candidate_tree"] != tree: raise OracleApprovalError("Oracle receipt is stale for the staged tree")
    if payload["changed_paths"] != _paths(root, base, tree): raise OracleApprovalError("Oracle changed-path binding is invalid")
    if payload["authority_digests"] != _authorities(root, tree): raise OracleApprovalError("Oracle authority binding is invalid")
    evidence = payload["validation_evidence"]
    if not isinstance(evidence, dict):
        raise OracleApprovalError("Oracle validation evidence changed")
    pending_evidence = pending_evidence or {}
    if not set(pending_evidence).issubset(evidence):
        raise OracleApprovalError("Prospective Oracle evidence is absent from receipt")
    actual_evidence = _files(root, [name for name in evidence if name not in pending_evidence])
    actual_evidence.update({name: _sha(value) for name, value in pending_evidence.items()})
    if evidence != actual_evidence:
        raise OracleApprovalError("Oracle validation evidence changed")
    if "publication_scope" in payload:
        current_scope = _publication_scope(root, tree)
        current_scope["prior_effects"] = [row for row in current_scope["prior_effects"] if row["origin"] != _sha(raw)]
        if payload["publication_scope"] != current_scope:
            raise OracleApprovalError("Oracle publication source range changed")
        _protected_effects({"protected_effects": payload["protected_effects"]}, payload["publication_scope"])
    context, context_path = _receipt_current_context(root, payload, pending_evidence)
    _assert_raw_sources(root, context)
    _validate_api_version_assessment(payload["api_version_assessment"], payload["verdict"], root, evidence)
    owner = payload["owner_approval_evidence"]
    if owner is not None and (not isinstance(owner, dict) or owner != _files(root, list(owner))): raise OracleApprovalError("Oracle owner evidence changed")
    preparation_path = context_path.parent / "oracle-inputs.json"
    preparation_name = str(preparation_path.relative_to(root))
    model_name = str((context_path.parent / "model.json").relative_to(root))
    if preparation_path.exists() or preparation_name in evidence or model_name in evidence:
        if preparation_name not in evidence:
            raise OracleApprovalError("Oracle current native preparation is absent from receipt custody")
        preparation = json.loads(_custody_read(root, preparation_path)[1])
        if preparation.get("kind") != "oracle-preparation-v1":
            raise OracleApprovalError("Oracle preparation identity is invalid")
        binding = preparation["input_binding"]
        # Historical approval retains its recorded validation environment. A
        # later Git hook's ambient PATH does not change the approved source.
        _assert_binding(root, binding, binding["validation_evidence"], binding["owner_approval_evidence"], check_environment=False)
        for group in ("candidate_diff", "vault_evidence"):
            files = preparation[group]
            if files != _files(root, list(files)):
                raise OracleApprovalError("Oracle preparation evidence changed")
    return receipt, raw


def verify_staged(root: Path) -> tuple[dict[str, Any], bytes]:
    receipt, raw = _read_local(root)
    return _verify_receipt(root, receipt, raw)


def _oracle(root: Path, tree: str, paths: list[str], evidence: dict[str,str], owner: dict[str,str] | None) -> dict[str,Any]:
    # Configuration failures precede area preparation and reviewer timing. The
    # native attempt retains their structured failure without launching a cohort.
    try:
        selected_model(), selected_reasoning_effort()
    except (RuntimeError, ValueError) as exc:
        raise OracleApprovalError(
            f"Independent Oracle model resolution failed ({type(exc).__name__}): {exc}; "
            f"diagnostics retained at {_RUN.get()}"
        ) from exc
    if _RUN.get() and (_RUN.get() / "review-context.json").is_file():
        if __package__:
            from . import oracle_parallel
        else:
            import oracle_parallel
        return _timed("reviewer_seconds", lambda: oracle_parallel.review(
            sys.modules[__name__], root, tree, paths, evidence, owner))
    request = {"candidate_tree": tree, "changed_paths": paths, "validation_evidence": evidence, "owner_approval_evidence": owner}
    if _RUN.get() and (_RUN.get() / "review-context.json").is_file():
        request["review_context"] = str(_RUN.get() / "review-context.json")
    prompt = f"""You are the independent BOS Operations Center Oracle approval process.
Read .agents/skills/oracle/SKILL.md completely and wear that approver skill. Use the hash-bound oracle-inputs.json, candidate.diff and vault-query.json as navigation. Read applicable AGENTS.md/private Vault authorities and governing criteria first, before interpreting changes or validation results. On initial assessment make one complete pass over the commits being validated, issue history and relevant validation evidence. On follow-up or resume confirm changed criteria, then inspect new commits and apply the trusted execution policy to affected dependencies, open findings, unfinished coverage and sealed unchanged observations. Prepared retrieval never narrows required coverage. Only this process issues Oracle warnings and verdicts. Creating, bumping, replacing, or splitting a public API version requires the human user's explicit request for that exact version change. Owner approval, general fix/release authorization, inferred compatibility, pre-existing implementation, and Oracle guidance never substitute. Correct behavior and preserve authorized improvements in the current API version; package/build patches and identity-envelope protocols are distinct. Independently classify api_version_assessment: NONE requires NOT_REQUIRED and all request fields null; CHANGE requires EXPLICIT_REQUEST for APPROVED, exact requested_change, verbatim direct-user request_quote, and an absolute request_evidence path supplied through --evidence containing that quote. Independently inspect human provenance, context, exact scope and refusals; an agent assertion or approval-only statement is insufficient. Reject unrequested API version changes. An exact explicit request authorizes continuation through ordinary independent review without repeated owner approval. Authentication classification does not grant publication authority.
{LEAD_GRAPH_REVIEW}
{NORMAL_PLAN_REVIEW_POLICY}
{LOCAL_EXECUTION_POLICY}
{REVIEW_SERIES_POLICY}
{DEPLOYMENT_PLACEMENT_POLICY}
The structured review-context.json can be large: inspect its metadata/coverage with selective JSON reads, and select input_hashes only for relevant source/dependency paths. Inspect prior_native_assessment before rereading unchanged owner/authentication/public-API evidence: it projects the latest nonempty native classification, its immutable origin and factual candidate/guard comparisons, skipping ERROR records. It is historical evidence; independently assess current scope, changed inputs and all current gates before issuing a fresh verdict. Cover required_coverage_paths, including reverted repairs, removed files and pending unassessed changes retained through ERROR/INCOMPLETE. A repair finding affecting both changed and unchanged paths is REPAIR when changed behavior causes it. MISSED applies when the affected behavior, dependencies and requirements remained unchanged. Scope changes are explicit in proposal_scope/previous_proposal_scope and the @proposal/scope input; explain new requirements in origin_reason, reassess affected coverage and include that input in requirement-dependent coverage. Preserve unrelated verified coverage. COMPLETE uses limitations=[]; put nonblocking scope boundaries in summary. Validation VERIFIED or REUSED requires an oracle-validation-record-v1 produced by this utility's validate command, whose exact inputs, environment and retained outputs prove the result. Legacy prose/log evidence remains reviewable and cannot acquire reusable validation status by assertion.
For every required_commands entry, independently emit command_coverage with its exact id/argv, COMPLETE or INCOMPLETE, basis INDEPENDENT_APPLICABILITY, exact current source/test/dependency/configuration inputs including package.json, bound original evidence_paths, current environment_digest and reason. Independently combine actual preserved passing cases with focused repair proof only after checking original test/source/output hashes and environment applicability. Preserve a failed aggregate's original failure; command applicability is a separate current-candidate decision and never a fabricated passing execution witness. A declared platform-specific contract requires its actual platform evidence; a different CI operating system alone creates no new platform requirement. Missing/invalidated coverage remains INCOMPLETE and required work runs before publication. Proposals use command_coverage=[].
Return JSON matching the supplied schema. Classify authentication_impact as AUTHENTICATION or NONE. Technical approval never requires human deployment permission. Any review may report the applicable NOT_REQUIRED, APPROVED, MISSING or INVALID legacy owner status; this field grants no publication authority. Return protected_effects with active concrete effects and independently source-bound dispositions for the complete publication_scope. A missing permission is not a finding. Only APPROVED with no findings can issue a receipt.\n{json.dumps(request, indent=2, sort_keys=True)}"""
    return _review_process(root, prompt, "reviewer")

def _proposal_oracle(root: Path, request: str, evidence: dict[str,str], owner: dict[str,str] | None) -> dict[str,Any]:
    payload = {
        "proposal": request,
        "evidence": evidence,
        "owner_approval_evidence": owner,
    }
    prompt = f"""You are the independent BOS Operations Center Oracle proposal-review process.
Read .agents/skills/oracle/SKILL.md completely and wear that approver skill. Read AGENTS.md and all required private Vault authority. Review the proposed solution before implementation using current filesystem evidence. Operate read-only: do not edit, stage, commit, deploy, write an approval receipt, or treat this proposal verdict as completed-tree approval.
Approve only the immutable conceptual proposal, exact supplied evidence and governing criteria. Source-dependent observations describe the source actually examined; ordinary concurrent implementation can continue and its changed implementation/effect claims remain unadopted until complete-current-source review. Do not require a source freeze or grant completed-implementation authority through this proposal verdict.

Creating, bumping, replacing, or splitting a public API version requires the human user's explicit request for that exact version change. Owner approval, general fix/release authorization, inferred compatibility, pre-existing implementation, and Oracle guidance never substitute. Correct behavior and preserve authorized improvements in the current API version; package/build patches and identity-envelope protocols are distinct. Independently classify api_version_assessment: NONE requires NOT_REQUIRED and all request fields null; CHANGE requires EXPLICIT_REQUEST for APPROVED, exact requested_change, verbatim direct-user request_quote, and an absolute request_evidence path supplied through --evidence containing that quote. Independently inspect human provenance, context, exact scope and refusals; an agent assertion or approval-only statement is insufficient. Reject unrequested API version changes. An exact explicit request authorizes continuation through ordinary independent review without repeated owner approval. Authentication classification does not grant publication authority.
{LEAD_GRAPH_REVIEW}
{NORMAL_PLAN_REVIEW_POLICY}
{LOCAL_EXECUTION_POLICY}
Assess the complete proposal and consolidate every finding. Use review_status COMPLETE only when the proposal assessment is finished. Use INCOMPLETE or ERROR with limitations when assessment cannot finish; such outcomes never approve. For a proposal, coverage, validations and resolutions may be empty and repair_plan may be empty. Every finding still needs the schema's actionable detail and stable F001-style ID.
Return JSON matching the supplied schema. Verify the stated problem and cause, classify authentication_impact as AUTHENTICATION or NONE (NONE uses owner_approval_status NOT_REQUIRED), and reject architectural invention or a service/API-contract change presented as a client fix. Restoration of already-approved behavior may reuse exact existing owner approval; outside the explicit API-version request gate, missing human deployment permission never rejects a technical proposal. Identify any concrete protected publication effect separately; actual publication checks its scoped authority later. Return protected_effects with planned active effects and any applicable dispositions. An approved proposal allows the ordinary workflow to continue automatically within the user's existing task authorization; completed-tree Oracle review remains mandatory after implementation. Every finding must state concise Problem, Cause, and Recommended change sections with no more than three sentences each.
{json.dumps(payload, indent=2, sort_keys=True)}"""
    return _review_process(root, prompt, "proposal_reviewer")

def _proposal_guards(root: Path, evidence: dict, owner: dict | None) -> dict:
    authorities = _controlling_authorities(_live_authorities(root))
    names = [*evidence, *(owner or {}), *[name for name, digest in authorities.items() if digest is not None]]
    return {"authority_digests": authorities, "evidence": _files(root, list(evidence)),
            "owner_evidence": _files(root, list(owner)) if owner is not None else None,
            "custody": _custody_files(root, names)}


@_serialized_review
def review_proposal(root: Path, request: str, evidence_paths: Sequence[str], owner_path: str | None, reviewer: Callable = _proposal_oracle) -> dict[str,Any]:
    with _phase("precheck_seconds"):
        if not request.strip(): raise OracleApprovalError("Oracle proposal review requires a proposal")
        evidence = _files(root, evidence_paths)
        owner = _files(root, [owner_path]) if owner_path else None
        binding = _input_binding(root, evidence, owner)
        guards = _proposal_guards(root, evidence, owner)
        _atomic_write(_RUN.get() / "proposal-inputs.json", _pretty({"proposal_sha256": _sha(request.encode()),
            "guards": guards, "initial_commit": binding["base_commit"], "initial_tree": binding["candidate_tree"]}))
    selected_token = _PREPARED_SETTINGS.set(binding["reviewer_settings"])
    try:
        review = reviewer(root, request, evidence, owner)
    finally:
        _PREPARED_SETTINGS.reset(selected_token)
    if _timed("postcheck_seconds", lambda: _proposal_guards(root, evidence, owner)) != guards:
        raise OracleSourceBindingError("Oracle proposal evidence or governing criteria changed during review")
    if any(value is None for value in _declared_parent_authorities(root).values()):
        raise OracleApprovalError("A required declared parent authority is unavailable")
    if not isinstance(review, dict):
        raise OracleApprovalError("Independent Oracle proposal result is not an object")
    if reviewer is _proposal_oracle and review.get("review_status") != "COMPLETE":
        if review.get("review_status") == "INCOMPLETE":
            raise OracleReviewIncomplete("Independent Oracle proposal assessment is incomplete: " + review.get("summary", ""))
        raise OracleApprovalError("Independent Oracle proposal assessment failed or lacks review_status")
    if review.get("verdict") not in {"APPROVED", "REJECTED"}:
        raise OracleApprovalError("Independent Oracle proposal review returned no verdict")
    if review["verdict"] == "APPROVED":
        if review.get("authentication_impact") not in {"NONE", "AUTHENTICATION"} or review.get("owner_approval_status") not in {"NOT_REQUIRED", "APPROVED", "MISSING", "INVALID"}:
            raise OracleApprovalError("Oracle proposal approval classification is invalid")
        if not isinstance(review.get("findings"), list) or review["findings"]:
            raise OracleApprovalError("Oracle approved proposal contains findings or lacks a finding list")
    _validate_api_version_assessment(review.get("api_version_assessment"), review["verdict"], root, evidence)
    payload = {
        "schema_version": SCHEMA_VERSION,
        "issuer": ISSUER,
        "kind": "proposal-review",
        "base_commit": binding["base_commit"],
        "review_scope": "CONCEPTUAL_PROPOSAL",
        "source_observations": {"initial_commit": binding["base_commit"], "initial_tree": binding["candidate_tree"],
            "final_commit": _git(root, "rev-parse", "HEAD").strip(), "final_tree": _tree(root),
            "initial_working_diff_sha256": binding["working_diff_sha256"],
            "final_working_diff_sha256": _sha(_git_bytes(root, "diff", "HEAD", "--", ".", ":(exclude)Vault")),
            "unadopted_delta_paths": _paths(root, binding["candidate_tree"], _tree(root)),
            "implementation_readiness": "REQUIRES_COMPLETE_CURRENT_SOURCE_REVIEW"},
        "authority_digests": binding["authority_digests"],
        "proposal": request,
        "proposal_sha256": _sha(request.encode()),
        "evidence": evidence,
        "owner_approval_evidence": owner,
        "review": review,
        "review_process": json.loads(_custody_read(root, _RUN.get() / "model.json")[1])
                          if (_RUN.get() / "model.json").is_file() else None,
    }
    # Proposal refreshes remain in the same unfinished descendant lifecycle.
    # Preserve the previous proposal bytes as evidence before replacing its pointer.
    previous_path = proposal_path(root)
    if previous_path.exists():
        previous_raw = _custody_read(root, previous_path)[1]
        previous = json.loads(previous_raw)
        previous_body = {key: value for key, value in previous.items() if key != "proposal_review_id"}
        if (previous_raw != _pretty(previous)
                or previous.get("proposal_review_id") != _sha(_canonical(previous_body))):
            raise OracleApprovalError("Previous proposal custody changed")
        _archive_proposal(root, previous_raw)
        if previous.get("review", {}).get("verdict") == "APPROVED":
            _record_lifecycle_origin(root, previous_raw)
            payload["lifecycle_origin"] = _proposal_origin(root, previous, payload["base_commit"])
        elif (receipt_path(root).parent / "lifecycle-origin.json").exists():
            payload["lifecycle_origin"] = _proposal_origin(root, previous, payload["base_commit"])
    payload.setdefault("lifecycle_origin", payload["base_commit"])
    record = dict(payload, proposal_review_id=_sha(_canonical(payload)))
    path = proposal_path(root)
    _atomic_write(_RUN.get() / "prospective-proposal.json", _pretty(record))
    _archive_proposal(root, _pretty(record))
    if review["verdict"] == "APPROVED":
        _record_lifecycle_origin(root, _pretty(record))
    _atomic_write(path, _pretty(record))
    _metadata_remove(root, receipt_path(root))
    return review


def _archive_proposal(root: Path, raw: bytes) -> Path:
    path = receipt_path(root).parent / "proposals" / (_sha(raw) + ".json")
    if path.exists():
        if _custody_read(root, path)[1] != raw:
            raise OracleApprovalError("Immutable proposal archive changed")
    else:
        _atomic_write(path, raw)
    return path

def verify_proposal(root: Path, record_path: str | Path | None = None) -> dict:
    try:
        raw = _custody_read(root, record_path or proposal_path(root))[1]
        if record_path is not None and _custody_name(root, record_path) != _custody_name(root, receipt_path(root).parent / "proposals" / (_sha(raw) + ".json")):
            raise OracleApprovalError("Selected proposal must be its immutable owner-local archive")
        record = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc:
        raise OracleApprovalError("Oracle review requires a prior proposal review") from exc
    if not isinstance(record, dict) or raw != _pretty(record):
        raise OracleApprovalError("Oracle proposal record is not canonical")
    payload = {key: value for key, value in record.items() if key != "proposal_review_id"}
    if record.get("proposal_review_id") != _sha(_canonical(payload)):
        raise OracleApprovalError("Oracle proposal review record binding is invalid")
    if (record.get("schema_version") != SCHEMA_VERSION or record.get("issuer") != ISSUER
            or record.get("kind") != "proposal-review"
            or subprocess.run(["git", "merge-base", "--is-ancestor", record.get("base_commit", ""),
                               _git(root, "rev-parse", "HEAD").strip()], cwd=root,
                              capture_output=True).returncode != 0):
        raise OracleApprovalError("Oracle proposal review is not bound to this base")
    if record.get("proposal_sha256") != _sha(record.get("proposal", "").encode()):
        raise OracleApprovalError("Oracle proposal content binding is invalid")
    review = record.get("review", {})
    if review.get("verdict") != "APPROVED" or review.get("findings"):
        raise OracleApprovalError("Oracle review requires an approved proposal")
    impact, status = review.get("authentication_impact"), review.get("owner_approval_status")
    if impact not in {"NONE", "AUTHENTICATION"} or status not in {"NOT_REQUIRED", "APPROVED", "MISSING", "INVALID"}:
        raise OracleApprovalError("Oracle proposal approval classification is invalid")
    # A prior proposal remains supporting scope/history after authority changes.
    # Completed review binds current authorities and independently reassesses
    # affected criteria; this proposal never grants candidate approval.
    evidence, owner = record.get("evidence"), record.get("owner_approval_evidence")
    if not isinstance(evidence, dict) or evidence != _files(root, list(evidence)):
        raise OracleApprovalError("Oracle proposal evidence changed")
    if owner is not None and (not isinstance(owner, dict) or owner != _files(root, list(owner))):
        raise OracleApprovalError("Oracle proposal owner evidence changed")
    _validate_api_version_assessment(review.get("api_version_assessment"), review["verdict"], root, evidence)
    return {"verdict": "APPROVED", "base_commit": record["base_commit"],
            "lifecycle_origin": _proposal_origin(root, record, _git(root, "rev-parse", "HEAD").strip()),
            "proposal_sha256": record["proposal_sha256"]}


@_serialized_review
def issue(root: Path, evidence_paths: Sequence[str], owner_path: str | None, reviewer: Callable = _oracle,
          *, proposal_record: str | Path | None = None) -> dict[str,Any]:
    with _phase("precheck_seconds"):
        pending = [p for p in (_git(root,"diff","--name-only").splitlines()+_git(root,"ls-files","--others","--exclude-standard").splitlines()) if not p.startswith("Vault/")]
        if pending: raise OracleApprovalError("Oracle review requires every non-Vault change staged: " + ", ".join(sorted(pending)))
        if subprocess.run(["git","diff","--cached","--check"], cwd=root).returncode: raise OracleApprovalError("Staged diff failed git diff --check")
        base, tree = _git(root,"rev-parse","HEAD").strip(), _tree(root); paths = _paths(root,base,tree)
        if not paths and not _publication_scope(root, tree)["range_paths"]:
            raise OracleApprovalError("Oracle cannot approve an empty candidate")
        _metadata_remove(root, receipt_path(root))
        verify_proposal(root, proposal_record)
        proposal_raw = _custody_read(root, proposal_record or proposal_path(root))[1]
        proposal = _archive_proposal(root, proposal_raw)
        origin_record = _record_lifecycle_origin(root, proposal_raw)
        complete_evidence = [*evidence_paths, str(proposal), str(origin_record)]
        evidence, owner = _files(root, complete_evidence), (_files(root, [owner_path]) if owner_path else None)
    with _phase("preparation_seconds"):
        binding = _input_binding(root, evidence, owner)
        assessment_paths = sorted(set(paths) | set(binding["publication_scope"]["range_paths"]))
        authorities = _authorities(root, tree)
        if reviewer is _oracle:
            vault = _vault_evidence(root, assessment_paths)
            _assert_binding(root, binding, evidence, owner)
            run = _RUN.get()
            diff = run / "candidate.diff"
            _atomic_write(diff, _git_bytes(root, "diff", "--binary", "--full-index",
                                          binding["publication_scope"]["baseline_commit"], tree))
            preparation = run / "oracle-inputs.json"
            _atomic_write(preparation, _pretty({"kind": "oracle-preparation-v1", "input_binding": binding,
                                               "changed_paths": assessment_paths, "candidate_diff": _files(root, [str(diff)]),
                                               "vault_evidence": _files(root, [str(vault)])}))
            complete_evidence += [str(vault), str(diff), str(preparation)]
            evidence = _files(root, complete_evidence)
        controller = _CONTROLLER.get()
        if reviewer is _oracle and controller:
            # Vault/source preparation can take longer than evidence producers.
            # Consume arrivals before sealing the actual reviewer packet.
            complete_evidence += controller.evidence()
            evidence = _files(root, list(dict.fromkeys(complete_evidence)))
            binding = _input_binding(root, evidence, owner)
        context = _review_context(root, tree, paths, binding, evidence, proposal_record=proposal)
        registered_evidence = context["registered_validation_evidence"]
        if registered_evidence != _files(root, list(registered_evidence)):
            raise OracleApprovalError("Retained validation evidence changed during preparation")
        evidence.update(registered_evidence)
        retained_observations = context["retained_observation_evidence"]
        if retained_observations != _files(root, list(retained_observations)):
            raise OracleApprovalError("Retained observation evidence changed during preparation")
        evidence.update(retained_observations)
        for item in [*context["reusable_validations"], *context["current_validations"]]:
            record = _validation_record(root, item["evidence_path"], item["inputs"], item["environment_digest"])
            evidence.update(_files(root, [item["evidence_path"], *record["output_hashes"]]))
        evidence.update(_files(root, [str(_RUN.get() / "review-context.json")]))
        review_binding = _input_binding(root, evidence, owner)
    review, coverage, validations, ledger = {}, None, None, None
    prepared_approval = None
    try:
        if reviewer is _oracle:
            late = controller.evidence() if controller else []
            if late:
                raise OracleIntakeIncomplete("Queued evidence arrived after context capture; rebind before workers",
                                             evidence_paths=late)
            if context["base_commit"] != review_binding["base_commit"] or context["candidate_tree"] != review_binding["candidate_tree"]:
                raise OracleSourceBindingError("Prepared reviewer source moved before dispatch; retained original context")
        selected_token = _PREPARED_SETTINGS.set(review_binding["reviewer_settings"])
        try:
            review = reviewer(root,tree,assessment_paths,evidence,owner)
        finally:
            _PREPARED_SETTINGS.reset(selected_token)
        _timed("postcheck_seconds", lambda: _assert_binding(root, review_binding, evidence, owner))
        _assert_raw_sources(root, context)
        coverage, validations, ledger = _validate_completed_review(root, review, context, evidence)
        outcome = review["review_status"] if review["review_status"] != "COMPLETE" else review["verdict"]
        if reviewer is _oracle:
            # Selected process settings are part of exact approval custody.
            evidence.update(_files(root, [str(_RUN.get() / "model.json")]))
            parallel = _RUN.get() / "cohort-evidence.json"
            if parallel.exists():
                raw = _custody_read(root, parallel)[1]
                cohort = json.loads(raw)
                payload = {key: value for key, value in cohort.items() if key != "evidence_sha256"}
                if (cohort.get("kind") != "boc-parallel-review-evidence-v1"
                        or cohort.get("evidence_sha256") != _sha(_canonical(payload))
                        or cohort.get("candidate_commit") != base or cohort.get("candidate_tree") != tree
                        or cohort.get("artifacts") != _files(root, list(cohort.get("artifacts", {})))):
                    raise OracleApprovalError("Independent cohort evidence changed before native admission")
                evidence.update(cohort["artifacts"])
                evidence.update(_files(root, [str(parallel)]))
        if outcome == "APPROVED":
            _validate_api_version_assessment(review.get("api_version_assessment"), "APPROVED", root, evidence)
            impact, status = review.get("authentication_impact"), review.get("owner_approval_status")
            if status not in {"NOT_REQUIRED", "APPROVED", "MISSING", "INVALID"}:
                raise OracleApprovalError("Oracle candidate has invalid legacy owner status")
            effects = _protected_effects(review, binding["publication_scope"], context, native=reviewer is _oracle)
            if impact not in {"NONE", "AUTHENTICATION"}:
                raise OracleApprovalError("Oracle candidate lacks authentication classification")
            prepared_approval = _prepare_round(root, context, review, "APPROVED", coverage=coverage, validations=validations, ledger=ledger)
            round_path, round_record = prepared_approval
            round_name = str(round_path.relative_to(root)) if round_path.is_relative_to(root) else str(round_path)
            round_raw = _pretty(round_record)
            evidence[round_name] = _sha(round_raw)
            payload = {"schema_version":SCHEMA_VERSION,"issuer":ISSUER,"verdict":"APPROVED","base_commit":base,"candidate_tree":tree,"changed_paths":paths,"authority_digests":authorities,"authentication_impact":impact,"owner_approval_status":status,"validation_evidence":evidence,"owner_approval_evidence":owner,"review_digest":_sha(_canonical(review)),"api_version_assessment":review["api_version_assessment"],"publication_scope":binding["publication_scope"],"protected_effects":effects}
            receipt = dict(payload, approval_id=_sha(_canonical(payload)))
            receipt_raw = _pretty(receipt)
            # Verify every gate and actual custody before publishing approval;
            # only the exact prospective history bytes are not yet on disk.
            _verify_receipt(root, receipt, receipt_raw, pending_evidence={round_name: round_raw})
            _assert_binding(root, review_binding, review_binding["validation_evidence"], owner)
            # Recheck every consumed witness at the publication boundary,
            # including its referenced outputs and explicitly inherited env.
            for proof in validations:
                _validation_record(root, proof["evidence_path"], proof["inputs"], proof["environment_digest"])
            _assert_raw_sources(root, context)
            # Until the required round is published, this receipt fails custody.
            _atomic_write(receipt_path(root), receipt_raw)
            _atomic_write(round_path, round_raw)
            if __package__:
                from . import shipment_state
            else:
                import shipment_state
            shipment_state.observe_decision(root, round_record, round_path,
                                            technical_receipt_sha256=_sha(receipt_raw),
                                            publication_scope=binding["publication_scope"],
                                            validation_evidence=receipt["validation_evidence"])
            archive = _technical_archive(root, _sha(receipt_raw))
            if archive.exists() and _custody_read(root, archive)[1] != receipt_raw:
                raise OracleApprovalError("Immutable technical receipt archive conflict")
            _atomic_write(archive, receipt_raw)
            if tree == _git(root, "rev-parse", base + "^{tree}").strip():
                history = {"kind": "oracle-committed-history-v1", "commit": base, "tree": tree,
                           "receipt_sha256": _sha(receipt_raw), "round_file": str(round_path.relative_to(root)),
                           "round_sha256": _sha(round_raw)}
                history = dict(history, history_sha256=_sha(_canonical(history)))
                history_path = receipt_path(root).parent / "committed-history" / base / (_sha(receipt_raw) + ".json")
                if history_path.exists() and _custody_read(root, history_path)[1] != _pretty(history):
                    raise OracleApprovalError("Immutable committed effect history conflict")
                _atomic_write(history_path, _pretty(history))
            return receipt
        round_path = _record_round(root, context, review, outcome, coverage=coverage, validations=validations, ledger=ledger)
    except BaseException as exc:
        if isinstance(exc, OracleSourceBindingError):
            # A late source binding failure cannot introduce fresh coverage or
            # activate findings/resolutions from its unadopted assessment.
            coverage, ledger = context["reusable_coverage"], None
        _record_error(root, context, review, exc, coverage=coverage, validations=validations, ledger=ledger,
                      published_round=prepared_approval)
        raise
    if review["review_status"] == "INCOMPLETE":
        raise OracleReviewIncomplete("Independent Oracle assessment is incomplete; checkpoint retained at " + str(round_path))
    if review["review_status"] == "ERROR":
        raise OracleApprovalError("Independent Oracle assessment failed; diagnostics retained at " + str(round_path))
    if review.get("verdict") != "APPROVED" or review.get("findings"):
        details = [f"{item['id']} {item['file']}:{item['line']}: {item['message']}\n"
                   f"Cause: {item['root_cause']}\nReproduce: {item['reproduction']}\n"
                   f"Required behavior: {item['required_behavior']}\nRepair: {item['recommendation']}\n"
                   "Acceptance: " + "; ".join(item['acceptance_checks']) for item in review.get("findings", [])]
        plan = json.loads(_custody_read(root, round_path)[1]).get("repair_plan_file")
        raise OracleCandidateRejected("Independent Oracle rejected the candidate\n" + "\n\n".join(details)
                                      + ("\nConsolidated repair plan before the next repair: " + plan if plan else "")
                                      + "\nReview history: " + str(round_path))


def trailer_values(root: Path) -> dict[str,str]:
    receipt, raw = verify_staged(root)
    return {TRAILER_KEYS[0]:"APPROVED",TRAILER_KEYS[1]:receipt["candidate_tree"],TRAILER_KEYS[2]:_sha(raw)}

def _trailers(message: str) -> dict[str,str]:
    result = {}
    for key in TRAILER_KEYS:
        values = re.findall(rf"(?m)^{re.escape(key)}:\s*(\S+)\s*$", message)
        if len(values) != 1: raise OracleApprovalError(f"Commit has invalid {key} trailer")
        result[key] = values[0]
    return result

def apply_trailers(root: Path, path: Path) -> None:
    values = trailer_values(root); lines = [line for line in path.read_text().splitlines() if line.partition(":")[0] not in TRAILER_KEYS]
    while lines and not lines[-1].strip(): lines.pop()
    lines += ["", *(f"{key}: {values[key]}" for key in TRAILER_KEYS)]; path.write_text("\n".join(lines)+"\n")

def verify_message(root: Path, path: Path) -> None:
    if _trailers(path.read_text()) != trailer_values(root): raise OracleApprovalError("Commit trailers do not match Oracle evidence")

def _verify_historical_commit(root: Path, commit: str, tree: str, *, expected_digest: str | None = None) -> None:
    # Consult applicable originals before considering remote recovery.
    # Execution-only suffixes cannot erase a complete native checkpoint.
    if any(expected_digest is None or _sha(raw) == expected_digest for _, raw in _committed_receipts(root, commit)):
        return
    directory = _series_directory(root, _git(root, "rev-parse", "HEAD").strip())
    decisions = [row for row in _read_rounds(directory)
                 if row["base_commit"] == commit and row["candidate_tree"] == tree]
    originals = [row for row in decisions if row["outcome"] == "APPROVED"
                 and row.get("review", {}).get("review_status") == "COMPLETE"]
    if originals and all(_later_support_invalidation(row, decisions) for row in originals):
        raise OracleApprovalError("Commit original native support was explicitly invalidated")
    if not originals:
        if __package__:
            from . import shipment_state
        else:
            import shipment_state
        if any(any(shipment_state._decision_facts(row)) for row in decisions):
            raise OracleApprovalError("Commit has admitted native defects or support invalidation")
    # A published fresh clone uses the existing trusted exact-SHA transport;
    # local approved candidates above remain entirely credential-free.
    baseline = subprocess.run(["git", "merge-base", "--is-ancestor", commit, "refs/remotes/origin/main"],
                              cwd=root, capture_output=True)
    if baseline.returncode:
        raise OracleApprovalError("Commit has no verified native approval or valid Oracle-Verdict trailer")
    if __package__:
        from . import publication_status
    else:
        import publication_status
    try:
        published = publication_status.verify_publication(root, commit, wait_seconds=0)
        if expected_digest is not None and published["technical_receipt_sha256"] != expected_digest:
            raise OracleApprovalError("Published receipt differs from the exact commit trailer")
        archive = _technical_archive(root, published["technical_receipt_sha256"])
        fact, raw = _custody_read(root, archive, allow_absent=True)
        if fact["source"].get("exists"):
            recovered = json.loads(raw)
            payload = _shape(recovered)
            if (fact["source"].get("links") or raw != _pretty(recovered)
                    or _sha(raw) != archive.stem or payload["candidate_tree"] != tree):
                raise OracleApprovalError("Published native receipt identity changed")
            origin, native_rounds = _archived_origin(root, payload)
            if _later_support_invalidation(origin, native_rounds, payload["validation_evidence"]):
                raise OracleApprovalError("Published original native support was explicitly invalidated")
    except (OSError, ValueError, subprocess.CalledProcessError) as exc:
        raise OracleApprovalError("Published commit native approval verification failed") from exc
    return


def verify_commit(root: Path, commit: str) -> None:
    commit = _git(root,"rev-parse",f"{commit}^{{commit}}").strip(); tree = _git(root,"show","-s","--format=%T",commit).strip(); message = _git(root,"show","-s","--format=%B",commit); parents = _git(root,"show","-s","--format=%P",commit).split()
    if len(parents) > 1:
        if len(parents) != 2: raise OracleApprovalError("Oracle accepts only two-parent GitHub merge commits")
        verify_commit(root, parents[1])
        approved_tree = _git(root,"show","-s","--format=%T",parents[1]).strip()
        if tree != approved_tree: raise OracleApprovalError("Merge commit tree differs from the Oracle-approved pull-request tree")
        return
    if not any(re.search(rf"(?m)^{re.escape(key)}:", message) for key in TRAILER_KEYS):
        _verify_historical_commit(root, commit, tree)
        return
    trailers = _trailers(message)
    if trailers[TRAILER_KEYS[0]] != "APPROVED" or trailers[TRAILER_KEYS[1]] != tree: raise OracleApprovalError("Commit Oracle accepted-state trailers are invalid")
    digest = trailers[TRAILER_KEYS[2]]
    if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest): raise OracleApprovalError("Commit Oracle receipt digest is invalid")
    archive = _technical_archive(root, digest)
    fact, raw = _custody_read(root, archive, allow_absent=True)
    if not fact["source"].get("exists"):
        _verify_historical_commit(root, commit, tree, expected_digest=digest)
        return
    receipt = json.loads(raw)
    _shape(receipt)
    lineage = subprocess.run(["git", "merge-base", "--is-ancestor", receipt["base_commit"], commit],
                             cwd=root, capture_output=True)
    if (fact["source"].get("links") or raw != _pretty(receipt) or _sha(raw) != digest
            or receipt["candidate_tree"] != tree or lineage.returncode):
        raise OracleApprovalError("Commit trailer lacks exact native receipt source/provenance")
    origin, rounds = _archived_origin(root, receipt)
    committed_origin = dict(origin, base_commit=commit)
    if (_later_support_invalidation(origin, rounds, receipt["validation_evidence"])
            or _later_support_invalidation(committed_origin, rounds, receipt["validation_evidence"])):
        raise OracleApprovalError("Commit trailer original native support was explicitly invalidated")

def verify_range(root: Path, start: str, end: str) -> None:
    if set(start) == {"0"}:
        adopted = subprocess.run(["git","merge-base","--is-ancestor",ADOPTION_BASE_COMMIT,end], cwd=root).returncode == 0
        revision = f"{ADOPTION_BASE_COMMIT}..{end}" if adopted else end
    else:
        revision = f"{start}..{end}"
    for commit in _git(root,"rev-list","--reverse",revision).splitlines(): verify_commit(root,commit)

def main(argv: Sequence[str] | None = None) -> int:
    p=argparse.ArgumentParser(); sub=p.add_subparsers(dest="cmd",required=True)
    review=sub.add_parser("review"); review.add_argument("--evidence",action="append",default=[]); review.add_argument("--owner-approval"); review.add_argument("--proposal-record", type=Path)
    proposal=sub.add_parser("proposal"); proposal.add_argument("request",nargs="?"); proposal.add_argument("--evidence",action="append",default=[]); proposal.add_argument("--owner-approval")
    validation = sub.add_parser("validate"); validation.add_argument("--output", type=Path, required=True)
    validation.add_argument("--input", action="append", default=[])
    validation.add_argument("--env-input", action="append", default=[])
    validation.add_argument("command", nargs=argparse.REMAINDER)
    sub.add_parser("verify-proposal"); sub.add_parser("verify-staged"); a=sub.add_parser("apply-trailers"); a.add_argument("path",type=Path); m=sub.add_parser("verify-message"); m.add_argument("path",type=Path); v=sub.add_parser("verify-commit"); v.add_argument("commit",nargs="?",default="HEAD"); r=sub.add_parser("verify-range"); r.add_argument("start"); r.add_argument("end")
    args=p.parse_args(argv); root=repository_root()
    try:
        if args.cmd == "validate":
            command = args.command[1:] if args.command[:1] == ["--"] else args.command
            result = record_validation(root, command, args.input, args.output, environment_keys=args.env_input)
            print(json.dumps(result, indent=2, sort_keys=True)); return 0 if result["exit_code"] == 0 else 1
        elif args.cmd=="review":
            if __package__:
                from . import shipment_state as shipment
            else:
                import shipment_state as shipment
            if not _git(root, "status", "--porcelain=v1", "--untracked-files=all").strip():
                selected = shipment.selection(root)
                if selected["state"] in {"NO_CHANGES", "DELIVER"}:
                    print(json.dumps(selected, sort_keys=True))
                    return 0
            token = _FOLLOW_COMMITS.set(True)
            try:
                receipt = issue(root,args.evidence,args.owner_approval,proposal_record=args.proposal_record)
            finally:
                _FOLLOW_COMMITS.reset(token)
            print(f"APPROVED {receipt['candidate_tree']}")
        elif args.cmd=="proposal":
            request = args.request or sys.stdin.read().strip()
            result = review_proposal(root,request,args.evidence,args.owner_approval)
            print(json.dumps(result,indent=2,sort_keys=True))
            if result["verdict"] != "APPROVED": return 1
        elif args.cmd=="verify-proposal": print(json.dumps(verify_proposal(root), sort_keys=True))
        elif args.cmd=="verify-staged": verify_staged(root); print("APPROVED")
        elif args.cmd=="apply-trailers": apply_trailers(root,args.path); print("APPROVED")
        elif args.cmd=="verify-message": verify_message(root,args.path); print("APPROVED")
        elif args.cmd=="verify-commit": verify_commit(root,args.commit); print("APPROVED")
        else: verify_range(root,args.start,args.end); print("APPROVED")
    except OracleCandidateRejected as exc:
        print(f"REJECTED: {exc}", file=sys.stderr); return 1
    except OracleReviewIncomplete as exc:
        print(f"INCOMPLETE: {exc}", file=sys.stderr); return 2
    except (OracleApprovalError,OSError,subprocess.CalledProcessError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr); return 2
    return 0
if __name__=="__main__": raise SystemExit(main())
