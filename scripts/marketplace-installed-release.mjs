import {verifyPublishedPackage} from './marketplace-published-package.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile, readdir} from 'node:fs/promises';
import {digest} from './marketplace-prompt-catalog.mjs';
import {join} from 'node:path';
const run = promisify(execFile);
export async function installedRelease(catalog) {
  const {stdout} = await run('codex', ['plugin', 'list', '--json']);
  const entries = JSON.parse(stdout).installed ?? [];
  const matching = entries.filter(row => row.name === catalog.product && row.installed && row.enabled);
  if (matching.length !== 1 || matching[0].version !== catalog.version || !matching[0].source?.path) throw new Error('Installed release does not match configured product');
  const path = matching[0].source.path;
  const plugin = JSON.parse(await readFile(join(path, '.codex-plugin/plugin.json'), 'utf8'));
  if (plugin.version !== catalog.version || JSON.stringify(plugin.interface.defaultPrompt) !== JSON.stringify(catalog.cases.filter(row => row.kind === 'starter').map(row => row.prompt))) throw new Error('Installed starter/version mismatch');
  if (plugin.description !== catalog.description) throw new Error('Installed description mismatch');
  const {stdout: commit} = await run('git', ['rev-parse', 'HEAD'], {cwd: path});
  const sha = commit.trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Installed commit unavailable');
  await run('git', ['merge-base', '--is-ancestor', sha, 'origin/main'], {cwd: path});
  const {stdout: dirty} = await run('git', ['status', '--porcelain', '--', '.'], {cwd: path});
  if (dirty.trim()) throw new Error('Installed package contains unpublished changes');
  const packageSha=await verifyPublishedPackage(path,sha);
  const skills = [];
  for (const entry of (await readdir(join(path, 'skills'), {withFileTypes: true})).sort((a,b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) skills.push({name: entry.name, text: await readFile(join(path, 'skills', entry.name, 'SKILL.md'), 'utf8')});
  }
  if (!skills.length || skills.some(skill => !skill.text.trim())) throw new Error('Installed skills unavailable');
  let dependency;
  if(catalog.product!=='bos') {
    const rows=entries.filter(row=>row.name==='bos'&&row.installed&&row.enabled);
    if(rows.length!==1||!rows[0].source?.path)throw new Error('Installed BOS dependency unavailable');
    const dependencyPath=rows[0].source.path;
    const manifest=JSON.parse(await readFile(join(dependencyPath,'.codex-plugin/plugin.json'),'utf8'));
    if(manifest.version!==rows[0].version)throw new Error('BOS dependency version mismatch');
    const {stdout: dependencyCommit}=await run('git',['rev-parse','HEAD'],{cwd:dependencyPath});
    await run('git',['merge-base','--is-ancestor',dependencyCommit.trim(),'origin/main'],{cwd:dependencyPath});
    if((await run('git',['status','--porcelain','--','.'],{cwd:dependencyPath})).stdout.trim())throw new Error('Unpublished BOS dependency');
    const dependencySkills=[];
    for(const entry of await readdir(join(dependencyPath,'skills'),{withFileTypes:true}))if(entry.isDirectory())dependencySkills.push({name:entry.name,text:await readFile(join(dependencyPath,'skills',entry.name,'SKILL.md'),'utf8')});
    dependency={package_sha256:await verifyPublishedPackage(dependencyPath,dependencyCommit.trim()),plugin_id:rows[0].pluginId,path:dependencyPath,version:manifest.version,release_commit:dependencyCommit.trim(),skills:dependencySkills,skills_sha256:digest(dependencySkills)};
  }
  return {dependency, package_sha256:packageSha, plugin_id:matching[0].pluginId, entries, path, version: plugin.version, release_commit: sha, skills, skills_sha256: digest(skills)};
}
