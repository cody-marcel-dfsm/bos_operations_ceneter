import assert from 'node:assert/strict';
import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyPublishedPackage,readPublishedFile,assertPackageOwnedBinding} from '../scripts/marketplace-published-package.mjs';
const run=promisify(execFile);
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
