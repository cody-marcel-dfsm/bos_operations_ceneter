import copy,hashlib,json,os,signal,subprocess,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from tools import validation_contract as v
from tools import command_coverage as cc
from tools import oracle_approval as oracle

def stamp(proposal,**change):
 return {'engine':'codex','model':'synthetic-model','oracle_sha256':'a'*64,'host':'synthetic-host','time':'2026-11-11T00:00:00Z','origin_main':'b'*40,'request_sha256':None,'proposal_sha256':hashlib.sha256(proposal.encode()).hexdigest(),**change}

def reseal(value):
 value=copy.deepcopy(value);value.pop('seal',None);value.pop('contract_sha256',None);value['contract_sha256']=v.digest(value);value['seal']=v.spec_seal.compute_seal(value);return value

class Contracts(unittest.TestCase):
 def seal(self,selection,proposal,review,base=None):return v.seal(self.root,selection,proposal,review,base=base,stamp=stamp(proposal))
 def setUp(self):
  environment=patch.dict(os.environ,{'BOC_ORACLE_ENGINE':'codex'});environment.start();self.addCleanup(environment.stop)
  origin=patch.object(oracle,'_fresh_origin',return_value='b'*40);origin.start();self.addCleanup(origin.stop)
  scratch=Path(__file__).resolve().parents[1]/'Vault/tmp';scratch.mkdir(parents=True,exist_ok=True)
  self.temp=tempfile.TemporaryDirectory(dir=scratch,prefix='contract-');self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name).resolve()
  self.catalog={'schema':'boc.validation-catalog/v1','classes':copy.deepcopy(v.CLASSES),'sla_seconds':copy.deepcopy(v.SLA_SECONDS),'maximum_reasoning_effort':'medium','regression':[{'test':'tests/regression.test.mjs','recurrence':'Synthetic recurrence','boundary':'Synthetic boundary'}]}
  for d in ['tools','tests']: (self.root/d).mkdir()
  (self.root/v.CATALOG).write_text(json.dumps(self.catalog));(self.root/'package.json').write_text(json.dumps({'scripts':{'check:privacy':'node -e "process.exit(0)"','check:publication':'node -e "process.exit(0)"'}}))
  (self.root/'tools/validation_contract.py').write_bytes(Path(v.__file__).read_bytes())
  (self.root/'tools/oracle_spec_seal.py').write_bytes(Path(v.spec_seal.__file__).read_bytes())
  (self.root/'.gitignore').write_text('__pycache__/\n')  # Imported helper modules may write bytecode.
  (self.root/'source.mjs').write_text('export default false;\n')
  (self.root/'tests/regression.test.mjs').write_text("import test from 'node:test';test('synthetic recurrence',()=>{});\n")
  self.git('init','-q');self.git('config','user.name','Synthetic');self.git('config','user.email','synthetic@example.invalid');self.commit()
 def git(self,*args): return subprocess.check_output(['git',*args],cwd=self.root,stderr=subprocess.DEVNULL).decode().strip()
 def commit(self):self.git('add','-A');self.git('commit','-qm','synthetic');return self.git('rev-parse','HEAD')
 def selection(self,kind='bug_fix'):
  s={'change_class':kind,'scope_paths':['source.mjs','tests/*'],'categories':[{'name':n,'tests':['tests/reproduction.test.mjs'] if n not in ['sanity','regression'] else [],'fixtures':[]} for n in v.CLASSES[kind]],'reason':'Synthetic exact coverage','revision_of':None,
     'acceptance':[] if kind=='docs_only' else ['Synthetic criterion'],'acceptance_tests':[] if kind=='docs_only' else [{'module':'tests/reproduction.test.mjs','covers':[0],'purpose':'Synthetic proof'}]}
  if kind=='feature':s['design']='design/synthetic.md'
  return s
 def plan(self,design='design/synthetic.md',**change):
  (self.root/'.git/info/exclude').write_text('design/\n')  # Designs stay private, as under Vault.
  (self.root/'design').mkdir(exist_ok=True);(self.root/'design/synthetic.md').write_text('# Synthetic design\n');(self.root/'design/other.md').write_text('# Other design\n')
  value={'kind':v.PLAN_KIND,'feature':'Synthetic feature','design':design,'design_sha256':v.sha256((self.root/design).read_bytes()),'runtime_paths':['source.mjs'],'tests':[{'module':'tests/reproduction.test.mjs','covers':['source.mjs'],'purpose':'Synthetic proof'}],**change}
  (self.root/'design/synthetic.test-plan.json').write_text(json.dumps(value));return value
 def seal_feature(self):return self.seal(self.selection('feature'),'synthetic proposal',{'verdict':'APPROVED'})
 def test_feature_design_without_a_test_plan_is_refused_even_after_an_approved_verdict(self):
  (self.root/'design').mkdir();(self.root/'design/synthetic.md').write_text('# Synthetic design\n')
  with self.assertRaisesRegex(ValueError,'must include a test plan document: design/synthetic.test-plan.json'):self.seal_feature()
 def test_native_proposal_records_nothing_when_the_gate_refuses_an_approved_verdict(self):
  (self.root/'AGENTS.md').write_text('Synthetic governing criterion\n');self.commit()
  (self.root/'.git/info/exclude').write_text('design/\n');(self.root/'design').mkdir();(self.root/'design/synthetic.md').write_text('# Synthetic design\n')
  reviewer=lambda *args:{'verdict':'APPROVED','findings':[],'authentication_impact':'NONE','owner_approval_status':'NOT_REQUIRED','api_version_assessment':{'impact':'NONE','request_kind':'NOT_REQUIRED','requested_change':None,'request_quote':None,'request_evidence':None},'validation_selection':self.selection('feature')}
  with patch.object(oracle,'_review_settings_binding',return_value={'model':'synthetic','reasoning_effort':None}):
   with self.assertRaisesRegex(ValueError,'must include a test plan document'):oracle.review_proposal(self.root,'Problem: synthetic; Cause: synthetic; Recommended change: synthetic',[],None,reviewer)
   self.assertFalse(oracle.proposal_path(self.root).exists());self.assertFalse((self.root/v.SELECTION).exists())
   self.plan();oracle.review_proposal(self.root,'Problem: synthetic; Cause: synthetic; Recommended change: synthetic',[],None,reviewer)
   self.assertEqual(json.loads((self.root/v.SELECTION).read_text())['design_binding']['design'],'design/synthetic.md')
 def test_feature_design_with_its_bound_test_plan_is_sealed_with_both_hashes(self):
  self.plan();c=self.seal_feature();b=c['design_binding']
  self.assertEqual((b['design'],b['plan'],b['tests']),('design/synthetic.md','design/synthetic.test-plan.json',['tests/reproduction.test.mjs']))
  self.assertEqual(b['design_sha256'],v.sha256((self.root/'design/synthetic.md').read_bytes()))
  self.assertEqual(b['plan_sha256'],v.sha256((self.root/'design/synthetic.test-plan.json').read_bytes()))
 def test_test_plan_bound_to_a_different_design_or_revision_is_refused(self):
  self.plan(design='design/other.md')
  with self.assertRaisesRegex(ValueError,'bound to a different design: design/other.md'):self.seal_feature()
  self.plan(design_sha256='0'*64)
  with self.assertRaisesRegex(ValueError,'different revision'):self.seal_feature()
 def test_test_plan_shape_is_refused_without_judging_quality(self):
  row={'module':'tests/reproduction.test.mjs','covers':['source.mjs'],'purpose':'Synthetic proof'}
  for change,message in [({'tests':[]},'name its tests'),({'feature':' '},'name its feature'),({'runtime_paths':[]},'runtime paths'),({'runtime_paths':['elsewhere.mjs']},'outside the selected scope'),({'runtime_paths':['source.mjs','tests/x.mjs']},'No planned test covers'),({'tests':[{**row,'module':'tests/unselected.test.mjs'}]},'not selected for execution'),({'tests':[row,row]},'repeats'),({'tests':[{**row,'covers':['tests/x.mjs']}]},'unlisted paths'),({'tests':[{'module':row['module']}]},'Each planned test'),({'tests':[{**row,'covers':[['source.mjs']]}]},'Each planned test'),({'extra':True},'requires exactly'),({'kind':'other'},'requires exactly')]:
   self.plan(**change)
   with self.assertRaisesRegex(ValueError,message):self.seal_feature()
  self.plan();(self.root/'design/synthetic.test-plan.json').write_text('[')
  with self.assertRaisesRegex(ValueError,'not valid JSON'):self.seal_feature()
  (self.root/'design/synthetic.test-plan.json').write_text('['*200000)
  with self.assertRaisesRegex(ValueError,'too large'):self.seal_feature()
 def test_only_a_feature_names_a_design_and_a_feature_must(self):
  for kind,change in [('feature',{'design':None}),('feature',{'design':'../design.md'}),('feature',{'design':'design/synthetic.txt'}),('bug_fix',{'design':'design/synthetic.md'})]:
   with self.assertRaises(ValueError):v.validate_selection({**self.selection(kind),**change},self.catalog)
  self.assertEqual(v.validate_selection({**self.selection(),'design':None},self.catalog)['design'],None)
  self.assertIn('design',v.selection_schema()['required'])
 def test_feature_contract_verifies_its_binding_on_the_candidate(self):
  self.plan();c=self.seal_feature();v.write_selection(self.root,c)
  self.commit()
  with self.assertRaisesRegex(ValueError,'Planned test is missing from the candidate'):v.verify(self.root)
  (self.root/'tests/reproduction.test.mjs').write_text("import test from 'node:test';test('p',()=>{});\n");self.commit()
  self.assertEqual(v.verify(self.root)['contract_sha256'],c['contract_sha256'])
  (self.root/'design/synthetic.md').write_text('# Changed design\n')
  with self.assertRaisesRegex(ValueError,'changed after approval'):v.verify(self.root)
 def test_public_checkout_without_the_private_design_still_needs_the_binding(self):
  self.plan();c=self.seal_feature();v.write_selection(self.root,c)
  (self.root/'tests/reproduction.test.mjs').write_text("import test from 'node:test';test('p',()=>{});\n")
  (self.root/'design/synthetic.md').unlink();(self.root/'design/synthetic.test-plan.json').unlink();(self.root/'design/other.md').unlink();self.commit()
  self.assertEqual(v.verify(self.root)['contract_sha256'],c['contract_sha256'])
  for forged in [lambda x:x.pop('design_binding'),lambda x:x['design_binding'].update(tests=[]),lambda x:x['design_binding'].update(design='design/other.md')]:
   value=copy.deepcopy(c);forged(value);value=reseal(value)
   (self.root/v.SELECTION).write_text(json.dumps(value));self.commit()
   with self.assertRaisesRegex(ValueError,'lacks its bound test plan'):v.verify(self.root)
 def publish(self,kind='bug_fix',fixtures=None):
  s=self.selection(kind)
  if fixtures:s['categories'][1]['fixtures']=fixtures
  c=self.seal(s,'synthetic proposal',{'verdict':'APPROVED'});v.write_selection(self.root,c);return c
 def test_native_proposal_dispatch_seals_the_selection_schema_without_mutating_base(self):
  schema_path=self.root/'.agents/skills/oracle/review-output.schema.json';schema_path.parent.mkdir(parents=True)
  original=json.dumps({'type':'object','properties':{},'required':[]});schema_path.write_text(original)
  token=oracle._RUN.set(self.root)
  try:
   with patch.object(oracle,'_atomic_write',side_effect=lambda p,b:p.write_bytes(b)),patch.object(oracle,'_review_process',return_value={'synthetic':'independent response'}) as dispatch:
    self.assertEqual(oracle._proposal_oracle(self.root,'Synthetic requirement',{},None),{'synthetic':'independent response'})
   selected=json.loads(dispatch.call_args.kwargs['schema_path'].read_text())
   expected=v.selection_schema();expected['properties']['revision_of']={'type':'null','const':None}
   self.assertIn('validation_selection',selected['required']);self.assertEqual(selected['properties']['validation_selection'],expected)
   self.assertEqual(schema_path.read_text(),original)
   # Strict structured-output schemas reject a const binding without a type.
   prior='a'*64;(self.root/v.SELECTION).parent.mkdir(parents=True,exist_ok=True);(self.root/v.SELECTION).write_text(json.dumps({'contract_sha256':prior}))
   with patch.object(oracle,'_atomic_write',side_effect=lambda p,b:p.write_bytes(b)),patch.object(oracle,'_review_process',return_value={}) as dispatch:
    oracle._proposal_oracle(self.root,'Synthetic requirement',{},None)
   revision=json.loads(dispatch.call_args.kwargs['schema_path'].read_text())['properties']['validation_selection']['properties']['revision_of']
   self.assertEqual(revision,{'type':'string','const':prior})
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
  self.commit();revised=self.selection();revised['revision_of']=c['contract_sha256'];self.assertEqual(self.seal(revised,'revision',{})['selection']['revision_of'],c['contract_sha256'])
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
 def revised_after_reproduction(self,archive=True):
  c=self.publish();(self.root/'tests/reproduction.test.mjs').write_text("import test from 'node:test';import assert from 'node:assert/strict';import value from '../source.mjs';test('reproduction',()=>assert.equal(value,true));");self.commit()
  self.assertEqual(v.execute(self.root,'focused','before'),0)
  (self.root/'source.mjs').write_text('export default true;\n');self.commit()
  revised=self.selection();revised['revision_of']=c['contract_sha256']
  r=self.seal(revised,'synthetic revision',{'verdict':'APPROVED'});v.write_selection(self.root,r);self.commit()
  if archive:
   folder=self.root/'.git/oracle/proposals';folder.mkdir(parents=True,exist_ok=True)
   raw=json.dumps({'validation_contract':c}).encode();(folder/(hashlib.sha256(raw).hexdigest()+'.json')).write_bytes(raw)
  # Native archive authentication has its own suite; here it admits exactly the prior contract.
  native=patch.object(v,'native_proposal_record',side_effect=lambda root,path,contract,head:contract==c);native.start();self.addCleanup(native.stop)
  return c,r
 def test_revision_retains_identical_prior_reproduction_without_withdrawing_the_fix(self):
  c,r=self.revised_after_reproduction()
  self.assertEqual(list(v.originals(self.root,r,'before')),[])
  self.assertEqual([x['contract_sha256'] for x in v.revision_chain(self.root,r,self.git('rev-parse','HEAD'))],[r['contract_sha256'],c['contract_sha256']])
  self.assertEqual(v.execute(self.root,'focused'),0)
 def test_revision_rejects_prior_reproduction_of_changed_tests_or_without_its_archive(self):
  self.revised_after_reproduction(archive=False)
  with self.assertRaisesRegex(ValueError,'unchanged-test'):v.execute(self.root,'focused')
 def test_revision_rejects_prior_reproduction_once_the_test_bytes_change(self):
  self.revised_after_reproduction()
  (self.root/'tests/reproduction.test.mjs').write_text("import test from 'node:test';import assert from 'node:assert/strict';import value from '../source.mjs';test('changed reproduction',()=>assert.equal(value,true));");self.commit()
  with self.assertRaisesRegex(ValueError,'unchanged-test'):v.execute(self.root,'focused')
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
 def test_delta_expands_prior_glob_scope_into_exact_tracked_candidate_paths(self):
  (self.root/'tests/reproduction.test.mjs').write_text("import test from 'node:test';test('r',()=>{});\n");self.publish();self.commit()
  (self.root/'source.mjs').write_text('export default true;\n');(self.root/'tests/added.test.mjs').write_text('// added\n');head=self.commit()
  context=v.delta_context(self.root,head,self.git('rev-parse','HEAD^{tree}'),origin_main=None,prior_proposal_sha256=None)
  self.assertEqual(context['paths'],['source.mjs','tests/added.test.mjs','tests/regression.test.mjs','tests/reproduction.test.mjs'])
  self.assertEqual(context['publication_scope']['range_paths'],[])
  self.assertEqual(context['publication_scope']['baseline_commit'],head,'A synthetic repository without a publication remote resolves its current HEAD')
  self.assertEqual(self.git('rev-parse',context['publication_scope']['baseline_commit']+':'+v.SELECTION),self.git('rev-parse',head+':'+v.SELECTION),'The sealed spec is unchanged across the actual publication baseline')
  self.assertFalse(any(c in p for p in context['paths'] for c in '*?[]'))
  again=v.delta_context(self.root,head,self.git('rev-parse','HEAD^{tree}'),origin_main=None,prior_proposal_sha256=None)
  self.assertEqual(again,context)
  for name in context['paths']:
   if name!=v.SELECTION:self.assertTrue(v.scoped(name,{'scope_paths':['source.mjs','tests/*']}))
 def test_exact_scope_keeps_exact_paths_matches_gate_semantics_and_refuses_unsafe(self):
  tracked=['a/b/SKILL.md','a/SKILL.md','c/x.mjs','']
  self.assertEqual(v.exact_scope(['a/**/SKILL.md','gone.md'],tracked),{'a/b/SKILL.md','gone.md'})
  self.assertEqual(v.exact_scope(['*/SKILL.md'],tracked),{'a/b/SKILL.md','a/SKILL.md'})  # fnmatchcase '*' crosses '/' as the gate does
  self.assertEqual(v.exact_scope(['none/*'],tracked),set())
  for unsafe in ['/abs/*','../up/*','-flag','a\\b','a\nb','']:
   with self.assertRaisesRegex(ValueError,'finite exact paths'):v.exact_scope([unsafe],tracked)
  self.assertEqual(v.exact_scope(['c/*'],['c/x[1].mjs']),{'c/x[1].mjs'})  # delta_context still refuses this unsafe expansion
 def test_delta_refuses_an_unsafe_tracked_path_reached_through_a_prior_glob(self):
  (self.root/'tests/reproduction.test.mjs').write_text("import test from 'node:test';test('r',()=>{});\n");self.publish();self.commit()
  (self.root/'tests/odd[1].mjs').write_text('// odd\n');head=self.commit()
  with self.assertRaisesRegex(ValueError,'finite exact paths'):v.delta_context(self.root,head,self.git('rev-parse','HEAD^{tree}'),origin_main=None,prior_proposal_sha256=None)
 def test_selection_preserves_initial_immutable_base_when_unadopted_source_moves(self):
  base=self.git('rev-parse','HEAD');(self.root/'source.mjs').write_text('concurrent change');self.commit()
  contract=self.seal(self.selection(),'Synthetic proposal',{},base=base)
  self.assertEqual(contract['base_commit'],base);self.assertNotEqual(contract['base_commit'],self.git('rev-parse','HEAD'))
 def test_bootstrap_is_only_for_proposal_base_without_catalog(self):
  with self.assertRaisesRegex(ValueError,'select validation'):v.admit(self.root,self.git('rev-parse','HEAD^{tree}'),{'base_commit':self.git('rev-parse','HEAD')})
 def test_docs_class_rejects_executable_instruction_changes(self):
  c=self.publish('docs_only');c['selection']['scope_paths']=['AGENTS.md'];c=reseal(c);(self.root/v.SELECTION).write_text(json.dumps(c));(self.root/'AGENTS.md').write_text('changed policy');self.commit()
  with self.assertRaisesRegex(ValueError,'docs_only'):v.verify(self.root)
 def test_hard_delivery_budgets_reasoning_and_no_automatic_expansion(self):
  self.assertEqual(v.SLA_SECONDS,{'docs_only':120,'bug_fix':180,'deep_bug_fix':300,'feature':300})
  for kind in v.CLASSES:
   policy=v.delivery_policy(kind);self.assertFalse(policy['retries_reset_clock']);self.assertEqual(policy['clock_start'],'original_insertion')
   self.assertEqual(policy['reasoning_effort'],'low' if kind in {'docs_only','bug_fix'} else 'medium')
  simple=self.selection();simple['categories'].append({'name':'interactions','tests':['tests/extra.test.mjs'],'fixtures':[]})
  with self.assertRaisesRegex(ValueError,'higher risk'):v.validate_selection(simple,self.catalog)
  c=self.publish('bug_fix');self.assertEqual(v.review_effort('ultra',self.root),'low');self.assertEqual(c['delivery_policy']['sla_seconds'],180)
  self.commit();next_selection=self.selection();next_selection['revision_of']=c['contract_sha256'];revised=self.seal(next_selection,'revision',{})
  self.assertEqual(revised['delivery_policy'],c['delivery_policy'])
 def test_explicit_node_vector_and_exact_legacy_shapes_reject_mixed_options(self):
  selection=self.selection('deep_bug_fix');selection['categories'].append({'name':'acceptance','tests':['tests/reproduction.test.mjs'],'fixtures':[]})
  current=v.commands(selection,self.catalog);legacy=v.commands(selection,self.catalog,legacy=True)
  self.assertEqual([row['tests'] for row in current],[row['tests'] for row in legacy])
  self.assertEqual([row['fixtures'] for row in current],[row['fixtures'] for row in legacy])
  for row in current:
   if row['category']!='sanity':self.assertEqual(row['argv'],['node','--test','--test-reporter=tap','--test-concurrency=1',*row['tests']])
  contract=self.seal(selection,'synthetic proposal',{'verdict':'APPROVED'});v.write_selection(self.root,contract);self.commit();self.assertEqual(v.verify(self.root)['commands'],current)
  old=copy.deepcopy(contract);old['commands']=legacy;(self.root/v.SELECTION).write_text(json.dumps(reseal(old)));self.commit()
  self.assertEqual(v.verify(self.root)['commands'],legacy)
  with self.assertRaises(ValueError):v.native_origin(self.root)
  for mutate in [lambda rows:rows[1]['argv'].remove('--test-concurrency=1'),
                 lambda rows:rows[1]['argv'].__setitem__(3,'--test-concurrency=2'),
                 lambda rows:rows[1]['argv'].append('--test-concurrency=1'),
                 lambda rows:rows[1]['argv'].append('tests/unknown.test.mjs')]:
   changed=copy.deepcopy(contract);mutate(changed['commands']);(self.root/v.SELECTION).write_text(json.dumps(reseal(changed)));self.commit()
   with self.assertRaisesRegex(ValueError,'selected commands'):v.verify(self.root)
  with self.assertRaises(ValueError):v.native_origin(self.root)

 def test_declared_node_file_bound_executes_actual_exclusive_files(self):
  names=['tests/exclusive-first.test.mjs','tests/exclusive-second.test.mjs']
  body="import test from 'node:test';import {mkdirSync,rmdirSync} from 'node:fs';import {setTimeout} from 'node:timers/promises';test('exclusive file',async()=>{mkdirSync('active-file');try{await setTimeout(100)}finally{rmdirSync('active-file')}});"
  for name in names:(self.root/name).write_text(body)
  selection=self.selection();selection['categories'][1]['tests']=names
  selection['acceptance_tests']=[{'module':name,'covers':[0],'purpose':'Actual exclusive file scheduling'} for name in names]
  v.validate_selection(selection,self.catalog)
  command=v.commands(selection,self.catalog)[1]['argv'];environment={k:value for k,value in os.environ.items() if k!='NODE_TEST_CONTEXT'}
  result=subprocess.run(command,cwd=self.root,env=environment,capture_output=True,text=True,timeout=10)
  summary=v.result_summary(result.stdout+result.stderr,result.returncode,True)
  self.assertTrue(summary['passed'],result.stdout+result.stderr);self.assertEqual(summary['tests'],2)
