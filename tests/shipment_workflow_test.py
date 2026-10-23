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
        self.fixture.release_metadata("0.0.1")
        self.fixture.git("add", ".")
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

    def test_validated_status_consumes_original_success_without_replaying_validation(self):
        commit = self.validate()
        with patch.object(o, "_verify_receipt", side_effect=AssertionError("duplicate native proof replay")), \
                patch.object(o, "_validation_record", side_effect=AssertionError("duplicate command validation")):
            self.assertEqual(shipment.selection(self.root)["state"], "DELIVER")
            self.assertEqual(publication._source_receipt(self.root, commit)[0]["base_commit"], commit)

    def test_later_rejection_blocks_selection_and_preparation_without_proof_replay(self):
        commit = self.validate()
        checkpoint = shipment.checkpoint_path(self.root).read_bytes()
        self.fixture.submit(lambda c: self.fixture.result(c, findings=[self.fixture.finding(origin="MISSED")]),
                            error=o.OracleCandidateRejected)
        with patch.object(o, "_verify_receipt", side_effect=AssertionError("duplicate native proof replay")), \
                patch.object(o, "_validation_record", side_effect=AssertionError("duplicate command validation")):
            selected = shipment.selection(self.root)
            self.assertEqual(selected["state"], "VALIDATE")
            self.assertIn("latest native exact-candidate decision", selected["reason"])
            with self.assertRaisesRegex(o.OracleApprovalError, "latest native exact-candidate decision"):
                publication.prepare(self.root, commit, self.ref, "main-promotion", refresh=False)
        self.assertEqual(shipment.checkpoint_path(self.root).read_bytes(), checkpoint)

    def test_later_unfinished_execution_preserves_completed_candidate_and_preparation(self):
        commit = self.validate()
        prepared = publication.prepare(self.root, commit, self.ref, "main-promotion", refresh=False)
        checkpoint = shipment.checkpoint_path(self.root).read_bytes()
        decision = (shipment._decision_directory(self.root, commit, prepared["source_tree"]) / "current.json").read_bytes()
        for status in ("INCOMPLETE", "ERROR"):
            with self.subTest(status=status):
                self.fixture.submit(lambda c: self.fixture.result(c, status=status), error=o.OracleApprovalError)
                with patch.object(o, "_verify_receipt", side_effect=AssertionError("proof replay")), \
                        patch.object(o, "_read_rounds", side_effect=AssertionError("round history replay")), \
                        patch.object(o, "_publication_scope", side_effect=AssertionError("effective range replay")), \
                        patch.object(o, "verify_staged", side_effect=AssertionError("duplicate validation")), \
                        patch.object(shipment, "release_preparation", side_effect=AssertionError("duplicate release validation")):
                    self.assertEqual(shipment.selection(self.root)["state"], "DELIVER")
                    self.assertEqual(shipment.record_validated(self.root), shipment._load(self.root))
                    self.assertEqual(publication.prepare(self.root, commit, self.ref, "main-promotion", refresh=False), prepared)
                    commands = []
                    publication.publish_prepared(self.root, Path(prepared["prepared_file"]),
                        execute=lambda command, **kwargs: commands.append(command))
                    self.assertEqual(commands, [["git", "push", o.PUBLICATION_REMOTE, commit + ":refs/heads/main"]])
                self.assertEqual(shipment.checkpoint_path(self.root).read_bytes(), checkpoint)
                self.assertEqual((shipment._decision_directory(self.root, commit, prepared["source_tree"]) / "current.json").read_bytes(), decision)

    def test_concrete_validation_invalidation_revokes_same_candidate_readiness(self):
        commit = self.validate()
        prepared = publication.prepare(self.root, commit, self.ref, "main-promotion", refresh=False)
        path = o._series_directory(self.root, commit) / "round-9999.json"
        record = {"base_commit": commit, "candidate_tree": prepared["source_tree"], "outcome": "INCOMPLETE",
                  "review": {"review_status": "INCOMPLETE", "validations": [{"status": "INVALIDATED",
                  "evidence_path": "synthetic-original", "reason": "Declared dependency identity changed"}]}}
        shipment.observe_decision(self.root, record, path)
        with patch.object(o, "_read_rounds", side_effect=AssertionError("round history replay")):
            with self.assertRaisesRegex(o.OracleApprovalError, "explicitly invalidates"):
                publication.publish_prepared(self.root, Path(prepared["prepared_file"]),
                    execute=lambda *a, **k: self.fail("invalidated publication dispatched"))

    def test_validation_tracks_actual_changelists_and_original_command_evidence(self):
        first = self.commit("first pending changelist")
        self.fixture.change("peer.py", "second pending changelist")
        second = self.commit("second pending changelist")
        self.fixture.record_check()
        self.fixture.submit()
        checkpoint = shipment.record_validated(self.root)
        tracking = json.loads(Path(checkpoint["command_tracking"]["path"]).read_bytes())
        self.assertEqual([row["commit"] for row in tracking["changelists"]], [first, second])
        self.assertTrue(tracking["commands"])
        for row in tracking["commands"]:
            self.assertEqual(row["command_sha256"], o._sha(o._canonical(row["command"])))
            self.assertTrue(row["inputs_sha256"])
            self.assertTrue(row["environment_digest"])
            self.assertTrue(row["output_hashes"])
        path = Path(checkpoint["command_tracking"]["path"])
        identity = path.stat().st_ino, path.read_bytes()
        self.assertEqual(shipment.record_validated(self.root)["command_tracking"], checkpoint["command_tracking"])
        self.assertEqual((path.stat().st_ino, path.read_bytes()), identity)

    def test_existing_preparation_is_revoked_by_later_exact_candidate_decisions(self):
        commit = self.validate()
        prepared = publication.prepare(self.root, commit, self.ref, "main-promotion", refresh=False)
        path = Path(prepared["prepared_file"])
        original = path.stat().st_ino, path.read_bytes(), shipment.checkpoint_path(self.root).read_bytes()
        for status in ("REJECTED",):
            with self.subTest(status=status):
                if status == "REJECTED":
                    self.fixture.submit(lambda c: self.fixture.result(c, findings=[self.fixture.finding(origin="MISSED")]),
                                        error=o.OracleCandidateRejected)
                else:
                    self.fixture.submit(lambda c: self.fixture.result(c, status=status), error=o.OracleApprovalError)
                with patch.object(o, "_verify_receipt", side_effect=AssertionError("proof replay")), \
                        patch.object(o, "_validation_record", side_effect=AssertionError("command replay")):
                    with self.assertRaisesRegex(o.OracleApprovalError, "latest native exact-candidate decision"):
                        publication.publish_prepared(self.root, path,
                            execute=lambda *a, **k: self.fail("revoked Git publication dispatched"))
                self.assertEqual((path.stat().st_ino, path.read_bytes(), shipment.checkpoint_path(self.root).read_bytes()), original)

    def test_prepared_candidate_ignores_distinct_candidate_review_and_proposal(self):
        commit = self.validate()
        prepared = publication.prepare(self.root, commit, self.ref, "main-promotion", refresh=False)
        self.fixture.change("peer.py", "new distinct candidate")
        self.commit("independent later authorship")
        self.fixture.propose()
        self.fixture.submit(lambda c: self.fixture.result(c, status="INCOMPLETE"), error=o.OracleApprovalError)
        commands = []
        with patch.object(o, "_verify_receipt", side_effect=AssertionError("proof replay")):
            publication.publish_prepared(self.root, Path(prepared["prepared_file"]),
                execute=lambda command, **kwargs: commands.append(command))
        self.assertEqual(commands, [["git", "push", o.PUBLICATION_REMOTE, commit + ":refs/heads/main"]])

    def test_unadopted_execution_error_preserves_original_prepared_eligibility(self):
        commit = self.validate()
        prepared = publication.prepare(self.root, commit, self.ref, "main-promotion", refresh=False)
        checkpoint = shipment.checkpoint_path(self.root).read_bytes()
        def interrupted(context):
            raise RuntimeError("synthetic reviewer transport interrupted before a decision")
        self.fixture.submit(interrupted, error=RuntimeError)
        self.assertEqual(shipment.selection(self.root)["state"], "DELIVER")
        self.assertEqual(shipment.checkpoint_path(self.root).read_bytes(), checkpoint)
        commands = []
        publication.publish_prepared(self.root, Path(prepared["prepared_file"]),
                                     execute=lambda command, **kwargs: commands.append(command))
        self.assertEqual(commands, [["git", "push", o.PUBLICATION_REMOTE, commit + ":refs/heads/main"]])

    def test_equivalent_native_approval_preserves_a_prepared_receipt_identity(self):
        commit = self.validate()
        prepared = publication.prepare(self.root, commit, self.ref, "main-promotion", refresh=False)
        self.fixture.submit()
        commands = []
        with patch.object(o, "_read_rounds", side_effect=AssertionError("approval bookkeeping repeats proof")):
            publication.publish_prepared(self.root, Path(prepared["prepared_file"]),
                                        execute=lambda command, **kwargs: commands.append(command))
        self.assertEqual(commands, [["git", "push", o.PUBLICATION_REMOTE, commit + ":refs/heads/main"]])

    def test_native_validation_capture_rejects_dirty_declared_execution_inputs(self):
        self.commit()
        (self.root / "source.py").write_text("dirty bytes must not attest older index tree")
        with self.assertRaisesRegex(o.OracleApprovalError, "Stage the selected validation inputs"):
            o.record_validation(self.root, ["python3", "-c", "raise AssertionError('must not execute')"],
                                ["source.py"], self.root / "Vault/tmp/dirty-capture.json")
        self.assertFalse((self.root / "Vault/tmp/dirty-capture.json").exists())

    def test_command_tracking_exclusive_publication_preserves_a_race_winner(self):
        commit = self.validate()
        checkpoint = shipment._load(self.root)
        path = Path(checkpoint["command_tracking"]["path"])
        original = path.read_bytes()
        receipt, raw = shipment.validated_receipt(self.root)
        atomic_write = o._atomic_write
        for competing in (original, b"conflicting immutable command evidence"):
            with self.subTest(identical=competing == original):
                path.unlink()
                identity = []
                def race(temporary, value):
                    atomic_write(temporary, value)
                    if temporary.parent == path.parent and temporary.name.startswith(".publish-"):
                        path.write_bytes(competing)
                        identity.append(path.stat().st_ino)
                with patch.object(o, "_atomic_write", side_effect=race):
                    if competing == original:
                        o._metadata_owner(shipment.record_command_tracking)(self.root, {}, receipt, raw, commit)
                    else:
                        with self.assertRaisesRegex(o.OracleApprovalError, "Immutable controller record changed"):
                            o._metadata_owner(shipment.record_command_tracking)(self.root, {}, receipt, raw, commit)
                self.assertEqual((path.stat().st_ino, path.read_bytes()), (identity[0], competing))

    def test_prepared_publication_runs_git_only_while_authors_continue(self):
        commit = self.validate()
        prepared = publication.prepare(self.root, commit, self.ref, "main-promotion", refresh=False)
        self.fixture.change("peer.py", "concurrent uncommitted authored work")
        commands = []
        def execute(command, **kwargs):
            commands.append(command)
            self.assertNotIn("timeout", kwargs)
            return subprocess.CompletedProcess(command, 0, "", "")
        with patch.object(publication, "plan", side_effect=AssertionError("publication repeats preparation")), \
                patch.object(o, "_verify_receipt", side_effect=AssertionError("publication repeats validation")), \
                patch.object(o, "_read_rounds", side_effect=AssertionError("publication replays decision history")), \
                patch.object(o, "_technical_archive", side_effect=AssertionError("publication reopens validation receipt")), \
                patch.object(shipment, "selection", side_effect=AssertionError("publication inspects new authors")):
            result = publication.publish_prepared(self.root, Path(prepared["prepared_file"]), execute=execute)
        self.assertEqual(commands, [["git", "push", o.PUBLICATION_REMOTE, commit + ":refs/heads/main"]])
        self.assertEqual(result["state"], "PUBLISHED")
        self.assertEqual((self.root / "peer.py").read_text(), "concurrent uncommitted authored work")

    def test_git_publication_failure_preserves_prepared_result_and_has_no_fallback(self):
        commit = self.validate()
        prepared = publication.prepare(self.root, commit, self.ref, "main-promotion", refresh=False)
        path = Path(prepared["prepared_file"])
        original = path.read_bytes()
        commands = []
        def reject(command, **kwargs):
            commands.append(command)
            raise subprocess.CalledProcessError(1, command, stderr="protected branch or non-fast-forward")
        with self.assertRaises(subprocess.CalledProcessError) as caught:
            publication.publish_prepared(self.root, path, execute=reject)
        self.assertEqual(len(commands), 1)
        self.assertEqual(path.read_bytes(), original)
        result = caught.exception.publication_result
        self.assertEqual(result["state"], "FAILED")
        self.assertEqual(result["returncode"], 1)
        self.assertGreaterEqual(result["elapsed_seconds"], 0)
        retained = json.loads(Path(result["attempt_file"]).read_bytes())
        self.assertEqual(retained, {key: value for key, value in result.items() if key != "attempt_file"})

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

    def test_identical_proposal_refresh_retains_series_findings_and_original_provenance(self):
        first = self.commit()
        self.fixture.submit(lambda c: self.fixture.result(c, findings=[self.fixture.finding()]),
                            error=o.OracleCandidateRejected)
        directory = o._series_directory(self.root, first)
        old_proposal = o.proposal_path(self.root).read_bytes()
        self.fixture.change("peer.py", "peer repair leaves source finding unresolved")
        second = self.commit("repair before proposal refresh")
        self.fixture.propose()
        self.assertEqual(o._series_directory(self.root, second), directory)
        rejected = {"verdict": "REJECTED", "findings": [], "authentication_impact": "NONE",
                    "owner_approval_status": "NOT_REQUIRED", "api_version_assessment": self.fixture.assessment()}
        o.review_proposal(self.root, "synthetic rejected refresh", [], None, lambda *args: rejected)
        self.fixture.propose()
        self.assertEqual(o._series_directory(self.root, second), directory)
        self.assertEqual((o.receipt_path(self.root).parent / "proposals" / (o._sha(old_proposal) + ".json")).read_bytes(), old_proposal)
        self.fixture.submit(error=o.OracleApprovalError)
        self.assertIn("F001", self.fixture.contexts[-1]["prior_findings"])

    def test_trailer_free_approved_effect_survives_ordinary_commit(self):
        self.commit()
        def protected(context):
            result = self.fixture.result(context)
            result["protected_effects"]["active"] = [{"id": "synthetic-credential-boundary", "kind": "credential-trust",
                "boundary": "synthetic boundary", "description": "Changed credential selection", "paths": ["source.py"],
                "inputs": self.fixture.inputs(context, "source.py")}]
            return result
        first = self.fixture.submit(protected)
        shipment.record_validated(self.root)
        self.fixture.change("peer.py", "ordinary peer repair")
        self.commit()
        self.fixture.submit(error=o.OracleApprovalError)
        self.assertEqual(self.fixture.contexts[-1]["publication_scope"]["prior_effects"][0]["origin"], o._sha(o._pretty(first)))
        self.fixture.change("source.py", "base")
        self.commit("revert protected source")
        def reverted(context):
            result = self.fixture.result(context)
            result["protected_effects"]["dispositions"] = [{"origin": o._sha(o._pretty(first)),
                "id": "synthetic-credential-boundary", "status": "REVERTED",
                "reason": "Current independently inspected source equals the published baseline",
                "inputs": self.fixture.inputs(context, "source.py", "@publication/scope")}]
            return result
        self.fixture.submit(reverted)
        shipment.record_validated(self.root)
        self.assertFalse(publication.plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False)["human_authority_required"])

    def test_source_only_approval_requires_release_preparation_and_lower_or_inconsistent_is_rejected(self):
        self.fixture.release_metadata("0.0.0")
        self.fixture.git("add", ".")
        self.commit()
        self.fixture.submit()
        shipment.record_validated(self.root)
        self.assertEqual(shipment.selection(self.root)["state"], "PREPARE")
        self.fixture.release_metadata("0.0.1")
        self.fixture.change("clients/codex/plugins/bos/.bos-product.json", json.dumps({"name": "bos", "version": "0.0.0", "client": "codex"}))
        self.fixture.git("add", ".")
        self.commit()
        self.assertEqual(shipment.selection(self.root)["state"], "PREPARE")
        self.fixture.release_metadata("0.0.1")
        self.fixture.git("add", ".")
        baseline = self.commit("new published release identity")
        self.fixture.git("update-ref", "refs/remotes/origin/main", baseline)
        self.fixture.release_metadata("0.0.0")
        self.fixture.git("add", ".")
        self.commit("invalid lower version")
        selected = shipment.selection(self.root)
        self.assertEqual(selected["state"], "PREPARE")
        self.assertIn("greater", selected["reason"])

    def test_committed_candidate_without_published_baseline_reaches_complete_technical_range(self):
        self.commit()
        self.fixture.git("update-ref", "-d", "refs/remotes/origin/main")
        self.fixture.submit()
        shipment.record_validated(self.root)
        self.assertIn("source.py", self.fixture.contexts[-1]["required_coverage_paths"])
        self.assertIn("peer.py", self.fixture.contexts[-1]["required_coverage_paths"])
        with self.assertRaisesRegex(o.OracleApprovalError, "baseline UNAVAILABLE"):
            publication.plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False)

    def test_trailer_free_verification_accepts_native_commit_and_exact_merge_but_rejects_changed_tree(self):
        commit = self.validate()
        o.verify_commit(self.root, commit)
        tree = self.fixture.git("rev-parse", commit + "^{tree}")
        merged = self.fixture.git("commit-tree", tree, "-p", self.fixture.base, "-p", commit, "-m", "synthetic merge")
        o.verify_commit(self.root, merged)
        changed = self.fixture.git("commit-tree", self.fixture.git("rev-parse", self.fixture.base + "^{tree}"),
                                    "-p", self.fixture.base, "-p", commit, "-m", "changed merge")
        with self.assertRaisesRegex(o.OracleApprovalError, "tree differs"):
            o.verify_commit(self.root, changed)

    def test_marketplace_export_reads_both_products_from_trailer_free_published_commit(self):
        owner = Path(__file__).resolve().parents[1]
        for name in ("scripts/build-marketplace-update.mjs", "scripts/lib/deterministic-zip.mjs"):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes((owner / name).read_bytes())
        for product in ("bos", "education-center"):
            path = self.root / f"clients/codex/plugins/{product}/.bos-product.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"name": product, "version": "0.0.1", "client": "codex"}))
            path = self.root / f"clients/codex/plugins/{product}/.codex-plugin/plugin.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"name": product, "version": "0.0.1"}))
        self.fixture.git("add", ".")
        commit = self.validate()
        self.fixture.git("update-ref", "refs/remotes/origin/main", commit)
        result = subprocess.run(["node", "--input-type=module", "-e",
            "import {readPublishedProductEntries} from './scripts/build-marketplace-update.mjs';"
            "for(const product of ['bos','education-center']) {"
            "const entries=readPublishedProductEntries(process.argv[1],product);"
            "if(!entries.some(entry=>entry.path==='.codex-plugin/plugin.json')) throw Error(product);"
            "console.log(product);}", commit], cwd=self.root, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ["bos", "education-center"])
        self.fixture.git("update-ref", "refs/remotes/origin/main", self.fixture.base)
        self.fixture.submit(lambda c: self.fixture.result(c, findings=[self.fixture.finding(origin="MISSED")]),
                            error=o.OracleCandidateRejected)
        self.fixture.git("update-ref", "refs/remotes/origin/main", commit)
        result = subprocess.run(["node", "--input-type=module", "-e",
            "import {readPublishedProductEntries} from './scripts/build-marketplace-update.mjs';"
            "for(const product of ['bos','education-center']) {"
            "try {readPublishedProductEntries(process.argv[1],product);throw Error('rejected commit exported');}"
            "catch(error) {if(!String(error.stderr).includes('known later native exact-candidate failure')) throw error;}"
            "console.log(product);}", commit], cwd=self.root, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.splitlines(), ["bos", "education-center"])

    def test_missing_native_receipt_retains_known_protected_effect_history(self):
        self.commit()
        def protected(context):
            result = self.fixture.result(context)
            result["protected_effects"]["active"] = [{"id": "retained-native-effect", "kind": "tenant-isolation",
                "boundary": "synthetic tenant boundary", "description": "Changed tenant selection", "paths": ["source.py"],
                "inputs": self.fixture.inputs(context, "source.py")}]
            return result
        receipt = self.fixture.submit(protected)
        origin = o._sha(o._pretty(receipt))
        o._technical_archive(self.root, origin).unlink()
        self.fixture.change("peer.py", "ordinary peer correction")
        self.commit()
        self.fixture.submit(error=o.OracleApprovalError)
        scope = self.fixture.contexts[-1]["publication_scope"]
        self.assertEqual(scope["prior_effects"][0]["origin"], origin)
        self.assertEqual(scope["history_limitations"][0]["receipt_sha256"], origin)

    def test_native_verification_does_not_revive_an_exact_candidate_after_failure(self):
        commit = self.validate()
        self.fixture.submit(lambda c: self.fixture.result(c, findings=[self.fixture.finding(origin="MISSED")]),
                            error=o.OracleCandidateRejected)
        tree = self.fixture.git("rev-parse", commit + "^{tree}")
        merged = self.fixture.git("commit-tree", tree, "-p", self.fixture.base, "-p", commit, "-m", "published exact merge")
        self.fixture.git("update-ref", "refs/remotes/origin/main", merged)
        with patch.object(status, "verify_publication", side_effect=AssertionError("Known rejection must not fall back")):
            for candidate in (commit, merged):
                with self.assertRaisesRegex(o.OracleApprovalError, "known later native exact-candidate failure"):
                    o.verify_commit(self.root, candidate)

    def test_published_status_recovery_requires_genuinely_absent_native_history(self):
        commit = self.commit()
        self.fixture.git("update-ref", "refs/remotes/origin/main", commit)
        with patch.object(status, "verify_publication", return_value={"candidate_commit": commit}) as verify:
            o.verify_commit(self.root, commit)
            verify.assert_called_once_with(self.root, commit, wait_seconds=0)

    def test_corrupt_lifecycle_origin_refuses_series_reset_and_preserves_history(self):
        commit = self.validate()
        directory = o._series_directory(self.root, commit)
        rounds = {path.name: path.read_bytes() for path in directory.glob("round-*.json")}
        origin = o.receipt_path(self.root).parent / "lifecycle-origin.json"
        raw = origin.read_bytes()
        origin.write_bytes(raw + b" ")
        with self.assertRaisesRegex(o.OracleApprovalError, "lifecycle origin custody"):
            o._series_directory(self.root, commit)
        self.assertEqual(rounds, {path.name: path.read_bytes() for path in directory.glob("round-*.json")})
        origin.write_bytes(raw)
        self.assertEqual(o._series_directory(self.root, commit), directory)

    def test_unrelated_proposal_refresh_preserves_approved_archived_scope(self):
        commit = self.validate()
        checkpoint = shipment.checkpoint_path(self.root).read_bytes()
        self.fixture.propose()
        self.assertEqual(shipment.selection(self.root)["state"], "DELIVER")
        result = {"verdict": "APPROVED", "findings": [], "authentication_impact": "NONE",
                  "owner_approval_status": "NOT_REQUIRED", "api_version_assessment": self.fixture.assessment()}
        o.review_proposal(self.root, "Problem: changed requirement; Cause: changed criterion; Recommended change: assess it",
                          [], None, lambda *args: result)
        self.assertEqual(shipment.selection(self.root)["state"], "DELIVER")
        self.assertEqual(shipment.checkpoint_path(self.root).read_bytes(), checkpoint)
        receipt, _ = publication._source_receipt(self.root, commit)
        self.assertEqual(receipt["base_commit"], commit)

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
