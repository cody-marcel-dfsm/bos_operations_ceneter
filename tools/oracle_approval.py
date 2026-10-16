#!/usr/bin/env python3
"""Issue and verify tree-bound Operations Center approvals."""
from __future__ import annotations
import argparse, ast, hashlib, json, os, re, subprocess, sys, tempfile, fcntl, time, platform
from contextlib import contextmanager
from datetime import datetime, timezone
from contextvars import ContextVar
from functools import wraps
from pathlib import Path
from typing import Any, Callable, Sequence
if __package__:
    from .codex_child_model import selected_model
else:
    from codex_child_model import selected_model

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
LEAD_GRAPH_REVIEW = """For changes affecting CRM record lookup routing, skill composition, or graph presentation, explicitly inspect the recurring graph-omission history in Vault/docs/issues/ISSUE_HISTORY.md, Issue #0008, and the October 8 focused student-workflow exception in Issue #0026. Trace the shared source/platform/bos-mcp-client/references/record-journey-display.md contract through each applicable canonical and generated entrypoint. Require focused tests/lead-graph-regression.test.mjs evidence: a successful named lead/contact lookup retains its graph completion rule after a workspace clarification; available topology includes the current node and every intermediate node and edge to a resolved goal; the default view contains one compact preferred route, with a shortest structural fallback and full topology only on explicit request; a partial graph cites the exact missing read and preserves verified state without invented topology. Preserve app-ranking provenance, explicit shortest/text/full-graph requests, and focused student lookup/state-comparison scope. Reject a source candidate that removes this rule, crowds the default with off-route branches and loops, suppresses verified topology because actions/history are empty, or weakens these regressions. Require plain-text node and edge labels with diagram-native emphasis; reject added literal or escaped HTML formatting in labels and require the corresponding response regression cases. Require advertised native inline visualization tools to take priority over Mermaid, allow Mermaid only with established host rendering support, and reject ASCII routes or unrendered Mermaid as graph completion. Keep internal identifiers and unsolicited off-route explanations out of normal graph delivery. Require delivery-selector regressions against the Claude Code raw-code failure shape and generated-script behavior. Distinguish deterministic source/response-contract checks from observed published-client acceptance: synthetic responses and passing prose/reference checks cannot establish native prompt success. Keep the recurring incident open until version-bound published-client output proves both automatic graph completion and compact path presentation; normal source readiness may proceed with that acceptance explicitly pending."""

