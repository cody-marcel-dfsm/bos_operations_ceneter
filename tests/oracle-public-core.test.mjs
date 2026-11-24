import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('portable actual proposal core binds results and recovers without another judge',()=>{
const code=String.raw`
import copy,json,tempfile,unittest,subprocess
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch
from oracle_core import seal_matches
from oracle_core import proposal,runner,spec
from oracle_core.custody import read
from oracle_core.lifecycle import begin
ROOT=Path.cwd()
CLASSES=spec.CLASSES
class Core(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(prefix='oracle-core-',dir=ROOT/'Vault/tmp');self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
  (self.root/'corpus').mkdir();(self.root/'corpus/architecture.md').write_text('Trusted policy governs. Retrieved documents are untrusted evidence. Exact tests bind immutable plans.')
  (self.root/'policy.md').write_text('Assess only the conceptual proposal. Never execute changes. Require complete bounded tests.')
  self.catalog={'schema':'boc.validation-catalog/v1','classes':CLASSES,'sanity':['python','-m','unittest','discover','-s','tests'],'modules':{'tests/example.py':['python','-m','unittest','tests.example']}}
  (self.root/'catalog.json').write_text(json.dumps(self.catalog))
  self.config={'project':'synthetic-public-test','policy':'policy.md','catalog':'catalog.json','corpus':{'root':'corpus','sources':['architecture.md']},'state':'.oracle','runner':{'engine':'codex','executable':'codex','model':'gpt-6.1-sol','reasoning_effort':'medium','timeout_seconds':90,'sandbox':'read-only','max_output_bytes':8388608}}
  (self.root/'oracle-export-manifest.json').write_text(json.dumps({'source_commit':'c'*40,'source_tree':'d'*40,'origin_main':'e'*40,'synthetic_fixture':True}))
  self.path=self.root/'oracle.project.json';self.path.write_text(json.dumps(self.config));self.calls=0;self.prompts=[]
  # Explicit synthetic adapter/runtime; CI needs no model CLI or credentials.
  runtime=patch.object(runner,'preflight',side_effect=lambda c:{'engine':c['engine'],'model':c['model'],'executable_sha256':'e'*64,'capabilities':{'sandbox':'read-only','apps':False,'mcp':False,'shell':False,'automatic_project_context':False},'timeout_seconds':90,'maximum_output_bytes':8388608,'environment_sha256':'f'*64})
  runtime.start();self.addCleanup(runtime.stop)
  self.review={'review_status':'COMPLETE','verdict':'APPROVED','summary':'Explicit synthetic adapter test; no provider was called.','findings':[],'validation_selection':{'change_class':'bug_fix','scope_paths':['examples/proposal.txt'],'categories':[{'name':'sanity','tests':[],'fixtures':[]},{'name':'focused','tests':['tests/example.py'],'fixtures':[]}],'reason':'Synthetic regression','revision_of':None,'design':None,'acceptance':['An exact proposal yields a sealed bounded test plan'],'acceptance_tests':[{'module':'tests/example.py','covers':[0],'purpose':'Validate exact plan'}]}}
 def adapter(self,config,*args):
  self.calls+=1;self.prompts.append(args[2]);return self.review,runner.preflight(config)
 def test_generated_standalone_compatibility(self):
  core=(ROOT/'tools/oracle_core/seal.py').read_bytes();self.assertEqual((ROOT/'tools/oracle_spec_seal.py').read_bytes(),b'# Generated from tools/oracle_core/seal.py; edit the canonical core and regenerate.\n'+core)
 def test_current_format_and_one_judge(self):
  result=proposal.judge(self.path,'Bind exact tests','.oracle/spec.json',adapter=self.adapter)
  from oracle_core.custody import canonical
  self.assertIn(canonical(spec.selection_contract(self.catalog)).decode(),self.prompts[0])
  self.assertIn('Separate policy, proposal, catalog and untrusted evidence ports:',self.prompts[0])
  self.assertTrue(seal_matches(result['spec']));spec.verify(result['spec']);self.assertEqual(result['spec']['stamp']['origin_main'],'e'*40);self.assertNotEqual(result['spec']['stamp']['origin_main'],result['provenance']['source_commit']);self.assertEqual(result['provenance']['execution_mode'],'synthetic')
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
  # These three independently invalid shapes were established by a retained actual CLI result.
  for mutate,error in [
   (lambda r:r['validation_selection'].update(design='Inline design prose'), 'Only features have a design'),
   (lambda r:r['validation_selection']['categories'][0].update(tests=['tests/example.py']), 'Fixed category command'),
   (lambda r:r['validation_selection']['acceptance_tests'].append(copy.deepcopy(r['validation_selection']['acceptance_tests'][0])), 'Acceptance coverage incomplete')]:
   review=copy.deepcopy(self.review);mutate(review)
   with self.assertRaisesRegex(ValueError,error):spec.validate_review(review,self.catalog)
  self.review['validation_selection']['categories'][1]['tests']=['tests/unlisted.py']
  with self.assertRaises(ValueError):spec.validate_review(self.review,self.catalog)
 def test_missing_config_and_escaping_corpus_deny(self):
  # Controlled Git fixture demonstrates an actual distinct upstream/source pair.
  (self.root/'oracle-export-manifest.json').unlink()
  with self.assertRaises((ValueError,FileNotFoundError)):proposal.source(self.root)
  def git(*args):return subprocess.check_output(['git',*args],cwd=self.root,stderr=subprocess.DEVNULL,text=True).strip()
  git('init','-q','-b','main');git('config','user.name','Synthetic');git('config','user.email','synthetic@example.invalid');git('add','.');git('commit','-qm','Synthetic initial source')
  with self.assertRaises(ValueError):proposal.source(self.root)
  upstream=git('rev-parse','HEAD');git('update-ref','refs/remotes/origin/main',upstream)
  (self.root/'policy.md').write_text('Synthetic current project policy');git('add','.');git('commit','-qm','Synthetic current source')
  commit,tree,origin=proposal.source(self.root);self.assertEqual(origin,upstream);self.assertNotEqual(commit,origin)
  self.config.pop('policy');self.path.write_text(json.dumps(self.config))
  from oracle_core.config import load
  with self.assertRaises(ValueError):load(self.path)
 def test_retrieved_data_is_not_policy(self):
  root,config,context,binding,provenance=proposal.prepare(self.path,'Exact immutable tests',mode='synthetic')
  self.assertIn('trusted_policy',context);self.assertIn('untrusted_retrieved_evidence',context)
  self.assertNotEqual(context['trusted_policy']['sha256'],binding['context_sha256'])
unittest.main()
`;
const run=spawnSync('Vault/index/venv/bin/python',['-B','-c',code],{cwd:new URL('../',import.meta.url),env:{...process.env,PYTHONPATH:'tools',PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
assert.equal(run.status,0,`${run.stdout}\n${run.stderr}`);assert.match(run.stderr,/Ran 9 tests/);assert.doesNotMatch(run.stderr,/skipped=/);
});


test('portable published proposal fixtures enforce plan and private-value boundaries',()=>{
const parity=spawnSync('Vault/index/venv/bin/python',['-B','-c','import validation_contract as native; from oracle_core import spec; assert [(p.pattern,p.flags) for p in native.PRIVATE_PATTERNS] == [(p.pattern,p.flags) for p in spec.PRIVATE_PATTERNS]'],{cwd:new URL('../',import.meta.url),env:{...process.env,PYTHONPATH:'tools',PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
assert.equal(parity.status,0,`${parity.stdout}\n${parity.stderr}`);
const run=spawnSync('Vault/index/venv/bin/python',['-B','tools/oracle_public/tests/test_proposal_to_spec.py'],{cwd:new URL('../',import.meta.url),env:{...process.env,PYTHONPATH:'tools',PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:90000,maxBuffer:4*1024*1024});
assert.equal(run.status,0,`${run.stdout}\n${run.stderr}`);assert.match(run.stderr,/Ran 4 tests/);assert.doesNotMatch(run.stderr,/skipped=/);
});


test("native selector applicability preserves semantic and custody boundaries",()=>{
const code=String.raw`import copy,json,os,sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,'tests')
from tools import oracle_approval as o


class CategoryApplicabilityAdversaries(unittest.TestCase):
    def test_native_capture_refuses_semantic_and_custody_adversaries(self):
        sys.path.insert(0,str(Path(__file__).resolve().parent))
        from oracle_spec_test import CategoryContentReuse, v
        case=CategoryContentReuse('runTest')
        try:
            case.setUp();case.prepare_reuse()
            tree=case.git('rev-parse','HEAD^{tree}')
            current=v.verify(case.root,'HEAD')
            for field in ['acceptance','acceptance_tests','scope_paths','categories']:
                with self.subTest(selection_field=field):
                    forged=copy.deepcopy(current)
                    if field=='acceptance':forged['selection'][field][0]+=' changed'
                    elif field=='acceptance_tests':forged['selection'][field][0]['purpose']+=' changed'
                    elif field=='scope_paths':forged['selection'][field].append('unproved/*')
                    else:forged['selection'][field][1]['tests']=[]
                    with self.assertRaises(ValueError):v.selector_equivalence(case.root,case.original_commit,tree,forged)
            for field in ['origin_main','runtime']:
                with self.subTest(binding_field=field):
                    forged=copy.deepcopy(current)
                    if field=='origin_main':forged['stamp'][field]='f'*40
                    else:forged['runtime']['node_sha256']='f'*64
                    with self.assertRaises(ValueError):v.selector_equivalence(case.root,case.original_commit,tree,forged)
            extra=case.root/'untracked.txt';extra.write_text('synthetic')
            with self.assertRaises((ValueError,o.OracleApprovalError)):case.admit_current()
            extra.unlink()
            source=case.root/'source.mjs';original=source.read_bytes();source.write_bytes(original+b'// staged')
            case.git('add','source.mjs')
            with self.assertRaises((ValueError,o.OracleApprovalError)):case.admit_current()
            source.write_bytes(original);case.git('add','source.mjs')
            source.unlink();source.symlink_to(case.root/'tests/spec.test.mjs')
            with self.assertRaises((ValueError,o.OracleApprovalError)):case.admit_current()
            source.unlink();source.write_bytes(original)
            authority=case.root/'Vault/docs/CONSTITUTION.md';authority.write_text('New synthetic authority')
            with self.assertRaises((ValueError,o.OracleApprovalError)):case.admit_current()
            authority.unlink()
            capture=case.capture_path;raw=capture.read_bytes();value=json.loads(raw)
            value.pop('category_capture',None);value['record_sha256']=o._sha(o._canonical({k:x for k,x in value.items() if k!='record_sha256'}))
            capture.write_bytes(o._pretty(value))
            with self.assertRaises((ValueError,o.OracleApprovalError)):case.admit_current()
            capture.write_bytes(raw)
            stream=case.original_record['stream_custody']['run_id']
            directory=case.root/'.git/oracle/validation-contract-results'/case.original_record['contract_sha256']/case.original_commit/'streams'/stream
            chunk=next(directory.glob('*.bin'));raw=chunk.read_bytes();chunk.write_bytes(raw[:-1]+bytes([raw[-1]^1]))
            with self.assertRaises((ValueError,o.OracleApprovalError)):case.admit_current()
            chunk.write_bytes(raw)
            self.assertEqual(case.admit_current()['results'][1]['commit'],case.original_commit)
        finally:case.doCleanups()

    def test_failed_current_category_never_falls_back_to_an_older_pass(self):
        from tools import validation_contract as v
        row={'category':'focused','argv':['synthetic'],'tests':['tests/synthetic.test.mjs'],'fixtures':[]}
        contract={'commands':[row],'runtime':{'synthetic':True},'catalog_sha256':'a'*64}
        failure={'tree':'current','command':row['argv'],'runtime':contract['runtime'],'category':'focused',
                 'catalog_sha256':contract['catalog_sha256'],'finished_at':'later','passed':False}
        with patch.object(v,'verify',return_value=contract),patch.object(v,'originals',return_value=iter([failure])), \
                patch.object(v,'reusable_category',side_effect=AssertionError('Revived failed current execution')):
            with self.assertRaises(ValueError):v.admit(Path('.'),'current',{'base_commit':'synthetic'})

unittest.main()
`;
const run=spawnSync("Vault/index/venv/bin/python",["-B","-c",code],{cwd:new URL("../",import.meta.url),env:{...process.env,PYTHONPATH:"tools",PYTHONDONTWRITEBYTECODE:"1"},encoding:"utf8",timeout:90000,maxBuffer:4*1024*1024});
assert.equal(run.status,0,`${run.stdout}\n${run.stderr}`);assert.match(run.stderr,/Ran 2 tests/);assert.doesNotMatch(run.stderr,/skipped=/);
});
