#!/usr/bin/env python3
"""Authorize a narrowly reviewed privacy-policy transition during validation."""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import re
import subprocess
from pathlib import Path

try:
    from . import oracle_approval as o, oracle_lifecycle, shipment_state
except ImportError:
    import oracle_approval as o
    import oracle_lifecycle
    import shipment_state

SCOPE = "UNCHANGED_NON_ARCHIVE_PASS"
INPUTS = {"scripts/check-customer-data.mjs", "scripts/lib/privacy-coverage.mjs", "tools/privacy_coverage.py",
          "privacy/customer-identifiers.sha256", "privacy/approved-binary-assets.sha256",
          "privacy/owned-github-pr-identities.json", "privacy/owned-native-probe-identities.json"}


def policy_preview(root: Path) -> dict:
    completed = subprocess.run(["node", "--input-type=module", "-e",
        "import {relative} from 'node:path';"
        "import {privacyPolicyPreview,privacyCandidates,root} from './scripts/check-customer-data.mjs';"
        "const archive_paths=[...await privacyCandidates()].filter(p=>p.endsWith('.zip')&&!p.includes(root+'/Vault/index/')).sort().map(p=>relative(root,p));"
        "console.log(JSON.stringify({...await privacyPolicyPreview(),archive_paths}));"],
        cwd=root, capture_output=True, text=True, check=True)
    result = json.loads(completed.stdout)
    if result.get("kind") != "boc-privacy-policy-description-v1":
        raise o.OracleApprovalError("Privacy policy description is unavailable")
    return result


def _evidence(root: Path, reference: dict) -> dict:
    raw = o._custody_read(root, reference["path"])[1]
    if o._sha(raw) != reference["sha256"]:
        raise o.OracleApprovalError("Privacy transition supporting evidence changed")
    value = json.loads(raw)
    if value.get("exit_code") != 0:
        raise o.OracleApprovalError("Privacy transition requires actual passing supporting observations")
    if any(o._sha(o._custody_read(root, name)[1]) != digest for name, digest in value.get("output_hashes", {}).items()):
        raise o.OracleApprovalError("Privacy transition original execution output changed")
    return value


