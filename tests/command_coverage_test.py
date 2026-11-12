"""Exact native applicability reuse, preserving original command outcomes."""
import copy
import json
import os
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

    def environments(self, values=None):
        values, identity = coverage._environment_set(values or [self.origin])
        rows = [(coverage.ENVIRONMENT_PREFIX + self.digest + "/" + self.required["id"],
                 "origins:" + str(len(values)) + " sha256:" + identity)]
        rows.extend((coverage.ENVIRONMENT_PREFIX + identity + "/" + o._sha(value.encode()), value) for value in values)
        return [{"context": context, "state": "success", "creator": {"login": coverage.public_status.PUBLISHER},
                 "description": summary, "target_url": coverage.public_status._target(self.commit)}
                for context, summary in rows]

    def test_current_changelist_reuses_original_environment_without_claiming_ci_execution(self):
        result = coverage._native_coverage([self.row(), *self.environments()], self.commit, self.tree, self.required)
        self.assertEqual(result, (self.digest, [self.origin]))

    def test_chat_author_and_shell_bookkeeping_preserve_functional_validation_environment(self):
        with patch.dict(os.environ, {"CODEX_THREAD_ID": "synthetic-chat-A", "PWD": "/synthetic/old", "SHLVL": "2", "GIT_AUTHOR_NAME": "A"}):
            original = o._environment_digest(), o._validation_environment()[1]
        with patch.dict(os.environ, {"CODEX_THREAD_ID": "synthetic-chat-B", "PWD": "/synthetic/new", "SHLVL": "9", "GIT_AUTHOR_NAME": "B"}):
            current = o._environment_digest(), o._validation_environment()[1]
        self.assertEqual(original, current)

    def test_wrong_issuer_source_and_latest_failure_cannot_reuse_prior_success(self):
        for rows in ([self.row(issuer="untrusted"), *self.environments()],
                     [self.row(tree="d" * 40), *self.environments()],
                     [self.row(state="failure"), self.row(), *self.environments()]):
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
            return subprocess.CompletedProcess(command, 0, "", "")
        with patch.object(coverage.public_status, "verify_publication", return_value={"candidate_commit": self.commit, "candidate_tree": self.tree}), \
                patch.object(coverage.public_status, "statuses_for", return_value=[self.row(), *self.environments()]), \
                patch.object(o, "_git", return_value=self.tree), \
                patch.object(coverage, "requirements", return_value=[self.required, second]):
            results = coverage.ci(self.root, self.commit, execute=execute)
        self.assertEqual([row["status"] for row in results], ["REUSED_NATIVE_APPLICABILITY", "PASSED_CURRENT_EXECUTION"])
        self.assertEqual(calls, [second["command"]])
        self.assertEqual(results[0]["original_environment"], self.origin)

    def test_six_command_contract_rejects_stale_foreign_and_missing_bindings_without_repair(self):
        commands = [["npm", "run", name] for name in ("build", "check", "check:privacy", "contract:check")]
        commands += [["npm", "test"], ["npm", "run", "check:publication"]]
        required = [{"id": o._sha(o._canonical(command)), "command": command} for command in commands]
        output = self.root / "original.stdout.log"
        output.write_text("Actual synthetic failed output")
        original = self.root / "original.json"
        original.write_bytes(o._pretty({"kind": "oracle-validation-record-v1", "exit_code": 1,
            "output_hashes": {str(output): o._sha(output.read_bytes())}}))
        original_bytes = original.read_bytes()
        context = {"required_commands": required, "guards": {"environment_digest": "e" * 64},
            "input_hashes": {"package.json": "git-sha1:100644:blob:" + "c" * 40,
                             "original.json": "sha256:" + o._sha(original_bytes)}}
        rows = [dict(item, status="COMPLETE", basis="INDEPENDENT_APPLICABILITY",
            inputs=[{"path": "package.json", "digest": context["input_hashes"]["package.json"]}],
            environment_digest=context["guards"]["environment_digest"], evidence_paths=["original.json"],
            reason="Synthetic applicability assertion; original exit remains 1") for item in required]
        self.assertEqual(coverage.validate_decisions(self.root, {"verdict": "APPROVED", "command_coverage": rows}, context), rows)
        for defect in ("missing_package", "duplicate_package", "stale_package", "unknown_command", "wrong_argv",
                       "duplicate_command", "missing_command", "wrong_environment", "unbound_output", "foreign_record"):
            bad = copy.deepcopy(rows)
            row = bad[0]
            if defect == "missing_package": row["inputs"] = []
            elif defect == "duplicate_package": row["inputs"].append(copy.deepcopy(row["inputs"][0]))
            elif defect == "stale_package": row["inputs"][0]["digest"] = "git-sha1:100644:blob:" + "d" * 40
            elif defect == "unknown_command": row["id"] = "f" * 64
            elif defect == "wrong_argv": row["command"] = ["npm", "run", "unrelated"]
            elif defect == "duplicate_command": bad[1] = copy.deepcopy(row)
            elif defect == "missing_command": bad.pop()
            elif defect == "wrong_environment": row["environment_digest"] = "f" * 64
            elif defect == "unbound_output": row["evidence_paths"] = [str(output)]
            elif defect == "foreign_record": row["evidence_paths"] = ["foreign.json"]
            before = copy.deepcopy(bad)
            with self.subTest(defect=defect), self.assertRaises((o.OracleApprovalError, o.OracleReviewIncomplete)):
                coverage.validate_decisions(self.root, {"verdict": "APPROVED", "command_coverage": bad}, context)
            self.assertEqual(bad, before, "Final admission must not repair an independent decision")
            self.assertEqual(original.read_bytes(), original_bytes)
        original.write_bytes(original_bytes + b" ")
        with self.assertRaisesRegex(o.OracleApprovalError, "observation changed"):
            coverage.validate_decisions(self.root, {"verdict": "APPROVED", "command_coverage": rows}, context)
        self.assertEqual(json.loads(original_bytes)["exit_code"], 1)
        self.assertFalse((self.root / ".git/oracle/approval.json").exists())

    def test_ci_merge_identity_resolves_approved_source_head_without_retesting(self):
        calls = []
        merge = "d" * 40
        def statuses(root, commit, **kwargs):
            calls.append(commit)
            return [self.row(), *self.environments()]
        approved = {"candidate_commit": self.commit, "candidate_tree": self.tree}
        with patch.object(coverage.public_status, "verify_publication", return_value=approved), \
                patch.object(coverage.public_status, "statuses_for", side_effect=statuses), \
                patch.object(o, "_git", return_value=self.tree), \
                patch.object(coverage, "requirements", return_value=[self.required]):
            self.assertEqual(coverage.ci(self.root, merge, execute=lambda *a, **k: self.fail("covered command reran"))[0]["status"],
                             "REUSED_NATIVE_APPLICABILITY")
        self.assertEqual(calls, [self.commit])
        attested = [dict({key: value for key, value in row.items() if key != "creator"}, issuer=coverage.public_status.ATTESTATION_ISSUER)
                    for row in [self.row(), *self.environments()]]
        self.assertEqual(coverage._native_coverage(attested, self.commit, self.tree, self.required), (self.digest, [self.origin]))
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
        git("remote", "add", "origin", o.PUBLICATION_REMOTE)
        git("config", "remote.origin.pushurl", publication.public_status.SSH_REMOTE)
        # The owned SSH destination resolves to the synthetic bare remote; no network.
        git("config", "url." + str(remote) + ".insteadOf", publication.public_status.SSH_REMOTE)
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
        lease = ["git", "push", "--force-with-lease=refs/heads/main:" + baseline, publication.public_status.SSH_REMOTE,
                 candidate + ":refs/heads/main"]
        self.assertEqual(json.loads(original)["command"], lease)
        def execute(command, **kwargs):
            calls.append(command)
            self.assertIn(command, [lease, ["git", "ls-remote", publication.public_status.SSH_REMOTE, "refs/heads/main"]])
            return subprocess.run(command, **dict({"capture_output": True, "text": True}, **kwargs))
        # This transport fixture supplies a prepared plan; native revocation is
        # exercised against real admitted decisions in shipment_workflow_test.
        with patch.object(publication.shipment, "publication_eligibility"):
            result = publication.publish_prepared(self.root, path, execute=execute)
        self.assertFalse(result["publication_sla_breached"])
        print(json.dumps({"real_git_publication_seconds": result["elapsed_seconds"],
                          "effective_hooks_path": str(hooks), "pre_push_exists": (hooks / "pre-push").exists()}))
        self.assertEqual(git("--git-dir", str(remote), "rev-parse", "main"), candidate)
        from tools import oracle_lifecycle
        with patch.object(publication.shipment, "publication_eligibility"), \
                patch.object(oracle_lifecycle, "_publish", side_effect=OSError("synthetic journal write failure")):
            confirmed = publication.publish_prepared(self.root, path, execute=execute)
        self.assertEqual(confirmed["state"], "PUBLISHED")
        self.assertEqual(confirmed["bookkeeping_error"]["stage"], "publication_attempt")
        self.assertEqual(git("--git-dir", str(remote), "rev-parse", "main"), candidate)
        moved = git("commit-tree", tree, "-p", candidate, "-m", "concurrent remote change")
        git("push", str(remote), moved + ":refs/heads/main")
        with patch.object(publication.shipment, "publication_eligibility"):
            with self.assertRaises(subprocess.CalledProcessError):
                publication.publish_prepared(self.root, path, execute=execute)
        self.assertEqual([command[1] for command in calls], ["push", "ls-remote", "push", "ls-remote", "push"])
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
        heads = {"refs/heads/main": "d" * 40, "refs/heads/" + selected["release_ref"]: self.commit}
        run = {"id": 123, "head_sha": self.commit, "head_branch": selected["release_ref"], "event": "push",
            "path": ".github/workflows/publication-safety.yml", "status": "completed", "conclusion": "success",
            "repository": {"full_name": coverage.public_status.REPOSITORY},
            "head_repository": {"full_name": coverage.public_status.REPOSITORY}}
        jobs = {"total_count": 1, "jobs": [{"name": "verify-public-repository", "status": "completed", "conclusion": "success"}]}
        return selected, heads, run, jobs

    def transport(self, heads, run, jobs, protected=True, calls=None):
        """git ls-remote over the owned SSH destination and unauthenticated public REST reads."""
        def execute(command, **kwargs):
            if calls is not None: calls.append(command)
            self.assertEqual(command[:3], ["git", "ls-remote", coverage.public_status.SSH_REMOTE])
            rows = "".join(heads[ref] + "\t" + ref + "\n" for ref in command[3:] if ref in heads)
            return subprocess.CompletedProcess(command, 0, rows, "")
        def read(path):
            if calls is not None: calls.append(path)
            if path == "/branches/main":
                return {"name": "main", "protected": protected}
            if path.startswith("/actions/runs?"):
                self.assertEqual(path, "/actions/runs?event=push&head_sha=" + self.commit + "&per_page=100")
                return {"total_count": len(run), "workflow_runs": [dict(item) for item in run]}
            self.assertEqual(path, "/actions/runs/123/jobs?filter=latest&per_page=100")
            return jobs
        return execute, read

    def admit(self, selected, execute, read, **kwargs):
        from tools import publication_admission as publication
        with patch.object(publication.public_status, "push_url", return_value=coverage.public_status.SSH_REMOTE):
            return publication._remote_admission(self.root, selected, execute=execute, read=read,
                                                 wait_seconds=0, pause=lambda seconds: None, monotonic=lambda: 0, **kwargs)

    def test_required_remote_admission_binds_exact_source_repository_and_real_actions_run(self):
        selected, heads, run, jobs = self.admission()
        execute, read = self.transport(heads, [run], jobs)
        admitted = self.admit(selected, execute, read)
        self.assertEqual(admitted["source_commit"], self.commit)
        self.assertEqual(admitted["run_ids"], [123])
        self.assertEqual(admitted["kind"], "boc-remote-validation-admission-v2")
        for field, wrong in (("head_sha", "e" * 40), ("head_branch", "another-branch"), ("event", "pull_request"),
                              ("path", "another-workflow.yml"),
                              ("head_repository", {"full_name": "another/repository"})):
            with self.subTest(field=field):
                execute, read = self.transport(heads, [dict(run, **{field: wrong})], jobs)
                with self.assertRaises(o.OracleReviewIncomplete):
                    self.admit(selected, execute, read)
        for label, value in (("job", {"total_count": 1, "jobs": [{"name": "verify-public-repository", "status": "completed",
                                                                  "conclusion": "failure"}]}),
                             ("incomplete", {"total_count": 2, "jobs": jobs["jobs"]})):
            with self.subTest(label=label):
                execute, read = self.transport(heads, [run], value)
                with self.assertRaises(o.OracleApprovalError):
                    self.admit(selected, execute, read)

    def test_failed_pending_and_absent_required_remote_checks_never_seal_readiness(self):
        for protected in (False, True):
            with self.subTest(protected=protected):
                selected, heads, run, jobs = self.admission()
                execute, read = self.transport(heads, [dict(run, conclusion="failure")], jobs, protected)
                with self.assertRaisesRegex(o.OracleApprovalError, "failed required check"):
                    self.admit(selected, execute, read)
                execute, read = self.transport(heads, [dict(run, status="in_progress", conclusion=None)], jobs, protected)
                with self.assertRaises(o.OracleReviewIncomplete):
                    self.admit(selected, execute, read)
                execute, read = self.transport(heads, [], jobs, protected)
                with self.assertRaises(o.OracleReviewIncomplete):
                    self.admit(selected, execute, read)
                # The latest exact-source run decides; an older success never admits a newer failure.
                execute, read = self.transport(heads, [run, dict(run, id=124, conclusion="failure")], jobs, protected)
                with self.assertRaisesRegex(o.OracleApprovalError, "failed required check"):
                    self.admit(selected, execute, read)

    def test_pending_admission_waits_on_injected_clock_then_admits(self):
        selected, heads, run, jobs = self.admission()
        observed, pauses, clock = [], [], [0]
        def read(path):
            if path.startswith("/actions/runs?"):
                observed.append(path)
                current = run if len(observed) > 1 else dict(run, status="queued", conclusion=None)
                return {"total_count": 1, "workflow_runs": [current]}
            return transport_read(path)
        execute, transport_read = self.transport(heads, [run], jobs)
        from tools import publication_admission as publication
        with patch.object(publication.public_status, "push_url", return_value=coverage.public_status.SSH_REMOTE):
            admitted = publication._remote_admission(self.root, selected, execute=execute, read=read, wait_seconds=10,
                                                     pause=pauses.append, monotonic=lambda: clock[0])
        self.assertEqual(admitted["run_ids"], [123])
        self.assertEqual(pauses, [2])
        self.assertEqual(len(observed), 2)

    def test_repository_required_ci_applies_to_unprotected_and_protected_branches(self):
        for protected in (False, True):
            with self.subTest(protected=protected):
                selected, heads, run, jobs = self.admission()
                calls = []
                execute, read = self.transport(heads, [run], jobs, protected, calls)
                admitted = self.admit(selected, execute, read)
                self.assertEqual(admitted["branch_protected"], protected)
                self.assertEqual(admitted["required_job"], "verify-public-repository")
                self.assertEqual(admitted["run_ids"], [123])
                self.assertEqual(len(calls), 4)
                self.assertNotIn("gh", {call[0] for call in calls if isinstance(call, list)})
                for ref, wrong in (("refs/heads/" + selected["release_ref"], "e" * 40), ("refs/heads/main", "e" * 40),
                                   ("refs/heads/" + selected["release_ref"], None)):
                    moved = dict(heads, **{ref: wrong}) if wrong else {key: value for key, value in heads.items() if key != ref}
                    execute, read = self.transport(moved, [run], jobs, protected)
                    with self.assertRaisesRegex(o.OracleApprovalError, "different release source"):
                        self.admit(selected, execute, read)

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
                "review": {"review_status": "COMPLETE", "command_coverage": [dict(self.required, status="COMPLETE")]}}
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

    def test_partial_support_invalidation_is_scoped_to_each_original_receipt(self):
        from tools import shipment_state as shipment
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        record = {"base_commit": self.commit, "candidate_tree": self.tree, "outcome": "APPROVED", "assessment_admitted": True,
                  "guards": {"environment_digest": "original"}, "review": {"review_status": "COMPLETE", "command_coverage": [
                      dict(self.required, status="COMPLETE", inputs=[], environment_digest="original", evidence_paths=["proof-A"])]}}
        path = self.root / "synthetic-round.json"
        for digest, proof in (("1" * 64, "proof-A"), ("2" * 64, "proof-B")):
            record["review"]["command_coverage"][0]["evidence_paths"] = [proof]
            shipment.observe_decision(self.root, record, path, technical_receipt_sha256=digest,
                                      publication_scope={}, validation_evidence={proof: digest})
        record.update(outcome="INCOMPLETE")
        record["review"].update(review_status="INCOMPLETE", validations=[{"status": "INVALIDATED", "evidence_path": "unrelated"}])
        shipment.observe_decision(self.root, record, path)
        for digest in ("1" * 64, "2" * 64):
            shipment.publication_eligibility(self.root, self.commit, self.tree, digest)
        record["review"]["validations"][0]["evidence_path"] = "proof-A"
        shipment.observe_decision(self.root, record, path)
        with self.assertRaises(o.OracleApprovalError):
            shipment.publication_eligibility(self.root, self.commit, self.tree, "1" * 64)
        shipment.publication_eligibility(self.root, self.commit, self.tree, "2" * 64)
        marker = shipment._decision_read(self.root, shipment._decision_directory(self.root, self.commit, self.tree))
        self.assertEqual(marker["outcome"], "INCOMPLETE")
        self.assertEqual(marker["valid_receipts"], ["2" * 64])

    def test_admitted_partial_complete_binding_or_criteria_change_revokes_support(self):
        from tools import shipment_state as shipment
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        for kind in ("inputs", "environment", "criteria", "raw-error", "empty"):
            with self.subTest(kind=kind):
                commit=o._sha(kind.encode())[:40]
                record={"base_commit": commit, "candidate_tree": self.tree, "outcome": "APPROVED", "assessment_admitted": True,
                        "guards": {"environment_digest": "original"}, "review": {"review_status": "COMPLETE", "command_coverage": [
                            dict(self.required, status="COMPLETE", inputs=[{'path':'changed','digest':'original'}],
                                 environment_digest="original", evidence_paths=["proof-A"])]}}
                path=self.root/'synthetic-round.json'
                shipment.observe_decision(self.root,record,path,technical_receipt_sha256="1"*64,publication_scope={})
                record['outcome']='INCOMPLETE';record['review']['review_status']='INCOMPLETE'
                if kind=='inputs':record['review']['command_coverage'][0]['inputs']=[{'path':'changed','digest':'new'}]
                if kind=='environment':record['review']['command_coverage'][0]['environment_digest']='changed'
                if kind=='criteria':record['guards']['environment_digest']='changed'
                if kind=='raw-error':
                    record.update(outcome='ERROR',assessment_admitted=False)
                    record['review']['command_coverage'][0]['environment_digest']='changed'
                shipment.observe_decision(self.root,record,path)
                if kind in {'inputs','environment','criteria'}:
                    with self.assertRaises(o.OracleApprovalError):shipment.publication_eligibility(self.root,commit,self.tree,"1"*64)
                else:shipment.publication_eligibility(self.root,commit,self.tree,"1"*64)

    def test_conceptual_proposal_survives_concurrent_commit_and_rejects_evidence_or_criteria_drift(self):
        def git(*args):
            return subprocess.check_output(["git", *args], cwd=self.root, text=True).strip()
        git("init", "-q"); git("config", "user.name", "Synthetic Reviewer"); git("config", "user.email", "fixture@example.invalid")
        (self.root / "AGENTS.md").write_text("Synthetic governing criterion")
        (self.root / "candidate.txt").write_text("original")
        git("add", "."); git("commit", "-qm", "base")
        original = git("rev-parse", "HEAD")
        evidence = self.root / "proof.json"
        evidence.write_text("original evidence")
        result = {"verdict": "APPROVED", "findings": [], "authentication_impact": "NONE", "owner_approval_status": "NOT_REQUIRED",
                  "api_version_assessment": {"impact": "NONE", "request_kind": "NOT_REQUIRED", "requested_change": None,
                  "request_quote": None, "request_evidence": None}}
        def author(*args):
            (self.root / "candidate.txt").write_text("concurrent implementation")
            git("add", "candidate.txt"); git("commit", "-qm", "concurrent authored work")
            return result
        with patch.object(o, "_review_settings_binding", return_value={"model": "synthetic", "reasoning_effort": None}):
            o.review_proposal(self.root, "Problem: replay; Cause: coupled phases; Recommended change: preserve scope", [str(evidence)], None, author)
            self.assertEqual(o.verify_proposal(self.root)["verdict"], "APPROVED")
            record = json.loads(o.proposal_path(self.root).read_bytes())
            self.assertEqual(record["base_commit"], original)
            self.assertEqual(record["source_observations"]["unadopted_delta_paths"], ["candidate.txt"])
            for target in (evidence, self.root / "AGENTS.md"):
                original_bytes = target.read_bytes()
                def drift(*args):
                    target.write_text("concretely changed")
                    return result
                with self.assertRaisesRegex(o.OracleApprovalError, "evidence or governing criteria changed"):
                    o.review_proposal(self.root, "Problem: replay; Cause: coupled phases; Recommended change: preserve scope", [str(evidence)], None, drift)
                target.write_bytes(original_bytes)

    def test_preparation_exports_complete_coverage_before_ci_gate_and_reuses_remote_admission(self):
        from tools import publication_admission as publication
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        selected, heads, run, jobs = self.admission()
        calls = []
        release = "refs/heads/" + selected["release_ref"]
        def execute(command, **kwargs):
            self.assertEqual(command[0], "git")
            if command[1] == "ls-remote":
                self.assertEqual(command[2:], [coverage.public_status.SSH_REMOTE, release])
                calls.append("release-read")
                return subprocess.CompletedProcess(command, 0, "", "")
            self.assertEqual(calls, ["command-coverage", "attestation", "release-read"])
            self.assertEqual(command, ["git", "push", "--force-with-lease=" + release + ":", coverage.public_status.SSH_REMOTE,
                                       self.commit + ":" + release])
            calls.append("release-update")
            return subprocess.CompletedProcess(command, 0, "", "")
        def command_export(*args, **kwargs):
            calls.append("command-coverage")
            return [("validation/native-command/x", "tree:" + self.tree + " coverage:" + "c" * 64)]
        def source_export(root, value, rows, **kwargs):
            self.assertEqual(calls, ["command-coverage"])
            self.assertEqual(rows, [("validation/native-command/x", "tree:" + self.tree + " coverage:" + "c" * 64)])
            calls.append("attestation")
        def push(root, url, commit, ref, expected, *, execute):
            execute(coverage.public_status.lease_command(url, commit, ref, expected), cwd=root, check=True)
        def admit(*args, **kwargs):
            self.assertEqual(calls, ["command-coverage", "attestation", "release-read", "release-update"])
            calls.append("remote-admission")
            return {"source_commit": self.commit, "run_ids": [123]}
        with patch.object(publication, "plan", return_value=selected), \
                patch.object(publication, "_check_authorization", wraps=publication._check_authorization) as authority, \
                patch.object(publication.public_status, "push_url", return_value=coverage.public_status.SSH_REMOTE), \
                patch.object(publication.public_status, "is_ancestor", return_value=True), \
                patch.object(publication.public_status, "push_ref", side_effect=push), \
                patch.object(coverage, "requirements", return_value=[self.required]), \
                patch.object(coverage, "attestation_rows", side_effect=command_export), \
                patch.object(publication.public_status, "publish_attestation", side_effect=source_export), \
                patch.object(publication, "_remote_admission", side_effect=admit):
            first = publication.prepare(self.root, self.commit, selected["release_ref"], "main-promotion", execute=execute)
            original = Path(first["prepared_file"]).stat().st_ino, Path(first["prepared_file"]).read_bytes()
            second = publication.prepare(self.root, self.commit, selected["release_ref"], "main-promotion", execute=execute)
        self.assertEqual(first, second)
        self.assertEqual(authority.call_count, 1)
        self.assertEqual(calls, ["command-coverage", "attestation", "release-read", "release-update", "remote-admission"])
        self.assertEqual(json.loads(original[1])["command"], coverage.public_status.lease_command(
            coverage.public_status.SSH_REMOTE, self.commit, "refs/heads/main", "d" * 40))
        self.assertEqual((Path(first["prepared_file"]).stat().st_ino, Path(first["prepared_file"]).read_bytes()), original)

    def test_public_transport_contains_only_opaque_hashes_source_and_runtime_metadata(self):
        from tools import shipment_state as shipment
        private = str(Path("/") / "Users" / "synthetic-owner" / "Vault" / "tmp" / "private-observation.json")
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
            "assessment_environment": {"platform": "Darwin", "python": "3.14.6", "node": "v22.11.0", "npm": "10.9.0"},
            "command_environments": [{"id": decision["id"], "observations": [{"evidence_path": private,
                "evidence_sha256": "e" * 64, "environment_digest": "private environment hash",
                "execution_environment": {"platform": "Linux", "node": "20"}}]}]}
        tracking = dict(payload, tracking_sha256=o._sha(o._canonical(payload)))
        path = self.root / "tracking.json"
        path.write_bytes(o._pretty(tracking))
        checkpoint = {"command_tracking": {"path": str(path), "sha256": o._sha(path.read_bytes())}}
        with patch.object(shipment, "_load", return_value=checkpoint), \
                patch.object(shipment, "validated_receipt", return_value=(receipt, receipt_raw)), \
                patch.object(coverage, "requirements", return_value=[self.required]):
            rows = coverage.attestation_rows(self.root, selected)
        self.assertEqual(len(rows), 3)
        public = json.dumps(rows)
        for protected in [private, "Vault", "synthetic-owner", "private observation", "private environment", "evidence_paths", "inputs"]:
            self.assertNotIn(protected, public)
        self.assertIn(self.tree, public)
        self.assertIn("origin:Linux python:unknown node:20", public)
        self.assertNotIn("Darwin", public)

    def test_original_mixed_environments_are_bound_per_command_and_missing_metadata_stays_unknown(self):
        from tools import shipment_state as shipment, oracle_lifecycle
        directory = self.root / ".git/oracle/series/synthetic"
        directory.mkdir(parents=True)
        log = self.root / "original-ci.log"; log.write_text("actual failed aggregate; unchanged cases passed")
        original = self.root / "original-ci.json"
        original.write_text(json.dumps({"kind": "external-ci-actual-observation-v1", "outcome": "FAILED",
            "environment": "GitHub ubuntu-latest / Node20; retained original execution",
            "log": str(log), "log_sha256": o._sha(log.read_bytes())}))
        repair = self.root / "repair.json"
        repair.write_text(json.dumps({"kind": "oracle-validation-record-v1", "command": ["python3", "repair.py"],
            "environment_digest": "original-Darwin-proof", "inputs": [], "output_hashes": {},
            "execution_environment": {"platform": "Darwin", "python": "3.14.6", "node": "22.11.0"}}))
        unknown = self.root / "legacy.json"
        unknown.write_text(json.dumps({"kind": "oracle-validation-record-v1", "environment_digest": "original-unknown-proof"}))
        row = dict(self.required, evidence_paths=[str(log), str(repair), str(unknown)],
                   status="COMPLETE", basis="INDEPENDENT_APPLICABILITY")
        context = self.root / "context.json"; context.write_text(json.dumps({"required_commands": [self.required]}))
        review = {"review_status": "COMPLETE", "command_coverage": [row]}
        round_path = directory / "round-00001.json"
        round_path.write_bytes(o._pretty({"candidate_tree": self.tree, "outcome": "APPROVED", "review": review,
            "context_file": str(context), "verified_validations": []}))
        evidence = {o._custody_name(self.root, path): o._sha(path.read_bytes()) for path in [log, original, repair, unknown, context, round_path]}
        receipt = {"candidate_tree": self.tree, "review_digest": o._sha(o._canonical(review)), "validation_evidence": evidence}
        original_bytes = original.read_bytes(); saved = {}
        assessment = {"platform": "Darwin", "python": "3.14.6", "node": "22.11.0", "npm": "10.9.0"}
        with patch.object(o, "_git", return_value=self.tree), \
                patch.object(o, "receipt_path", return_value=self.root / ".git/oracle/approval.json"), \
                patch.object(coverage, "environment_metadata", return_value=assessment), \
                patch.object(oracle_lifecycle, "_publish", side_effect=lambda _o, _root, _path, value: saved.update(value)):
            shipment.record_command_tracking(self.root, {}, receipt, o._pretty(receipt), self.commit)
        self.assertEqual(saved["assessment_environment"], assessment)
        observations = saved["command_environments"][0]["observations"]
        self.assertEqual({value["execution_environment"]["platform"] for value in observations}, {"Linux", "Darwin", "unknown"})
        self.assertEqual({value["environment_digest"] for value in observations}, {None, "original-Darwin-proof", "original-unknown-proof"})
        self.assertEqual(original.read_bytes(), original_bytes)
        self.assertEqual(json.loads(original_bytes)["outcome"], "FAILED")
        tracking = self.root / "tracking.json"; tracking.write_bytes(o._pretty(saved))
        checkpoint = {"command_tracking": {"path": str(tracking), "sha256": o._sha(tracking.read_bytes())}}
        selected = {"candidate_commit": self.commit, "candidate_tree": self.tree,
                    "technical_receipt_sha256": o._sha(o._pretty(receipt))}
        with patch.object(shipment, "_load", return_value=checkpoint), \
                patch.object(shipment, "validated_receipt", return_value=(receipt, o._pretty(receipt))), \
                patch.object(coverage, "requirements", return_value=[self.required]):
            rows = coverage.attestation_rows(self.root, selected)
        # The attestation reader marks exactly these rows with the git-attestation issuer.
        statuses = [{"context": context, "state": "success", "description": summary,
                     "target_url": coverage.public_status._target(self.commit),
                     "issuer": coverage.public_status.ATTESTATION_ISSUER} for context, summary in rows]
        expected = sorted(coverage._environment_description(value["execution_environment"]) for value in observations)
        self.assertEqual(coverage._native_coverage(statuses, self.commit, self.tree, self.required), (saved["tracking_sha256"], expected))

    def test_mixed_origin_transport_requires_complete_set_and_preserves_original_metadata(self):
        values = [self.origin, "origin:Linux python:unknown node:20", "origin:unknown python:unknown node:unknown"]
        rows = [self.row(), *self.environments(values)]
        self.assertEqual(coverage._native_coverage(rows, self.commit, self.tree, self.required), (self.digest, sorted(values)))
        for invalid in (rows[:-1], [rows[0], dict(rows[1], state="failure"), *rows[2:]],
                        [*rows[:2], dict(rows[2], state="failure"), *rows[2:]]):
            with self.subTest(invalid=invalid):
                self.assertIsNone(coverage._native_coverage(invalid, self.commit, self.tree, self.required)[0])


if __name__ == "__main__":
    unittest.main()
