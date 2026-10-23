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
        for name, value in (('selected_model', 'inherited-model'), ('selected_reasoning_effort', 'high')):
            setting = patch.object(o, name, return_value=value)
            setting.start()
            self.addCleanup(setting.stop)
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
        effective = parallel._criterion_context(self.context, self.plan)
        inputs = lambda path: [{'path': path, 'digest': effective['input_hashes'][path]}]
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

    def test_large_retained_projection_has_exact_originals_and_keeps_current_finding_states(self):
        inputs = [{'path': 'source.py', 'digest': 'bound-source.py'}] + [
            {'path': 'retained/' + str(index), 'digest': 'original-' + str(index)} for index in range(1845)]
        self.context['current_validations'] = [{'evidence_path': 'full-native.json', 'evidence_sha256': 'd' * 64,
            'status': 'VERIFIED', 'environment_digest': 'environment', 'inputs': inputs, 'command': ['owned-check']}]
        self.context['unadopted_assessments'] = [{'round': index, 'actual_outcome': 'ERROR',
            'reported_review_status': 'COMPLETE', 'reported_verdict': 'APPROVED', 'status': 'UNADOPTED',
            'observations': [{'path': 'source.py', 'reported_status': 'REVIEWED', 'input_binding_valid': True,
                              'binding_error': None, 'changed_inputs': []}] +
                [{'path': 'other/' + str(n), 'reported_status': 'REVIEWED', 'input_binding_valid': True,
                  'binding_error': None, 'changed_inputs': []} for n in range(486)],
            'finding_ids': ['F3004'], 'finding_references': [{'id': 'F3004', 'file': 'source.py'}]} for index in range(13)]
        self.context['prior_findings'] = {
            'F3004': {'state': 'OPEN', 'file': 'source.py', 'affected_paths': ['source.py'], 'required_behavior': 'Preserve exact criteria'},
            'F1000': {'state': 'RESOLVED', 'file': 'source.py', 'affected_paths': ['source.py'], 'resolution': 'Historical fact'}}
        original = o._pretty(self.context)
        plan = parallel.partition(self.context, self.binding, self.digest)
        cohort = next(item for item in plan['cohorts'] if item['id'] == parallel.AREAS[1])
        packet = parallel.packet(self.context, plan, cohort, self.run/'review-context.json', self.digest)
        self.assertLessEqual(len(o._pretty(packet)), parallel.COHORT_PACKET_MAX_BYTES)
        self.assertEqual(packet['open_prior_finding_ids'], ['F3004'])
        self.assertEqual(packet['resolved_prior_finding_ids'], ['F1000'])
        self.assertEqual(packet['prior_findings'], self.context['prior_findings'])
        self.assertNotIn('inputs', packet['validation_references'][0])
        self.assertEqual(packet['validation_references'][0]['input_count'], len(inputs))
        self.assertEqual(packet['unadopted_assessments'][0]['actual_outcome'], 'ERROR')
        self.assertEqual(len(packet['unadopted_assessments'][0]['observations']), 1)
        refs = [packet['validation_references'][0]['original'], packet['unadopted_assessments'][0]['original']]
        for ref in refs:
            selected = self.context
            for component in ref['json_pointer'].split('/')[1:]:
                selected = selected[int(component)] if isinstance(selected, list) else selected[component]
            self.assertEqual(ref['value_sha256'], self.digest(selected))
            self.assertEqual(ref['parent_context_sha256'], self.digest(self.context))
            self.assertEqual(ref['eligibility'], 'NONE')
        self.assertEqual(o._pretty(self.context), original, 'Full native inputs and forensic records remain unchanged')
        stale = copy.deepcopy(self.context); stale['prior_findings']['F3004']['state'] = 'RESOLVED'
        with self.assertRaisesRegex(ValueError, 'exact sealed parent'):
            parallel.packet(stale, plan, cohort, self.run/'review-context.json', self.digest)

    def test_retained_fallback_and_mandatory_budget_preserve_original_facts(self):
        self.context['unadopted_assessments'] = [{'actual_outcome': 'ERROR', 'observations': [
            {'path': 'source.py', 'reported_status': 'REVIEWED', 'input_binding_valid': False,
             'binding_error': 'Large original binding diagnostic ' * 5000, 'changed_inputs': ['source.py']}], 'finding_references': []}]
        plan = parallel.partition(self.context, self.binding, self.digest)
        cohort = next(item for item in plan['cohorts'] if item['id'] == parallel.AREAS[1])
        packet = parallel.packet(self.context, plan, cohort, self.run/'review-context.json', self.digest)
        self.assertEqual(packet['unadopted_assessments'][0]['json_pointer'], '/unadopted_assessments')
        self.assertEqual(packet['unadopted_assessments'][0]['eligibility'], 'NONE')
        self.context['publication_scope']['mandatory_effect'] = '\\"多' * parallel.COHORT_PACKET_MAX_BYTES
        plan = parallel.partition(self.context, self.binding, self.digest)
        with self.assertRaisesRegex(ValueError, 'Mandatory cohort facts'):
            parallel.packet(self.context, plan, plan['cohorts'][0], self.run/'review-context.json', self.digest)

    def test_disposition_and_prepared_path_projection_keeps_exact_source_identity_and_original_facts(self):
        self.context['path_dispositions'] = [{'path': 'source.py', 'disposition': 'DEPENDENCY_CHANGED',
            'current_fact': {'object': 'current'}, 'last_verified_fact': {'object': 'prior'},
            'reasons': ['Exact original dependency changed']}, {'path': 'unchanged.py', 'disposition': 'REUSABLE_VERIFIED'}]
        plan = parallel.partition(self.context, self.binding, self.digest)
        cohort = next(item for item in plan['cohorts'] if item['id'] == parallel.AREAS[1])
        prepared = {'manifest': 'full-frontier.json', 'required_paths': cohort['required_paths'], 'prepared_pages': 12}
        packet = parallel.packet(self.context, plan, cohort, self.run/'review-context.json', self.digest, prepared)
        disposition = packet['path_dispositions']
        self.assertEqual(disposition['assigned_status_indices'], {'DEPENDENCY_CHANGED': [0]})
        self.assertEqual(disposition['original']['value_sha256'], self.digest(self.context['path_dispositions']))
        self.assertEqual(packet['input_hashes']['source.py'], 'bound-source.py')
        self.assertEqual(packet['cohort']['required_paths'], prepared['required_paths'])
        self.assertEqual(packet['prepared_source']['required_paths_sha256'], self.digest(prepared['required_paths']))
        self.assertNotIn('required_paths', packet['prepared_source'])
        self.assertEqual(prepared['required_paths'], cohort['required_paths'], 'Complete original frontier metadata remains unchanged')

    def test_actual_native_criterion_and_unadopted_shapes_preserve_applicability_facts(self):
        # An admitted unresolved source criterion stays individually assigned.
        self.context['prior_findings'] = {'F1000': {'state': 'OPEN', 'file': 'source.py', 'affected_paths': ['source.py']}}
        self.context['invalidated_coverage'] = [{'path': 'source.py', 'status': 'REVIEWED',
            'reason': 'Actual historical production criterion', 'invalidation_reasons': ['review_policy_digest'],
            'inputs': [{'path': 'source.py', 'digest': 'bound-source.py'},
                       {'path': 'unchanged.py', 'digest': 'bound-unchanged.py'}]}]
        self.context['unadopted_assessments'] = [{'round': 23, 'actual_outcome': 'ERROR',
            'reported_review_status': 'COMPLETE', 'reported_verdict': 'APPROVED',
            'guard_changes': ['review_policy_digest'], 'observations': [{'path': 'source.py',
                'reported_status': 'REVIEWED', 'input_binding_valid': True, 'binding_error': None,
                'changed_inputs': ['@proposal/scope']}], 'finding_references': []}]
        original = o._pretty(self.context)
        def projected():
            plan = parallel.partition(self.context, self.binding, self.digest)
            cohort = next(item for item in plan['cohorts'] if item['id'] == parallel.AREAS[1])
            return parallel.packet(self.context, plan, cohort, self.run/'review-context.json', self.digest), cohort
        packet, cohort = projected()
        navigation = packet['criterion_navigation']; group = navigation['groups'][0]
        self.assertEqual(navigation['original']['value_sha256'], self.digest(self.context['invalidated_coverage']))
        self.assertEqual(navigation['eligibility'], 'NONE')
        self.assertTrue(navigation['requires_independent_current_applicability'])
        self.assertEqual(group['invalidation_reasons'], ['review_policy_digest'])
        self.assertEqual(group['historical_status'], 'REVIEWED')
        self.assertEqual(group['criterion_pairs'], [[cohort['required_paths'].index('source.py'), 0]])
        self.assertTrue(group['all_recorded_dependencies_current'])
        self.assertEqual(packet['unadopted_assessments'][0]['observations'],
                         self.context['unadopted_assessments'][0]['observations'])
        self.assertEqual(packet['unadopted_assessments'][0]['actual_outcome'], 'ERROR')
        self.assertEqual(o._pretty(self.context), original)
        for bad_inputs in [[], [{'path': 'source.py', 'digest': 'stale'}],
                           [{'path': 'unknown.py', 'digest': 'foreign'}],
                           [{'path': 'source.py', 'digest': 'bound-source.py'}] * 2]:
            self.context['invalidated_coverage'][0]['inputs'] = bad_inputs
            packet, _ = projected()
            self.assertFalse(packet['criterion_navigation']['groups'][0]['all_recorded_dependencies_current'])

    def test_criterion_navigation_survives_retained_detail_fallback(self):
        self.context['prior_findings'] = {'F1000': {'state': 'OPEN', 'file': 'source.py', 'affected_paths': ['source.py']}}
        self.context['invalidated_coverage'] = [{'path': 'source.py', 'status': 'REVIEWED',
            'reason': 'Historical actual criterion', 'invalidation_reasons': ['review_policy_digest', 'environment_digest'],
            'inputs': [{'path': 'source.py', 'digest': 'bound-source.py'}]}]
        self.context['unadopted_assessments'] = [{'actual_outcome': 'ERROR', 'observations': [
            {'path': 'source.py', 'reported_status': 'REVIEWED', 'input_binding_valid': False,
             'binding_error': 'Original source moved', 'changed_inputs': ['exact-source'] * 10000}], 'finding_references': []}]
        plan = parallel.partition(self.context, self.binding, self.digest)
        cohort = next(item for item in plan['cohorts'] if item['id'] == parallel.AREAS[1])
        packet = parallel.packet(self.context, plan, cohort, self.run/'review-context.json', self.digest)
        self.assertEqual(packet['unadopted_assessments'][0]['json_pointer'], '/unadopted_assessments')
        self.assertEqual(packet['criterion_navigation']['groups'][0]['invalidation_reasons'],
                         ['review_policy_digest', 'environment_digest'])
        self.assertEqual(packet['criterion_navigation']['groups'][0]['criterion_pairs'], [[0, 0]])

    def retained_context(self, count=471):
        originals = []
        for index in range(count):
            name = 'clients/retained-' + str(index) + '.py'
            self.context['input_hashes'][name] = 'bound-' + name
            self.context['required_coverage_paths'].append(name)
            originals.append({'path': name, 'status': 'REVIEWED', 'reason': 'Actual original source observation',
                'inputs': [{'path': name, 'digest': 'bound-' + name}],
                'invalidation_reasons': ['review_policy_digest']})
        self.context['guards']['review_policy_digest'] = 'current-policy'
        self.context['invalidated_coverage'] = originals
        self.plan = parallel.partition(self.context, self.binding, self.digest)
        (self.run/'review-context.json').write_bytes(o._pretty(self.context))

    def test_actual_dispatch_collectively_assesses_unchanged_originals_and_expands_bound_members(self):
        self.retained_context()
        launches = []
        def child(root, prompt, prefix, *, schema_path, cohort_policy):
            run = o._RUN.get(); packet = json.loads((run/'cohort-context.json').read_text())
            cohort = packet['cohort']; launches.append(cohort['id'])
            self.assertLess(len(o._pretty(packet)), parallel.COHORT_PACKET_MAX_BYTES)
            self.assertFalse(any(name.startswith('clients/retained-') for name in cohort['required_paths']))
            if cohort['id'] == parallel.AREAS[0]:
                groups = packet['retained_criteria']['groups']
                self.assertEqual(sum(group['member_count'] for group in groups), 471)
                self.assertEqual(packet['retained_criteria']['original']['value_sha256'],
                                 self.digest(self.context['invalidated_coverage']))
                self.assertIn('explicit applicability', cohort_policy)
            result = self.envelope(cohort)
            for name, value in {'process.json': {'exit_code': 0}, 'result.json': result}.items():
                o._atomic_write(run/name, o._pretty(value))
            return result
        with patch.object(o, '_input_binding', return_value=self.binding), patch.object(o, '_review_process', side_effect=child):
            result = o._oracle(self.root, self.context['candidate_tree'], self.paths, {}, None)
        self.assertEqual((result['review_status'], result['verdict']), ('COMPLETE', 'APPROVED'))
        self.assertEqual(len(launches), 3)
        expanded = [row for row in result['coverage'] if row['path'].startswith('clients/retained-')]
        self.assertEqual(len(expanded), 471)
        self.assertEqual(len(result['criterion_adoptions']), 1)
        for row in expanded:
            o._checked_inputs(row['inputs'], self.context, required_path=row['path'])
            ref = row['retained_observation']; original = self.context['invalidated_coverage'][int(ref['json_pointer'].rsplit('/', 1)[1])]
            self.assertEqual(ref['value_sha256'], self.digest(original))
            self.assertIn('retained original source observation', row['reason'])
        self.assertFalse(any(row['path'].startswith('@retained-criterion/') for row in result['coverage']))

    def test_collective_adoption_excludes_changed_dependencies_and_requires_actual_independent_decision(self):
        self.retained_context(4)
        originals = self.context['invalidated_coverage']
        originals[1]['inputs'].append({'path': 'source.py', 'digest': 'old-source.py'})
        originals[1]['invalidation_reasons'].append('source.py content changed or missing')
        originals[2]['checkpoint_invalidation_reasons'] = ['Admitted missed defect']
        self.context['prior_findings'] = {'F1000': {'state': 'OPEN', 'file': originals[3]['path'], 'affected_paths': []}}
        self.plan = parallel.partition(self.context, self.binding, self.digest)
        self.assertEqual([group['original_coverage_indices'] for group in self.plan['retained_criteria']], [[0]])
        envelopes = self.all_envelopes(); cross = envelopes[parallel.AREAS[0]]
        virtual = next(row for row in cross['assessment']['coverage'] if row['path'].startswith('@retained-criterion/'))
        virtual['status'] = 'CARRIED_FORWARD'
        result = parallel.aggregate(o, self.plan, self.context, envelopes, [])
        self.assertEqual(result['review_status'], 'ERROR')
        self.assertNotIn(originals[0]['path'], {row['path'] for row in result['coverage']})
        # Even a syntactically valid independent response cannot adopt members
        # whose immutable original collection changed after partitioning.
        tampered = copy.deepcopy(self.context)
        tampered['invalidated_coverage'][0]['reason'] = 'tampered original observation'
        result = parallel.aggregate(o, self.plan, tampered, self.all_envelopes(), [])
        self.assertEqual(result['review_status'], 'ERROR')
        self.assertTrue(any('members changed' in reason for reason in result['limitations']))
        self.assertNotIn(originals[0]['path'], {row['path'] for row in result['coverage']})
        virtual['status'] = 'UNREVIEWED'; cross['assessment'].update(review_status='INCOMPLETE', verdict='INCOMPLETE', limitations=['Shared policy applicability unfinished'])
        result = parallel.aggregate(o, self.plan, self.context, envelopes, [])
        self.assertEqual(result['review_status'], 'INCOMPLETE')
        self.assertEqual(next(row['status'] for row in result['coverage'] if row['path'] == originals[0]['path']), 'UNREVIEWED')
        virtual['status'] = 'REVIEWED'; virtual['inputs'][0]['digest'] = 'forged-group'
        result = parallel.aggregate(o, self.plan, self.context, envelopes, [])
        self.assertEqual(result['review_status'], 'ERROR')
        self.assertNotIn(originals[0]['path'], {row['path'] for row in result['coverage']})

    def test_dispatch_budget_counts_complete_wrapped_escaped_payload(self):
        command = ['codex', '--developer', '\\"多' * 20, 'source prompt and current effect facts']
        context = o._pretty({'mandatory_effect': '\\"多' * 20})
        schema = o._pretty({'schema': '\\"多' * 20})
        component_sum = len(o._pretty(command)) + len(context) + len(schema)
        result = o._dispatch_budget(command, context, schema, component_sum)
        self.assertFalse(result['within_budget'], 'String escaping and wrapping must be included after components')
        self.assertGreater(result['serialized_bytes'], component_sum)
        self.assertTrue(o._dispatch_budget(command, context, schema, result['serialized_bytes'])['within_budget'])
        with self.assertRaises(UnicodeDecodeError):
            o._dispatch_budget(command, b'\xff', schema, 100000)

    def test_production_dispatch_rejects_oversized_complete_input_before_model_launch(self):
        context_path = self.run / 'cohort-context.json'
        context_path.write_bytes(o._pretty({'effect': 'Current mandatory effect'}))
        token = o._DISPATCH_BUDGET.set({'context_path': context_path, 'max_bytes': 1})
        try:
            with patch.object(o.subprocess, 'run') as process:
                with self.assertRaisesRegex(o.OracleApprovalError, 'Complete serialized native review launch'):
                    o._review_process(self.root, 'Current exact prompt', 'reviewer', cohort_policy=parallel.COHORT_POLICY)
                process.assert_not_called()
            measurement = json.loads((self.run/'dispatch-budget.json').read_text())
            self.assertFalse(measurement['within_budget'])
            self.assertEqual(measurement['context_sha256'], o._sha(context_path.read_bytes()))
        finally:
            o._DISPATCH_BUDGET.reset(token)

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

    def test_missing_structural_execution_inputs_do_not_dispatch_models(self):
        self.context['required_commands']=[{'id':'required','command':['npm','test']}]
        (self.run/'review-context.json').write_bytes(o._pretty(self.context))
        with patch.object(o,'_input_binding',return_value=self.binding), patch.object(o,'_review_process') as process:
            with self.assertRaisesRegex(o.OracleIntakeIncomplete,'bound original execution'):
                o._oracle(self.root,self.context['candidate_tree'],self.paths,{},None)
            process.assert_not_called()
        diagnostic=json.loads((self.run/'structural-intake.json').read_text())
        self.assertFalse(diagnostic['grants_coverage'])
        self.assertTrue(diagnostic['missing'])

    def test_structural_intake_retains_failed_originals_without_granting_applicability(self):
        original=self.root/'Vault/tmp/original.json';original.parent.mkdir(parents=True)
        output=original.with_suffix('.stdout.log');output.write_text('actual failed aggregate output')
        original.write_bytes(o._pretty({'kind':'oracle-validation-record-v1','exit_code':1,
            'command':['npm','test'],'output_hashes':{str(output):o._sha(output.read_bytes())}}))
        name=str(original)
        self.context['required_commands']=[{'id':'required','command':['npm','test']}]
        self.context['invalid_current_validations']=[{'evidence_path':name,'reason':'Requires original-plus-repair assessment'}]
        parallel.prepared_intake(o,self.root,self.context,self.plan,[],{},{name:o._sha(original.read_bytes())})
        diagnostic=json.loads((self.run/'structural-intake.json').read_text())
        self.assertEqual(diagnostic['original_observations'][0]['actual_exit_code'],1)
        self.assertEqual(diagnostic['original_observations'][0]['applicability'],'UNASSESSED')
        self.assertEqual(diagnostic['missing'],[])
        self.assertFalse(diagnostic['grants_coverage'])

    def test_queued_evidence_after_preparation_requires_rebinding_before_dispatch(self):
        from types import SimpleNamespace
        token=o._CONTROLLER.set(SimpleNamespace(evidence=lambda:['new-qualified-original.json']))
        try:
            with self.assertRaises(o.OracleIntakeIncomplete) as caught:
                parallel.prepared_intake(o,self.root,self.context,self.plan,[],{},{})
            self.assertEqual(caught.exception.evidence_paths,['new-qualified-original.json'])
        finally:o._CONTROLLER.reset(token)

    def test_meaningful_new_executable_scope_waits_for_matching_original_inputs(self):
        original=self.root/'Vault/tmp/repair.json';original.parent.mkdir(parents=True)
        output=original.with_suffix('.stdout.log');output.write_text('actual focused repair observation')
        value={'kind':'oracle-validation-record-v1','exit_code':0,'command':['owned-focused-case'],
               'inputs':[{'path':'source.py','digest':'older-source'}],
               'output_hashes':{str(output):o._sha(output.read_bytes())}}
        self.context.update(required_commands=[{'id':'required','command':['npm','test']}],
                            changed_since_previous=['source.py'],invalid_current_validations=[{'evidence_path':str(original)}])
        original.write_bytes(o._pretty(value))
        (self.run/'review-context.json').write_bytes(o._pretty(self.context))
        with patch.object(o,'_input_binding',return_value=self.binding), patch.object(o,'_review_process') as process:
            with self.assertRaisesRegex(o.OracleIntakeIncomplete,'Affected executable input'):
                o._oracle(self.root,self.context['candidate_tree'],self.paths,{str(original):o._sha(original.read_bytes())},None)
            process.assert_not_called()
        value['inputs'][0]['digest']=self.context['input_hashes']['source.py']
        original.write_bytes(o._pretty(value))
        parallel.prepared_intake(o,self.root,self.context,self.plan,[],{},{str(original):o._sha(original.read_bytes())})
        diagnostic=json.loads((self.run/'structural-intake.json').read_text())
        self.assertEqual(diagnostic['matched_affected_inputs'],1)
        self.assertFalse(diagnostic['grants_coverage'])

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

    def test_invalidated_projection_uses_exact_original_record_and_keeps_raw_claims(self):
        name = 'native.json'; original_inputs = [{'path': 'source.py', 'digest': 'bound-source.py'},
                                               {'path': 'unchanged.py', 'digest': 'bound-unchanged.py'}]
        raw = o._pretty({'kind': 'oracle-validation-record-v1', 'inputs': original_inputs,
                         'environment_digest': 'original-environment'})
        (self.root/name).write_bytes(raw)
        self.context['input_hashes'][name] = 'sha256:' + o._sha(raw)
        self.context['invalid_current_validations'] = [{'evidence_path': name, 'reason': 'Actual current environment differs'}]
        responses = self.all_envelopes(); claims = []
        for index, cohort in enumerate(self.plan['cohorts']):
            inputs = [original_inputs, [], [{'path': name, 'digest': self.context['input_hashes'][name]}, original_inputs[0]]][index]
            claim = {'evidence_path': name, 'status': 'INVALIDATED', 'inputs': inputs,
                     'environment_digest': 'original-environment', 'reason': 'Original remains ineligible ' + str(index)}
            responses[cohort['id']]['assessment']['validations'] = [claim]; claims.append(copy.deepcopy(claim))
        result = parallel.aggregate(o, self.plan, self.context, responses, [], root=self.root)
        self.assertEqual(result['verdict'], 'APPROVED')
        self.assertEqual(result['validations'][0]['status'], 'INVALIDATED')
        self.assertEqual(result['validations'][0]['inputs'], original_inputs)
        self.assertEqual([responses[c['id']]['assessment']['validations'][0] for c in self.plan['cohorts']], claims)
        self.assertEqual(len(result['validation_projection_origins']), 2)
        self.assertTrue(all(row['eligibility'] == 'NONE' for row in result['validation_projection_origins']))
        area = self.plan['cohorts'][1]['id']
        for field, value in [('status', 'VERIFIED'), ('environment_digest', 'foreign-environment'),
                             ('inputs', [{'path': 'source.py', 'digest': 'foreign-source'}]),
                             ('evidence_sha256', 'foreign-proof')]:
            changed = copy.deepcopy(responses); changed[area]['assessment']['validations'][0][field] = value
            with self.subTest(field=field):
                self.assertEqual(parallel.aggregate(o, self.plan, self.context, changed, [], root=self.root)['verdict'], 'ERROR')
        (self.root/name).write_bytes(raw + b' ')
        self.assertEqual(parallel.aggregate(o, self.plan, self.context, responses, [], root=self.root)['verdict'], 'ERROR')

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
        for mode in ('child-failure', 'context-moved', 'context-missing', 'packet-moved'):
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
                        if mode == 'context-missing':
                            (target / 'review-context.json').unlink()
                        elif mode == 'packet-moved':
                            path = run / 'cohort-context.json'
                            path.write_bytes(path.read_bytes() + b' ')
                        else:
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