class OracleApprovalError(RuntimeError): pass
class OracleCandidateRejected(OracleApprovalError): pass
class OracleReviewIncomplete(OracleApprovalError): pass

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
For completed-candidate review, complete the first assessment across all changed paths,
relevant entry points, dependencies, failure paths and applicable authorities
before returning consolidated findings. Record unreviewed coverage explicitly;
an early blocker is no reason to stop scanning independent areas. Findings need
stable IDs, exact location, root cause, reproduction, required behavior,
recommendation, affected paths and acceptance checks so repairs can be made in
one batch. Preserve unresolved finding IDs and account for every one through an
open finding or hash-bound resolution evidence. Never treat omitted findings as
resolved. On follow-up or resume, inspect the actual source/control delta first,
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
completed-candidate review. Every current owner, authentication, public-version,
coverage, native-validation eligibility and exact-candidate approval gate remains
mandatory. Historical evidence supplies no current approval.
"""

_RUN = ContextVar("oracle_run", default=None)
LIVE_AUTHORITIES = (*AUTHORITY_PATHS, ".agents/skills/oracle/review-output.schema.json",
                    "Vault/docs/CONSTITUTION.md", "Vault/docs/architecture.md",
                    "Vault/docs/issues/ISSUE_HISTORY.md", "Vault/specs/oracle-and-vault.md")
CONTROLLING_AUTHORITIES = (*AUTHORITY_PATHS, ".agents/skills/oracle/review-output.schema.json",
                          "Vault/docs/CONSTITUTION.md")


def _declared_parent_authorities(root: Path, instructions: str | None = None) -> dict:
    # Ordinary local governance declares the family coordinator's canonical
    # paths. Read/hash those exact interfaces; never execute or import them.
    if instructions is None:
        local = root / "AGENTS.md"
        instructions = local.read_text() if local.is_file() else ""
    declarations = re.findall(r"(/[^\s`\"<>]+/Vault/docs/architecture/bos-product-family\.md)", instructions)
    values = {}
    for declaration in declarations:
        family = Path(declaration).resolve()
        parent = family.parents[3]
        for path in (parent / "AGENTS.md", family, parent / "tools/projects_oracle.py"):
            values[str(path)] = _sha(path.read_bytes()) if path.is_file() else None
    return values


def _controlling_authorities(values: dict) -> dict:
    return {**{name: values.get(name) for name in CONTROLLING_AUTHORITIES},
            **{name: digest for name, digest in values.items() if Path(name).is_absolute()}}


def _atomic_write(path: Path, raw: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        try:
            output.write(raw); output.flush(); os.fsync(output.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


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
                timings = json.loads(path.read_text()) if path.exists() else {}
                timings[phase] = round(time.monotonic() - started, 6)
                _atomic_write(path, _pretty(timings))
        except Exception:
            if failure is None:
                raise


def _timed(phase: str, call):
    with _phase(phase):
        return call()


def _serialized_review(function):
    @wraps(function)
    def wrapped(root: Path, *args, **kwargs):
        directory = receipt_path(root).parent
        directory.mkdir(parents=True, exist_ok=True)
        with (directory / "review.lock").open("a+") as lock:
            try:
                fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as exc:
                raise OracleApprovalError("Another Oracle review is active in this worktree") from exc
            runs = directory / "runs"
            runs.mkdir(exist_ok=True)
            run = Path(tempfile.mkdtemp(prefix=function.__name__ + "-", dir=runs))
            token = _RUN.set(run)
            started_at = datetime.now(timezone.utc).isoformat()
            result, failure = None, None
            try:
                result = _timed("total_seconds", lambda: function(root, *args, **kwargs))
                return result
            except BaseException as exc:
                failure = exc
                if function.__name__ == "issue":
                    _revoke_published_review(root, run, exc)
                try:
                    _atomic_write(run / "failure.json", _pretty({"error": str(exc)}))
                except OSError:
                    pass
                raise
            finally:
                try:
                    timings = json.loads((run / "timings.json").read_text()) if (run / "timings.json").exists() else {}
                    verdict = result.get("verdict") if isinstance(result, dict) else None
                    review_status = result.get("review_status") if isinstance(result, dict) else None
                    if verdict is None and (run / "result.json").exists():
                        try:
                            returned = json.loads((run / "result.json").read_text())
                            verdict = returned.get("verdict")
                            review_status = returned.get("review_status")
                        except (ValueError, AttributeError):
                            pass
                    _atomic_write(run / "outcome.json", _pretty({
                        "kind": function.__name__, "started_at": started_at,
                        "finished_at": datetime.now(timezone.utc).isoformat(),
                        "outcome": "INCOMPLETE" if isinstance(failure, OracleReviewIncomplete) or review_status == "INCOMPLETE"
                                   else "ERROR" if review_status == "ERROR" or (failure and not isinstance(failure, OracleCandidateRejected))
                                   else "REJECTED" if verdict == "REJECTED" else verdict or "COMPLETED",
                        "reviewer_verdict": verdict,
                        "reviewer_invoked": any(key.endswith("reviewer_seconds") for key in timings),
                        "error": {"name": type(failure).__name__, "message": str(failure)} if failure else None,
                    }))
                except Exception as exc:
                    if failure is None:
                        if function.__name__ == "issue":
                            _revoke_published_review(root, run, exc)
                        try:
                            _atomic_write(run / "failure.json", _pretty({"error": str(exc)}))
                            _atomic_write(run / "outcome.json", _pretty({
                                "kind": function.__name__, "started_at": started_at,
                                "finished_at": datetime.now(timezone.utc).isoformat(), "outcome": "ERROR",
                                "reviewer_verdict": result.get("verdict") if isinstance(result, dict) else None,
                                "error": {"name": type(exc).__name__, "message": str(exc)},
                            }))
                        except OSError:
                            pass
                        raise
                finally:
                    _RUN.reset(token)
    return wrapped


def _live_authorities(root: Path) -> dict:
    # Hash bytes without loading approver instructions into an ordinary agent.
    return {**{name: _sha((root / name).read_bytes()) if (root / name).is_file() else None
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
        return vault_index.snapshot()
    finally:
        vault_index.PROJECT_ROOT, vault_index.VAULT_ROOT = previous_root, previous_vault


def _input_binding(root: Path, evidence: dict, owner: dict | None) -> dict:
    untracked = [name for name in _git(root, "ls-files", "--others", "--exclude-standard").splitlines()
                 if not name.startswith("Vault/")]
    tools = [name for name in ("tools/oracle_approval.py", "tools/vault_index.py", "tools/codex_child_model.py")
             if (root / name).is_file()]
    return {"base_commit": _git(root, "rev-parse", "HEAD").strip(), "candidate_tree": _tree(root),
            "working_diff_sha256": _sha(_git_bytes(root, "diff", "HEAD", "--", ".", ":(exclude)Vault")),
            "untracked": _files(root, untracked), "authority_digests": _live_authorities(root),
            "vault_source_hashes": _vault_sources(root), "tool_digests": _files(root, tools),
            "environment_digest": _environment_digest(),
            "validation_evidence": _files(root, list(evidence)),
            "owner_approval_evidence": _files(root, list(owner)) if owner is not None else None}


def _assert_binding(root: Path, expected: dict, evidence: dict, owner: dict | None, *, check_environment: bool = True) -> None:
    actual = _input_binding(root, evidence, owner)
    if not check_environment:
        actual = {key: value for key, value in actual.items() if key != "environment_digest"}
        expected = {key: value for key, value in expected.items() if key != "environment_digest"}
    if actual != expected:
        raise OracleApprovalError("Oracle review inputs changed during preparation or review")


def _review_process(root: Path, prompt: str, prefix: str) -> dict:
    run = _RUN.get()
    if run is None:
        raise OracleApprovalError("Independent Oracle must run under the review lock")
    output = run / "result.json"
    try:
        model = selected_model()
    except (RuntimeError, ValueError) as exc:
        raise OracleApprovalError(
            f"Independent Oracle model resolution failed ({type(exc).__name__}): {exc}; "
            f"diagnostics retained at {run}"
        ) from exc
    developer_instructions = "\n\n".join((REVIEWER_ROLE, NORMAL_PLAN_REVIEW_POLICY,
                                         LOCAL_EXECUTION_POLICY, REVIEW_SERIES_POLICY))
    metadata = {"selected_model": model, "sandbox": "danger-full-access", "ephemeral": True,
                "ignore_user_config": True,
                "reviewer_role": "independent-oracle-approver",
                "developer_instructions_sha256": _sha(developer_instructions.encode()),
                "schema_sha256": _sha((root / ".agents/skills/oracle/review-output.schema.json").read_bytes()),
                "model_helper_sha256": _sha((root / "tools/codex_child_model.py").read_bytes())}
    _atomic_write(run / "model.json", _pretty(metadata))
    prompt += "\nReviewer process configuration:\n" + json.dumps(metadata, sort_keys=True)
    _atomic_write(run / "request.txt", prompt.encode())
    cmd = ["codex", "exec", "--ephemeral", "--ignore-user-config", "--model", model,
           "-c", "developer_instructions=" + json.dumps(developer_instructions),
           "--sandbox", "danger-full-access", "--cd", str(root), "--output-schema",
           str(root / ".agents/skills/oracle/review-output.schema.json"),
           "--output-last-message", str(output), prompt]
    completed = _timed(prefix + "_seconds", lambda: subprocess.run(
        cmd, cwd=root, capture_output=True, text=True,
        env={**os.environ, "CODEX_SELECTED_MODEL": model}))
    _atomic_write(run / "process.json", _pretty({"exit_code": completed.returncode}))
    _atomic_write(run / "stdout.log", completed.stdout.encode())
    _atomic_write(run / "stderr.log", completed.stderr.encode())
    if completed.returncode:
        raise OracleApprovalError("Independent Oracle process failed; diagnostics retained at " + str(run))
    try:
        return json.loads(output.read_text())
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

def receipt_path(root: Path) -> Path: return _git_file(root, "oracle/approval.json")
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
        path = Path(value) if Path(value).is_absolute() else root / value
        path = path.resolve()
        if not path.is_file(): raise OracleApprovalError(f"Oracle evidence is missing: {value}")
        try: name = str(path.relative_to(root))
        except ValueError: name = str(path)
        result[name] = _sha(path.read_bytes())
    return result


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


REVIEW_POLICY_MODULES = ("tools/oracle_approval.py", "tools/codex_child_model.py", "tools/vault_index.py")


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
            path = Path(__file__).resolve().parent / Path(name).name
            if path.is_symlink() or not path.is_file():
                raise ValueError("Unavailable live reviewer module")
            source = path.read_bytes()
            mode = "100755" if path.stat().st_mode & 0o111 else "100644"
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
        source = _git_bytes(root, "show", f"{tree}:tools/oracle_approval.py") if tree else Path(__file__).read_bytes()
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
    identity = _sha(_canonical({"repository": str(root.resolve()), "base_commit": base}))[:24]
    return receipt_path(root).parent / "series" / identity


def _read_rounds(directory: Path) -> list[dict]:
    records, predecessor = [], None
    for index, path in enumerate(sorted(directory.glob("round-*.json")), 1):
        try:
            raw = path.read_bytes(); record = json.loads(raw)
            payload = {key: value for key, value in record.items() if key != "record_sha256"}
            valid = (path.name == f"round-{index:04d}.json" and raw == _pretty(record)
                     and record["round"] == index and record["previous_record_sha256"] == predecessor
                     and record["record_sha256"] == _sha(_canonical(payload)))
            context = json.loads(Path(record["context_file"]).read_bytes())
            valid = valid and record["context_sha256"] == _sha(_canonical(context))
            valid = valid and all(record[key] == context[key] for key in
                                  ("series_id", "round", "mode", "base_commit", "candidate_tree", "guards", "previous_record_sha256"))
            if record.get("repair_plan_file"):
                valid = valid and _sha(Path(record["repair_plan_file"]).read_bytes()) == record["repair_plan_sha256"]
        except (OSError, ValueError, KeyError, AttributeError, TypeError) as exc:
            raise OracleApprovalError("Oracle review history is malformed: " + str(path)) from exc
        if not valid:
            raise OracleApprovalError("Oracle review history binding is invalid: " + str(path))
        predecessor = record["record_sha256"]; records.append(record)
    return records


def _coverage_checkpoints(rounds: list[dict]) -> list[tuple[dict, dict]]:
    checkpoints = {}
    for record in rounds:
        # Transport/preparation errors assess no source and cannot erase older
        # observations. Structured UNREVIEWED dispositions remain authoritative.
        if record["outcome"] != "ERROR" or "coverage" in record["review"]:
            checkpoints = {}
        for item in record.get("verified_coverage", []):
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


def _review_context(root: Path, tree: str, paths: list, binding: dict, evidence: dict) -> dict:
    directory = _series_directory(root, binding["base_commit"])
    rounds = _read_rounds(directory)
    previous = rounds[-1] if rounds else None
    validation_invalidations = previous.get("validation_invalidations", {}) if previous else {}
    known_paths = {item["evidence_path"] for item in previous.get("verified_validations", [])} if previous else set()
    known_evidence = dict(evidence)
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
    proposal = json.loads(proposal_path(root).read_text())
    proposal_scope = {"sha256": proposal["proposal_sha256"], "proposal": proposal["proposal"]}
    inputs["@proposal/scope"] = "sha256:" + proposal_scope["sha256"]
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
    required_paths = sorted(set(paths) | set(changed) | set(pending_from_prior))
    for name in required_paths:
        inputs.setdefault(name, None)
    reusable, invalidated, validations, invalid_validations = [], [], [], []
    ledger = previous.get("finding_ledger", {}) if previous else {}
    if previous:
        source_guards = {}
        for item, origin in _coverage_checkpoints(rounds):
            # Re-evaluate the actual original proof even after an unstructured
            # ERROR; legacy policy equivalence still requires original Git.
            identity = origin["record_sha256"]
            if identity not in source_guards:
                source_guards[identity] = _observation_guard_changes(root, guards, origin)
            reasons = list(source_guards[identity])
            reasons += [entry["path"] + " content changed or missing" for entry in item["inputs"]
                        if entry["path"] not in inputs or inputs[entry["path"]] != entry["digest"]]
            (invalidated if reasons else reusable).append(dict(item, invalidation_reasons=reasons))
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
               "previous_proposal_scope": previous.get("proposal_scope") if previous else None,
               "scope_changed": bool(previous and previous.get("proposal_scope") != proposal_scope),
               "input_hashes": inputs, "prior_findings": ledger,
               "prior_native_assessment": _prior_native_assessment(directory, rounds, tree, binding["base_commit"], guards),
               "reusable_coverage": reusable, "invalidated_coverage": invalidated,
               "reusable_validations": validations, "invalidated_validations": invalid_validations,
               "current_validations": current_validations, "invalid_current_validations": invalid_current,
               "validation_invalidations": validation_invalidations,
               "registered_validation_evidence": registered_evidence,
               "failed_repair_rounds": failed_repairs,
               "is_repair_round": is_repair_round,
               "repair_synthesis_required": failed_repairs >= 2 and bool(unresolved),
               "repair_plan": synthesis if failed_repairs >= 2 else "",
               "prior_rounds": [{key: item[key] for key in ("round", "candidate_tree", "outcome", "record_sha256")}
                                for item in rounds]}
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
    if not selected or any(name not in inputs for name in selected):
        raise OracleApprovalError("Validation inputs must name existing candidate or canonical knowledge paths")
    tracked = [name for name in selected if isinstance(inputs[name], str) and inputs[name].startswith("git-")]
    if tracked and _git(root, "diff", "--name-only", "--", *tracked).strip():
        raise OracleApprovalError("Stage the selected validation inputs before capture or reuse")
    live = {}
    for name in selected:
        path = Path(name) if Path(name).is_absolute() else root / name
        try:
            live[name] = {"sha256": _sha(path.read_bytes()), "mode": path.lstat().st_mode,
                          "symlink": os.readlink(path) if path.is_symlink() else None}
        except OSError as exc:
            raise OracleApprovalError("Selected validation input is unavailable: " + name) from exc
    return {name: inputs[name] for name in selected}, live


def record_validation(root: Path, command: Sequence[str], input_paths: Sequence[str], output: Path, *,
                      environment_keys: Sequence[str] = ()) -> dict:
    """Execute a focused check and capture source/configuration/environment proof."""
    if not command:
        raise OracleApprovalError("Validation recording requires a command after --")
    output = (root / output).resolve() if not output.is_absolute() else output.resolve()
    try:
        output.relative_to(root.resolve() / "Vault" / "tmp")
    except ValueError as exc:
        raise OracleApprovalError("Validation records must stay in private Vault/tmp") from exc
    binding = {"base_commit": _git(root, "rev-parse", "HEAD").strip(), "candidate_tree": _tree(root),
               "authority_digests": _live_authorities(root), "environment_digest": _environment_digest()}
    inputs = _candidate_inputs(root, binding["candidate_tree"], {})
    selected = sorted(set(input_paths)) if input_paths else sorted(inputs)
    selected_inputs, live_inputs = _validation_capture_inputs(root, selected)
    if selected_inputs != {name: inputs[name] for name in selected}:
        raise OracleApprovalError("Selected validation inputs changed during preparation")
    authority = _controlling_authorities(binding["authority_digests"])
    policy = _review_policy_digest(root)
    effective_environment, environment_inputs, extras = _validation_environment(environment_keys)
    started = datetime.now(timezone.utc).isoformat()
    output.unlink(missing_ok=True)
    completed = subprocess.run(list(command), cwd=root, capture_output=True, env=effective_environment)
    # Preserve the actual execution diagnostics even if a relevant input drifts.
    stdout, stderr = output.with_suffix(".stdout.log"), output.with_suffix(".stderr.log")
    _atomic_write(stdout, completed.stdout); _atomic_write(stderr, completed.stderr)
    if (_validation_capture_inputs(root, selected) != (selected_inputs, live_inputs)
            or _git(root, "rev-parse", "HEAD").strip() != binding["base_commit"]
            or _controlling_authorities(_live_authorities(root)) != authority
            or _review_policy_digest(root) != policy
            or _environment_digest() != binding["environment_digest"]):
        raise OracleApprovalError("Selected validation inputs or controlling guards changed during capture")
    if _validation_environment(extras)[1] != environment_inputs:
        raise OracleApprovalError("Validation effective environment changed during capture")
    payload = {"kind": "oracle-validation-record-v1", "command": list(command), "exit_code": completed.returncode,
               "started_at": started, "finished_at": datetime.now(timezone.utc).isoformat(),
               "base_commit": binding["base_commit"], "candidate_tree": binding["candidate_tree"],
               "inputs": [{"path": name, "digest": selected_inputs[name]} for name in selected],
               "live_inputs": live_inputs,
               "environment_digest": binding["environment_digest"],
               "environment_policy": "bounded-v1", "environment_keys": extras,
               "environment_inputs": environment_inputs,
               "review_policy_digest": policy,
               "authority_digests": authority,
               "output_hashes": _files(root, [str(stdout), str(stderr)])}
    record = dict(payload, record_sha256=_sha(_canonical(payload)))
    _atomic_write(output, _pretty(record))
    return record


def _validation_record(root: Path, name: str, inputs: list, environment_digest: str) -> dict:
    try:
        path = Path(name) if Path(name).is_absolute() else root / name
        raw = path.read_bytes(); record = json.loads(raw)
        payload = {key: value for key, value in record.items() if key != "record_sha256"}
        _, current_environment, extras = _validation_environment(record["environment_keys"])
        selected, live = _validation_capture_inputs(root, [item["path"] for item in inputs])
        valid = (raw == _pretty(record) and record["kind"] == "oracle-validation-record-v1"
                 and record["environment_policy"] == "bounded-v1" and record["environment_keys"] == extras
                 and record["environment_inputs"] == current_environment
                 and isinstance(record["review_policy_digest"], str)
                 and re.fullmatch(r"[0-9a-f]{64}", record["review_policy_digest"])
                 and _historical_policy_guard(root, record["candidate_tree"], record["review_policy_digest"]) == _review_policy_digest(root)
                 and record["record_sha256"] == _sha(_canonical(payload)) and record["exit_code"] == 0
                 and record["inputs"] == inputs and selected == {item["path"]: item["digest"] for item in inputs}
                 and ("live_inputs" not in record or record["live_inputs"] == live)
                 and record["base_commit"] == _git(root, "rev-parse", "HEAD").strip()
                 and record["environment_digest"] == environment_digest
                 and record["authority_digests"] == _controlling_authorities(_live_authorities(root))
                 and record["output_hashes"] == _files(root, list(record["output_hashes"])))
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
            record = json.loads(path.read_bytes())
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
        if item.get("status") == "CARRIED_FORWARD":
            prior = reusable.get(name)
            if not prior or item["inputs"] != prior["inputs"]:
                raise OracleApprovalError("Oracle carried coverage without unchanged dependency proof")
        elif item.get("status") != "REVIEWED":
            raise OracleApprovalError("Oracle coverage status is invalid")
        if not item.get("reason", "").strip():
            raise OracleApprovalError("Oracle coverage requires a review rationale")
        coverage.append(item)
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
    if status in {"INCOMPLETE", "ERROR"}:
        # A later partial assessment retains earlier eligible checkpoints unless
        # it explicitly marks that source/evidence unreviewed or invalidated.
        coverage += [item for item in context["reusable_coverage"] if item["path"] not in seen]
    return coverage, validations, ledger


def _prepare_round(root: Path, context: dict, review: dict, outcome: str, *, coverage=None, validations=None, ledger=None,
                   context_file: Path | None = None) -> tuple[Path, dict]:
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
                   context_file=str(context_file or _RUN.get() / "review-context.json"),
                   proposal_scope=context["proposal_scope"],
                   finding_ledger=current_ledger, validation_invalidations=invalidations,
                   is_repair_round=context["is_repair_round"], failed_repair_rounds=failed_repairs,
                   repair_plan_file=plan_path, repair_plan_sha256=plan_digest,
                   pending_review_paths=sorted(set(context["required_coverage_paths"]) -
                                               {item["path"] for item in verified_coverage}) if outcome in {"INCOMPLETE", "ERROR"} else [],
                   verified_coverage=verified_coverage,
                   verified_validations=validations)
    record = dict(payload, record_sha256=_sha(_canonical(payload)))
    path = _series_directory(root, context["base_commit"]) / f"round-{context['round']:04d}.json"
    if path.exists():
        raise OracleApprovalError("Oracle review history round already exists")
    return path, record


def _record_round(root: Path, context: dict, review: dict, outcome: str, **proofs) -> Path:
    path, record = _prepare_round(root, context, review, outcome, **proofs)
    _atomic_write(path, _pretty(record))
    return path


def _record_error(root: Path, context: dict, review: dict, error: BaseException, *, coverage=None, validations=None,
                  ledger=None, published_round: tuple[Path, dict] | None = None) -> None:
    receipt_path(root).unlink(missing_ok=True)
    context_file = None
    if published_round is None:
        possible = _series_directory(root, context["base_commit"]) / f"round-{context['round']:04d}.json"
        if possible.exists():
            raw = possible.read_bytes()
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
        if published_round[0].read_bytes() != _pretty(record):
            raise OracleApprovalError("Failed publication left a conflicting history record") from error
        context = dict(context, round=context["round"] + 1, mode="resume",
                       previous_record_sha256=record["record_sha256"], previous_candidate_tree=context["candidate_tree"])
        context_file = _RUN.get() / "publication-error-context.json"
        _atomic_write(context_file, _pretty(context))
    checkpoint = dict(review if ledger is not None else {}, error=str(error))
    if published_round:
        checkpoint["publication_failure"] = True
    _record_round(root, context, checkpoint, "INCOMPLETE" if isinstance(error, OracleReviewIncomplete) else "ERROR",
                  coverage=coverage, validations=validations, ledger=ledger, context_file=context_file)


def _revoke_published_review(root: Path, run: Path, error: BaseException) -> None:
    """Final timing/outcome failures follow the same publication cleanup."""
    context_file = run / "review-context.json"
    if not receipt_path(root).exists() or not context_file.exists():
        return
    context = json.loads(context_file.read_bytes())
    path = _series_directory(root, context["base_commit"]) / f"round-{context['round']:04d}.json"
    if not path.exists():
        receipt_path(root).unlink(missing_ok=True)
        return
    record = json.loads(path.read_bytes())
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
            text = request_path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            raise OracleApprovalError("API version request evidence is unavailable") from exc
        if assessment["request_quote"] not in text:
            raise OracleApprovalError("Direct API version request quote does not match supplied evidence")


def _shape(receipt: dict[str, Any]) -> dict[str, Any]:
    required = {"schema_version","issuer","verdict","base_commit","candidate_tree","changed_paths","authority_digests","authentication_impact","owner_approval_status","validation_evidence","owner_approval_evidence","review_digest","approval_id","api_version_assessment"}
    if set(receipt) != required: raise OracleApprovalError("Oracle receipt fields do not match the current review contract")
    payload = {k: v for k, v in receipt.items() if k != "approval_id"}
    if receipt["approval_id"] != _sha(_canonical(payload)): raise OracleApprovalError("Oracle approval receipt ID is invalid")
    if payload["schema_version"] != SCHEMA_VERSION or payload["issuer"] != ISSUER or payload["verdict"] != "APPROVED": raise OracleApprovalError("Oracle receipt identity is invalid")
    impact, status = payload["authentication_impact"], payload["owner_approval_status"]
    if impact == "AUTHENTICATION" and status != "APPROVED": raise OracleApprovalError("Authentication receipt lacks approved owner evidence")
    if impact == "AUTHENTICATION" and not payload["owner_approval_evidence"]: raise OracleApprovalError("Authentication receipt lacks owner evidence bytes")
    if impact == "NONE" and status != "NOT_REQUIRED": raise OracleApprovalError("Non-authentication receipt has invalid owner status")
    if impact not in {"AUTHENTICATION", "NONE"}: raise OracleApprovalError("Oracle receipt lacks authentication classification")
    _validate_api_version_assessment(payload["api_version_assessment"], payload["verdict"])
    return payload

def _read_local(root: Path) -> tuple[dict[str, Any], bytes]:
    try: raw = receipt_path(root).read_bytes(); receipt = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc: raise OracleApprovalError("Local Oracle receipt is missing or invalid") from exc
    if not isinstance(receipt, dict) or raw != _pretty(receipt): raise OracleApprovalError("Oracle receipt is not canonical pretty JSON")
    return receipt, raw

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
    _validate_api_version_assessment(payload["api_version_assessment"], payload["verdict"], root, evidence)
    owner = payload["owner_approval_evidence"]
    if owner is not None and (not isinstance(owner, dict) or owner != _files(root, list(owner))): raise OracleApprovalError("Oracle owner evidence changed")
    for name in evidence:
        if Path(name).name != "oracle-inputs.json":
            continue
        preparation = json.loads((Path(name) if Path(name).is_absolute() else root / name).read_bytes())
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
    request = {"candidate_tree": tree, "changed_paths": paths, "validation_evidence": evidence, "owner_approval_evidence": owner}
    if _RUN.get() and (_RUN.get() / "review-context.json").is_file():
        request["review_context"] = str(_RUN.get() / "review-context.json")
    prompt = f"""You are the independent BOS Operations Center Oracle approval process.
