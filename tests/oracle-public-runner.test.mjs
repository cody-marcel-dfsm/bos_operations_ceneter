import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('runner enforces capabilities, bounded native process transport and uncertain outcomes',()=>{
const code=String.raw`
import json,os,sys,tempfile,unittest
from pathlib import Path
from oracle_core import runner
ROOT=Path.cwd()
class Transport(unittest.TestCase):
 def setUp(self):
  self.root=Path(tempfile.mkdtemp(prefix='oracle-runner-',dir=ROOT/'Vault/tmp'));self.bin=self.root/'bin';self.bin.mkdir();self.old=os.environ['PATH'];os.environ['PATH']=str(self.bin)+os.pathsep+self.old
  self.config={'engine':'codex','executable':'codex','model':'synthetic-transport-fixture','reasoning_effort':'medium','timeout_seconds':1,'sandbox':'read-only','max_output_bytes':4096}
 def tearDown(self):os.environ['PATH']=self.old
 def executable(self,body):
  source='#!'+sys.executable+'\nimport sys,json,time\nfrom pathlib import Path\n'
  source+='if "--help" in sys.argv:print("--ignore-user-config --ephemeral --strict-config --output-schema --sandbox");raise SystemExit(0)\n'
  source+='if "features" in sys.argv:\n print("\\n".join(x+" stable false" for x in '+repr(list(runner.DISABLED))+'));raise SystemExit(0)\n'
  source+=body+'\n';p=self.bin/'codex';p.write_text(source);p.chmod(0o700)
 def run_model(self):return runner.run(self.config,self.root,self.root/'operation','SYNTHETIC transport fixture','Explicit test policy',{'type':'object'})
 def test_actual_command_capability_vector(self):
  cmd=runner.codex_command('codex','m','medium','r','s','o','p','trusted')
  for flag in ['--ignore-user-config','--ignore-rules','--ephemeral','--strict-config']:self.assertIn(flag,cmd)
  self.assertIn('mcp_servers={}',cmd);self.assertIn('project_doc_max_bytes=0',cmd);self.assertIn('approval_policy="never"',cmd);self.assertIn('read-only',cmd)
  self.assertNotIn('danger-full-access',cmd)
 def test_existing_oc_capabilities_are_explicit_adapter(self):
  cmd=runner.codex_command('codex','m','medium','r','s','o','p','trusted',sandbox='danger-full-access',portable=False)
  self.assertIn('danger-full-access',cmd);self.assertNotIn('mcp_servers={}',cmd);self.assertNotIn('--disable',cmd)
 def test_successful_process_is_bound(self):
  self.executable('Path(sys.argv[sys.argv.index("--output-last-message")+1]).write_text(json.dumps({"synthetic":True}))')
  result,meta=self.run_model();self.assertEqual(result,{'synthetic':True});self.assertEqual(meta['model'],'synthetic-transport-fixture')
  process=json.loads((self.root/'operation/process.json').read_text());self.assertEqual(process['exit_code'],0);self.assertIsNone(process['failure'])
 def test_timeout_retained_not_retried(self):
  self.executable('time.sleep(5)')
  with self.assertRaises(RuntimeError):self.run_model()
  process=json.loads((self.root/'operation/process.json').read_text());self.assertEqual(process['failure'],'timeout')
 def test_malformed_output_refused(self):
  self.executable('Path(sys.argv[sys.argv.index("--output-last-message")+1]).write_text("invalid-json")')
  with self.assertRaises(ValueError):self.run_model()
 def test_output_bound_refused(self):
  self.executable('sys.stdout.write("x"*1000000);sys.stdout.flush();time.sleep(2)')
  with self.assertRaises(RuntimeError):self.run_model()
  self.assertLessEqual(sum((self.root/'operation'/n).stat().st_size for n in ['stdout.log','stderr.log']),4096)
 def test_unsupported_capabilities_fail_closed(self):
  self.executable('raise SystemExit(0)');p=self.bin/'codex';p.write_text(p.read_text().replace('stable false','stable true'))
  with self.assertRaises(ValueError):runner.preflight(self.config)
unittest.main()
`;
const run=spawnSync('Vault/index/venv/bin/python',['-B','-c',code],{cwd:new URL('../',import.meta.url),env:{...process.env,PYTHONPATH:'tools',PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:20000,maxBuffer:4*1024*1024});
assert.equal(run.status,0,`${run.stdout}\n${run.stderr}`);assert.match(run.stderr,/Ran 7 tests/);assert.doesNotMatch(run.stderr,/skipped=/);
});
