"""Behavioral review-series regressions using a synthetic local repository."""
from pathlib import Path
import io
import ast
import inspect
import json
import os
from contextlib import redirect_stderr, redirect_stdout
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import oracle_approval as o


class ReviewSeries(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name).resolve()
        self.git("init", "-q")
        self.git("config", "user.name", "Synthetic Reviewer")
        self.git("config", "user.email", "review@example.invalid")
        for name, value in {"AGENTS.md": "synthetic governance", ".agents/skills/oracle/SKILL.md": "synthetic authority",
                            ".gitignore": "Vault/\n__pycache__/\n", "source.py": "base", "peer.py": "base peer",
                            "dependency.py": "dependency", "config.json": "{}"}.items():
            path = self.root / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_text(value)
        for name in o.REVIEW_POLICY_MODULES:
            original = Path(inspect.getsourcefile(o._oracle)).parent / Path(name).name
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(original.read_bytes())
            path.chmod(original.stat().st_mode & 0o777)
        patch.object(o, "__file__", str(self.root / "tools/oracle_approval.py")).start()
        self.git("add", "."); self.git("commit", "-qm", "base")
        self.base = self.git("rev-parse", "HEAD")
        self.environment = patch.object(o, "_environment_digest", return_value="environment-A").start()
        self.addCleanup(patch.stopall)
        self.evidence = self.root / "Vault/tmp/validation.json"
        self.evidence.parent.mkdir(parents=True); self.evidence.write_text('{"command":"synthetic check","exit_code":0}')
        self.propose()
        self.change("source.py", "candidate")
        self.change("peer.py", "candidate peer")
        self.record_check()
        self.contexts = []

    def git(self, *arguments):
        return subprocess.check_output(["git", *arguments], cwd=self.root, text=True).strip()

    def change(self, name, value):
        (self.root / name).write_text(value); self.git("add", name)

    def record_check(self, command=None, *, environment_keys=()):
        return o.record_validation(self.root, command or [sys.executable, "-c", "print('synthetic check')"],
                                   ["source.py", "dependency.py", "config.json"], self.evidence,
                                   environment_keys=environment_keys)

    def propose(self):
        result = {"verdict": "APPROVED", "findings": [], "authentication_impact": "NONE",
                  "owner_approval_status": "NOT_REQUIRED", "api_version_assessment": self.assessment()}
        o.review_proposal(self.root, "Problem: synthetic; Cause: synthetic; Recommended change: synthetic", [], None,
                          lambda *args: result)

    @staticmethod
    def assessment():
        return {"impact": "NONE", "request_kind": "NOT_REQUIRED", "requested_change": None,
                "request_quote": None, "request_evidence": None}

    @staticmethod
    def inputs(context, *paths):
        return [{"path": name, "digest": context["input_hashes"][name]} for name in paths]

    def result(self, context, *, findings=None, resolutions=None, status="COMPLETE", validation=False):
        coverage = []
        reusable = {item["path"]: item for item in context["reusable_coverage"]}
        for name in context["required_coverage_paths"]:
            dependencies = [name, "dependency.py", "config.json"] if name == "source.py" else [name]
            coverage.append({"path": name, "status": "CARRIED_FORWARD" if name in reusable else "REVIEWED",
                             "inputs": reusable[name]["inputs"] if name in reusable else self.inputs(context, *dependencies),
                             "reason": "Traced synthetic entrypoint and failure paths"})
        validations = []
        if validation:
            name = str(self.evidence.relative_to(self.root))
            validations = [{"evidence_path": name, "status": "REUSED" if context["reusable_validations"] else "VERIFIED",
                            "inputs": json.loads(self.evidence.read_text())["inputs"],
                            "environment_digest": context["guards"]["environment_digest"],
                            "reason": "Synthetic artifact records command, inputs and environment"}]
        return {"verdict": status if status != "COMPLETE" else "REJECTED" if findings else "APPROVED",
                "review_status": status, "summary": "Synthetic independent assessment", "findings": findings or [],
                "coverage": coverage, "resolutions": resolutions or [], "validations": validations,
                "limitations": [] if status == "COMPLETE" else ["Synthetic unfinished peer coverage"],
                "repair_plan": context["repair_plan"] or "Verify all synthetic acceptance checks",
                "authentication_impact": "NONE", "owner_approval_status": "NOT_REQUIRED",
                "api_version_assessment": self.assessment()}

    @staticmethod
    def finding(identity="F001", path="source.py", origin="INITIAL"):
        return {"id": identity, "severity": "high", "file": path, "line": 1, "message": "Synthetic defect",
                "root_cause": "A required branch is absent", "reproduction": "Call the synthetic failure path",
                "required_behavior": "Preserve the synthetic invariant", "recommendation": "Handle the failure branch",
                "affected_paths": [path], "acceptance_checks": ["Exercise the failure branch", "Verify successful calls"],
                "origin": origin, "origin_reason": "Synthetic initial defect" if origin != "MISSED" else
                "The earlier scan omitted an existing failure branch in unchanged code"}

    def submit(self, build=None, *, error=None, evidence_paths=None, owner_path=None):
        def reviewer(*args):
            context = json.loads((o._RUN.get() / "review-context.json").read_text())
            self.contexts.append(context)
            return build(context) if build else self.result(context)
        if error:
            with self.assertRaises(error) as caught:
                o.issue(self.root, [str(self.evidence)] if evidence_paths is None else evidence_paths, owner_path, reviewer)
            self.last_error = caught.exception
            self.assertFalse(o.receipt_path(self.root).exists())
            return None
        return o.issue(self.root, [str(self.evidence)] if evidence_paths is None else evidence_paths, owner_path, reviewer)

    def resolve(self, context, identity):
        return {"id": identity, "explanation": "Checked the concrete repair and acceptance conditions",
                "inputs": self.inputs(context, "source.py", "dependency.py")}

    def test_repair_delta_tracks_findings_new_defects_and_exact_receipt(self):
        self.submit(lambda c: self.result(c, findings=[self.finding()]), error=o.OracleCandidateRejected)
        self.change("source.py", "repair introduced defect B")
        self.submit(lambda c: self.result(c, findings=[self.finding("F002", origin="REPAIR")],
                                         resolutions=[self.resolve(c, "F001")]), error=o.OracleCandidateRejected)
        context = self.contexts[-1]
        self.assertEqual(context["changed_since_previous"], ["source.py"])
        self.assertEqual([item["path"] for item in context["reusable_coverage"]], ["peer.py"])
        self.change("source.py", "both defects repaired")
        receipt = self.submit(lambda c: self.result(c, resolutions=[self.resolve(c, "F002")]))
        self.assertEqual(receipt["candidate_tree"], self.git("write-tree"))
        o.verify_staged(self.root)
        rounds = o._read_rounds(o._series_directory(self.root, self.base))
        self.assertEqual(rounds[-1]["finding_ledger"]["F001"]["state"], "RESOLVED")
        self.assertEqual(rounds[-1]["finding_ledger"]["F002"]["state"], "RESOLVED")
        self.change("source.py", "later mutation")
        with self.assertRaisesRegex(o.OracleApprovalError, "stale"):
            o.verify_staged(self.root)

    def test_dependency_config_authority_environment_and_evidence_invalidation(self):
        scenarios = ["dependency.py", "config.json", "AGENTS.md", "environment", "evidence", "tools/oracle_approval.py"]
        for number, name in enumerate(scenarios):
            self.submit(lambda c: self.result(c, validation=True))
            if name == "environment":
                self.environment.return_value = "environment-B"
            elif name == "evidence":
                self.evidence.write_text('{"command":"changed validation artifact"}')
            else:
                value = self.synthetic_policy_source() + f"\nREVIEWER_ROLE += 'changed {number}'" if name == "tools/oracle_approval.py" else f"changed {number}"
                self.change(name, value)
                if name == "AGENTS.md":
                    self.propose()  # Fresh proposal authority; same candidate review series.
            self.record_check()
            self.submit(lambda c: self.result(c, validation=True))
            context = self.contexts[-1]
            if name == "evidence":
                self.assertTrue(context["invalidated_validations"])
                self.assertIn("validation evidence changed", context["invalidated_validations"][0]["invalidation_reasons"][0])
            elif name == "tools/oracle_approval.py":
                self.assertTrue(context["invalidated_coverage"])
                self.assertEqual(context["reusable_coverage"], [])
                self.assertTrue(context["invalidated_validations"])
            else:
                self.assertTrue(context["invalidated_coverage"], name)
                self.assertTrue(context["invalidated_validations"], name)
        self.assertEqual(len({c["series_id"] for c in self.contexts}), 1)

    def test_incomplete_checkpoint_resumes_without_approval(self):
        def unfinished(context):
            result = self.result(context, status="INCOMPLETE")
            result["coverage"] = [item for item in result["coverage"] if item["path"] == "source.py"]
            return result
        self.submit(unfinished, error=o.OracleReviewIncomplete)
        self.submit()
        context = self.contexts[-1]
        self.assertEqual(context["mode"], "resume")
        self.assertEqual([item["path"] for item in context["reusable_coverage"]], ["source.py"])
        self.assertEqual(o._read_rounds(o._series_directory(self.root, self.base))[0]["outcome"], "INCOMPLETE")

    def test_new_finding_in_unchanged_covered_code_records_missed_coverage(self):
        self.submit()
        self.submit(lambda c: self.result(c, findings=[self.finding(path="peer.py", origin="REPAIR")]), error=o.OracleApprovalError)
        self.submit(lambda c: self.result(c, findings=[self.finding(path="peer.py", origin="MISSED")]), error=o.OracleCandidateRejected)
        ledger = o._read_rounds(o._series_directory(self.root, self.base))[-1]["finding_ledger"]
        self.assertEqual(ledger["F001"]["origin"], "MISSED")

    def test_policy_invalidated_history_keeps_missed_origin_without_reuse(self):
        self.submit()
        self.change("tools/oracle_approval.py", self.synthetic_policy_source() + "\nREVIEWER_ROLE += ' changed execution policy'")

        def wrong_origin(context):
            self.assertEqual(context["reusable_coverage"], [])
            self.assertEqual(context["current_validations"], [])
            prior = next(item for item in context["invalidated_coverage"] if item["path"] == "peer.py")
            self.assertTrue(all(context["input_hashes"][entry["path"]] == entry["digest"] for entry in prior["inputs"]))
            return self.result(context, findings=[self.finding(path="peer.py", origin="REPAIR")])

        self.submit(wrong_origin, error=o.OracleApprovalError)
        self.assertNotIsInstance(self.last_error, o.OracleCandidateRejected)
        self.assertIn("MISSED", str(self.last_error))
        self.submit(lambda context: self.result(context, findings=[self.finding(path="peer.py", origin="MISSED")]),
                    error=o.OracleCandidateRejected)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual(latest["outcome"], "REJECTED")
        self.assertEqual(latest["finding_ledger"]["F001"]["origin"], "MISSED")
        self.assertEqual(latest["verified_validations"], [])
        self.assertEqual(self.contexts[-1]["reusable_coverage"], [])
        self.assertTrue(all(item["status"] == "REVIEWED" for item in latest["verified_coverage"]))

    def test_consumed_dependency_delta_keeps_repair_after_policy_invalidation(self):
        self.submit()
        self.change("tools/oracle_approval.py", self.synthetic_policy_source() + "\nREVIEWER_ROLE += ' changed execution policy'")
        self.change("dependency.py", "changed consumed dependency")
        self.submit(lambda context: self.result(context, findings=[self.finding(origin="REPAIR")]),
                    error=o.OracleCandidateRejected)
        context = self.contexts[-1]
        self.assertEqual(context["reusable_coverage"], [])
        prior = next(item for item in context["invalidated_coverage"] if item["path"] == "source.py")
        self.assertTrue(any(context["input_hashes"][entry["path"]] != entry["digest"] for entry in prior["inputs"]))
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual(latest["finding_ledger"]["F001"]["origin"], "REPAIR")

    def test_interrupted_source_delta_uses_actual_observation_origin(self):
        self.submit()
        self.change("tools/oracle_approval.py", self.synthetic_policy_source() + "\nREVIEWER_ROLE += ' changed execution policy'")
        self.change("source.py", "new behavior affects unchanged peer")

        def interrupted(_context):
            raise RuntimeError("Synthetic interrupted assessment before source observations")

        self.submit(interrupted, error=RuntimeError)

        def repair(context):
            self.assertEqual(context["changed_since_previous"], [])
            self.assertEqual(context["reusable_coverage"], [])
            finding = self.finding(path="peer.py", origin="REPAIR")
            finding["affected_paths"] = ["source.py", "peer.py"]
            finding["origin_reason"] = "Changed source behavior predates the interrupted attempt and introduces the peer failure"
            return self.result(context, findings=[finding])

        self.submit(repair, error=o.OracleCandidateRejected)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual(latest["finding_ledger"]["F001"]["origin"], "REPAIR")

    def test_interrupted_requirement_delta_uses_actual_observation_scope(self):
        self.submit()
        self.change("tools/oracle_approval.py", self.synthetic_policy_source() + "\nREVIEWER_ROLE += ' changed execution policy'")
        proposal = {"verdict": "APPROVED", "findings": [], "authentication_impact": "NONE",
                    "owner_approval_status": "NOT_REQUIRED", "api_version_assessment": self.assessment()}
        o.review_proposal(self.root, "Problem: new peer requirement; Cause: changed scope; Recommended change: enforce it",
                          [], None, lambda *args: proposal)

        def interrupted(_context):
            raise RuntimeError("Synthetic interrupted assessment after approved scope change")

        self.submit(interrupted, error=RuntimeError)

        def repair(context):
            self.assertFalse(context["scope_changed"])
            self.assertEqual(context["reusable_coverage"], [])
            finding = self.finding(path="peer.py", origin="REPAIR")
            finding["origin_reason"] = "The approved new peer requirement predates the interrupted attempt"
            result = self.result(context, findings=[finding])
            for entry in result["coverage"]:
                if entry["path"] == "peer.py":
                    entry["inputs"] += self.inputs(context, "@proposal/scope")
            return result

        self.submit(repair, error=o.OracleCandidateRejected)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual(latest["finding_ledger"]["F001"]["origin"], "REPAIR")

    def test_carried_incomplete_observation_keeps_original_requirement_scope(self):
        self.submit()
        proposal = {"verdict": "APPROVED", "findings": [], "authentication_impact": "NONE",
                    "owner_approval_status": "NOT_REQUIRED", "api_version_assessment": self.assessment()}
        o.review_proposal(self.root, "Problem: new peer requirement; Cause: changed scope; Recommended change: enforce it",
                          [], None, lambda *args: proposal)
        self.submit(lambda context: self.result(context, status="INCOMPLETE"), error=o.OracleReviewIncomplete)

        def repair(context):
            self.assertFalse(context["scope_changed"])
            finding = self.finding(path="peer.py", origin="REPAIR")
            finding["origin_reason"] = "New approved requirement was never freshly assessed by the carried incomplete observation"
            result = self.result(context, findings=[finding])
            for entry in result["coverage"]:
                if entry["path"] == "peer.py":
                    entry["status"] = "REVIEWED"
                    entry["inputs"] += self.inputs(context, "@proposal/scope")
            return result

        self.submit(repair, error=o.OracleCandidateRejected)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual(latest["finding_ledger"]["F001"]["origin"], "REPAIR")

    def test_fresh_identical_observation_adopts_current_requirement_scope(self):
        self.submit()
        initial = o._read_rounds(o._series_directory(self.root, self.base))[0]
        original_peer = next(entry for entry in initial["verified_coverage"] if entry["path"] == "peer.py")
        proposal = {"verdict": "APPROVED", "findings": [], "authentication_impact": "NONE",
                    "owner_approval_status": "NOT_REQUIRED", "api_version_assessment": self.assessment()}
        o.review_proposal(self.root, "Problem: new peer requirement; Cause: changed scope; Recommended change: enforce it",
                          [], None, lambda *args: proposal)

        def fresh(context):
            result = self.result(context)
            peer = next(entry for entry in result["coverage"] if entry["path"] == "peer.py")
            peer["status"] = "REVIEWED"
            self.assertEqual(peer, original_peer)
            return result

        self.submit(fresh)
        self.submit(lambda context: self.result(context, findings=[self.finding(path="peer.py", origin="REPAIR")]),
                    error=o.OracleApprovalError)
        self.assertNotIsInstance(self.last_error, o.OracleCandidateRejected)
        self.assertIn("MISSED", str(self.last_error))
        self.submit(lambda context: self.result(context, findings=[self.finding(path="peer.py", origin="MISSED")]),
                    error=o.OracleCandidateRejected)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual(latest["finding_ledger"]["F001"]["origin"], "MISSED")

    def test_structured_error_reviewed_observation_requires_missed(self):
        self.submit(lambda context: self.result(context, status="ERROR"), error=o.OracleApprovalError)
        first = o._read_rounds(o._series_directory(self.root, self.base))[0]
        self.assertEqual(first["outcome"], "ERROR")
        self.assertEqual({entry["status"] for entry in first["verified_coverage"]}, {"REVIEWED"})
        self.submit(lambda context: self.result(context, findings=[self.finding(path="peer.py", origin="REPAIR")]),
                    error=o.OracleApprovalError)
        self.assertNotIsInstance(self.last_error, o.OracleCandidateRejected)
        self.assertIn("MISSED", str(self.last_error))
        self.submit(lambda context: self.result(context, findings=[self.finding(path="peer.py", origin="MISSED")]),
                    error=o.OracleCandidateRejected)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual(latest["finding_ledger"]["F001"]["origin"], "MISSED")
        self.assertFalse(o.receipt_path(self.root).exists())

    def test_fresh_structured_error_adopts_changed_source_origin(self):
        self.submit()
        self.change("peer.py", "new peer behavior independently assessed before execution error")
        self.submit(lambda context: self.result(context, status="ERROR"), error=o.OracleApprovalError)
        self.submit(lambda context: self.result(context, findings=[self.finding(path="peer.py", origin="REPAIR")]),
                    error=o.OracleApprovalError)
        self.assertNotIsInstance(self.last_error, o.OracleCandidateRejected)
        self.assertIn("MISSED", str(self.last_error))
        self.submit(lambda context: self.result(context, findings=[self.finding(path="peer.py", origin="MISSED")]),
                    error=o.OracleCandidateRejected)

    def test_fresh_structured_error_adopts_identical_proof_current_scope(self):
        self.submit()
        initial = o._read_rounds(o._series_directory(self.root, self.base))[0]
        original_peer = next(entry for entry in initial["verified_coverage"] if entry["path"] == "peer.py")
        proposal = {"verdict": "APPROVED", "findings": [], "authentication_impact": "NONE",
                    "owner_approval_status": "NOT_REQUIRED", "api_version_assessment": self.assessment()}
        o.review_proposal(self.root, "Problem: new peer requirement; Cause: changed scope; Recommended change: enforce it",
                          [], None, lambda *args: proposal)

        def fresh_error(context):
            result = self.result(context, status="ERROR")
            peer = next(entry for entry in result["coverage"] if entry["path"] == "peer.py")
            peer["status"] = "REVIEWED"
            self.assertEqual(peer, original_peer)
            return result

        self.submit(fresh_error, error=o.OracleApprovalError)
        self.submit(lambda context: self.result(context, findings=[self.finding(path="peer.py", origin="REPAIR")]),
                    error=o.OracleApprovalError)
        self.assertNotIsInstance(self.last_error, o.OracleCandidateRejected)
        self.assertIn("MISSED", str(self.last_error))

    def test_carried_structured_error_keeps_original_requirement_scope(self):
        self.submit()
        proposal = {"verdict": "APPROVED", "findings": [], "authentication_impact": "NONE",
                    "owner_approval_status": "NOT_REQUIRED", "api_version_assessment": self.assessment()}
        o.review_proposal(self.root, "Problem: new peer requirement; Cause: changed scope; Recommended change: enforce it",
                          [], None, lambda *args: proposal)
        self.submit(lambda context: self.result(context, status="ERROR"), error=o.OracleApprovalError)

        def repair(context):
            self.assertFalse(context["scope_changed"])
            finding = self.finding(path="peer.py", origin="REPAIR")
            finding["origin_reason"] = "A carried ERROR observation did not reassess the approved new requirement"
            result = self.result(context, findings=[finding])
            for entry in result["coverage"]:
                if entry["path"] == "peer.py":
                    entry["status"] = "REVIEWED"
                    entry["inputs"] += self.inputs(context, "@proposal/scope")
            return result

        self.submit(repair, error=o.OracleCandidateRejected)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual(latest["finding_ledger"]["F001"]["origin"], "REPAIR")

    def test_postreview_failure_retains_genuine_fresh_observation_origin(self):
        self.submit()
        self.change("peer.py", "new peer behavior assessed before protected gate failure")

        def failed_gate(context):
            result = self.result(context)
            result.update(authentication_impact="AUTHENTICATION", owner_approval_status="MISSING")
            return result

        self.submit(failed_gate, error=o.OracleApprovalError)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual(latest["outcome"], "ERROR")
        self.assertTrue(any(entry["path"] == "peer.py" and entry["status"] == "REVIEWED"
                            for entry in latest["verified_coverage"]))
        self.submit(lambda context: self.result(context, findings=[self.finding(path="peer.py", origin="REPAIR")]),
                    error=o.OracleApprovalError)
        self.assertNotIsInstance(self.last_error, o.OracleCandidateRejected)
        self.assertIn("MISSED", str(self.last_error))
        self.assertFalse(o.receipt_path(self.root).exists())

    def test_unaccounted_findings_unproven_reuse_and_uncovered_paths_fail_closed(self):
        self.submit(lambda c: self.result(c, findings=[self.finding()]), error=o.OracleCandidateRejected)
        self.submit(error=o.OracleApprovalError)
        def unproven(context):
            result = self.result(context, findings=[self.finding()])
            result["coverage"][0]["inputs"][0]["digest"] = "fabricated hash"
            return result
        self.submit(unproven, error=o.OracleApprovalError)
        def uncovered(context):
            result = self.result(context, findings=[self.finding()])
            result["coverage"] = []
            return result
        self.submit(uncovered, error=o.OracleReviewIncomplete)

    def test_validation_reuse_requires_dependency_and_environment_proof(self):
        self.submit(lambda c: self.result(c, validation=True))
        self.submit(lambda c: self.result(c, validation=True))
        self.assertTrue(self.contexts[-1]["reusable_validations"])
        self.change("dependency.py", "changed dependency")
        def stale(context):
            result = self.result(context, validation=True)
            result["validations"][0]["status"] = "REUSED"
            return result
        self.submit(stale, error=o.OracleApprovalError)

    def test_two_failed_repairs_generate_consolidated_plan(self):
        for iteration in range(3):
            if iteration:
                self.change("source.py", f"incomplete repair {iteration}")
            self.submit(lambda c: self.result(c, findings=[self.finding()]), error=o.OracleCandidateRejected)
        plan = o._series_directory(self.root, self.base) / "repair-plan.txt"
        self.assertTrue(plan.is_file())
        self.assertIn("F001", plan.read_text())
        self.assertIn("Consolidated repair plan before the next repair:", str(self.last_error))
        self.change("source.py", "final repair")
        self.submit(lambda c: self.result(c, resolutions=[self.resolve(c, "F001")]))
        context = self.contexts[-1]
        self.assertTrue(context["repair_synthesis_required"])
        self.assertIn("F001", context["repair_plan"])
        self.assertTrue((o._series_directory(self.root, self.base) / "repair-plan.txt").is_file())
        self.submit()
        self.assertFalse(self.contexts[-1]["repair_synthesis_required"])

    def test_synthesis_uses_latest_unresolved_ledger_before_another_repair(self):
        self.submit(lambda c: self.result(c, findings=[self.finding(), self.finding("F002")]), error=o.OracleCandidateRejected)
        self.change("source.py", "first repair")
        self.submit(lambda c: self.result(c, findings=[self.finding("F002")], resolutions=[self.resolve(c, "F001")]),
                    error=o.OracleCandidateRejected)
        self.change("source.py", "second repair")
        self.submit(lambda c: self.result(c, findings=[self.finding("F003", origin="REPAIR")], resolutions=[self.resolve(c, "F002")]),
                    error=o.OracleCandidateRejected)
        plan = (o._series_directory(self.root, self.base) / "repair-plan.txt").read_text()
        self.assertIn("F003", plan)
        self.assertNotIn("F001", plan)
        self.assertNotIn("F002", plan)

    def test_partial_error_retains_eligible_coverage_and_validation_checkpoints(self):
        def first(context):
            result = self.result(context, status="INCOMPLETE")
            result["coverage"] = [item for item in result["coverage"] if item["path"] == "source.py"]
            return result
        self.submit(first, error=o.OracleReviewIncomplete)
        def second(context):
            result = self.result(context, status="ERROR")
            result["coverage"] = [item for item in result["coverage"] if item["path"] == "peer.py"]
            return result
        self.submit(second, error=o.OracleApprovalError)
        self.submit()
        context = self.contexts[-1]
        self.assertEqual({item["path"] for item in context["reusable_coverage"]}, {"source.py", "peer.py"})
        self.assertTrue(context["reusable_validations"])

    def test_prior_native_classification_projects_continuation_and_changed_input_facts(self):
        self.submit(lambda c: self.result(c, status="INCOMPLETE"), error=o.OracleReviewIncomplete)
        self.assertIsNone(self.contexts[-1]["prior_native_assessment"])
        directory = o._series_directory(self.root, self.base)
        original = o._read_rounds(directory)[0]
        original_bytes = (directory / "round-0001.json").read_bytes()

        def failed_assessment(context):
            result = self.result(context, status="ERROR")
            result.update(authentication_impact="AUTHENTICATION", owner_approval_status="MISSING")
            return result

        self.submit(failed_assessment, error=o.OracleApprovalError)

        def interrupted(context):
            raise RuntimeError("synthetic transport failure before classification")

        self.submit(interrupted, error=RuntimeError)
        self.submit(lambda c: self.result(c, status="INCOMPLETE"), error=o.OracleReviewIncomplete)
        context = self.contexts[-1]
        prior = context["prior_native_assessment"]
        self.assertEqual(context["mode"], "resume")
        self.assertTrue(prior["historical_evidence_only"])
        self.assertEqual(prior["classification"], {key: original["review"][key] for key in
                         ("authentication_impact", "owner_approval_status", "api_version_assessment")})
        self.assertEqual(prior["origin"]["round"], 1)  # Skip structured/empty ERROR rounds2/3.
        self.assertEqual(prior["origin"]["record_path"], str(directory / "round-0001.json"))
        self.assertEqual(prior["origin"]["record_sha256"], original["record_sha256"])
        self.assertEqual(prior["origin"]["context_sha256"], original["context_sha256"])
        self.assertEqual(prior["origin"]["guards_json_pointer"], "/guards")
        self.assertEqual(prior["origin"]["guards_sha256"], o._sha(o._canonical(original["guards"])))
        self.assertTrue(prior["comparison"]["candidate_tree_equal"])
        self.assertTrue(prior["comparison"]["guards_equal"])
        self.assertEqual(prior["comparison"]["changed_guard_keys"], [])
        self.change("peer.py", "later repair")
        self.environment.return_value = "environment-B"
        self.submit(lambda c: self.result(c, status="INCOMPLETE"), error=o.OracleReviewIncomplete)
        prior = self.contexts[-1]["prior_native_assessment"]
        self.assertEqual(prior["origin"]["round"], 4)
        self.assertFalse(prior["comparison"]["candidate_tree_equal"])
        self.assertFalse(prior["comparison"]["guards_equal"])
        self.assertTrue(prior["comparison"]["base_commit_equal"])
        self.assertEqual(prior["comparison"]["changed_guard_keys"], ["environment_digest"])
        self.assertEqual((directory / "round-0001.json").read_bytes(), original_bytes)
        self.assertFalse(o.receipt_path(self.root).exists())

    def test_error_honors_explicit_unreviewed_and_invalidated_checkpoints(self):
        self.submit()
        def invalidated(context):
            result = self.result(context, status="ERROR")
            result["coverage"] = [dict(item, status="UNREVIEWED", inputs=[]) if item["path"] == "source.py" else item
                                  for item in result["coverage"]]
            result["validations"] = [{"evidence_path": str(self.evidence.relative_to(self.root)), "status": "INVALIDATED",
                                      "inputs": [], "environment_digest": context["guards"]["environment_digest"],
                                      "reason": "Existing witness omits a required fixture"}]
            return result
        self.submit(invalidated, error=o.OracleApprovalError)
        self.submit()
        context = self.contexts[-1]
        self.assertNotIn("source.py", {item["path"] for item in context["reusable_coverage"]})
        self.assertEqual(context["reusable_validations"], [])
        self.assertEqual(context["current_validations"], [])
        self.assertIn("Prior explicit validation invalidation", context["invalid_current_validations"][0]["reason"])

    def test_current_native_witness_is_retained_when_reviewer_omits_validations(self):
        self.submit()  # The reviewer deliberately returns validations=[].
        context = self.contexts[-1]
        self.assertEqual(len(context["current_validations"]), 1)
        records = o._read_rounds(o._series_directory(self.root, self.base))
        self.assertEqual(len(records[-1]["verified_validations"]), 1)
        self.assertEqual(records[-1]["review"]["validations"], [])

    def test_registered_witness_carries_forward_when_client_omits_it(self):
        self.submit()
        def reviewer(*args):
            context = json.loads((o._RUN.get() / "review-context.json").read_text())
            self.assertTrue(context["current_validations"])
            return self.result(context)
        receipt = o.issue(self.root, [], None, reviewer)
        name = str(self.evidence.relative_to(self.root))
        self.assertIn(name, receipt["validation_evidence"])
        self.assertIn(str(self.evidence.with_suffix(".stdout.log").relative_to(self.root)), receipt["validation_evidence"])
        self.assertEqual(len(o._read_rounds(o._series_directory(self.root, self.base))[-1]["verified_validations"]), 1)

    def assert_omitted_invalidation_persists(self, initial_status):
        self.submit()
        name = str(self.evidence.relative_to(self.root))
        digest = o._sha(self.evidence.read_bytes())
        def invalidate(context):
            self.assertEqual(context["input_hashes"][name], "sha256:" + digest)
            result = self.result(context, status=initial_status)
            result["validations"] = [{"evidence_path": name, "status": "INVALIDATED", "inputs": [],
                                      "environment_digest": context["guards"]["environment_digest"],
                                      "reason": "Required fixture was omitted"}]
            return result
        expected = o.OracleReviewIncomplete if initial_status == "INCOMPLETE" else o.OracleApprovalError
        self.submit(invalidate, error=expected, evidence_paths=[])
        for status in ["ERROR", "INCOMPLETE", "COMPLETE"]:
            def followup(context):
                self.assertEqual(context["current_validations"], [])
                self.assertEqual(context["reusable_validations"], [])
                self.assertEqual(context["validation_invalidations"][name]["evidence_sha256"], digest)
                return self.result(context, status=status)
            expected = o.OracleReviewIncomplete if status == "INCOMPLETE" else o.OracleApprovalError if status == "ERROR" else None
            self.submit(followup, error=expected, evidence_paths=[])
        self.record_check()  # Fresh successful proof with the complete dependency closure.
        self.assertNotEqual(o._sha(self.evidence.read_bytes()), digest)
        self.submit(evidence_paths=[])
        self.assertEqual(len(self.contexts[-1]["current_validations"]), 1)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertNotIn(name, latest["validation_invalidations"])
        self.assertEqual(len(latest["verified_validations"]), 1)

    def test_omitted_validation_invalidation_persists_across_error_and_resume(self):
        self.assert_omitted_invalidation_persists("ERROR")

    def test_omitted_validation_invalidation_persists_across_incomplete_and_resume(self):
        self.assert_omitted_invalidation_persists("INCOMPLETE")

    def test_unknown_validation_invalidation_fails_closed(self):
        def unknown(context):
            result = self.result(context, status="ERROR")
            result["validations"] = [{"evidence_path": "Vault/tmp/unknown.json", "status": "INVALIDATED", "inputs": [],
                                      "environment_digest": context["guards"]["environment_digest"],
                                      "reason": "Cannot identify this artifact"}]
            return result
        self.submit(unknown, error=o.OracleApprovalError)
        self.assertIn("lacks an exact registered artifact digest", str(self.last_error))
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual(latest["validation_invalidations"], {})

    def test_conflicting_validation_assessments_fail_closed(self):
        def duplicate(context):
            result = self.result(context, validation=True)
            result["validations"].append(dict(result["validations"][0], status="INVALIDATED", reason="Missing fixture"))
            return result
        self.submit(duplicate, error=o.OracleApprovalError)
        self.assertIn("unique identified artifacts", str(self.last_error))

    def test_missing_registered_validation_invalidation_binds_prior_digest(self):
        self.submit()
        name = str(self.evidence.relative_to(self.root))
        original = self.evidence.read_bytes()
        self.evidence.unlink()
        def invalidate(context):
            result = self.result(context, status="ERROR")
            result["validations"] = [{"evidence_path": name, "status": "INVALIDATED", "inputs": [],
                                      "environment_digest": context["guards"]["environment_digest"],
                                      "reason": "Missing original proof also omits required fixture"}]
            return result
        self.submit(invalidate, error=o.OracleApprovalError, evidence_paths=[])
        self.evidence.write_bytes(original)
        self.submit(evidence_paths=[])
        self.assertEqual(self.contexts[-1]["current_validations"], [])
        self.assertEqual(self.contexts[-1]["validation_invalidations"][name]["evidence_sha256"], o._sha(original))

    def test_unrelated_design_edits_preserve_narrow_observations(self):
        self.submit()
        architecture = self.root / "Vault/docs/architecture.md"
        architecture.parent.mkdir(parents=True, exist_ok=True)
        architecture.write_text("Unrelated project progress and design navigation")
        self.submit()
        context = self.contexts[-1]
        self.assertEqual({item["path"] for item in context["reusable_coverage"]}, {"source.py", "peer.py"})
        self.assertTrue(context["current_validations"])
        self.assertEqual(context["invalidated_coverage"], [])

    def test_changed_controlling_policy_invalidates_native_witness(self):
        self.submit()
        self.change("AGENTS.md", "changed controlling policy")
        self.propose()
        self.submit()
        context = self.contexts[-1]
        self.assertEqual(context["current_validations"], [])
        self.assertTrue(context["invalid_current_validations"])
        self.assertTrue(context["invalidated_coverage"])

    def test_environment_drift_during_live_review_still_blocks_approval(self):
        def changed_environment(context):
            result = self.result(context)
            self.environment.return_value = "changed-during-review"
            return result
        self.submit(changed_environment, error=o.OracleApprovalError)

    def test_successive_partial_rounds_retain_all_eligible_checkpoints(self):
        for reviewed in ["source.py", "peer.py"]:
            def partial(context):
                result = self.result(context, status="INCOMPLETE")
                result["coverage"] = [item for item in result["coverage"] if item["path"] == reviewed]
                return result
            self.submit(partial, error=o.OracleReviewIncomplete)
        self.submit()
        self.assertEqual({item["path"] for item in self.contexts[-1]["reusable_coverage"]}, {"source.py", "peer.py"})

    def test_repairs_reverted_to_base_and_removed_files_still_require_coverage(self):
        self.change("temporary.py", "temporary candidate")
        self.submit()
        self.change("source.py", "base")
        self.git("rm", "-f", "temporary.py")
        self.submit()
        context = self.contexts[-1]
        self.assertNotIn("source.py", context["changed_paths"])
        self.assertNotIn("temporary.py", context["changed_paths"])
        self.assertIn("source.py", context["required_coverage_paths"])
        self.assertIn("temporary.py", context["required_coverage_paths"])
        self.assertIsNone(context["input_hashes"]["temporary.py"])

    def test_error_preserves_unassessed_reverted_repair_delta(self):
        self.submit()
        self.change("source.py", "base")
        def interrupted(context):
            raise RuntimeError("transport interrupted before repair assessment")
        self.submit(interrupted, error=RuntimeError)
        self.submit()
        context = self.contexts[-1]
        self.assertEqual(context["changed_since_previous"], [])
        self.assertIn("source.py", context["pending_from_prior"])
        self.assertIn("source.py", context["required_coverage_paths"])

    def test_repair_finding_can_affect_changed_and_unchanged_paths(self):
        self.submit()
        self.change("source.py", "new behavior affects a peer")
        def repair(context):
            finding = self.finding(path="peer.py", origin="REPAIR")
            finding["affected_paths"] = ["source.py", "peer.py"]
            finding["origin_reason"] = "Changed source behavior introduces the failure at the unchanged peer"
            return self.result(context, findings=[finding])
        self.submit(repair, error=o.OracleCandidateRejected)

    def test_new_requirement_has_explicit_scope_input(self):
        self.submit()
        proposal = {"verdict": "APPROVED", "findings": [], "authentication_impact": "NONE",
                    "owner_approval_status": "NOT_REQUIRED", "api_version_assessment": self.assessment()}
        o.review_proposal(self.root, "Problem: new requirement; Cause: changed scope; Recommended change: enforce it",
                          [], None, lambda *args: proposal)
        def new_requirement(context):
            finding = self.finding(path="peer.py", origin="REPAIR")
            finding["origin_reason"] = "The changed proposal introduces a new peer requirement"
            result = self.result(context, findings=[finding])
            for item in result["coverage"]:
                if item["path"] == "peer.py":
                    item["status"] = "REVIEWED"
                    item["inputs"] += self.inputs(context, "@proposal/scope")
            return result
        self.submit(new_requirement, error=o.OracleCandidateRejected)
        self.assertTrue(self.contexts[-1]["scope_changed"])
        self.assertIn("@proposal/scope", self.contexts[-1]["input_hashes"])

    def test_old_validation_cannot_be_relabelled_verified(self):
        self.submit(lambda c: self.result(c, validation=True))
        self.change("dependency.py", "changed since the recorded command")
        def relabel(context):
            result = self.result(context, validation=True)
            result["validations"][0]["status"] = "VERIFIED"
            result["validations"][0]["inputs"] = self.inputs(context, "config.json", "dependency.py", "source.py")
            return result
        self.submit(relabel, error=o.OracleApprovalError)

    def test_recorded_command_failure_and_output_drift_cannot_prove_pass(self):
        failed = self.record_check([sys.executable, "-c", "raise SystemExit(1)"])
        self.assertEqual(failed["exit_code"], 1)
        self.submit(lambda c: self.result(c, validation=True), error=o.OracleApprovalError)
        self.record_check()
        self.submit(lambda c: self.result(c, validation=True))
        self.evidence.with_suffix(".stdout.log").write_text("tampered command output")
        with self.assertRaisesRegex(o.OracleApprovalError, "evidence changed"):
            o.verify_staged(self.root)
        self.submit(lambda c: self.result(c, validation=True), error=o.OracleApprovalError)
        self.assertTrue(any("provenance" in reason for item in self.contexts[-1]["invalidated_validations"]
                            for reason in item["invalidation_reasons"]))

    def test_added_owner_evidence_preserves_source_and_native_observations(self):
        self.submit()
        owner = self.root / "Vault/tmp/owner.json"
        owner.write_text('"exact added owner authorization"')
        receipt = self.submit(owner_path=str(owner))
        context = self.contexts[-1]
        self.assertEqual(len(context["reusable_coverage"]), 2)
        self.assertEqual(context["invalidated_coverage"], [])
        self.assertTrue(context["reusable_validations"])
        self.assertTrue(context["current_validations"])
        self.assertEqual(receipt["owner_approval_evidence"], {"Vault/tmp/owner.json": o._sha(owner.read_bytes())})
        o.verify_staged(self.root)
        owner.write_text('"changed authorization after receipt"')
        with self.assertRaises(o.OracleApprovalError):
            o.verify_staged(self.root)

    def test_owner_evidence_replacement_and_removal_preserve_exact_safety(self):
        owner = self.root / "Vault/tmp/owner.json"
        owner.write_text('"initial owner authorization"')
        self.submit(owner_path=str(owner))
        for value in ['"replacement authorization"', None]:
            if value is not None:
                owner.write_text(value)
            self.submit(owner_path=str(owner) if value is not None else None)
            context = self.contexts[-1]
            self.assertEqual(context["reusable_coverage"], [])
            self.assertTrue(all("owner_approval_evidence" in item["invalidation_reasons"] for item in context["invalidated_coverage"]))
            self.assertTrue(context["reusable_validations"])
            self.assertTrue(context["current_validations"])

    def test_selected_owner_input_changes_invalidate_native_proof(self):
        self.submit(owner_path="config.json")
        self.change("config.json", '{"changed":"selected authority input"}')
        self.submit(owner_path="config.json")
        context = self.contexts[-1]
        self.assertEqual(context["current_validations"], [])
        self.assertEqual(context["reusable_validations"], [])
        self.assertTrue(context["invalidated_validations"])

    def test_added_owner_reconsiders_original_observations_after_legacy_error(self):
        self.submit()
        owner = self.root / "Vault/tmp/owner.json"
        owner.write_text('"added authorization"')
        def interrupted(context):
            raise RuntimeError("synthetic transport interruption")
        with patch.object(o, "_observation_guard_changes", return_value=["owner_approval_evidence"]):
            self.submit(interrupted, owner_path=str(owner), error=RuntimeError)
        previous = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual(previous["verified_coverage"], [])
        self.submit(owner_path=str(owner))
        context = self.contexts[-1]
        self.assertEqual(len(context["reusable_coverage"]), 2)
        self.assertEqual(context["invalidated_coverage"], [])

    def test_capture_ignores_unrelated_index_and_worktree_changes(self):
        command = [sys.executable, "-c", "print('captured output')"]
        original = o.subprocess.run
        tree = self.git("write-tree")
        def unrelated(arguments, **options):
            completed = original(arguments, **options)
            if arguments == command:
                self.change("peer.py", "unrelated newly staged implementation")
                (self.root / "unrelated.txt").write_text("untracked unrelated input")
            return completed
        with patch.object(o.subprocess, "run", side_effect=unrelated):
            record = o.record_validation(self.root, command, ["source.py"], self.evidence)
        self.assertEqual(record["candidate_tree"], tree)
        self.assertNotEqual(tree, self.git("write-tree"))
        self.assertEqual(self.evidence.with_suffix(".stdout.log").read_text(), "captured output\n")
        self.assertEqual(o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"]), record)
        (self.root / "peer.py").write_text("unrelated unstaged implementation")
        next_record = o.record_validation(self.root, command, ["source.py"], self.evidence)
        self.assertEqual(next_record["exit_code"], 0)
        self.assertEqual(o._validation_record(self.root, str(self.evidence), next_record["inputs"], next_record["environment_digest"]), next_record)

    def test_capture_selected_drift_rejects_and_retains_actual_outputs(self):
        command = [sys.executable, "-c", "import sys; print('actual stdout'); print('actual stderr',file=sys.stderr)"]
        original = o.subprocess.run
        for stage in [False, True]:
            with self.subTest(stage=stage):
                self.change("source.py", "selected before execution")
                def drift(arguments, **options):
                    completed = original(arguments, **options)
                    if arguments == command:
                        (self.root / "source.py").write_text("selected changed during execution")
                        if stage:
                            self.git("add", "source.py")
                    return completed
                with patch.object(o.subprocess, "run", side_effect=drift):
                    with self.assertRaises(o.OracleApprovalError):
                        o.record_validation(self.root, command, ["source.py"], self.evidence)
                self.assertFalse(self.evidence.exists())
                self.assertEqual(self.evidence.with_suffix(".stdout.log").read_text(), "actual stdout\n")
                self.assertEqual(self.evidence.with_suffix(".stderr.log").read_text(), "actual stderr\n")

    def test_capture_controlling_guard_drift_retains_outputs_without_witness(self):
        command = [sys.executable, "-c", "print('guard diagnostics')"]
        original = o.subprocess.run
        for guard in ["authority", "policy", "runtime", "base"]:
            with self.subTest(guard=guard):
                state = {"environment": "environment-A"}
                policy_path = self.root / "tools/oracle_approval.py"
                policy_source = policy_path.read_text()
                def drift(arguments, **options):
                    completed = original(arguments, **options)
                    if arguments == command:
                        if guard == "authority":
                            self.change("AGENTS.md", "changed controlling authority")
                        elif guard == "policy":
                            self.change("tools/oracle_approval.py", policy_source + "\nREVIEWER_ROLE += ' changed controlling policy'")
                        elif guard == "runtime":
                            state["environment"] = "changed runtime"
                        else:
                            self.change("peer.py", "new base implementation")
                            self.git("commit", "-qm", "synthetic base movement")
                    return completed
                try:
                    with patch.object(o.subprocess, "run", side_effect=drift), patch.object(o, "_environment_digest", side_effect=lambda: state["environment"]):
                        with self.assertRaises(o.OracleApprovalError):
                            o.record_validation(self.root, command, ["source.py"], self.evidence)
                finally:
                    self.change("tools/oracle_approval.py", policy_source)
                self.assertFalse(self.evidence.exists())
                self.assertEqual(self.evidence.with_suffix(".stdout.log").read_text(), "guard diagnostics\n")

    def test_capture_requires_only_selected_live_and_staged_inputs(self):
        (self.root / "peer.py").write_text("unrelated unstaged implementation")
        record = o.record_validation(self.root, [sys.executable, "-c", "pass"], ["source.py"], self.evidence)
        (self.root / "source.py").write_text("selected unstaged input")
        with self.assertRaises(o.OracleApprovalError):
            o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])
        with self.assertRaises(o.OracleApprovalError):
            o.record_validation(self.root, [sys.executable, "-c", "pass"], ["source.py"], self.evidence)

    def test_bounded_environment_excludes_unknown_inherited_variables(self):
        name = "ORACLE_REVIEW_PROBE_MODE"
        command = [sys.executable, "-c", "import os; raise SystemExit(1 if os.environ.get('ORACLE_REVIEW_PROBE_MODE') else 0)"]
        with patch.dict(os.environ, {name: "unrecorded-mode"}):
            record = self.record_check(command)
            self.assertEqual(record["exit_code"], 0)
            self.assertNotIn(name, record["environment_inputs"])
            self.submit()
            os.environ[name] = "changed-unrecorded-mode"
            self.submit()
            self.assertTrue(self.contexts[-1]["current_validations"])

    def test_bounded_environment_explicit_changes_additions_removals_invalidate(self):
        name = "ORACLE_EXPLICIT_MODE"
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop(name, None)
            for value in ["", "enabled", None]:
                record = self.record_check(environment_keys=[name])
                self.submit()
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value
                with self.assertRaises(o.OracleApprovalError):
                    o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])
                self.submit()
                self.assertEqual(self.contexts[-1]["current_validations"], [])

    def test_bounded_environment_unchanged_reuse_hashes_secret_values(self):
        name, secret = "ORACLE_EXPLICIT_SECRET", "sensitive-environment-value-for-fixture"
        with patch.dict(os.environ, {name: secret}):
            record = self.record_check([sys.executable, "-c", "import os; print(bool(os.environ.get('ORACLE_EXPLICIT_SECRET')))"],
                                       environment_keys=[name])
            self.assertEqual(record["environment_inputs"][name], o._sha(secret.encode()))
            self.assertNotIn(secret, self.evidence.read_text())
            self.assertNotIn(secret, self.evidence.with_suffix(".stdout.log").read_text())
            self.submit(); self.submit()
            self.assertTrue(self.contexts[-1]["reusable_validations"])
            self.assertTrue(self.contexts[-1]["current_validations"])

    def test_bounded_environment_mutation_during_capture_rejects(self):
        name = "ORACLE_EXPLICIT_MODE"
        command = [sys.executable, "-c", "pass"]
        original = o.subprocess.run
        with patch.dict(os.environ, {name: "before"}):
            def mutate(arguments, **options):
                completed = original(arguments, **options)
                if arguments == command:
                    self.assertEqual(options["env"][name], "before")
                    os.environ[name] = "after"
                return completed
            output = self.root / "Vault/tmp/during-environment.json"
            with patch.object(o.subprocess, "run", side_effect=mutate):
                with self.assertRaisesRegex(o.OracleApprovalError, "effective environment changed"):
                    o.record_validation(self.root, command, ["source.py"], output, environment_keys=[name])
            self.assertFalse(output.exists())

    def test_bounded_environment_legacy_or_invalid_declarations_fail_closed(self):
        with self.assertRaises(o.OracleApprovalError):
            self.record_check(environment_keys=["NAME=value"])
        record = self.record_check()
        for key in ["environment_policy", "environment_inputs", "environment_keys"]:
            record.pop(key)
        record["record_sha256"] = o._sha(o._canonical({key: value for key, value in record.items() if key != "record_sha256"}))
        self.evidence.write_bytes(o._pretty(record))
        with self.assertRaises(o.OracleApprovalError):
            o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])

    def test_comment_changes_preserve_unrelated_coverage_and_validation(self):
        self.submit()
        self.change("tools/oracle_approval.py", self.synthetic_policy_source() + "\n# comment only")
        self.submit()
        context = self.contexts[-1]
        self.assertEqual(context["invalidated_coverage"], [])
        self.assertEqual({item["path"] for item in context["reusable_coverage"]}, {"source.py", "peer.py"})
        self.assertTrue(context["current_validations"])

    def test_helper_changes_invalidate_declared_coverage_and_proof_dependencies(self):
        o.record_validation(self.root, [sys.executable, "-c", "pass"],
                            ["source.py", "tools/oracle_approval.py"], self.evidence)
        def dependent(context):
            result = self.result(context)
            for item in result["coverage"]:
                if item["path"] == "source.py":
                    item["inputs"] += self.inputs(context, "tools/oracle_approval.py")
            return result
        self.submit(dependent)
        self.change("tools/oracle_approval.py", self.synthetic_policy_source() + "\n# declared byte dependency")
        self.submit()
        context = self.contexts[-1]
        self.assertEqual({item["path"] for item in context["invalidated_coverage"]}, {"source.py"})
        self.assertEqual({item["path"] for item in context["reusable_coverage"]}, {"peer.py"})
        self.assertEqual(context["current_validations"], [])
        self.assertTrue(context["invalidated_validations"])

    def test_actual_reviewer_policy_change_invalidates_observations(self):
        self.submit()
        self.change("tools/oracle_approval.py", self.synthetic_policy_source() + "\nREVIEWER_ROLE += ' changed policy'")
        self.submit()
        self.assertTrue(self.contexts[-1]["invalidated_coverage"])
        self.assertEqual(self.contexts[-1]["current_validations"], [])

    def test_legacy_guard_upgrade_preserves_exact_unchanged_policy(self):
        source = self.synthetic_policy_source()
        self.change("tools/oracle_approval.py", source)
        self.submit()
        path = o._series_directory(self.root, self.base) / "round-0001.json"
        record = json.loads(path.read_text())
        context_path = Path(record["context_file"])
        context = json.loads(context_path.read_text())
        context["guards"].pop("review_policy_digest")
        context["guards"]["tool_digests"] = o._files(self.root, ["tools/oracle_approval.py"])
        context_path.write_bytes(o._pretty(context))
        record["guards"] = context["guards"]
        record["context_sha256"] = o._sha(o._canonical(context))
        record["record_sha256"] = o._sha(o._canonical({key: value for key, value in record.items() if key != "record_sha256"}))
        path.write_bytes(o._pretty(record))
        self.change("tools/oracle_approval.py", source + "\n# implementation repair")
        self.submit()
        self.assertEqual(self.contexts[-1]["invalidated_coverage"], [])
        self.assertEqual(len(self.contexts[-1]["reusable_coverage"]), 2)
        self.assertIn("tools/oracle_approval.py", self.contexts[-1]["changed_since_previous"])

    def synthetic_policy_source(self):
        return Path(inspect.getsourcefile(o._oracle)).read_text()

    def replace_synthetic_guard(self, value):
        path = max(o._series_directory(self.root, self.base).glob("round-*.json"))
        record = json.loads(path.read_text())
        context_path = Path(record["context_file"])
        context = json.loads(context_path.read_text())
        context["guards"]["review_policy_digest"] = value
        context_path.write_bytes(o._pretty(context))
        record["guards"] = context["guards"]
        record["context_sha256"] = o._sha(o._canonical(context))
        record["record_sha256"] = o._sha(o._canonical({key: item for key, item in record.items() if key != "record_sha256"}))
        path.write_bytes(o._pretty(record))

    def test_all_final_policy_builder_mutations_invalidate_observations(self):
        source = self.synthetic_policy_source()
        variants = [
            source.replace("Reviewer process configuration:", "Additional reviewer policy:"),
            source.replace('"reviewer_role": "independent-oracle-approver"', '"reviewer_role": "changed-role"'),
            source.replace('str(root / ".agents/skills/oracle/review-output.schema.json"),', 'str(root / "changed-schema.json"),'),
            source.replace("Return JSON matching the supplied schema.", "Use a different output contract."),
            source.replace('"--sandbox", "danger-full-access"', '"--sandbox", "read-only"'),
            source.replace("cmd, cwd=root", 'cmd[:-1] + ["changed prompt"], cwd=root'),
            source.replace('"proposal": request,', '"proposal": "changed fixed request contract",'),
            source.replace('if _RUN.get() and', 'if False and'),
            source.replace('return call()', 'return None'),
        ]
        with patch.object(o, "__file__", str(self.root / "tools/oracle_approval.py")):
            for variant in variants:
                self.assertNotEqual(source, variant)
                self.change("tools/oracle_approval.py", source)
                self.record_check()
                self.submit()
                self.change("tools/oracle_approval.py", variant)
                self.submit()
                context = self.contexts[-1]
                self.assertTrue(context["invalidated_coverage"])
                self.assertTrue(all("review_policy_digest" in item["invalidation_reasons"] for item in context["invalidated_coverage"]))
                self.assertEqual(context["current_validations"], [])

    def test_all_policy_mutations_bind_complete_current_and_original_modules(self):
        source = self.synthetic_policy_source()
        insert = '    _atomic_write(run / "model.json", _pretty(metadata))'
        variants = {
            "global augmentation": source + '\nREVIEWER_ROLE += "changed"',
            "global reassignment": source + '\nREVIEWER_ROLE = "changed"',
            "global deletion": source + '\ndel REVIEWER_ROLE',
            "import identity": source + "\nfrom changed_policy import REVIEWER_ROLE",
            "global alias": source + '\nalias = REVIEWER_ROLE',
            "imported builder dependency": 'from changed_policy import EXTRA_POLICY\n' + source.replace('"proposal": request,', '"proposal": EXTRA_POLICY,'),
            "class policy": source + '\nclass Hidden:\n    REVIEWER_ROLE = "changed"',
            "nested schema setter": source.replace(insert, '    metadata["schema"]["type"] = "array"\n' + insert),
            "nested schema delete": source.replace(insert, '    del metadata["schema"]["type"]\n' + insert),
            "direct mutator": source.replace(insert, '    metadata.update({"reviewer_role": "changed"})\n' + insert),
            "mutable alias": source.replace(insert, '    alias = metadata\n    alias.update({"reviewer_role": "changed"})\n' + insert),
            "container alias": source.replace(insert, '    alias = [metadata][0]\n    alias.clear()\n' + insert),
            "unpacked alias": source.replace(insert, '    alias, other = metadata, None\n    alias.clear()\n' + insert),
            "opaque transformation": source.replace(insert, '    transform(metadata)\n' + insert),
            "local schema construction": source.replace(insert, '    type_value = "object"\n    metadata = {"type": type_value}\n' + insert),
            "default policy": source.replace('def _review_process(root: Path, prompt: str, prefix: str)', 'def _review_process(root: Path, prompt: str, prefix: str = REVIEWER_ROLE)'),
            "conditional mutation": source.replace(insert, '    if enabled:\n        metadata = {"reviewer_role": "changed"}\n' + insert),
            "exception mutation": source.replace(insert, '    try:\n        metadata = {}\n    except ChangedException:\n        pass\n' + insert),
            "match mutation": source.replace(insert, '    match setting:\n        case "changed":\n            metadata = {}\n' + insert),
            "lambda mutator": source.replace(insert, '    invoke = lambda: metadata.clear()\n    invoke()\n' + insert),
        }
        with patch.object(o, "__file__", str(self.root / "tools/oracle_approval.py")):
            for label, variant in variants.items():
                with self.subTest(label=label):
                    self.assertNotEqual(source, variant)
                    self.change("tools/oracle_approval.py", variant)
                    tree = self.git("write-tree")
                    self.assertEqual(o._review_policy_digest(self.root), o._review_policy_digest(self.root, tree))
                    self.assertNotEqual(o._review_policy_digest(self.root, tree), o._review_policy_digest(self.root, self.base))
                    self.assertIsNone(o._historical_policy_guard(self.root, tree, "f" * 64))

    def test_emitter_provider_mutations_and_reflection_change_complete_binding(self):
        source = self.synthetic_policy_source()
        variants = {
            "wildcard": source + "\nfrom json import *",
            "import identity": source.replace("json, os,", "os as json, os,"),
            "namespace alias": source + "\nserializer = json",
            "member alias": source + "\nserializer = json.dumps",
            "container alias": source + "\nholder = [json]\nholder[0].dumps = replacement",
            "member setter": source + "\njson.dumps = replacement",
            "hash provider setter": source + "\nhashlib.sha256 = replacement",
            "file provider setter": source + "\ntempfile.NamedTemporaryFile = replacement",
            "phase provider": source + "\n_phase = replacement",
            "member deletion": source + "\ndel subprocess.run",
            "member augmentation": source + "\njson.dumps += replacement",
            "namespace transfer": source + "\nopaque(json)",
            "imported model": source + "\nselected_model = replacement",
            "local helper": source + "\n_timed = replacement",
            "context provider": source + "\n_RUN = replacement",
            "builtin provider": source + "\nstr = replacement",
            "reflective eval": source + "\neval('kind')",
            "reflective exec": source + "\nexec('json.dumps = replacement')",
            "reflective namespace": source + "\nglobals()['json'] = replacement",
            "reflective setattr": source + "\nsetattr(json, 'dumps', replacement)",
            "dynamic import": source + "\n__import__('json')",
            "member mapping": source + "\njson.__dict__['dumps'] = replacement",
            "hidden mutation": source + "\ndef hidden():\n    global subprocess\n    subprocess.run = replacement",
            "immediate closure alias": source + "\nserializer = (lambda: json)()\nserializer.dumps = replacement",
            "returned alias": source + "\ndef hidden():\n    return json\nserializer = hidden()",
            "default alias": source + "\ndef hidden(value=json):\n    return value",
            "walrus alias": source + "\n(serializer := json)",
            "module registry": source + "\nsys.modules['json'].dumps = replacement",
            "frame namespace": source + "\nnamespace = sys._getframe().f_globals\nnamespace['json'].dumps = replacement",
            "imported registry": source + "\nfrom sys import modules\nmodules['json'].dumps = replacement",
            "dunder reflection": source + "\nobject.__getattribute__(json, '__dict__')['dumps'] = replacement",
        }
        with patch.object(o, "__file__", str(self.root / "tools/oracle_approval.py")):
            for label, variant in variants.items():
                with self.subTest(label=label):
                    self.assertNotEqual(source, variant)
                    self.change("tools/oracle_approval.py", variant)
                    tree = self.git("write-tree")
                    self.assertEqual(o._review_policy_digest(self.root), o._review_policy_digest(self.root, tree))
                    self.assertNotEqual(o._review_policy_digest(self.root, tree), o._review_policy_digest(self.root, self.base))

    def alternate_provider_bindings(self):
        values = {}
        for name in ["_oracle", "_proposal_oracle", "_review_process", "_timed", "selected_model", "json", "REVIEWER_ROLE"]:
            values["async " + name] = "\n@lambda ignored: (lambda *args: {'synthetic': 'replacement'})\nasync def " + name + "(*args):\n    pass"
        values.update({
            "exception": "\ntry:\n    raise RuntimeError()\nexcept Exception as json:\n    pass",
            "pattern name": "\nmatch {}:\n    case subprocess:\n        pass",
            "pattern star": "\nmatch []:\n    case [*_timed]:\n        pass",
            "mapping rest": "\nmatch {}:\n    case {**selected_model}:\n        pass",
            "type parameter": "\ndef generic[json]():\n    pass",
            "type parameter tuple": "\ndef generic[*_timed]():\n    pass",
            "parameter spec": "\ndef generic[**selected_model]():\n    pass",
            "class role": "\nclass REVIEWER_ROLE:\n    pass",
        })
        return values

    def test_alternate_provider_bindings_change_complete_binding(self):
        source = self.synthetic_policy_source()
        with patch.object(o, "__file__", str(self.root / "tools/oracle_approval.py")):
            for label, addition in self.alternate_provider_bindings().items():
                with self.subTest(label=label):
                    self.change("tools/oracle_approval.py", source + addition)
                    tree = self.git("write-tree")
                    self.assertEqual(o._review_policy_digest(self.root), o._review_policy_digest(self.root, tree))
                    self.assertNotEqual(o._review_policy_digest(self.root, tree), o._review_policy_digest(self.root, self.base))

    def test_effective_provider_replacement_cannot_carry_source_or_validation(self):
        source = self.synthetic_policy_source()
        with patch.object(o, "__file__", str(self.root / "tools/oracle_approval.py")):
            self.change("tools/oracle_approval.py", source)
            record = self.record_check(); self.submit()
            replacement = source + self.alternate_provider_bindings()["async _review_process"]
            self.change("tools/oracle_approval.py", replacement)
            with self.assertRaises(o.OracleApprovalError):
                o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])
            self.submit()
            self.assertEqual(self.contexts[-1]["reusable_coverage"], [])
            self.assertEqual(self.contexts[-1]["current_validations"], [])
            # Restoration is a fresh policy change; no stale replacement proof
            # establishes coverage of the restored source.
            self.change("tools/oracle_approval.py", source)
            self.submit()
            self.assertEqual(self.contexts[-1]["reusable_coverage"], [])

    def test_v2_policy_migration_rederives_canonical_original_providers(self):
        source = self.synthetic_policy_source()
        with patch.object(o, "__file__", str(self.root / "tools/oracle_approval.py")):
            self.change("tools/oracle_approval.py", source)
            self.record_check(); self.submit()
            tree = self.git("write-tree")
            legacy = o._review_policy_digest(self.root, tree, version=2)
            self.assertIsNotNone(legacy)
            self.replace_synthetic_guard(legacy)
            self.change("tools/oracle_approval.py", source + "\n# implementation only")
            self.submit()
            self.assertEqual(len(self.contexts[-1]["reusable_coverage"]), 2)
            self.assertEqual(self.contexts[-1]["invalidated_coverage"], [])
            self.assertIn("tools/oracle_approval.py", self.contexts[-1]["changed_since_previous"])

    def test_external_output_schema_change_invalidates_observations(self):
        path = ".agents/skills/oracle/review-output.schema.json"
        self.change(path, '{"type":"object"}')
        self.propose(); self.record_check(); self.submit()
        self.change(path, '{"type":"object","description":"changed policy"}')
        self.propose(); self.submit()
        context = self.contexts[-1]
        self.assertTrue(context["invalidated_coverage"])
        self.assertTrue(all("authority_digests" in item["invalidation_reasons"] for item in context["invalidated_coverage"]))
        self.assertEqual(context["current_validations"], [])

    def test_launcher_uses_complete_external_output_schema(self):
        schema = self.root / ".agents/skills/oracle/review-output.schema.json"
        self.change(str(schema.relative_to(self.root)), '{"type":"object","properties":{"verdict":{"type":"string"}}}')
        self.change("tools/codex_child_model.py", "synthetic model selection")
        run = self.root / "Vault/tmp/schema-launch"
        run.mkdir(parents=True)
        token = o._RUN.set(run)
        try:
            launches = []
            def child(command, **options):
                self.assertEqual(Path(command[command.index("--output-schema") + 1]), schema)
                settings = [value for value in command if value.startswith("developer_instructions=")]
                self.assertEqual(len(settings), 1)
                developer = json.loads(settings[0].split("=", 1)[1])
                self.assertEqual(developer, "\n\n".join((o.REVIEWER_ROLE, o.NORMAL_PLAN_REVIEW_POLICY,
                                                         o.LOCAL_EXECUTION_POLICY, o.REVIEW_SERIES_POLICY)))
                for clause in ("actual source/control delta first", "sealed original observations",
                               "aggregate FAILED or ERROR", "strictly native-ineligible",
                               "Before every validation or diagnostic command", "Historical evidence supplies no current approval"):
                    self.assertIn(clause, developer)
                metadata = json.loads((run / "model.json").read_text())
                self.assertEqual(metadata["schema_sha256"], o._sha(schema.read_bytes()))
                self.assertEqual(metadata["developer_instructions_sha256"], o._sha(developer.encode()))
                launches.append(command[-1])
                Path(command[command.index("--output-last-message") + 1]).write_text('{"verdict":"APPROVED"}')
                return subprocess.CompletedProcess(command, 0, "", "")
            with patch.object(o, "selected_model", return_value="synthetic-model"), patch.object(o.subprocess, "run", side_effect=child):
                completed = o._oracle(self.root, "synthetic-tree", ["source.py"], {}, None)
                proposal = o._proposal_oracle(self.root, "Synthetic proposal", {}, None)
            self.assertEqual(completed["verdict"], "APPROVED")
            self.assertEqual(proposal["verdict"], "APPROVED")
            self.assertEqual(len(launches), 2)
            self.assertIn("On initial assessment inspect the complete candidate", launches[0])
            self.assertIn("On follow-up or resume inspect actual deltas first", launches[0])
            self.assertNotIn("inspect the full git diff --cached", launches[0])
        finally:
            o._RUN.reset(token)

    def test_v1_policy_guard_upgrade_preserves_only_full_original_equivalence(self):
        source = self.synthetic_policy_source()
        with patch.object(o, "__file__", str(self.root / "tools/oracle_approval.py")):
            for changed_policy in [False, True]:
                self.change("tools/oracle_approval.py", source)
                self.record_check(); self.submit()
                tree = self.git("write-tree")
                legacy = o._review_policy_digest(self.root, tree, version=1)
                self.assertIsNotNone(legacy)
                self.replace_synthetic_guard(legacy)
                new_source = source.replace("Reviewer process configuration:", "Changed controlling reviewer policy:") if changed_policy else source + "\n# helper implementation only"
                self.change("tools/oracle_approval.py", new_source)
                self.submit()
                context = self.contexts[-1]
                policy_reasons = [item for item in context["invalidated_coverage"] if "review_policy_digest" in item["invalidation_reasons"]]
                if changed_policy:
                    self.assertTrue(policy_reasons)
                    self.assertEqual(context["reusable_coverage"], [])
                else:
                    self.assertEqual(policy_reasons, [])
                    self.assertEqual(len(context["reusable_coverage"]), 2)

    def test_v1_validation_policy_requires_full_original_equivalence(self):
        source = self.synthetic_policy_source()
        with patch.object(o, "__file__", str(self.root / "tools/oracle_approval.py")):
            self.change("tools/oracle_approval.py", source)
            record = self.record_check()
            record["review_policy_digest"] = o._review_policy_digest(self.root, record["candidate_tree"], version=1)
            record["record_sha256"] = o._sha(o._canonical({key: value for key, value in record.items() if key != "record_sha256"}))
            self.evidence.write_bytes(o._pretty(record))
            self.change("tools/oracle_approval.py", source + "\n# helper-only implementation change")
            self.submit()
            self.assertTrue(self.contexts[-1]["current_validations"])
            changed = source.replace("Reviewer process configuration:", "A different controlling policy:")
            self.change("tools/oracle_approval.py", changed)
            self.submit()
            self.assertEqual(self.contexts[-1]["current_validations"], [])

    def test_unknown_policy_guard_cannot_acquire_legacy_equivalence(self):
        source = self.synthetic_policy_source()
        with patch.object(o, "__file__", str(self.root / "tools/oracle_approval.py")):
            self.change("tools/oracle_approval.py", source)
            self.record_check(); self.submit()
            self.replace_synthetic_guard("f" * 64)
            self.change("tools/oracle_approval.py", source + "\n# helper implementation only")
            self.submit()
            self.assertEqual(self.contexts[-1]["reusable_coverage"], [])
            self.assertTrue(all("review_policy_digest" in item["invalidation_reasons"] for item in self.contexts[-1]["invalidated_coverage"]))

    def test_full_governance_module_closure_invalidates_source_and_native_proof(self):
        for name in o.REVIEW_POLICY_MODULES:
            with self.subTest(module=name):
                original = (self.root / name).read_text()
                self.record_check(); self.submit()
                self.change(name, original + "\njson.dumps = lambda *args, **kwargs: 'changed emitter'\n")
                self.submit()
                context = self.contexts[-1]
                self.assertEqual(context["reusable_coverage"], [])
                self.assertTrue(context["invalidated_coverage"])
                self.assertEqual(context["current_validations"], [])
                self.change(name, original)

    def test_prompt_builder_default_capture_changes_complete_binding(self):
        source = self.synthetic_policy_source()
        original = o._review_policy_digest(self.root)
        for name, target in [("_oracle", "@_serialized_review\ndef issue("),
                             ("_proposal_oracle", "@_serialized_review\ndef review_proposal(")]:
            variant = source.replace(target, name + " = lambda *args: {'synthetic': 'replacement'}\n\n" + target)
            self.assertNotEqual(source, variant)
            self.change("tools/oracle_approval.py", variant)
            tree = self.git("write-tree")
            self.assertNotEqual(original, o._review_policy_digest(self.root))
            self.assertNotEqual(original, o._historical_policy_guard(self.root, tree, original))
            self.change("tools/oracle_approval.py", source)
        first = source + "\nREVIEWER_ROLE += 'first'\nREVIEWER_ROLE += 'second'\n"
        second = source + "\nREVIEWER_ROLE += 'second'\nREVIEWER_ROLE += 'first'\n"
        self.change("tools/oracle_approval.py", first)
        first_digest = o._review_policy_digest(self.root)
        self.change("tools/oracle_approval.py", second)
        self.assertNotEqual(first_digest, o._review_policy_digest(self.root))

    def test_unbound_original_cannot_adopt_current_looking_digest(self):
        current = o._review_policy_digest(self.root)
        self.change("tools/oracle_approval.py", "def unparseable(")
        original = self.git("write-tree")
        self.assertIsNone(o._historical_policy_guard(self.root, original, current))
        with self.assertRaises(o.OracleApprovalError):
            o._review_policy_digest(self.root)
        self.change("tools/oracle_approval.py", self.synthetic_policy_source())
        self.git("rm", "tools/codex_child_model.py")
        missing = self.git("write-tree")
        self.assertIsNone(o._historical_policy_guard(self.root, missing, current))

    def test_owner_approval_input_identity_is_available_without_duplicate_evidence(self):
        owner = self.root / "Vault/tmp/owner-only.json"
        owner.write_text('"exact direct approval"')
        name = str(owner.relative_to(self.root))
        def dependent(context):
            self.assertEqual(context["input_hashes"][name], "sha256:" + o._sha(owner.read_bytes()))
            result = self.result(context)
            result["coverage"][0]["inputs"] += self.inputs(context, name)
            return result
        self.submit(dependent, owner_path=name)
        self.submit(owner_path=name)
        self.assertTrue(self.contexts[-1]["reusable_coverage"])
        owner.write_text('"replacement approval"')
        with self.assertRaises(o.OracleApprovalError):
            o.verify_staged(self.root)

    def test_executable_mode_changes_invalidate_selected_native_execution(self):
        path = self.root / "selected-executable"
        path.write_text("#!/bin/sh\nexit 0\n")
        path.chmod(0o755); self.git("add", str(path))
        record = o.record_validation(self.root, [str(path)], [str(path.relative_to(self.root))], self.evidence)
        self.assertEqual(record["exit_code"], 0)
        original = self.git("hash-object", str(path))
        path.chmod(0o644); self.git("add", str(path))
        self.assertEqual(original, self.git("hash-object", str(path)))
        with self.assertRaises(o.OracleApprovalError):
            o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])

    def test_bounded_environment_cli_accepts_explicit_variable_names(self):
        name, secret = "ORACLE_CLI_SECRET", "fixture-cli-sensitive-value"
        output = io.StringIO()
        with patch.dict(os.environ, {name: secret}), patch.object(o, "repository_root", return_value=self.root), redirect_stdout(output):
            result = o.main(["validate", "--output", str(self.evidence), "--input", "source.py", "--env-input", name,
                             "--", sys.executable, "-c", "pass"])
        self.assertEqual(result, 0)
        record = json.loads(output.getvalue())
        self.assertEqual(record["environment_keys"], [name])
        self.assertEqual(record["environment_inputs"][name], o._sha(secret.encode()))
        self.assertNotIn(secret, output.getvalue())

    def declare_parent(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        parent = Path(directory.name).resolve()
        paths = [parent / "AGENTS.md", parent / "Vault/docs/architecture/bos-product-family.md", parent / "tools/projects_oracle.py"]
        for path in paths:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("synthetic declared parent input")
        self.change("AGENTS.md", "synthetic governance\nFamily: " + str(paths[1]) + "\nOracle: " + str(paths[2]))
        self.propose()
        self.record_check()
        return paths

    def test_declared_parent_inputs_are_exposed_and_bound(self):
        paths = self.declare_parent()
        receipt = self.submit()
        context = self.contexts[-1]
        native = json.loads(self.evidence.read_text())
        for path in paths:
            name = str(path)
            digest = o._sha(path.read_bytes())
            self.assertEqual(context["input_hashes"][name], "sha256:" + digest)
            self.assertEqual(context["guards"]["authority_digests"][name], digest)
            self.assertEqual(receipt["authority_digests"][name], digest)
            self.assertEqual(native["authority_digests"][name], digest)
        o.verify_staged(self.root)
        explicit = o.record_validation(self.root, [sys.executable, "-c", "pass"], [str(paths[1])],
                                        self.root / "Vault/tmp/parent-check.json")
        self.assertEqual(explicit["inputs"][0]["path"], str(paths[1]))

    def test_declared_parent_drift_during_review_is_error(self):
        paths = self.declare_parent()
        self.submit()
        for path in paths:
            original = path.read_bytes()
            def drift(context):
                result = self.result(context)
                path.write_text("changed controlling parent input")
                return result
            self.submit(drift, error=o.OracleApprovalError)
            self.assertIn("inputs changed", str(self.last_error))
            path.write_bytes(original)
        self.submit()

    def test_declared_parent_changes_additions_removals_invalidate_proof(self):
        self.submit()
        paths = self.declare_parent()
        self.submit()
        self.assertTrue(self.contexts[-1]["invalidated_coverage"])
        for path in paths:
            original = path.read_bytes()
            path.write_text("new controlling parent input")
            with self.assertRaises(o.OracleApprovalError):
                o.verify_staged(self.root)
            native = json.loads(self.evidence.read_text())
            with self.assertRaises(o.OracleApprovalError):
                o._validation_record(self.root, str(self.evidence), native["inputs"], native["environment_digest"])
            self.propose()
            self.submit()
            self.assertTrue(self.contexts[-1]["invalidated_coverage"])
            self.record_check()
            self.submit()
            path.unlink()
            self.assertIsNone(o._candidate_inputs(self.root, self.git("write-tree"), {})[str(path)])
            with self.assertRaises(o.OracleApprovalError):
                o.verify_staged(self.root)
            with self.assertRaises(o.OracleApprovalError):
                self.propose()
            path.write_bytes(original)
            self.propose()
            self.record_check()
            self.submit()

    def assert_error_disposition(self):
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        telemetry = json.loads((Path(latest["context_file"]).parent / "outcome.json").read_text())
        self.assertEqual(latest["outcome"], "ERROR")
        self.assertEqual(telemetry["outcome"], "ERROR")
        self.assertFalse(o.receipt_path(self.root).exists())
        self.assertTrue(latest["verified_coverage"])
        self.assertTrue(latest["verified_validations"])
        return latest

    def test_final_authentication_and_api_gates_record_error_before_approval(self):
        assessments = [
            {"authentication_impact": "AUTHENTICATION", "owner_approval_status": "MISSING"},
            {"authentication_impact": "AUTHENTICATION", "owner_approval_status": "APPROVED"},
            {"authentication_impact": "NONE", "owner_approval_status": "APPROVED"},
            {"authentication_impact": "UNKNOWN", "owner_approval_status": "NOT_REQUIRED"},
        ]
        for kind in ["MISSING", "APPROVAL_ONLY", "EXPLICIT_REQUEST"]:
            assessments.append({"api_version_assessment": {"impact": "CHANGE", "request_kind": kind,
                "requested_change": "Add API v2", "request_quote": "Please add API v2", "request_evidence": str(self.evidence)}})
        for assessment in assessments:
            with self.subTest(assessment=assessment):
                def invalid(context):
                    return dict(self.result(context), **assessment)
                self.submit(invalid, error=o.OracleApprovalError)
                self.assert_error_disposition()
        self.assertTrue(all(r["outcome"] == "ERROR" for r in o._read_rounds(o._series_directory(self.root, self.base))))
        self.submit()
        o.verify_staged(self.root)

    def test_gate_failure_preserves_resolutions_and_failed_repair_tracking(self):
        for iteration in range(3):
            if iteration:
                self.change("source.py", f"failed repair {iteration}")
            self.submit(lambda c: self.result(c, findings=[self.finding()]), error=o.OracleCandidateRejected)
        self.record_check()
        def invalid(context):
            result = self.result(context, resolutions=[self.resolve(context, "F001")])
            return dict(result, authentication_impact="AUTHENTICATION", owner_approval_status="MISSING")
        self.submit(invalid, error=o.OracleApprovalError)
        latest = self.assert_error_disposition()
        self.assertEqual(latest["finding_ledger"]["F001"]["state"], "RESOLVED")
        self.assertEqual(latest["failed_repair_rounds"], 2)
        self.assertTrue(latest["is_repair_round"])
        self.submit()
        self.assertEqual(self.contexts[-1]["failed_repair_rounds"], 2)
        self.assertTrue(self.contexts[-1]["is_repair_round"])
        self.assertEqual(o._read_rounds(o._series_directory(self.root, self.base))[-1]["failed_repair_rounds"], 0)

    def test_publication_failures_record_error_without_receipt_or_repair_reset(self):
        for iteration in range(3):
            if iteration:
                self.change("source.py", f"failed repair {iteration}")
            self.submit(lambda c: self.result(c, findings=[self.finding()]), error=o.OracleCandidateRejected)
        self.record_check()
        for target in ["receipt", "round"]:
            for after_write in [False, True]:
                with self.subTest(target=target, after_write=after_write):
                    original_write = o._atomic_write
                    raised = False
                    def fail_once(path, raw):
                        nonlocal raised
                        is_target = path == o.receipt_path(self.root) if target == "receipt" else path.name.startswith("round-") and path.suffix == ".json"
                        if is_target and not raised:
                            raised = True
                            if after_write:
                                original_write(path, raw)
                            raise OSError("synthetic publication failure")
                        return original_write(path, raw)
                    def repaired(context):
                        resolutions = [self.resolve(context, "F001")] if context["prior_findings"]["F001"]["state"] == "OPEN" else []
                        return self.result(context, resolutions=resolutions)
                    with patch.object(o, "_atomic_write", side_effect=fail_once):
                        self.submit(repaired, error=OSError)
                    latest = self.assert_error_disposition()
                    self.assertEqual(latest["failed_repair_rounds"], 2)
                    self.assertTrue(latest["is_repair_round"])
                    self.assertEqual(latest["finding_ledger"]["F001"]["state"], "RESOLVED")
        self.submit()
        self.assertEqual(self.contexts[-1]["failed_repair_rounds"], 2)
        receipt, _ = o.verify_staged(self.root)
        last = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual(last["outcome"], "APPROVED")
        self.assertEqual(last["failed_repair_rounds"], 0)
        round_name = str((o._series_directory(self.root, self.base) / f"round-{last['round']:04d}.json").relative_to(self.root))
        self.assertIn(round_name, receipt["validation_evidence"])

    def test_partial_round_publication_failure_records_error(self):
        for status in ["INCOMPLETE", "ERROR"]:
            original_write = o._atomic_write
            raised = False
            def fail_after_round(path, raw):
                nonlocal raised
                original_write(path, raw)
                if not raised and path.name.startswith("round-") and path.suffix == ".json":
                    raised = True
                    raise OSError("synthetic partial history publication failure")
            with patch.object(o, "_atomic_write", side_effect=fail_after_round):
                self.submit(lambda c: self.result(c, status=status), error=OSError)
            self.assert_error_disposition()
        self.submit()
        self.assertEqual(self.contexts[-1]["mode"], "resume")

    def assert_late_metadata_failure_revokes_approval(self, target):
        original_write = o._atomic_write
        raised = False
        def fail_once(path, raw):
            nonlocal raised
            is_target = (path.name == "timings.json" and b'total_seconds' in raw) if target == "timing" else path.name == "outcome.json"
            if not raised and is_target:
                raised = True
                raise OSError("synthetic final metadata failure")
            return original_write(path, raw)
        with patch.object(o, "_atomic_write", side_effect=fail_once):
            self.submit(error=OSError)
        self.assert_error_disposition()
        self.submit()
        self.assertEqual(self.contexts[-1]["mode"], "resume")
        o.verify_staged(self.root)

    def test_final_timing_failure_revokes_approval(self):
        self.assert_late_metadata_failure_revokes_approval("timing")

    def test_final_outcome_failure_revokes_approval(self):
        self.assert_late_metadata_failure_revokes_approval("outcome")

    def test_final_receipt_check_failure_preserves_error_checkpoint(self):
        with patch.object(o, "_verify_receipt", side_effect=o.OracleApprovalError("synthetic custody failure")):
            self.submit(error=o.OracleApprovalError)
        self.assert_error_disposition()
        self.submit()
        o.verify_staged(self.root)

    def assert_cli_model_failure(self, environment, error_type):
        self.submit()
        self.assertTrue(o.receipt_path(self.root).is_file())
        prior_rounds = o._read_rounds(o._series_directory(self.root, self.base))
        stderr, stdout = io.StringIO(), io.StringIO()
        with patch.object(o, "repository_root", return_value=self.root), \
                patch.object(o, "_vault_evidence", return_value=self.evidence), \
                patch.dict(os.environ, environment), redirect_stderr(stderr), redirect_stdout(stdout):
            status = o.main(["review", "--evidence", str(self.evidence)])
        self.assertEqual(status, 2)
        self.assertTrue(stderr.getvalue().startswith("ERROR: "), stderr.getvalue())
        self.assertIn(error_type, stderr.getvalue())
        self.assertNotIn("Traceback", stderr.getvalue())
        self.assertEqual(stdout.getvalue(), "")
        self.assertFalse(o.receipt_path(self.root).exists())
        with self.assertRaises(o.OracleApprovalError):
            o.verify_staged(self.root)
        rounds = o._read_rounds(o._series_directory(self.root, self.base))
        self.assertEqual(len(rounds), len(prior_rounds) + 1)
        self.assertEqual(rounds[-1]["outcome"], "ERROR")
        run = Path(rounds[-1]["context_file"]).parent
        outcome = json.loads((run / "outcome.json").read_text())
        failure = json.loads((run / "failure.json").read_text())
        self.assertEqual(outcome["outcome"], "ERROR")
        self.assertFalse(outcome["reviewer_invoked"])
        self.assertIn(error_type, failure["error"])
        self.assertFalse((run / "process.json").exists())

    def test_native_cli_model_runtime_error_is_structured_and_revokes_receipt(self):
        self.assert_cli_model_failure({"CODEX_THREAD_ID": "invalid/task"}, "RuntimeError")

    def test_native_cli_malformed_model_config_is_structured_and_revokes_receipt(self):
        configuration = self.root / "Vault/tmp/model-configuration"
        configuration.mkdir()
        (configuration / "config.toml").write_text("model = [\n")
        self.assert_cli_model_failure({"CODEX_HOME": str(configuration), "CODEX_THREAD_ID": "",
                                       "CODEX_SELECTED_MODEL": ""}, "TOMLDecodeError")

    def test_tampered_history_and_runtime_errors_preserve_receipt_boundary(self):
        self.submit()
        def crashed(context):
            raise RuntimeError("synthetic reviewer transport failure")
        self.submit(crashed, error=RuntimeError)
        self.submit()
        self.assertEqual(self.contexts[-1]["mode"], "resume")
        directory = o._series_directory(self.root, self.base)
        record = directory / "round-0001.json"
        payload = json.loads(record.read_text()); payload["candidate_tree"] = "tampered"
        record.write_bytes(o._pretty(payload))
        self.submit(error=o.OracleApprovalError)
        with self.assertRaises(o.OracleApprovalError):
            o._read_rounds(directory)


if __name__ == "__main__":
    unittest.main()