def _archive_proof(root: Path, record: dict, facts: dict, key: bytes, preview: dict) -> None:
    outputs = [name for name in record.get("output_hashes", {}) if name.endswith(".stdout.log")]
    if len(outputs) != 1:
        raise o.OracleApprovalError("Privacy transition requires the original affected-scope output")
    result = json.loads(o._custody_read(root, outputs[0])[1])
    path = Path(result["proof_file"])
    expected = o.receipt_path(root).parent / "privacy-coverage/assessments" / (result["proof_sha256"] + ".json")
    raw = o._custody_read(root, path)[1]
    proof = json.loads(raw); payload = {name: value for name, value in proof.items() if name != "signature"}
    encoded = (json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n").encode()
    partition, validation = proof.get("partition", {}), proof.get("validation", {})
    if (result.get("kind") != "boc-privacy-transition-assessment-v1" or path != expected
            or o._sha(raw) != result["proof_sha256"]
            or not hmac.compare_digest(proof.get("signature", ""), hmac.new(key, encoded, hashlib.sha256).hexdigest())
            or proof.get("kind") != "boc-privacy-transition-proof-v1" or proof.get("findings") != []
            or partition.get("previous_policy_sha256") != facts["previous_policy_sha256"]
            or partition.get("current_policy_sha256") != facts["current_policy_sha256"]
            or validation.get("policy_sha256") != facts["current_policy_sha256"]
            or validation.get("outcome") != "PASSED"):
        raise o.OracleApprovalError("Privacy transition affected-scope proof is stale or untrusted")
    files = {row["path"]: row for row in partition["files"]}
    affected = {row["path"]: row for row in validation["files"]}
    if (set(affected) != {name for name, row in files.items() if not row.get("original")}
            or any(row.get("outcome") != "PASSED" or row.get("sha256") != files[name].get("sha256") for name, row in affected.items())):
        raise o.OracleApprovalError("Privacy transition affected members lack exact passing coverage")
    archives = sorted(name for name in files if name.endswith(".zip"))
    if archives != preview.get("archive_paths") or any(files[name].get("original") for name in archives):
        raise o.OracleApprovalError("Privacy transition archive membership changed or reuses unsafe original coverage")
    if any(o._sha(o._custody_read(root, name)[1]) != files[name]["sha256"] for name in archives):
        raise o.OracleApprovalError("Privacy transition archive contents changed")


@o._metadata_owner
def authorize(root: Path, facts_path: Path) -> dict:
    receipt, receipt_raw = shipment_state.validated_receipt(root)
    name = o._custody_name(root, facts_path)
    raw = o._custody_read(root, name)[1]
    facts = json.loads(raw)
    if (facts.get("kind") != "boc-privacy-policy-transition-proposal-v1" or facts.get("scope") != SCOPE
            or receipt["validation_evidence"].get(name) != o._sha(raw)
            or any(not re.fullmatch(r"[0-9a-f]{64}", facts.get(key, ""))
                   for key in ("previous_policy_sha256", "current_policy_sha256"))
            or facts["previous_policy_sha256"] == facts["current_policy_sha256"]):
        raise o.OracleApprovalError("Privacy transition facts lack exact current independent approval")
    approved = False
    for path, digest in receipt["validation_evidence"].items():
        item = Path(path) if Path(path).is_absolute() else root / path
        if item.parent.parent != o.receipt_path(root).parent / "series" or not item.name.startswith("round-"):
            continue
        round_raw = o._custody_read(root, item)[1]
        record = json.loads(round_raw)
        review = record.get("review", {})
        if (o._sha(round_raw) != digest or record.get("outcome") != "APPROVED"
                or review.get("review_status") != "COMPLETE"
                or record.get("candidate_tree") != receipt["candidate_tree"]
                or o._sha(o._canonical(review)) != receipt["review_digest"]):
            continue
        approved = any(row.get("command") == ["npm", "run", "check:privacy"]
            and row.get("status") == "COMPLETE" and row.get("basis") == "INDEPENDENT_APPLICABILITY"
            and name in row.get("evidence_paths", []) for row in review.get("command_coverage", []))
        if approved:
            break
    if not approved:
        raise o.OracleApprovalError("Complete privacy applicability must explicitly assess the transition facts")
    inputs = facts.get("source_inputs", {})
    if not INPUTS <= set(inputs) or o._files(root, list(inputs)) != inputs:
        raise o.OracleApprovalError("Privacy transition source/configuration bindings changed")
    preview = policy_preview(root)
    if preview.get("policy_sha256") != facts["current_policy_sha256"]:
        raise o.OracleApprovalError("Privacy transition policy/executable/environment changed")
    original = _evidence(root, facts["original_full_scan"])
    if (original.get("kind") != "privacy-production-measurement-v1"
            or original.get("command") != ["npm", "run", "check:privacy"]
            or original.get("coverage", {}).get("policy_sha256") != facts["previous_policy_sha256"]
            or original.get("coverage", {}).get("files", 0) <= 0):
        raise o.OracleApprovalError("Privacy transition lacks the original complete-scope observation")
    archive = _evidence(root, facts["archive_validation"])
    if archive.get("kind") != "oracle-validation-record-v1":
        raise o.OracleApprovalError("Privacy transition lacks native repaired-archive coverage")
    archive = o._validation_record(root, facts["archive_validation"]["path"], archive["inputs"], archive["environment_digest"])
    key = o._custody_read(root, o.receipt_path(root).parent / "privacy-coverage/issuer.key")[1]
    if len(key) != 32:
        raise o.OracleApprovalError("Privacy transition issuer identity changed")
    _archive_proof(root, archive, facts, key, preview)
    payload = {"kind": "boc-privacy-policy-transition-v1", "scope": SCOPE,
        "previous_policy_sha256": facts["previous_policy_sha256"],
        "current_policy_sha256": facts["current_policy_sha256"],
        "technical_receipt_sha256": o._sha(receipt_raw), "facts_sha256": o._sha(raw)}
    encoded = (json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()
    result = dict(payload, signature=hmac.new(key, encoded, hashlib.sha256).hexdigest())
    path = o.receipt_path(root).parent / "privacy-coverage/transitions" / (payload["current_policy_sha256"] + ".json")
    if path.exists():
        previous_raw = o._custody_read(root, path)[1]
        previous = json.loads(previous_raw)
        prior = {name: value for name, value in previous.items() if name != "signature"}
        prior_encoded = (json.dumps(prior, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()
        if (hmac.compare_digest(previous.get("signature", ""), hmac.new(key, prior_encoded, hashlib.sha256).hexdigest())
                and all(prior.get(name) == payload[name] for name in
                        ("kind", "scope", "previous_policy_sha256", "current_policy_sha256"))):
            return {"status": "AUTHORIZED", "transition_file": str(path), "transition_sha256": o._sha(previous_raw)}
        raise o.OracleApprovalError("Existing privacy policy transition changed")
    identity = oracle_lifecycle._publish(o, root, path, result)
    return {"status": "AUTHORIZED", "transition_file": str(path), "transition_sha256": identity}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["authorize"])
    parser.add_argument("--facts", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(authorize(o.repository_root(), args.facts), indent=2))
        return 0
    except (o.OracleApprovalError, OSError, ValueError, KeyError, subprocess.CalledProcessError) as exc:
        print(str(exc), file=o.sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
