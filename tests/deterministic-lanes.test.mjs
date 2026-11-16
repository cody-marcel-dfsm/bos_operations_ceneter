import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {prepareNativeValidationGit} from './helpers/native-validation-git.mjs';
import {createVerifiedDirectory,assertValidationContinuity} from './helpers/native-validation-state.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const modules=['tests/deterministic_source_test.py','tests/deterministic_package_test.py'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const discovery=String.raw`
import ast,hashlib,importlib,json,os,pathlib,stat,subprocess,sys,unittest
sys.path.insert(0,'tests')
from tools import oracle_approval as oracle
ids={}
for path in ['tests/deterministic_source_test.py','tests/deterministic_package_test.py']:
 name=pathlib.Path(path).stem;module=importlib.import_module(name);declared=[]
 for node in ast.parse(pathlib.Path(path).read_bytes()).body:
  if isinstance(node,ast.ClassDef):
   cls=getattr(module,node.name)
   if isinstance(cls,type) and issubclass(cls,unittest.TestCase):
    assert cls.__module__==name
    declared.extend(name+'.'+node.name+'.'+item.name for item in node.body if isinstance(item,ast.FunctionDef) and item.name.startswith('test_'))
 def flatten(suite):
  for item in suite:
   if isinstance(item,unittest.TestSuite):yield from flatten(item)
   else:yield item.id()
 actual=list(flatten(unittest.defaultTestLoader.loadTestsFromModule(module)))
 assert sorted(actual)==sorted(declared) and len(actual)==len(set(actual)) and actual
 ids[path]=sorted(actual)
paths=sorted(set(oracle.REVIEW_POLICY_MODULES)|set(ids)|{'tests/deterministic-lanes.test.mjs','tests/helpers/native-validation-git.mjs','tests/helpers/native-validation-state.mjs','.agents/skills/oracle/review-output.schema.json'})
inputs={}
for name in paths:
 path=pathlib.Path(name);fact=path.lstat();assert stat.S_ISREG(fact.st_mode) and not path.is_symlink()
 raw=path.read_bytes();mode=subprocess.check_output(['git','ls-tree','-z','HEAD','--',name]).split(b' ',1)[0].decode()
 assert mode==('100755' if fact.st_mode&0o111 else '100644')
 assert raw==subprocess.check_output(['git','show','HEAD:'+name])
 inputs[name]={'sha256':hashlib.sha256(raw).hexdigest(),'mode':mode}
