"""Behavioral publication tests use only an owned synthetic Git repository."""
from pathlib import Path
import json
import subprocess
import unittest
import uuid
from datetime import datetime, timezone
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
        self.fixture.release_metadata("0.0.1")
        self.fixture.git("add", ".")
        self.ref = "codex/release-v0.0.1"
        self.commands = []
        self.host_sessions = self.root / "Vault/tmp/synthetic-host-sessions"
        patcher = patch.object(publication, "_host_sessions_root", return_value=self.host_sessions)
        patcher.start(); self.addCleanup(patcher.stop)

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
        if command[:3] == ["gh", "pr", "view"]:
            if command[-1] == "state,headRefOid,mergeCommit":
                return subprocess.CompletedProcess(command, 0, json.dumps({"state": "MERGED",
                    "headRefOid": self.fixture.git("rev-parse", "HEAD"),
                    "mergeCommit": {"oid": "a" * 40}}), "")
            value = {"headRefOid": self.fixture.git("rev-parse", "HEAD"), "baseRefOid": self.fixture.base,
                     "headRefName": self.ref, "baseRefName": "main", "mergeStateStatus": "CLEAN",
                     "statusCheckRollup": [{"conclusion": "SUCCESS"}]}
            return subprocess.CompletedProcess(command, 0, json.dumps(value), "")
        if command[:4] == ["gh", "api", "--method", "POST"]:
            selected = publication.plan(self.root, "HEAD", self.ref, "review-push", refresh=False)
            row = {"context": publication.public_status.CONTEXT, "state": "success",
                   "creator": {"login": publication.public_status.PUBLISHER},
                   "description": publication.public_status._description(selected["candidate_tree"], selected["technical_receipt_sha256"]),
                   "target_url": publication.public_status._target(selected["candidate_commit"])}
            return subprocess.CompletedProcess(command, 0, json.dumps(row), "")
        self.commands.append(command)
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

    def instruction(self, owner, effects=None, decision="Approved", mutate=None):
        selected = publication.plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False)
        plan = owner.with_suffix(".prepared.json"); plan.write_bytes(o._pretty(selected))
        review_plan = publication.plan(self.root, "HEAD", self.ref, "review-push", refresh=False)
        review = {"kind": "boc-prepared-git-publication-v1", "plan": review_plan,
                  "source_commit": selected["candidate_commit"], "source_tree": selected["candidate_tree"],
                  "remote_url": o.PUBLICATION_REMOTE, "target_ref": review_plan["destination"]["ref"], "expected_remote_commit": None,
                  "command": ["git", "push", o.PUBLICATION_REMOTE, selected["candidate_commit"] + ":" + review_plan["destination"]["ref"]],
                  "remote_admission": {"pr": 1, "source_commit": selected["candidate_commit"], "source_tree": selected["candidate_tree"]}}
        review["prepared_sha256"] = o._sha(o._canonical(review))
        review_path = o.receipt_path(self.root).parent / "publication-prepared" / (review["prepared_sha256"] + ".json")
        review_path.parent.mkdir(exist_ok=True)
        if not review_path.exists(): review_path.write_bytes(o._pretty(review))
        thread = str(uuid.uuid4()); call = "call_synthetic_" + uuid.uuid4().hex
        identities = effects or [row["id"] for row in selected["protected_effects"]["active"]]
        text = publication._instruction_question(self.root, selected, identities, 1)
        timestamp = datetime.fromtimestamp(max(plan.stat().st_mtime, review_path.stat().st_mtime) + 1, timezone.utc).isoformat()
        reply = "<send_user_message_question_reply>\n" + json.dumps([{
            "questionItemId": json.dumps(["request_user_input_async", call, 0]), "question": text, "answer": decision}]) + "\n</send_user_message_question_reply>"
        events = {
            "meta": {"type": "session_meta", "payload": {"id": thread, "source": "vscode", "originator": "Codex Desktop", "thread_source": "user"}},
            "question": {"type": "response_item", "ordinal": 1, "timestamp": timestamp, "payload": {
                "type": "function_call", "name": "request_user_input_async", "call_id": call,
                "arguments": json.dumps({"questions": [{"title": text, "options": ["Approved", "Hold publication"]}]})}},
            "acceptance": {"type": "response_item", "ordinal": 2, "payload": {"type": "function_call_output", "call_id": call, "output": '{"accepted":true}'}},
            "answer": {"type": "event_msg", "ordinal": 3, "payload": {"type": "item_completed", "thread_id": thread,
                "turn_id": "synthetic-turn", "item": {"type": "UserMessage", "id": "synthetic-user-message", "content": [{"type": "text", "text": reply}]}}}}
        if mutate:
            mutate(events)
        session = self.host_sessions / "2026/10/24" / ("rollout-synthetic-" + thread + ".jsonl")
        session.parent.mkdir(parents=True, exist_ok=True)
        ranges, raw = {}, b""
        for name, event in events.items():
            line = json.dumps(event).encode() + b"\n"
            ranges[name] = {"offset": len(raw), "length": len(line), "sha256": o._sha(line)}
            raw += line
        session.write_bytes(raw)
        value = {"kind": "boc-direct-publication-instruction-input-v1",
                 "prepared_plan": {"path": str(plan), "sha256": o._sha(plan.read_bytes())},
                 "prepared_review": {"path": str(review_path), "sha256": o._sha(review_path.read_bytes())},
                 "effect_ids": identities,
                 "host_message": {"session_file": str(session), "thread_id": thread, "question_call_id": call,
                     "question_index": 0, "question_text": text, "approved_answer": "Approved", "user_message_id": "synthetic-user-message",
                     "turn_id": "synthetic-turn", "records": ranges}}
        owner.write_bytes(o._pretty(value)); return value

    def native_authorize(self, owner, *, prior=None, verdict="APPROVED", observed=None, effect_ids=None):
        original_plan = publication.plan
        selected = original_plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False)
        covered, _ = publication._covered_authorizations(self.root, selected, prior)
        chosen = set(effect_ids) if effect_ids is not None else {row["id"] for row in selected["protected_effects"]["active"]}
        if observed is not None:
            observed.append(sorted(chosen - covered))
        if json.loads(owner.read_bytes()).get("kind") != "boc-direct-publication-instruction-input-v1":
            self.instruction(owner, effect_ids, "Approved" if verdict == "APPROVED" else "Hold publication")
        with patch.object(publication, "plan", side_effect=lambda *a, **kw: original_plan(*a, **dict(kw, refresh=False))), \
                patch.object(o, "_review_process", side_effect=AssertionError("Human instruction must never launch a model")):
            return publication.authorize(self.root, "HEAD", self.ref, str(owner), authorization=prior, effect_ids=effect_ids)

    def test_direct_instruction_rejects_delegated_derived_and_mismatched_native_records(self):
        self.submit(True, authentication=True)
        selected = publication.plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False)
        mutations = [lambda rows: rows["meta"]["payload"].update(thread_source="subagent"),
                     lambda rows: rows["answer"]["payload"]["item"].update(type="AgentMessage"),
                     lambda rows: rows["question"]["payload"].update(name="send_message_to_thread"),
                     lambda rows: rows["acceptance"]["payload"].update(output='{"accepted":false}'),
                     lambda rows: rows["answer"]["payload"].update(thread_id=str(uuid.uuid4()))]
        for number, mutate in enumerate(mutations):
            owner = self.root / f"Vault/tmp/derived-{number}.json"
            self.instruction(owner, mutate=mutate)
            with self.subTest(number=number), self.assertRaises(o.OracleApprovalError):
                publication._instruction_binding(self.root, selected, str(owner), ["existing-credential-read"])

    def test_direct_instruction_append_safe_custody_and_actual_main_preparation(self):
        self.submit(True, authentication=True)
        from tools import shipment_state
        self.fixture.submit(lambda context: dict(self.fixture.result(context), authentication_impact="AUTHENTICATION",
            owner_approval_status="MISSING", protected_effects={"active": [self.effect(context)], "dispositions": []}))
        shipment_state.record_validated(self.root)
        owner = self.root / "Vault/tmp/append-safe.json"; owner.write_text('{}')
        authorized = self.native_authorize(owner)
        self.assertEqual(authorized["kind"], "boc-direct-publication-authorization-v1")
        source = Path(json.loads(owner.read_bytes())["host_message"]["session_file"])
        with source.open("ab") as output:
            output.write(b'{"type":"event_msg","payload":{"type":"agent_message"}}\n')
        selected = publication.plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False)
        self.assertEqual(publication._authorization_effects(self.root, selected, Path(authorized["path"])), {"existing-credential-read"})
        prepared = publication.prepare(self.root, "HEAD", self.ref, "main-promotion", authorization=Path(authorized["path"]),
                                       pr="1", execute=self.execute, refresh=False)
        outcome = publication.publish_prepared(self.root, Path(prepared["prepared_file"]), execute=self.execute)
        self.assertEqual(outcome["state"], "PUBLISHED")
        self.assertEqual(self.commands[-1][0:2], ["git", "push"])
        actual_git = o._git
        def published_remote(root, *arguments):
            if arguments == ("ls-remote", o.PUBLICATION_REMOTE, "refs/heads/main"):
                return selected["candidate_commit"] + "\trefs/heads/main\n"
            return actual_git(root, *arguments)
        with patch.object(o, "_git", side_effect=published_remote):
            released = shipment_state.record_released(self.root, selected["candidate_commit"], selected["candidate_commit"],
                prepared=Path(prepared["prepared_file"]), publication_attempt=Path(outcome["attempt_file"]))
        self.assertEqual(released["last_released_commit"], selected["candidate_commit"])
        with source.open("r+b") as output:
            output.seek(0); output.write(b"X")
        with self.assertRaisesRegex(o.OracleApprovalError, "bytes changed"):
            publication._authorization_effects(self.root, selected, Path(authorized["path"]))

    def test_direct_instruction_rejects_target_effect_plan_and_link_changes(self):
        self.submit(True, authentication=True)
        owner = self.root / "Vault/tmp/scope-checked.json"
        value = self.instruction(owner)
        selected = publication.plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False)
        for field in ("destination", "protected_effects"):
            changed = json.loads(json.dumps(selected))
            if field == "destination":
                changed[field]["ref"] = "refs/heads/foreign"
            else:
                changed[field]["active"][0]["boundary"] = "broader boundary"
            with self.subTest(field=field), self.assertRaises(o.OracleApprovalError):
                publication._instruction_binding(self.root, changed, str(owner), ["existing-credential-read"])
        source = Path(value["host_message"]["session_file"]); saved = source.with_suffix(".original")
        source.rename(saved); source.symlink_to(saved)
        with self.assertRaisesRegex(o.OracleApprovalError, "linked route"):
            publication._instruction_binding(self.root, selected, str(owner), ["existing-credential-read"])
        source.unlink(); saved.rename(source)
        plan = Path(value["prepared_plan"]["path"]); plan.write_bytes(plan.read_bytes() + b" ")
        with self.assertRaisesRegex(o.OracleApprovalError, "plan changed"):
            publication._instruction_binding(self.root, selected, str(owner), ["existing-credential-read"])

    def test_prepared_publication_preserves_later_native_refusal(self):
        from tools import shipment_state
        self.submit(True, authentication=True)
        self.fixture.submit(lambda context: dict(self.fixture.result(context), authentication_impact="AUTHENTICATION",
            owner_approval_status="MISSING", protected_effects={"active": [self.effect(context)], "dispositions": []}))
        shipment_state.record_validated(self.root)
        owner = self.root / "Vault/tmp/prepared-refusal.json"; owner.write_text('{}')
        authorized = self.native_authorize(owner)
        authority = Path(authorized["path"])
        prepared = publication.prepare(self.root, "HEAD", self.ref, "main-promotion", authorization=authority,
                                       pr="1", execute=self.execute, refresh=False)
        again = publication.prepare(self.root, "HEAD", self.ref, "main-promotion", authorization=authority,
                                    pr="1", execute=self.execute, refresh=False)
        self.assertEqual(again["prepared_file"], prepared["prepared_file"])
        source = Path(json.loads(owner.read_bytes())["host_message"]["session_file"])
        answer = json.loads(source.read_bytes().splitlines()[-1])
        answer["payload"]["item"]["id"] = "later-native-refusal"
        content = answer["payload"]["item"]["content"][0]
        content["text"] = content["text"].replace('"answer": "Approved"', '"answer": "Hold publication"')
        with source.open("ab") as output: output.write(json.dumps(answer).encode() + b"\n")
        self.commands.clear()
        with self.assertRaisesRegex(o.OracleApprovalError, "superseded"):
            publication.prepare(self.root, "HEAD", self.ref, "main-promotion", authorization=authority,
                                pr="1", execute=self.execute, refresh=False)
        with self.assertRaisesRegex(o.OracleApprovalError, "superseded"):
            publication.publish_prepared(self.root, Path(prepared["prepared_file"]), execute=self.execute)
        self.assertEqual(self.commands, [])

    def test_direct_instruction_rejects_unrelated_genuine_question_and_later_refusal(self):
        self.submit(True, authentication=True)
        owner = self.root / "Vault/tmp/unrelated-question.json"
        def unrelated(rows):
            call = rows["question"]["payload"]
            arguments = json.loads(call["arguments"]); arguments["questions"][0]["title"] = "Approve unrelated action"
            call["arguments"] = json.dumps(arguments)
            content = rows["answer"]["payload"]["item"]["content"][0]
            start, end = content["text"].index("["), content["text"].rindex("]") + 1
            reply = json.loads(content["text"][start:end]); reply[0]["question"] = "Approve unrelated action"
            content["text"] = "<send_user_message_question_reply>" + json.dumps(reply) + "</send_user_message_question_reply>"
        value = self.instruction(owner, mutate=unrelated)
        value["host_message"]["question_text"] = "Approve unrelated action"; owner.write_bytes(o._pretty(value))
        selected = publication.plan(self.root, "HEAD", self.ref, "main-promotion", refresh=False)
        with self.assertRaisesRegex(o.OracleApprovalError, "different prepared PR"):
            publication._instruction_binding(self.root, selected, str(owner), ["existing-credential-read"])
        value = self.instruction(owner)
        source = Path(value["host_message"]["session_file"])
        rows = source.read_bytes().splitlines(); answer = json.loads(rows[-1])
        answer["payload"]["item"]["id"] = "later-native-user-message"
        content = answer["payload"]["item"]["content"][0]
        content["text"] = content["text"].replace('"answer": "Approved"', '"answer": "Hold publication"')
        with source.open("ab") as output: output.write(json.dumps(answer).encode() + b"\n")
        with self.assertRaisesRegex(o.OracleApprovalError, "superseded"):
            publication._instruction_binding(self.root, selected, str(owner), ["existing-credential-read"])

    def test_direct_instruction_refusal_retains_its_actual_denied_attempt(self):
        self.submit(True, authentication=True)
        owner = self.root / "Vault/tmp/actual-refusal.json"; owner.write_text('{}')
        with self.assertRaises(o.OracleCandidateRejected):
            self.native_authorize(owner, verdict="REJECTED")
        records = list((o.receipt_path(self.root).parent / "publication").glob("*.json"))
        self.assertEqual(len(records), 1)
        self.assertEqual(json.loads(records[0].read_bytes())["verdict"], "REJECTED")
        with self.assertRaisesRegex(o.OracleApprovalError, "requires scoped deployment authority"):
            publication.prepare(self.root, "HEAD", self.ref, "main-promotion", authorization=records,
                                pr="1", execute=self.execute, refresh=False)
        self.assertEqual(self.commands, [])

    def test_direct_instruction_preserves_reviewed_bookkeeping_advancement(self):
        self.submit(True, authentication=True)
        owner = self.root / "Vault/tmp/bookkeeping-authority.json"
        self.instruction(owner)
        self.fixture.change("tools/synthetic-maintenance.py", "# reviewed maintenance change\n")
        self.submit(True, authentication=True)
        authorized = self.native_authorize(owner)
        self.assertEqual(authorized["verdict"], "APPROVED")
        self.assertNotEqual(authorized["plan"]["plan_sha256"], authorized["instruction_binding"]["approved_plan_sha256"])

    def test_direct_instruction_rejects_changed_product_assets(self):
        self.submit(True, authentication=True)
        owner = self.root / "Vault/tmp/product-asset-authority.json"
        self.instruction(owner)
        self.fixture.change("clients/codex/plugins/bos/readme.txt", "new product behavior")
        self.submit(True, authentication=True)
        with self.assertRaisesRegex(o.OracleApprovalError, "product assets changed"):
            self.native_authorize(owner)

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
        with self.assertRaisesRegex(o.OracleApprovalError, "technical receipt digest changed|approval receipt ID is invalid"):
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
        authorized = self.native_authorize(owner)
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
