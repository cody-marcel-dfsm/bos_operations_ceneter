import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const suite=String.raw`
import io,json,os,pathlib,subprocess,sys,tarfile,types,unittest
from unittest.mock import patch
from tools import deterministic_oracle as d

class Profile(unittest.TestCase):
 def setUp(self):
  self.root=pathlib.Path(sys.argv[1])/self._testMethodName;self.root.mkdir()
  self.git('init','-q');self.git('config','user.name','Synthetic');self.git('config','user.email','synthetic@example.invalid')
  self.put('tools/deterministic_oracle.py','baseline');self.commit();self.base=self.git('rev-parse','HEAD')
  self.put('tools/deterministic_oracle.py','candidate');self.commit();self.head=self.git('rev-parse','HEAD')
  self.gate=patch.object(d.contract,'gate',return_value={'status':'SPEC_SEALED'});self.gate.start();self.addCleanup(self.gate.stop)
 def git(self,*args):return subprocess.check_output(['git',*args],cwd=self.root,text=True,stderr=subprocess.DEVNULL).strip()
 def put(self,name,body):
  p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(body);return p
 def commit(self):self.git('add','-A');self.git('commit','-qm','synthetic change')
 def test_exact_closed_inventory_and_nonempty_history(self):
  self.assertEqual(d.scope(self.root,self.base,self.head),['tools/deterministic_oracle.py'])
  self.assertEqual(len(d.CORE_INPUTS),44);self.assertEqual(len(d.PUBLIC_MEMBERS),31)
  self.assertFalse(any('*' in x for x in d.OWN_PATHS))
  with self.assertRaisesRegex(ValueError,'Outside'):d.scope(self.root,self.head,self.head)
 def test_reverted_unlisted_and_product_paths_refuse(self):
  self.put('source/unrelated.py','private');self.commit();self.git('rm','source/unrelated.py');self.commit()
  with self.assertRaisesRegex(ValueError,'Outside'):d.scope(self.root,self.base,self.git('rev-parse','HEAD'))
 def test_symlink_source_refuses(self):
  p=self.root/'tools/oracle_core/config.py';p.parent.mkdir();p.symlink_to('../deterministic_oracle.py');self.commit()
  with self.assertRaisesRegex(ValueError,'regular'):d.scope(self.root,self.base,self.git('rev-parse','HEAD'))
 def test_package_alias_addition_preserves_all_other_values(self):
  self.git('reset','--hard',self.base)
  self.put('package.json',json.dumps({'version':'1','scripts':{'existing':'unchanged'},'dependencies':{'example':'1'}}));self.commit();base=self.git('rev-parse','HEAD')
  good={'version':'1','scripts':{'existing':'unchanged',**d.ALIASES},'dependencies':{'example':'1'}}
  self.put('package.json',json.dumps(good));self.commit();d.scope(self.root,base,self.git('rev-parse','HEAD'))
  for key,value in [('version','2'),('dependencies',{'example':'2'})]:
   bad=dict(good);bad[key]=value;self.put('package.json',json.dumps(bad));self.commit()
   with self.assertRaisesRegex(ValueError,'preserves'):d.scope(self.root,base,self.git('rev-parse','HEAD'))
 def test_input_inventory_reads_actual_bytes_even_when_hidden(self):
  original=d.native.git
  def git(root,*args):
   if args[0]=='show' and args[1].endswith(':tools/validation-selection.json'):return json.dumps({'selection':{'categories':[]}})
   return original(root,*args)
  with patch.object(d.native,'git',side_effect=git),patch.object(d,'OWN_PATHS',frozenset({'tools/deterministic_oracle.py'})),patch.object(d,'NATIVE_INPUTS',()):
   first=d.input_inventory(self.root,self.head);self.assertTrue(first)
   self.git('update-index','--assume-unchanged','tools/deterministic_oracle.py');self.put('tools/deterministic_oracle.py','hidden mutation')
   with self.assertRaisesRegex(ValueError,'committed bytes'):d.input_inventory(self.root,self.head)
   with self.assertRaisesRegex(ValueError,'Hidden'):d.identity(self.root)
 def test_missing_runtime_never_installs_or_downloads(self):
  with patch.dict(os.environ,{'ORACLE_PUBLIC_PYTHON':str(self.root/'absent-python')}),patch.object(d.subprocess,'run') as run:
   with self.assertRaisesRegex(ValueError,'no installation'):d.python_runtime(self.root)
   run.assert_not_called()
 def receipt(self,status='VERIFIED'):
  identity={'source':self.head,'tree':self.git('rev-parse','HEAD^{tree}'),'runtime':{},'inputs':{},'oracle_runtime':{'executable':sys.executable},'environment_sha256':'synthetic'}
  store=d.directory(self.root)/'100';store.mkdir(parents=True)
  export=store/'export';export.mkdir();archive=export/'oracle-public.tar.gz';archive.write_bytes(b'archive')
  er={'archive':{'sha256':d.native.digest(b'archive'),'size':7,'file':'oracle-public.tar.gz'}}
  eraw=d.native.encoded(er);(export/'oracle-export-receipt.json').write_bytes(eraw)
  standalone=store/'standalone';standalone.mkdir();(standalone/'README.md').write_bytes(b'public')
  log=b'Ran 1 test in 0.1s\n\nOK\n';checksum=d.native.digest(log);(store/(checksum+'.log')).write_bytes(log)
  row={'exit_code':0,'output_sha256':checksum}
  value={'kind':d.KIND,'profile':d.PROFILE,'status':status,**identity,'base':self.base,'paths':['tools/deterministic_oracle.py'],'verification_scope':d.SOURCE_SCOPE,'source_publication':True,'origin_main_observed':None,'spec_runs':[],'spec_mode':'native','native_proposal':{'execution_mode':'native_cli'},'completed_at':100,'store':str(store),'export':{'receipt':er,'receipt_sha256':d.native.digest(eraw),'archive_path':str(archive),'runs':[row],'standalone_inputs':{'README.md':{'sha256':d.native.digest(b'public'),'size':6,'mode':0o644}}}}
  value['sha256']=d.native.digest(d.native.encoded(value));path=store/'receipt.json';path.write_bytes(d.native.encoded(value))
  return identity,store,path
 def verification(self,identity):
  self.enterContext(patch.object(d,'identity',return_value=identity))
  self.enterContext(patch.object(d,'native_proposal_witness',return_value={'execution_mode':'native_cli'}))
  self.enterContext(patch.object(d.native,'check_spec_runs'))
  self.enterContext(patch.object(d,'PUBLIC_MEMBERS',frozenset({'README.md'})))
  self.enterContext(patch.object(d,'load_exporter',return_value=types.SimpleNamespace(verify_archive=lambda *a:None)))
 def test_complete_receipt_rechecks_outputs_archive_and_standalone(self):
  identity,store,path=self.receipt();self.verification(identity);self.assertEqual(d.verify(self.root)['status'],'VERIFIED')
  for p in [store/'export/oracle-public.tar.gz',store/'export/oracle-export-receipt.json',store/'standalone/README.md',next(store.glob('*.log'))]:
   original=p.read_bytes();p.write_bytes(b'tampered')
   with self.assertRaises(ValueError):d.verify(self.root)
   p.write_bytes(original)
  file=store/'standalone/README.md';file.chmod(0o755)
  with self.assertRaisesRegex(ValueError,'standalone'):d.verify(self.root)
 def test_receipt_source_runtime_and_kind_tamper_refuses(self):
  identity,store,path=self.receipt();self.verification(identity);raw=path.read_bytes()
  for key,val in [('source','f'*40),('runtime',{'changed':True}),('kind','another'),('status','CI_ONLY')]:
   value=json.loads(raw);value[key]=val;value.pop('sha256');value['sha256']=d.native.digest(d.native.encoded(value));path.write_bytes(d.native.encoded(value))
   with self.assertRaises(ValueError):d.verify(self.root)
   path.write_bytes(raw)
 def test_later_failure_invalidates_prior_success(self):
  identity,store,path=self.receipt();self.verification(identity);later=store.parent/'200';later.mkdir();(later/'failure.json').write_text(json.dumps({'identity':identity}))
  with self.assertRaisesRegex(ValueError,'later'):d.verify(self.root)
 def test_symlinked_evidence_refuses(self):
  identity,store,path=self.receipt();self.verification(identity);p=store/'export/oracle-public.tar.gz';p.unlink();p.symlink_to(store/'standalone/README.md')
  with self.assertRaisesRegex(ValueError,'unsubstituted'):d.verify(self.root)
 def model_archive(self,names):
  path=self.root/'model.tar.gz'
  with tarfile.open(path,'w:gz') as tar:
   for name,kind in names:
    info=tarfile.TarInfo(name)
    if kind=='link':info.type=tarfile.SYMTYPE;info.linkname='/outside';tar.addfile(info)
    else:info.size=5;tar.addfile(info,io.BytesIO(b'model'))
  return path
 def test_explicit_ci_model_setup_verifies_hash_and_preserves_existing_cache(self):
  archive=self.model_archive([('onnx/model.onnx','file')]);destination=self.root/'cache'
  with self.assertRaisesRegex(ValueError,'digest'):d.verify_public_model_archive(archive,destination)
  self.assertFalse(destination.exists())
  with patch.object(d,'EMBEDDING_ARCHIVE_SHA256',d.native.digest(archive.read_bytes())):
   d.verify_public_model_archive(archive,destination);d.verify_public_model_archive(archive,destination)
   (destination/'onnx/model.onnx').write_bytes(b'foreign')
   with self.assertRaisesRegex(ValueError,'Existing'):d.verify_public_model_archive(archive,destination)
   self.assertEqual((destination/'onnx/model.onnx').read_bytes(),b'foreign')
 def test_explicit_ci_setup_denies_archive_escape_duplicate_and_link_before_writes(self):
  for names in [[('onnx/model.onnx','file'),('../outside','file')],[('onnx/model.onnx','file'),('onnx/model.onnx','file')],[('onnx/model.onnx','link')]]:
   archive=self.model_archive(names);destination=self.root/'cache'
   with patch.object(d,'EMBEDDING_ARCHIVE_SHA256',d.native.digest(archive.read_bytes())):
    with self.assertRaises(ValueError):d.verify_public_model_archive(archive,destination)
   self.assertFalse(destination.exists())
 def test_synthetic_model_output_never_satisfies_actual_witness(self):
  store=self.root/'private';p=store/'standalone/.oracle/operations'/('a'*64);p.mkdir(parents=True);(p/'completed.json').write_text(json.dumps({'provenance':{'execution_mode':'synthetic'}}))
  with self.assertRaisesRegex(ValueError,'actual native CLI'):d.native_proposal_witness(store,self.head,'b'*40)
 def test_future_old_profile_changes_do_not_route_to_oracle(self):
  base=self.head;self.put('package.json','{"version":"2"}');self.commit()
  self.assertFalse(d.applies(self.root,base,self.git('rev-parse','HEAD')))
  base=self.git('rev-parse','HEAD');self.put('tools/oracle_core/unlisted.py','unknown');self.commit()
  self.assertTrue(d.applies(self.root,base,self.git('rev-parse','HEAD')))
  with self.assertRaisesRegex(ValueError,'Outside'):d.scope(self.root,base,self.git('rev-parse','HEAD'))
 def test_dispatcher_is_explicit_and_default_package_lane_remains(self):
  from tools import deterministic_package as package
  with patch.object(package.native,'git',return_value=str(self.root)),patch.object(d,'main',return_value=17) as selected:
   self.assertEqual(package.main(['validate','--profile','oracle','--base',self.base]),17)
   self.assertEqual(selected.call_args.args[0],['validate','--base',self.base])
  with patch.object(package.native,'git',return_value=str(self.root)),patch.object(package,'validate',return_value={'status':'VERIFIED'}) as selected,patch.object(d,'main') as oracle:
   self.assertEqual(package.main(['validate','--base',self.base]),0)
   selected.assert_called_once();oracle.assert_not_called()
  with patch.object(package.native,'git',return_value=str(self.root)):
   with self.assertRaisesRegex(ValueError,'Unsupported'):package.main(['python-category','unittest','--profile','oracle'])
 def test_oracle_ci_dispatch_never_falls_back_to_model_approval(self):
  from tools import deterministic_package as package
  value={'kind':d.CI_KIND,'status':'CI_ONLY','source':self.head,'sla_status':'CI_PHASE_ONLY'}
  with patch.object(package.native,'git',return_value=self.head),patch.object(d,'applies',return_value=True),patch.object(d,'validate',return_value=value) as ci,patch.object(package,'validate') as old:
   self.assertEqual(package.ci(self.root,self.base,'unknown'),0);ci.assert_called_once_with(self.root,self.base,'unknown',ci=True);old.assert_not_called()
 def test_ci_projection_preserves_every_other_module_and_command(self):
  rows=[{'category':'interactions','tests':['tests/a.test.mjs'],'argv':['node','--test','tests/a.test.mjs']},{'category':'acceptance','tests':['tests/b.test.mjs',d.LIVE_MODULE],'argv':['node','--test','--test-concurrency=1','tests/b.test.mjs',d.LIVE_MODULE]}]
  got=d.offline_commands(rows);self.assertEqual(got[0],rows[0]);self.assertEqual(got[1]['tests'],['tests/b.test.mjs']);self.assertEqual(got[1]['argv'],['node','--test','--test-concurrency=1','tests/b.test.mjs']);self.assertIn(d.LIVE_MODULE,rows[1]['tests'])
  for bad in [[],[rows[0]],[{'category':'acceptance','tests':[d.LIVE_MODULE],'argv':['node',d.LIVE_MODULE]}]]:
   with self.assertRaises(ValueError):d.offline_commands(bad)
 def test_ci_only_receipt_cannot_publish(self):
  identity,store,path=self.receipt('CI_ONLY');self.verification(identity)
  with patch.object(d,'run') as run:
   with self.assertRaisesRegex(ValueError,'receipt'):d.publish(self.root,'codex/source-oracle-test')
   run.assert_not_called()
 def test_artifact_only_is_never_oc_source_publication_even_if_origin_later_matches(self):
  value={'source':self.head,'base':self.base,'store':str(self.root),'verification_scope':d.COMPONENT_SCOPE,'source_publication':False}
  for promote in (False,True):
   with patch.object(d,'verify',return_value=value),patch.object(d.native,'git',return_value=self.base+'\trefs/heads/main') as git,patch.object(d,'run') as run:
    with self.assertRaisesRegex(ValueError,'Artifact-only'):d.publish(self.root,'codex/source-oracle-test',promote=promote)
    git.assert_not_called();run.assert_not_called()
 def test_artifact_only_retains_original_base_and_never_becomes_ci(self):
  with self.assertRaisesRegex(ValueError,'original component base'):d.validate(self.root,self.base,'unknown',artifact_only=True)
  with self.assertRaisesRegex(ValueError,'CI_ONLY'):d.validate(self.root,d.COMPONENT_BASE,'unknown',ci=True,artifact_only=True)
  with self.assertRaisesRegex(ValueError,'Closed'):d.validate(self.root,self.base,'unknown',artifact_only='yes')
 def test_wrong_destination_and_moved_base_have_zero_effects(self):
  value={'source':self.head,'base':self.base,'store':str(self.root),'verification_scope':d.SOURCE_SCOPE,'source_publication':True}
  for destination,remote in [('https://example.invalid/wrong.git',self.base),('https://github.com/'+d.native.REPOSITORY+'.git','f'*40)]:
   def observed(root,*args):
    if args[0]=='remote':return destination
    if args[0]=='ls-remote':return remote+'\trefs/heads/main'
    raise AssertionError(args)
   with patch.object(d,'verify',return_value=value),patch.object(d.native,'git',side_effect=observed),patch.object(d,'run') as run:
    with self.assertRaises(ValueError):d.publish(self.root,'codex/source-oracle-test')
    run.assert_not_called()


unittest.main(argv=['profile'],verbosity=2)
`;
test('closed native Oracle profile boundaries',async()=>{
 const parent=join(root,'Vault/tmp/oracle-publication-boundary/profile-contribution');await mkdir(parent,{recursive:true});
 const work=await mkdtemp(join(parent,'unit-'));
 try{
  const result=spawnSync('python3',['-B','-c',suite,work],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
  console.log('BOC_ORACLE_PROFILE_UNIT '+JSON.stringify({exit_code:result.status,stdout_base64:Buffer.from(result.stdout??'').toString('base64'),stderr_base64:Buffer.from(result.stderr??'').toString('base64')}));
  assert.equal(result.status,0,result.stdout+result.stderr);assert.match(result.stderr,/Ran [1-9][0-9]* tests? in/u);assert.match(result.stderr,/\nOK\s*$/u);assert.doesNotMatch(result.stderr,/skipped=/u);
 }finally{await rm(work,{recursive:true,force:true});}
});
