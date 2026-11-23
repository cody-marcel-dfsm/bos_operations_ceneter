"""Verify the installed exact artifact independently of any private repository."""
import ast
import hashlib
import importlib
import json
from pathlib import Path, PurePosixPath
import unittest
from oracle_core import spec
from test_proposal_to_spec import synthetic_review

ROOT = Path(__file__).resolve().parents[1]


class ArtifactBoundary(unittest.TestCase):
    def test_every_public_member_matches_its_committed_provenance(self):
        manifest = json.loads((ROOT / 'oracle-export-manifest.json').read_text())
        self.assertRegex(manifest['source_commit'], r'^[0-9a-f]{40}$')
        self.assertRegex(manifest['source_tree'], r'^[0-9a-f]{40}$')
        self.assertRegex(manifest['origin_main'], r'^[0-9a-f]{40}$')
        provenance = {'engine': 'codex', 'model': 'synthetic-no-model-call',
                      'core_sha256': 'a' * 64, 'host_sha256': 'b' * 64,
                      **{key: manifest[key] for key in ('source_commit', 'source_tree', 'origin_main')}}
        catalog = json.loads((ROOT / 'validation-catalog.json').read_text())
        result = spec.materialize(synthetic_review(), 'Synthetic artifact boundary check', catalog, provenance)
        self.assertEqual(result['stamp']['origin_main'], manifest['origin_main'])
        self.assertEqual(len(manifest['members']), 30)
        seen = set()
        for member in manifest['members']:
            name = member['path']
            self.assertNotIn(name, seen)
            seen.add(name)
            self.assertFalse(PurePosixPath(name).is_absolute())
            self.assertFalse(set(PurePosixPath(name).parts) & {'..', '.git', 'Vault', 'source', 'products'})
            path = ROOT / name
            self.assertFalse(path.is_symlink())
            body = path.read_bytes()
            self.assertEqual(len(body), member['size'])
            self.assertEqual(hashlib.sha256(body).hexdigest(), member['sha256'])
            self.assertEqual(hashlib.sha1(b'blob ' + str(len(body)).encode() + b'\0' + body).hexdigest(), member['git_blob'])
        self.assertTrue({'LICENSE', 'NOTICE', 'oracle_core/cli.py', 'oracle.project.json'} <= seen)
        self.assertIn('Apache License', (ROOT / 'LICENSE').read_text())

    def test_core_imports_are_standalone_and_have_no_repository_adapter(self):
        for path in (ROOT / 'oracle_core').glob('*.py'):
            tree = ast.parse(path.read_text())
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.module:
                    self.assertFalse(node.module.startswith(('tools.', 'oracle_oc_adapter', 'production_utilities')))
            importlib.import_module('oracle_core.' + path.stem)


if __name__ == '__main__':
    unittest.main()
