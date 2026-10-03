import {readPublishedFile,verifyPublishedPackage} from './marketplace-published-package.mjs';
import {readFile, realpath} from 'node:fs/promises';
import {resolve, relative, isAbsolute} from 'node:path';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createHash} from 'node:crypto';
export const installedValidatorModes = Object.freeze(['contact','service','graph','app-describe','plugins','discovery-refresh','service-journey','operation-describe','api-contract']);
export async function installedPath(root,path) {
 const base=await realpath(root), file=await realpath(resolve(base,path)), rel=relative(base,file);
 if(rel.startsWith('..')||isAbsolute(rel)||!rel.startsWith('skills/'))throw new Error('Resource must be inside verified installed skills');
 return file;
}
const stable = value => Array.isArray(value)?'['+value.map(stable).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}':JSON.stringify(value);
export function documentDigests(value) {
 const hashes=new Set();
 const visit=item=>{
  if(item&&typeof item==='object'){hashes.add(createHash('sha256').update(stable(item)).digest('hex'));for(const child of Object.values(item))visit(child);}
  else if(typeof item==='string'){try{visit(JSON.parse(item));}catch{}}
 };
 visit(value);return [...hashes];
}
export function observedDocument(hashes,document) {
 return (hashes??[]).includes(createHash('sha256').update(stable(document)).digest('hex'));
}
export function createInstalledAcceptance(config,getState) {
 const tool=(name,properties,required=[])=>({name,description:name,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations:{readOnlyHint:true}});
 const list=[tool('guard_probe',{}),tool('guard_status',{}),tool('read_installed',{product:{type:'string'},path:{type:'string'}},['path']),tool('validate_installed',{path:{type:'string'},mode:{type:'string',enum:installedValidatorModes},document:{type:'object'}},['path','mode','document'])];
 async function call(name,args) {
  if(name==='guard_probe')throw new Error('Guard canary executed: hook enforcement unavailable');
  if(name==='guard_status'){const s=await getState();return {ready:s.canary===true};}
  if(name==='validate_installed'&&!installedValidatorModes.includes(args.mode))throw new Error('reviewer_validator_mode_unsupported');
  const selected=args.product??config.product;
  if(!Object.hasOwn(config.installed_roots,selected))throw new Error('Unknown installed product');
  const root=name==='validate_installed'?(config.installed_roots.bos??config.installed_root):config.installed_roots[selected];
  const path=await installedPath(root,args.path);
  const commit=config.published_commits[name==='validate_installed'?'bos':selected]??config.published_commits[config.product];
  await readPublishedFile(root,commit,relative(root,path));
  if(name==='read_installed') {if(!/\.(?:md|json|mjs)$/.test(path))throw new Error('Unsupported published resource');return {text:await readFile(path,'utf8')};}
  if(name!=='validate_installed'||!path.endsWith('/scripts/validate-discovery.mjs')||!installedValidatorModes.includes(args.mode))throw new Error('Unsupported installed validator');
  await verifyPublishedPackage(root,commit);
  const state=await getState();
  const target=args.mode==='api-contract'?args.document.response:args.mode==='service-journey'?args.document.description:args.document;
  if(!observedDocument(state.observed_document_digests,target))throw new Error('Validator input lacks actual host response provenance');
  return await new Promise((done,reject)=>{const child=spawn(process.execPath,[path,args.mode],{stdio:['pipe','pipe','pipe']});let output='',error='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>error+=c);const timer=setTimeout(()=>child.kill(),30000);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);done({valid:code===0,diagnostic:code===0?output:error});});child.stdin.end(JSON.stringify(args.document));});
 }
 return {list,call};
}
async function main() {
 const config=JSON.parse(await readFile(process.argv[2],'utf8'));
 const {list,call}=createInstalledAcceptance(config,async()=>JSON.parse(await readFile(process.argv[2],'utf8')));
 for await(const line of createInterface({input:process.stdin})) {
  let request;try{request=JSON.parse(line);}catch{continue;}if(request.id===undefined)continue;
  try {let result;
   if(request.method==='initialize')result={protocolVersion:request.params.protocolVersion,capabilities:{tools:{}},serverInfo:{name:'Acceptance',version:'1'}};
   else if(request.method==='tools/list')result={tools:list};
   else if(request.method==='tools/call') {try {result={content:[{type:'text',text:JSON.stringify(await call(request.params.name,request.params.arguments??{}))}]};}catch(error){result={isError:true,content:[{type:'text',text:error.message}]};}}
   else if(request.method==='ping')result={};else throw new Error('Unsupported method');
   process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,result})+'\n');
  }catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:request.id,error:{code:-32601,message:'Unsupported method'}})+'\n');}
 }
}
if(process.argv[1]?.endsWith('/marketplace-native-resources.mjs')) main().catch(()=>process.exitCode=1);
