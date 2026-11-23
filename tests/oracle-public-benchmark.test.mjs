import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,mkdirSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const scratch=join(root,'Vault/tmp/oracle-publication-boundary/export-contribution');mkdirSync(scratch,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');

test('benchmark harness keeps independent labels, records actual spans and distinguishes unsupported claims',()=>{
 const script=String.raw`
import importlib.util,json,sys,tempfile
from pathlib import Path
p=Path(sys.argv[1]);s=importlib.util.spec_from_file_location('public_benchmark',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
labels=Path(sys.argv[2]);before=labels.read_bytes();value,digest=m.labels(labels,['example-architecture.md'])
class SyntheticHarnessIndex:
 def snapshot_evidence(self,text,limit=5):
  return {'mode':'synthetic-harness-unit','queries':[{'text':text,'results':[{'source':'example-architecture.md'}]}]}
rows=m.measure(SyntheticHarnessIndex(),value['cases'])
assert len(rows)==3 and rows[0]['label_overlap']==['example-architecture.md']
assert rows[-1]['expected_sources']==[] and rows[-1]['label_overlap']==[]
assert all(row['elapsed_seconds']>=0 and row['retrieval_evidence']['mode']=='synthetic-harness-unit' for row in rows)
assert labels.read_bytes()==before
with tempfile.TemporaryDirectory(dir=sys.argv[3]) as folder:
 bad=Path(folder)/'bad.json';changed=json.loads(before);changed['cases'][0]['relevant_sources']=['unlisted-private-document'];bad.write_text(json.dumps(changed))
 try:m.labels(bad,['example-architecture.md'])
 except ValueError:pass
 else:raise AssertionError('Unlisted label admitted')
print(json.dumps({'mode':'synthetic-harness-unit','cases':len(rows),'labels_sha256':digest}))
`;
 const out=execFileSync('python3',['-B','-c',script,join(root,'tools/oracle_public/benchmarks/run.py'),join(root,'tools/oracle_public/benchmarks/public_cases.json'),scratch],{encoding:'utf8',timeout:15000});
 const d=JSON.parse(out);assert.equal(d.mode,'synthetic-harness-unit');assert.equal(d.cases,3);assert.equal(d.labels_sha256,sha(readFileSync(join(root,'tools/oracle_public/benchmarks/public_cases.json'))));
 const source=readFileSync(join(root,'tools/oracle_public/benchmarks/run.py'),'utf8');assert.match(source,/'meko': 'not_implemented'/);assert.match(source,/'spec_quality': None/);assert.match(source,/'comparative_claim': None/);
});

test('exported benchmark executes real cached Chroma with source-bound measurements and no model',t=>{
 let artifact=process.env.ORACLE_PUBLIC_EXPORTED_ROOT;
 if(!artifact){
  const folder=mkdtempSync(join(scratch,'benchmark-'));t.after(()=>rmSync(folder,{recursive:true,force:true}));
  const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const result=spawnSync('python3',['-B','tools/export_oracle.py','--commit',commit,'--output',join(folder,'export')],{cwd:root,encoding:'utf8',timeout:30000});
  assert.equal(result.status,0,'A committed complete public artifact is required: '+result.stderr);
  artifact=join(folder,'tree');mkdirSync(artifact);execFileSync('tar',['-xzf',join(folder,'export/oracle-public.tar.gz'),'-C',artifact]);
 }
 artifact=resolve(artifact);
 const config=JSON.parse(readFileSync(join(artifact,'oracle.project.json')));
 const state=resolve(artifact,config.state);
 if(process.env.ORACLE_PUBLIC_SHARED_STATE)assert.equal(resolve(process.env.ORACLE_PUBLIC_SHARED_STATE),state);
 const runtime=process.env.ORACLE_PUBLIC_PYTHON||join(root,'Vault/index/venv/bin/python');assert.ok(existsSync(runtime),'Existing Chroma runtime required; no install fallback');
 mkdirSync(state,{recursive:true});const reportPath=join(state,'benchmark-'+process.pid+'.json');
 assert.ok(!existsSync(reportPath),'Fresh measurement output required');
 const input=readFileSync(join(artifact,'benchmarks/public_cases.json'));const configBytes=readFileSync(join(artifact,'oracle.project.json'));
 const child=spawnSync(runtime,['-B',join(artifact,'benchmarks/run.py'),'--config',join(artifact,'oracle.project.json'),'--labels',join(artifact,'benchmarks/public_cases.json'),'--output',reportPath],{cwd:artifact,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024,env:{...process.env,ANONYMIZED_TELEMETRY:'False',PYTHONDONTWRITEBYTECODE:'1'}});
 assert.equal(child.status,0,child.stderr||child.stdout);
 const report=JSON.parse(readFileSync(reportPath));assert.equal(report.mode,'actual-local-chroma-synthetic-public-corpus');assert.equal(report.meko,'not_implemented');assert.equal(report.spec_quality,null);assert.equal(report.comparative_claim,null);assert.equal(report.proposal_model,null);
 assert.equal(report.cases.length,3);assert.equal(report.labels_sha256,sha(input));assert.equal(report.config_sha256,sha(configBytes));assert.match(report.source_commit,/^[a-f0-9]{40}$/);assert.match(report.source_tree,/^[a-f0-9]{40}$/);
 assert.equal(report.embedding.model,'all-MiniLM-L6-v2');assert.ok(report.runtime.chromadb);
 for(const row of report.cases){assert.ok(row.elapsed_seconds>=0);assert.equal(row.retrieval_evidence.kind,'vault-query-snapshot-v1');assert.match(row.retrieval_evidence.index_configuration_sha256,/^[a-f0-9]{64}$/);assert.ok(row.retrieval_evidence.queries[0].results.length);}
 assert.deepEqual(readFileSync(join(artifact,'benchmarks/public_cases.json')),input);
 assert.deepEqual(readFileSync(join(artifact,'oracle.project.json')),configBytes);
 t.diagnostic('Actual local Chroma; synthetic source labels; no proposal model/Meko/spec-quality/comparative measurement.');
});
