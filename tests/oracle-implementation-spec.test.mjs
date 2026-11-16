import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {isolatedTestCohort} from './helpers/isolated-test-cohort.mjs';

const root=new URL('../',import.meta.url);
// Every class has independent per-test repositories and cleanup. Keep class
// order/fixtures intact; reject new module lifetime hooks before partitioning.
const inventory=JSON.parse(execFileSync('python3',['-B','-c',`
import ast,json,sys,unittest,hashlib
from pathlib import Path
sys.path.insert(0,'tests')
import oracle_spec_test as suite
path=Path('tests/oracle_spec_test.py');raw=path.read_bytes();tree=ast.parse(raw)
assert not any(isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and n.name in {'setUpModule','tearDownModule'} for n in tree.body)
rows=[];all_ids=[];declared=[]
for node in tree.body:
 if not isinstance(node,ast.ClassDef):continue
 cls=getattr(suite,node.name)
 names=unittest.TestLoader().getTestCaseNames(cls)
 ids=[node.name+'.'+name for name in names]
 declared.extend(node.name+'.'+n.name for n in node.body if isinstance(n,ast.FunctionDef) and n.name.startswith('test_'))
 if ids:rows.append({'name':node.name,'ids':ids});all_ids.extend(ids)
assert sorted(all_ids)==sorted(declared) and len(all_ids)==len(set(all_ids)) and all_ids
print(json.dumps({'source_sha256':hashlib.sha256(raw).hexdigest(),'rows':rows,'ids':sorted(all_ids)}))
`],{cwd:root,encoding:'utf8',stdio:'pipe'}));
const captured=()=>{
 const actual=createHash('sha256').update(readFileSync(new URL('../tests/oracle_spec_test.py',import.meta.url))).digest('hex');
 const committed=createHash('sha256').update(execFileSync('git',['show','HEAD:tests/oracle_spec_test.py'],{cwd:root})).digest('hex');
 assert.equal(actual,committed);return actual;
};
// A candidate with intervening edits gets no passing source proof.
assert.equal(captured(),inventory.source_sha256);
test('sealed spec discovery includes every declared test exactly once',()=>{
 const ids=inventory.rows.flatMap(row=>row.ids).sort();assert.deepEqual(ids,inventory.ids);assert.equal(new Set(ids).size,ids.length);
});
const temporary=join(fileURLToPath(root),'Vault/tmp');mkdirSync(temporary,{recursive:true});
const cohortRoot=mkdtempSync(join(temporary,'spec-cohort-'));
const jobs=inventory.rows.map(row=>{const directory=join(cohortRoot,row.name);mkdirSync(directory,{mode:0o700});
 return{name:row.name,command:'python3',args:['-B','tests/oracle_spec_test.py',row.name],cwd:root,env:{...process.env,TMPDIR:directory}};});
const cohort=isolatedTestCohort(jobs,{concurrency:4,timeoutMs:120000,captureBytes:true});
void cohort.completion.then(()=>rmSync(cohortRoot,{recursive:true,force:true}));
for(const signal of ['SIGINT','SIGTERM']){
 const stop=()=>{cohort.cancel();void cohort.completion.then(()=>{process.removeListener(signal,stop);process.kill(process.pid,signal);});};
 process.on(signal,stop);void cohort.completion.then(()=>process.removeListener(signal,stop));
}
for(const row of inventory.rows)test('sealed spec complete class: '+row.name,async()=>{
 const result=await cohort.outcome(row.name);
 // TAP-safe raw byte custody remains in the enclosing native command output.
 console.log('native-spec-cohort '+JSON.stringify({name:row.name,ids:row.ids,source_sha256:inventory.source_sha256,
  code:result.code,signal:result.signal,error:result.error,cancelled:result.cancelled,
  reported_tests_run:[...result.stderrBytes.toString('utf8').matchAll(/Ran (\d+) tests? in /gu)].map(match=>Number(match[1])),
  stdout_bytes:result.stdoutBytes.length,stderr_bytes:result.stderrBytes.length,
  stdout_sha256:createHash('sha256').update(result.stdoutBytes).digest('hex'),stderr_sha256:createHash('sha256').update(result.stderrBytes).digest('hex'),
  stdout_base64:result.stdoutBytes.toString('base64'),stderr_base64:result.stderrBytes.toString('base64')}));
 assert.ok(result.code===0&&!result.signal&&!result.error&&!result.cancelled,JSON.stringify(result));
 const decoder=new TextDecoder('utf8',{fatal:true}),stderr=decoder.decode(result.stderrBytes),stdout=decoder.decode(result.stdoutBytes);
 const summaries=[...stderr.matchAll(/Ran (\d+) tests? in /gu)];assert.equal(summaries.length,1);
 assert.equal(Number(summaries[0][1]),row.ids.length);assert.match(stderr,/\nOK\s*$/u);
 assert(!/skipped=[1-9]|# SKIP\b|# TODO\b/u.test(stdout+stderr));
 assert.equal(captured(),inventory.source_sha256);
});
