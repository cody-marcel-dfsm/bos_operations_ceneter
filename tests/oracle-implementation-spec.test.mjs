import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,rmSync,readFileSync,lstatSync,rmdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {isolatedTestCohort} from './helpers/isolated-test-cohort.mjs';

const root=new URL('../',import.meta.url);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const environmentHash=environment=>hash(JSON.stringify(environment,Object.keys(environment).sort()));
const parentEnvironment=environmentHash(process.env);
const discovery=String.raw`
import ast,json,sys,unittest,hashlib,subprocess,platform,stat
from pathlib import Path
sys.path.insert(0,'tests')
import oracle_spec_test as suite
assert not any(hasattr(suite,name) for name in ('setUpModule','tearDownModule'))
path=Path('tests/oracle_spec_test.py');raw=path.read_bytes();tree=ast.parse(raw)
assert not any(isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in {'setUpModule','tearDownModule'} for n in tree.body)
rows=[];all_ids=[];declared=[];split={'LaneExecution','DeterministicProvenance','CategoryContentReuse'}
for node in tree.body:
 if not isinstance(node,ast.ClassDef):continue
 cls=getattr(suite,node.name)
 names=unittest.TestLoader().getTestCaseNames(cls)
 ids=[node.name+'.'+name for name in names]
 declared.extend(node.name+'.'+n.name for n in node.body if isinstance(n,ast.FunctionDef) and n.name.startswith('test_'))
 if not ids:continue
 if node.name in split:
  assert cls.setUpClass.__func__ is unittest.TestCase.setUpClass.__func__
  assert cls.tearDownClass.__func__ is unittest.TestCase.tearDownClass.__func__
  rows.extend({'name':identity,'ids':[identity]} for identity in ids)
 else:rows.append({'name':node.name,'ids':ids})
 all_ids.extend(ids)
assert sorted(all_ids)==sorted(declared) and len(all_ids)==len(set(all_ids)) and all_ids
assert sorted(all_ids)==sorted(identity for row in rows for identity in row['ids'])
paths=sorted(set(suite.oracle.REVIEW_POLICY_MODULES)|{'tests/oracle_spec_test.py','tests/published_fixture.py','tests/oracle_review_series.py','tests/privacy_coverage_test.py','tests/oracle-implementation-spec.test.mjs','tests/helpers/isolated-test-cohort.mjs','.agents/skills/oracle/review-output.schema.json'})
source={}
for name in paths:
 path=Path(name);fact=path.lstat();assert stat.S_ISREG(fact.st_mode) and not path.is_symlink()
 body=path.read_bytes();assert body==subprocess.check_output(['git','show','HEAD:'+name]),'Uncommitted fixture input: '+name
 mode=subprocess.check_output(['git','ls-tree','-z','HEAD','--',name]).split(b' ',1)[0].decode()
 assert mode==('100755' if fact.st_mode&0o111 else '100644'),'Uncommitted fixture mode: '+name
 source[name]={'sha256':hashlib.sha256(body).hexdigest(),'mode':mode}
def binary_digest(path):
 with open(path,'rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()
print(json.dumps({'source':source,'rows':rows,'ids':sorted(all_ids),'commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'runtime':{'executable':sys.executable,'version':sys.version,'platform':platform.platform(),'sha256':binary_digest(sys.executable),'node':{'executable':sys.argv[1],'version':sys.argv[2],'sha256':binary_digest(sys.argv[1])}}}))
`;
const discover=()=>JSON.parse(execFileSync('python3',['-B','-c',discovery,process.execPath,process.version],
 {cwd:root,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024,stdio:'pipe'}));
