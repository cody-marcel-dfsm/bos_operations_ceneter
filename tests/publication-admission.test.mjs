import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir,lstat,readFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import test from "node:test";
import {isolatedTestCohort} from "./helpers/isolated-test-cohort.mjs";
import {prepareNativeValidationGit} from "./helpers/native-validation-git.mjs";
import {assertValidationContinuity,createVerifiedDirectory,prepareNativeValidationResources} from "./helpers/native-validation-state.mjs";

const moduleName="publication_admission_test",classes=["PublicationAdmission", "OwnedDestinationResolution"],expectedCount=35;
const root=fileURLToPath(new URL("../",import.meta.url));
const hash=raw=>createHash("sha256").update(raw).digest("hex");
const testLabel=name=>"Publication admission: "+name.replace(/^publication_admission_test\./u,"").replace(/^PublicationAdmission\./u,"").replace(/^OwnedDestinationResolution\./u,"destination ").replace(/^test_/u,"").replaceAll("_"," ");
const discovery=String.raw`
import ast,hashlib,importlib,json,pathlib,platform,stat,subprocess,sys,unittest
name,count,classes=sys.argv[1:];count=int(count);classes=json.loads(classes)
sys.path.insert(0,'tests');module=importlib.import_module(name)
visible=sorted(key for key,value in vars(module).items() if isinstance(value,type) and issubclass(value,unittest.TestCase))
assert visible==sorted(classes),'Unexpected imported or declared test classes'
assert not any(hasattr(module,key) for key in ('setUpModule','tearDownModule'))
tree=ast.parse(pathlib.Path('tests/'+name+'.py').read_bytes());ids=[]
for key in classes:
 cls=getattr(module,key);assert cls.__module__==name
 assert all(getattr(getattr(cls,hook,None),'__func__',None)==getattr(getattr(unittest.TestCase,hook,None),'__func__',None) for hook in ('setUpClass','tearDownClass'))
 node=next(node for node in tree.body if isinstance(node,ast.ClassDef) and node.name==key)
 declared=sorted(item.name for item in node.body if isinstance(item,ast.FunctionDef) and item.name.startswith('test_'))
 actual=unittest.TestLoader().getTestCaseNames(cls);assert actual==declared
 ids.extend(name+'.'+key+'.'+method for method in actual)
assert len(ids)==count and len(set(ids))==count
from tools import oracle_approval as oracle
paths=sorted(set(oracle.REVIEW_POLICY_MODULES)|{'tests/publication-admission.test.mjs','tests/shipment-workflow.test.mjs','tests/publication_admission_test.py','tests/shipment_workflow_test.py','tests/oracle_review_series.py','tests/helpers/isolated-test-cohort.mjs','tests/helpers/native-validation-git.mjs','tests/helpers/native-validation-state.mjs','.agents/skills/oracle/review-output.schema.json'})
hashes={};modes={}
for name in paths:
 path=pathlib.Path(name);fact=path.lstat();assert stat.S_ISREG(fact.st_mode) and not path.is_symlink()
 raw=path.read_bytes();mode=subprocess.check_output(['git','ls-tree','-z','HEAD','--',name]).split(b' ',1)[0].decode()
 assert mode==('100755' if fact.st_mode&0o111 else '100644'),'Uncommitted source mode: '+name
 assert raw==subprocess.check_output(['git','show','HEAD:'+name]),'Uncommitted source bytes: '+name
 hashes[name]=hashlib.sha256(raw).hexdigest();modes[name]=mode
print(json.dumps({'ids':ids,'source_sha256':hashes,'source_modes':modes,'commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'runtime':{'executable':sys.executable,'version':sys.version,'platform':platform.platform()}}))
`;
const environmentProbe=String.raw`
import hashlib,json,os,sys
print(json.dumps({'sha256':hashlib.sha256(json.dumps(dict(os.environ),sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest(),'executable':sys.executable,'version':sys.version}))
`;
const execute=String.raw`
import hashlib,json,os,pathlib,sys,time,unittest
unit,path,expected=sys.argv[1:]
def envhash():return hashlib.sha256(json.dumps(dict(os.environ),sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
assert envhash()==expected,'Actual initial Python environment changed'
sys.path.insert(0,'tests')
class Result(unittest.TextTestResult):
 def __init__(self,*args,**kwargs):super().__init__(*args,**kwargs);self.executed=[];self.passed=[];self.spans=[]
 def startTest(self,case):self.executed.append(case.id());self.spans.append({'id':case.id(),'started_ms':round(time.monotonic()*1000,3)});super().startTest(case)
 def stopTest(self,case):self.spans[-1]['finished_ms']=round(time.monotonic()*1000,3);super().stopTest(case)
 def addSuccess(self,case):self.passed.append(case.id());super().addSuccess(case)
suite=unittest.TestLoader().loadTestsFromName(unit);assert [case.id() for case in suite]==[unit]
result=unittest.TextTestRunner(verbosity=2,resultclass=Result).run(suite)
report={'unit':unit,'executed':result.executed,'passed':result.passed,'tests_run':result.testsRun,'spans':result.spans,'pid':os.getpid(),'executable':sys.executable,'version':sys.version,'environment_before_sha256':expected,'environment_after_sha256':envhash(),'failures':[case.id() for case,body in result.failures],'errors':[case.id() for case,body in result.errors],'skipped':[case.id() for case,reason in result.skipped],'expected_failures':[case.id() for case,body in result.expectedFailures],'unexpected_successes':[case.id() for case in result.unexpectedSuccesses]}
fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'w') as output:json.dump(report,output);output.flush();os.fsync(output.fileno())
sys.exit(0 if result.wasSuccessful() else 1)
`;

