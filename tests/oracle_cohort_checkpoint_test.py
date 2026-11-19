"""Interrupted cohorts keep bound work; governance arrives complete and sealed."""
from pathlib import Path
import hashlib
import json
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import oracle_approval as o
from tools import oracle_parallel as parallel

DIGEST = lambda value: o._sha(o._canonical(value))
SIX = list(parallel.INTEGRATION_CHECKS)


def finding(identity='F2001', path='source/a.md'):
    return {'severity': 'high', 'file': path, 'line': 3, 'message': 'Problem.', 'id': identity,
            'root_cause': 'Cause.', 'reproduction': 'Steps.', 'required_behavior': 'Behavior.',
            'recommendation': 'Repair.', 'affected_paths': [path], 'acceptance_checks': ['Check.'],
            'origin': 'INITIAL', 'origin_reason': 'New.'}


class Journal(unittest.TestCase):
    def setUp(self):
        self.paths = ['source/a.md', 'source/b.md', 'source/c.md']
        self.context = {'input_hashes': {p: 'git-sha1:100644:blob:' + str(i) * 40 for i, p in enumerate(self.paths)},
                        'prior_findings': {}}
        self.plan = {'plan_sha256': 'p' * 64, 'retained_criteria': []}
        self.cohort = {'id': 'implementation-consumers', 'required_paths': self.paths[:2],
                       'integration_checks': [], 'new_finding_prefix': 'F2000'}
        self.packet = 'k' * 64

    def row(self, kind, **fields):
        return json.dumps({'type': kind, 'plan_sha256': self.plan['plan_sha256'], 'packet_sha256': self.packet, **fields})

    def inputs(self, *paths):
        return [{'path': p, 'digest': self.context['input_hashes'][p]} for p in paths]

    def replay(self, *lines, cohort=None):
        return parallel.replay_journal(o, '\n'.join(lines) + '\n', self.plan, cohort or self.cohort,
                                       self.context, self.packet)

    def test_bound_coverage_and_findings_are_admitted_in_order(self):
        result = self.replay(self.row('coverage', path='source/a.md', inputs=self.inputs('source/a.md'), reason='Clean.'),
                             self.row('finding', finding=finding('F2001', 'source/b.md')))
        self.assertEqual([row['path'] for row in result['coverage']], ['source/a.md'])
        self.assertEqual(result['coverage'][0]['status'], 'REVIEWED')
        self.assertEqual([item['id'] for item in result['findings']], ['F2001'])

    def test_foreign_unknown_stale_and_conflicting_rows_grant_nothing(self):
        stale = [{'path': 'source/a.md', 'digest': 'git-sha1:100644:blob:' + 'f' * 40}]
        result = self.replay(
            self.row('coverage', path='source/c.md', inputs=self.inputs('source/c.md'), reason='Foreign assignment.'),
            self.row('coverage', path='source/a.md', inputs=stale, reason='Stale digest.'),
            self.row('coverage', path='source/a.md', inputs=[{'path': 'unknown.md', 'digest': 'x'}], reason='Unknown.'),
            self.row('coverage', path='source/b.md', inputs=self.inputs('source/a.md'), reason='Omits itself.'),
            json.dumps({'type': 'coverage', 'plan_sha256': 'q' * 64, 'packet_sha256': self.packet,
                        'path': 'source/a.md', 'inputs': self.inputs('source/a.md'), 'reason': 'Foreign plan.'}),
            self.row('finding', finding=finding('F9001')),
            self.row('finding', finding=dict(finding('F2002'), severity='urgent')))
        self.assertEqual(result['coverage'], [])
        self.assertEqual(result['findings'], [])
        conflict = self.replay(
            self.row('coverage', path='source/a.md', inputs=self.inputs('source/a.md'), reason='One.'),
            self.row('coverage', path='source/a.md', inputs=self.inputs('source/a.md'), reason='Two.'))
        self.assertEqual(conflict['coverage'], [])

    def test_later_finding_or_withdrawal_removes_earlier_clean_coverage(self):
        result = self.replay(
            self.row('coverage', path='source/a.md', inputs=self.inputs('source/a.md'), reason='Clean.'),
            self.row('coverage', path='source/b.md', inputs=self.inputs('source/b.md'), reason='Clean.'),
            self.row('finding', finding=finding('F2001', 'source/a.md')),
            self.row('withdraw', path='source/b.md'))
        self.assertEqual(result['coverage'], [])
        self.assertEqual([item['id'] for item in result['findings']], ['F2001'])

    def test_replay_stops_at_truncated_record_and_keeps_earlier_rows(self):
        good = self.row('coverage', path='source/a.md', inputs=self.inputs('source/a.md'), reason='Clean.')
        later = self.row('coverage', path='source/b.md', inputs=self.inputs('source/b.md'), reason='Clean.')
        result = parallel.replay_journal(o, good + '\n{"type": "cov' + '\n' + later + '\n', self.plan, self.cohort,
                                         self.context, self.packet)
        self.assertEqual([row['path'] for row in result['coverage']], ['source/a.md'])
        self.assertTrue(result['stopped_at_line'])

    def test_integration_rows_only_for_assigned_crosscutting_concerns(self):
        cross = {'id': 'crosscutting-integration', 'required_paths': [], 'integration_checks': SIX[:2],
                 'new_finding_prefix': 'F1000'}
        result = self.replay(
            self.row('integration', concern=SIX[0], status='REVIEWED', inputs=self.inputs('source/a.md'), reason='Done.'),
            self.row('integration', concern=SIX[3], status='REVIEWED', inputs=self.inputs('source/a.md'), reason='Foreign.'),
            cohort=cross)
        self.assertEqual([row['concern'] for row in result['integration']], [SIX[0]])
        self.assertEqual(self.replay(self.row('integration', concern=SIX[0], status='REVIEWED',
                                              inputs=self.inputs('source/a.md'), reason='Not mine.'))['integration'], [])

    def test_partial_round_stays_unfinished_when_journal_is_merged(self):
        result = {'review_status': 'ERROR', 'verdict': 'ERROR', 'coverage': [], 'findings': [],
                  'limitations': ['implementation-consumers: deadline']}
        admitted = self.replay(self.row('coverage', path='source/a.md', inputs=self.inputs('source/a.md'), reason='Clean.'))
        merged = parallel.merge_journal(result, 'implementation-consumers', admitted)
        self.assertEqual((merged['review_status'], merged['verdict']), ('ERROR', 'ERROR'))
        self.assertEqual([row['path'] for row in merged['coverage']], ['source/a.md'])
        self.assertEqual(merged['journal_reconciliation'][0]['cohort_id'], 'implementation-consumers')


