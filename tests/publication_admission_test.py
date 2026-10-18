"""Behavioral publication tests use only an owned synthetic Git repository."""
from pathlib import Path
import json
import subprocess
import unittest
from unittest.mock import patch

import oracle_review_series as fixtures
o = fixtures.o
from tools import publication_admission as publication


class PublicationAdmission(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.ReviewSeries("runTest")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root
        self.fixture.git("branch", "-M", "main")
        self.fixture.git("remote", "add", "origin", o.PUBLICATION_REMOTE)
        self.fixture.git("update-ref", "refs/remotes/origin/main", self.fixture.base)
        self.ref = "codex/release-v0.0.1"
        self.commands = []

    def effect(self, context):
        return {"id": "existing-credential-read", "kind": "credential-trust",
                "boundary": "synthetic local credential boundary",
                "description": "Read a newly selected existing credential source",
                "paths": ["source.py"], "inputs": self.fixture.inputs(context, "source.py")}

    def submit(self, protected=False, *, authentication=False, dispositions=None):
        def build(context):
            result = self.fixture.result(context)
            result["protected_effects"] = {"active": ([self.effect(context), dict(self.effect(context), id="second-tenant-boundary", kind="tenant-isolation")]
                                                       if protected == "two" else [self.effect(context)] if protected else []),
                                           "dispositions": dispositions(context) if dispositions else []}
            if authentication:
                result.update(authentication_impact="AUTHENTICATION", owner_approval_status="MISSING")
            return result
        receipt = self.fixture.submit(build)
        o.verify_staged(self.root)
        message = self.root / "Vault/tmp/commit-message"
        message.write_text("synthetic reviewed change\n")
        o.apply_trailers(self.root, message)
        self.fixture.git("commit", "-qF", str(message))
        o.verify_commit(self.root, "HEAD")
        return receipt

    def execute(self, command, **kwargs):
        self.commands.append(command)
        if command[:3] == ["gh", "pr", "view"]:
            value = {"headRefOid": self.fixture.git("rev-parse", "HEAD"), "baseRefOid": self.fixture.base,
                     "headRefName": self.ref, "baseRefName": "main", "mergeStateStatus": "CLEAN",
                     "statusCheckRollup": [{"conclusion": "SUCCESS"}]}
            return subprocess.CompletedProcess(command, 0, json.dumps(value), "")
        return subprocess.CompletedProcess(command, 0, "", "")

    def test_authentication_technical_review_commit_and_review_push_need_no_deployment_permission(self):
        receipt = self.submit(True, authentication=True)
        self.assertEqual(receipt["owner_approval_status"], "MISSING")
        self.assertIsNone(receipt["owner_approval_evidence"])
        selected = publication.publish(self.root, "HEAD", self.ref, "review-push",
                                       execute=self.execute, refresh=False)
        self.assertFalse(selected["human_authority_required"])
        self.assertEqual(self.commands[-1][:4], ["git", "push", "--set-upstream", "origin"])

    def test_missing_permission_blocks_only_actual_protected_promotion(self):
        self.submit(True, authentication=True)
        original = o.receipt_path(self.root).read_bytes()
        with self.assertRaisesRegex(o.OracleApprovalError, "scoped deployment authority"):
            publication.publish(self.root, "HEAD", self.ref, "main-promotion", pr="1",
                                execute=self.execute, refresh=False)
        self.assertEqual(self.commands, [])
        self.assertEqual(o.receipt_path(self.root).read_bytes(), original)

    def test_ordinary_compatible_auth_label_does_not_require_human_permission(self):
        self.fixture.change("auth-boundary-label.txt", "ordinary compatible correction")
        self.submit(authentication=True)
        selected = publication.publish(self.root, "HEAD", self.ref, "main-promotion", pr="1",
                                       execute=self.execute, refresh=False)
        self.assertFalse(selected["human_authority_required"])
        self.assertEqual(self.commands[-1][:4], ["gh", "pr", "merge", "1"])
        self.assertIn("--match-head-commit", self.commands[-1])

    def test_later_ordinary_commit_cannot_erase_earlier_effect(self):
        first = self.submit(True)
        self.fixture.propose()
        self.fixture.change("peer.py", "later ordinary correction")
        self.fixture.record_check()
        with self.assertRaisesRegex(o.OracleApprovalError, "Earlier protected effect"):
            self.fixture.submit()
        context = self.fixture.contexts[-1]
        self.assertIn("source.py", context["required_coverage_paths"])
        self.assertIn("@publication/scope", context["required_coverage_paths"])
        self.assertEqual(context["publication_scope"]["prior_effects"][0]["effect"]["id"],
                         first["protected_effects"]["active"][0]["id"])

    def test_current_independent_reversion_evidence_retires_effect(self):
        first = self.submit(True)
        origin = o._sha(o._pretty(first))
        self.fixture.propose()
        self.fixture.change("source.py", "base")
        self.fixture.record_check()
        self.submit(dispositions=lambda context: [{"origin": origin, "id": "existing-credential-read",
                     "status": "REVERTED", "reason": "Current source equals the published baseline",
                     "inputs": self.fixture.inputs(context, "source.py", "@publication/scope")}])
        selected = publication.plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False)
        self.assertFalse(selected["human_authority_required"])

    def native_authorize(self, owner, *, prior=None, verdict="APPROVED", observed=None, effect_ids=None):
        original_plan = publication.plan
        def synthetic_native(root, prompt, prefix, **kwargs):
            request = json.loads((o._RUN.get() / "authorization-inputs.json").read_bytes())
            if observed is not None:
                observed.append(request["requested_effect_ids"])
            result = {"verdict": verdict, "review_status": "COMPLETE", "summary": "Synthetic scoped decision",
                      "plan_sha256": request["plan"]["plan_sha256"],
                      "authorized_effect_ids": request["requested_effect_ids"] if verdict == "APPROVED" else []}
            run = o._RUN.get()
            o._timed("authorization_reviewer_seconds", lambda: None)
            for name, value in {"result.json": result, "process.json": {"exit_code": 0},
                                "model.json": {"reviewer_role": "independent-oracle-approver"}}.items():
                o._atomic_write(run / name, o._pretty(value))
            o._atomic_write(run / "request.txt", prompt.encode())
            return result
        with patch.object(publication, "plan", side_effect=lambda *a, **kw: original_plan(*a, **dict(kw, refresh=False))), \
                patch.object(o, "_review_process", side_effect=synthetic_native):
            return publication.authorize(self.root, "HEAD", self.ref, str(owner), authorization=prior, effect_ids=effect_ids)

    def test_fresh_clone_missing_private_history_keeps_complete_technical_review_available(self):
        first = self.submit(True)
        o._technical_archive(self.root, o._sha(o._pretty(first))).unlink()
        self.fixture.propose()
        self.fixture.change("peer.py", "fresh-clone ordinary follow-up")
        self.fixture.record_check()
        receipt = self.submit(True, authentication=True)
        self.assertEqual(len(receipt["publication_scope"]["history_limitations"]), 1)
        self.assertIn("source.py", self.fixture.contexts[-1]["required_coverage_paths"])
        self.assertIn("peer.py", self.fixture.contexts[-1]["required_coverage_paths"])
        publication.publish(self.root, "HEAD", self.ref, "review-push", execute=self.execute, refresh=False)
        self.assertEqual(self.commands[-1][:2], ["git", "push"])

    def test_native_current_diff_includes_unpublished_history_without_private_archive(self):
        first = self.submit(True)
        o._technical_archive(self.root, o._sha(o._pretty(first))).unlink()
        self.fixture.propose()
        self.fixture.change("peer.py", "current ordinary second commit")
        self.fixture.record_check()
        def reviewer(root, tree, paths, evidence, owner):
            run = o._RUN.get()
            context = json.loads((run / "review-context.json").read_bytes())
            self.assertIn("source.py", paths)
            self.assertIn("peer.py", paths)
            diff = (run / "candidate.diff").read_text()
            self.assertIn("diff --git a/source.py b/source.py", diff)
            self.assertIn("diff --git a/peer.py b/peer.py", diff)
            self.assertIn("source.py", context["required_coverage_paths"])
            self.assertEqual(context["publication_scope"]["history_limitations"][0]["commit"],
                             self.fixture.git("rev-parse", "HEAD"))
            self.assertEqual(context["publication_scope"]["history_limitations"][0]["tree"],
                             self.fixture.git("rev-parse", "HEAD^{tree}"))
            o._atomic_write(run / "model.json", b"{}\\n")
            result = self.fixture.result(context)
            result["protected_effects"]["active"] = [self.effect(context)]
            return result
        with patch.object(o, "_oracle", reviewer), patch.object(o, "_vault_evidence", return_value=self.fixture.evidence):
            o.issue(self.root, [str(self.fixture.evidence)], None, reviewer=reviewer)
        o.verify_staged(self.root)

    def test_missing_published_baseline_allows_technical_review_and_limits_publication(self):
        self.fixture.git("update-ref", "-d", "refs/remotes/origin/main")
        self.submit(authentication=True)
        with self.assertRaisesRegex(o.OracleApprovalError, "baseline UNAVAILABLE"):
            publication.plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False)

    def test_dangling_archive_is_custody_failure_and_genuine_absence_remains_recoverable(self):
        receipt = self.submit(True)
        archive = o._technical_archive(self.root, o._sha(o._pretty(receipt)))
        original = archive.read_bytes()
        archive.write_bytes(original + b" ")
        with self.assertRaisesRegex(o.OracleApprovalError, "Archived technical receipt changed"):
            o._publication_scope(self.root, o._tree(self.root))
        archive.write_bytes(original)
        preserved = archive.with_suffix(".preserved-original")
        archive.rename(preserved)
        archive.symlink_to("missing-owned-receipt.json")
        with self.assertRaisesRegex(o.OracleApprovalError, "invalid linked route"):
            o._publication_scope(self.root, o._tree(self.root))
        archive.unlink()
        scope = o._publication_scope(self.root, o._tree(self.root))
        self.assertEqual(len(scope["history_limitations"]), 1)
        self.assertEqual(preserved.read_bytes(), original)

    def test_publication_rechecks_consumed_validation_custody_after_commit(self):
        self.submit()
        publication.plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False)
        validation = json.loads(self.fixture.evidence.read_bytes())
        output = self.root / next(iter(validation["output_hashes"]))
        mode = output.stat().st_mode & 0o777
        output.chmod(0o644 if mode != 0o644 else 0o600)
        with self.assertRaisesRegex(o.OracleApprovalError, "Validation.*provenance"):
            publication.publish(self.root, "HEAD", self.ref, "main-promotion", pr="1",
                                execute=self.execute, refresh=False)
        self.assertEqual(self.commands, [])
        output.chmod(mode)
        publication.plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False)

    def test_nondirectory_archive_ancestors_fail_custody_and_missing_directories_recover(self):
        receipt = self.submit(True)
        archive = o._technical_archive(self.root, o._sha(o._pretty(receipt)))
        for directory in [archive.parent, archive.parent.parent]:
            with self.subTest(directory=str(directory)):
                preserved = directory.with_name(directory.name + "-preserved")
                directory.rename(preserved)
                try:
                    directory.write_text("existing non-directory archive ancestor")
                    with self.assertRaisesRegex(o.OracleApprovalError, "non-directory ancestor"):
                        o._publication_scope(self.root, o._tree(self.root))
                    directory.unlink()
                    scope = o._publication_scope(self.root, o._tree(self.root))
                    self.assertEqual(len(scope["history_limitations"]), 1)
                finally:
                    if directory.is_file():
                        directory.unlink()
                    preserved.rename(directory)

    def test_publication_binds_exact_commit_receipt_digest_before_effect_consumption(self):
        receipt = self.submit(True)
        archive = o._technical_archive(self.root, o._sha(o._pretty(receipt)))
        original = archive.read_bytes()
        alternate = dict(receipt, protected_effects={"active": [], "dispositions": []})
        archive.write_bytes(o._pretty(alternate))
        with self.assertRaisesRegex(o.OracleApprovalError, "technical receipt digest changed"):
            publication.publish(self.root, "HEAD", self.ref, "main-promotion", pr="1",
                                execute=self.execute, refresh=False)
        self.assertEqual(self.commands, [])
        archive.write_bytes(original)
        self.assertTrue(publication.plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False)
                        ["human_authority_required"])
    def test_cumulative_authority_requests_only_missing_effects_and_retains_attempts(self):
        self.submit("two", authentication=True)
        original = o.receipt_path(self.root).read_bytes()
        owner = self.root / "Vault/tmp/synthetic-authority.json"
        owner.write_text('{"quote":"synthetic first effect authority"}')
        selected = publication.plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False)
        first_requested = []
        first = self.native_authorize(owner, effect_ids=["existing-credential-read"], observed=first_requested)
        self.assertEqual(first_requested, [["existing-credential-read"]])
        with self.assertRaisesRegex(o.OracleApprovalError, "unknown current effect"):
            self.native_authorize(owner, effect_ids=["invented-foreign-effect"])
        first_path = Path(first["path"])
        first_bytes = first_path.read_bytes()
        with self.assertRaisesRegex(o.OracleApprovalError, "second-tenant-boundary"):
            publication.publish(self.root, "HEAD", self.ref, "main-promotion", pr="1", authorization=[first_path],
                                execute=self.execute, refresh=False)
        self.assertEqual(self.commands, [])
        bad_owner = self.root / "Vault/tmp/incorrect-synthetic-authority.json"
        bad_owner.write_text('{"quote":"synthetic insufficient authority"}')
        before = set((o.receipt_path(self.root).parent / "publication").glob("*.json"))
        requested = []
        with self.assertRaises(o.OracleCandidateRejected):
            self.native_authorize(bad_owner, prior=[first_path], verdict="REJECTED", observed=requested)
        self.assertEqual(requested, [["second-tenant-boundary"]])
        rejected = (set((o.receipt_path(self.root).parent / "publication").glob("*.json")) - before).pop()
        rejected_bytes = rejected.read_bytes()
        self.assertEqual(json.loads(rejected_bytes)["verdict"], "REJECTED")
        stale_owner = self.root / "Vault/tmp/stale-synthetic-authority.json"
        stale_owner.write_text('{"quote":"synthetic second effect old evidence"}')
        stale = Path(self.native_authorize(stale_owner, prior=[first_path])["path"])
        stale_bytes = stale.read_bytes()
        stale_owner.write_text('{"quote":"changed synthetic evidence invalidates old binding"}')
        correct_owner = self.root / "Vault/tmp/correct-synthetic-authority.json"
        correct_owner.write_text('{"quote":"synthetic second effect authority"}')
        second = self.native_authorize(correct_owner, prior=[first_path, rejected, stale], observed=requested)
        self.assertEqual(requested[-1], ["second-tenant-boundary"])
        second_path = Path(second["path"])
        publication.publish(self.root, "HEAD", self.ref, "main-promotion", pr="1",
                            authorization=[first_path, rejected, stale, second_path], execute=self.execute, refresh=False)
        self.assertEqual(self.commands[-1][:3], ["gh", "pr", "merge"])
        all_covered = self.native_authorize(correct_owner, prior=[first_path, rejected, stale, second_path])
        self.assertEqual(all_covered["requested_effect_ids"], [])
        self.assertEqual(first_path.read_bytes(), first_bytes)
        self.assertEqual(rejected.read_bytes(), rejected_bytes)
        self.assertEqual(stale.read_bytes(), stale_bytes)
        self.assertEqual(o.receipt_path(self.root).read_bytes(), original)
        self.assertEqual(publication.plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False), selected)

    def test_late_scoped_authority_preserves_original_technical_receipt_and_rejects_tampering(self):
        self.submit(True, authentication=True)
        original = o.receipt_path(self.root).read_bytes()
        owner = self.root / "Vault/tmp/direct-synthetic-owner.json"
        owner.write_text('{"direct_user_quote":"Approve the exact synthetic credential effect"}')
        original_plan = publication.plan

        def synthetic_native(root, prompt, prefix, **kwargs):
            selected = original_plan(root, "HEAD", self.ref, "main-promotion", refresh=False)
            result = {"verdict": "APPROVED", "review_status": "COMPLETE", "summary": "Synthetic scoped authority",
                      "plan_sha256": selected["plan_sha256"], "authorized_effect_ids": ["existing-credential-read"]}
            run = o._RUN.get()
            o._timed("authorization_reviewer_seconds", lambda: None)
            for name, value in {"result.json": result, "process.json": {"exit_code": 0},
                                "model.json": {"reviewer_role": "independent-oracle-approver"}}.items():
                o._atomic_write(run / name, o._pretty(value))
            o._atomic_write(run / "request.txt", prompt.encode())
            return result

        with patch.object(publication, "plan", side_effect=lambda *a, **kw: original_plan(*a, **dict(kw, refresh=False))), \
                patch.object(o, "_review_process", side_effect=synthetic_native):
            authorized = publication.authorize(self.root, "HEAD", self.ref, str(owner))
        record = Path(authorized["path"])
        publication.publish(self.root, "HEAD", self.ref, "main-promotion", pr="1", authorization=record,
                            execute=self.execute, refresh=False)
        self.assertEqual(o.receipt_path(self.root).read_bytes(), original)
        self.assertEqual(self.commands[-1][:3], ["gh", "pr", "merge"])
        original_authorization = record.read_bytes()
        for changed in ["candidate_tree", "destination", "protected_effects", "technical_receipt_sha256"]:
            with self.subTest(changed=changed):
                forged = json.loads(original_authorization)
                if changed == "destination":
                    forged["plan"][changed]["ref"] = "refs/heads/foreign-product"
                elif changed == "protected_effects":
                    forged["plan"][changed]["active"][0]["boundary"] = "broader authority"
                else:
                    forged["plan"][changed] = "0" * 64
                forged["authorization_sha256"] = o._sha(o._canonical({key: value for key, value in forged.items()
                                                                     if key != "authorization_sha256"}))
                record.write_bytes(o._pretty(forged))
                self.commands.clear()
                with self.assertRaisesRegex(o.OracleApprovalError, "stale, mismatched"):
                    publication.publish(self.root, "HEAD", self.ref, "main-promotion", pr="1", authorization=record,
                                        execute=self.execute, refresh=False)
                self.assertEqual(self.commands, [])
                self.assertEqual(o.receipt_path(self.root).read_bytes(), original)
        record.write_bytes(original_authorization)
        owner.write_text('{"direct_user_quote":"changed authority"}')
        self.commands.clear()
        with self.assertRaisesRegex(o.OracleApprovalError, "stale, mismatched"):
            publication.publish(self.root, "HEAD", self.ref, "main-promotion", pr="1", authorization=record,
                                execute=self.execute, refresh=False)
        self.assertEqual(self.commands, [])


if __name__ == "__main__":
    unittest.main()
