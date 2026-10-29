import copy,json,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from tools import validation_contract as v
from tools import command_coverage as cc
from tools import oracle_approval as oracle

class Contracts(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
  self.catalog={'schema':'boc.validation-catalog/v1','classes':copy.deepcopy(v.CLASSES),'sla_seconds':copy.deepcopy(v.SLA_SECONDS),'maximum_reasoning_effort':'medium','regression':[{'test':'tests/regression.test.mjs','recurrence':'Synthetic recurrence','boundary':'Synthetic boundary'}]}
  for d in ['tools','tests']: (self.root/d).mkdir()
  (self.root/v.CATALOG).write_text(json.dumps(self.catalog));(self.root/'package.json').write_text(json.dumps({'scripts':{'check:privacy':'node -e "process.exit(0)"','check:publication':'node -e "process.exit(0)"'}}))
  (self.root/'tools/validation_contract.py').write_bytes(Path(v.__file__).read_bytes())
  (self.root/'source.mjs').write_text('export default false;\n')
  (self.root/'tests/regression.test.mjs').write_text("import test from 'node:test';test('synthetic recurrence',()=>{});\n")
  self.git('init','-q');self.git('config','user.name','Synthetic');self.git('config','user.email','synthetic@example.invalid');self.commit()
 def git(self,*args): return subprocess.check_output(['git',*args],cwd=self.root,stderr=subprocess.DEVNULL).decode().strip()
 def commit(self):self.git('add','-A');self.git('commit','-qm','synthetic');return self.git('rev-parse','HEAD')
 def selection(self,kind='bug_fix'):
  return {'change_class':kind,'scope_paths':['source.mjs','tests/*'],'categories':[{'name':n,'tests':['tests/reproduction.test.mjs'] if n not in ['sanity','regression'] else [],'fixtures':[]} for n in v.CLASSES[kind]],'reason':'Synthetic exact coverage','revision_of':None}
 def publish(self,kind='bug_fix',fixtures=None):
  s=self.selection(kind)
  if fixtures:s['categories'][1]['fixtures']=fixtures
  c=v.seal(self.root,s,'synthetic proposal',{'verdict':'APPROVED'});v.write_selection(self.root,c);return c
 def test_native_proposal_dispatch_seals_the_selection_schema_without_mutating_base(self):
  schema_path=self.root/'.agents/skills/oracle/review-output.schema.json';schema_path.parent.mkdir(parents=True)
  original=json.dumps({'type':'object','properties':{},'required':[]});schema_path.write_text(original)
  token=oracle._RUN.set(self.root)
  try:
   with patch.object(oracle,'_atomic_write',side_effect=lambda p,b:p.write_bytes(b)),patch.object(oracle,'_review_process',return_value={'synthetic':'independent response'}) as dispatch:
    self.assertEqual(oracle._proposal_oracle(self.root,'Synthetic requirement',{},None),{'synthetic':'independent response'})
   selected=json.loads(dispatch.call_args.kwargs['schema_path'].read_text())
   self.assertIn('validation_selection',selected['required']);self.assertEqual(selected['properties']['validation_selection'],v.selection_schema())
   self.assertEqual(schema_path.read_text(),original)
  finally:oracle._RUN.reset(token)
 def test_actual_native_launch_caps_effort_and_preserves_model(self):
  schema=self.root/'schema.json';schema.write_text('{}')
  (self.root/'tools/codex_child_model.py').write_text('# synthetic model helper')
  run=self.root/'.git/oracle/runs/synthetic';run.mkdir(parents=True)
  token=oracle._RUN.set(run)
  def launch(argv,**kwargs):
   self.assertEqual(argv[argv.index('--model')+1],'synthetic-selected-model')
   self.assertIn('model_reasoning_effort="medium"',argv)
   self.assertEqual(kwargs['env']['CODEX_SELECTED_REASONING_EFFORT'],'medium')
   (run/'result.json').write_text('{"synthetic":true}')
   return subprocess.CompletedProcess(argv,0,'','')
  try:
   with patch.object(oracle,'selected_model',return_value='synthetic-selected-model'),patch.object(oracle,'selected_reasoning_effort',return_value='ultra'),patch.object(oracle.subprocess,'run',side_effect=launch):
    self.assertEqual(oracle._review_process(self.root,'Synthetic native cap','synthetic',schema_path=schema),{'synthetic':True})
   self.assertEqual(json.loads((run/'model.json').read_text())['reasoning_effort'],'medium')
  finally:oracle._RUN.reset(token)
 def test_runtime_binds_fixed_runner_not_proposal_controller_interpreter(self):
  current=v.runtime()
  with patch.object(v.sys,'executable','/nonexistent/proposal-only-python'):
   self.assertEqual(v.runtime(),current)
  selected=v.selection_schema()['properties']['categories']['items']['properties']['name']
  self.assertEqual(selected['type'],'string')
 def test_class_minima_exact_nonempty_commands_and_explicit_revision(self):
  for kind in v.CLASSES:
   s=self.selection(kind);self.assertEqual(v.validate_selection(s,self.catalog),s)
   if kind!='docs_only':
    broken=copy.deepcopy(s);broken['categories']=broken['categories'][:-1]
    with self.assertRaises(ValueError):v.validate_selection(broken,self.catalog)
  for change in [lambda s:s.update(categories=[]),lambda s:s['categories'].append(s['categories'][0]),lambda s:s['categories'][1].update(tests=[]),lambda s:s['categories'][1].update(tests=['tests/*.test.mjs']),lambda s:s.update(scope_paths=['../outside']),lambda s:s.update(revision_of='wrong')]:
   s=self.selection();change(s)
   with self.assertRaises(ValueError):v.validate_selection(s,self.catalog)
  c=self.publish()
  with self.assertRaisesRegex(ValueError,'revision'):self.publish()
  self.commit();revised=self.selection();revised['revision_of']=c['contract_sha256'];self.assertEqual(v.seal(self.root,revised,'revision',{})['selection']['revision_of'],c['contract_sha256'])
 def test_no_empty_skip_partial_or_exit_only_pass(self):
  def tap(tests=2,passed=2,fail=0,skipped=0,todo=0,cancelled=0):return ''.join(f'# {k} {val}\n' for k,val in [('tests',tests),('pass',passed),('fail',fail),('skipped',skipped),('todo',todo),('cancelled',cancelled)])
  self.assertTrue(v.result_summary(tap(),0,True)['passed'])
  for text,code in [(tap(tests=0,passed=0),0),(tap(passed=1,skipped=1),0),(tap(passed=1,todo=1),0),(tap(passed=1,cancelled=1),0),(tap(passed=1),0),(tap(),1),('',0),(tap()+tap(),0)]:self.assertFalse(v.result_summary(text,code,True)['passed'])
 def test_real_fail_before_pass_after_complete_admission_and_original_failure(self):
  c=self.publish(fixtures=['tests/case.json']);(self.root/'tests/case.json').write_text('{\"expected\":true}');(self.root/'tests/reproduction.test.mjs').write_text("import test from 'node:test';import assert from 'node:assert/strict';import value from '../source.mjs';import{readFileSync}from'node:fs';const expected=JSON.parse(readFileSync(new URL('./case.json',import.meta.url))).expected;test('reproduce',()=>assert.equal(value,expected));\n");self.commit()
  self.assertEqual(v.execute(self.root,'focused','before'),0);before=list(v.originals(self.root,c,'before'));self.assertEqual(len(before),1);self.assertNotEqual(before[0]['exit_code'],0)
  (self.root/'source.mjs').write_text('export default true;\n');self.commit();tree=self.git('rev-parse','HEAD^{tree}')
  with self.assertRaisesRegex(ValueError,'Incomplete'):v.admit(self.root,tree,{'validation_contract':c})
  for name in ['sanity','focused']:self.assertEqual(v.execute(self.root,name),0)
  self.assertEqual(len(v.admit(self.root,tree,{'validation_contract':c})['results']),2)
  self.assertEqual(list(v.originals(self.root,c,'before'))[0]['record_sha256'],before[0]['record_sha256'])
  self.assertEqual(cc.requirements(self.root,tree)[1]['command'],['python3','tools/validation_contract.py','run','--category','focused'])
 def test_rejected_mutating_before_cannot_supply_reproduction(self):
  c=self.publish();(self.root/'tests/reproduction.test.mjs').write_text("import test from 'node:test';import assert from 'node:assert/strict';import{writeFileSync}from'node:fs';import value from '../source.mjs';test('mutation is not reproduction',()=>{if(!value)writeFileSync(new URL('../source.mjs',import.meta.url),'export default true;');assert.equal(value,true);});");self.commit()
  self.assertEqual(v.execute(self.root,'focused','before'),1)
  before=list(v.originals(self.root,c,'before'));self.assertEqual(len(before),1);self.assertIs(before[0]['inputs_unchanged'],False);self.assertEqual(before[0]['summary']['fail'],1)
  retained=Path(before[0]['_record_path']).read_bytes();self.commit()
  with self.assertRaisesRegex(ValueError,'unchanged-test'):v.execute(self.root,'focused')
  self.assertEqual(Path(before[0]['_record_path']).read_bytes(),retained)
 def test_source_catalog_runtime_and_fixture_changes_fail_closed(self):
  c=self.publish();(self.root/'tests/reproduction.test.mjs').write_text("import test from 'node:test';import assert from 'node:assert/strict';test('failure',()=>assert.equal(false,true));");self.commit();self.assertEqual(v.execute(self.root,'focused','before'),0)
  (self.root/'tests/reproduction.test.mjs').write_text("import test from 'node:test';test('different test',()=>{});");self.commit()
  with self.assertRaisesRegex(ValueError,'unchanged-test'):v.execute(self.root,'focused')
  with patch.object(v,'runtime',return_value={'node':'different'}):
   with self.assertRaisesRegex(ValueError,'runtime'):v.execute(self.root,'focused')
  (self.root/'outside.mjs').write_text('changed');self.commit()
  with self.assertRaisesRegex(ValueError,'outside'):v.verify(self.root)
 def test_selection_preserves_initial_immutable_base_when_unadopted_source_moves(self):
  base=self.git('rev-parse','HEAD');(self.root/'source.mjs').write_text('concurrent change');self.commit()
  contract=v.seal(self.root,self.selection(),'Synthetic proposal',{},base=base)
  self.assertEqual(contract['base_commit'],base);self.assertNotEqual(contract['base_commit'],self.git('rev-parse','HEAD'))
 def test_bootstrap_is_only_for_proposal_base_without_catalog(self):
  with self.assertRaisesRegex(ValueError,'select validation'):v.admit(self.root,self.git('rev-parse','HEAD^{tree}'),{'base_commit':self.git('rev-parse','HEAD')})
 def test_docs_class_rejects_executable_instruction_changes(self):
  c=self.publish('docs_only');c['selection']['scope_paths']=['AGENTS.md'];c['contract_sha256']=v.digest({k:val for k,val in c.items() if k!='contract_sha256'});(self.root/v.SELECTION).write_text(json.dumps(c));(self.root/'AGENTS.md').write_text('changed policy');self.commit()
  with self.assertRaisesRegex(ValueError,'docs_only'):v.verify(self.root)
 def test_hard_delivery_budgets_reasoning_and_no_automatic_expansion(self):
  self.assertEqual(v.SLA_SECONDS,{'docs_only':120,'bug_fix':180,'deep_bug_fix':300,'feature':300})
  for kind in v.CLASSES:
   policy=v.delivery_policy(kind);self.assertFalse(policy['retries_reset_clock']);self.assertEqual(policy['clock_start'],'original_insertion')
   self.assertEqual(policy['reasoning_effort'],'low' if kind in {'docs_only','bug_fix'} else 'medium')
  simple=self.selection();simple['categories'].append({'name':'interactions','tests':['tests/extra.test.mjs'],'fixtures':[]})
  with self.assertRaisesRegex(ValueError,'higher risk'):v.validate_selection(simple,self.catalog)
  c=self.publish('bug_fix');self.assertEqual(v.review_effort('ultra',self.root),'low');self.assertEqual(c['delivery_policy']['sla_seconds'],180)
  self.commit();next_selection=self.selection();next_selection['revision_of']=c['contract_sha256'];revised=v.seal(self.root,next_selection,'revision',{})
  self.assertEqual(revised['delivery_policy'],c['delivery_policy'])
if __name__=='__main__':unittest.main()
