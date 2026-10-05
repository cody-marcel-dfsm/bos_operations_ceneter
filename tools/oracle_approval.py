#!/usr/bin/env python3
"""Issue and verify tree-bound Operations Center approvals."""
from __future__ import annotations
import argparse, hashlib, json, os, re, subprocess, sys, tempfile, fcntl, time
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

class OracleApprovalError(RuntimeError): pass

_RUN = ContextVar("oracle_run", default=None)
LIVE_AUTHORITIES = (*AUTHORITY_PATHS, ".agents/skills/oracle/review-output.schema.json",
                    "Vault/docs/CONSTITUTION.md", "Vault/docs/architecture.md",
                    "Vault/docs/issues/ISSUE_HISTORY.md", "Vault/specs/oracle-and-vault.md")


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


def _timed(phase: str, call):
    started = time.monotonic()
    try:
        return call()
    finally:
        run = _RUN.get()
        if run:
            path = run / "timings.json"
            timings = json.loads(path.read_text()) if path.exists() else {}
            timings[phase] = round(time.monotonic() - started, 6)
            _atomic_write(path, _pretty(timings))


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
            try:
                return _timed("total_seconds", lambda: function(root, *args, **kwargs))
            except BaseException as exc:
                _atomic_write(run / "failure.json", _pretty({"error": str(exc)}))
                raise
            finally:
                _RUN.reset(token)
    return wrapped


def _live_authorities(root: Path) -> dict:
    # Hash bytes without loading approver instructions into an ordinary agent.
    return {name: _sha((root / name).read_bytes()) if (root / name).is_file() else None
            for name in LIVE_AUTHORITIES}


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
            "validation_evidence": _files(root, list(evidence)),
            "owner_approval_evidence": _files(root, list(owner)) if owner is not None else None}


def _assert_binding(root: Path, expected: dict, evidence: dict, owner: dict | None) -> None:
    if _input_binding(root, evidence, owner) != expected:
        raise OracleApprovalError("Oracle review inputs changed during preparation or review")


def _review_process(root: Path, prompt: str, prefix: str) -> dict:
    run = _RUN.get()
    if run is None:
        raise OracleApprovalError("Independent Oracle must run under the review lock")
    output = run / "result.json"
    model = selected_model()
    metadata = {"selected_model": model, "sandbox": "read-only", "ephemeral": True,
                "ignore_user_config": True,
                "schema_sha256": _sha((root / ".agents/skills/oracle/review-output.schema.json").read_bytes()),
                "model_helper_sha256": _sha((root / "tools/codex_child_model.py").read_bytes())}
    _atomic_write(run / "model.json", _pretty(metadata))
    prompt += "\nReviewer process configuration:\n" + json.dumps(metadata, sort_keys=True)
    _atomic_write(run / "request.txt", prompt.encode())
    cmd = ["codex", "exec", "--ephemeral", "--ignore-user-config", "--model", model,
           "--sandbox", "read-only", "--cd", str(root), "--output-schema",
           str(root / ".agents/skills/oracle/review-output.schema.json"),
           "--output-last-message", str(output), prompt]
    completed = _timed(prefix + "_seconds", lambda: subprocess.run(
        cmd, cwd=root, capture_output=True, text=True,
        env={**os.environ, "CODEX_SELECTED_MODEL": model}))
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
    return result

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

def _vault_evidence(root: Path, paths: list[str]) -> Path:
    # One sync/query/manifest child avoids a second native initialization.
    # The required semantic query remains the first query in the package.
    command = [sys.executable, "tools/vault_index.py", "evidence", VAULT_QUERY]
    if paths:
        command += ["--supplemental", "Oracle candidate " + " ".join(paths)]
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


def _shape(receipt: dict[str, Any]) -> dict[str, Any]:
    required = {"schema_version","issuer","verdict","base_commit","candidate_tree","changed_paths","authority_digests","authentication_impact","owner_approval_status","validation_evidence","owner_approval_evidence","review_digest","approval_id"}
    if set(receipt) != required: raise OracleApprovalError("Oracle receipt fields do not match the v1 contract")
    payload = {k: v for k, v in receipt.items() if k != "approval_id"}
    if receipt["approval_id"] != _sha(_canonical(payload)): raise OracleApprovalError("Oracle approval receipt ID is invalid")
    if payload["schema_version"] != SCHEMA_VERSION or payload["issuer"] != ISSUER or payload["verdict"] != "APPROVED": raise OracleApprovalError("Oracle receipt identity is invalid")
    impact, status = payload["authentication_impact"], payload["owner_approval_status"]
    if impact == "AUTHENTICATION" and status != "APPROVED": raise OracleApprovalError("Authentication receipt lacks approved owner evidence")
    if impact == "AUTHENTICATION" and not payload["owner_approval_evidence"]: raise OracleApprovalError("Authentication receipt lacks owner evidence bytes")
    if impact == "NONE" and status != "NOT_REQUIRED": raise OracleApprovalError("Non-authentication receipt has invalid owner status")
    if impact not in {"AUTHENTICATION", "NONE"}: raise OracleApprovalError("Oracle receipt lacks authentication classification")
    return payload

