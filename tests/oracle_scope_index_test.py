"""Real Git scope audits retain exact CL evidence and ingest immutable suffixes."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import oracle_approval as o, shipment_state as shipment, publication_status


class ScopeIndex(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.git('init', '-q'); self.git('config', 'user.name', 'Synthetic Review')
        self.git('config', 'user.email', 'synthetic@example.invalid')
        self.git('commit', '--allow-empty', '-qm', 'baseline')
        self.base = self.git('rev-parse', 'HEAD')
        self.git('remote', 'add', 'origin', 'https://example.invalid/synthetic.git')
        self.git('update-ref', 'refs/remotes/origin/main', self.base)
        self.commits = []
        for number in range(4):
            (self.root / 'source.txt').write_text(str(number))
            self.git('add', 'source.txt'); self.git('commit', '-qm', 'synthetic changelist')
            self.commits.append((self.git('rev-parse', 'HEAD'), self.git('rev-parse', 'HEAD^{tree}')))
        self.directory = self.root / '.git/oracle'
        self.series = o._series_directory(self.root, self.commits[-1][0])
        self.series.mkdir(parents=True)
        (self.directory / 'receipts').mkdir()
        self.records = []
        self.receipts = {}
        self.add_receipt(self.commits[0], 'first')
        self.add_receipt(self.commits[2], 'third')

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, text=True).strip()

    def add_receipt(self, source, identity):
        commit, tree = source
        number = len(self.records) + 1
        previous = self.records[-1]['record_sha256'] if self.records else None
        context = {'series_id': self.series.name, 'round': number, 'mode': 'initial',
                   'base_commit': commit, 'candidate_tree': tree, 'guards': {},
                   'previous_record_sha256': previous}
        context.update(kind='oracle-review-context-v1', proposal_scope={'sha256': 'synthetic', 'proposal': 'synthetic'})
        context_path = self.directory / 'runs' / ('context-' + str(number)) / 'review-context.json'
        context_path.parent.mkdir(parents=True, exist_ok=True); context_path.write_bytes(o._pretty(context))
        effects = {'active': [{'id': identity}], 'dispositions': []}
        review = {'review_status': 'COMPLETE', 'protected_effects': effects}
        record = dict(context, outcome='APPROVED', review=review,
                      verified_validations=[{'evidence_path': 'synthetic-proof', 'evidence_sha256': 'a' * 64}],
                      context_file=str(context_path.relative_to(self.root)),
                      context_sha256=o._sha(o._canonical(context)))
        record['record_sha256'] = o._sha(o._canonical(record))
        path = self.series / f'round-{number:04d}.json'; path.write_bytes(o._pretty(record))
        self.records.append(record)
        payload = {'schema_version': o.SCHEMA_VERSION, 'issuer': o.ISSUER, 'verdict': 'APPROVED',
                   'base_commit': commit, 'candidate_tree': tree, 'changed_paths': ['source.txt'],
                   'authority_digests': {}, 'authentication_impact': 'NONE', 'owner_approval_status': 'NOT_REQUIRED',
                   'validation_evidence': {str(path.relative_to(self.root)): o._sha(path.read_bytes()),
                       str(context_path.relative_to(self.root)): o._sha(context_path.read_bytes())},
                   'owner_approval_evidence': None, 'review_digest': o._sha(o._canonical(review)),
                   'api_version_assessment': {'impact': 'NONE', 'request_kind': 'NOT_REQUIRED',
                       'requested_change': None, 'request_quote': None, 'request_evidence': None},
                   'publication_scope': {}, 'protected_effects': effects}
        payload['approval_id'] = o._sha(o._canonical(payload))
        raw = o._pretty(payload)
        receipt = self.directory / 'receipts' / (o._sha(raw) + '.json'); receipt.write_bytes(raw)
        self.receipts[commit] = receipt
        return receipt

    def scope(self):
        return o._publication_scope(self.root, self.git('rev-parse', 'HEAD^{tree}'))

    def test_actual_scope_indexes_receipts_by_commit_and_tree_and_resolves_metadata_once(self):
        with patch.object(o, '_git', wraps=o._git) as git, \
                patch.object(o, '_read_rounds_prefix', wraps=o._read_rounds_prefix) as rounds:
            result = self.scope()
        self.assertEqual([x['effect']['id'] for x in result['prior_effects']], ['first', 'third'])
        resolutions = [call for call in git.call_args_list if call.args[1:] == ('rev-parse', '--git-dir')]
        self.assertEqual(len(resolutions), 2)
        self.assertEqual(len(rounds.call_args_list), 2)
        self.assertEqual(len(rounds.call_args_list[0].args[1]), 0)
        self.assertEqual(len(rounds.call_args_list[1].args[1]), 2)

    def test_new_receipt_and_series_suffix_are_ingested_without_redecoding_verified_prefix(self):
        original = o._publication_scope_current; calls = []
        def arrive(root, tree):
            result = original(root, tree); calls.append(result)
            if len(calls) == 1:
                self.add_receipt(self.commits[-1], 'new-current')
            return result
        with patch.object(o, '_publication_scope_current', side_effect=arrive), \
                patch.object(o, '_read_rounds_prefix', wraps=o._read_rounds_prefix) as rounds:
            result = self.scope()
        self.assertEqual(len(calls), 2)
        self.assertEqual([x['effect']['id'] for x in result['prior_effects']], ['first', 'third', 'new-current'])
        self.assertIn(2, [len(call.args[1]) for call in rounds.call_args_list])
        self.assertEqual(len(self.records), 3)

    def test_modified_receipt_context_or_removed_inventory_never_reuses_index(self):
        original = o._publication_scope_current
        for target, mutation in [(next((self.directory / 'receipts').glob('*.json')), 'bytes'),
                                 (self.directory / 'runs/context-1/review-context.json', 'bytes'),
                                 (self.series / 'round-0002.json', 'remove')]:
            with self.subTest(target=target.name):
                before = target.read_bytes()
                def change(root, tree):
                    result = original(root, tree)
                    if mutation == 'remove': target.unlink()
                    else: target.write_bytes(before + b' ')
                    return result
                try:
                    with patch.object(o, '_publication_scope_current', side_effect=change):
                        with self.assertRaises(o.OracleSourceBindingError): self.scope()
                finally: target.write_bytes(before)

    def test_execution_suffixes_preserve_prior_pass_and_admitted_affected_facts_revoke_it(self):
        cases = [
            ('execution-error', 'ERROR', {'error': 'interrupted', 'publication_failure': True, 'findings': [{'id': 'F1'}]}, False, {}, True),
            ('unfinished', 'INCOMPLETE', {'findings': []}, True, {}, True),
            ('admitted-defect', 'INCOMPLETE', {'findings': [{'id': 'F1'}]}, True, {}, False),
            ('explicit-invalidation', 'INCOMPLETE', {'validations': [{'status': 'INVALIDATED', 'evidence_path': 'synthetic-proof'}]}, True, {}, False),
            ('changed-criteria', 'INCOMPLETE', {}, True, {'review_policy_digest': 'changed'}, False),
            ('approved-invalidation', 'APPROVED', {'validations': [{'status': 'INVALIDATED', 'evidence_path': 'synthetic-proof'}]}, True, {}, False),
        ]
        for name, outcome, changes, admitted, guards, retained in cases:
            with self.subTest(name=name):
                number = len(self.records) + 1
                original = self.records[0]
                context = {key: original[key] for key in ['series_id', 'mode', 'base_commit', 'candidate_tree']}
                context.update(round=number, guards=guards, previous_record_sha256=self.records[-1]['record_sha256'])
                context_path = self.directory / 'suffix-context.json'; context_path.write_bytes(o._pretty(context))
                review = dict(review_status='COMPLETE' if outcome == 'APPROVED' else outcome, **changes)
                row = dict(context, outcome=outcome, review=review, assessment_admitted=admitted,
                           finding_ledger={'F1': {'state': 'OPEN'}}, context_file=str(context_path.relative_to(self.root)),
                           context_sha256=o._sha(o._canonical(context)))
                row['record_sha256'] = o._sha(o._canonical(row))
                path = self.series / f'round-{number:04d}.json'; path.write_bytes(o._pretty(row))
                try:
                    result = self.scope()
                    self.assertEqual('first' in [item['effect']['id'] for item in result['prior_effects']], retained)
                    self.assertIn('third', [item['effect']['id'] for item in result['prior_effects']])
                    receipt = json.loads(self.receipts[self.commits[0][0]].read_text())
                    with patch.object(o, '_series_directory', return_value=self.series), \
                            patch.object(o, 'verify_proposal', return_value={'proposal_sha256': 'synthetic'}), \
                            patch.object(o, '_validation_record', return_value={}), \
                            patch.object(shipment, 'observe_decision') as imported:
                        if retained:
                            _, selected = o._receipt_current_context(self.root, receipt, {})
                            self.assertEqual(selected, self.root / original['context_file'])
                            shipment._import_currentness(self.root, receipt)
                            self.assertEqual(imported.call_args.args[1]['round'], original['round'])
                        else:
                            with self.assertRaises(o.OracleApprovalError):
                                o._receipt_current_context(self.root, receipt, {})
                            with self.assertRaises(o.OracleApprovalError):
                                shipment._import_currentness(self.root, receipt)
                    command = [sys.executable, str(Path(o.__file__).resolve()), 'verify-commit', self.commits[0][0]]
                    env = dict(os.environ)
                    if name == 'approved-invalidation':
                        self.git('update-ref', 'refs/remotes/origin/main', self.commits[0][0])
                        executable = self.root / 'bin/gh'; executable.parent.mkdir(exist_ok=True)
                        status = {'context': publication_status.CONTEXT, 'state': 'success',
                            'creator': {'login': publication_status.PUBLISHER},
                            'target_url': publication_status._target(self.commits[0][0]),
                            'description': publication_status._description(self.commits[0][1], self.receipts[self.commits[0][0]].stem)}
                        script = '#!' + sys.executable + '\nimport json,sys\nassert sys.argv[1]=="api"\nprint(' + repr(json.dumps([status])) + ')\n'
                        executable.write_text(script); executable.chmod(0o755)
                        env['PATH'] = str(executable.parent) + os.pathsep + env.get('PATH', '')
                    actual = subprocess.run(command, cwd=self.root, capture_output=True, text=True, env=env)
                    self.assertEqual(actual.returncode == 0, retained, actual.stderr)
                    if not retained:
                        self.assertIn('explicitly invalidated', actual.stderr)
                finally:
                    path.unlink(); context_path.unlink()
                    self.git('update-ref', 'refs/remotes/origin/main', self.base)

    def test_concurrent_real_source_commit_cannot_relabel_captured_scope(self):
        original = o._publication_scope_current
        def author(root, tree):
            result = original(root, tree)
            (self.root / 'source.txt').write_text('concurrent authored content')
            self.git('add', 'source.txt'); self.git('commit', '-qm', 'concurrent authored CL')
            return result
        with patch.object(o, '_publication_scope_current', side_effect=author):
            with self.assertRaises(o.OracleSourceBindingError): self.scope()
        self.assertEqual((self.root / 'source.txt').read_text(), 'concurrent authored content')


if __name__ == '__main__':
    unittest.main()