print(json.dumps({'ids':ids,'inputs':inputs,'commit':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'runtime':{'executable':sys.executable,'version':sys.version},'effective_environment_sha256':hashlib.sha256(json.dumps(dict(os.environ),sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()}))
`;
const temporary=join(root,'Vault/tmp');await mkdir(temporary,{recursive:true});
const owned=await createVerifiedDirectory(temporary,'deterministic-lanes-');
let prepared,initial,active,interrupted=false,disposed=false;
const outcomes=[],handlers=[];
function cancel(){
 interrupted=true;
 if(active){
  const child=active;try{process.kill(-child.pid,'SIGTERM');}catch(error){if(error.code!=='ESRCH')throw error;}
  child.killTimer??=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')child.cancelError=error.message;}},2000);
 }
}
async function cleanup(){
 if(disposed)return;disposed=true;const errors=[];
 if(active){cancel();await active.drained;}
 try{if(prepared)await prepared.dispose();}catch(error){errors.push(error);}
 try{await owned.dispose();}catch(error){errors.push(error);}
 for(const [signal,handler]of handlers)process.removeListener(signal,handler);
 if(errors.length)throw new AggregateError(errors,'Deterministic lane cleanup failed');
}
const inventory=()=>JSON.parse(execFileSync(prepared.python,['-B','-c',discovery],{cwd:root,env:prepared.environment,encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024}));
try{
 for(const signal of ['SIGINT','SIGTERM']){process.on(signal,cancel);handlers.push([signal,cancel]);}
 prepared=await prepareNativeValidationGit({parentDirectory:owned.path});
 assert.ok(!interrupted,'Interrupted during native Git preparation');initial=inventory();
}catch(error){try{await cleanup();}catch(cleanupError){throw new AggregateError([error,cleanupError],'Deterministic lane initialization failed');}throw error;}

function execute(module){
 assert.ok(!interrupted,'Deterministic lane interrupted');assert.equal(active,undefined,'Only one lane child may run');
 const stdout=[],stderr=[];const child=spawn(prepared.python,['-B',module,'-v'],{cwd:root,env:prepared.environment,detached:true,stdio:['ignore','pipe','pipe']});
 active=child;let launchError=null;
 child.stdout.on('data',bytes=>stdout.push(bytes));child.stderr.on('data',bytes=>stderr.push(bytes));
 child.on('error',error=>{launchError=error.message;});
 child.drained=new Promise(resolve=>child.once('close',(code,signal)=>{
  clearTimeout(child.killTimer);active=undefined;
  resolve({module,code,signal,error:launchError,cancel_error:child.cancelError??null,cancelled:interrupted,stdout:Buffer.concat(stdout),stderr:Buffer.concat(stderr)});
 }));
 return child.drained;
}
for(const module of modules)test('deterministic lane boundaries: '+module,async()=>{
 const result=await execute(module);
 const witness={module,code:result.code,signal:result.signal,error:result.error,cancel_error:result.cancel_error,cancelled:result.cancelled};
 for(const stream of ['stdout','stderr'])Object.assign(witness,{[stream+'_bytes']:result[stream].length,[stream+'_sha256']:hash(result[stream]),[stream+'_base64']:result[stream].toString('base64')});
 outcomes.push(witness);console.log('BOC_DETERMINISTIC_LANE_UNIT '+JSON.stringify(witness));
 assert.equal(result.code,0,result.stdout.toString()+result.stderr.toString());assert.equal(result.signal,null);assert.equal(result.error,null);assert.equal(result.cancel_error,null);assert.equal(result.cancelled,false);
 const text=result.stderr.toString('utf8'),name=module.split('/').at(-1).slice(0,-3);
 const rows=[...text.matchAll(/^(test_[^\s]+) \(__main__\.([^\s]+)\) \.\.\. (ok|FAIL|ERROR|skipped[^\n]*|expected failure|unexpected success)$/gmu)];
 const observed=rows.map(row=>name+'.'+row[2]);
 assert.deepEqual(observed.toSorted(),initial.ids[module]);assert.equal(new Set(observed).size,observed.length);
 assert.ok(rows.every(row=>row[3]==='ok'),'Every actual case must pass without skips');
 const summary=[...text.matchAll(/^Ran ([0-9]+) tests? in [0-9.]+s$/gmu)];assert.equal(summary.length,1);assert.equal(Number(summary[0][1]),observed.length);
 assert.match(text,/\nOK\s*$/u);assert.doesNotMatch(text,/^(?:OK \(|FAILED|ERROR:|FAIL:)/gmu);
 witness.executed=observed;witness.tests_run=observed.length;
});
after(async()=>{
 const problems=[];let continuity,cleanupComplete=false;
 try{assert.equal(outcomes.length,2);assert.ok(outcomes.every(row=>row.executed));assert.ok(!interrupted);await prepared.verify();continuity=assertValidationContinuity(initial,inventory());}catch(error){problems.push(error.message);}
 try{await cleanup();cleanupComplete=true;}catch(error){problems.push(error.message);}
 console.log('BOC_DETERMINISTIC_LANES_MEMBERSHIP '+JSON.stringify({...initial,executed:outcomes.flatMap(row=>row.executed??[]).toSorted(),native_git:prepared.provenance,node:{executable:process.execPath,version:process.version},continuity,cleanup:cleanupComplete,problems,environment_observation:'Effective environment hash is captured by identical-environment discovery probes before/after unchanged CLI execution; CLI itself remains the native unittest entry point.'}));
 assert.deepEqual(problems,[]);
});
