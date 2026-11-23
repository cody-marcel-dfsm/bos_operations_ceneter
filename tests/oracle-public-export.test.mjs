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
 const f=fixture(t);chmodSync(join(f.dir,'tools/oracle_core/cli.py'),0o755);const sha=f.commit();
 const first=run(f,sha,'one');assert.equal(first.status,0,first.stderr);
 const receipt=JSON.parse(first.stdout);assert.equal(receipt.source_commit,sha);assert.equal(receipt.source_tree,git(f.dir,'rev-parse',sha+'^{tree}'));assert.equal(receipt.export_map_sha256,hash(actualMap));assert.equal(receipt.members.length,30);
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
 assert len(manifest['members'])==29
 print(json.dumps(a.getnames()))
`,join(f.dir,'one/oracle-public.tar.gz')],{encoding:'utf8'});
 assert.equal(JSON.parse(inspect).length,30);
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
  f=>writeFileSync(join(f.dir,'tools/oracle_public/README.md'),'operator@private-customer.example.org\n'),
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
