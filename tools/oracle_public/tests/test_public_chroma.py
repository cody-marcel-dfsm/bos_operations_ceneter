"""Actual cached-embedding retrieval over this public corpus; no skips or downloads."""
import json
import os
from pathlib import Path
import unittest
from oracle_core.config import load
from oracle_core.index import Index

ROOT = Path(__file__).resolve().parents[1]


class PublicChroma(unittest.TestCase):
    def test_real_public_index_has_hash_bound_relevant_source(self):
        root, config = load(ROOT / 'oracle.project.json')
        state = root / config['state']
        if os.environ.get('ORACLE_PUBLIC_SHARED_STATE'):
            self.assertEqual(Path(os.environ['ORACLE_PUBLIC_SHARED_STATE']).resolve(), state.resolve())
        corpus = config['corpus']
        index = Index(root / corpus['root'], corpus['sources'], state / 'index')
        evidence = index.snapshot_evidence('Reject a title made entirely of whitespace before persistence', limit=1)
        rows = evidence['queries'][0]['results']
        self.assertTrue(rows)
        self.assertEqual(rows[0]['source'], 'example-architecture.md')
        self.assertEqual(len(rows[0]['source_sha256']), 64)
        self.assertEqual(len(rows[0]['chunk_sha256']), 64)
        self.assertEqual(rows[0]['index_configuration_sha256'], evidence['index_configuration_sha256'])
        self.assertEqual(set(evidence['source_hashes']), set(corpus['sources']))


if __name__ == '__main__':
    unittest.main()
