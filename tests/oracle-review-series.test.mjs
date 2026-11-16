import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdtemp, mkdir, readFile, lstat, rm, rmdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {join} from "node:path";
import test from "node:test";
import {isolatedTestCohort} from "./helpers/isolated-test-cohort.mjs";
import {assertValidationContinuity, createVerifiedDirectory, prepareNativeValidationResources} from "./helpers/native-validation-state.mjs";
import {prepareNativeValidationGit} from "./helpers/native-validation-git.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const environmentHash = environment => hash(JSON.stringify(environment, Object.keys(environment).sort()));
const discovery = String.raw`
import ast,hashlib,importlib,json,pathlib,platform,stat,subprocess,sys,unittest
sys.path.insert(0,'tests')
module=importlib.import_module('oracle_review_series')
from tools import oracle_approval as oracle
classes=sorted(name for name,value in vars(module).items() if isinstance(value,type) and issubclass(value,unittest.TestCase) and value.__module__==module.__name__)
assert classes==['ReviewSeries']
assert not any(hasattr(module,name) for name in ('setUpModule','tearDownModule'))
assert module.ReviewSeries.setUpClass.__func__ is unittest.TestCase.setUpClass.__func__
assert module.ReviewSeries.tearDownClass.__func__ is unittest.TestCase.tearDownClass.__func__
source=pathlib.Path('tests/oracle_review_series.py').read_bytes()
case=next(node for node in ast.parse(source).body if isinstance(node,ast.ClassDef) and node.name=='ReviewSeries')
declared=sorted('oracle_review_series.ReviewSeries.'+node.name for node in case.body if isinstance(node,ast.FunctionDef) and node.name.startswith('test_'))
actual=[item.id() for item in unittest.TestLoader().loadTestsFromTestCase(module.ReviewSeries)]
assert actual==declared and len(actual)==172 and len(set(actual))==172
paths=sorted(set(oracle.REVIEW_POLICY_MODULES)|{'tests/oracle_review_series.py','tests/oracle-review-series.test.mjs','tests/helpers/isolated-test-cohort.mjs','tests/helpers/native-validation-git.mjs','tests/helpers/native-validation-state.mjs','.agents/skills/oracle/review-output.schema.json'})
hashes={}
modes={}
for name in paths:
 path=pathlib.Path(name);fact=path.lstat()
 assert stat.S_ISREG(fact.st_mode) and not path.is_symlink(),'Discovery requires regular source: '+name
 raw=path.read_bytes()
 mode=subprocess.check_output(['git','ls-tree','-z','HEAD','--',name]).split(b' ',1)[0].decode()
 assert mode==('100755' if fact.st_mode&0o111 else '100644'),'Discovery mode differs from committed source: '+name
 modes[name]=mode
 assert raw==subprocess.check_output(['git','show','HEAD:'+name]),'Discovery differs from committed source: '+name
 hashes[name]=hashlib.sha256(raw).hexdigest()
probe=module.ReviewSeries('runTest')
try:
 probe.setUp();fixture_inputs=probe.fixture_inputs
finally:probe.doCleanups()
print(json.dumps({'ids':actual,'source_sha256':hashes,'source_modes':modes,'fixture_inputs':fixture_inputs,'commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'runtime':{'executable':sys.executable,'version':sys.version,'platform':platform.platform()}}))
`;
const execute = String.raw`
import hashlib,json,os,pathlib,sys,time,unittest
unit,report_path,expected_environment=sys.argv[1:]
def environment_hash():
 return hashlib.sha256(json.dumps(dict(os.environ),sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
assert environment_hash()==expected_environment,'Initial child environment differs'
sys.path.insert(0,'tests')
class Result(unittest.TextTestResult):
 def __init__(self,*args,**kwargs):
  super().__init__(*args,**kwargs);self.executed=[];self.passed=[];self.spans=[]
 def startTest(self,case):
  self.executed.append(case.id());self.spans.append({'id':case.id(),'started_ms':round(time.monotonic()*1000,3)});super().startTest(case)
 def stopTest(self,case):
  self.fixture_inputs=getattr(case,'fixture_inputs',None);self.spans[-1]['finished_ms']=round(time.monotonic()*1000,3);super().stopTest(case)
 def addSuccess(self,case):self.passed.append(case.id());super().addSuccess(case)
suite=unittest.TestLoader().loadTestsFromName(unit)
assert [case.id() for case in suite]==[unit]
result=unittest.TextTestRunner(verbosity=2,resultclass=Result).run(suite)
report={'unit':unit,'executed':result.executed,'passed':result.passed,'tests_run':result.testsRun,'spans':result.spans,
 'failures':[case.id() for case,body in result.failures],'errors':[case.id() for case,body in result.errors],
 'skipped':[case.id() for case,reason in result.skipped],'expected_failures':[case.id() for case,body in result.expectedFailures],
 'unexpected_successes':[case.id() for case in result.unexpectedSuccesses],'pid':os.getpid(),'executable':sys.executable,'version':sys.version,
 'fixture_inputs':getattr(result,'fixture_inputs',None),'environment_before_sha256':expected_environment,'environment_after_sha256':environment_hash()}
fd=os.open(report_path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as output:json.dump(report,output);output.flush();os.fsync(output.fileno())
sys.exit(0 if result.wasSuccessful() else 1)
`;