const temporary=join(root,"Vault/tmp");await mkdir(temporary,{recursive:true});
const owned=await createVerifiedDirectory(temporary,"publication-consumer-");
let prepared,resources,cohort,stopMonitor,initial,inventory,finish,interrupted=false;
const jobs=[],signalHandlers=[];
const cancelled=()=>{if(interrupted)throw new Error("Validation interrupted during initialization");};
async function cleanup(){
  const errors=[];
  try{if(stopMonitor)await stopMonitor();}catch(error){errors.push(error);}
  try{if(resources)await resources.dispose();}catch(error){errors.push(error);}
  try{if(prepared)await prepared.dispose();}catch(error){errors.push(error);}
  for(const job of jobs)try{
    await owned.verify();const fact=await lstat(job.directory,{bigint:true});
    assert.ok(fact.isDirectory()&&!fact.isSymbolicLink());
    assert.equal(fact.dev,job.identity.dev);assert.equal(fact.ino,job.identity.ino);assert.equal(fact.uid,job.identity.uid);assert.equal(fact.mode&0o777n,0o700n);
    await rm(job.directory,{recursive:true});
  }catch(error){errors.push(error);}
  try{await owned.dispose();}catch(error){errors.push(error);}
  for(const [signal,handler]of signalHandlers)process.removeListener(signal,handler);
  if(errors.length)throw new AggregateError(errors,"Owned consumer cleanup failed");
}
for(const signal of ["SIGINT","SIGTERM"]){const handler=()=>{interrupted=true;cohort?.cancel();};process.on(signal,handler);signalHandlers.push([signal,handler]);}
try{
  prepared=await prepareNativeValidationGit({parentDirectory:owned.path});cancelled();
  const python=(code,args=[],environment=prepared.environment)=>JSON.parse(execFileSync(prepared.python,["-B","-c",code,...args],{cwd:root,env:environment,encoding:"utf8",timeout:30000,maxBuffer:2*1024*1024}));
  inventory=()=>python(discovery,[moduleName,String(expectedCount),JSON.stringify(classes)]);
  initial=inventory();cancelled();resources=await prepareNativeValidationResources();cancelled();
  const concurrency=resources.capacity;
  console.log("BOC_PUBLICATION_CONSUMER_ADMISSION "+JSON.stringify({module:moduleName,concurrency,resource_admission:resources.provenance}));
  for(const [index,name]of initial.ids.entries()){
    cancelled();await owned.verify();const directory=join(owned.path,"case-"+index);await mkdir(directory,{mode:0o700});
    const job={name,directory,identity:await lstat(directory,{bigint:true})};jobs.push(job);
    const environment={...prepared.environment,TMPDIR:directory};
    // Python may apply its own locale startup default. Bind that actual
    // environment without changing any caller-provided variable.
    const effective=python(environmentProbe,[],environment);
    assert.equal(effective.executable,initial.runtime.executable);assert.equal(effective.version,initial.runtime.version);
    Object.assign(job,{environmentHash:effective.sha256,report:join(directory,"result.json"),command:prepared.python,
      args:["-B","-c",execute,name,join(directory,"result.json"),effective.sha256],cwd:root,env:environment});
  }
  cancelled();await prepared.verify();await resources.verify();
  cohort=isolatedTestCohort(jobs,{concurrency,captureBytes:true});
  stopMonitor=resources.startMonitor(()=>cohort.cancel());
  finish=(async()=>{
    const reports=[],problems=[];let continuity=null,peak=0,cleanupComplete=false;
    try{
      await cohort.completion;if(interrupted)problems.push("Consumer validation interrupted");
      for(const job of jobs){
        const result=await cohort.outcome(job.name);let report=null;
        try{
          const fact=await lstat(job.report);assert.ok(fact.isFile()&&!fact.isSymbolicLink());assert.equal(fact.mode&0o777,0o600);assert.equal(fact.uid,Number(job.identity.uid));assert.ok(fact.size>0&&fact.size<=1024*1024);
          report=JSON.parse(await readFile(job.report,"utf8"));
          assert.deepEqual(Object.keys(report).sort(),["unit","executed","passed","tests_run","spans","pid","executable","version","environment_before_sha256","environment_after_sha256","failures","errors","skipped","expected_failures","unexpected_successes"].sort());
          assert.equal(report.unit,job.name);assert.deepEqual(report.executed,[job.name]);assert.deepEqual(report.passed,[job.name]);assert.equal(report.tests_run,1);
          for(const key of ["failures","errors","skipped","expected_failures","unexpected_successes"])assert.deepEqual(report[key],[]);
          assert.ok(Number.isSafeInteger(report.pid)&&report.pid>1);assert.equal(report.executable,initial.runtime.executable);assert.equal(report.version,initial.runtime.version);
          assert.equal(report.environment_before_sha256,job.environmentHash);assert.equal(report.environment_after_sha256,job.environmentHash);
          assert.equal(report.spans.length,1);assert.equal(report.spans[0].id,job.name);
          assert.ok(Number.isFinite(report.spans[0].started_ms)&&Number.isFinite(report.spans[0].finished_ms)&&report.spans[0].finished_ms>report.spans[0].started_ms);
          assert.match(result.stderrBytes.toString("utf8"),/\nRan 1 test in [0-9.]+s\n\nOK\s*$/u);
          reports.push(report);
        }catch(error){problems.push(job.name+": "+error.message);}
        // Persist every actual stream and available report before cleanup,
        // including failing, skipped, cancelled and malformed outcomes.
        console.log("BOC_PUBLICATION_CONSUMER_UNIT "+JSON.stringify({module:moduleName,name:job.name,code:result.code,signal:result.signal,error:result.error,cancelled:result.cancelled,report,
          stdout_bytes:result.stdoutBytes.length,stderr_bytes:result.stderrBytes.length,stdout_sha256:hash(result.stdoutBytes),stderr_sha256:hash(result.stderrBytes),
          stdout_base64:result.stdoutBytes.toString("base64"),stderr_base64:result.stderrBytes.toString("base64")}));
        if(result.code!==0||result.signal||result.error||result.cancelled)problems.push(job.name+": process failed");
      }
      const executed=reports.flatMap(row=>row.executed).sort();
      if(JSON.stringify(executed)!==JSON.stringify([...initial.ids].sort())||new Set(executed).size!==expectedCount)problems.push("Complete consumer case membership changed");
      const events=reports.flatMap(row=>row.spans.flatMap(span=>[[span.started_ms,1],[span.finished_ms,-1]])).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
      let active=0;for(const [,change]of events){active+=change;peak=Math.max(peak,active);}
      if(active!==0||peak!==concurrency||new Set(reports.map(row=>row.pid)).size!==jobs.length)problems.push("Actual consumer process admission changed");
      try{if(stopMonitor)await stopMonitor();await resources.verify();await prepared.verify();continuity=assertValidationContinuity(initial,inventory());}
      catch(error){problems.push("Consumer source/runtime/tool/resource custody changed: "+error.message);}
    }catch(error){problems.push("Consumer execution failed: "+error.message);cohort.cancel();await cohort.completion;}
    finally{try{await cleanup();cleanupComplete=true;}catch(error){problems.push(error.message);}}
    const proof={...initial,module:moduleName,labels:initial.ids.map(testLabel),executed:reports.flatMap(row=>row.executed).sort(),concurrency,actual_peak:peak,
      resource_admission:resources.provenance,native_git:prepared.provenance,continuity,node:{executable:process.execPath,version:process.version},cleanup:cleanupComplete,problems};
    console.log("BOC_PUBLICATION_CONSUMER_MEMBERSHIP "+JSON.stringify(proof));
    return{reports,problems,proof};
  })();
}catch(error){
  if(cohort){cohort.cancel();await cohort.completion;}
  try{await cleanup();}catch(cleanupError){throw new AggregateError([error,cleanupError],"Consumer startup rejected; owned cleanup failed");}
  throw error;
}
for(const name of initial.ids)test(testLabel(name),async()=>{
  const result=await finish;assert.deepEqual(result.problems,[]);assert.ok(result.reports.some(report=>report.unit===name));
});
