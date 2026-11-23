"""Deterministic history-integrity refusal: recorded commits must stay candidate ancestry."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import oracle_approval as o
from tools import publication_admission as publication
from tools import oracle_spec_seal as spec_seal
from tools import validation_contract as vc

REFUSAL = "History integrity refusal"
REPOSITORY = Path(__file__).resolve().parents[1]


class HistoryIntegrity(unittest.TestCase):
    """Each recorded commit kind is refused once it leaves the candidate history."""

    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name).resolve()
        self.git("init", "-q")
        self.git("config", "user.name", "Synthetic Historian")
        self.git("config", "user.email", "history@example.invalid")
        self.write("source.txt", "base\n")
        self.git("add", ".")
        self.git("commit", "-qm", "base")
        self.base = self.git("rev-parse", "HEAD")
        self.write("source.txt", "candidate\n")
        self.git("commit", "-qam", "candidate")
        self.head = self.git("rev-parse", "HEAD")
        # A recorded commit that a rewrite left outside the current history:
        # it exists as an object but no candidate commit descends from it.
        self.orphan = self.git("commit-tree", self.base + "^{tree}", "-p", self.base, "-m", "rewritten away")
        self.oracle = Path(self.git("rev-parse", "--absolute-git-dir")) / "oracle"
        self.oracle.mkdir()

    def git(self, *arguments):
        return subprocess.check_output(["git", *arguments], cwd=self.root, text=True).strip()

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)

    def record(self, name, value):
        path = self.oracle / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))
        return path

    def commit_spec(self, **values):
        spec = {"schema": vc.SCHEMA, "base_commit": self.base, "stamp": {"origin_main": self.base},
                "contract_sha256": "c" * 64, "selection": {"revision_of": None}}
        spec.update(values)
        self.write(vc.SELECTION, json.dumps(spec))
        self.git("add", vc.SELECTION)
        self.git("commit", "-qm", "sealed spec")
        self.head = self.git("rev-parse", "HEAD")
        return spec

    def archive(self, base):
        """An authentic APPROVED native proposal archive sealing a prior contract at `base`."""
        proposal = "Problem\nCause\nRecommended change"
        stamp = {"origin_main": base, "proposal_sha256": o._sha(proposal.encode())}
        prior = {"schema": vc.SCHEMA, "kind": spec_seal.KIND, "base_commit": base, "stamp": stamp,
                 "selection": {"revision_of": None}}
        prior["contract_sha256"] = vc.digest({k: v for k, v in prior.items() if k not in ("contract_sha256", "seal")})
        prior["seal"] = spec_seal.compute_seal(prior)
        record = {"schema_version": o.SCHEMA_VERSION, "issuer": o.ISSUER, "kind": "proposal-review",
                  "review_scope": "CONCEPTUAL_PROPOSAL", "base_commit": base, "lifecycle_origin": base,
                  "proposal": proposal, "proposal_sha256": stamp["proposal_sha256"], "validation_contract": prior,
                  "review": {"verdict": "APPROVED", "review_status": "COMPLETE", "findings": []}}
        record["proposal_review_id"] = o._sha(o._canonical(record))
        raw = o._pretty(record)
        path = self.oracle / "proposals" / (o._sha(raw) + ".json")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        return prior["contract_sha256"]

    def refused(self, call, commit=None):
        with self.assertRaises(Exception) as caught:
            call()
        self.assertIn(REFUSAL, str(caught.exception))
        self.assertIn(commit or self.orphan, str(caught.exception))
        return caught.exception

    def require(self, **options):
        return vc.require_history(self.root, "HEAD", **options)

    def test_intact_history_passes_with_every_record_kind(self):
        self.commit_spec()
        self.record("proposal.json", {"base_commit": self.base, "lifecycle_origin": self.base})
        self.record("lifecycle-origin.json", {"origin": self.base})
        self.record("approval.json", {"base_commit": self.head})
        (self.oracle / "validation-contract-results" / ("c" * 64) / self.head).mkdir(parents=True)
        series = self.oracle / "series" / "current"
        self.record("series/current/round-0001.json", {"base_commit": self.base})
        self.git("update-ref", "refs/remotes/origin/main", self.base)
        result = self.require(series=series)
        self.assertEqual(result["candidate"], self.head)
        self.assertGreaterEqual(result["checked"], 3)

    def test_sealed_spec_base_commit_outside_history_is_refused(self):
        self.commit_spec(base_commit=self.orphan)
        self.refused(self.require)

    def test_sealed_spec_origin_main_stamp_outside_history_is_refused(self):
        self.commit_spec(stamp={"origin_main": self.orphan})
        self.refused(self.require)

    def test_prior_revision_chain_commit_outside_history_is_refused(self):
        self.commit_spec(selection={"revision_of": self.archive(self.orphan)})
        self.refused(self.require)

    def test_intact_prior_revision_chain_is_admitted(self):
        self.commit_spec(selection={"revision_of": self.archive(self.base)})
        self.assertGreaterEqual(self.require()["checked"], 2)

    def test_proposal_lifecycle_and_approval_records_outside_history_are_refused(self):
        for name, value in [("proposal.json", {"base_commit": self.orphan}),
                            ("proposal.json", {"base_commit": self.base, "lifecycle_origin": self.orphan}),
                            ("lifecycle-origin.json", {"origin": self.orphan}),
                            ("approval.json", {"base_commit": self.orphan})]:
            with self.subTest(record=name, value=value):
                path = self.record(name, value)
                self.refused(self.require)
                path.unlink()
        self.require()

    def test_recorded_validation_commit_outside_history_is_refused(self):
        spec = self.commit_spec()
        (self.oracle / "validation-contract-results" / spec["contract_sha256"] / self.orphan).mkdir(parents=True)
        self.refused(self.require)

    def test_review_series_round_outside_history_is_refused(self):
        self.record("series/current/round-0001.json", {"base_commit": self.base})
        self.record("series/current/round-0002.json", {"base_commit": self.orphan})
        self.refused(lambda: self.require(series=self.oracle / "series" / "current"))

    def test_prepared_ancestor_survives_later_descendant_records(self):
        self.commit_spec()
        prepared = self.head
        self.write("source.txt", "later author\n")
        self.git("commit", "-qam", "later descendant")
        later = self.git("rev-parse", "HEAD")
        self.record("proposal.json", {"base_commit": later, "lifecycle_origin": later})
        self.record("approval.json", {"base_commit": later})
        self.record("series/current/round-0001.json", {"base_commit": later})
        (self.oracle / "validation-contract-results" / ("c" * 64) / later).mkdir(parents=True)
        self.git("update-ref", "refs/remotes/origin/main", self.base)
        result = vc.require_history(self.root, prepared, series=self.oracle / "series" / "current")
        self.assertEqual(result["candidate"], prepared)
        # A divergent candidate outside the current continuation is still refused.
        self.refused(lambda: vc.require_history(self.root, self.orphan))

    def test_orphaned_proposal_cannot_silently_start_a_replacement_series(self):
        proposal = {"base_commit": self.orphan, "review": {"verdict": "APPROVED", "findings": []}}
        proposal["proposal_review_id"] = o._sha(o._canonical(proposal))
        o.proposal_path(self.root).write_bytes(o._pretty(proposal))
        self.refused(lambda: o._series_directory(self.root, self.head))

    def test_oracle_rule_rejects_history_rewriting_proposals(self):
        text = (REPOSITORY / ".agents/skills/oracle/SKILL.md").read_text()
        self.assertIn("## History integrity", text)
        section = text.split("## History integrity", 1)[1].split("\n## ", 1)[0]
        for word in ("reset", "rebase", "force-push", "amend", "REJECTED"):
            self.assertIn(word, section)

    def test_candidate_that_would_not_fast_forward_published_main_is_refused(self):
        self.git("update-ref", "refs/remotes/origin/main", self.orphan)
        self.refused(self.require)
        self.require(published=False)

    def test_missing_recorded_commit_is_refused(self):
        missing = "1" * 40
        self.record("approval.json", {"base_commit": missing})
        self.refused(self.require, missing)

    def test_proposal_refuses_before_any_reviewer_runs(self):
        self.record("proposal.json", {"base_commit": self.orphan})
        def reviewer(*arguments, **options):
            raise AssertionError("Reviewer must not run on rewritten history")
        self.refused(lambda: o.review_proposal(self.root, "Problem\nCause\nRecommended change", [], None, reviewer=reviewer))

    def test_review_refuses_before_any_reviewer_runs(self):
        self.record("approval.json", {"base_commit": self.orphan})
        def reviewer(*arguments, **options):
            raise AssertionError("Reviewer must not run on rewritten history")
        self.write("source.txt", "repair\n")
        self.refused(lambda: o.issue(self.root, [], None, reviewer=reviewer))

    def test_validation_gate_refuses_recorded_commit_outside_history(self):
        self.commit_spec(stamp={"origin_main": self.orphan})
        self.refused(lambda: vc.gate(self.root, self.base))

    def test_release_prepare_and_publish_refuse_non_fast_forward_candidate(self):
        self.git("update-ref", "refs/remotes/origin/main", self.orphan)
        for operation in (publication.prepare, publication.publish):
            with self.subTest(operation=operation.__name__):
                self.refused(lambda: operation(self.root, "HEAD", "release/0.0.1", "main-promotion", refresh=False))

    def test_prepared_publication_refuses_recorded_baseline_outside_history(self):
        record = {"source_commit": self.head, "source_tree": self.git("rev-parse", "HEAD^{tree}"),
                  "expected_remote_commit": self.orphan, "plan": {"technical_receipt_sha256": "0" * 64}}
        executed = []
        with patch.object(publication, "_prepared_record", return_value=(record, "d" * 64, ["git", "push"])):
            self.refused(lambda: publication.publish_prepared(self.root, self.root / "prepared.json",
                                                              execute=lambda *a, **k: executed.append(a)))
        self.assertEqual(executed, [])


if __name__ == "__main__":
    unittest.main()
