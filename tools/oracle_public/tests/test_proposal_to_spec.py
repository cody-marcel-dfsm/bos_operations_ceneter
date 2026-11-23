"""Provider-free tests of actual spec materialization, explicitly synthetic inputs."""
import copy
import json
import tempfile
from unittest.mock import patch
from pathlib import Path
import unittest
from oracle_core import spec, seal, proposal

ROOT = Path(__file__).resolve().parents[1]


def synthetic_review():
    return {'review_status': 'COMPLETE', 'verdict': 'APPROVED',
            'summary': 'Synthetic materialization fixture; no model invoked', 'findings': [],
            'validation_selection': {'change_class': 'bug_fix', 'scope_paths': ['examples/proposal.txt'],
                'categories': [{'name': 'sanity', 'tests': [], 'fixtures': []},
                               {'name': 'focused', 'tests': ['tests/test_proposal_to_spec.py'], 'fixtures': []}],
                'reason': 'Synthetic fixture', 'revision_of': None, 'design': None,
                'acceptance': ['A complete synthetic plan binds required tests'],
                'acceptance_tests': [{'module': 'tests/test_proposal_to_spec.py', 'covers': [0], 'purpose': 'Check binding'}]}}


class ProposalMaterialization(unittest.TestCase):
    def test_sealed_plan_uses_exact_trusted_catalog_and_rejects_tampering(self):
        catalog = json.loads((ROOT / 'validation-catalog.json').read_text())
        provenance = {'engine': 'codex', 'model': 'synthetic-no-model-call',
                      'mode': 'synthetic-materialization-unit', 'core_sha256': 'a' * 64,
                      'host_sha256': 'b' * 64, 'source_commit': 'c' * 40, 'source_tree': 'd' * 40, 'origin_main': 'e' * 40}
        result = spec.materialize(synthetic_review(), 'Synthetic proposal', catalog, provenance)
        self.assertEqual(result['stamp']['origin_main'], 'e' * 40)
        self.assertNotEqual(result['stamp']['origin_main'], result['base_commit'])
        missing = dict(provenance)
        del missing['origin_main']
        with self.assertRaises(ValueError):
            spec.materialize(synthetic_review(), 'Synthetic proposal', catalog, missing)
        self.assertEqual(result['kind'], 'oracle-spec/1')
        self.assertEqual(result['schema'], 'boc.validation-contract/v2')
        self.assertTrue(seal.seal_matches(result))
        self.assertEqual(spec.verify(result), result)
        self.assertEqual(result['commands'][1]['argv'], catalog['modules']['tests/test_proposal_to_spec.py'])
        changed = copy.deepcopy(result)
        changed['selection']['acceptance'][0] = 'Changed after sealing'
        self.assertFalse(seal.seal_matches(changed))
        with self.assertRaises(ValueError):
            spec.verify(changed)

    def test_missing_acceptance_and_unlisted_commands_fail(self):
        catalog = json.loads((ROOT / 'validation-catalog.json').read_text())
        for mutate in [lambda r: r['validation_selection'].update(acceptance_tests=[]),
                       lambda r: r['validation_selection']['categories'][1].update(tests=['tests/unlisted.py'])]:
            review = synthetic_review()
            mutate(review)
            with self.assertRaises(ValueError):
                spec.validate_review(review, catalog)


    def test_feature_plan_portable_consumer_refuses_invalid_boundaries(self):
        with tempfile.TemporaryDirectory(prefix='oracle-portable-plan-') as directory:
            root = Path(directory)
            (root / 'design.md').write_text('Synthetic design')
            from oracle_core.custody import digest
            selection = {'change_class': 'feature', 'design': 'design.md',
                         'scope_paths': ['src/*.py'],
                         'categories': [{'name': 'interactions', 'tests': ['tests/check.py']}]}
            review = {'validation_selection': selection}
            plan = {'kind': 'boc.feature-test-plan/v1', 'feature': 'Synthetic',
                    'design': 'design.md', 'design_sha256': digest((root / 'design.md').read_bytes()),
                    'runtime_paths': ['src/a.py'], 'tests': [
                        {'module': 'tests/check.py', 'covers': ['src/a.py'], 'purpose': 'Exercise boundary'}]}
            target = root / 'design.test-plan.json'
            target.write_text(json.dumps(plan))
            binding = proposal.feature_binding(root, review)
            self.assertEqual(binding['plan_sha256'], digest(target.read_bytes()))
            self.assertEqual(binding['tests'], ['tests/check.py'])
            mutations = [
                lambda p: p.update(runtime_paths=['outside.py']),
                lambda p: p.update(extra=True),
                lambda p: p.update(feature=''),
                lambda p: p.update(feature='x' * 65536),
                lambda p: p['tests'][0].update(purpose=''),
                lambda p: p['tests'].append(copy.deepcopy(p['tests'][0])),
                lambda p: p['tests'][0].update(covers=['src/unknown.py']),
                lambda p: p['tests'][0].update(extra=True)]
            for index, mutate in enumerate(mutations):
                with self.subTest(case=index):
                    invalid = copy.deepcopy(plan)
                    mutate(invalid)
                    target.write_text(json.dumps(invalid))
                    with self.assertRaises(ValueError):
                        proposal.feature_binding(root, review)

    def test_private_sealed_values_are_refused_before_hashing(self):
        catalog = json.loads((ROOT / 'validation-catalog.json').read_text())
        provenance = {'engine': 'codex', 'model': 'synthetic', 'core_sha256': 'a' * 64,
                      'host_sha256': 'b' * 64, 'source_commit': 'c' * 40,
                      'source_tree': 'd' * 40, 'origin_main': 'e' * 40}
        values = ['/' + 'Users/' + 'synthetic/private',
                  'api' + '_key=' + 'syntheticvalueonly',
                  'Bearer ' + 'syntheticvalueonly',
                  'Cookie' + ': synthetic']
        for index, value in enumerate(values):
            for field in ['reason', 'acceptance', 'purpose', 'runtime', 'command']:
                with self.subTest(case=index, field=field):
                    review = synthetic_review()
                    runtime = copy.deepcopy(provenance)
                    commands = copy.deepcopy(catalog)
                    if field == 'reason': review['validation_selection']['reason'] = value
                    elif field == 'acceptance': review['validation_selection']['acceptance'] = [value]
                    elif field == 'purpose': review['validation_selection']['acceptance_tests'][0]['purpose'] = value
                    elif field == 'runtime': runtime['nested'] = {'values': [value]}
                    else: commands['modules']['tests/test_proposal_to_spec.py'] = ['python', value]
                    with patch.object(spec, 'identity') as identity, patch.object(spec, 'compute_seal') as compute:
                        with self.assertRaises(ValueError) as error:
                            spec.materialize(review, 'Synthetic proposal', commands, runtime)
                        identity.assert_not_called()
                        compute.assert_not_called()
                        self.assertNotIn(value, str(error.exception))


if __name__ == '__main__':
    unittest.main()
