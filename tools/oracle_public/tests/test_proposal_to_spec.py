"""Provider-free tests of actual spec materialization, explicitly synthetic inputs."""
import copy
import json
from pathlib import Path
import unittest
from oracle_core import spec, seal

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
                      'host_sha256': 'b' * 64, 'source_commit': 'c' * 40, 'source_tree': 'd' * 40}
        result = spec.materialize(synthetic_review(), 'Synthetic proposal', catalog, provenance)
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


if __name__ == '__main__':
    unittest.main()