class Integration(unittest.TestCase):
    def scope(self, **changes):
        values = dict(candidate_tree='t' * 40, publication_scope={'range_sha256': 'r' * 64},
                      required_paths=['source/a.md'], input_hashes={'source/a.md': 'git-sha1:100644:blob:' + 'a' * 40},
                      prior_findings={})
        values.update(changes)
        return values

    def row(self, concern, status='REVIEWED', **scope):
        values = self.scope(**scope)
        return {'concern': concern, 'status': status, 'reason': 'Assessed.',
                'inputs': [{'path': 'source/a.md', 'digest': values['input_hashes']['source/a.md']}],
                'scope': parallel.integration_scope(**values)}

    def test_reuse_requires_identical_scope_inputs_guards_and_reviewed_status(self):
        rows = [self.row(SIX[0]), self.row(SIX[1], 'NOT_APPLICABLE'), self.row(SIX[2], 'UNREVIEWED')]
        reused = parallel.reusable_integration(rows, guard_changes=[], **self.scope())
        self.assertEqual([row['concern'] for row in reused], SIX[:2])
        for change in ({'candidate_tree': 'u' * 40}, {'publication_scope': {'range_sha256': 's' * 64}},
                       {'required_paths': ['source/a.md', 'source/new.md'],
                        'input_hashes': {'source/a.md': 'git-sha1:100644:blob:' + 'a' * 40, 'source/new.md': 'x'}},
                       {'input_hashes': {'source/a.md': 'git-sha1:100755:blob:' + 'a' * 40}},
                       {'prior_findings': {'F1001': {'state': 'OPEN'}}}):
            with self.subTest(change=change):
                self.assertEqual(parallel.reusable_integration(rows, guard_changes=[], **self.scope(**change)), [])
        self.assertEqual(parallel.reusable_integration(rows, guard_changes=['authority changed'], **self.scope()), [])

    def test_completion_requires_all_six_reviewed_concerns(self):
        reused = [{'concern': name, 'status': 'REVIEWED'} for name in SIX[:3]]
        current = [{'concern': name, 'status': 'REVIEWED'} for name in SIX[3:]]
        self.assertTrue(parallel.integration_complete(reused, current))
        self.assertFalse(parallel.integration_complete(reused, current[:-1]))
        self.assertFalse(parallel.integration_complete(reused, current[:-1] + [{'concern': SIX[-1], 'status': 'UNREVIEWED'}]))


