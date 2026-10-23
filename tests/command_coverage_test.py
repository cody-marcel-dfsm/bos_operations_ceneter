"""Exact native applicability reuse, preserving original command outcomes."""
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
                patch.object(coverage, "requirements", return_value=[self.required, second]):
            results = coverage.ci(self.root, self.commit, execute=execute)
        self.assertEqual([row["status"] for row in results], ["REUSED_NATIVE_APPLICABILITY", "PASSED_CURRENT_EXECUTION"])
        self.assertEqual([command for command in calls if command[0] != "gh"], [second["command"]])
        self.assertEqual(results[0]["original_environment"], self.origin)

    def test_original_environment_metadata_is_required_for_reuse(self):
        self.assertIsNone(coverage._native_coverage([self.row()], self.commit, self.tree, self.required)[0])


if __name__ == "__main__":
    unittest.main()
