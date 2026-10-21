"""Behavioral shipment and exact-commit CI regressions in owned synthetic repos."""
from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

import oracle_review_series as fixtures
from tools import publication_admission as publication
from tools import publication_status as status
from tools import shipment_state as shipment

o = fixtures.o


class ShipmentWorkflow(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.ReviewSeries("runTest")
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root
        self.fixture.git("branch", "-M", "main")
        self.fixture.git("remote", "add", "origin", o.PUBLICATION_REMOTE)
        self.fixture.git("update-ref", "refs/remotes/origin/main", self.fixture.base)
        self.ref = "codex/release-v0.0.1"

    def commit(self, message="committed candidate"):
        self.fixture.git("commit", "-qm", message)
        return self.fixture.git("rev-parse", "HEAD")

    def validate(self):
        commit = self.commit()
        self.fixture.submit()
        shipment.record_validated(self.root)
        return commit

    def row(self, *, commit=None, tree=None):
        commit = commit or self.fixture.git("rev-parse", "HEAD")
        tree = tree or self.fixture.git("rev-parse", "HEAD^{tree}")
        return {"context": status.CONTEXT, "state": "success", "creator": {"login": status.PUBLISHER},
                "description": status._description(tree, "a" * 64), "target_url": status._target(commit)}

    def test_published_clean_candidate_performs_no_review_or_publication(self):
        self.fixture.git("reset", "--hard", self.fixture.base)
        self.assertEqual(shipment.selection(self.root)["state"], "NO_CHANGES")
        with patch.object(publication, "_source_receipt", side_effect=AssertionError("review must not run")), \
                patch.object(status, "publish_status", side_effect=AssertionError("status must not publish")):
            result = publication.publish(self.root, "HEAD", self.ref, "main-promotion",
                                         execute=lambda *a, **k: self.fail("external mutation"), refresh=False)
        self.assertEqual(result["state"], "NO_CHANGES")
        with patch.object(o, "repository_root", return_value=self.root), \
                patch.object(o, "issue", side_effect=AssertionError("model review")), redirect_stdout(io.StringIO()):
            self.assertEqual(o.main(["review"]), 0)

    def test_normal_hooks_commit_authored_work_without_approval_and_keep_vault_private(self):
        hooks = Path(__file__).resolve().parents[1] / ".githooks"
        self.fixture.git("config", "core.hooksPath", str(hooks))
        commit = self.commit("ordinary authored work")
        self.assertNotIn("Oracle-Verdict", self.fixture.git("show", "-s", "--format=%B", commit))
        private = self.root / "Vault/private.md"
        private.write_text("synthetic private maintainer document")
        self.fixture.git("add", "-f", "Vault/private.md")
        result = subprocess.run(["git", "commit", "-qm", "accidental private content"], cwd=self.root,
                                capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Vault/ is private", result.stderr)
        self.assertTrue(private.exists())

    def test_clean_unpublished_commit_is_selected_and_exact_success_is_checkpointed(self):
        commit = self.commit()
        self.assertEqual(shipment.selection(self.root)["state"], "VALIDATE")
        self.fixture.submit()
        checkpoint = shipment.record_validated(self.root)
        self.assertEqual(checkpoint["last_validated_commit"], commit)
        self.assertNotIn("last_released_commit", checkpoint)
        self.assertEqual(shipment.selection(self.root)["state"], "DELIVER")
        receipt, _ = publication._source_receipt(self.root, commit)
        self.assertEqual(receipt["candidate_tree"], self.fixture.git("rev-parse", "HEAD^{tree}"))
        with patch.object(o, "repository_root", return_value=self.root), \
                patch.object(o, "issue", side_effect=AssertionError("duplicate model review")), redirect_stdout(io.StringIO()):
            self.assertEqual(o.main(["review"]), 0)

    def test_new_commit_retains_series_and_unchanged_validation_but_not_approval(self):
        first = self.validate()
        before = shipment.checkpoint_path(self.root).read_bytes()
        directory = o._series_directory(self.root, first)
        self.fixture.change("peer.py", "repair only peer")
        second = self.commit("repair commit")
        self.assertEqual(o._series_directory(self.root, second), directory)
        self.assertEqual(shipment.selection(self.root)["state"], "VALIDATE")
        with self.assertRaises(o.OracleApprovalError):
            shipment.record_validated(self.root)
        self.assertEqual(shipment.checkpoint_path(self.root).read_bytes(), before)

        def current(context):
            self.assertIn("source.py", {item["path"] for item in context["reusable_coverage"]})
            self.assertTrue(context["current_validations"])
            self.assertEqual(context["changed_since_previous"], ["peer.py"])
            return self.fixture.result(context)
        self.fixture.submit(current)
        shipment.record_validated(self.root)
        self.assertEqual(shipment.selection(self.root)["last_validated_commit"], second)

    def test_changed_instructions_retain_observations_and_require_current_missing_coverage(self):
        self.validate()
        self.fixture.change("AGENTS.md", "synthetic governance with current changed criteria")
        self.fixture.change("new.py", "new unvalidated source")
        self.commit("current criteria and missing file")

        def incomplete(context):
            self.assertIn("new.py", context["required_coverage_paths"])
            self.assertTrue(context["invalidated_coverage"])
            old = next(item for item in context["invalidated_coverage"] if item["path"] == "source.py")
            self.assertTrue(all(context["input_hashes"][entry["path"]] == entry["digest"] for entry in old["inputs"]))
            self.assertIsNotNone(context["prior_native_assessment"])
            result = self.fixture.result(context, status="INCOMPLETE")
            result["coverage"] = [item for item in result["coverage"] if item["path"] != "new.py"]
            return result
        self.fixture.submit(incomplete, error=o.OracleReviewIncomplete)
        self.assertEqual(shipment.selection(self.root)["state"], "VALIDATE")
        with self.assertRaises(o.OracleApprovalError):
            shipment.record_validated(self.root)
        self.fixture.submit()
        shipment.record_validated(self.root)
        self.assertEqual(shipment.selection(self.root)["state"], "DELIVER")

    def test_missing_or_tampered_checkpoint_grants_no_publication(self):
        self.commit()
        with self.assertRaises(o.OracleApprovalError):
            publication._source_receipt(self.root, self.fixture.git("rev-parse", "HEAD"))
        shipment._save(self.root, {"last_validated_commit": self.fixture.git("rev-parse", "HEAD"),
                                  "technical_receipt_sha256": "0" * 64})
        self.assertEqual(shipment.selection(self.root)["state"], "VALIDATE")
        with self.assertRaises((o.OracleApprovalError, OSError)):
            publication._source_receipt(self.root, self.fixture.git("rev-parse", "HEAD"))

    def test_failed_delivery_preserves_validated_pending_candidate(self):
        self.validate()
        original = shipment.checkpoint_path(self.root).read_bytes()
        def fail(*args, **kwargs):
            raise subprocess.CalledProcessError(1, args[0])
        with self.assertRaises(subprocess.CalledProcessError):
            publication.publish(self.root, "HEAD", self.ref, "review-push", execute=fail, refresh=False)
        self.assertEqual(shipment.checkpoint_path(self.root).read_bytes(), original)
        self.assertEqual(shipment.selection(self.root)["state"], "DELIVER")

    def test_confirmed_delivery_advances_distinct_checkpoint_and_repeat_is_noop(self):
        commit = self.validate()
        commands = []
        def execute(command, **kwargs):
            commands.append(command)
            if command[:3] == ["gh", "pr", "view"]:
                row = ({"state": "MERGED", "headRefOid": commit, "mergeCommit": {"oid": "b" * 40}}
                       if command[-1] == "state,headRefOid,mergeCommit" else
                       {"headRefOid": commit, "baseRefOid": self.fixture.base, "headRefName": self.ref,
                        "baseRefName": "main", "mergeStateStatus": "CLEAN",
                        "statusCheckRollup": [{"conclusion": "SUCCESS"}]})
                return subprocess.CompletedProcess(command, 0, json.dumps(row), "")
            return subprocess.CompletedProcess(command, 0, "", "")
        publication.publish(self.root, "HEAD", self.ref, "main-promotion", pr="1", execute=execute, refresh=False)
        record = shipment._load(self.root)
        self.assertEqual(record["last_validated_commit"], commit)
        self.assertEqual(record["last_released_commit"], commit)
        self.assertEqual(sum(command[:3] == ["gh", "pr", "merge"] for command in commands), 1)
        self.fixture.git("update-ref", "refs/remotes/origin/main", commit)
        repeated = publication.publish(self.root, "HEAD", self.ref, "main-promotion", pr="1",
                                       execute=lambda *a, **k: self.fail("duplicate release"), refresh=False)
        self.assertEqual(repeated["state"], "NO_CHANGES")

    def test_status_producer_rechecks_native_receipt_before_external_write(self):
        self.validate()
        selected = publication.plan(self.root, "HEAD", self.ref, "review-push", refresh=False)
        observed = []
        row = self.row()
        row["description"] = status._description(selected["candidate_tree"], selected["technical_receipt_sha256"])
        def execute(command, **kwargs):
            observed.append(command)
            return subprocess.CompletedProcess(command, 0, json.dumps(row), "")
        status.publish_status(self.root, selected, execute=execute)
        self.assertIn("statuses/" + selected["candidate_commit"], " ".join(observed[0]))
        with self.assertRaises(o.OracleApprovalError):
            status.publish_status(self.root, dict(selected, technical_receipt_sha256="f" * 64), execute=execute)
        self.assertEqual(len(observed), 1)

    def test_public_status_rejects_wrong_issuer_tree_commit_failed_and_malformed_approval(self):
        self.commit()
        for field, value in [("creator", {"login": "untrusted"}), ("state", "failure"),
                             ("description", status._description("0" * 40, "a" * 64)),
                             ("description", "{\"approved\":true}"), ("target_url", status._target("0" * 40))]:
            with self.subTest(field=field, value=value):
                row = dict(self.row(), **{field: value})
                execute = lambda command, **kw: subprocess.CompletedProcess(command, 0, json.dumps([[row]]), "")
                with self.assertRaises(o.OracleApprovalError):
                    status.verify_publication(self.root, "HEAD", execute=execute, wait_seconds=0)

    def test_status_wait_covers_push_race_and_latest_trusted_failure_revokes_older_success(self):
        self.commit()
        attempts, waits = [], []
        def execute(command, **kwargs):
            attempts.append(command)
            return subprocess.CompletedProcess(command, 0, json.dumps([[]] if len(attempts) == 1 else [[self.row()]]), "")
        result = status.verify_publication(self.root, "HEAD", execute=execute, wait_seconds=3,
                                           monotonic=lambda: 0, sleep=waits.append)
        self.assertEqual(result["candidate_commit"], self.fixture.git("rev-parse", "HEAD"))
        self.assertEqual(waits, [2])
        execute = lambda command, **kw: subprocess.CompletedProcess(command, 0,
            json.dumps([[dict(self.row(), state="failure"), self.row()]]), "")
        with self.assertRaises(o.OracleApprovalError):
            status.verify_publication(self.root, "HEAD", execute=execute, wait_seconds=0)

    def test_ci_merge_requires_the_exact_approved_head_tree(self):
        head = self.commit()
        tree = self.fixture.git("rev-parse", "HEAD^{tree}")
        merge = self.fixture.git("commit-tree", tree, "-p", self.fixture.base, "-p", head, "-m", "synthetic merge")
        execute = lambda command, **kw: subprocess.CompletedProcess(command, 0, json.dumps([[self.row(commit=head, tree=tree)]]), "")
        status.verify_publication(self.root, merge, execute=execute, wait_seconds=0)
        changed = self.fixture.git("commit-tree", self.fixture.git("rev-parse", self.fixture.base + "^{tree}"),
                                   "-p", self.fixture.base, "-p", head, "-m", "changed merge tree")
        with self.assertRaises(o.OracleApprovalError):
            status.verify_publication(self.root, changed, execute=execute, wait_seconds=0)


if __name__ == "__main__":
    unittest.main()
