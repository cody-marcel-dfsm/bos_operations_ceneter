import assert from 'node:assert/strict';
import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyPublishedPackage,readPublishedFile,assertPackageOwnedBinding} from '../scripts/marketplace-published-package.mjs';
const run=promisify(execFile);
async function generatedFixture(){
 const dir=await mkdtemp(join(tmpdir(),'generated-publication-')),pkg=join(dir,'dist/my-crm');
 const entries=[
  ['.codex-plugin/plugin.json','{"name":"my-crm","version":"1.0.0"}\n'],
  ['examples/README.md','Public example\n'],['LICENSE','Public license\n'],['NOTICE','Public notice\n'],['README.md','Public readme\n'],
  ['skills/example/SKILL.md','Public generated skill\n'],['src/client.mjs','export const value=1;\n']
 ];
 await run('git',['init','-q'],{cwd:dir});
 await writeFile(join(dir,'.gitignore'),'dist/\n');
 await writeFile(join(dir,'package.json'),'{"name":"my-crm","version":"1.0.0"}\n');
 for(const [name,bytes] of entries){
  const source=['LICENSE','NOTICE','README.md'].includes(name)||name.startsWith('examples/')||name.startsWith('src/')?name:'plugins/my-crm/'+name;
  await mkdir(join(dir,source,'..'),{recursive:true});await writeFile(join(dir,source),bytes);
  await mkdir(join(pkg,name,'..'),{recursive:true});await writeFile(join(pkg,name),bytes);
 }
 await run('git',['add','.'],{cwd:dir});
 await run('git',['-c','user.name=Fixture','-c','user.email=test@example.invalid','commit','-qm','Published generated sources'],{cwd:dir});
 const commit=(await run('git',['rev-parse','HEAD'],{cwd:dir})).stdout.trim();
 const files=entries.map(([path,bytes])=>({path,sha256:createHash('sha256').update(bytes).digest('hex')}));
 const content=createHash('sha256').update(files.map(row=>row.path+'\0'+row.sha256+'\n').join('')).digest('hex');
 const manifest=JSON.stringify({schema:'my-crm.release/v1',name:'my-crm',version:'1.0.0',files,content_sha256:content},null,2)+'\n';
 await writeFile(join(pkg,'release-manifest.json'),manifest);
 return {dir,pkg,commit,entries,manifest,content};
}
test('existing generated release verifies against published objects and its exact public manifest',async()=>{
 const f=await generatedFixture();
 try{
  assert.equal((await run('git',['ls-tree','-r','--name-only',f.commit,'--','dist/my-crm'],{cwd:f.dir})).stdout,'');
  assert.equal(await verifyPublishedPackage(f.pkg,f.commit),f.content);
  assert.equal((await readPublishedFile(f.pkg,f.commit,'skills/example/SKILL.md')).toString(),'Public generated skill\n');
  await writeFile(join(f.dir,'plugins/my-crm/skills/example/SKILL.md'),'Unpublished working tree\n');
  assert.equal(await verifyPublishedPackage(f.pkg,f.commit),f.content);
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('generated publication rejects altered bytes, inventory, manifest and symlinked files',async()=>{
 const f=await generatedFixture();const rejected=()=>assert.rejects(verifyPublishedPackage(f.pkg,f.commit),e=>e.acceptance_reason==='installed_package_not_published');
 try{
  const skill=join(f.pkg,'skills/example/SKILL.md');
  await writeFile(skill,'Unpublished bytes\n');await rejected();
  await assert.rejects(readPublishedFile(f.pkg,f.commit,'skills/example/SKILL.md'),/Unpublished package bytes/);
  await writeFile(skill,'Public generated skill\n');
  await writeFile(join(f.pkg,'hidden.txt'),'Ignored addition\n');await rejected();await rm(join(f.pkg,'hidden.txt'));
  await rm(join(f.pkg,'src/client.mjs'));await rejected();await writeFile(join(f.pkg,'src/client.mjs'),'export const value=1;\n');
  const manifest=JSON.parse(f.manifest);manifest.version='2.0.0';
  await writeFile(join(f.pkg,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');await rejected();
  await writeFile(join(f.pkg,'release-manifest.json'),f.manifest);
  await writeFile(join(f.pkg,'release-manifest.json'),f.manifest.trim());await rejected();
  await writeFile(join(f.pkg,'release-manifest.json'),f.manifest);
  await rm(skill);await symlink(join(f.dir,'plugins/my-crm/skills/example/SKILL.md'),skill);await rejected();
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('generated publication rejects published symbolic-link inputs',async()=>{
 const f=await generatedFixture();
 try{
  const source=join(f.dir,'plugins/my-crm/skills/example/SKILL.md');await rm(source);await symlink('other.md',source);
  await run('git',['add','.'],{cwd:f.dir});await run('git',['-c','user.name=Fixture','-c','user.email=test@example.invalid','commit','-qm','Unsupported symbolic input'],{cwd:f.dir});
  const commit=(await run('git',['rev-parse','HEAD'],{cwd:f.dir})).stdout.trim();
  await assert.rejects(verifyPublishedPackage(f.pkg,commit),e=>e.acceptance_reason==='installed_package_not_published');
 }finally{await rm(f.dir,{recursive:true,force:true});}
});
test('publication evidence rejects ignored additions, altered bytes and untracked package roots',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'marketplace-publication-'));
 try{
  await run('git',['init','-q'],{cwd:dir});
  await mkdir(join(dir,'pkg/skills/example'),{recursive:true});
  await writeFile(join(dir,'.gitignore'),'pkg/ignored/\nlocal-package/\n');
  await writeFile(join(dir,'pkg/skills/example/SKILL.md'),'Published skill\n');
  await run('git',['add','.'],{cwd:dir});
  await run('git',['-c','user.name=Fixture','-c','user.email=test@example.invalid','commit','-qm','Published fixture'],{cwd:dir});
  const commit=(await run('git',['rev-parse','HEAD'],{cwd:dir})).stdout.trim(),pkg=join(dir,'pkg');
  assert.match(await verifyPublishedPackage(pkg,commit),/^[a-f0-9]{64}$/);
  await mkdir(join(pkg,'ignored'),{recursive:true});await writeFile(join(pkg,'ignored/SKILL.md'),'Unpublished addition');
  assert.equal((await run('git',['status','--porcelain'],{cwd:dir})).stdout.trim(),'');
  await assert.rejects(verifyPublishedPackage(pkg,commit),error=>error.acceptance_reason==='installed_package_not_published');
  await rm(join(pkg,'ignored'),{recursive:true});
  await writeFile(join(pkg,'skills/example/SKILL.md'),'Changed skill');
  await assert.rejects(readPublishedFile(pkg,commit,'skills/example/SKILL.md'),/Unpublished package bytes/);
  await mkdir(join(dir,'local-package'),{recursive:true});await writeFile(join(dir,'local-package/SKILL.md'),'Ignored package');
  await assert.rejects(verifyPublishedPackage(join(dir,'local-package'),commit),error=>error.acceptance_reason==='installed_package_not_published');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('equivalent manual BOS bindings and competing package owners fail provenance',()=>{
 const binding={url:'https://example.test/mcp'},owner='bos@fixture';
 assert.doesNotThrow(()=>assertPackageOwnedBinding({},[owner],owner,binding));
 assert.throws(()=>assertPackageOwnedBinding({'BOS-Platform':binding},[owner],owner,binding));
 assert.throws(()=>assertPackageOwnedBinding({manual:binding},[owner],owner,binding));
 assert.throws(()=>assertPackageOwnedBinding({},[owner,'other@fixture'],owner,binding));
 assert.throws(()=>assertPackageOwnedBinding({},['other@fixture'],owner,binding));
});