Read .agents/skills/oracle/SKILL.md completely and wear that approver skill. Use the hash-bound oracle-inputs.json, candidate.diff and vault-query.json as navigation. On initial assessment inspect the complete candidate, applicable AGENTS.md/private Vault authorities, issue history and relevant validation evidence. On follow-up or resume inspect actual deltas first and apply the trusted execution policy to affected dependencies, open findings, unfinished coverage and sealed unchanged observations. Prepared retrieval never narrows required coverage. Only this process issues Oracle warnings and verdicts. Creating, bumping, replacing, or splitting a public API version requires the human user's explicit request for that exact version change. Owner approval, general fix/release authorization, inferred compatibility, pre-existing implementation, and Oracle guidance never substitute. Correct behavior and preserve authorized improvements in the current API version; package/build patches and identity-envelope protocols are distinct. Independently classify api_version_assessment: NONE requires NOT_REQUIRED and all request fields null; CHANGE requires EXPLICIT_REQUEST for APPROVED, exact requested_change, verbatim direct-user request_quote, and an absolute request_evidence path supplied through --evidence containing that quote. Independently inspect human provenance, context, exact scope and refusals; an agent assertion or approval-only statement is insufficient. Reject unrequested API version changes. An exact explicit request authorizes continuation through ordinary independent review without repeated owner approval. Authentication classification and owner approval remain separate.
{LEAD_GRAPH_REVIEW}
{NORMAL_PLAN_REVIEW_POLICY}
{LOCAL_EXECUTION_POLICY}
{REVIEW_SERIES_POLICY}
The structured review-context.json can be large: inspect its metadata/coverage with selective JSON reads, and select input_hashes only for relevant source/dependency paths. Inspect prior_native_assessment before rereading unchanged owner/authentication/public-API evidence: it projects the latest nonempty native classification, its immutable origin and factual candidate/guard comparisons, skipping ERROR records. It is historical evidence; independently assess current scope, changed inputs and all current gates before issuing a fresh verdict. Cover required_coverage_paths, including reverted repairs, removed files and pending unassessed changes retained through ERROR/INCOMPLETE. A repair finding affecting both changed and unchanged paths is REPAIR when changed behavior causes it. MISSED applies when the affected behavior, dependencies and requirements remained unchanged. Scope changes are explicit in proposal_scope/previous_proposal_scope and the @proposal/scope input; explain new requirements in origin_reason, reassess affected coverage and include that input in requirement-dependent coverage. Preserve unrelated verified coverage. COMPLETE uses limitations=[]; put nonblocking scope boundaries in summary. Validation VERIFIED or REUSED requires an oracle-validation-record-v1 produced by this utility's validate command, whose exact inputs, environment and retained outputs prove the result. Legacy prose/log evidence remains reviewable and cannot acquire reusable validation status by assertion.
Return JSON matching the supplied schema. Classify authentication_impact as AUTHENTICATION or NONE. An APPROVED authentication review requires owner_approval_status APPROVED. A REJECTED authentication review may report APPROVED, MISSING, or INVALID. A NONE review uses NOT_REQUIRED. Only APPROVED with no findings can issue a receipt.\n{json.dumps(request, indent=2, sort_keys=True)}"""
    return _review_process(root, prompt, "reviewer")

def _proposal_oracle(root: Path, request: str, evidence: dict[str,str], owner: dict[str,str] | None) -> dict[str,Any]:
    payload = {
        "proposal": request,
        "evidence": evidence,
        "owner_approval_evidence": owner,
    }
    prompt = f"""You are the independent BOS Operations Center Oracle proposal-review process.