def _read_local(root: Path) -> tuple[dict[str, Any], bytes]:
    try: raw = receipt_path(root).read_bytes(); receipt = json.loads(raw)
    except (OSError, json.JSONDecodeError) as exc: raise OracleApprovalError("Local Oracle receipt is missing or invalid") from exc
    if not isinstance(receipt, dict) or raw != _pretty(receipt): raise OracleApprovalError("Oracle receipt is not canonical pretty JSON")
    return receipt, raw

def verify_staged(root: Path) -> tuple[dict[str, Any], bytes]:
    receipt, raw = _read_local(root); payload = _shape(receipt)
    base, tree = _git(root, "rev-parse", "HEAD").strip(), _tree(root)
    if payload["base_commit"] != base: raise OracleApprovalError("Oracle receipt is bound to another base")
    if payload["candidate_tree"] != tree: raise OracleApprovalError("Oracle receipt is stale for the staged tree")
    if payload["changed_paths"] != _paths(root, base, tree): raise OracleApprovalError("Oracle changed-path binding is invalid")
    if payload["authority_digests"] != _authorities(root, tree): raise OracleApprovalError("Oracle authority binding is invalid")
    evidence = payload["validation_evidence"]
    if not isinstance(evidence, dict) or evidence != _files(root, list(evidence)): raise OracleApprovalError("Oracle validation evidence changed")
    owner = payload["owner_approval_evidence"]
    if owner is not None and (not isinstance(owner, dict) or owner != _files(root, list(owner))): raise OracleApprovalError("Oracle owner evidence changed")
    for name in evidence:
        if Path(name).name != "oracle-inputs.json":
            continue
        preparation = json.loads((Path(name) if Path(name).is_absolute() else root / name).read_bytes())
        if preparation.get("kind") != "oracle-preparation-v1":
            raise OracleApprovalError("Oracle preparation identity is invalid")
        binding = preparation["input_binding"]
        _assert_binding(root, binding, binding["validation_evidence"], binding["owner_approval_evidence"])
        for group in ("candidate_diff", "vault_evidence"):
            files = preparation[group]
            if files != _files(root, list(files)):
                raise OracleApprovalError("Oracle preparation evidence changed")
    return receipt, raw

def _oracle(root: Path, tree: str, paths: list[str], evidence: dict[str,str], owner: dict[str,str] | None) -> dict[str,Any]:
    request = {"candidate_tree": tree, "changed_paths": paths, "validation_evidence": evidence, "owner_approval_evidence": owner}
    prompt = f"""You are the independent BOS Operations Center Oracle approval process.
Read .agents/skills/oracle/SKILL.md completely and wear that approver skill. Read AGENTS.md and all required private Vault authority. Read the hash-bound oracle-inputs.json, candidate.diff and vault-query.json evidence as prepared navigation; inspect the full git diff --cached, canonical authorities, current issue history and all validation evidence read-only. Prepared retrieval never narrows review coverage. Only this process issues Oracle warnings and verdicts. Return JSON matching the supplied schema. Classify authentication_impact as AUTHENTICATION or NONE. An APPROVED authentication review requires owner_approval_status APPROVED. A REJECTED authentication review may report APPROVED, MISSING, or INVALID. A NONE review uses NOT_REQUIRED. Only APPROVED with no findings can issue a receipt.\n{json.dumps(request, indent=2, sort_keys=True)}"""
    return _review_process(root, prompt, "reviewer")

def _proposal_oracle(root: Path, request: str, evidence: dict[str,str], owner: dict[str,str] | None) -> dict[str,Any]:
    payload = {
        "proposal": request,
        "evidence": evidence,
        "owner_approval_evidence": owner,
    }
    prompt = f"""You are the independent BOS Operations Center Oracle proposal-review process.
Read .agents/skills/oracle/SKILL.md completely and wear that approver skill. Read AGENTS.md and all required private Vault authority. Review the proposed solution before implementation using current filesystem evidence. Operate read-only: do not edit, stage, commit, deploy, write an approval receipt, or treat this proposal verdict as completed-tree approval.

Return JSON matching the supplied schema. Verify the stated problem and cause, classify authentication_impact as AUTHENTICATION or NONE, and reject architectural invention or a service/API-contract change presented as a client fix. Restoration of already-approved behavior may reuse exact existing owner approval; a genuinely new or changed authentication design, public API contract, or architecture requires exact owner approval and must be REJECTED with owner_approval_status MISSING or INVALID when that evidence is absent. An approved proposal allows the ordinary workflow to continue automatically within the user's existing task authorization; completed-tree Oracle review remains mandatory after implementation. Every finding must state concise Problem, Cause, and Recommended change sections with no more than three sentences each.
{json.dumps(payload, indent=2, sort_keys=True)}"""
    return _review_process(root, prompt, "proposal_reviewer")

