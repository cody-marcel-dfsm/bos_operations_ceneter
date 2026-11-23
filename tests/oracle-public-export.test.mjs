import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync,chmodSync,symlinkSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const scratch=join(root,'Vault/tmp/oracle-publication-boundary/export-contribution');
mkdirSync(scratch,{recursive:true});
const control=readFileSync(join(root,'tools/export_oracle.py'));
const actualMap=readFileSync(join(root,'tools/oracle-public-export.json'));
assert.deepEqual(JSON.parse(readFileSync(join(root,'tests/fixtures/oracle-public/export-map.json'))),JSON.parse(actualMap));
const members=JSON.parse(actualMap).members;
const hash=b=>createHash('sha256').update(b).digest('hex');
function git(dir,...args){return execFileSync('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false','-C',dir,...args],{encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
function fixture(t){
 const dir=mkdtempSync(join(scratch,'git-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 git(dir,'init','-q','-b','main');git(dir,'config','user.name','Synthetic Fixture');git(dir,'config','user.email','fixture@example.invalid');
 for(const row of members){
  const path=join(dir,row.source);mkdirSync(dirname(path),{recursive:true});
  const body=['LICENSE','NOTICE'].includes(row.source)?readFileSync(join(root,row.source)):Buffer.from(row.source.endsWith('.py')?"raise RuntimeError('Export must never import core or assets')\n":'Synthetic public fixture\n');
  writeFileSync(path,body);
 }
 mkdirSync(join(dir,'tools'),{recursive:true});writeFileSync(join(dir,'tools/export_oracle.py'),control);writeFileSync(join(dir,'tools/oracle-public-export.json'),actualMap);
 const commit=()=>{git(dir,'add','--all');git(dir,'commit','-qm','Synthetic export input');return git(dir,'rev-parse','HEAD');};
 const sha=commit();return {dir,sha,commit};
}
function run(f,sha=f.sha,name='export'){
 return spawnSync('python3',['-B',join(f.dir,'tools/export_oracle.py'),'--commit',sha,'--output',join(f.dir,name)],{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
}
function verify(f,name='export',alter=''){
 return spawnSync('python3',['-B','-c',String.raw`
import importlib.util,json,sys
from pathlib import Path
s=importlib.util.spec_from_file_location('export_owner',sys.argv[1]);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
out=Path(sys.argv[2]);receipt=json.loads((out/m.RECEIPT).read_text())
`+alter+String.raw`
m.verify_archive(out/m.ARCHIVE,receipt)
`,join(f.dir,'tools/export_oracle.py'),join(f.dir,name)],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
}

test('immutable complete export preserves source bytes, modes, Apache attribution and deterministic archive',t=>{
 const runtime=process.env.ORACLE_PUBLIC_PYTHON||join(root,'Vault/index/venv/bin/python');
 const contract=execFileSync(runtime,['-B','-c',String.raw`
import ast,hashlib,json,sys,yaml
from pathlib import Path
root=Path(sys.argv[1]);path=root/'tools/oracle_public/.github/workflows/ci.yml'
workflow=yaml.safe_load(path.read_text());assert workflow['permissions']=={'contents':'read'}
job=workflow['jobs']['public-oracle'];assert job['runs-on']=='ubuntu-22.04' and job['timeout-minutes']==10
steps=job['steps'];assert len(steps)==5
assert steps[0]['uses']=='actions/checkout@11d5960a326750d5838078e36cf38b85af677262'
assert steps[0]['with']['persist-credentials'] is False
assert steps[1]['uses']=='actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065'
assert steps[1]['with']['python-version']=='3.13.5'
setup=steps[2]['run'];lock=(root/'tools/oracle_public/requirements.lock').read_bytes()
assert hashlib.sha256(lock).hexdigest() in setup
assert '--require-hashes --only-binary=:all: --no-deps -r requirements.lock' in setup
assert '913d7300ceae3b2dbc2c50d1de4baacab4be7b9380491c27fab7418616a16ec3' in setup
assert '256*1024*1024' in setup and '512*1024*1024' in setup
assert 'is_symlink' in setup and "archive.open('xb')" in setup and 'Existing public cache differs' in setup
suite=steps[3]['run'];assert all(name in suite for name in ('test_export_boundary','test_proposal_to_spec','test_public_chroma','test_runner_contract'))
assert 'result.skipped' in suite and 'result.expectedFailures' in suite and 'result.unexpectedSuccesses' in suite
assert steps[4]['run'].strip()=='.oracle/ci-runtime/bin/python -B benchmarks/run.py --config oracle.project.json --labels benchmarks/public_cases.json --output .oracle/ci-benchmark.json'
for step in steps:
 for chunk in step.get('run','').split("<<'PY'\n")[1:]:ast.parse(chunk.split('\nPY',1)[0])
text=path.read_text();assert all(value not in text for value in ('secrets.','oracle_core.cli proposal','oracle_core.proposal','deterministic_oracle','git push','upload-artifact'))
print(json.dumps({'mode':'independent-artifact-CI-contract','members':31,'model_calls':0}))
`,root],{encoding:'utf8',timeout:15000});assert.equal(JSON.parse(contract).model_calls,0);
 const f=fixture(t);chmodSync(join(f.dir,'tools/oracle_core/cli.py'),0o755);const sha=f.commit();
 const first=run(f,sha,'one');assert.equal(first.status,0,first.stderr);
 const receipt=JSON.parse(first.stdout);assert.equal(receipt.source_commit,sha);assert.equal(receipt.source_tree,git(f.dir,'rev-parse',sha+'^{tree}'));assert.equal(receipt.export_map_sha256,hash(actualMap));assert.equal(receipt.members.length,31);
 assert.equal(receipt.members.find(r=>r.path==='oracle_core/cli.py').mode,0o755);
 assert.equal(receipt.members.find(r=>r.path==='LICENSE').sha256,hash(readFileSync(join(root,'LICENSE'))));
 assert.equal(receipt.members.find(r=>r.path==='NOTICE').sha256,hash(readFileSync(join(root,'NOTICE'))));
 writeFileSync(join(f.dir,'tools/oracle_public/README.md'),'Uncommitted content must remain outside export\n');
 const second=run(f,sha,'two');assert.equal(second.status,0,second.stderr);assert.deepEqual(JSON.parse(second.stdout),receipt);
 assert.deepEqual(readFileSync(join(f.dir,'one/oracle-public.tar.gz')),readFileSync(join(f.dir,'two/oracle-public.tar.gz')));
 assert.equal(verify(f,'one').status,0);
 const inspect=execFileSync('python3',['-B','-c',String.raw`
import tarfile,json,sys
with tarfile.open(sys.argv[1]) as a:
 manifest=json.load(a.extractfile('oracle-export-manifest.json'))
 assert a.extractfile('oracle_core/cli.py').read().startswith(b'raise RuntimeError')
 assert a.extractfile('README.md').read()==b'Synthetic public fixture\n'
 assert all(not n.startswith(('.git/','Vault/','source/','products/')) for n in a.getnames())
 assert len(manifest['members'])==30
 print(json.dumps(a.getnames()))
`,join(f.dir,'one/oracle-public.tar.gz')],{encoding:'utf8'});
 assert.equal(JSON.parse(inspect).length,31);
 assert.notEqual(run(f,sha,'one').status,0,'prior output must never be overwritten');
});

test('closed immutable map rejects omissions, duplicates, unlisted paths and traversal',t=>{
 const variants=[
  m=>m.members.pop(),
  m=>m.members.push({...m.members[0]}),
  m=>m.members.push({source:'private.txt',destination:'private.txt'}),
  m=>m.members[0].destination='../private.txt',
  m=>m.members[0].source='Vault/private.md',
  m=>m.members[0].destination='/absolute.txt',
  m=>m.members[0].destination='a\\b',
  m=>m.generated.push('extra.json'),
 ];
 for(const [i,change] of variants.entries()){
  const f=fixture(t);const m=JSON.parse(actualMap);change(m);writeFileSync(join(f.dir,'tools/oracle-public-export.json'),JSON.stringify(m));const sha=f.commit();
  const r=run(f,sha);assert.notEqual(r.status,0,`mutation ${i}`);assert.ok(!existsSync(join(f.dir,'export')));
 }
});

test('export rejects symlinks, missing blobs, private text, credentials and non-pinned controls',t=>{
 const variants=[
  f=>{const p=join(f.dir,'tools/oracle_core/cli.py');rmSync(p);symlinkSync('../private.py',p);},
  f=>rmSync(join(f.dir,'tools/oracle_core/config.py')),
  f=>writeFileSync(join(f.dir,'tools/oracle_public/README.md'),'Private path /Users/private-owner/workspace\n'),
  f=>writeFileSync(join(f.dir,'tools/oracle_public/README.md'),'Authorization: Bearer synthetic_fixture_token_0123456789\n'),
  f=>writeFileSync(join(f.dir,'tools/oracle_public/README.md'),JSON.stringify({api_key:'synthetic_fixture_token_0123456789'})),
  f=>writeFileSync(join(f.dir,'tools/oracle_public/README.md'),['synthetic-operator', ['synthetic-negative', 'example', 'org'].join('.')].join('@')+'\n'),
 ];
 for(const [i,change] of variants.entries()){
  const f=fixture(t);change(f);const sha=f.commit();const r=run(f,sha);assert.notEqual(r.status,0,`mutation ${i}`);assert.ok(!existsSync(join(f.dir,'export')));
 }
 const f=fixture(t);writeFileSync(join(f.dir,'tools/export_oracle.py'),Buffer.concat([control,Buffer.from('\n# uncommitted control\n')]));assert.notEqual(run(f).status,0);
 assert.notEqual(run(f,'HEAD').status,0);assert.notEqual(run(f,f.sha.slice(0,12)).status,0);
});

test('independent archive validation rejects tamper, unlisted/link/duplicate/traversal members and hidden trailing data',t=>{
 const f=fixture(t);assert.equal(run(f).status,0);
 const actions=[
  "receipt['source_tree']='0'*40\n",
  "receipt['members'][0]['sha256']='0'*64\n",
  String.raw`
raw=(out/m.ARCHIVE).read_bytes();(out/m.ARCHIVE).write_bytes(raw+b'private trailing data')
receipt['archive']['sha256']=m.digest((out/m.ARCHIVE).read_bytes());receipt['archive']['size']=(out/m.ARCHIVE).stat().st_size
`,
 ];
 for(const [i,alter] of actions.entries()){
  const name='tamper-'+i;assert.equal(run(f,f.sha,name).status,0);assert.notEqual(verify(f,name,alter).status,0);
 }
 for(const mode of ['extra','duplicate','traversal','symlink']){
  const name='archive-'+mode;assert.equal(run(f,f.sha,name).status,0);
  const alter=String.raw`
import io,tarfile,gzip
path=out/m.ARCHIVE
with tarfile.open(path) as old: saved=[(r,old.extractfile(r).read()) for r in old]
buf=io.BytesIO()
with gzip.GzipFile(fileobj=buf,mode='wb',filename='',mtime=0) as g:
 with tarfile.open(fileobj=g,mode='w') as a:
  for row,body in saved:a.addfile(row,io.BytesIO(body))
  row=tarfile.TarInfo(`+JSON.stringify(mode==='traversal'?'../escaped':mode==='duplicate'?'README.md':'unlisted')+String.raw`)
  if `+JSON.stringify(mode)+String.raw`=='symlink':row.type=tarfile.SYMTYPE;row.linkname='README.md';a.addfile(row)
  else:row.size=1;a.addfile(row,io.BytesIO(b'x'))
path.write_bytes(buf.getvalue());receipt['archive']={'file':m.ARCHIVE,'sha256':m.digest(buf.getvalue()),'size':len(buf.getvalue())}
`;
  assert.notEqual(verify(f,name,alter).status,0,mode);
 }
});
