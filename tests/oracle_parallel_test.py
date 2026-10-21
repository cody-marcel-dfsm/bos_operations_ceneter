"""Native cohort partition, admission and actual overlapping launcher checks."""
from pathlib import Path
import copy
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import oracle_approval as o
from tools import oracle_parallel as parallel


class ParallelReview(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.run = self.root / '.git/oracle/runs/parallel'
        self.run.mkdir(parents=True)
        schema = self.root / '.agents/skills/oracle/review-output.schema.json'
        schema.parent.mkdir(parents=True)
        schema.write_bytes((Path(__file__).resolve().parents[1] / '.agents/skills/oracle/review-output.schema.json').read_bytes())
        helper = self.root / 'tools/codex_child_model.py'
        helper.parent.mkdir(parents=True)
        helper.write_bytes((Path(__file__).resolve().parents[1] / 'tools/codex_child_model.py').read_bytes())
        self.paths = ['@proposal/scope', 'source.py', 'tests/source_test.py', 'unchanged.py']
        self.context = {'base_commit': 'a' * 40, 'candidate_tree': 'b' * 40,
            'required_coverage_paths': self.paths, 'input_hashes': {p: 'bound-' + p for p in self.paths},
            'reusable_coverage': [{'path': 'unchanged.py', 'inputs': [{'path': 'unchanged.py', 'digest': 'bound-unchanged.py'}]}],
            'guards': {'authority_digests': {}}, 'prior_findings': {}, 'reusable_validations': [], 'current_validations': [],
            'publication_scope': {'range_sha256': 'range', 'range_paths': self.paths}}
        self.binding = {'base_commit': 'a' * 40, 'reviewer_settings': {'model': 'inherited-model', 'reasoning_effort': 'high'}}
        (self.run / 'review-context.json').write_bytes(o._pretty(self.context))
        self.run_token = o._RUN.set(self.run)
        self.owner_token = o._METADATA_ROOT.set(self.root)
        self.settings_token = o._PREPARED_SETTINGS.set(self.binding['reviewer_settings'])
        self.addCleanup(o._RUN.reset, self.run_token)
        self.addCleanup(o._METADATA_ROOT.reset, self.owner_token)
        self.addCleanup(o._PREPARED_SETTINGS.reset, self.settings_token)
        self.digest = lambda value: o._sha(o._canonical(value))
        self.plan = parallel.partition(self.context, self.binding, self.digest)

    def envelope(self, cohort):
        inputs = lambda path: [{'path': path, 'digest': self.context['input_hashes'][path]}]
        return {'plan_sha256': self.plan['plan_sha256'], 'cohort_id': cohort['id'],
            'candidate_commit': self.plan['candidate_commit'], 'candidate_tree': self.plan['candidate_tree'],
            'input_binding_sha256': self.plan['input_binding_sha256'],
            'assessment': {'verdict': 'APPROVED', 'review_status': 'COMPLETE', 'summary': 'Assigned area assessed',
                'findings': [], 'resolutions': [], 'validations': [], 'limitations': [], 'repair_plan': '',
                'coverage': [{'path': p, 'status': 'REVIEWED', 'inputs': inputs(p), 'reason': 'Assessed actual area behavior'}
                             for p in cohort['required_paths']],
                'authentication_impact': 'NONE', 'owner_approval_status': 'NOT_REQUIRED',
                'api_version_assessment': {'impact': 'NONE', 'request_kind': 'NOT_REQUIRED',
                    'requested_change': None, 'request_quote': None, 'request_evidence': None},
                'protected_effects': {'active': [], 'dispositions': []}},
            'integration': [{'concern': concern, 'status': 'REVIEWED', 'inputs': inputs('@proposal/scope'),
                             'reason': 'Traced the complete current integration boundary'}
                            for concern in cohort['integration_checks']]}

    def all_envelopes(self):
        return {cohort['id']: self.envelope(cohort) for cohort in self.plan['cohorts']}

    def test_partition_excludes_native_carried_paths_and_binds_candidate_and_settings(self):
        assigned = [p for cohort in self.plan['cohorts'] for p in cohort['required_paths']]
        self.assertEqual(set(assigned), set(self.paths) - {'unchanged.py'})
        self.assertEqual(len(assigned), len(set(assigned)))
        self.assertEqual(self.plan['max_workers'], 3)
        self.assertEqual(self.plan['candidate_commit'], 'a' * 40)
        self.assertEqual(self.plan['reviewer_settings'], self.binding['reviewer_settings'])
        area = self.plan['cohorts'][1]
        packet = parallel.packet(self.context, self.plan, area, self.run / 'review-context.json', self.digest)
        self.assertNotIn('unchanged.py', packet['input_hashes'])
        self.assertNotIn('prior_rounds', packet)
        self.assertEqual(packet['parent_context_sha256'], self.plan['context_sha256'])

    def test_production_launcher_runs_three_isolated_inherited_reviewers_in_parallel(self):
        barrier = threading.Barrier(3)
        launches = []; lock = threading.Lock()
        def child(root, prompt, prefix, *, schema_path, cohort_policy):
            run = o._RUN.get()
            packet = json.loads((run / 'cohort-context.json').read_text())
            cohort = packet['cohort']
            self.assertEqual(root, self.root)
            self.assertEqual(o._PREPARED_SETTINGS.get(), self.binding['reviewer_settings'])
            self.assertIn('Governing instructions first', prompt)
            self.assertIn('trusted independent, read-only', cohort_policy)
            self.assertEqual(Path(schema_path).parent, run)
            with lock: launches.append((cohort['id'], str(run)))
            barrier.wait(timeout=5)
            time.sleep(0.08)
            result = self.envelope(cohort)
            for name, value in {'model.json': {'selected_model': 'inherited-model', 'reasoning_effort': 'high'},
                                'process.json': {'exit_code': 0}, 'result.json': result}.items():
                o._atomic_write(run / name, o._pretty(value))
            return result
        with patch.object(o, '_input_binding', return_value=self.binding), patch.object(o, '_review_process', side_effect=child):
            result = o._oracle(self.root, self.context['candidate_tree'], self.paths, {}, None)
        self.assertEqual((result['review_status'], result['verdict']), ('COMPLETE', 'APPROVED'))
        self.assertEqual(len(launches), 3)  # No fourth serial final reviewer.
        self.assertEqual(len({path for _, path in launches}), 3)
        self.assertEqual(o._RUN.get(), self.run)
        manifest = json.loads((self.run / 'cohort-evidence.json').read_text())
        self.assertEqual(manifest['artifacts'], o._files(self.root, list(manifest['artifacts'])))
        measured = manifest['measurement']
        self.assertEqual(measured['max_observed_concurrency'], 3)
        spans = measured['cohorts']
        self.assertLess(max(s['started_offset_seconds'] for s in spans), min(s['finished_offset_seconds'] for s in spans))
        self.assertGreater(sum(s['finished_offset_seconds'] - s['started_offset_seconds'] for s in spans), measured['wall_seconds'] * 1.5)
        print(json.dumps({'measured_native_mock_concurrency': measured}, sort_keys=True))

    def test_foreign_plan_cohort_commit_tree_binding_and_stale_inputs_fail_closed(self):
        identity = self.plan['cohorts'][1]['id']
        for field in ('plan_sha256', 'cohort_id', 'candidate_commit', 'candidate_tree', 'input_binding_sha256'):
            with self.subTest(field=field):
                responses = self.all_envelopes(); responses[identity][field] = 'forged'
                result = parallel.aggregate(o, self.plan, self.context, responses, [])
                self.assertEqual(result['review_status'], 'ERROR')
        responses = self.all_envelopes()
        responses[identity]['assessment']['coverage'][0]['inputs'][0]['digest'] = 'stale'
        self.assertEqual(parallel.aggregate(o, self.plan, self.context, responses, [])['verdict'], 'ERROR')

    def test_identical_validation_proof_preserves_distinct_explanations(self):
        responses = self.all_envelopes()
        first, second = [cohort['id'] for cohort in self.plan['cohorts'][:2]]
        proof = {'evidence_path': 'native.json', 'status': 'INVALIDATED',
                 'inputs': [], 'environment_digest': 'same-environment', 'reason': 'First explicit observation'}
        responses[first]['assessment']['validations'] = [proof]
        responses[second]['assessment']['validations'] = [dict(proof, reason='Additional closure observation')]
        result = parallel.aggregate(o, self.plan, self.context, responses, [])
        self.assertEqual(result['verdict'], 'APPROVED')
        self.assertEqual(set(result['validations'][0]['reason'].split('\n')),
                         {'First explicit observation', 'Additional closure observation'})
        for field, value in [('status', 'VERIFIED'), ('environment_digest', 'different')]:
            changed = copy.deepcopy(responses)
            changed[second]['assessment']['validations'][0][field] = value
            self.assertEqual(parallel.aggregate(o, self.plan, self.context, changed, [])['verdict'], 'ERROR')

    def test_missing_incomplete_failed_and_missing_integration_cohorts_never_approve(self):
        identity = self.plan['cohorts'][1]['id']
        responses = self.all_envelopes(); del responses[identity]
        self.assertEqual(parallel.aggregate(o, self.plan, self.context, responses, [])['verdict'], 'ERROR')
        responses = self.all_envelopes(); area = responses[identity]['assessment']
        area.update(review_status='INCOMPLETE', verdict='INCOMPLETE', limitations=['Consumer still unassessed'])
        partial = parallel.aggregate(o, self.plan, self.context, responses, [])
        self.assertEqual(partial['verdict'], 'INCOMPLETE')
        self.assertTrue(partial['coverage'])
        self.assertEqual(parallel.aggregate(o, self.plan, self.context, self.all_envelopes(), ['One child process failed'])['verdict'], 'ERROR')
        responses = self.all_envelopes(); responses[parallel.AREAS[0]]['integration'].pop()
        self.assertEqual(parallel.aggregate(o, self.plan, self.context, responses, [])['verdict'], 'INCOMPLETE')

    def test_conflicting_classifications_findings_and_resolution_cannot_approve(self):
        first, second = [cohort['id'] for cohort in self.plan['cohorts'][:2]]
        responses = self.all_envelopes()
        responses[second]['assessment']['authentication_impact'] = 'AUTHENTICATION'
        self.assertEqual(parallel.aggregate(o, self.plan, self.context, responses, [])['verdict'], 'ERROR')
        for variant in ('conflict', 'resolution'):
            with self.subTest(variant=variant):
                responses = self.all_envelopes()
                responses[first]['assessment']['findings'] = [{'id': 'F001', 'message': 'Current defect'}]
                if variant == 'conflict':
                    responses[second]['assessment']['findings'] = [{'id': 'F001', 'message': 'Contradictory defect'}]
                else:
                    responses[first]['assessment']['resolutions'] = [{'id': 'F001', 'explanation': 'Resolved'}]
                self.assertEqual(parallel.aggregate(o, self.plan, self.context, responses, [])['verdict'], 'ERROR')

    def test_complete_cohort_cannot_erase_unfinished_limitations_or_invalid_status(self):
        identity = parallel.AREAS[1]
        responses = self.all_envelopes()
        responses[identity]['assessment']['limitations'] = ['Required production recovery remains unassessed']
        result = parallel.aggregate(o, self.plan, self.context, responses, [])
        self.assertEqual((result['review_status'], result['verdict']), ('INCOMPLETE', 'INCOMPLETE'))
        self.assertIn(identity, ' '.join(result['limitations']))
        self.assertIn('Required production recovery remains unassessed', ' '.join(result['limitations']))
        self.assertEqual(responses[identity]['assessment']['review_status'], 'COMPLETE')
        for fields in ({'review_status': 'INCOMPLETE', 'verdict': 'APPROVED', 'limitations': ['unfinished']},
                       {'review_status': 'ERROR', 'verdict': 'ERROR', 'limitations': []}):
            responses = self.all_envelopes(); responses[identity]['assessment'].update(fields)
            self.assertEqual(parallel.aggregate(o, self.plan, self.context, responses, [])['verdict'], 'ERROR')
        self.assertEqual(parallel.aggregate(o, self.plan, self.context, self.all_envelopes(), [])['verdict'], 'APPROVED')

    def test_global_protected_effect_and_missing_authority_survive_unaffected_specialists(self):
        responses = self.all_envelopes()
        global_assessment = responses[parallel.AREAS[0]]['assessment']
        effect = {'id': 'trust-change', 'kind': 'credential-trust', 'boundary': 'current connection',
                  'description': 'Concrete protected trust change', 'paths': ['source.py'],
                  'inputs': [{'path': 'source.py', 'digest': self.context['input_hashes']['source.py']}]}
        global_assessment.update(authentication_impact='AUTHENTICATION', owner_approval_status='MISSING',
                                 protected_effects={'active': [effect], 'dispositions': []})
        result = parallel.aggregate(o, self.plan, self.context, responses, [])
        self.assertEqual((result['review_status'], result['verdict']), ('COMPLETE', 'APPROVED'))
        self.assertEqual(result['authentication_impact'], 'AUTHENTICATION')
        self.assertEqual(result['owner_approval_status'], 'MISSING')
        self.assertEqual(result['protected_effects'], global_assessment['protected_effects'])
        # Publication still receives the exact protected effect and missing
        # authority. Technical approval never manufactures deployment permission.
        responses[parallel.AREAS[1]]['assessment']['protected_effects']['active'] = [copy.deepcopy(effect)]
        self.assertEqual(parallel.aggregate(o, self.plan, self.context, responses, [])['verdict'], 'APPROVED')
        responses[parallel.AREAS[1]]['assessment']['protected_effects']['active'][0]['boundary'] = 'other trust boundary'
        conflict = parallel.aggregate(o, self.plan, self.context, responses, [])
        self.assertEqual(conflict['verdict'], 'ERROR')
        self.assertEqual(conflict['protected_effects'], global_assessment['protected_effects'])
        self.assertIn('crosscutting reconciliation', ' '.join(conflict['limitations']))

    def test_all_findings_are_consolidated_and_whole_candidate_native_gate_still_runs(self):
        responses = self.all_envelopes()
        for index, cohort in enumerate(self.plan['cohorts']):
            responses[cohort['id']]['assessment'].update(verdict='REJECTED', findings=[{'id': 'F'+str(100+index)}])
        result = parallel.aggregate(o, self.plan, self.context, responses, [])
        self.assertEqual(result['verdict'], 'REJECTED')
        self.assertEqual({f['id'] for f in result['findings']}, {'F100', 'F101', 'F102'})
        complete = parallel.aggregate(o, self.plan, self.context, self.all_envelopes(), [])
        # Existing global native admission continues to reject omitted source
        # dependencies; a cohort declaration never bypasses that validator.
        complete['coverage'][0]['inputs'] = []
        context = dict(self.context, prior_findings={}, repair_synthesis_required=False,
                       registered_validation_evidence={}, validation_invalidations={}, guards={'environment_digest': 'env'})
        with self.assertRaises(o.OracleApprovalError):
            o._validate_completed_review(self.root, complete, context, {})

    def test_actual_isolated_child_processes_overlap_without_a_model_service(self):
        probe = self.root / 'reviewer_probe.py'
        probe.write_text('''import json,os,sys,time
from pathlib import Path
args=sys.argv[1:]
output=Path(args[args.index('--output-last-message')+1])
packet=json.loads(output.with_name('cohort-context.json').read_text())
developer=json.loads(next(value.split('=',1)[1] for value in args if value.startswith('developer_instructions=')))
assert 'trusted independent, read-only Oracle cohort' in developer
assert os.environ['CODEX_SELECTED_MODEL']=='inherited-model'
assert os.environ['CODEX_SELECTED_REASONING_EFFORT']=='high'
started=time.time(); time.sleep(.18)
cohort=packet['cohort']; hashes=packet['input_hashes']
inputs=lambda p:[{'path':p,'digest':hashes[p]}]
assessment={'verdict':'APPROVED','review_status':'COMPLETE','summary':'Probe assigned scope',
'findings':[],'resolutions':[],'validations':[],'limitations':[],'repair_plan':'',
'coverage':[{'path':p,'status':'REVIEWED','inputs':inputs(p),'reason':'Probe exact identity'} for p in cohort['required_paths']],
'authentication_impact':'NONE','owner_approval_status':'NOT_REQUIRED',
'api_version_assessment':{'impact':'NONE','request_kind':'NOT_REQUIRED','requested_change':None,'request_quote':None,'request_evidence':None},
'protected_effects':{'active':[],'dispositions':[]}}
result={key:packet[key] for key in ('plan_sha256','candidate_commit','candidate_tree','input_binding_sha256')}
result.update(cohort_id=cohort['id'],assessment=assessment,integration=[{'concern':key,'status':'REVIEWED',
'inputs':inputs('@proposal/scope'),'reason':'Probe full integration concern'} for key in cohort['integration_checks']])
output.write_text(json.dumps(result))
output.with_name('probe.json').write_text(json.dumps({'pid':os.getpid(),'started':started,'finished':time.time()}))
''')
        original_run = subprocess.run
        def launch(command, **options):
            self.assertEqual(command[0], 'codex')
            return original_run([sys.executable, str(probe), *command[1:]], **options)
        with patch.object(o, '_input_binding', return_value=self.binding), \
             patch.object(o, 'selected_model', return_value='inherited-model'), \
             patch.object(o, 'selected_reasoning_effort', return_value='high'), \
             patch.object(o.subprocess, 'run', side_effect=launch):
            result = o._oracle(self.root, self.context['candidate_tree'], self.paths, {}, None)
        self.assertEqual(result['verdict'], 'APPROVED')
        probes = [json.loads(path.read_text()) for path in (self.run / 'cohorts').glob('*/probe.json')]
        self.assertEqual(len({item['pid'] for item in probes}), 3)
        self.assertLess(max(item['started'] for item in probes), min(item['finished'] for item in probes))
        print(json.dumps({'actual_child_process_overlap': probes}, sort_keys=True))

    def test_settings_drift_is_rejected_before_any_cohort_preparation_or_launch(self):
        binding = copy.deepcopy(self.binding)
        binding['reviewer_settings']['reasoning_effort'] = 'low'
        with patch.object(o, '_input_binding', return_value=binding), patch.object(o, '_review_process') as child:
            with self.assertRaisesRegex(o.OracleApprovalError, 'before launch'):
                o._oracle(self.root, self.context['candidate_tree'], self.paths, {}, None)
        child.assert_not_called()
        self.assertFalse((self.run / 'cohorts').exists())

    def test_child_execution_failure_and_final_context_movement_fail_closed(self):
        for mode in ('child-failure', 'context-moved'):
            with self.subTest(mode=mode):
                target = self.run.parent / mode
                target.mkdir()
                (target / 'review-context.json').write_bytes(o._pretty(self.context))
                token = o._RUN.set(target)
                def child(root, prompt, prefix, *, schema_path, cohort_policy):
                    run = o._RUN.get(); cohort = json.loads((run / 'cohort-context.json').read_text())['cohort']
                    if cohort['id'] == parallel.AREAS[1]:
                        if mode == 'child-failure':
                            raise RuntimeError('Actual isolated process execution failed')
                        moved = copy.deepcopy(self.context); moved['input_hashes']['source.py'] = 'changed'
                        o._atomic_write(target / 'review-context.json', o._pretty(moved))
                    o._atomic_write(run / 'model.json', o._pretty({'selected_model':'inherited-model','reasoning_effort':'high'}))
                    value = self.envelope(cohort)
                    o._atomic_write(run / 'result.json', o._pretty(value))
                    return value
                try:
                    with patch.object(o, '_input_binding', return_value=self.binding), patch.object(o, '_review_process', side_effect=child):
                        result = o._oracle(self.root, self.context['candidate_tree'], self.paths, {}, None)
                    self.assertEqual((result['review_status'], result['verdict']), ('ERROR', 'ERROR'))
                    self.assertTrue(result['limitations'])
                    self.assertTrue((target / 'cohort-evidence.json').exists())
                    self.assertTrue(list((target / 'cohorts').glob('*/result.json')))
                finally:
                    o._RUN.reset(token)


if __name__ == '__main__':
    unittest.main()
