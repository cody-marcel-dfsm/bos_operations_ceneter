"""A policy bridge consumes a finalized independent decision and exact facts."""
import copy
import hashlib
import hmac
import json
import inspect
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import oracle_approval as o, privacy_coverage as privacy


class PrivacyTransition(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(); self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name).resolve()
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        self.folder = self.root / "Vault/tmp"; self.folder.mkdir(parents=True)
        self.key = self.root / ".git/oracle/privacy-coverage/issuer.key"
        self.key.parent.mkdir(parents=True); self.key.write_bytes(b"k" * 32); self.key.chmod(0o600)
        self.previous, self.current = "a" * 64, "b" * 64
        for name in privacy.INPUTS:
            path = self.root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text("synthetic source " + name)
        self.original = self.folder / "original.json"
        self.original.write_text(json.dumps({"kind": "privacy-production-measurement-v1", "exit_code": 0,
            "command": ["npm", "run", "check:privacy"], "coverage": {"files": 3, "policy_sha256": self.previous}}))
        self.archive = self.folder / "archive.json"
        self.archive_file = self.root / "artifact.zip"; self.archive_file.write_bytes(b"synthetic archived bytes")
        entry = {"path": "artifact.zip", "sha256": o._sha(self.archive_file.read_bytes())}
        proof = {"kind": "boc-privacy-transition-proof-v1", "partition": {"previous_policy_sha256": self.previous,
            "current_policy_sha256": self.current, "files": [entry]}, "validation": {"policy_sha256": self.current,
            "outcome": "PASSED", "files": [dict(entry, outcome="PASSED")]}, "findings": []}
        encoded = (json.dumps(proof, separators=(",", ":")) + "\n").encode()
        proof["signature"] = hmac.new(self.key.read_bytes(), encoded, hashlib.sha256).hexdigest()
        proof_raw = (json.dumps(proof, separators=(",", ":")) + "\n").encode(); proof_hash = o._sha(proof_raw)
        proof_path = self.key.parent / "assessments" / (proof_hash + ".json"); proof_path.parent.mkdir()
        proof_path.write_bytes(proof_raw)
        output = self.folder / "archive.stdout.log"
        output.write_text(json.dumps({"kind": "boc-privacy-transition-assessment-v1", "proof_file": str(proof_path), "proof_sha256": proof_hash}))
        self.archive_record = {"kind": "oracle-validation-record-v1", "exit_code": 0,
            "inputs": [], "environment_digest": "actual-original-environment", "output_hashes": {str(output): o._sha(output.read_bytes())}}
        self.archive.write_text(json.dumps(self.archive_record))
        self.facts_path = self.folder / "facts.json"
        self.facts = {"kind": "boc-privacy-policy-transition-proposal-v1", "scope": privacy.SCOPE,
            "previous_policy_sha256": self.previous, "current_policy_sha256": self.current,
            "source_inputs": o._files(self.root, sorted(privacy.INPUTS)),
            "original_full_scan": self.reference(self.original), "archive_validation": self.reference(self.archive)}
        self.facts_path.write_bytes(o._pretty(self.facts))
        self.name = o._custody_name(self.root, self.facts_path)
        self.round = self.root / ".git/oracle/series/synthetic/round-0001.json"; self.round.parent.mkdir(parents=True)
        self.review = {"review_status": "COMPLETE", "command_coverage": [{"command": ["npm", "run", "check:privacy"],
            "status": "COMPLETE", "basis": "INDEPENDENT_APPLICABILITY", "evidence_paths": [self.name]}]}
        self.round.write_bytes(o._pretty({"outcome": "APPROVED", "candidate_tree": "c" * 40, "review": self.review}))
        self.receipt = {"candidate_tree": "c" * 40, "review_digest": o._sha(o._canonical(self.review)),
            "validation_evidence": {self.name: o._sha(self.facts_path.read_bytes()),
                o._custody_name(self.root, self.round): o._sha(self.round.read_bytes())}}

    def reference(self, path):
        return {"path": o._custody_name(self.root, path), "sha256": o._sha(path.read_bytes())}

    def authorize(self, *, receipt=None, preview=None, validation=None):
        receipt = self.receipt if receipt is None else receipt
        with patch.object(privacy.shipment_state, "validated_receipt", return_value=(receipt, o._pretty(receipt))), \
                patch.object(privacy, "policy_preview", return_value={"policy_sha256": preview or self.current, "archive_paths": ["artifact.zip"]}), \
                patch.object(o, "_validation_record", side_effect=validation, return_value=self.archive_record):
            return privacy.authorize(self.root, self.facts_path)

    def test_only_finalized_explicit_privacy_coverage_authorizes_an_immutable_transition(self):
        original = self.original.read_bytes()
        result = self.authorize(); path = Path(result["transition_file"])
        identity = path.stat().st_ino, path.read_bytes()
        record = json.loads(path.read_bytes()); signature = record.pop("signature")
        raw = (json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n").encode()
        self.assertEqual(signature, hmac.new(self.key.read_bytes(), raw, hashlib.sha256).hexdigest())
        self.assertEqual(record["previous_policy_sha256"], self.previous)
        self.assertEqual(self.authorize(), result)
        self.assertEqual(self.authorize(receipt=dict(self.receipt, approval_id="equivalent-current-approval")), result)
        self.assertEqual((path.stat().st_ino, path.read_bytes()), identity)
        self.assertEqual(self.original.read_bytes(), original)

    def test_forged_unqualified_stale_source_environment_or_archive_proof_cannot_authorize(self):
        bad = copy.deepcopy(self.receipt); bad["validation_evidence"].pop(self.name)
        with self.assertRaises(o.OracleApprovalError): self.authorize(receipt=bad)
        with self.assertRaises(o.OracleApprovalError): self.authorize(preview="d" * 64)
        with self.assertRaises(o.OracleApprovalError): self.authorize(validation=o.OracleApprovalError("archive proof invalidated"))
        archive_body = self.archive_file.read_bytes(); self.archive_file.write_bytes(b"changed archive bytes")
        with self.assertRaises(o.OracleApprovalError): self.authorize()
        self.archive_file.write_bytes(archive_body)
        source = self.root / "scripts/check-customer-data.mjs"; body = source.read_bytes(); source.write_text("changed source")
        with self.assertRaises(o.OracleApprovalError): self.authorize()
        source.write_bytes(body)
        self.round.write_bytes(o._pretty({"outcome": "APPROVED", "candidate_tree": "c" * 40,
            "review": {"review_status": "COMPLETE", "command_coverage": []}}))
        bad = copy.deepcopy(self.receipt); bad["validation_evidence"][o._custody_name(self.root, self.round)] = o._sha(self.round.read_bytes())
        bad["review_digest"] = o._sha(o._canonical({"review_status": "COMPLETE", "command_coverage": []}))
        with self.assertRaises(o.OracleApprovalError): self.authorize(receipt=bad)
        self.assertEqual(list((self.key.parent / "transitions").glob("*.json")), [])

    def test_real_native_archive_gate_binds_current_policy_and_rejects_stale_or_tampered_proof(self):
        # A real native execution witness exercises the consumer gate here;
        # receipt and policy-preview fixtures isolate final authorization.
        for name in o.REVIEW_POLICY_MODULES:
            original = Path(inspect.getsourcefile(o._oracle)).parent / Path(name).name
            target = self.root / name; target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(original.read_bytes())
        (self.root / '.gitignore').write_text('Vault/\n__pycache__/\n')
        for args in [('config', 'user.name', 'Synthetic Reviewer'),
                     ('config', 'user.email', 'review@example.invalid'), ('add', '.'), ('commit', '-qm', 'native archive fixture')]:
            subprocess.run(['git', *args], cwd=self.root, check=True)
        old_output = next(iter(self.archive_record['output_hashes']))
        observed = Path(old_output).read_text()
        self.archive_record = o.record_validation(self.root,
            [sys.executable, '-B', '-c', 'print(' + repr(observed) + ', end="")'],
            sorted(privacy.INPUTS), self.archive)
        self.facts['source_inputs'] = o._files(self.root, sorted(privacy.INPUTS))
        self.facts['archive_validation'] = self.reference(self.archive)
        self.facts_path.write_bytes(o._pretty(self.facts))
        self.receipt['validation_evidence'][self.name] = o._sha(self.facts_path.read_bytes())
        self.assertEqual(o._validation_record(self.root, self.facts['archive_validation']['path'],
            self.archive_record['inputs'], self.archive_record['environment_digest']), self.archive_record)
        with patch.object(privacy.shipment_state, 'validated_receipt', return_value=(self.receipt, o._pretty(self.receipt))), \
                patch.object(privacy, 'policy_preview', return_value={'policy_sha256': self.current, 'archive_paths': ['artifact.zip']}):
            result = privacy.authorize(self.root, self.facts_path)
            self.assertEqual(privacy.authorize(self.root, self.facts_path), result)
            with patch.object(o, '_review_policy_digest', return_value='f' * 64):
                with self.assertRaises(o.OracleApprovalError): privacy.authorize(self.root, self.facts_path)
            output = next(name for name in self.archive_record['output_hashes'] if name.endswith('.stdout.log'))
            Path(output).write_text(observed + 'tampered')
            with self.assertRaises(o.OracleApprovalError): privacy.authorize(self.root, self.facts_path)


if __name__ == "__main__":
    unittest.main()
