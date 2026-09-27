#!/usr/bin/env python3
"""Issue and verify tree-bound Operations Center approvals."""
from __future__ import annotations
import argparse, hashlib, json, re, subprocess, sys, tempfile
from pathlib import Path
from typing import Any, Callable, Sequence

ROOT = Path(__file__).resolve().parents[1]
SCHEMA_VERSION = 1
ADOPTION_BASE_COMMIT = "530b07932167318889b2d9491398847c9843dd9b"
ISSUER = "bos-operations-center-oracle-cli"
AUTHORITY_PATHS = ("AGENTS.md", ".agents/skills/oracle/SKILL.md")
TRAILER_KEYS = ("Oracle-Verdict", "Oracle-Reviewed-Tree", "Oracle-Receipt-SHA256")
VAULT_QUERY = "authentication recovery exact canonical condition codes Oracle approval shared product contract"

class OracleApprovalError(RuntimeError): pass

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

def _vault_evidence(root: Path) -> Path:
    subprocess.run([sys.executable, "tools/vault_index.py", "sync", "--quiet"], cwd=root, check=True)
    query = subprocess.run(
        [sys.executable, "tools/vault_index.py", "query", VAULT_QUERY],
        cwd=root, capture_output=True, text=True, check=True,
    )
    results = json.loads(query.stdout)
    manifest_path = root / "Vault/index/manifests/latest.json"
    manifest = json.loads(manifest_path.read_text())
    evidence = {
        "command": f'python3 tools/vault_index.py query "{VAULT_QUERY}"',
        "exit_code": 0,
        "index_manifest_sha256": _sha(manifest_path.read_bytes()),
        "canonical_source_snapshot_sha256": manifest["canonical_source_snapshot_sha256"],
        "indexed_at": manifest["indexed_at"],
        "results": results,
    }
    path = receipt_path(root).parent / "vault-query.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_pretty(evidence))
    return path

def _shape(receipt: dict[str, Any]) -> dict[str, Any]:
    required = {"schema_version","issuer","verdict","base_commit","candidate_tree","changed_paths","authority_digests","authentication_impact","owner_approval_status","validation_evidence","owner_approval_evidence","review_digest","approval_id"}
    if set(receipt) != required: raise OracleApprovalError("Oracle receipt fields do not match the v1 contract")
    payload = {k: v for k, v in receipt.items() if k != "approval_id"}
    if receipt["approval_id"] != _sha(_canonical(payload)): raise OracleApprovalError("Oracle approval receipt ID is invalid")
    if payload["schema_version"] != SCHEMA_VERSION or payload["issuer"] != ISSUER or payload["verdict"] != "APPROVED": raise OracleApprovalError("Oracle receipt identity is invalid")
    impact, status = payload["authentication_impact"], payload["owner_approval_status"]
    if impact == "AUTHENTICATION" and status != "APPROVED": raise OracleApprovalError("Authentication receipt lacks approved owner evidence")
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
    return receipt, raw

def _oracle(root: Path, tree: str, paths: list[str], evidence: dict[str,str], owner: dict[str,str] | None) -> dict[str,Any]:
    request = {"candidate_tree": tree, "changed_paths": paths, "validation_evidence": evidence, "owner_approval_evidence": owner}
    prompt = f"""You are the independent BOS Operations Center Oracle approval process.
Read .agents/skills/oracle/SKILL.md completely and wear that approver skill. Read AGENTS.md and all required private Vault authority. Review git diff --cached and this evidence read-only. Only this process issues Oracle warnings and verdicts. Return JSON matching the supplied schema. Classify authentication_impact as AUTHENTICATION or NONE. An APPROVED authentication review requires owner_approval_status APPROVED. A REJECTED authentication review may report APPROVED, MISSING, or INVALID. A NONE review uses NOT_REQUIRED. Only APPROVED with no findings can issue a receipt.\n{json.dumps(request, indent=2, sort_keys=True)}"""
    with tempfile.TemporaryDirectory(prefix="boc-oracle-") as directory:
        output = Path(directory) / "result.json"
        cmd = ["codex","exec","--ephemeral","--ignore-user-config","--sandbox","read-only","--cd",str(root),"--output-schema",str(root / ".agents/skills/oracle/review-output.schema.json"),"--output-last-message",str(output),prompt]
        completed = subprocess.run(cmd, cwd=root, capture_output=True, text=True)
        if completed.returncode:
            raise OracleApprovalError("Independent Oracle process failed: " + (completed.stderr or completed.stdout).strip())
        try: return json.loads(output.read_text())
        except (OSError, json.JSONDecodeError) as exc: raise OracleApprovalError("Independent Oracle returned invalid JSON") from exc

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
    with tempfile.TemporaryDirectory(prefix="boc-oracle-proposal-") as directory:
        output = Path(directory) / "result.json"
        cmd = ["codex","exec","--ephemeral","--ignore-user-config","--sandbox","read-only","--cd",str(root),"--output-schema",str(root / ".agents/skills/oracle/review-output.schema.json"),"--output-last-message",str(output),prompt]
        completed = subprocess.run(cmd, cwd=root, capture_output=True, text=True)
        if completed.returncode:
            raise OracleApprovalError("Independent Oracle proposal review failed: " + (completed.stderr or completed.stdout).strip())
        try: return json.loads(output.read_text())
        except (OSError, json.JSONDecodeError) as exc: raise OracleApprovalError("Independent Oracle returned invalid JSON") from exc