Read .agents/skills/oracle/SKILL.md completely and wear that approver skill. Read AGENTS.md and all required private Vault authority. Review the proposed solution before implementation using current filesystem evidence. Operate read-only: do not edit, stage, commit, deploy, write an approval receipt, or treat this proposal verdict as completed-tree approval.

Creating, bumping, replacing, or splitting a public API version requires the human user's explicit request for that exact version change. Owner approval, general fix/release authorization, inferred compatibility, pre-existing implementation, and Oracle guidance never substitute. Correct behavior and preserve authorized improvements in the current API version; package/build patches and identity-envelope protocols are distinct. Independently classify api_version_assessment: NONE requires NOT_REQUIRED and all request fields null; CHANGE requires EXPLICIT_REQUEST for APPROVED, exact requested_change, verbatim direct-user request_quote, and an absolute request_evidence path supplied through --evidence containing that quote. Independently inspect human provenance, context, exact scope and refusals; an agent assertion or approval-only statement is insufficient. Reject unrequested API version changes. An exact explicit request authorizes continuation through ordinary independent review without repeated owner approval. Authentication classification and owner approval remain separate.
{LEAD_GRAPH_REVIEW}
{NORMAL_PLAN_REVIEW_POLICY}
{LOCAL_EXECUTION_POLICY}
Assess the complete proposal and consolidate every finding. Use review_status COMPLETE only when the proposal assessment is finished. Use INCOMPLETE or ERROR with limitations when assessment cannot finish; such outcomes never approve. For a proposal, coverage, validations and resolutions may be empty and repair_plan may be empty. Every finding still needs the schema's actionable detail and stable F001-style ID.
Return JSON matching the supplied schema. Verify the stated problem and cause, classify authentication_impact as AUTHENTICATION or NONE, and reject architectural invention or a service/API-contract change presented as a client fix. Restoration of already-approved behavior may reuse exact existing owner approval; outside the explicit API-version request gate, a genuinely new or changed authentication design, public API contract, or architecture requires exact owner approval and must be REJECTED with owner_approval_status MISSING or INVALID when that evidence is absent. An approved proposal allows the ordinary workflow to continue automatically within the user's existing task authorization; completed-tree Oracle review remains mandatory after implementation. Every finding must state concise Problem, Cause, and Recommended change sections with no more than three sentences each.
{json.dumps(payload, indent=2, sort_keys=True)}"""
    return _review_process(root, prompt, "proposal_reviewer")

@_serialized_review
def review_proposal(root: Path, request: str, evidence_paths: Sequence[str], owner_path: str | None, reviewer: Callable = _proposal_oracle) -> dict[str,Any]:
    with _phase("precheck_seconds"):
        if not request.strip(): raise OracleApprovalError("Oracle proposal review requires a proposal")
        proposal_path(root).unlink(missing_ok=True)
        receipt_path(root).unlink(missing_ok=True)
        evidence = _files(root, evidence_paths)
        owner = _files(root, [owner_path]) if owner_path else None
        binding = _input_binding(root, evidence, owner)
    review = reviewer(root, request, evidence, owner)
    _timed("postcheck_seconds", lambda: _assert_binding(root, binding, evidence, owner))
    if any(value is None for value in _declared_parent_authorities(root).values()):
        raise OracleApprovalError("A required declared parent authority is unavailable")
    if reviewer is _proposal_oracle and review.get("review_status") != "COMPLETE":
        if review.get("review_status") == "INCOMPLETE":
            raise OracleReviewIncomplete("Independent Oracle proposal assessment is incomplete: " + review.get("summary", ""))
        raise OracleApprovalError("Independent Oracle proposal assessment failed or lacks review_status")
    if review.get("verdict") not in {"APPROVED", "REJECTED"}:
        raise OracleApprovalError("Independent Oracle proposal review returned no verdict")
    _validate_api_version_assessment(review.get("api_version_assessment"), review["verdict"], root, evidence)
    payload = {
        "schema_version": SCHEMA_VERSION,
        "issuer": ISSUER,
        "kind": "proposal-review",
        "base_commit": _git(root, "rev-parse", "HEAD").strip(),
        "authority_digests": binding["authority_digests"],
        "proposal": request,
        "proposal_sha256": _sha(request.encode()),
        "evidence": evidence,
        "owner_approval_evidence": owner,
        "review": review,
        "review_process": json.loads((_RUN.get() / "model.json").read_text())
                          if (_RUN.get() / "model.json").is_file() else None,
    }
    record = dict(payload, proposal_review_id=_sha(_canonical(payload)))
    path = proposal_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    _atomic_write(path, _pretty(record))
    return review

def verify_proposal(root: Path) -> dict:
    try:
        raw = proposal_path(root).read_bytes()
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
            or record.get("base_commit") != _git(root, "rev-parse", "HEAD").strip()):
        raise OracleApprovalError("Oracle proposal review is not bound to this base")
    if record.get("proposal_sha256") != _sha(record.get("proposal", "").encode()):
        raise OracleApprovalError("Oracle proposal content binding is invalid")
    review = record.get("review", {})
    if review.get("verdict") != "APPROVED" or review.get("findings"):
        raise OracleApprovalError("Oracle review requires an approved proposal")
    impact, status = review.get("authentication_impact"), review.get("owner_approval_status")
    if (impact, status) not in {("NONE", "NOT_REQUIRED"), ("AUTHENTICATION", "APPROVED")}:
        raise OracleApprovalError("Oracle proposal approval classification is invalid")
    if _controlling_authorities(record.get("authority_digests", {})) != _controlling_authorities(_live_authorities(root)):
        raise OracleApprovalError("Oracle proposal authority changed")
    evidence, owner = record.get("evidence"), record.get("owner_approval_evidence")
    if not isinstance(evidence, dict) or evidence != _files(root, list(evidence)):
        raise OracleApprovalError("Oracle proposal evidence changed")
    if owner is not None and (not isinstance(owner, dict) or owner != _files(root, list(owner))):
        raise OracleApprovalError("Oracle proposal owner evidence changed")
    _validate_api_version_assessment(review.get("api_version_assessment"), review["verdict"], root, evidence)
    if impact == "AUTHENTICATION" and not owner:
        raise OracleApprovalError("Oracle proposal lacks owner evidence")
    return {"verdict": "APPROVED", "base_commit": record["base_commit"],
            "proposal_sha256": record["proposal_sha256"]}


@_serialized_review
def issue(root: Path, evidence_paths: Sequence[str], owner_path: str | None, reviewer: Callable = _oracle) -> dict[str,Any]:
    with _phase("precheck_seconds"):
        pending = [p for p in (_git(root,"diff","--name-only").splitlines()+_git(root,"ls-files","--others","--exclude-standard").splitlines()) if not p.startswith("Vault/")]
        if pending: raise OracleApprovalError("Oracle review requires every non-Vault change staged: " + ", ".join(sorted(pending)))
        if subprocess.run(["git","diff","--cached","--check"], cwd=root).returncode: raise OracleApprovalError("Staged diff failed git diff --check")
        base, tree = _git(root,"rev-parse","HEAD").strip(), _tree(root); paths = _paths(root,base,tree)
        if not paths: raise OracleApprovalError("Oracle cannot approve an empty candidate")
        receipt_path(root).unlink(missing_ok=True)
        verify_proposal(root)
        proposal = proposal_path(root)
        complete_evidence = [*evidence_paths, str(proposal)]
        evidence, owner = _files(root, complete_evidence), (_files(root, [owner_path]) if owner_path else None)
    with _phase("preparation_seconds"):
        binding = _input_binding(root, evidence, owner)
        authorities = _authorities(root, tree)
        if reviewer is _oracle:
            vault = _vault_evidence(root, paths)
            _assert_binding(root, binding, evidence, owner)
            run = _RUN.get()
            diff = run / "candidate.diff"
            _atomic_write(diff, _git_bytes(root, "diff", "--cached", "--binary", "--full-index"))
            preparation = run / "oracle-inputs.json"
            _atomic_write(preparation, _pretty({"kind": "oracle-preparation-v1", "input_binding": binding,
                                               "changed_paths": paths, "candidate_diff": _files(root, [str(diff)]),
                                               "vault_evidence": _files(root, [str(vault)])}))
            complete_evidence += [str(vault), str(diff), str(preparation)]
            evidence = _files(root, complete_evidence)
        context = _review_context(root, tree, paths, binding, evidence)
        registered_evidence = context["registered_validation_evidence"]
        if registered_evidence != _files(root, list(registered_evidence)):
            raise OracleApprovalError("Retained validation evidence changed during preparation")
        evidence.update(registered_evidence)
        for item in [*context["reusable_validations"], *context["current_validations"]]:
            record = _validation_record(root, item["evidence_path"], item["inputs"], item["environment_digest"])
            evidence.update(_files(root, [item["evidence_path"], *record["output_hashes"]]))
        evidence.update(_files(root, [str(_RUN.get() / "review-context.json")]))
        review_binding = _input_binding(root, evidence, owner)
    review, coverage, validations, ledger = {}, None, None, None
    prepared_approval = None
    try:
        review = reviewer(root,tree,paths,evidence,owner)
        _timed("postcheck_seconds", lambda: _assert_binding(root, review_binding, evidence, owner))
        coverage, validations, ledger = _validate_completed_review(root, review, context, evidence)
        outcome = review["review_status"] if review["review_status"] != "COMPLETE" else review["verdict"]
        if reviewer is _oracle:
            # Selected process settings are part of exact approval custody.
            evidence.update(_files(root, [str(_RUN.get() / "model.json")]))
        if outcome == "APPROVED":
            _validate_api_version_assessment(review.get("api_version_assessment"), "APPROVED", root, evidence)
            impact, status = review.get("authentication_impact"), review.get("owner_approval_status")
            if impact == "AUTHENTICATION" and status != "APPROVED":
                raise OracleApprovalError("Authentication candidate lacks owner approval")
            if impact == "AUTHENTICATION" and not owner:
                raise OracleApprovalError("Authentication candidate lacks owner evidence bytes")
            if impact == "NONE" and status != "NOT_REQUIRED":
                raise OracleApprovalError("Non-authentication candidate has invalid owner status")
            if impact not in {"NONE", "AUTHENTICATION"}:
                raise OracleApprovalError("Oracle candidate lacks authentication classification")
            prepared_approval = _prepare_round(root, context, review, "APPROVED", coverage=coverage, validations=validations, ledger=ledger)
            round_path, round_record = prepared_approval
            round_name = str(round_path.relative_to(root)) if round_path.is_relative_to(root) else str(round_path)
            round_raw = _pretty(round_record)
            evidence[round_name] = _sha(round_raw)
            payload = {"schema_version":SCHEMA_VERSION,"issuer":ISSUER,"verdict":"APPROVED","base_commit":base,"candidate_tree":tree,"changed_paths":paths,"authority_digests":authorities,"authentication_impact":impact,"owner_approval_status":status,"validation_evidence":evidence,"owner_approval_evidence":owner,"review_digest":_sha(_canonical(review)),"api_version_assessment":review["api_version_assessment"]}
            receipt = dict(payload, approval_id=_sha(_canonical(payload)))
            receipt_raw = _pretty(receipt)
            # Verify every gate and actual custody before publishing approval;
            # only the exact prospective history bytes are not yet on disk.
            _verify_receipt(root, receipt, receipt_raw, pending_evidence={round_name: round_raw})
            _assert_binding(root, review_binding, review_binding["validation_evidence"], owner)
            # Until the required round is published, this receipt fails custody.
            _atomic_write(receipt_path(root), receipt_raw)
            _atomic_write(round_path, round_raw)
            return receipt
        round_path = _record_round(root, context, review, outcome, coverage=coverage, validations=validations, ledger=ledger)
    except BaseException as exc:
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
        plan = json.loads(round_path.read_text()).get("repair_plan_file")
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

def verify_commit(root: Path, commit: str) -> None:
    commit = _git(root,"rev-parse",f"{commit}^{{commit}}").strip(); tree = _git(root,"show","-s","--format=%T",commit).strip(); message = _git(root,"show","-s","--format=%B",commit); parents = _git(root,"show","-s","--format=%P",commit).split()
    if len(parents) > 1:
        if len(parents) != 2: raise OracleApprovalError("Oracle accepts only two-parent GitHub merge commits")
        verify_commit(root, parents[1])
        approved_tree = _trailers(_git(root,"show","-s","--format=%B",parents[1]))[TRAILER_KEYS[1]]
        if tree != approved_tree: raise OracleApprovalError("Merge commit tree differs from the Oracle-approved pull-request tree")
        return
    trailers = _trailers(message)
    if trailers[TRAILER_KEYS[0]] != "APPROVED" or trailers[TRAILER_KEYS[1]] != tree: raise OracleApprovalError("Commit Oracle accepted-state trailers are invalid")
    digest = trailers[TRAILER_KEYS[2]]
    if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest): raise OracleApprovalError("Commit Oracle receipt digest is invalid")

def verify_range(root: Path, start: str, end: str) -> None:
    if set(start) == {"0"}:
        adopted = subprocess.run(["git","merge-base","--is-ancestor",ADOPTION_BASE_COMMIT,end], cwd=root).returncode == 0
        revision = f"{ADOPTION_BASE_COMMIT}..{end}" if adopted else end
    else:
        revision = f"{start}..{end}"
    for commit in _git(root,"rev-list","--reverse",revision).splitlines(): verify_commit(root,commit)

def main(argv: Sequence[str] | None = None) -> int:
    p=argparse.ArgumentParser(); sub=p.add_subparsers(dest="cmd",required=True)
    review=sub.add_parser("review"); review.add_argument("--evidence",action="append",default=[]); review.add_argument("--owner-approval")
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
        elif args.cmd=="review": receipt=issue(root,args.evidence,args.owner_approval); print(f"APPROVED {receipt['candidate_tree']}")
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
