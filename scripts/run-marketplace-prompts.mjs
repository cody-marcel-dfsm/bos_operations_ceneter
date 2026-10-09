import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runNativeCatalog} from './marketplace-native-run.mjs';
import {installedRelease} from './marketplace-installed-release.mjs';
import {loadPromptCatalog} from './marketplace-prompt-catalog.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
export function parseMarketplaceSelection(args) {
 const selected=[];let concurrency=1,seen=false;
 for(let index=0;index<args.length;index++){
  const value=args[index];
  if(value==='--concurrency'){
   if(seen||!/^[1-3]$/.test(args[index+1]??''))throw new Error('Marketplace concurrency must be specified once as an integer from 1 to 3');
   concurrency=Number(args[++index]);seen=true;
  }else if(value.startsWith('--'))throw new Error('Unsupported marketplace option');
  else selected.push(value);
 }
 return {selected,options:{concurrency}};
}
export function marketplaceAcceptanceStatus(report) { return report?.publication_status??report?.status; }
async function main(){
 const [product,command,configPath,...args]=process.argv.slice(2);
 const load=()=>loadPromptCatalog(root,product);
 if(command==='--list'){console.log(JSON.stringify(await load(),null,2));return;}
 if(command!=='--run'||!configPath)throw new Error('Usage: <product> --list | <product> --run <private-reviewer-config.json> [--concurrency 1|2|3] [case IDs]');
 const {selected,options}=parseMarketplaceSelection(args);
 const config=JSON.parse(await readFile(resolve(configPath),'utf8'));
 const {stdout}=await promisify(execFile)('python3',['-c','from tools.codex_child_model import selected_model; print(selected_model())'],{cwd:root});
 const catalog=await load();
 const report=catalog.product==='bos'&&catalog.execution_profile==='bos-reviewed-functional/v1'
  ? await (await import('./run-bos-reviewed-cases.mjs')).runReviewedBosCatalog(catalog,config,stdout.trim(),{...options,selected})
  : await runNativeCatalog(load,config,installedRelease,stdout.trim(),selected,undefined,options);
 console.log(JSON.stringify(report,null,2));if(marketplaceAcceptanceStatus(report)!=='PASS')process.exitCode=1;
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('Marketplace integration failed: configuration or native prerequisite unavailable');process.exitCode=1;});