const inventory=discover();
const execute=String.raw`
import hashlib,json,os,pathlib,sys,time,unittest
sys.path.insert(0,'tests')
name,expected_text,report_path,expected_environment=sys.argv[1:]
expected=json.loads(expected_text)
def environment_hash():
 return hashlib.sha256(json.dumps(dict(os.environ),sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
assert environment_hash()==expected_environment,'Initial child environment differs'
def normalize(value):
 assert value.startswith('oracle_spec_test.')
 return value[len('oracle_spec_test.'):]
def ids(value):
 return [identity for row in value for identity in (ids(row) if isinstance(row,unittest.TestSuite) else [normalize(row.id())])]
suite=unittest.defaultTestLoader.loadTestsFromName('oracle_spec_test.'+name)
assert ids(suite)==expected,'Selected unit membership differs'
class Result(unittest.TextTestResult):
 def __init__(self,*args,**kwargs):
  super().__init__(*args,**kwargs);self.executed=[];self.passed=[];self.spans=[]
 def startTest(self,case):
  self.executed.append(normalize(case.id()));self.spans.append({'id':normalize(case.id()),'started_ms':round(time.monotonic()*1000,3)});super().startTest(case)
 def stopTest(self,case):
  self.spans[-1]['finished_ms']=round(time.monotonic()*1000,3);super().stopTest(case)
 def addSuccess(self,case):self.passed.append(normalize(case.id()));super().addSuccess(case)
result=unittest.TextTestRunner(verbosity=2,resultclass=Result).run(suite)
report={'unit':name,'executed':result.executed,'passed':result.passed,'tests_run':result.testsRun,'spans':result.spans,
 'failures':[normalize(case.id()) for case,body in result.failures],'errors':[normalize(case.id()) for case,body in result.errors],
 'skipped':[normalize(case.id()) for case,reason in result.skipped],'expected_failures':[normalize(case.id()) for case,body in result.expectedFailures],
 'unexpected_successes':[normalize(case.id()) for case in result.unexpectedSuccesses],'pid':os.getpid(),'executable':sys.executable,'version':sys.version,
 'environment_before_sha256':expected_environment,'environment_after_sha256':environment_hash()}
fd=os.open(report_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as stream:json.dump(report,stream);stream.flush();os.fsync(stream.fileno())
sys.exit(0 if result.wasSuccessful() else 1)
`;
const temporary=join(fileURLToPath(root),'Vault/tmp');mkdirSync(temporary,{recursive:true});
const cohortRoot=mkdtempSync(join(temporary,'spec-cohort-'));
const identity=lstatSync(cohortRoot,{bigint:true});
const jobs=[];
let cohort,interrupted=false;
const handlers=[];
function verifyRoot(){const fact=lstatSync(cohortRoot,{bigint:true});for(const key of ['dev','ino','uid'])assert.equal(fact[key],identity[key]);assert.ok(fact.isDirectory()&&!fact.isSymbolicLink());assert.equal(fact.mode&0o777n,0o700n);}
function cleanup(){
 verifyRoot();
 for(const job of jobs){verifyRoot();const fact=lstatSync(job.directory,{bigint:true});assert.ok(fact.isDirectory()&&!fact.isSymbolicLink());
  for(const key of ['dev','ino','uid'])assert.equal(fact[key],job.identity[key]);assert.equal(fact.mode&0o777n,0o700n);
  rmSync(job.directory,{recursive:true});}
 verifyRoot();rmdirSync(cohortRoot);
 for(const [signal,handler]of handlers)process.removeListener(signal,handler);
}
let finish;
try{
 for(const [index,row]of inventory.rows.entries()){
  const directory=join(cohortRoot,String(index));mkdirSync(directory,{mode:0o700});
  const environment={...process.env,TMPDIR:directory};const expectedEnvironment=environmentHash(environment);
  jobs.push({name:row.name,ids:row.ids,directory,identity:lstatSync(directory,{bigint:true}),report:join(directory,'result.json'),
   expectedEnvironment,command:inventory.runtime.executable,args:['-B','-c',execute,row.name,JSON.stringify(row.ids),join(directory,'result.json'),expectedEnvironment],cwd:root,env:environment});
 }
 cohort=isolatedTestCohort(jobs,{concurrency:4,timeoutMs:120000,captureBytes:true});
 for(const signal of ['SIGINT','SIGTERM']){
  const handler=()=>{interrupted=true;cohort.cancel();};process.on(signal,handler);handlers.push([signal,handler]);
 }
 finish=(async()=>{
  const problems=[],reports=[];let continuity=null,cleaned=false;
  try{
   await cohort.completion;
   if(interrupted)problems.push('Spec units interrupted by an owned cancellation signal');
   for(const job of jobs){
    const result=await cohort.outcome(job.name);
    console.log('native-spec-cohort '+JSON.stringify({name:job.name,ids:job.ids,source:inventory.source,
     code:result.code,signal:result.signal,error:result.error,cancelled:result.cancelled,
     stdout_bytes:result.stdoutBytes.length,stderr_bytes:result.stderrBytes.length,
     stdout_sha256:hash(result.stdoutBytes),stderr_sha256:hash(result.stderrBytes),
     stdout_base64:result.stdoutBytes.toString('base64'),stderr_base64:result.stderrBytes.toString('base64')}));
    if(result.code!==0||result.signal||result.error||result.cancelled)problems.push(job.name+': process failed');
    try{
     const fact=lstatSync(job.report);assert.ok(fact.isFile()&&!fact.isSymbolicLink());assert.equal(fact.mode&0o777,0o600);
     const report=JSON.parse(readFileSync(job.report,'utf8'));
     assert.deepEqual(Object.keys(report).sort(),['unit','executed','passed','tests_run','spans','failures','errors','skipped','expected_failures','unexpected_successes','pid','executable','version','environment_before_sha256','environment_after_sha256'].sort());
     assert.equal(report.unit,job.name);assert.deepEqual(report.executed,job.ids);assert.deepEqual(report.passed,job.ids);assert.equal(report.tests_run,job.ids.length);
     for(const key of ['failures','errors','skipped','expected_failures','unexpected_successes'])assert.deepEqual(report[key],[]);
     assert.equal(report.executable,inventory.runtime.executable);assert.equal(report.version,inventory.runtime.version);
     assert.ok(Number.isSafeInteger(report.pid)&&report.pid>1);
     assert.equal(report.environment_before_sha256,job.expectedEnvironment);assert.equal(report.environment_after_sha256,job.expectedEnvironment);
     assert.deepEqual(report.spans.map(span=>span.id),job.ids);for(const span of report.spans)assert.ok(Number.isFinite(span.started_ms)&&Number.isFinite(span.finished_ms)&&span.finished_ms>span.started_ms);
     const stderr=new TextDecoder('utf8',{fatal:true}).decode(result.stderrBytes);
     const summaries=[...stderr.matchAll(/Ran (\d+) tests? in /gu)];assert.equal(summaries.length,1);assert.equal(Number(summaries[0][1]),job.ids.length);assert.match(stderr,/\nOK\s*$/u);
     reports.push(report);
    }catch(error){problems.push(job.name+': '+error.message);}
   }
   const executed=reports.flatMap(row=>row.executed).sort();assert.deepEqual(executed,inventory.ids);assert.equal(new Set(executed).size,inventory.ids.length);
   assert.equal(environmentHash(process.env),parentEnvironment,'Parent execution environment changed');
   const current=discover();const {commit:beforeCommit,...before}=inventory;const {commit:afterCommit,...after}=current;
   assert.deepEqual(after,before);continuity={before_commit:beforeCommit,after_commit:afterCommit};
  }catch(error){problems.push(error.message);cohort.cancel();await cohort.completion;}
  finally{try{cleanup();cleaned=true;}catch(error){problems.push('Owned cleanup failed: '+error.message);}}
  const proof={...inventory,executed:reports.flatMap(row=>row.executed).sort(),reports,concurrency:4,parent_environment_sha256:parentEnvironment,continuity,cleanup:cleaned,problems};
  console.log('BOC_SPEC_MEMBERSHIP '+JSON.stringify(proof));return proof;
 })();
}catch(error){if(cohort){cohort.cancel();await cohort.completion;}try{cleanup();}catch(cleanupError){throw new AggregateError([error,cleanupError],'Spec unit startup and cleanup failed');}throw error;}
test('sealed spec discovery includes every declared test exactly once',async()=>{
 const proof=await finish;assert.deepEqual(proof.problems,[]);assert.deepEqual(proof.executed,inventory.ids);
});
for(const row of inventory.rows)test('sealed spec complete unit: '+row.name,async()=>{
 const proof=await finish;assert.deepEqual(proof.problems,[]);assert.ok(proof.reports.some(report=>report.unit===row.name));
});
