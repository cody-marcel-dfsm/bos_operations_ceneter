"""Behavioral review-series regressions using a synthetic local repository."""
from pathlib import Path
import io
import ast
import inspect
import json
import os
from contextlib import contextmanager, redirect_stderr, redirect_stdout
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import oracle_approval as o
from tools import oracle_parallel as parallel
from tools import oracle_lifecycle as lifecycle


class ReviewSeries(unittest.TestCase):
    def synthetic_reviewer_settings(self):
        for name, value in (('selected_model', 'synthetic-model'), ('selected_reasoning_effort', None)):
            setting = patch.object(o, name, return_value=value)
            setting.start()
            self.addCleanup(setting.stop)

    @contextmanager
    def synthetic_native_child(self, run):
        """Exercise native result handling while forbidding real reviewer launches."""
        original_popen = subprocess.Popen
        def guarded(command, *args, **kwargs):
            self.assertFalse(any(Path(str(arg)).name == 'codex' for arg in command),
                             'Synthetic fixture attempted an actual Codex process')
            return original_popen(command, *args, **kwargs)
        def managed(o, root, metadata, command, environment, controller):
            self.assertIsNotNone(controller)
            return run(command, cwd=root, capture_output=True, text=True, env=environment)
        with patch.object(lifecycle, 'reviewer_process', side_effect=managed), \
                patch.object(subprocess, 'Popen', side_effect=guarded), \
                patch.object(o.subprocess, 'run', side_effect=run):
            yield

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
        self.release_metadata("0.0.0")
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

    def release_metadata(self, version):
        files = {"package.json": {"version": version}, "package-manifest.json": {"version": version},
                 "skill-release-manifest.json": {"release": version},
                 "products/bos/product.json": {"name": "bos", "version": version, "release_status": "active"}}
        for client, prefix in {"codex": "plugins", "claude": "plugins", "copilot": "products",
                               "gemini": "extensions", "muse": "plugins"}.items():
            files[f"clients/{client}/{prefix}/bos/.bos-product.json"] = {"name": "bos", "version": version, "client": client}
        for name, value in files.items():
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(value))

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
                "api_version_assessment": self.assessment(), "protected_effects": {"active": [], "dispositions": []}}

    @staticmethod
    def finding(identity="F001", path="source.py", origin="INITIAL"):
        return {"id": identity, "severity": "high", "file": path, "line": 1, "message": "Synthetic defect",
                "root_cause": "A required branch is absent", "reproduction": "Call the synthetic failure path",
                "required_behavior": "Preserve the synthetic invariant", "recommendation": "Handle the failure branch",
                "affected_paths": [path], "acceptance_checks": ["Exercise the failure branch", "Verify successful calls"],
                "origin": origin, "origin_reason": "Synthetic initial defect" if origin != "MISSED" else
                "The earlier scan omitted an existing failure branch in unchanged code"}

    def submit(self, build=None, *, error=None, evidence_paths=None, owner_path=None, proposal_record=None):
        def reviewer(*args):
            context = json.loads((o._RUN.get() / "review-context.json").read_text())
            self.contexts.append(context)
            return build(context) if build else self.result(context)
        if error:
            with self.assertRaises(error) as caught:
                o.issue(self.root, [str(self.evidence)] if evidence_paths is None else evidence_paths, owner_path, reviewer, proposal_record=proposal_record)
            self.last_error = caught.exception
            self.assertFalse(o.receipt_path(self.root).exists())
            return None
        return o.issue(self.root, [str(self.evidence)] if evidence_paths is None else evidence_paths, owner_path, reviewer, proposal_record=proposal_record)

    def resolve(self, context, identity):
        return {"id": identity, "explanation": "Checked the concrete repair and acceptance conditions",
                "inputs": self.inputs(context, "source.py", "dependency.py")}

    def test_complete_retains_omitted_eligible_coverage_but_honors_unreviewed(self):
        self.submit()
        def omitted(context):
            result = self.result(context)
            result["coverage"] = []
            return result
        self.submit(omitted)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual({item["path"] for item in latest["verified_coverage"]}, {"source.py", "peer.py"})
        self.submit(lambda c: dict(omitted(c), coverage=[{
            "path": "source.py", "status": "UNREVIEWED", "inputs": [],
            "reason": "A newly discovered semantic dependency requires assessment"}]), error=o.OracleReviewIncomplete)

    def test_source_movement_retains_unadopted_raw_assessment_and_both_deltas(self):
        def drift(context):
            result = self.result(context)
            self.change("peer.py", "another implementation arrived")
            return result
        self.submit(drift, error=o.OracleApprovalError)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual(latest["outcome"], "ERROR")
        raw = latest["raw_assessment"]
        self.assertEqual(raw["reported_verdict"], "APPROVED")
        self.assertEqual(raw["reported_review_status"], "COMPLETE")
        self.assertEqual(len(raw["assessment"]["coverage"]), 2)
        self.assertEqual(latest["verified_coverage"], [])
        def current(context):
            self.assertEqual(context["attempt_delta"]["paths"], ["peer.py"])
            self.assertEqual(context["cumulative_pending_since_verified"], ["peer.py", "source.py"])
            self.assertEqual(context["reusable_coverage"], [])
            observed = {item["path"]: item for item in context["unadopted_assessments"][-1]["observations"]}
            self.assertTrue(observed["source.py"]["input_binding_valid"])
            self.assertEqual(observed["source.py"]["changed_inputs"], [])
            self.assertEqual(observed["peer.py"]["changed_inputs"], ["peer.py"])
            return self.result(context)  # Fresh independent current entries, no automatic adoption.
        self.submit(current)
        o.verify_staged(self.root)

    def test_raw_invalid_bindings_remain_untrusted_and_do_not_create_findings(self):
        def drift(context):
            result = self.result(context, findings=[self.finding()])
            result["coverage"][0]["inputs"][0]["digest"] = "sha256:" + "a" * 64
            self.change("peer.py", "concurrent source")
            return result
        self.submit(drift, error=o.OracleApprovalError)
        def current(context):
            self.assertEqual(context["prior_findings"], {})
            raw = context["unadopted_assessments"][-1]
            self.assertEqual(raw["reported_verdict"], "REJECTED")
            self.assertEqual(raw["finding_ids"], ["F001"])
            self.assertFalse(all(item["input_binding_valid"] for item in raw["observations"]))
            self.assertEqual(context["reusable_coverage"], [])
            return self.result(context, findings=[self.finding()])
        self.submit(current, error=o.OracleCandidateRejected)

    def test_raw_ignored_absence_requires_current_disposition_and_reuses_eligible_proof(self):
        name = "Vault/tmp/ignored-observed-source.md"
        path = self.root / name
        path.write_text("unmanifested original source")

        def drift(context):
            self.assertNotIn(name, context["input_hashes"])
            result = self.result(context, findings=[self.finding("F901", name)])
            result["coverage"].append({"path": name, "status": "UNREVIEWED", "inputs": [],
                                       "reason": "Raw unfinished owner-local source"})
            self.change("peer.py", "another implementation")
            return result

        self.submit(drift, error=o.OracleApprovalError)
        path.unlink()

        def current(context):
            self.assertIn(name, context["required_coverage_paths"])
            self.assertIsNone(context["input_hashes"][name])
            self.assertEqual(context["raw_source_bindings"][name], {"exists": False})
            self.assertEqual(context["prior_findings"], {})
            raw = context["unadopted_assessments"][-1]
            self.assertEqual(raw["finding_ids"], ["F901"])
            self.assertEqual(raw["finding_references"][0]["file"], name)
            self.assertEqual(next(x for x in context["path_dispositions"] if x["path"] == name)["disposition"], "REMOVED")
            return self.result(context)

        self.submit(current)
        o.verify_staged(self.root)
        self.submit(lambda c: dict(self.result(c), coverage=[item for item in self.result(c)["coverage"]
                                                           if item["path"] != name]))
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertIn(name, {item["path"] for item in latest["verified_coverage"]})
        self.submit(lambda c: dict(self.result(c), coverage=[dict(item, status="UNREVIEWED", inputs=[])
                    if item["path"] == name else item for item in self.result(c)["coverage"]]),
                    error=o.OracleReviewIncomplete)

    def test_raw_ignored_live_mode_rename_and_receipt_custody(self):
        name = "Vault/tmp/ignored-live-source.md"
        path = self.root / name
        path.write_text("live source")

        def drift(context):
            result = self.result(context, findings=[self.finding("F902", name)])
            self.change("peer.py", "concurrent source")
            return result

        self.submit(drift, error=o.OracleApprovalError)
        self.submit()
        context = self.contexts[-1]
        self.assertTrue(context["input_hashes"][name].startswith("fs-sha256:"))
        self.assertEqual(context["raw_source_bindings"][name]["kind"], "file")
        o.verify_staged(self.root)
        path.chmod(0o755)
        with self.assertRaisesRegex(o.OracleApprovalError, "Observed raw source changed"):
            o.verify_staged(self.root)
        self.submit()
        self.assertIn(name, {item["path"] for item in self.contexts[-1]["invalidated_coverage"]})
        path.rename(path.with_name("renamed-source.md"))
        with self.assertRaisesRegex(o.OracleApprovalError, "Observed raw source changed"):
            o.verify_staged(self.root)
        self.submit()
        self.assertIsNone(self.contexts[-1]["input_hashes"][name])

    def test_raw_absence_rechecked_after_review_before_publication_and_at_receipt(self):
        name = "Vault/tmp/late-observed-source.md"
        path = self.root / name

        def drift(context):
            result = self.result(context, findings=[self.finding("F903", name)])
            self.change("peer.py", "concurrent source")
            return result

        self.submit(drift, error=o.OracleApprovalError)
        for boundary in ("review", "publication"):
            with self.subTest(boundary=boundary):
                path.unlink(missing_ok=True)
                if boundary == "review":
                    def move(context):
                        result = self.result(context)
                        path.write_text("arrived during assessment")
                        return result
                    self.submit(move, error=o.OracleApprovalError)
                else:
                    original = o._prepare_round
                    def move(*args, **kwargs):
                        result = original(*args, **kwargs)
                        if args[3] == "APPROVED":
                            path.write_text("arrived before publication")
                        return result
                    with patch.object(o, "_prepare_round", side_effect=move):
                        self.submit(error=o.OracleApprovalError)
                self.assertTrue(path.is_file())
                latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
                self.assertEqual(latest["outcome"], "ERROR")
                self.assertNotIn(name, {item["path"] for item in latest["verified_coverage"]})
                self.assertEqual(latest["raw_assessment"]["reported_review_status"], "COMPLETE")
                self.assertEqual(latest["finding_ledger"], {})
        path.unlink()
        self.submit()
        path.write_text("arrived after approval")
        with self.assertRaisesRegex(o.OracleApprovalError, "Observed raw source changed"):
            o.verify_staged(self.root)

    def test_raw_source_reference_safety_preserves_ids_without_external_reads(self):
        outside = self.root.parent / (self.root.name + "-external-source")
        outside.write_text("external sentinel")
        self.addCleanup(lambda: outside.unlink(missing_ok=True))
        link = self.root / "Vault/tmp/escape-link"
        link.symlink_to(outside)
        values = ["../escape", str(outside), ".git/config", "Vault/tmp/escape-link", "@proposal/scope", "bad\nname"]
        for value in values:
            with self.subTest(value=value):
                self.assertIsNone(o._owner_source_name(self.root, value)[0])
        self.assertEqual(o._owner_source_name(self.root, str(self.root / "Vault/tmp/safe-source.md")),
                         ("Vault/tmp/safe-source.md", None))
        parent = self.root / "Vault/tmp/file-parent"
        parent.write_text("regular parent")
        self.assertEqual(o._owner_source_fact(self.root, "Vault/tmp/file-parent/absent.md"), {"exists": False})

        def drift(context):
            result = self.result(context, findings=[self.finding("F904", str(outside))])
            result["coverage"].append({"path": ".git/config", "status": "UNREVIEWED", "inputs": [],
                                       "reason": "Untrusted raw reference"})
            self.change("peer.py", "concurrent source")
            return result
        self.submit(drift, error=o.OracleApprovalError)
        self.submit()
        context = self.contexts[-1]
        self.assertEqual(context["unadopted_assessments"][-1]["finding_ids"], ["F904"])
        self.assertEqual(context["prior_findings"], {})
        self.assertNotIn(str(outside), context["input_hashes"])
        self.assertNotIn(".git/config", context["input_hashes"])
        self.assertTrue(context["rejected_raw_source_references"])

    def test_previously_bound_raw_source_escape_errors_without_poisoning_unknown_claims(self):
        name = "Vault/tmp/trusted-original-source.md"
        path = self.root / name
        path.write_text("legitimate owner source")
        outside = self.root.parent / (self.root.name + "-escaped-source")
        outside.write_text("external sentinel")
        self.addCleanup(lambda: outside.unlink(missing_ok=True))

        def drift(context):
            result = self.result(context, findings=[self.finding("F906", name)])
            self.change("peer.py", "concurrent source")
            return result
        self.submit(drift, error=o.OracleApprovalError)
        self.submit()
        path.unlink()
        path.symlink_to(outside)
        self.submit(error=o.OracleSourceBindingError)
        self.assertEqual(outside.read_text(), "external sentinel")
        path.unlink()
        self.submit()
        self.assertIsNone(self.contexts[-1]["input_hashes"][name])
        self.assertEqual(self.contexts[-1]["prior_findings"], {})

    def test_raw_walk_rejects_external_return_before_reading_external_link(self):
        with tempfile.TemporaryDirectory() as directory:
            outside = Path(directory)
            target = self.root / "Vault/tmp/safe-return"
            target.mkdir(); (target / "source.md").write_text("synthetic owner source")
            (outside / "return").symlink_to(target)
            alias = self.root / "Vault/tmp/return-alias"
            alias.symlink_to(outside / "return")
            original = os.readlink
            def readlink(path, *args, **kwargs):
                if Path(path).is_absolute() and Path(path).is_relative_to(outside):
                    self.fail("Resolver traversed an outside-owner link")
                return original(path, *args, **kwargs)
            with patch.object(o.os, "readlink", side_effect=readlink):
                self.assertIsNone(o._owner_source_name(self.root, "Vault/tmp/return-alias/source.md")[0])

    def test_raw_walk_rejects_git_hops_cycles_and_excessive_links(self):
        target = self.root / "Vault/tmp/safe-return"
        target.mkdir(); (target / "source.md").write_text("synthetic source")
        (self.root / ".git/return-link").symlink_to(target)
        (self.root / "Vault/tmp/store-alias").symlink_to(self.root / ".git/return-link")
        (self.root / "Vault/tmp/cycle-a").symlink_to("cycle-b")
        (self.root / "Vault/tmp/cycle-b").symlink_to("cycle-a")
        for index in range(65):
            (self.root / f"Vault/tmp/chain-{index}").symlink_to(
                f"chain-{index + 1}" if index < 64 else "safe-return")
        for name in ("store-alias/source.md", "cycle-a/source.md", "chain-0/source.md"):
            with self.subTest(name=name):
                self.assertIsNone(o._owner_source_name(self.root, "Vault/tmp/" + name)[0])

    def test_safe_raw_chain_retarget_binds_equal_content_and_link_identity(self):
        parent = self.root / "Vault/tmp/chain"
        parent.mkdir()
        for name in ("first", "second"):
            (parent / name).mkdir(); (parent / name / "source.md").write_text("same source")
        (parent / "middle").symlink_to("first")
        (parent / "alias").symlink_to("middle")
        name = "Vault/tmp/chain/alias/source.md"
        self.assertEqual(o._owner_source_name(self.root, name), (name, None))
        fact = o._owner_source_fact(self.root, name)
        self.assertEqual(len(fact["links"]), 2)
        o._assert_raw_sources(self.root, {"raw_source_bindings": {name: fact}})
        (parent / "middle").unlink(); (parent / "middle").symlink_to("second")
        self.assertEqual(fact["sha256"], o._owner_source_fact(self.root, name)["sha256"])
        with self.assertRaises(o.OracleSourceBindingError):
            o._assert_raw_sources(self.root, {"raw_source_bindings": {name: fact}})

    def test_safe_raw_absence_retains_existing_link_custody(self):
        parent = self.root / "Vault/tmp/absent-chain"
        parent.mkdir(); (parent / "first").mkdir(); (parent / "second").mkdir()
        (parent / "alias").symlink_to("first")
        name = "Vault/tmp/absent-chain/alias/missing.md"
        fact = o._owner_source_fact(self.root, name)
        self.assertFalse(fact["exists"])
        self.assertEqual(len(fact["links"]), 1)
        o._assert_raw_sources(self.root, {"raw_source_bindings": {name: fact}})
        (parent / "alias").unlink(); (parent / "alias").symlink_to("second")
        with self.assertRaises(o.OracleSourceBindingError):
            o._assert_raw_sources(self.root, {"raw_source_bindings": {name: fact}})
        (parent / "second/missing.md").write_text("new source")
        with self.assertRaises(o.OracleSourceBindingError):
            o._assert_raw_sources(self.root, {"raw_source_bindings": {name: fact}})

    def test_terminal_raw_symlink_binds_current_safe_target(self):
        target = self.root / "Vault/tmp/linked-source.md"
        target.write_text("first source")
        (self.root / "Vault/tmp/source-alias").symlink_to(target.name)
        name = "Vault/tmp/source-alias"
        fact = o._owner_source_fact(self.root, name)
        self.assertEqual(fact["kind"], "symlink")
        self.assertEqual(fact["target"]["sha256"], o._sha(b"first source"))
        target.write_text("changed source")
        with self.assertRaises(o.OracleSourceBindingError):
            o._assert_raw_sources(self.root, {"raw_source_bindings": {name: fact}})

    def test_unknown_raw_return_preserves_id_as_excluded_without_poisoning(self):
        with tempfile.TemporaryDirectory() as directory:
            target = self.root / "Vault/tmp/own-return"
            target.mkdir(); (target / "source.md").write_text("own source")
            outside = Path(directory); (outside / "return").symlink_to(target)
            (self.root / "Vault/tmp/unknown-return").symlink_to(outside / "return")
            name = "Vault/tmp/unknown-return/source.md"
            def drift(context):
                result = self.result(context, findings=[self.finding("F910", name)])
                self.change("peer.py", "concurrent source")
                return result
            self.submit(drift, error=o.OracleApprovalError)
            self.submit()
            context = self.contexts[-1]
            self.assertNotIn(name, context["input_hashes"])
            self.assertNotIn(name, context["required_coverage_paths"])
            self.assertEqual(context["prior_findings"], {})
            self.assertEqual(context["unadopted_assessments"][-1]["finding_ids"], ["F910"])
            self.assertTrue(any(item["reference"] == name for item in context["rejected_raw_source_references"]))

    def test_bound_raw_return_is_error_during_current_preparation(self):
        parent = self.root / "Vault/tmp/bound-return"
        parent.mkdir(); (parent / "source.md").write_text("own source")
        name = "Vault/tmp/bound-return/source.md"
        def drift(context):
            result = self.result(context, findings=[self.finding("F911", name)])
            self.change("peer.py", "concurrent source")
            return result
        self.submit(drift, error=o.OracleApprovalError)
        self.submit()
        parent.rename(parent.with_name("bound-return-saved"))
        with tempfile.TemporaryDirectory() as directory:
            outside = Path(directory); (outside / "return").symlink_to(parent.with_name("bound-return-saved"))
            parent.symlink_to(outside / "return")
            self.submit(error=o.OracleSourceBindingError)

    def test_raw_chain_rechecked_at_review_publication_and_receipt(self):
        parent = self.root / "Vault/tmp/late-chain"
        parent.mkdir()
        for name in ("first", "second"):
            (parent / name).mkdir(); (parent / name / "source.md").write_text("same source")
        alias = parent / "alias"; alias.symlink_to("first")
        name = "Vault/tmp/late-chain/alias/source.md"
        def drift(context):
            result = self.result(context, findings=[self.finding("F912", name)])
            self.change("peer.py", "concurrent source")
            return result
        self.submit(drift, error=o.OracleApprovalError)
        def retarget():
            alias.unlink(); alias.symlink_to("second")
        for boundary in ("review", "publication"):
            with self.subTest(boundary=boundary):
                alias.unlink(); alias.symlink_to("first")
                if boundary == "review":
                    def move(context):
                        result = self.result(context); retarget(); return result
                    self.submit(move, error=o.OracleSourceBindingError)
                else:
                    original = o._prepare_round
                    def move(*args, **kwargs):
                        result = original(*args, **kwargs)
                        if args[3] == "APPROVED": retarget()
                        return result
                    with patch.object(o, "_prepare_round", side_effect=move):
                        self.submit(error=o.OracleSourceBindingError)
                latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
                self.assertEqual(latest["outcome"], "ERROR")
                self.assertEqual(latest["raw_assessment"]["reported_review_status"], "COMPLETE")
                self.assertNotIn(name, {item["path"] for item in latest["verified_coverage"]})
        alias.unlink(); alias.symlink_to("first")
        self.submit(); retarget()
        with self.assertRaises(o.OracleSourceBindingError):
            o.verify_staged(self.root)

    def test_raw_walk_denies_directory_swap_before_target_read(self):
        parent = self.root / "guarded"
        parent.mkdir(); (parent / "source.md").write_text("owner source")
        with tempfile.TemporaryDirectory() as directory:
            outside = Path(directory); (outside / "source.md").write_text("outside sentinel")
            original = os.open; moved = []
            def swap(path, flags, *args, **kwargs):
                if os.fspath(path) == "guarded" and kwargs.get("dir_fd") is not None and not moved:
                    parent.rename(self.root / "guarded-saved")
                    parent.symlink_to(outside); moved.append(True)
                return original(path, flags, *args, **kwargs)
            with patch.object(o.os, "open", side_effect=swap):
                with self.assertRaises(o.OracleApprovalError):
                    o._owner_source_fact(self.root, "guarded/source.md")
            self.assertTrue(moved)

    def test_historical_context_keeps_old_facts_while_current_round_owns_receipt_checks(self):
        name = "Vault/tmp/owner-local-current-source.md"
        source = self.root / name
        source.write_text("old source")
        def raw(context):
            result = self.result(context, findings=[self.finding("F907", name)])
            self.change("peer.py", "concurrent source")
            return result
        self.submit(raw, error=o.OracleApprovalError)
        self.submit()
        previous = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        historical = Path(previous["context_file"])
        old_bytes = historical.read_bytes()
        source.write_text("new independently reviewed source")
        self.submit(evidence_paths=[str(self.evidence), str(historical)])
        self.assertEqual(previous["candidate_tree"], self.git("write-tree"))
        self.assertEqual(historical.read_bytes(), old_bytes)
        o.verify_staged(self.root)
        source.write_text("changed after current assessment")
        with self.assertRaises(o.OracleSourceBindingError):
            o.verify_staged(self.root)
        source.write_text("new independently reviewed source")
        historical.write_bytes(old_bytes + b" ")
        with self.assertRaisesRegex(o.OracleApprovalError, "evidence changed"):
            o.verify_staged(self.root)

    def test_historical_preparation_keeps_old_facts_and_current_native_provenance_is_required(self):
        document = self.root / "Vault/docs/own-synthetic-design.md"
        document.parent.mkdir(parents=True)
        document.write_text("original synthetic requirement")
        vault = self.root / "Vault/tmp/synthetic-vault-query.json"
        vault.write_text('{"kind":"synthetic-vault-evidence"}')
        def reviewer(root, *args):
            run = o._RUN.get()
            context = json.loads((run / "review-context.json").read_bytes())
            self.contexts.append(context)
            o._atomic_write(run / "model.json", b"{}\n")
            return self.result(context)
        with patch.object(o, "_oracle", reviewer), patch.object(o, "_vault_evidence", return_value=vault):
            o.issue(self.root, [str(self.evidence)], None, reviewer=reviewer)
            previous = o._read_rounds(o._series_directory(self.root, self.base))[-1]
            historical = Path(previous["context_file"]).parent / "oracle-inputs.json"
            old_bytes = historical.read_bytes()
            document.write_text("new independently reviewed requirement")
            o.issue(self.root, [str(self.evidence), str(historical)], None, reviewer=reviewer)
        self.assertEqual(previous["candidate_tree"], self.git("write-tree"))
        self.assertEqual(historical.read_bytes(), old_bytes)
        o.verify_staged(self.root)
        document.write_text("changed after current assessment")
        with self.assertRaises(o.OracleApprovalError):
            o.verify_staged(self.root)
        document.write_text("new independently reviewed requirement")
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        preparation = Path(latest["context_file"]).parent / "oracle-inputs.json"
        preparation_bytes = preparation.read_bytes()
        preparation.write_bytes(preparation_bytes + b" ")
        with self.assertRaisesRegex(o.OracleApprovalError, "evidence changed"):
            o.verify_staged(self.root)
        preparation.write_bytes(preparation_bytes)
        round_path = o._series_directory(self.root, self.base) / f"round-{latest['round']:04d}.json"
        latest["context_sha256"] = "tampered"
        round_path.write_bytes(o._pretty(latest))
        with self.assertRaises(o.OracleApprovalError):
            o.verify_staged(self.root)

    def test_selection_explains_dependency_criteria_and_verified_reuse(self):
        self.submit()
        self.change("dependency.py", "changed consumed behavior")
        self.submit()
        context = self.contexts[-1]
        selected = {item["path"]: item for item in context["path_dispositions"]}
        self.assertEqual(selected["source.py"]["disposition"], "DEPENDENCY_CHANGED")
        self.assertEqual(selected["peer.py"]["disposition"], "REUSABLE_VERIFIED")
        self.assertEqual(context["attempt_delta"]["paths"], ["dependency.py"])
        self.assertEqual(context["cumulative_pending_since_verified"], ["dependency.py", "source.py"])
        self.environment.return_value = "environment-B"
        self.record_check()
        self.submit()
        selected = {item["path"]: item for item in self.contexts[-1]["path_dispositions"]}
        self.assertEqual(selected["peer.py"]["disposition"], "CRITERIA_APPLICABILITY")
        self.assertIn("environment_digest", selected["peer.py"]["reasons"])

    def test_binding_error_outcome_preserves_reported_incomplete_separately(self):
        def emitted(context, **kwargs):
            result = self.result(context, **kwargs)
            (o._RUN.get() / "result.json").write_text(json.dumps(result))
            return result
        def interrupted(context):
            result = emitted(context, status="INCOMPLETE")
            self.change("peer.py", "another implementation arrived during incomplete assessment")
            return result
        self.submit(interrupted, error=o.OracleApprovalError)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        public = json.loads((Path(latest["context_file"]).parent / "outcome.json").read_bytes())
        self.assertEqual(latest["outcome"], "ERROR")
        self.assertEqual(public["outcome"], "ERROR")
        self.assertEqual(public["reviewer_review_status"], "INCOMPLETE")
        self.assertEqual(public["reviewer_verdict"], "INCOMPLETE")
        self.assertEqual(latest["raw_assessment"]["reported_review_status"], "INCOMPLETE")
        self.assertEqual(latest["verified_coverage"], [])
        self.submit(lambda c: emitted(c, status="INCOMPLETE"), error=o.OracleReviewIncomplete)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        public = json.loads((Path(latest["context_file"]).parent / "outcome.json").read_bytes())
        self.assertEqual(public["outcome"], "INCOMPLETE")
        self.submit(lambda c: emitted(c, findings=[self.finding(origin="MISSED")]),
                    error=o.OracleCandidateRejected)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        public = json.loads((Path(latest["context_file"]).parent / "outcome.json").read_bytes())
        self.assertEqual(public["outcome"], "REJECTED")
        self.assertEqual(public["reviewer_review_status"], "COMPLETE")

    def test_native_last_message_survives_transport_and_diagnostic_exceptions(self):
        selected = patch.object(o, "selected_model", return_value="synthetic-model")
        selected.start()
        self.addCleanup(selected.stop)
        self.change(".agents/skills/oracle/review-output.schema.json", "{}")
        self.propose()
        self.record_check()
        actual_run, actual_write = o.subprocess.run, o._atomic_write
        for failure in ["transport", "process_exit", "diagnostic"]:
            with self.subTest(failure=failure):
                def interrupted(context):
                    result = self.result(context)
                    def run(command, *args, **kwargs):
                        if command[0] != "codex":
                            return actual_run(command, *args, **kwargs)
                        output = Path(command[command.index("--output-last-message") + 1])
                        output.write_text(json.dumps(result))
                        if failure == "transport":
                            raise OSError("synthetic transport after last message")
                        return subprocess.CompletedProcess(command, 3 if failure == "process_exit" else 0,
                                                           stdout="synthetic process diagnostic", stderr="")
                    def write(path, raw):
                        if failure == "diagnostic" and path.name == "stdout.log":
                            raise OSError("synthetic diagnostic publication failure")
                        return actual_write(path, raw)
                    with self.synthetic_native_child(run), \
                            patch.object(o, "_atomic_write", side_effect=write):
                        return o._review_process(self.root, "synthetic review request", "reviewer")
                self.submit(interrupted, error=o.OracleApprovalError if failure == "process_exit" else OSError)
                latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
                self.assertEqual(latest["outcome"], "ERROR")
                self.assertEqual(latest["verified_coverage"], [])
                raw = latest["raw_assessment"]
                self.assertEqual(raw["reported_review_status"], "COMPLETE")
                self.assertEqual(raw["reported_verdict"], "APPROVED")
                self.assertEqual(raw["result_sha256"], o._sha(Path(raw["result_file"]).read_bytes()))
        def current(context):
            self.assertEqual(len(context["unadopted_assessments"]), 3)
            self.assertEqual(context["reusable_coverage"], [])
            self.assertTrue(all(item["actual_outcome"] == "ERROR" for item in context["unadopted_assessments"]))
            return self.result(context)
        self.submit(current)
        o.verify_staged(self.root)

    def test_publication_rechecks_new_and_carried_witness_outputs_and_environment(self):
        field = "BOC_FINAL_WITNESS_INPUT"
        for origin in ["new", "carried"]:
            for drift in ["output", "environment"]:
                with self.subTest(origin=origin, drift=drift), patch.dict(os.environ, {field: "before"}):
                    self.record_check(environment_keys=(field,))
                    if origin == "carried":
                        self.submit()  # Utility carries the eligible witness even when omitted.
                    actual = o._prepare_round
                    def movement(*args, **kwargs):
                        result = actual(*args, **kwargs)
                        if args[3] == "APPROVED":
                            if drift == "environment":
                                os.environ[field] = "after"
                            else:
                                self.evidence.with_suffix(".stdout.log").write_text("changed original native output")
                        return result
                    with patch.object(o, "_prepare_round", side_effect=movement):
                        self.submit(error=o.OracleApprovalError)
                    self.assertFalse(o.receipt_path(self.root).exists())
                    latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
                    self.assertEqual(latest["outcome"], "ERROR")

    def test_selection_tracks_new_mode_type_and_deleted_current_paths(self):
        self.submit()
        path = self.root / "peer.py"
        path.chmod(0o755); self.git("add", "peer.py")
        self.submit()
        item = next(x for x in self.contexts[-1]["path_dispositions"] if x["path"] == "peer.py")
        self.assertEqual(item["current_fact"]["mode"], "100755")
        self.assertEqual(item["previous_attempt_fact"]["mode"], "100644")
        self.assertEqual(item["disposition"], "CONTENT_CHANGED")
        path.unlink(); path.symlink_to("dependency.py"); self.git("add", "peer.py")
        self.submit()
        item = next(x for x in self.contexts[-1]["path_dispositions"] if x["path"] == "peer.py")
        self.assertEqual(item["current_fact"]["type"], "symlink")
        path.unlink(); self.git("add", "-u", "peer.py")
        self.change("other.py", "a different implementation")
        self.submit()
        selected = {x["path"]: x for x in self.contexts[-1]["path_dispositions"]}
        self.assertEqual(selected["peer.py"]["disposition"], "REMOVED")
        self.assertFalse(selected["peer.py"]["current_fact"]["exists"])
        self.assertEqual(selected["other.py"]["disposition"], "NEW")

    def test_malformed_proposal_preserves_previous_valid_active_records(self):
        self.submit()
        original_proposal = o.proposal_path(self.root).read_bytes()
        original_receipt = o.receipt_path(self.root).read_bytes()
        invalid = {"verdict": "APPROVED", "findings": [], "authentication_impact": "NONE",
                   "owner_approval_status": "UNKNOWN", "api_version_assessment": self.assessment()}
        with self.assertRaisesRegex(o.OracleApprovalError, "classification"):
            o.review_proposal(self.root, "new request", [], None, lambda *args: invalid)
        self.assertEqual(o.proposal_path(self.root).read_bytes(), original_proposal)
        self.assertEqual(o.receipt_path(self.root).read_bytes(), original_receipt)
        self.assertEqual(o.verify_proposal(self.root)["verdict"], "APPROVED")
        o.verify_staged(self.root)

    def test_proposal_binding_error_keeps_prior_state_without_approving_new_scope(self):
        self.submit()
        original_proposal = o.proposal_path(self.root).read_bytes()
        original_receipt = o.receipt_path(self.root).read_bytes()
        def drift(*args):
            self.change("peer.py", "concurrent implementation")
            return {"verdict": "APPROVED", "findings": [], "authentication_impact": "NONE",
                    "owner_approval_status": "NOT_REQUIRED", "api_version_assessment": self.assessment()}
        with self.assertRaisesRegex(o.OracleApprovalError, "changed"):
            o.review_proposal(self.root, "new request", [], None, drift)
        self.assertEqual(o.proposal_path(self.root).read_bytes(), original_proposal)
        self.assertEqual(o.receipt_path(self.root).read_bytes(), original_receipt)
        self.assertNotEqual(o.verify_proposal(self.root)["proposal_sha256"], o._sha(b"new request"))
        with self.assertRaises(o.OracleApprovalError):
            o.verify_staged(self.root)  # Prior receipt never approves concurrent new source.

    def test_proposal_publication_and_final_metadata_error_restore_prior_state(self):
        for target in ["publication", "outcome"]:
            with self.subTest(target=target):
                self.submit()
                original_proposal = o.proposal_path(self.root).read_bytes()
                original_receipt = o.receipt_path(self.root).read_bytes()
                actual_write = o._atomic_write
                failed = False
                def fail_once(path, raw):
                    nonlocal failed
                    selected = path == o.proposal_path(self.root) if target == "publication" else path.name == "outcome.json"
                    if selected and not failed:
                        failed = True
                        actual_write(path, raw)
                        raise OSError("synthetic post-publication metadata failure")
                    return actual_write(path, raw)
                result = {"verdict": "APPROVED", "findings": [], "authentication_impact": "NONE",
                          "owner_approval_status": "NOT_REQUIRED", "api_version_assessment": self.assessment()}
                with patch.object(o, "_atomic_write", side_effect=fail_once), self.assertRaises(OSError):
                    o.review_proposal(self.root, "different request", [], None, lambda *args: result)
                self.assertEqual(o.proposal_path(self.root).read_bytes(), original_proposal)
                self.assertEqual(o.receipt_path(self.root).read_bytes(), original_receipt)
                o.verify_staged(self.root)

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
            result.update(authentication_impact="AUTHENTICATION", owner_approval_status="UNKNOWN")
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
            result["coverage"] = [{"path": "source.py", "status": "UNREVIEWED", "inputs": [],
                                   "reason": "Current source requires an additional branch assessment"}]
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
        architecture = self.root / "Vault/docs/architecture.md"
        architecture.parent.mkdir(parents=True, exist_ok=True)
        self.record_check()
        self.submit()
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
            source.replace('str(schema_path),', 'str(root / "changed-schema.json"),'),
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
            "default policy": source.replace('def _review_process(root: Path, prompt: str, prefix: str,', 'def _review_process(root: Path, prompt: str, prefix: str = REVIEWER_ROLE,'),
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
                                                         o.LOCAL_EXECUTION_POLICY, o.REVIEW_SERIES_POLICY,
                                                         o.DEPLOYMENT_PLACEMENT_POLICY)))
                for clause in ("Read governing instructions and review criteria first", "once per content identity",
                               "bounded candidate changes, then retained validation results", "Query compact",
                               "Avoid concatenating entire large", "batch sizes that prevent truncation",
                               "sealed original observations",
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
            self.assertIn("On initial assessment make one complete pass over the commits being validated", launches[0])
            self.assertIn("On follow-up or resume confirm changed criteria, then inspect new commits", launches[0])
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

    def native_route_fixture(self, *, executable=False):
        middle = self.root / "Vault/tmp/native-middle"
        middle.mkdir(exist_ok=True)
        target = middle / "input"
        target.write_text("#!/bin/sh\nexit 0\n" if executable else "selected native bytes")
        target.chmod(0o755 if executable else 0o600)
        alias = self.root / "native-input"
        alias.unlink(missing_ok=True)
        alias.symlink_to("Vault/tmp/native-middle/input")
        self.git("add", "native-input")
        return middle, alias

    def native_external_return(self, middle):
        saved = middle.with_name(middle.name + "-saved")
        middle.rename(saved)
        external = tempfile.TemporaryDirectory()
        self.addCleanup(external.cleanup)
        returning = Path(external.name) / "return"
        returning.symlink_to(saved, target_is_directory=True)
        middle.symlink_to(returning, target_is_directory=True)

    def test_native_input_reentry_is_rejected_before_and_after_capture(self):
        middle, alias = self.native_route_fixture()
        record = o.record_validation(self.root, [sys.executable, "-c", "pass"], ["native-input"], self.evidence)
        self.native_external_return(middle)
        with self.assertRaises(o.OracleApprovalError):
            o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])
        with self.assertRaises(o.OracleApprovalError):
            o.record_validation(self.root, [sys.executable, "-c", "pass"], ["native-input"], self.evidence)

    def test_native_safe_same_byte_retarget_invalidates_original_witness(self):
        middle, alias = self.native_route_fixture()
        record = o.record_validation(self.root, [sys.executable, "-c", "pass"], ["native-input"], self.evidence)
        saved = middle.with_name("same-byte-target")
        middle.rename(saved); middle.symlink_to(saved, target_is_directory=True)
        with self.assertRaises(o.OracleApprovalError):
            o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])
        fresh = o.record_validation(self.root, [sys.executable, "-c", "pass"], ["native-input"], self.evidence)
        o._validation_record(self.root, str(self.evidence), fresh["inputs"], fresh["environment_digest"])

    def test_native_executable_reentry_and_mode_are_bound(self):
        middle, alias = self.native_route_fixture(executable=True)
        record = o.record_validation(self.root, [str(alias)], ["source.py"], self.evidence)
        self.assertGreaterEqual(len(record["execution_custody"]), 2)  # Script plus real interpreter.
        self.native_external_return(middle)
        with self.assertRaises(o.OracleApprovalError):
            o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])

    def test_native_output_mode_and_relocation_reject_equal_bytes(self):
        for movement in ("mode", "symlink"):
            with self.subTest(movement=movement):
                record = self.record_check()
                output = self.evidence.with_suffix(".stdout.log")
                if movement == "mode":
                    output.chmod(0o644)
                else:
                    saved = output.with_name("same-output")
                    output.rename(saved); output.symlink_to(saved)
                with self.assertRaises(o.OracleApprovalError):
                    o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])
                output.unlink()

    def test_native_record_route_rejects_before_json_parsing(self):
        record = self.record_check()
        middle = self.root / "Vault/tmp/record-middle"
        middle.mkdir(); (middle / "record.json").write_bytes(self.evidence.read_bytes())
        self.native_external_return(middle)
        with patch.object(o.json, "loads", side_effect=AssertionError("unsafe content was parsed")):
            with self.assertRaises(o.OracleApprovalError):
                o._validation_record(self.root, str(middle / "record.json"), record["inputs"], record["environment_digest"])

    def test_native_record_mode_and_lexical_location_are_bound(self):
        record = self.record_check()
        self.evidence.chmod(0o644)
        with self.assertRaises(o.OracleApprovalError):
            o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])
        self.evidence.chmod(0o600)
        alias = self.evidence.with_name("record-alias.json"); alias.symlink_to(self.evidence)
        with self.assertRaises(o.OracleApprovalError):
            o._validation_record(self.root, str(alias), record["inputs"], record["environment_digest"])

    def test_native_capture_late_input_and_executable_reentry_retains_outputs(self):
        for closure in ("input", "executable"):
            with self.subTest(closure=closure):
                middle, alias = self.native_route_fixture(executable=closure == "executable")
                command = [str(alias)] if closure == "executable" else [sys.executable, "-c", "print('observed')"]
                original = o.subprocess.run
                def movement(arguments, **options):
                    result = original(arguments, **options)
                    if arguments == command:
                        self.native_external_return(middle)
                    return result
                with patch.object(o.subprocess, "run", side_effect=movement):
                    with self.assertRaises(o.OracleApprovalError):
                        o.record_validation(self.root, command, ["native-input"] if closure == "input" else ["source.py"],
                                            self.evidence)
                self.assertFalse(self.evidence.exists())
                self.assertTrue(self.evidence.with_suffix(".stdout.log").exists())
                # Restore this owned temporary fixture before the next independent subcase.
                middle.unlink(); middle.with_name(middle.name + "-saved").rename(middle)

    def test_native_publication_and_receipt_recheck_selected_middle_custody(self):
        middle, alias = self.native_route_fixture()
        record = o.record_validation(self.root, [sys.executable, "-c", "pass"], ["native-input"], self.evidence)
        self.submit()
        self.native_external_return(middle)
        with self.assertRaises(o.OracleApprovalError):
            o.verify_staged(self.root)
        # A carried supporting witness cannot become eligible through a new caller omission.
        self.submit(evidence_paths=[])
        self.assertFalse(self.contexts[-1]["current_validations"])
        self.assertFalse(self.contexts[-1]["reusable_validations"])

    def test_native_final_publication_rechecks_new_witness_route(self):
        middle, alias = self.native_route_fixture()
        o.record_validation(self.root, [sys.executable, "-c", "pass"], ["native-input"], self.evidence)
        actual = o._prepare_round
        def late(*args, **kwargs):
            result = actual(*args, **kwargs)
            if args[3] == "APPROVED":
                self.native_external_return(middle)
            return result
        with patch.object(o, "_prepare_round", side_effect=late):
            self.submit(error=o.OracleApprovalError)

    def test_native_explicit_external_execution_and_declared_input_are_supported(self):
        paths = self.declare_parent()
        record = o.record_validation(self.root, [sys.executable, "-c", "pass"], [str(paths[1])], self.evidence)
        o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])
        self.assertTrue(Path(record["execution_custody"][0]["resolved"]).is_absolute())

    def test_native_missing_legacy_custody_keeps_original_observation_without_eligibility(self):
        record = self.record_check()
        del record["provenance_policy"]
        record["record_sha256"] = o._sha(o._canonical({k: v for k, v in record.items() if k != "record_sha256"}))
        self.evidence.write_bytes(o._pretty(record)); original = self.evidence.read_bytes()
        self.submit()
        self.assertFalse(self.contexts[-1]["current_validations"])
        self.assertTrue(self.contexts[-1]["invalid_current_validations"])
        self.assertEqual(original, self.evidence.read_bytes())
        self.assertEqual(json.loads(original)["exit_code"], 0)

    def test_evidence_dual_aliases_keep_lexical_custody_and_detect_safe_retarget(self):
        target = self.root / "Vault/tmp/evidence-data"; target.write_text("same bytes")
        first = target.with_name("evidence-first"); second = target.with_name("evidence-second")
        first.symlink_to(target); second.symlink_to(target)
        names = [str(first), str(second)]
        files = o._files(self.root, names)
        self.assertEqual(set(files), {str(p.relative_to(self.root)) for p in (first, second)})
        binding = o._input_binding(self.root, files, None)
        other = target.with_name("evidence-data-copy"); other.write_bytes(target.read_bytes())
        second.unlink(); second.symlink_to(other)
        self.assertEqual(files, o._files(self.root, names))
        with self.assertRaises(o.OracleApprovalError):
            o._assert_binding(self.root, binding, files, None)

    def test_native_private_output_parent_reentry_never_writes_external_target(self):
        directory = self.root / "Vault/tmp/parent-route"
        directory.mkdir()
        external = tempfile.TemporaryDirectory(); self.addCleanup(external.cleanup)
        directory.rmdir(); directory.symlink_to(external.name, target_is_directory=True)
        with self.assertRaises(o.OracleApprovalError):
            o.record_validation(self.root, [sys.executable, "-c", "pass"], ["source.py"], directory / "record.json")
        self.assertEqual(list(Path(external.name).iterdir()), [])

    def test_native_capture_rechecks_unselected_executable_mode(self):
        executable = self.root / "Vault/tmp/native-executable"
        executable.write_text("#!/bin/sh\nexit 0\n"); executable.chmod(0o755)
        command = [str(executable)]
        original = o.subprocess.run
        def drift(arguments, **options):
            completed = original(arguments, **options)
            if arguments == command:
                executable.chmod(0o744)
            return completed
        with patch.object(o.subprocess, "run", side_effect=drift):
            with self.assertRaises(o.OracleApprovalError):
                o.record_validation(self.root, command, ["source.py"], self.evidence)
        self.assertFalse(self.evidence.exists())
        self.assertTrue(self.evidence.with_suffix(".stdout.log").exists())

    def test_native_retained_round_reentry_is_rejected_before_parsing(self):
        self.submit()
        directory = o._series_directory(self.root, self.base)
        saved = directory.with_name(directory.name + "-saved")
        directory.rename(saved)
        external = tempfile.TemporaryDirectory(); self.addCleanup(external.cleanup)
        returning = Path(external.name) / "return"; returning.symlink_to(saved, target_is_directory=True)
        directory.symlink_to(returning, target_is_directory=True)
        with patch.object(o.json, "loads", side_effect=AssertionError("unsafe history was parsed")):
            with self.assertRaises(o.OracleApprovalError):
                o._read_rounds(directory)

    def assert_managed_return_rejected(self, path, action):
        saved = path.with_name(path.name + "-custody-saved")
        is_directory = path.is_dir()
        path.rename(saved)
        external = tempfile.TemporaryDirectory()
        try:
            returning = Path(external.name) / "return"
            returning.symlink_to(saved, target_is_directory=is_directory)
            path.symlink_to(returning, target_is_directory=is_directory)
            with self.assertRaises(o.OracleApprovalError):
                action()
        finally:
            path.unlink()
            saved.rename(path)
            external.cleanup()

    def metadata_route(self, path, external, route):
        """Keep the original managed directory/file for exact restoration."""
        saved = path.with_name(path.name + '-metadata-saved')
        path.rename(saved)
        destination = external / path.name
        if route == 'return':
            destination.symlink_to(saved, target_is_directory=saved.is_dir())
        elif saved.is_dir():
            destination.mkdir()
        else:
            destination.write_bytes(b'outside sentinel')
        path.symlink_to(destination, target_is_directory=saved.is_dir())
        self.addCleanup(lambda: (path.unlink(), saved.rename(path)))
        return destination, saved

    def test_metadata_directory_and_controller_admission_precede_mutation(self):
        for target in ('directory', 'runs', 'controllers'):
            for route in ('escape', 'return'):
                with self.subTest(target=target, route=route), tempfile.TemporaryDirectory() as outside:
                    directory = o.receipt_path(self.root).parent
                    path = directory if target == 'directory' else directory / ('runs' if target == 'runs' else 'controllers')
                    destination, saved = self.metadata_route(path, Path(outside), route)
                    before = {str(item.relative_to(saved)): item.read_bytes() for item in saved.rglob('*')
                              if item.is_file()} if saved.is_dir() else saved.read_bytes()
                    called = []
                    def review_proposal(root):
                        called.append(True)
                        return {'verdict': 'APPROVED'}
                    with self.assertRaises(o.OracleApprovalError):
                        o._serialized_review(review_proposal)(self.root)
                    self.assertEqual(called, [])
                    after = {str(item.relative_to(saved)): item.read_bytes() for item in saved.rglob('*')
                             if item.is_file()} if saved.is_dir() else saved.read_bytes()
                    self.assertEqual(after, before)
                    if route == 'escape':
                        if destination.is_dir():
                            self.assertEqual(list(destination.iterdir()), [])
                        else:
                            self.assertEqual(destination.read_bytes(), b'outside sentinel')
                    self.assertIsNone(o._METADATA_ROOT.get())
                    path.unlink(); saved.rename(path)
                    self._cleanups.pop()

    def test_metadata_special_admission_record_is_rejected_before_review(self):
        directory = o.receipt_path(self.root).parent / 'controllers/admissions'
        path = directory / '00000001.json'
        saved = directory.parent / 'saved-admission.json'; path.rename(saved)
        try:
            for kind in ('directory', 'fifo'):
                with self.subTest(kind=kind):
                    path.mkdir() if kind == 'directory' else os.mkfifo(path)
                    try:
                        def review_proposal(root):
                            self.fail('nonregular controller record admitted the review')
                        with self.assertRaises(o.OracleApprovalError):
                            o._serialized_review(review_proposal)(self.root)
                    finally:
                        path.rmdir() if kind == 'directory' else path.unlink()
        finally:
            saved.rename(path)

    def test_private_directory_creation_preserves_literal_parent_requirements(self):
        for namespace, create in (('.git/oracle', o._metadata_directory), ('Vault/tmp', o._private_witness_parent)):
            base = self.root / namespace / 'literal-admission'; base.mkdir()
            for kind in ('missing', 'file', 'broken-link'):
                with self.subTest(namespace=namespace, kind=kind):
                    first = base / kind
                    if kind == 'file':
                        first.write_bytes(b'owned regular file')
                    elif kind == 'broken-link':
                        first.symlink_to('absent-link-target')
                    before = {path.name for path in base.iterdir()}
                    with self.assertRaises(o.OracleApprovalError):
                        create(self.root, first / '..' / 'must-not-exist')
                    self.assertEqual({path.name for path in base.iterdir()}, before)
            (base / 'container/child').mkdir(parents=True)
            (base / 'alias').symlink_to('container/child')
            create(self.root, base / 'alias/../new-directory')
            self.assertTrue((base / 'container/new-directory').is_dir())
            self.assertFalse((base / 'new-directory').exists())

    def test_controller_admission_cannot_rewrite_original_invocation(self):
        directory = o.receipt_path(self.root).parent / 'controllers/admissions'
        path = directory / '00000001.json'
        original = path.read_bytes()
        value = json.loads(original)
        value['process_identity'] = 'replaced process identity'
        path.unlink(); path.write_text(json.dumps(value))
        try:
            def review_proposal(root):
                self.fail('a replaced original invocation admitted another review')
            with self.assertRaisesRegex(o.OracleApprovalError, 'custody'):
                o._serialized_review(review_proposal)(self.root)
            self.assertIsNone(o._METADATA_ROOT.get())
        finally:
            path.unlink()
            identity = self.root / '.git/oracle/controllers' / value['controller_id'] / 'identity.json'
            os.link(identity, path)

    def test_late_metadata_writes_and_removals_reject_reentry(self):
        for target in ('run', 'approval', 'proposal', 'round', 'remove'):
            for route in ('escape', 'return'):
                with self.subTest(target=target, route=route), tempfile.TemporaryDirectory() as outside:
                    restored = []
                    def review_proposal(root):
                        directory = o.receipt_path(root).parent
                        destination, saved = self.metadata_route(directory, Path(outside), route)
                        restored.extend((directory, destination, saved))
                        (destination / 'approval.json').write_bytes(b'outside sentinel')
                        paths = {'run': o._RUN.get() / 'late-outcome.json', 'approval': o.receipt_path(root),
                                 'proposal': o.proposal_path(root), 'round': directory / 'series/new/round-0001.json'}
                        if target == 'remove':
                            o._record_error(root, {'base_commit': self.base, 'round': 1}, {}, RuntimeError('synthetic'))
                        else:
                            o._atomic_write(paths[target], b'late private metadata')
                    try:
                        with self.assertRaises(o.OracleApprovalError):
                            o._serialized_review(review_proposal)(self.root)
                        directory, destination, saved = restored
                        self.assertEqual((destination / 'approval.json').read_bytes(), b'outside sentinel')
                        if route == 'escape':
                            self.assertEqual({item.name for item in destination.iterdir()}, {'approval.json'})
                        self.assertIsNone(o._METADATA_ROOT.get())
                    finally:
                        if restored:
                            restored[0].unlink(); restored[2].rename(restored[0]); self._cleanups.pop()

    def test_metadata_publication_uses_the_admitted_directory_descriptor(self):
        actual = o.os.replace
        restored = []
        with tempfile.TemporaryDirectory() as outside:
            def review_proposal(root):
                path = o._RUN.get() / 'anchored.json'
                def moved(source, destination, **options):
                    directory, saved = path.parent, path.parent.with_name(path.parent.name + '-admitted')
                    directory.rename(saved); directory.symlink_to(outside, target_is_directory=True)
                    restored.extend((directory, saved))
                    return actual(source, destination, **options)
                with patch.object(o.os, 'replace', side_effect=moved):
                    o._atomic_write(path, b'admitted owned bytes')
                self.assertEqual((restored[1] / path.name).read_bytes(), b'admitted owned bytes')
                self.assertEqual(list(Path(outside).iterdir()), [])
                restored[0].unlink(); restored[1].rename(restored[0]); restored.clear()
                return {'verdict': 'APPROVED'}
            try:
                lexical_root = self.root / '..' / self.root.name
                self.assertEqual(o._serialized_review(review_proposal)(lexical_root)['verdict'], 'APPROVED')
                self.assertIsNone(o._METADATA_ROOT.get())
            finally:
                if restored:
                    restored[0].unlink(); restored[1].rename(restored[0])

    def test_late_managed_history_readers_reject_reentry_before_body(self):
        self.submit()
        records = o._read_rounds(o._series_directory(self.root, self.base))
        context, record = self.contexts[-1], records[-1]
        context_path = Path(record["context_file"])
        round_path = o._series_directory(self.root, self.base) / "round-0001.json"
        receipt = o.receipt_path(self.root).read_bytes()
        cases = [
            (context_path, lambda: o._path_dispositions(self.root, context, records)),
            (round_path, lambda: o._record_error(self.root, context, record["review"],
                OSError("synthetic publication failure"), published_round=(round_path, record))),
            (context_path, lambda: o._revoke_published_review(self.root, context_path.parent,
                OSError("synthetic final metadata failure"))),
        ]
        for path, action in cases:
            with self.subTest(path=path.name, consumer=action):
                o.receipt_path(self.root).write_bytes(receipt)
                actual_read = Path.read_bytes
                def read(current):
                    if current == path:
                        raise AssertionError("Managed body consumed before route custody")
                    return actual_read(current)
                with patch.object(Path, "read_bytes", read):
                    self.assert_managed_return_rejected(path, action)
        o.receipt_path(self.root).write_bytes(receipt)
        o.verify_staged(self.root)

    def test_receipt_preparation_reentry_is_rejected_after_initial_evidence_check(self):
        receipt = self.submit()
        records = o._read_rounds(o._series_directory(self.root, self.base))
        context_path = Path(records[-1]["context_file"])
        preparation_path = context_path.parent / "oracle-inputs.json"
        preparation = {"kind": "oracle-preparation-v1", "input_binding": o._input_binding(self.root, {}, None),
                       "candidate_diff": {}, "vault_evidence": {}}
        preparation_path.write_bytes(o._pretty(preparation))
        receipt["validation_evidence"][str(preparation_path.relative_to(self.root))] = o._sha(o._pretty(preparation))
        receipt["approval_id"] = o._sha(o._canonical({key: value for key, value in receipt.items() if key != "approval_id"}))
        raw = o._pretty(receipt)
        o._verify_receipt(self.root, receipt, raw)
        actual = o._receipt_current_context
        def late(root, payload, pending):
            result = actual(root, payload, pending)
            self.native_external_return(preparation_path)
            return result
        actual_read = Path.read_bytes
        def read(current):
            if current == preparation_path:
                raise AssertionError("Late preparation body consumed before route custody")
            return actual_read(current)
        with patch.object(o, "_receipt_current_context", side_effect=late), patch.object(Path, "read_bytes", read):
            with self.assertRaises(o.OracleApprovalError):
                o._verify_receipt(self.root, receipt, raw)

    def test_failed_proposal_restoration_checks_managed_routes_before_content(self):
        self.submit()
        run = Path(o._read_rounds(o._series_directory(self.root, self.base))[-1]["context_file"]).parent
        original = {path: path.read_bytes() for path in (o.proposal_path(self.root), o.receipt_path(self.root))}
        prospective = run / "prospective-proposal.json"
        prospective.write_bytes(original[o.proposal_path(self.root)])
        o._restore_failed_proposal(self.root, run, original)
        for path in [prospective, *original]:
            with self.subTest(path=path.name):
                actual_read = Path.read_bytes
                def read(current):
                    if current == path:
                        raise AssertionError("Proposal custody body consumed before route check")
                    return actual_read(current)
                with patch.object(Path, "read_bytes", read):
                    self.assert_managed_return_rejected(path, lambda: o._restore_failed_proposal(self.root, run, original))
        self.assertEqual({path: path.read_bytes() for path in original}, original)
        o.verify_staged(self.root)

    def test_native_result_reentry_preserves_error_without_unchecked_raw_bytes(self):
        selected = patch.object(o, "selected_model", return_value="synthetic-model")
        selected.start(); self.addCleanup(selected.stop)
        self.change(".agents/skills/oracle/review-output.schema.json", "{}")
        self.propose(); self.record_check()
        actual_run = o.subprocess.run
        def reviewer(context):
            result = self.result(context)
            def run(command, *args, **kwargs):
                if command[0] != "codex":
                    return actual_run(command, *args, **kwargs)
                output = Path(command[command.index("--output-last-message") + 1])
                output.write_text(json.dumps(result))
                self.native_external_return(output)
                return subprocess.CompletedProcess(command, 0, stdout="synthetic diagnostic", stderr="")
            with self.synthetic_native_child(run):
                return o._review_process(self.root, "synthetic request", "reviewer")
        self.submit(reviewer, error=o.OracleApprovalError)
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        self.assertEqual(latest["outcome"], "ERROR")
        self.assertEqual(latest["verified_coverage"], [])
        self.assertNotIn("raw_assessment", latest)
        self.assertFalse(o.receipt_path(self.root).exists())

    def test_native_relative_path_selection_uses_execution_cwd_and_retains_hops(self):
        directory = self.root / "bin"; directory.mkdir()
        executable = directory / "owned-check"
        executable.write_text("#!/bin/sh\nexit 0\n"); executable.chmod(0o755)
        self.git("add", "bin/owned-check")
        with patch.dict(os.environ, {"PATH": "bin:/usr/bin:/bin"}):
            record = o.record_validation(self.root, ["owned-check"], ["source.py"], self.evidence)
            self.assertEqual(record["exit_code"], 0)
            self.assertEqual(record["execution_custody"][0]["resolved"], "bin/owned-check")
            o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])
            self.native_external_return(directory)
            with self.assertRaises(o.OracleApprovalError):
                o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])

    def test_native_selected_input_ancestor_directory_mode_is_bound(self):
        middle, alias = self.native_route_fixture(); middle.chmod(0o700)
        record = o.record_validation(self.root, [sys.executable, "-c", "pass"], ["native-input"], self.evidence)
        middle.chmod(0o755)
        with self.assertRaises(o.OracleApprovalError):
            o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])

    def test_native_parent_components_are_walked_before_lexical_normalization(self):
        directory = self.root / "nested/deep"; directory.mkdir(parents=True)
        (self.root / "nested/value").write_text("actual requested bytes")
        (self.root / "value").write_text("different normalized bytes")
        alias = self.root / "alias"; alias.symlink_to("nested/deep", target_is_directory=True)
        requested = alias / "../value"
        fact, raw = o._custody_read(self.root, requested)
        self.assertEqual(raw, requested.read_bytes())
        self.assertEqual(fact["path"], "alias/../value")
        self.assertEqual(fact["sha256"], o._sha(requested.read_bytes()))
        self.assertEqual(fact["source"]["resolved_path"], "nested/value")

    def test_native_resolved_executable_index_mode_is_bound_without_content_change(self):
        executable = self.root / "tracked-check"
        executable.write_text("#!/bin/sh\nexit 0\n"); executable.chmod(0o755)
        self.git("add", "tracked-check")
        alias = self.root / "Vault/tmp/check-alias"; alias.symlink_to(executable)
        record = o.record_validation(self.root, [str(alias)], ["source.py"], self.evidence)
        self.git("update-index", "--chmod=-x", "tracked-check")
        self.assertTrue(executable.stat().st_mode & 0o111)
        with self.assertRaises(o.OracleApprovalError):
            o._validation_record(self.root, str(self.evidence), record["inputs"], record["environment_digest"])

    def test_native_governing_module_reentry_is_rejected_before_content(self):
        directory = self.root / "tools"
        self.native_external_return(directory)
        with self.assertRaises(o.OracleApprovalError):
            o._review_policy_digest(self.root)

    def test_native_both_launches_forward_exact_selected_effort_and_metadata(self):
        schema = self.root / ".agents/skills/oracle/review-output.schema.json"
        schema.write_text('{}')
        for kind in ('proposal', 'review'):
            with self.subTest(kind=kind):
                run = self.root / ('Vault/tmp/launch-' + kind); run.mkdir()
                token = o._RUN.set(run); calls = []
                def execute(command, **options):
                    calls.append((command, options))
                    Path(command[command.index('--output-last-message') + 1]).write_text(
                        json.dumps({'verdict': 'INCOMPLETE', 'review_status': 'INCOMPLETE'}))
                    return subprocess.CompletedProcess(command, 0, '', '')
                try:
                    with patch.object(o, 'selected_model', return_value='gpt-6.1-sol'), \
                            patch.object(o, 'selected_reasoning_effort', return_value='xhigh'), \
                            patch.object(o.subprocess, 'run', side_effect=execute):
                        if kind == 'proposal':
                            o._proposal_oracle(self.root, 'Synthetic proposal', {}, None)
                        else:
                            o._oracle(self.root, 'synthetic-tree', ['source.py'], {}, None)
                    command, options = calls[0]
                    self.assertIn('model_reasoning_effort="xhigh"', command)
                    self.assertEqual(options['env']['CODEX_SELECTED_REASONING_EFFORT'], 'xhigh')
                    self.assertEqual(options['env']['CODEX_SELECTED_MODEL'], 'gpt-6.1-sol')
                    metadata = json.loads((run / 'model.json').read_text())
                    self.assertEqual(metadata['reasoning_effort'], 'xhigh')
                    self.assertEqual(metadata['selected_model'], 'gpt-6.1-sol')
                    self.assertTrue(metadata['ignore_user_config'])
                finally:
                    o._RUN.reset(token)

    def test_native_effort_settings_drift_is_bound_without_changing_accepted_hook_environment(self):
        with patch.object(o, 'selected_model', return_value='gpt-6.1-sol'), \
                patch.object(o, 'selected_reasoning_effort', return_value='xhigh') as effort:
            binding = o._input_binding(self.root, {}, None)
            self.assertEqual(binding['reviewer_settings'], {'model': 'gpt-6.1-sol', 'reasoning_effort': 'xhigh'})
            effort.return_value = 'high'
            with self.assertRaises(o.OracleApprovalError):
                o._assert_binding(self.root, binding, {}, None)
            o._assert_binding(self.root, binding, {}, None, check_environment=False)

    def test_native_unspecified_effort_adds_no_override_or_inherited_hint(self):
        schema = self.root / ".agents/skills/oracle/review-output.schema.json"; schema.write_text('{}')
        run = self.root / 'Vault/tmp/unspecified-effort'; run.mkdir(); token = o._RUN.set(run)
        calls = []
        def execute(command, **options):
            calls.append((command, options))
            Path(command[command.index('--output-last-message') + 1]).write_text('{"verdict":"INCOMPLETE"}')
            return subprocess.CompletedProcess(command, 0, '', '')
        try:
            with patch.object(o, 'selected_model', return_value='gpt-6.1-sol'), \
                    patch.object(o, 'selected_reasoning_effort', return_value=None), \
                    patch.dict(os.environ, {'CODEX_SELECTED_REASONING_EFFORT': 'stale-hint'}), \
                    patch.object(o.subprocess, 'run', side_effect=execute):
                o._review_process(self.root, 'Synthetic settings', 'reviewer')
            command, options = calls[0]
            self.assertFalse(any('model_reasoning_effort=' in argument for argument in command))
            self.assertNotIn('CODEX_SELECTED_REASONING_EFFORT', options['env'])
            self.assertIsNone(json.loads((run / 'model.json').read_text())['reasoning_effort'])
        finally:
            o._RUN.reset(token)

    def test_unknown_and_bound_raw_nonregular_source_types(self):
        for kind in ('directory', 'fifo'):
            for linked in (False, True):
                for trusted in (False, True):
                    with self.subTest(kind=kind, linked=linked, trusted=trusted):
                        stem = f'type-{kind}-{linked}-{trusted}'
                        target = self.root / 'Vault/tmp' / stem
                        alias = target.with_name(stem + '-alias')
                        if linked:
                            alias.symlink_to(target.name)
                        source = alias if linked else target
                        name = str(source.relative_to(self.root))
                        old = {}
                        if trusted:
                            target.write_text('previous regular source')
                            fact = o._owner_source_fact(self.root, name)
                            old[name] = 'fs-sha256:' + fact['mode'] + ':' + fact['kind'] + ':' + o._sha(o._canonical(fact))
                            target.unlink()
                        if kind == 'directory':
                            target.mkdir()
                        else:
                            os.mkfifo(target, 0o600)
                        context = self.root / 'Vault/tmp/type-context.json'
                        context.write_text(json.dumps({'input_hashes': old}))
                        record = {'round': 1, 'context_file': str(context), 'raw_assessment': {
                            'assessment': {'findings': [self.finding('TYPE-OBS-001', name)]}}}
                        inputs = {}
                        if trusted:
                            with self.assertRaises(o.OracleSourceBindingError):
                                o._raw_source_closure(self.root, [record], inputs)
                        else:
                            references, bindings, rejected = o._raw_source_closure(self.root, [record], inputs)
                            self.assertEqual((references, bindings, inputs), ({}, {}, {}))
                            self.assertEqual({item['finding_id'] for item in rejected}, {'TYPE-OBS-001'})
                            self.assertEqual({item['status'] for item in rejected}, {'UNAVAILABLE'})

    def test_raw_nonregular_race_rechecks_type_before_source_binding(self):
        for trusted in (False, True):
            target = self.root / f'Vault/tmp/type-race-{trusted}'
            target.write_text('regular before inspection')
            name = str(target.relative_to(self.root))
            fact = o._owner_source_fact(self.root, name)
            old = {name: 'fs-sha256:' + fact['mode'] + ':' + fact['kind'] + ':' + o._sha(o._canonical(fact))} if trusted else {}
            context = self.root / 'Vault/tmp/race-context.json'
            context.write_text(json.dumps({'input_hashes': old}))
            record = {'round': 1, 'context_file': str(context), 'raw_assessment': {'assessment': {
                'findings': [dict(self.finding('TYPE-RACE-001', name), affected_paths=[])]}}}
            original = o._owner_source_name
            def replace_after_check(*args):
                result = original(*args)
                target.unlink(); target.mkdir()
                return result
            with patch.object(o, '_owner_source_name', side_effect=replace_after_check):
                if trusted:
                    with self.assertRaises(o.OracleSourceBindingError):
                        o._raw_source_closure(self.root, [record], {})
                else:
                    references, bindings, rejected = o._raw_source_closure(self.root, [record], {})
                    self.assertEqual((references, bindings), ({}, {}))
                    self.assertEqual(rejected[0]['finding_id'], 'TYPE-RACE-001')
                    self.assertEqual(rejected[0]['status'], 'UNAVAILABLE')

    def test_terminal_directory_selectors_reject_before_content_and_execution(self):
        regular = self.root / 'Vault/tmp/terminal-regular'
        regular.write_text('#!/bin/sh\nexit 0\n'); regular.chmod(0o700)
        name = str(regular.relative_to(self.root))
        for suffix in ('/', '/.'):
            for selector in (name + suffix, str(regular) + suffix):
                with self.subTest(selector=selector):
                    with self.assertRaises(NotADirectoryError):
                        os.open(os.path.join(str(self.root), selector), os.O_RDONLY | os.O_NONBLOCK)
                    with patch.object(o.os, 'fdopen', side_effect=AssertionError('invalid target content read')):
                        with self.assertRaises(o.OracleApprovalError):
                            o._custody_read(self.root, selector)
                        with self.assertRaises(o.OracleApprovalError):
                            o._files(self.root, [selector])
                        with self.assertRaises(o.OracleApprovalError):
                            o._execution_custody(self.root, [selector], dict(os.environ))
                    self.assertTrue(o._custody_name(self.root, selector).endswith(suffix))
                    raw_name, error = o._owner_source_name(self.root, selector)
                    self.assertIsNone(error)
                    self.assertFalse(o._owner_source_fact(self.root, raw_name)['exists'])
            alias = regular.with_name('terminal-alias-' + str(len(suffix)))
            alias.symlink_to(regular.name + suffix)
            with patch.object(o.os, 'fdopen', side_effect=AssertionError('invalid linked target content read')):
                with self.assertRaises(o.OracleApprovalError):
                    o._custody_read(self.root, alias)
        directory = self.root / 'Vault/tmp/terminal-directory'; directory.mkdir()
        (directory / 'valid').write_text('valid through an actual directory')
        fact, raw = o._custody_read(self.root, 'Vault/tmp/terminal-directory/./valid')
        self.assertEqual(raw, b'valid through an actual directory')
        self.assertEqual(fact['path'], 'Vault/tmp/terminal-directory/./valid')
        repeated_root = str(self.root) + '//Vault/tmp/terminal-directory/valid'
        fact, raw = o._custody_read(self.root, repeated_root)
        self.assertEqual(raw, b'valid through an actual directory')
        self.assertEqual(fact['path'], 'Vault/tmp/terminal-directory/valid')
        self.assertEqual(o._owner_source_name(self.root, repeated_root), (fact['path'], None))

    def test_prepared_settings_drift_blocks_both_normal_launch_paths(self):
        for kind in ('proposal', 'review'):
            with self.subTest(kind=kind), patch.object(o, 'selected_model', return_value='gpt-6.1-sol'), \
                    patch.object(o, 'selected_reasoning_effort', return_value='xhigh') as effort:
                self.propose()
                original_run = subprocess.run
                def execute(command, **options):
                    if command[0] == 'codex':
                        raise AssertionError('unbound reviewer was launched')
                    return original_run(command, **options)
                def drift_before_launch(*args):
                    effort.return_value = 'low'
                    return (o._proposal_oracle if kind == 'proposal' else o._oracle)(*args)
                with patch.object(o.subprocess, 'run', side_effect=execute):
                    with self.assertRaisesRegex(o.OracleApprovalError, 'before launch'):
                        if kind == 'proposal':
                            o.review_proposal(self.root, 'Synthetic prelaunch race', [], None, drift_before_launch)
                        else:
                            o.issue(self.root, [str(self.evidence)], None, drift_before_launch)
                self.assertIsNone(o._PREPARED_SETTINGS.get())
                self.assertFalse(o.receipt_path(self.root).exists())

    def test_selected_settings_drift_keeps_actual_error_and_raw_observation(self):
        with patch.object(o, 'selected_model', return_value='gpt-6.1-sol'), \
                patch.object(o, 'selected_reasoning_effort', return_value='xhigh') as effort:
            self.propose()
            def drift(context):
                result = self.result(context)
                effort.return_value = 'low'
                return result
            self.submit(drift, error=o.OracleApprovalError)
            latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
            self.assertEqual(latest['outcome'], 'ERROR')
            self.assertEqual(latest['raw_assessment']['reported_review_status'], 'COMPLETE')
            self.assertIsNone(o._PREPARED_SETTINGS.get())

    def test_native_absent_empty_and_empty_directory_path_match_runtime(self):
        local = self.root / 'sh'; local.write_text('#!/bin/sh\nprintf local\n'); local.chmod(0o700)
        for environment, expected in (({}, 'system'), ({'PATH': ''}, 'local')):
            result = subprocess.run(['sh', '-c', 'printf system'], cwd=self.root, env=environment,
                                    capture_output=True, text=True)
            self.assertEqual((result.returncode, result.stdout), (0, expected))
            selected = o._execution_custody(self.root, ['sh'], environment)[0]['resolved']
            self.assertEqual(selected == 'sh', expected == 'local')
        empty = self.root / 'empty-search-directory'; empty.mkdir()
        environment = {'PATH': str(empty)}
        with self.assertRaises(FileNotFoundError):
            subprocess.run(['sh'], cwd=self.root, env=environment)
        with self.assertRaises(o.OracleApprovalError):
            o._execution_custody(self.root, ['sh'], environment)

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
        for path in paths[:2]:
            name = str(path)
            digest = o._sha(path.read_bytes())
            self.assertEqual(context["input_hashes"][name], "sha256:" + digest)
            self.assertEqual(context["guards"]["authority_digests"][name], digest)
            self.assertEqual(receipt["authority_digests"][name], digest)
            self.assertEqual(native["authority_digests"][name], digest)
        self.assertNotIn(str(paths[2]), context["input_hashes"])
        self.assertNotIn(str(paths[2]), native["authority_digests"])
        paths[2].write_text("unconsumed coordinator implementation changed")
        o.verify_staged(self.root)
        explicit = o.record_validation(self.root, [sys.executable, "-c", "pass"], [str(paths[1])],
                                        self.root / "Vault/tmp/parent-check.json")
        self.assertEqual(explicit["inputs"][0]["path"], str(paths[1]))

    def test_declared_parent_drift_during_review_is_error(self):
        paths = self.declare_parent()
        self.submit()
        for path in paths[:2]:
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
        for path in paths[:2]:
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

    def test_explicit_consumed_parent_command_evidence_remains_bound(self):
        paths = self.declare_parent()
        evidence = o._files(self.root, [str(paths[2])])
        binding = o._input_binding(self.root, evidence, None)
        inputs = o._candidate_inputs(self.root, self.git('write-tree'), evidence)
        self.assertEqual(inputs[str(paths[2])], 'sha256:' + o._sha(paths[2].read_bytes()))
        self.assertNotIn(str(paths[2]), binding['authority_digests'])
        o._assert_binding(self.root, binding, evidence, None)
        paths[2].write_text('changed actually consumed coordinator')
        with self.assertRaises(o.OracleApprovalError):
            o._assert_binding(self.root, binding, evidence, None)

    def test_explicit_parent_command_native_capture_and_reuse_are_bound(self):
        paths = self.declare_parent()
        output = self.root / 'Vault/tmp/native-parent-check.json'
        o.record_validation(self.root, [sys.executable, '-c', 'pass'], [str(paths[2])], output)
        record = json.loads(output.read_text())
        proof = record['inputs']
        current = o._candidate_inputs(self.root, self.git('write-tree'), o._files(self.root, [str(output)]))
        self.assertIn(str(paths[2]), current)
        o._validation_record(self.root, str(output), proof, record['environment_digest'])
        paths[2].write_text('changed consumed parent executable')
        with self.assertRaises(o.OracleApprovalError):
            o._validation_record(self.root, str(output), proof, record['environment_digest'])

    def test_exact_immutable_proposal_survives_unrelated_latest_pointer(self):
        original = o.proposal_path(self.root).read_bytes()
        selected = o._archive_proposal(self.root, original)
        outcome = {'verdict': 'APPROVED', 'findings': [], 'authentication_impact': 'NONE',
                   'owner_approval_status': 'NOT_REQUIRED', 'api_version_assessment': self.assessment()}
        o.review_proposal(self.root, 'Separate future live attachment task', [], None, lambda *args: outcome)
        receipt = self.submit(proposal_record=selected)
        context = self.contexts[-1]
        self.assertEqual(context['proposal_scope']['sha256'], json.loads(original)['proposal_sha256'])
        self.assertEqual(context['proposal_record'], {'path': str(selected), 'sha256': o._sha(original)})
        self.assertNotEqual(o.verify_proposal(self.root)['proposal_sha256'], context['proposal_scope']['sha256'])
        o.verify_staged(self.root)
        self.assertEqual(receipt['candidate_tree'], self.git('write-tree'))
        with self.assertRaisesRegex(o.OracleApprovalError, 'immutable'):
            o.verify_proposal(self.root, o.proposal_path(self.root))
        selected.write_bytes(original + b' ')
        with self.assertRaises(o.OracleApprovalError):
            o.verify_staged(self.root)

    def test_failed_cohort_final_output_is_unadopted_in_next_context_and_bound(self):
        self.synthetic_reviewer_settings()
        schema = (Path(__file__).resolve().parents[1] / '.agents/skills/oracle/review-output.schema.json').read_text()
        self.change('.agents/skills/oracle/review-output.schema.json', schema)
        def child(root, prompt, prefix, *, schema_path, cohort_policy):
            run = o._RUN.get(); packet = json.loads((run / 'cohort-context.json').read_text())
            context = json.loads(Path(packet['parent_context']).read_text())
            cohort = packet['cohort']; assessment = self.result(context)
            assessment['coverage'] = [item for item in assessment['coverage'] if item['path'] in cohort['required_paths']]
            assessment['validations'] = []
            result = {key: packet[key] for key in ('plan_sha256', 'candidate_commit', 'candidate_tree', 'input_binding_sha256')}
            result.update(cohort_id=cohort['id'], assessment=assessment,
                          integration=[{'concern': key, 'status': 'REVIEWED',
                                        'inputs': self.inputs(context, '@proposal/scope'), 'reason': 'Traced current boundary'}
                                       for key in cohort['integration_checks']])
            settings = o._PREPARED_SETTINGS.get()
            o._atomic_write(run / 'model.json', o._pretty({'selected_model': settings['model'], 'reasoning_effort': settings['reasoning_effort']}))
            if cohort['id'] == parallel.AREAS[1]:
                assessment.update(review_status='INCOMPLETE', verdict='INCOMPLETE', limitations=['Required consumer unfinished'],
                                  findings=[self.finding('F2099')])
                assessment['coverage'][0]['inputs'][0]['digest'] = 'stale original claim'
                o._atomic_write(run / 'result.json', o._pretty(result))
                raise o.OracleApprovalError('Transport failed after original final message')
            o._atomic_write(run / 'result.json', o._pretty(result))
            return result
        with patch.object(o, '_review_process', side_effect=child):
            with self.assertRaises(o.OracleApprovalError):
                o.issue(self.root, [str(self.evidence)], None, lambda *args: parallel.review(o, *args))
        rounds = o._read_rounds(o._series_directory(self.root, self.base))
        first = rounds[-1]
        self.assertEqual(first['outcome'], 'ERROR')
        raw = first['review']['unadopted_cohort_assessments'][0]
        self.assertEqual((raw['actual_outcome'], raw['reported_review_status']), ('ERROR', 'INCOMPLETE'))
        self.assertEqual(raw['assessment']['findings'][0]['id'], 'F2099')
        self.assertIn('stale', raw['admission_error'])
        self.assertNotIn('source.py', {item['path'] for item in first['verified_coverage']})
        self.assertTrue(first['verified_coverage'])
        self.submit()
        resumed = self.contexts[-1]
        observation = next(item for item in resumed['unadopted_assessments'] if item.get('cohort_id') == parallel.AREAS[1])
        self.assertEqual(observation['finding_ids'], ['F2099'])
        self.assertIn('UNADOPTED', observation['status'])
        self.assertEqual(observation['actual_outcome'], 'ERROR')
        self.assertEqual(observation['reported_review_status'], 'INCOMPLETE')
        self.assertIn(o._custody_name(self.root, raw['result_file']), resumed['retained_observation_evidence'])
        packet = parallel.packet(resumed, parallel.partition(resumed, {'reviewer_settings': {}}, lambda v: o._sha(o._canonical(v))),
                                 {'id': parallel.AREAS[0], 'required_paths': [], 'integration_checks': []},
                                 Path(first['context_file']), lambda v: o._sha(o._canonical(v)))
        self.assertTrue(any('F2099' in item['finding_ids'] for item in packet['unadopted_assessments']))
        original = Path(raw['result_file']).read_bytes()
        Path(raw['result_file']).write_bytes(original + b' ')
        with self.assertRaises(o.OracleApprovalError):
            o._raw_assessment_navigation(self.root, rounds, resumed['input_hashes'], resumed['guards'])
        Path(raw['result_file']).write_bytes(original)
        original_mode = Path(raw['result_file']).stat().st_mode & 0o777
        Path(raw['result_file']).chmod(original_mode ^ 0o100)
        with self.assertRaises(o.OracleApprovalError):
            o._raw_assessment_navigation(self.root, rounds, resumed['input_hashes'], resumed['guards'])
        Path(raw['result_file']).chmod(original_mode)
        identical = Path(raw['result_file']).with_name('same-final-bytes.json'); identical.write_bytes(original)
        Path(raw['result_file']).unlink()
        Path(raw['result_file']).symlink_to(identical)
        with self.assertRaises(o.OracleApprovalError):
            o._raw_assessment_navigation(self.root, rounds, resumed['input_hashes'], resumed['guards'])

    def prepared_integrity_response(self, *, transport=False, target='page'):
        self.synthetic_reviewer_settings()
        schema = (Path(__file__).resolve().parents[1] / '.agents/skills/oracle/review-output.schema.json').read_bytes()
        self.change('.agents/skills/oracle/review-output.schema.json', schema.decode())
        def child(root, prompt, prefix, *, schema_path, cohort_policy):
            run = o._RUN.get(); packet = json.loads((run/'cohort-context.json').read_text())
            context = json.loads(Path(packet['parent_context']).read_text()); cohort = packet['cohort']
            assessment = self.result(context)
            assessment['coverage'] = [item for item in assessment['coverage'] if item['path'] in cohort['required_paths']]
            assessment['validations'] = []
            result = {key: packet[key] for key in ('plan_sha256', 'candidate_commit', 'candidate_tree', 'input_binding_sha256')}
            result.update(cohort_id=cohort['id'], assessment=assessment, integration=[{
                'concern': key, 'status': 'REVIEWED', 'inputs': self.inputs(context, '@proposal/scope'),
                'reason': 'Traced native integration'} for key in cohort['integration_checks']])
            settings = o._PREPARED_SETTINGS.get()
            o._atomic_write(run/'model.json', o._pretty({'selected_model': settings['model'], 'reasoning_effort': settings['reasoning_effort']}))
            if cohort['id'] == parallel.AREAS[1]:
                assessment.update(verdict='REJECTED', findings=[self.finding('F2099')])
            o._atomic_write(run/'result.json', o._pretty(result))
            if cohort['id'] == parallel.AREAS[1]:
                manifest = json.loads(Path(packet['prepared_source']['manifest']).read_text())
                altered = {'page': Path(manifest['pages'][0]['path']), 'context': run/'cohort-context.json',
                           'schema': schema_path, 'plan': run.parent.parent/'cohort-plan.json',
                           'parent_context': Path(packet['parent_context'])}[target]
                altered.write_bytes(b'{' if target in {'plan', 'parent_context'} else altered.read_bytes() + b' ')
                if transport:
                    raise OSError('Synthetic transport failed after original rejected final response')
            return result
        with patch.object(o, '_review_process', side_effect=child):
            with self.assertRaises(o.OracleApprovalError):
                o.issue(self.root, [str(self.evidence)], None, lambda *args: parallel.review(o, *args))
        rounds = o._read_rounds(o._series_directory(self.root, self.base)); first = rounds[-1]
        retained_review = first.get('raw_assessment', {}).get('assessment', first['review'])
        raw = next(row for row in retained_review['unadopted_cohort_assessments'] if row['cohort_id'] == parallel.AREAS[1])
        self.assertEqual((first['outcome'], raw['actual_outcome'], raw['eligibility']), ('ERROR', 'ERROR', 'NONE'))
        self.assertEqual((raw['reported_review_status'], raw['reported_verdict']), ('COMPLETE', 'REJECTED'))
        self.assertEqual(raw['assessment']['findings'][0]['id'], 'F2099')
        self.assertIn('integrity failed', raw['prepared_integrity_error'])
        self.assertNotIn('source.py', {item['path'] for item in first['verified_coverage']})
        if target not in {'plan', 'parent_context'}:
            self.assertTrue(first['verified_coverage'])
        if target == 'context':
            self.assertEqual(Path(raw['cohort_context_file']).name, 'unadopted-context.json')
        self.submit(); resumed = self.contexts[-1]
        observation = next(row for row in resumed['unadopted_assessments'] if row.get('cohort_id') == parallel.AREAS[1])
        self.assertEqual(observation['finding_ids'], ['F2099']); self.assertEqual(observation['eligibility'], 'NONE')
        self.assertIn('integrity failed', observation['prepared_integrity_error'])
        self.assertNotIn('F2099', resumed['prior_findings'])
        saved = Path(raw['cohort_context_file']).read_bytes()
        Path(raw['cohort_context_file']).write_bytes(saved + b' ')
        with self.assertRaises(o.OracleApprovalError):
            o._raw_assessment_navigation(self.root, rounds, resumed['input_hashes'], resumed['guards'])

    def test_prepared_page_failure_retains_rejected_response_and_next_context(self):
        self.prepared_integrity_response()

    def test_prepared_page_failure_after_transport_retains_original_finding(self):
        self.prepared_integrity_response(transport=True)

    def test_prepared_context_failure_retains_sealed_original_assignment(self):
        self.prepared_integrity_response(target='context')

    def test_prepared_schema_failure_retains_rejected_response_without_coverage(self):
        self.prepared_integrity_response(target='schema')

    def test_malformed_shared_plan_retains_rejected_response_and_original_assignment(self):
        self.prepared_integrity_response(target='plan')

    def test_malformed_shared_parent_context_retains_sealed_original_for_navigation(self):
        self.prepared_integrity_response(target='parent_context')

    def assert_error_disposition(self):
        latest = o._read_rounds(o._series_directory(self.root, self.base))[-1]
        telemetry = json.loads((Path(latest["context_file"]).parent / "outcome.json").read_text())
        self.assertEqual(latest["outcome"], "ERROR")
        self.assertEqual(telemetry["outcome"], "ERROR")
        self.assertFalse(o.receipt_path(self.root).exists())
        self.assertTrue(latest["verified_coverage"])
        self.assertTrue(latest["verified_validations"])
        return latest

    def test_final_classification_and_api_gates_record_error_before_approval(self):
        assessments = [
            {"authentication_impact": "AUTHENTICATION", "owner_approval_status": "UNKNOWN"},
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
            return dict(result, authentication_impact="AUTHENTICATION", owner_approval_status="UNKNOWN")
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
