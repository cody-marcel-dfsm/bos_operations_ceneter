"""Exact native applicability reuse, preserving original command outcomes."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import command_coverage as coverage
from tools import oracle_approval as o


class CommandCoverage(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.commit, self.tree = "a" * 40, "b" * 40
        self.command = ["npm", "test"]
        self.required = {"id": o._sha(o._canonical(self.command)), "command": self.command}
        self.digest = "c" * 64
        self.origin = "origin:Darwin python:3.14.6 node:v22.11.0"

    def row(self, *, state="success", issuer=None, tree=None):
        return {"context": coverage.PREFIX + self.required["id"], "state": state,
            "creator": {"login": issuer or coverage.public_status.PUBLISHER},
            "description": coverage._description(tree or self.tree, self.digest),
            "target_url": coverage.public_status._target(self.commit)}

    def environment(self):
        return {"context": coverage.ENVIRONMENT_PREFIX + self.digest, "state": "success",
            "creator": {"login": coverage.public_status.PUBLISHER}, "description": self.origin,
            "target_url": coverage.public_status._target(self.commit)}

    def test_current_changelist_reuses_original_environment_without_claiming_ci_execution(self):
        result = coverage._native_coverage([self.row(), self.environment()], self.commit, self.tree, self.required)
        self.assertEqual(result, (self.digest, self.origin))

    def test_wrong_issuer_source_and_latest_failure_cannot_reuse_prior_success(self):
        for rows in ([self.row(issuer="untrusted"), self.environment()],
                     [self.row(tree="d" * 40), self.environment()],
                     [self.row(state="failure"), self.row(), self.environment()]):
            with self.subTest(rows=rows):
                self.assertIsNone(coverage._native_coverage(rows, self.commit, self.tree, self.required)[0])

    def test_independent_applicability_preserves_failed_aggregate_observation(self):
        original = self.root / "original-failed.json"
        original.write_text(json.dumps({"exit_code": 1, "passing_cases": ["unchanged case"], "failed_cases": ["repaired case"]}))
        repair = self.root / "focused-repair.json"
        repair.write_text(json.dumps({"exit_code": 0, "passing_cases": ["repaired case"]}))
        original_raw = original.read_bytes()
        context = {"required_commands": [self.required], "guards": {"environment_digest": "synthetic environment"},
            "input_hashes": {"package.json": "git-sha1:100644:blob:synthetic",
                             "original-failed.json": "sha256:" + o._sha(original_raw),
                             "focused-repair.json": "sha256:" + o._sha(repair.read_bytes())}}
        row = dict(self.required, status="COMPLETE", basis="INDEPENDENT_APPLICABILITY",
            inputs=[{"path": "package.json", "digest": context["input_hashes"]["package.json"]}],
            evidence_paths=["original-failed.json", "focused-repair.json"],
            environment_digest="synthetic environment",
            reason="Original unchanged passing case plus exact current focused repair; original aggregate remains failed")
        self.assertEqual(coverage.validate_decisions(self.root, {"verdict": "APPROVED", "command_coverage": [row]}, context), [row])
        self.assertEqual(original.read_bytes(), original_raw)
        with self.assertRaises(o.OracleApprovalError):
            coverage.validate_decisions(self.root, {"verdict": "APPROVED", "command_coverage": [dict(row,
                evidence_paths=["original-failed.json", "original-failed.json"])]}, context)
        with self.assertRaises(o.OracleReviewIncomplete):
            coverage.validate_decisions(self.root, {"verdict": "APPROVED", "command_coverage": []}, context)
        repair.write_text("changed output")
        with self.assertRaises(o.OracleApprovalError):
            coverage.validate_decisions(self.root, {"verdict": "APPROVED", "command_coverage": [row]}, context)

    def test_ci_executes_only_uncovered_required_commands(self):
        second = {"command": ["npm", "run", "check"]}
        second["id"] = o._sha(o._canonical(second["command"]))
        calls = []
        def execute(command, **kwargs):
            calls.append(command)
            return subprocess.CompletedProcess(command, 0, json.dumps([[self.row(), self.environment()]]) if command[0] == "gh" else "", "")
        with patch.object(coverage.public_status, "verify_publication", return_value={"candidate_commit": self.commit, "candidate_tree": self.tree}), \
                patch.object(o, "_git", return_value=self.tree), \
                patch.object(coverage, "requirements", return_value=[self.required, second]):
            results = coverage.ci(self.root, self.commit, execute=execute)
        self.assertEqual([row["status"] for row in results], ["REUSED_NATIVE_APPLICABILITY", "PASSED_CURRENT_EXECUTION"])
        self.assertEqual([command for command in calls if command[0] != "gh"], [second["command"]])
        self.assertEqual(results[0]["original_environment"], self.origin)

    def test_ci_merge_identity_resolves_approved_source_head_without_retesting(self):
        calls = []
        merge = "d" * 40
        def execute(command, **kwargs):
            calls.append(command)
            self.assertEqual(command[0], "gh")
            self.assertIn("commits/" + self.commit + "/statuses", command[2])
            return subprocess.CompletedProcess(command, 0, json.dumps([[self.row(), self.environment()]]), "")
        approved = {"candidate_commit": self.commit, "candidate_tree": self.tree}
        with patch.object(coverage.public_status, "verify_publication", return_value=approved), \
                patch.object(o, "_git", return_value=self.tree), \
                patch.object(coverage, "requirements", return_value=[self.required]):
            self.assertEqual(coverage.ci(self.root, merge, execute=execute)[0]["status"], "REUSED_NATIVE_APPLICABILITY")
        self.assertEqual(len(calls), 1)
        with patch.object(coverage.public_status, "verify_publication", return_value=approved), \
                patch.object(o, "_git", return_value="e" * 40):
            with self.assertRaises(o.OracleApprovalError):
                coverage.ci(self.root, merge, execute=lambda *a, **k: self.fail("mismatched checkout"))

    def test_prepared_publication_uses_real_fast_forward_git_and_retains_divergence_failure(self):
        from tools import publication_admission as publication
        def git(*args):
            return subprocess.check_output(["git", *args], cwd=self.root, text=True, stderr=subprocess.PIPE).strip()
        git("init", "-q")
        git("config", "user.name", "Synthetic Validation")
        git("config", "user.email", "fixture@example.invalid")
        (self.root / "package.json").write_text('{"version":"0.0.1"}')
        git("add", "package.json")
        git("commit", "-qm", "base")
        git("branch", "-M", "main")
        baseline = git("rev-parse", "HEAD")
        remote = self.root / "owned-synthetic-remote.git"
        git("init", "--bare", "-q", str(remote))
        git("push", str(remote), baseline + ":refs/heads/main")
        (self.root / "package.json").write_text('{"version":"0.0.2"}')
        git("add", "package.json")
        git("commit", "-qm", "validated source")
        candidate, tree = git("rev-parse", "HEAD"), git("rev-parse", "HEAD^{tree}")
        selected = {"candidate_commit": candidate, "candidate_tree": tree,
            "technical_receipt_sha256": "f" * 64, "human_authority_required": False,
            "publication_scope": {"baseline_commit": baseline},
            "destination": {"remote_url": o.PUBLICATION_REMOTE, "ref": "refs/heads/main"}}
        with patch.object(publication, "plan", return_value=selected), patch.object(coverage, "requirements", return_value=[]):
            prepared = publication.prepare(self.root, candidate, "codex/release-v0.0.2", "main-promotion", refresh=False)
        hooks = Path(__file__).resolve().parents[1] / ".githooks"
        git("config", "core.hooksPath", str(hooks))
        path = Path(prepared["prepared_file"])
        original = path.read_bytes()
        (self.root / "concurrent.txt").write_text("new authorship remains available")
        calls = []
        def execute(command, **kwargs):
            calls.append(command)
            self.assertEqual(command, ["git", "push", o.PUBLICATION_REMOTE, candidate + ":refs/heads/main"])
            return subprocess.run([*command[:2], str(remote), *command[3:]], **kwargs, capture_output=True, text=True)
        # This transport fixture supplies a prepared plan; native revocation is
        # exercised against real admitted decisions in shipment_workflow_test.
        with patch.object(publication.shipment, "publication_eligibility"):
            result = publication.publish_prepared(self.root, path, execute=execute)
        self.assertFalse(result["publication_sla_breached"])
        print(json.dumps({"real_git_publication_seconds": result["elapsed_seconds"],
                          "effective_hooks_path": str(hooks), "pre_push_exists": (hooks / "pre-push").exists()}))
        self.assertEqual(git("--git-dir", str(remote), "rev-parse", "main"), candidate)
        moved = git("commit-tree", tree, "-p", candidate, "-m", "concurrent remote change")
        git("push", str(remote), moved + ":refs/heads/main")
        with patch.object(publication.shipment, "publication_eligibility"):
            with self.assertRaises(subprocess.CalledProcessError):
                publication.publish_prepared(self.root, path, execute=execute)
        self.assertEqual(len(calls), 2)
        self.assertEqual(path.read_bytes(), original)
        self.assertTrue((self.root / "concurrent.txt").exists())

    def test_original_environment_metadata_is_required_for_reuse(self):
        self.assertIsNone(coverage._native_coverage([self.row()], self.commit, self.tree, self.required)[0])

    def test_equivalent_approval_retains_receipts_and_explicit_criteria_change_revokes_old_preparation(self):
        from tools import shipment_state as shipment
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        record = {"base_commit": self.commit, "candidate_tree": self.tree, "outcome": "APPROVED",
            "guards": {"authority_digests": {"synthetic-criteria": "original"}, "review_policy_digest": "p", "environment_digest": "e"},
            "review": {"review_status": "COMPLETE", "protected_effects": {"active": []}, "api_version_assessment": {"impact": "NONE"}}}
        round_path = self.root / "synthetic-round.json"
        first, second = "1" * 64, "2" * 64
        shipment.observe_decision(self.root, record, round_path, technical_receipt_sha256=first, publication_scope={"baseline": "same"})
        shipment.observe_decision(self.root, record, round_path, technical_receipt_sha256=second, publication_scope={"baseline": "same"})
        for receipt in (first, second):
            shipment.publication_eligibility(self.root, self.commit, self.tree, receipt)
        record["guards"]["authority_digests"] = {"synthetic-criteria": "concretely-changed"}
        shipment.observe_decision(self.root, record, round_path, technical_receipt_sha256=second, publication_scope={"baseline": "same"})
        with self.assertRaisesRegex(o.OracleApprovalError, "current criteria/effects"):
            shipment.publication_eligibility(self.root, self.commit, self.tree, first)
        shipment.publication_eligibility(self.root, self.commit, self.tree, second)

    def admission(self):
        selected = {"candidate_commit": self.commit, "candidate_tree": self.tree,
            "technical_receipt_sha256": "f" * 64, "human_authority_required": False,
            "release_ref": "codex/release-v0.0.2", "publication_scope": {"baseline_commit": "d" * 40},
            "destination": {"remote_url": o.PUBLICATION_REMOTE, "ref": "refs/heads/main"}}
        row = {"number": 12, "state": "OPEN", "headRefOid": self.commit, "headRefName": selected["release_ref"],
            "baseRefOid": "d" * 40, "baseRefName": "main", "mergeStateStatus": "CLEAN", "statusCheckRollup": [{
            "name": "verify-public-repository", "workflowName": "Publication safety", "status": "COMPLETED",
            "conclusion": "SUCCESS", "detailsUrl": "https://github.com/" + coverage.public_status.REPOSITORY + "/actions/runs/123/job/456"}]}
        run = {"id": 123, "head_sha": self.commit, "head_branch": selected["release_ref"], "event": "pull_request",
            "path": ".github/workflows/publication-safety.yml", "status": "completed", "conclusion": "success",
            "repository": {"full_name": coverage.public_status.REPOSITORY},
            "head_repository": {"full_name": coverage.public_status.REPOSITORY}}
        return selected, row, run

    def test_replacement_approval_revokes_explicitly_invalidated_original_support(self):
        from tools import shipment_state as shipment
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        record = {"base_commit": self.commit, "candidate_tree": self.tree, "outcome": "APPROVED", "assessment_admitted": True,
            "guards": {"environment_digest": "same"}, "review": {"review_status": "COMPLETE", "command_coverage": [
            dict(self.required, status="COMPLETE", inputs=[], environment_digest="same", evidence_paths=["proof-A"])]}}
        path = self.root / "synthetic-round.json"
        shipment.observe_decision(self.root, record, path, technical_receipt_sha256="1" * 64,
                                   publication_scope={}, validation_evidence={"proof-A": "a" * 64})
        record["review"]["validations"] = [{"status": "INVALIDATED", "evidence_path": "proof-A", "reason": "Original output changed"}]
        record["review"]["command_coverage"][0]["evidence_paths"] = ["proof-B"]
        shipment.observe_decision(self.root, record, path, technical_receipt_sha256="2" * 64,
                                   publication_scope={}, validation_evidence={"proof-B": "b" * 64})
        with self.assertRaises(o.OracleApprovalError):
            shipment.publication_eligibility(self.root, self.commit, self.tree, "1" * 64)
        shipment.publication_eligibility(self.root, self.commit, self.tree, "2" * 64)
        marker = shipment._decision_read(self.root, shipment._decision_directory(self.root, self.commit, self.tree))
        self.assertIn("Original supporting evidence explicitly invalidated", marker["revoked_receipts"]["1" * 64])

    def test_changed_original_evidence_identity_revokes_only_the_older_receipt(self):
        from tools import shipment_state as shipment
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        record = {"base_commit": self.commit, "candidate_tree": self.tree, "outcome": "APPROVED", "assessment_admitted": True,
            "review": {"review_status": "COMPLETE", "command_coverage": [dict(self.required,
            status="COMPLETE", inputs=[], evidence_paths=["proof-A"])]}}
        path = self.root / "synthetic-round.json"
        for receipt, evidence in (("1" * 64, "a" * 64), ("2" * 64, "b" * 64)):
            shipment.observe_decision(self.root, record, path, technical_receipt_sha256=receipt,
                                      publication_scope={}, validation_evidence={"proof-A": evidence})
        with self.assertRaises(o.OracleApprovalError):
            shipment.publication_eligibility(self.root, self.commit, self.tree, "1" * 64)
        shipment.publication_eligibility(self.root, self.commit, self.tree, "2" * 64)

    def test_admitted_partial_defects_and_command_gaps_revoke_while_raw_errors_preserve(self):
        from tools import shipment_state as shipment
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        base = {"base_commit": self.commit, "candidate_tree": self.tree, "outcome": "APPROVED", "assessment_admitted": True,
                "review": {"review_status": "COMPLETE"}}
        path = self.root / "synthetic-round.json"
        for kind in ("admitted-defect", "command-gap", "raw-error", "empty-incomplete"):
            with self.subTest(kind=kind):
                record = copy.deepcopy(base)
                record["base_commit"] = o._sha(kind.encode())[:40]
                shipment.observe_decision(self.root, record, path, technical_receipt_sha256="1" * 64, publication_scope={})
                record["outcome"] = "INCOMPLETE"
                record["review"]["review_status"] = "INCOMPLETE"
                if kind in {"admitted-defect", "raw-error"}:
                    record["review"]["findings"] = [{"id": "F003"}]
                    record["finding_ledger"] = {"F003": {"state": "OPEN"}} if kind == "admitted-defect" else {}
                if kind == "raw-error":
                    record.update(outcome="ERROR", assessment_admitted=False, raw_assessment={"findings": [{"id": "F003"}]})
                if kind == "command-gap":
                    record["review"]["command_coverage"] = [dict(self.required, status="INCOMPLETE")]
                shipment.observe_decision(self.root, record, path)
                if kind in {"admitted-defect", "command-gap"}:
                    with self.assertRaises(o.OracleApprovalError):
                        shipment.publication_eligibility(self.root, record["base_commit"], self.tree, "1" * 64)
                else:
                    shipment.publication_eligibility(self.root, record["base_commit"], self.tree, "1" * 64)

    def test_required_remote_admission_binds_exact_source_repository_and_real_actions_run(self):
        from tools import publication_admission as publication
        selected, row, run = self.admission()
        def execute(command, **kwargs):
            if command[-1].endswith("/branches/main"):
                return subprocess.CompletedProcess(command, 0, json.dumps({"protected": True}), "")
            return subprocess.CompletedProcess(command, 0, json.dumps(row if command[1] == "pr" else run), "")
        admitted = publication._remote_admission(self.root, selected, execute=execute, wait_seconds=0)
        self.assertEqual(admitted["source_commit"], self.commit)
        self.assertEqual(admitted["run_ids"], [123])
        for field, wrong in (("head_sha", "e" * 40), ("head_branch", "another-branch"),
                              ("conclusion", "failure"), ("path", "another-workflow.yml"),
                              ("head_repository", {"full_name": "another/repository"})):
            with self.subTest(field=field):
                original = run[field]
                run[field] = wrong
                with self.assertRaises(o.OracleApprovalError):
                    publication._remote_admission(self.root, selected, execute=execute, wait_seconds=0)
                run[field] = original

    def test_failed_pending_and_absent_required_remote_checks_never_seal_readiness(self):
        from tools import publication_admission as publication
        selected, row, run = self.admission()
        def execute(command, **kwargs):
            if command[-1].endswith("/branches/main"):
                return subprocess.CompletedProcess(command, 0, json.dumps({"protected": True}), "")
            return subprocess.CompletedProcess(command, 0, json.dumps(row if command[1] == "pr" else run), "")
        row["statusCheckRollup"][0]["conclusion"] = "FAILURE"
        with self.assertRaisesRegex(o.OracleApprovalError, "failed required check"):
            publication._remote_admission(self.root, selected, execute=execute, wait_seconds=0)
        row["statusCheckRollup"][0].update(status="IN_PROGRESS", conclusion=None)
        with self.assertRaises(o.OracleReviewIncomplete):
            publication._remote_admission(self.root, selected, execute=execute, wait_seconds=0)
        row["statusCheckRollup"] = []
        with self.assertRaises(o.OracleReviewIncomplete):
            publication._remote_admission(self.root, selected, execute=execute, wait_seconds=0)

    def test_unprotected_branch_preserves_native_coverage_without_optional_ci_gate(self):
        from tools import publication_admission as publication
        selected, _, _ = self.admission()
        calls = []
        def execute(command, **kwargs):
            calls.append(command)
            return subprocess.CompletedProcess(command, 0, json.dumps({"name": "main", "protected": False}), "")
        admitted = publication._remote_admission(self.root, selected, execute=execute, wait_seconds=0)
        self.assertEqual(admitted["required_checks"], [])
        self.assertEqual(len(calls), 1)

    def test_preparation_exports_complete_coverage_before_ci_gate_and_reuses_remote_admission(self):
        from tools import publication_admission as publication
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        selected, row, run = self.admission()
        calls = []
        def execute(command, **kwargs):
            self.assertEqual(command[0], "git")
            if calls:
                self.assertEqual(calls, ["object-upload", "command-coverage", "native-approval"])
                self.assertTrue(command[-1].endswith(":refs/heads/" + selected["release_ref"]))
                calls.append("watched-pr-update")
            else:
                self.assertTrue(command[-1].endswith(":refs/heads/codex/validation-" + self.commit))
                calls.append("object-upload")
            return subprocess.CompletedProcess(command, 0, "", "")
        def command_export(*args, **kwargs):
            calls.append("command-coverage")
        def source_export(*args, **kwargs):
            self.assertEqual(calls, ["object-upload", "command-coverage"])
            calls.append("native-approval")
        def admit(*args, **kwargs):
            self.assertEqual(calls, ["object-upload", "command-coverage", "native-approval", "watched-pr-update"])
            calls.append("remote-admission")
            return {"source_commit": self.commit, "run_ids": [123]}
        with patch.object(publication, "plan", return_value=selected), \
                patch.object(publication, "_check_authorization", wraps=publication._check_authorization) as authority, \
                patch.object(coverage, "requirements", return_value=[self.required]), \
                patch.object(coverage, "publish_statuses", side_effect=command_export), \
                patch.object(publication.public_status, "publish_status", side_effect=source_export), \
                patch.object(publication, "_remote_admission", side_effect=admit):
            first = publication.prepare(self.root, self.commit, selected["release_ref"], "main-promotion", execute=execute)
            original = Path(first["prepared_file"]).stat().st_ino, Path(first["prepared_file"]).read_bytes()
            second = publication.prepare(self.root, self.commit, selected["release_ref"], "main-promotion", execute=execute)
        self.assertEqual(first, second)
        self.assertEqual(authority.call_count, 1)
        self.assertEqual(calls, ["object-upload", "command-coverage", "native-approval", "watched-pr-update", "remote-admission"])
        self.assertEqual((Path(first["prepared_file"]).stat().st_ino, Path(first["prepared_file"]).read_bytes()), original)

    def test_public_transport_contains_only_opaque_hashes_source_and_runtime_metadata(self):
        from tools import shipment_state as shipment
        private = "/Users/synthetic-owner/Vault/tmp/private-observation.json"
        decision = dict(self.required, status="COMPLETE", basis="INDEPENDENT_APPLICABILITY",
            inputs=[{"path": private, "digest": "sha256:" + "e" * 64}], evidence_paths=[private],
            environment_digest="private environment hash", reason="private observation rationale")
        native = {"outcome": "APPROVED", "candidate_tree": self.tree,
                  "review": {"review_status": "COMPLETE", "command_coverage": [decision]}}
        native_path = self.root / "native-round.json"
        native_path.write_bytes(o._pretty(native))
        native_ref = {"path": "native-round.json", "sha256": o._sha(native_path.read_bytes())}
        receipt = {"validation_evidence": {native_ref["path"]: native_ref["sha256"]},
                   "review_digest": o._sha(o._canonical(native["review"]))}
        receipt_raw = o._pretty(receipt)
        selected = {"candidate_commit": self.commit, "candidate_tree": self.tree,
                    "technical_receipt_sha256": o._sha(receipt_raw)}
        payload = {"validated_commit": self.commit, "candidate_tree": self.tree,
            "technical_receipt_sha256": selected["technical_receipt_sha256"],
            "native_decision": native_ref, "command_coverage": [decision],
            "execution_environment": {"platform": "Darwin", "python": "3.14.6", "node": "v22.11.0", "npm": "10.9.0"}}
        tracking = dict(payload, tracking_sha256=o._sha(o._canonical(payload)))
        path = self.root / "tracking.json"
        path.write_bytes(o._pretty(tracking))
        checkpoint = {"command_tracking": {"path": str(path), "sha256": o._sha(path.read_bytes())}}
        calls = []
        def execute(command, **kwargs):
            calls.append(command)
            fields = dict(command[index + 1].split("=", 1) for index, value in enumerate(command) if value == "-f")
            fields["creator"] = {"login": coverage.public_status.PUBLISHER}
            return subprocess.CompletedProcess(command, 0, json.dumps(fields), "")
        with patch.object(shipment, "_load", return_value=checkpoint), \
                patch.object(shipment, "validated_receipt", return_value=(receipt, receipt_raw)), \
                patch.object(coverage, "requirements", return_value=[self.required]):
            self.assertEqual(len(coverage.publish_statuses(self.root, selected, execute=execute)), 2)
        public = json.dumps(calls)
        for protected in [private, "Vault", "synthetic-owner", "private observation", "private environment", "evidence_paths", "inputs"]:
            self.assertNotIn(protected, public)
        self.assertIn(self.commit, public)
        self.assertIn(self.tree, public)


if __name__ == "__main__":
    unittest.main()