class NativeStreams(unittest.TestCase):
 def setUp(self):
  scratch=Path(__file__).resolve().parents[1]/'Vault/tmp';scratch.mkdir(parents=True,exist_ok=True)
  self.temp=tempfile.TemporaryDirectory(dir=scratch,prefix='stream-');self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name).resolve();(self.root/'.git').mkdir()
 def binding(self,command):
  return {'contract_sha256':'a'*64,'commit':'b'*40,'tree':'c'*40,'category':'interactions','phase':'after','command':command,'fixtures':{},'runtime':{'synthetic':'test-only'}}
 def capture(self,body):
  command=[sys.executable,'-u','-c',body];binding=self.binding(command)
  result=v.stream_execution(self.root,command,dict(os.environ),binding,forward=False)
  return result,{**binding,'exit_code':result.returncode,'stream_custody':result.stream_custody}
 def folder(self,record):
  return self.root/'.git/oracle/validation-contract-results'/record['contract_sha256']/record['commit']/'streams'/record['stream_custody']['run_id']
 def test_successful_real_binary_streams_preserve_legacy_stdout_then_stderr_bytes(self):
  body="import os;os.write(1,b'first\\x00\\xff\\n');os.write(2,b'error\\x00\\xfe\\n')"
  legacy=subprocess.run([sys.executable,'-u','-c',body],capture_output=True,check=True)
  result,record=self.capture(body);streams,finish=v.verify_stream_execution(self.root,record)
  self.assertEqual(result.stdout+result.stderr,legacy.stdout+legacy.stderr)
  self.assertEqual(streams,{'stdout':legacy.stdout,'stderr':legacy.stderr});self.assertEqual(finish['status'],'COMPLETE')
  self.assertEqual(finish['returncode'],0)
 def test_changed_missing_reordered_members_and_input_references_fail_closed(self):
  result,record=self.capture("import os,time;os.write(1,b'one');time.sleep(.05);os.write(2,b'two')")
  folder=self.folder(record);original={p.name:p.read_bytes() for p in folder.iterdir()}
  chunk=next(p for p in folder.iterdir() if p.suffix=='.bin')
  chunk.write_bytes(b'changed')
  with self.assertRaisesRegex(ValueError,'stream bytes changed'):v.verify_stream_execution(self.root,record)
  chunk.write_bytes(original[chunk.name]);chunk.unlink()
  with self.assertRaises(OSError):v.verify_stream_execution(self.root,record)
  chunk.write_bytes(original[chunk.name]);chunk.chmod(0o600)
  index=json.loads(original['index.json']);index['chunks'].reverse();raw=json.dumps(index).encode();(folder/'index.json').write_bytes(raw)
  forged=copy.deepcopy(record);forged['stream_custody']['index_sha256']=v.sha256(raw)
  finish=json.loads(original['finish.json']);finish['index_sha256']=v.sha256(raw);raw=json.dumps(finish).encode();(folder/'finish.json').write_bytes(raw);forged['stream_custody']['finish_sha256']=v.sha256(raw)
  with self.assertRaisesRegex(ValueError,'sequence changed'):v.verify_stream_execution(self.root,forged)
  for name,raw in original.items():(folder/name).write_bytes(raw)
  altered=copy.deepcopy(record);altered['fixtures']={'tests/other.test.mjs':'d'*40}
  with self.assertRaisesRegex(ValueError,'input custody changed'):v.verify_stream_execution(self.root,altered)
  (folder/'foreign').write_text('foreign')
  with self.assertRaisesRegex(ValueError,'membership changed'):v.verify_stream_execution(self.root,record)
 def test_successful_unicode_and_per_stream_newline_translation_equal_legacy_text_mode(self):
  body="import os;os.write(1,'café\\r\\nend\\r'.encode());os.write(2,b'\\nerror\\r')"
  legacy=subprocess.run([sys.executable,'-u','-c',body],capture_output=True,text=True,check=True)
  result,record=self.capture(body)
  self.assertEqual(v.stream_summary_text(result.stdout,result.stderr),legacy.stdout+legacy.stderr)
  streams,finish=v.verify_stream_execution(self.root,record)
  self.assertEqual(streams['stdout'],result.stdout);self.assertEqual(streams['stderr'],result.stderr)
 def test_native_write_fault_retains_original_failure_and_drains_actual_child(self):
  pidfile=self.root/'child.pid'
  body="import os,time;from pathlib import Path;Path("+repr(str(pidfile))+").write_text(str(os.getpid()));print('ready',flush=True);time.sleep(30)"
  command=[sys.executable,'-u','-c',body];write=v._stream_write
  def fail(directory,name,raw):
   if name.endswith('.bin'):raise OSError('synthetic native write failure')
   return write(directory,name,raw)
  with patch.object(v,'_stream_write',side_effect=fail):
   with self.assertRaisesRegex(OSError,'synthetic native write failure'):v.stream_execution(self.root,command,dict(os.environ),self.binding(command),forward=False)
  with self.assertRaises(ProcessLookupError):os.kill(int(pidfile.read_text()),0)
  self.assertFalse(list((self.root/'.git').rglob('finish.json')))
 def test_actual_supervisor_signal_retains_early_binary_bytes_and_drains_child(self):
  body="import os,time;print('READY '+str(os.getpid()),flush=True);os.write(2,b'early\\x00\\xff');time.sleep(30)"
  command=[sys.executable,'-u','-c',body];binding=self.binding(command)
  driver="import json,os,sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from tools import validation_contract as v;r=v.stream_execution(Path(sys.argv[2]),json.loads(sys.argv[3]),dict(os.environ),json.loads(sys.argv[4]));print('RESULT '+json.dumps({'code':r.returncode,'reference':r.stream_custody}),flush=True)"
  child=subprocess.Popen([sys.executable,'-u','-c',driver,str(Path(v.__file__).resolve().parents[1]),str(self.root),json.dumps(command),json.dumps(binding)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
  try:
   # Read the real ready event before signalling; no startup/latency assumption.
   import selectors
   with selectors.DefaultSelector() as ready:
    ready.register(child.stdout,selectors.EVENT_READ);self.assertTrue(ready.select(5),'Actual ready event missing')
   line=child.stdout.readline();self.assertTrue(line.startswith(b'READY '));pid=int(line.split()[1])
   # The early stderr read has its own persisted chunk before interruption.
   import time
   folder=self.root/'.git/oracle/validation-contract-results'/binding['contract_sha256']/binding['commit']/'streams'
   until=time.monotonic()+5
   while not list(folder.glob('*/*-stderr-*.bin')) and time.monotonic()<until:time.sleep(.005)
   self.assertTrue(list(folder.glob('*/*-stderr-*.bin')))
   os.killpg(child.pid,signal.SIGTERM);stdout,stderr=child.communicate(timeout=5);self.assertEqual(child.returncode,0,stderr)
   value=json.loads(next(row.removeprefix(b'RESULT ') for row in stdout.splitlines() if row.startswith(b'RESULT ')))
   record={**binding,'exit_code':value['code'],'stream_custody':value['reference']};streams,finish=v.verify_stream_execution(self.root,record)
   self.assertEqual(streams['stdout'],line);self.assertEqual(streams['stderr'],b'early\x00\xff')
   self.assertEqual(finish['status'],'INCOMPLETE');self.assertNotEqual(record['exit_code'],0)
   with self.assertRaises(ProcessLookupError):os.kill(pid,0)
  finally:
   if child.poll() is None:os.killpg(child.pid,signal.SIGKILL);child.wait()
   child.stdout.close();child.stderr.close()
 def test_interrupted_unfinished_or_replaced_directory_never_supplies_a_complete_record(self):
  result,record=self.capture("print('retained')");folder=self.folder(record)
  (folder/'finish.json').unlink()
  with self.assertRaises(OSError):v.verify_stream_execution(self.root,record)
  replacement=folder.with_name('preserved');folder.rename(replacement);folder.symlink_to(replacement,target_is_directory=True)
  with self.assertRaises(OSError):v.verify_stream_execution(self.root,record)
if __name__=='__main__':unittest.main()