class Partition(unittest.TestCase):
    def context(self, paths, reusable_integration=()):
        return {'required_coverage_paths': paths, 'reusable_coverage': [], 'invalidated_coverage': [],
                'candidate_tree': 't' * 40, 'base_commit': 'b' * 40, 'guards': {}, 'prior_findings': {},
                'input_hashes': {p: 'x' for p in paths}, 'reusable_integration': list(reusable_integration)}

    def test_areas_split_at_six_with_distinct_ids_and_prefixes(self):
        paths = ['source/s%02d.md' % i for i in range(17)] + ['tests/t%d.mjs' % i for i in range(5)] + ['@publication/scope']
        plan = parallel.partition(self.context(paths), {'reviewer_settings': {}}, DIGEST)
        cohorts = plan['cohorts']
        assigned = [p for cohort in cohorts for p in cohort['required_paths']]
        self.assertEqual(sorted(assigned), sorted(paths))
        self.assertEqual(len(assigned), len(set(assigned)))
        self.assertTrue(all(len(c['required_paths']) <= 6 for c in cohorts if c['id'] != parallel.AREAS[0]))
        self.assertEqual(len({c['id'] for c in cohorts}), len(cohorts))
        self.assertEqual(len({c['new_finding_prefix'] for c in cohorts}), len(cohorts))
        self.assertEqual(cohorts[0]['id'], parallel.AREAS[0])
        self.assertEqual(cohorts[0]['integration_checks'], SIX)
        self.assertTrue(all(c['integration_checks'] == [] for c in cohorts[1:]))

    def test_crosscutting_is_assigned_only_unfinished_concerns(self):
        reused = [{'concern': SIX[0], 'status': 'REVIEWED'}, {'concern': SIX[1], 'status': 'NOT_APPLICABLE'}]
        plan = parallel.partition(self.context(['source/a.md'], reused), {'reviewer_settings': {}}, DIGEST)
        self.assertEqual(plan['cohorts'][0]['integration_checks'], SIX[2:])


class Governance(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.digests = {}
        for path in parallel.GOVERNANCE_PATHS:
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('Authority text for ' + path + '\n')
            self.digests[path] = hashlib.sha256(target.read_bytes()).hexdigest()
        self.context = {'guards': {'authority_digests': {p: self.digests[p] for p in parallel.GOVERNANCE_PATHS[:4]}}}

    def bundle(self):
        with patch_root(self.root):
            return parallel.governance_bundle(o, self.root, self.context)

    def test_bundle_carries_complete_exact_bytes_with_provenance(self):
        payload, manifest = self.bundle()
        text = payload.decode()
        for path in parallel.GOVERNANCE_PATHS:
            self.assertIn('Authority text for ' + path + '\n', text)
            self.assertIn(path + ' sha256=' + self.digests[path], text)
        self.assertEqual([row['path'] for row in manifest['documents']], list(parallel.GOVERNANCE_PATHS))
        self.assertEqual(manifest['sha256'], hashlib.sha256(payload).hexdigest())

    def test_missing_altered_or_oversized_governance_fails_closed(self):
        authority = parallel.GOVERNANCE_PATHS[0]
        (self.root / authority).write_text('changed\n')
        with self.assertRaisesRegex(o.OracleApprovalError, 'governance'):
            self.bundle()
        (self.root / authority).write_text('Authority text for ' + authority + '\n')
        (self.root / parallel.GOVERNANCE_PATHS[-1]).unlink()
        with self.assertRaisesRegex(o.OracleApprovalError, 'governance'):
            self.bundle()
        (self.root / parallel.GOVERNANCE_PATHS[-1]).write_text('x' * (parallel.GOVERNANCE_MAX_BYTES + 1))
        with self.assertRaisesRegex(o.OracleApprovalError, 'governance'):
            self.bundle()

    def test_any_authority_change_changes_the_bundle(self):
        first = self.bundle()[1]['sha256']
        path = parallel.GOVERNANCE_PATHS[-1]
        (self.root / path).write_text('Authority text for ' + path + ' amended\n')
        self.assertNotEqual(self.bundle()[1]['sha256'], first)


class patch_root:
    def __init__(self, root):
        self.root = root

    def __enter__(self):
        self.token = o._METADATA_ROOT.set(self.root)

    def __exit__(self, *args):
        o._METADATA_ROOT.reset(self.token)


if __name__ == '__main__':
    unittest.main()