class RawObservationCriterion(unittest.TestCase):
    """Native ERROR keeps completed bodies without transferring approval."""
    def setUp(self):
        import oracle_review_series as fixtures
        self.fixture = fixtures.ReviewSeries('runTest')
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root = self.fixture.root
        def drift(context):
            result = self.fixture.result(context)
            run = o._RUN.get()
            # Synthetic native producer metadata; this fixture launches no model.
            o._atomic_write(run / 'model.json', o._pretty({'reviewer_role': 'independent-oracle-approver'}))
            o._atomic_write(run / 'process.json', o._pretty({'exit_code': 0}))
            o._atomic_write(run / 'result.json', o._pretty(result))
            self.fixture.change('peer.py', 'concurrent source movement')
            return result
        self.fixture.submit(drift, error=o.OracleSourceBindingError)
        self.rounds = o._read_rounds(o._series_directory(self.root, self.fixture.base))
        self.original = self.fixture.contexts[-1]
        self.inputs = dict(self.original['input_hashes'])
        self.inputs.update(o._candidate_inputs(self.root, o._tree(self.root), {}))
        self.guards = self.original['guards']

    def candidates(self, inputs=None):
        return o._raw_criterion_candidates(self.root, self.rounds,
            self.inputs if inputs is None else inputs, self.guards)

    def test_postcheck_error_reuses_only_unchanged_completed_body_after_independent_adoption(self):
        self.assertEqual(self.rounds[-1]['outcome'], 'ERROR')
        self.assertEqual(self.rounds[-1]['verified_coverage'], [])
        candidates = self.candidates()
        self.assertEqual([row['path'] for row in candidates], ['source.py'])
        context = dict(self.original, input_hashes=self.inputs, reusable_coverage=[],
                       invalidated_coverage=candidates, prior_findings={})
        digest = lambda value: o._sha(o._canonical(value))
        binding = {'reviewer_settings': {'model': 'synthetic-model', 'reasoning_effort': None}}
        plan = parallel.partition(context, binding, digest)
        self.assertEqual(len(plan['retained_criteria']), 1)
        group = plan['retained_criteria'][0]
        self.assertTrue(group['unadopted_observation'])
        self.assertIn('peer.py', plan['required_paths'])
        self.assertNotIn('source.py', plan['required_paths'])
        effective = parallel._criterion_context(context, plan)
        decision = {'coverage': [{'path': group['path'], 'status': 'CARRIED_FORWARD',
            'inputs': [{'path': group['path'], 'digest': effective['input_hashes'][group['path']]}],
            'reason': 'Identity alone grants no adoption'}]}
        with self.assertRaises(o.OracleApprovalError):
            parallel._expanded_criteria(o, context, plan, decision)
        decision['coverage'][0].update(status='REVIEWED', reason='Independently assessed current criteria and exact retained dependency/source identities')
        expanded, _ = parallel._expanded_criteria(o, context, plan, decision)
        self.assertEqual([row['path'] for row in expanded['coverage']], ['source.py'])
        self.assertEqual(self.rounds[-1]['outcome'], 'ERROR')
        self.assertFalse(o.receipt_path(self.root).exists())
        changed = copy.deepcopy(context)
        changed['invalidated_coverage'][0]['raw_observation']['record_sha256'] = 'forged'
        with self.assertRaisesRegex(o.OracleApprovalError, 'members changed'):
            parallel._expanded_criteria(o, changed, plan, decision)

    def test_tampered_output_or_foreign_producer_role_cannot_form_a_raw_criterion(self):
        raw = self.rounds[-1]['raw_assessment']
        result = Path(raw['result_file']); original = result.read_bytes()
        result.write_bytes(original + b' ')
        self.assertEqual(self.candidates(), [])
        result.write_bytes(original)
        model = result.parent / 'model.json'
        model.write_bytes(o._pretty({'reviewer_role': 'ordinary-implementation-agent'}))
        self.assertEqual(self.candidates(), [])

    def test_changed_inputs_and_negative_rows_remain_individual_assignments(self):
        changed = dict(self.inputs, **{'source.py': 'changed-source'})
        self.assertEqual(self.candidates(changed), [])
        record, raw, assessment, original = next(o._raw_assessment_origins(self.root, self.rounds))
        result_file = Path(raw['result_file'])
        for status in ['UNREVIEWED', 'BROKEN']:
            candidate = copy.deepcopy(assessment)
            next(row for row in candidate['coverage'] if row['path'] == 'source.py').update(status=status)
            result_file.write_bytes(o._pretty(candidate))
            variant = dict(raw, result_sha256=o._sha(result_file.read_bytes()))
            with patch.object(o, '_raw_assessment_origins', return_value=iter([(record, variant, candidate, original)])):
                self.assertEqual(self.candidates(), [])


if __name__ == '__main__':
    unittest.main()