@_serialized_review
def review_proposal(root: Path, request: str, evidence_paths: Sequence[str], owner_path: str | None, reviewer: Callable = _proposal_oracle) -> dict[str,Any]:
    if not request.strip(): raise OracleApprovalError("Oracle proposal review requires a proposal")
    proposal_path(root).unlink(missing_ok=True)
    receipt_path(root).unlink(missing_ok=True)
    evidence = _files(root, evidence_paths)
    owner = _files(root, [owner_path]) if owner_path else None
    binding = _input_binding(root, evidence, owner)
    review = reviewer(root, request, evidence, owner)
    _assert_binding(root, binding, evidence, owner)
    if review.get("verdict") not in {"APPROVED", "REJECTED"}:
        raise OracleApprovalError("Independent Oracle proposal review returned no verdict")
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
    if record.get("authority_digests") != _live_authorities(root):
        raise OracleApprovalError("Oracle proposal authority changed")
    evidence, owner = record.get("evidence"), record.get("owner_approval_evidence")
    if not isinstance(evidence, dict) or evidence != _files(root, list(evidence)):
        raise OracleApprovalError("Oracle proposal evidence changed")
    if owner is not None and (not isinstance(owner, dict) or owner != _files(root, list(owner))):
        raise OracleApprovalError("Oracle proposal owner evidence changed")
    if impact == "AUTHENTICATION" and not owner:
        raise OracleApprovalError("Oracle proposal lacks owner evidence")
    return {"verdict": "APPROVED", "base_commit": record["base_commit"],
            "proposal_sha256": record["proposal_sha256"]}


@_serialized_review
def issue(root: Path, evidence_paths: Sequence[str], owner_path: str | None, reviewer: Callable = _oracle) -> dict[str,Any]:
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
    review_binding = _input_binding(root, evidence, owner)
    review = reviewer(root,tree,paths,evidence,owner)
    _assert_binding(root, review_binding, evidence, owner)
    if reviewer is _oracle:
        # Bind actual selected process settings without requiring the calling
        # task's model to remain the same at a later commit-hook verification.
        evidence.update(_files(root, [str(_RUN.get() / "model.json")]))
    if review.get("verdict") != "APPROVED" or review.get("findings"):
        detail = "; ".join(str(item.get("message", "blocking finding")) for item in review.get("findings", []))
        raise OracleApprovalError("Independent Oracle rejected the candidate" + (f": {detail}" if detail else ""))
    impact, status = review.get("authentication_impact"), review.get("owner_approval_status")
    if impact == "AUTHENTICATION" and status != "APPROVED": raise OracleApprovalError("Authentication candidate lacks owner approval")
    if impact == "AUTHENTICATION" and not owner: raise OracleApprovalError("Authentication candidate lacks owner evidence bytes")
    if impact == "NONE" and status != "NOT_REQUIRED": raise OracleApprovalError("Non-authentication candidate has invalid owner status")
    payload = {"schema_version":SCHEMA_VERSION,"issuer":ISSUER,"verdict":"APPROVED","base_commit":base,"candidate_tree":tree,"changed_paths":paths,"authority_digests":authorities,"authentication_impact":impact,"owner_approval_status":status,"validation_evidence":evidence,"owner_approval_evidence":owner,"review_digest":_sha(_canonical(review))}
    receipt = dict(payload, approval_id=_sha(_canonical(payload)))
    path = receipt_path(root)
    _atomic_write(path, _pretty(receipt))
    try:
        verify_staged(root)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    return receipt

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
    sub.add_parser("verify-proposal"); sub.add_parser("verify-staged"); a=sub.add_parser("apply-trailers"); a.add_argument("path",type=Path); m=sub.add_parser("verify-message"); m.add_argument("path",type=Path); v=sub.add_parser("verify-commit"); v.add_argument("commit",nargs="?",default="HEAD"); r=sub.add_parser("verify-range"); r.add_argument("start"); r.add_argument("end")
    args=p.parse_args(argv); root=repository_root()
    try:
        if args.cmd=="review": receipt=issue(root,args.evidence,args.owner_approval); print(f"APPROVED {receipt['candidate_tree']}")
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
    except (OracleApprovalError,OSError,subprocess.CalledProcessError) as exc: print(f"REJECTED: {exc}",file=sys.stderr); return 1
    return 0
if __name__=="__main__": raise SystemExit(main())
