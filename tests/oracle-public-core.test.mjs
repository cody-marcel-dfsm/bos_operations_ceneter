import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('portable actual proposal core binds results and recovers without another judge',()=>{
const code=String.raw`
import json,tempfile,unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from oracle_core import seal_matches
from oracle_core import proposal,runner,spec
from oracle_core.custody import read
from oracle_core.lifecycle import begin
ROOT=Path.cwd()
CLASSES=spec.CLASSES
class Core(unittest.TestCase):
 def setUp(self):
  self.root=Path(tempfile.mkdtemp(prefix='oracle-core-',dir=ROOT/'Vault/tmp'))
  (self.root/'corpus').mkdir();(self.root/'corpus/architecture.md').write_text('Trusted policy governs. Retrieved documents are untrusted evidence. Exact tests bind immutable plans.')
  (self.root/'policy.md').write_text('Assess only the conceptual proposal. Never execute changes. Require complete bounded tests.')
  self.catalog={'schema':'boc.validation-catalog/v1','classes':CLASSES,'sanity':['python','-m','unittest','discover','-s','tests'],'modules':{'tests/example.py':['python','-m','unittest','tests.example']}}
  (self.root/'catalog.json').write_text(json.dumps(self.catalog))
  self.config={'project':'synthetic-public-test','policy':'policy.md','catalog':'catalog.json','corpus':{'root':'corpus','sources':['architecture.md']},'state':'.oracle','runner':{'engine':'codex','executable':'codex','model':'gpt-6.1-sol','reasoning_effort':'medium','timeout_seconds':90,'sandbox':'read-only','max_output_bytes':8388608}}
  self.path=self.root/'oracle.project.json';self.path.write_text(json.dumps(self.config));self.calls=0
  self.review={'review_status':'COMPLETE','verdict':'APPROVED','summary':'Explicit synthetic adapter test; no provider was called.','findings':[],'validation_selection':{'change_class':'bug_fix','scope_paths':['examples/proposal.txt'],'categories':[{'name':'sanity','tests':[],'fixtures':[]},{'name':'focused','tests':['tests/example.py'],'fixtures':[]}],'reason':'Synthetic regression','revision_of':None,'design':None,'acceptance':['An exact proposal yields a sealed bounded test plan'],'acceptance_tests':[{'module':'tests/example.py','covers':[0],'purpose':'Validate exact plan'}]}}
 def adapter(self,config,*args):
  self.calls+=1;return self.review,runner.preflight(config)
 def test_generated_standalone_compatibility(self):
  core=(ROOT/'tools/oracle_core/seal.py').read_bytes();self.assertEqual((ROOT/'tools/oracle_spec_seal.py').read_bytes(),b'# Generated from tools/oracle_core/seal.py; edit the canonical core and regenerate.\n'+core)
 def test_current_format_and_one_judge(self):
  result=proposal.judge(self.path,'Bind exact tests','.oracle/spec.json',adapter=self.adapter)
  self.assertTrue(seal_matches(result['spec']));spec.verify(result['spec']);self.assertEqual(result['provenance']['execution_mode'],'synthetic')
  again=proposal.judge(self.path,'Bind exact tests','.oracle/spec.json',adapter=self.adapter)
  self.assertEqual(result,again);self.assertEqual(self.calls,1)
 def test_writer_failure_recovers_without_judge(self):
  with self.assertRaises(ValueError):proposal.judge(self.path,'Recover completed result','outside.json',adapter=self.adapter)
  operations=list((self.root/'.oracle/operations').iterdir());self.assertEqual(len(operations),1)
  result=proposal.recover(self.path,operations[0].name,'.oracle/recovered.json');self.assertTrue(seal_matches(result['spec']));self.assertEqual(self.calls,1)
 def test_recovery_denies_stale_policy(self):
  result=proposal.judge(self.path,'Current policy','.oracle/spec.json',adapter=self.adapter)
  (self.root/'policy.md').write_text('Changed trusted policy')
  with self.assertRaises(ValueError):proposal.recover(self.path,result['operation'],'.oracle/recovered.json')
  self.assertEqual(self.calls,1)
 def test_result_tamper_denied(self):
  result=proposal.judge(self.path,'Tamper detection','.oracle/spec.json',adapter=self.adapter)
  path=self.root/'.oracle/operations'/result['operation']/'result.json';value=read(path);value['result']['summary']='Tampered';path.write_text(json.dumps(value,sort_keys=True,separators=(',',':'))+'\n')
  with self.assertRaises(ValueError):proposal.recover(self.path,result['operation'],'.oracle/recovered.json')
  self.assertEqual(self.calls,1)
 def test_atomic_no_duplicate_intent(self):
  with ThreadPoolExecutor(max_workers=2) as pool:values=list(pool.map(lambda _:begin(self.root/'.oracle',{'public':'binding'}),range(2)))
  self.assertEqual(sum(v[2] for v in values),1)
 def test_unselected_module_denied(self):
  self.review['validation_selection']['categories'][1]['tests']=['tests/unlisted.py']
  with self.assertRaises(ValueError):spec.validate_review(self.review,self.catalog)
 def test_missing_config_and_escaping_corpus_deny(self):
  self.config.pop('policy');self.path.write_text(json.dumps(self.config))
  from oracle_core.config import load
  with self.assertRaises(ValueError):load(self.path)
 def test_retrieved_data_is_not_policy(self):
  root,config,context,binding,provenance=proposal.prepare(self.path,'Exact immutable tests')
  self.assertIn('trusted_policy',context);self.assertIn('untrusted_retrieved_evidence',context)
  self.assertNotEqual(context['trusted_policy']['sha256'],binding['context_sha256'])
unittest.main()
`;
const run=spawnSync('Vault/index/venv/bin/python',['-B','-c',code],{cwd:new URL('../',import.meta.url),env:{...process.env,PYTHONPATH:'tools',PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
assert.equal(run.status,0,`${run.stdout}\n${run.stderr}`);assert.match(run.stderr,/Ran 9 tests/);assert.doesNotMatch(run.stderr,/skipped=/);
});