const temporary = join(root,"Vault/tmp");
await mkdir(temporary,{recursive:true});
const owned = await createVerifiedDirectory(temporary,"review-series-cohort-");
const cohortRoot = owned.path;
let prepared, resources, cohort, stopMonitor, interrupted=false;
const jobs=[];
const signalHandlers=[];
async function cleanup() {
  const problems=[];
  try {if(stopMonitor) await stopMonitor();} catch(error){problems.push(error);}
  try {if(resources) await resources.dispose();} catch(error){problems.push(error);}
  try {if(prepared) await prepared.dispose();} catch(error){problems.push(error);}
  for(const job of jobs) {
    try {
      await owned.verify();
      const fact=await lstat(job.directory,{bigint:true});
      assert.equal(fact.dev,job.identity.dev);assert.equal(fact.ino,job.identity.ino);
      assert.equal(fact.uid,job.identity.uid);assert.equal(fact.mode&0o777n,0o700n);
      assert.ok(fact.isDirectory()&&!fact.isSymbolicLink());
      await rm(job.directory,{recursive:true});
    } catch(error) {problems.push(error);}
  }
  try {await owned.dispose();} catch(error){problems.push(error);}
  for(const [signal,handler] of signalHandlers)process.removeListener(signal,handler);
  if(problems.length)throw new AggregateError(problems,"Verified-owned validation cleanup failed");
}
let initial,inventory,finish;
try {
  prepared=await prepareNativeValidationGit({parentDirectory:cohortRoot});
  inventory=()=>JSON.parse(execFileSync(prepared.python,["-B","-c",discovery],
    {cwd:root,env:prepared.environment,encoding:"utf8",timeout:30000,maxBuffer:2*1024*1024}));
  initial=inventory();
  resources=await prepareNativeValidationResources();
  const concurrency=resources.capacity;
  console.log("BOC_REVIEW_SERIES_ADMISSION "+JSON.stringify({concurrency,resources:resources.provenance}));
  for(const [index,name] of initial.ids.entries()) {
    await owned.verify();
    const directory=join(cohortRoot,"case-"+index);await mkdir(directory,{mode:0o700});
    const identity=await lstat(directory,{bigint:true});
    // Register ownership before any remaining fallible job construction.
    const job={name,directory,identity};jobs.push(job);
    const environment={...prepared.environment,TMPDIR:directory};
    Object.assign(job,{environmentHash:environmentHash(environment),report:join(directory,"result.json"),
      command:prepared.python,args:["-B","-c",execute,name,join(directory,"result.json"),environmentHash(environment)],cwd:root,env:environment});
  }
  cohort=isolatedTestCohort(jobs,{concurrency,captureBytes:true});
  stopMonitor=resources.startMonitor(()=>cohort.cancel());
  for(const signal of ["SIGINT","SIGTERM"]) {
    const stop=()=>{interrupted=true;cohort.cancel();};
    process.on(signal,stop);signalHandlers.push([signal,stop]);
  }
  finish=(async()=>{
    const reports=[],problems=[];
    let continuity=null,peak=0,cleanupComplete=false;
    try {
      await cohort.completion;
      if(interrupted)problems.push("Validation interrupted by an owned cancellation signal");
      for(const job of jobs) {
        const result=await cohort.outcome(job.name);
        console.log("BOC_REVIEW_SERIES_UNIT "+JSON.stringify({name:job.name,code:result.code,signal:result.signal,error:result.error,cancelled:result.cancelled,
          stdout_bytes:result.stdoutBytes.length,stderr_bytes:result.stderrBytes.length,
          stdout_sha256:hash(result.stdoutBytes),stderr_sha256:hash(result.stderrBytes),
          stdout_base64:result.stdoutBytes.toString("base64"),stderr_base64:result.stderrBytes.toString("base64")}));
        if(result.code!==0||result.signal||result.error||result.cancelled)problems.push(job.name+": process failed");
        try {
          const fact=await lstat(job.report);assert.ok(fact.isFile()&&!fact.isSymbolicLink());assert.equal(fact.mode&0o777,0o600);
          const report=JSON.parse(await readFile(job.report,"utf8"));
          assert.deepEqual(Object.keys(report).sort(),["unit","executed","passed","tests_run","spans","failures","errors","skipped","expected_failures","unexpected_successes","pid","executable","version","fixture_inputs","environment_before_sha256","environment_after_sha256"].sort());
          assert.ok(Number.isSafeInteger(report.pid)&&report.pid>1);assert.equal(report.unit,job.name);assert.deepEqual(report.executed,[job.name]);assert.deepEqual(report.passed,[job.name]);assert.equal(report.tests_run,1);
          for(const key of ["failures","errors","skipped","expected_failures","unexpected_successes"])assert.deepEqual(report[key],[]);
          assert.deepEqual(report.fixture_inputs,initial.fixture_inputs);
          assert.equal(report.executable,initial.runtime.executable);assert.equal(report.version,initial.runtime.version);
          assert.equal(report.environment_before_sha256,job.environmentHash);assert.equal(report.environment_after_sha256,job.environmentHash);
          assert.equal(report.spans.length,1);assert.equal(report.spans[0].id,job.name);
          assert.ok(Number.isFinite(report.spans[0].started_ms)&&Number.isFinite(report.spans[0].finished_ms)&&report.spans[0].finished_ms>report.spans[0].started_ms);
          assert.match(result.stderrBytes.toString("utf8"),/\nRan 1 test in [0-9.]+s\n\nOK\s*$/u);
          reports.push(report);
        } catch(error){problems.push(job.name+": "+error.message);}
      }
      const executed=reports.flatMap(row=>row.executed).sort();
      if(JSON.stringify(executed)!==JSON.stringify(initial.ids)||new Set(executed).size!==172)problems.push("Complete172-case membership changed");
      try {await prepared.verify();await resources.verify();continuity=assertValidationContinuity(initial,inventory());}
      catch(error){problems.push("Source/runtime/tool/resource custody changed: "+error.message);}
      const events=reports.flatMap(row=>row.spans.flatMap(span=>[[span.started_ms,1],[span.finished_ms,-1]])).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      let active=0;for(const [,delta]of events){active+=delta;peak=Math.max(peak,active);}
      if(active!==0||peak!==concurrency||new Set(reports.map(row=>row.pid)).size!==jobs.length)problems.push("Actual independent process bound changed");
    }catch(error){problems.push("Validation execution failed: "+error.message);cohort.cancel();await cohort.completion;}
    finally {
      try {await cleanup();cleanupComplete=true;}catch(error){problems.push(error.message);}
    }
    const proof={...initial,executed:reports.flatMap(row=>row.executed).sort(),concurrency,actual_peak:peak,
      resource_admission:resources.provenance,continuity,native_git:prepared.provenance,
      node:{executable:process.execPath,version:process.version},cleanup:cleanupComplete,problems};
    console.log("BOC_REVIEW_SERIES_MEMBERSHIP "+JSON.stringify(proof));
    return {reports,problems,proof};
  })();
}catch(error) {
  if(cohort){cohort.cancel();await cohort.completion;}
  try {await cleanup();}catch(cleanupError){throw new AggregateError([error,cleanupError],"Validation startup rejected; cleanup failed");}
  throw error;
}
test("Oracle review series: discovered test targets match the declared Python suite",async()=>{
  const result=await finish;assert.deepEqual(result.problems,[]);
});
for(const name of initial.ids)test("Oracle review series: "+name.split(".").at(-1).slice(5).replaceAll("_"," "),async()=>{
  const result=await finish;assert.deepEqual(result.problems,[]);assert.ok(result.reports.some(report=>report.unit===name));
});
