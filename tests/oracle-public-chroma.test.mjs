import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('actual Chroma retrieves public evidence and refuses stale, deleted, tampered or escaping data',()=>{
const code=String.raw`
import json,tempfile,unittest
from pathlib import Path
from oracle_core.index import Index,canonical_digest
ROOT=Path.cwd()
class Retrieval(unittest.TestCase):
 def setUp(self):
  self.root=Path(tempfile.mkdtemp(prefix='oracle-real-chroma-',dir=ROOT/'Vault/tmp'));self.corpus=self.root/'corpus';self.corpus.mkdir()
  self.source=self.corpus/'architecture.md';self.source.write_bytes((ROOT/'tests/fixtures/oracle-public/corpus/architecture.md').read_bytes())
  self.index=Index(self.corpus,['architecture.md'],self.root/'state');self.index.sync()
 def test_real_embedding_search_and_snapshot(self):
  for case in json.loads((ROOT/'tests/fixtures/oracle-public/relevance.json').read_text())['cases']:
   matches=self.index.query(case['query']);self.assertIn(matches[0]['source'],case['relevant_sources']);self.assertEqual(len(matches[0]['source_sha256']),64);self.assertEqual(len(matches[0]['chunk_sha256']),64)
  value=self.index.snapshot_evidence('Evidence boundaries');self.assertEqual(value['source_hashes'],self.index.snapshot());self.assertIn('embedding_cache_sha256',value['index_configuration'])
 def test_stale_and_deleted_sources_deny(self):
  self.source.write_text('Changed corpus')
  with self.assertRaises(RuntimeError):self.index.query('policy')
  self.index.sync();self.source.unlink()
  with self.assertRaises(FileNotFoundError):self.index.query('policy')
 def test_manifest_tamper_denied(self):
  path=self.root/'state/manifests/latest.json';value=json.loads(path.read_text());value['source_hashes']['architecture.md']='0'*64;path.write_text(json.dumps(value))
  with self.assertRaises(RuntimeError):self.index.query('policy')
 def test_collection_chunk_tamper_denied(self):
  collection=self.index.get_collection();items=collection.get();collection.update(ids=[items['ids'][0]],documents=['Untrusted replacement without source binding'])
  with self.assertRaises(RuntimeError):self.index.query('policy')
 def test_sources_fail_closed(self):
  with self.assertRaises(ValueError):Index(self.corpus,['../outside'],self.root/'other')
  (self.corpus/'linked.md').symlink_to(self.source)
  with self.assertRaises(ValueError):Index(self.corpus,['linked.md'],self.root/'other')
unittest.main()
`;
const run=spawnSync('Vault/index/venv/bin/python',['-B','-c',code],{cwd:new URL('../',import.meta.url),env:{...process.env,PYTHONPATH:'tools',PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
assert.equal(run.status,0,`${run.stdout}\n${run.stderr}`);assert.match(run.stderr,/Ran 5 tests/);assert.doesNotMatch(run.stderr,/skipped=/);
});