def review_proposal(root: Path, request: str, evidence_paths: Sequence[str], owner_path: str | None, reviewer: Callable = _proposal_oracle) -> dict[str,Any]:
    if not request.strip(): raise OracleApprovalError("Oracle proposal review requires a proposal")
    evidence = _files(root, evidence_paths)
    owner = _files(root, [owner_path]) if owner_path else None
    review = reviewer(root, request, evidence, owner)
    if review.get("verdict") not in {"APPROVED", "REJECTED"}:
        raise OracleApprovalError("Independent Oracle proposal review returned no verdict")
    payload = {
        "schema_version": SCHEMA_VERSION,
        "issuer": ISSUER,
        "kind": "proposal-review",
        "base_commit": _git(root, "rev-parse", "HEAD").strip(),
        "proposal": request,
        "proposal_sha256": _sha(request.encode()),
        "evidence": evidence,
        "owner_approval_evidence": owner,
        "review": review,
    }
    record = dict(payload, proposal_review_id=_sha(_canonical(payload)))
    path = proposal_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(_pretty(record))
    return review

def issue(root: Path, evidence_paths: Sequence[str], owner_path: str | None, reviewer: Callable = _oracle) -> dict[str,Any]:
    pending = [p for p in (_git(root,"diff","--name-only").splitlines()+_git(root,"ls-files","--others","--exclude-standard").splitlines()) if not p.startswith("Vault/")]
    if pending: raise OracleApprovalError("Oracle review requires every non-Vault change staged: " + ", ".join(sorted(pending)))
    if subprocess.run(["git","diff","--cached","--check"], cwd=root).returncode: raise OracleApprovalError("Staged diff failed git diff --check")
    base, tree = _git(root,"rev-parse","HEAD").strip(), _tree(root); paths = _paths(root,base,tree)
    if not paths: raise OracleApprovalError("Oracle cannot approve an empty candidate")
    proposal = proposal_path(root)
    if not proposal.is_file(): raise OracleApprovalError("Oracle review requires a prior proposal review")
    try:
        proposal_record = json.loads(proposal.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise OracleApprovalError("Oracle proposal review record is invalid") from exc
    proposal_payload = {key: value for key, value in proposal_record.items() if key != "proposal_review_id"}
    if proposal_record.get("proposal_review_id") != _sha(_canonical(proposal_payload)):
        raise OracleApprovalError("Oracle proposal review record binding is invalid")
    if proposal_record.get("kind") != "proposal-review" or proposal_record.get("base_commit") != base:
        raise OracleApprovalError("Oracle proposal review is not bound to this base")
    if proposal_record.get("review", {}).get("verdict") != "APPROVED":
        raise OracleApprovalError("Oracle review requires an approved proposal")
    complete_evidence = [*evidence_paths, str(proposal)]
    if reviewer is _oracle: complete_evidence.append(str(_vault_evidence(root)))
    evidence, owner = _files(root,complete_evidence), (_files(root,[owner_path]) if owner_path else None)
    review = reviewer(root,tree,paths,evidence,owner)
    if review.get("verdict") != "APPROVED" or review.get("findings"):
        detail = "; ".join(str(item.get("message", "blocking finding")) for item in review.get("findings", []))
        raise OracleApprovalError("Independent Oracle rejected the candidate" + (f": {detail}" if detail else ""))
    impact, status = review.get("authentication_impact"), review.get("owner_approval_status")
    if impact == "AUTHENTICATION" and status != "APPROVED": raise OracleApprovalError("Authentication candidate lacks owner approval")
    if impact == "NONE" and status != "NOT_REQUIRED": raise OracleApprovalError("Non-authentication candidate has invalid owner status")
    payload = {"schema_version":SCHEMA_VERSION,"issuer":ISSUER,"verdict":"APPROVED","base_commit":base,"candidate_tree":tree,"changed_paths":paths,"authority_digests":_authorities(root,tree),"authentication_impact":impact,"owner_approval_status":status,"validation_evidence":evidence,"owner_approval_evidence":owner,"review_digest":_sha(_canonical(review))}
    receipt = dict(payload, approval_id=_sha(_canonical(payload)))
    path = receipt_path(root); path.parent.mkdir(parents=True,exist_ok=True); path.write_bytes(_pretty(receipt)); verify_staged(root)
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
    sub.add_parser("verify-staged"); a=sub.add_parser("apply-trailers"); a.add_argument("path",type=Path); m=sub.add_parser("verify-message"); m.add_argument("path",type=Path); v=sub.add_parser("verify-commit"); v.add_argument("commit",nargs="?",default="HEAD"); r=sub.add_parser("verify-range"); r.add_argument("start"); r.add_argument("end")
    args=p.parse_args(argv); root=repository_root()
    try:
        if args.cmd=="review": receipt=issue(root,args.evidence,args.owner_approval); print(f"APPROVED {receipt['candidate_tree']}")
        elif args.cmd=="proposal":
            request = args.request or sys.stdin.read().strip()
            result = review_proposal(root,request,args.evidence,args.owner_approval)
            print(json.dumps(result,indent=2,sort_keys=True))
            if result["verdict"] != "APPROVED": return 1
        elif args.cmd=="verify-staged": verify_staged(root); print("APPROVED")
        elif args.cmd=="apply-trailers": apply_trailers(root,args.path); print("APPROVED")
        elif args.cmd=="verify-message": verify_message(root,args.path); print("APPROVED")
        elif args.cmd=="verify-commit": verify_commit(root,args.commit); print("APPROVED")
        else: verify_range(root,args.start,args.end); print("APPROVED")
    except (OracleApprovalError,OSError,subprocess.CalledProcessError) as exc: print(f"REJECTED: {exc}",file=sys.stderr); return 1
    return 0
if __name__=="__main__": raise SystemExit(main())
