import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runNativeCatalog} from './marketplace-native-run.mjs';
import {installedRelease} from './marketplace-installed-release.mjs';
import {loadPromptCatalog} from './marketplace-prompt-catalog.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
async function main(){
 const [product,command,configPath,...selected]=process.argv.slice(2);
 const load=()=>loadPromptCatalog(root,product);
 if(command==='--list'){console.log(JSON.stringify(await load(),null,2));return;}
 if(command!=='--run'||!configPath)throw new Error('Usage: <product> --list | <product> --run <private-reviewer-config.json> [case IDs]');
 const config=JSON.parse(await readFile(resolve(configPath),'utf8'));
 const {stdout}=await promisify(execFile)('python3',['-c','from tools.codex_child_model import selected_model; print(selected_model())'],{cwd:root});
 const report=await runNativeCatalog(load,config,installedRelease,stdout.trim(),selected);
 console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Marketplace integration failed: configuration or native prerequisite unavailable');process.exitCode=1;});
