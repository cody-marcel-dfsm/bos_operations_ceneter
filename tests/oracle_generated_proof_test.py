"""Deterministic generated-output proof: regenerate, byte-compare, fail closed."""
from pathlib import Path
import json
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import oracle_approval as o

GENERATOR = r'''
import json, pathlib, sys
root = pathlib.Path('.')
if (root / 'fail-generator').exists():
    sys.exit(3)
for source in sorted(root.glob('source/*/SKILL.md')):
    target = root / 'clients/plugin/skills' / source.parent.name / 'SKILL.md'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(source.read_bytes())
names = sorted(p.parent.name for p in root.glob('source/*/SKILL.md'))
(root / 'skill-release-manifest.json').write_text(json.dumps(names) + '\n')
if (root / 'touch-canonical').exists():
    (root / 'source/alpha/SKILL.md').write_text('rewritten by generator\n')
'''


def skill(name, version, requires, body='Body text.\n'):
    encoded = json.dumps(requires, separators=(',', ':')).replace('"', '\\"')
    return (f'---\nname: {name}\ndescription: Synthetic {name}.\nmetadata:\n  version: "{version}"\n'
            f'  requires: "{encoded}"\n---\n\n# {name}\n\n{body}')


class GeneratedProof(unittest.TestCase):
    def setUp(self):
        from tools import oracle_generated_proof as proof
        self.proof = proof
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve() / 'repo'
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        for args in [('config', 'user.name', 'Synthetic Reviewer'), ('config', 'user.email', 'review@example.invalid')]:
            subprocess.run(['git', *args], cwd=self.root, check=True)
        (self.root / 'gen.py').write_text(GENERATOR)
        self.write('source/alpha/SKILL.md', skill('alpha', '1.0.0', {}))
        self.write('source/beta/SKILL.md', skill('beta', '1.0.0', {'alpha': '1.0.0'}))
        self.generate()
        self.baseline = self.commit('baseline')
        self.run_dir = Path(self.temp.name).resolve() / 'run'
        self.run_dir.mkdir()

    def write(self, path, text):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text)

    def generate(self):
        subprocess.run([sys.executable, 'gen.py'], cwd=self.root, check=True)

    def commit(self, message):
        subprocess.run(['git', 'add', '-A'], cwd=self.root, check=True)
        subprocess.run(['git', 'commit', '-qm', message], cwd=self.root, check=True)
        return subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=self.root, check=True,
                              capture_output=True, text=True).stdout.strip()

    def tree(self):
        return subprocess.run(['git', 'rev-parse', 'HEAD^{tree}'], cwd=self.root, check=True,
                              capture_output=True, text=True).stdout.strip()

    def changed(self):
        return subprocess.run(['git', 'diff', '--name-only', self.baseline, 'HEAD'], cwd=self.root, check=True,
                              capture_output=True, text=True).stdout.split()

    def prove(self):
        return self.proof.prove(o, self.root, self.tree(), self.baseline, self.changed(), self.run_dir,
                                generator=[sys.executable, 'gen.py'], timeout=60)

    def cascade(self, body_change=False):
        self.write('source/alpha/SKILL.md', skill('alpha', '1.0.1', {}, 'Changed canonical body.\n'))
        self.write('source/beta/SKILL.md', skill('beta', '1.0.1', {'alpha': '1.0.1'},
                                                 'Extra body.\n' if body_change else 'Body text.\n'))
        self.generate()
        return self.commit('cascade')

    def test_matching_regeneration_verifies_generated_and_metadata_paths_only(self):
        self.cascade()
        result = self.prove()
        self.assertEqual(result['kind'], 'boc-deterministic-generated-proof-v1')
        self.assertEqual(result['candidate_tree'], self.tree())
        self.assertEqual(result['baseline_commit'], self.baseline)
        self.assertEqual(result['generator_exit_code'], 0)
        self.assertEqual(sorted(result['generated_paths']), ['clients/plugin/skills/alpha/SKILL.md',
                                                             'clients/plugin/skills/beta/SKILL.md'])
        self.assertEqual(result['metadata_paths'], ['source/beta/SKILL.md'])
        covered = self.proof.covered_paths({'candidate_tree': self.tree(), 'deterministic_coverage': result})
        self.assertNotIn('source/alpha/SKILL.md', covered)
        self.assertIn('source/beta/SKILL.md', covered)

    def test_tampered_extra_or_missing_generated_output_fails_closed(self):
        self.cascade()
        for mutate in ('tamper', 'extra', 'missing'):
            with self.subTest(mutate=mutate):
                path = self.root / 'clients/plugin/skills/beta/SKILL.md'
                original = path.read_bytes()
                if mutate == 'tamper':
                    path.write_text('hand edited\n')
                elif mutate == 'extra':
                    self.write('clients/plugin/skills/unknown/SKILL.md', 'unknown generated path\n')
                else:
                    path.unlink()
                self.commit(mutate)
                with self.assertRaisesRegex(o.OracleApprovalError, 'do not reproduce'):
                    self.prove()
                for stray in self.root.glob('clients/plugin/skills/unknown'):
                    subprocess.run(['rm', '-rf', str(stray)], check=True)
                path.write_bytes(original)
                self.commit('restore ' + mutate)

    def test_generator_failure_or_canonical_edit_fails_closed(self):
        self.cascade()
        (self.root / 'fail-generator').write_text('1')
        self.commit('fail')
        with self.assertRaisesRegex(o.OracleApprovalError, 'generator'):
            self.prove()
        (self.root / 'fail-generator').unlink()
        (self.root / 'touch-canonical').write_text('1')
        self.commit('touch')
        with self.assertRaisesRegex(o.OracleApprovalError, 'do not reproduce'):
            self.prove()

    def test_metadata_predicate_keeps_substantive_changes_in_model_review(self):
        versions = {'alpha': '1.0.1', 'gamma': '1.0.0'}
        old = skill('beta', '1.0.0', {'alpha': '1.0.0'})
        accepted = skill('beta', '1.0.1', {'alpha': '1.0.1'})
        self.assertTrue(self.proof.metadata_only(old, accepted, versions))
        rejected = {
            'body': skill('beta', '1.0.1', {'alpha': '1.0.1'}, 'Other body.\n'),
            'added dependency': skill('beta', '1.0.1', {'alpha': '1.0.1', 'gamma': '1.0.0'}),
            'removed dependency': skill('beta', '1.0.1', {}),
            'renamed skill': skill('beta2', '1.0.1', {'alpha': '1.0.1'}),
            'same version': skill('beta', '1.0.0', {'alpha': '1.0.1'}),
            'lower version': skill('beta', '0.9.9', {'alpha': '1.0.1'}),
            'wrong pin': skill('beta', '1.0.1', {'alpha': '1.0.0'}),
            'other frontmatter': accepted.replace('description: Synthetic beta.', 'description: Changed.'),
            'malformed': accepted.replace('  requires: "', '  requires: "{', 1),
            'duplicate version': accepted.replace('  version: "1.0.1"\n', '  version: "1.0.1"\n  version: "1.0.2"\n'),
        }
        for label, new in rejected.items():
            with self.subTest(label=label):
                self.assertFalse(self.proof.metadata_only(old, new, versions))

    def test_body_change_in_cascaded_skill_stays_in_model_review(self):
        self.cascade(body_change=True)
        result = self.prove()
        self.assertEqual(result['metadata_paths'], [])

    def test_partition_and_completeness_consume_only_matching_native_proof(self):
        from tools import oracle_parallel
        self.cascade()
        result = self.prove()
        required = sorted(self.changed())
        context = {'required_coverage_paths': required, 'reusable_coverage': [], 'invalidated_coverage': [],
                   'candidate_tree': self.tree(), 'base_commit': 'synthetic', 'guards': {},
                   'input_hashes': {name: 'sha256:x' for name in required}, 'deterministic_coverage': result}
        binding = {'reviewer_settings': {}}
        digest = lambda value: o._sha(o._canonical(value))
        plan = oracle_parallel.partition(context, binding, digest)
        self.assertEqual(plan['required_paths'], ['source/alpha/SKILL.md'])
        stale = dict(context, deterministic_coverage=dict(result, candidate_tree='0' * 40))
        self.assertEqual(oracle_parallel.partition(stale, binding, digest)['required_paths'], required)
        forged = dict(context, deterministic_coverage=dict(result, kind='model-claim'))
        self.assertEqual(oracle_parallel.partition(forged, binding, digest)['required_paths'], required)
        self.assertEqual(self.proof.covered_paths(stale), set())


if __name__ == '__main__':
    unittest.main()
