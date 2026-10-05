import {readPublishedFile,verifyPublishedPackage} from './marketplace-published-package.mjs';
import {readFile, realpath} from 'node:fs/promises';
import {resolve, relative, isAbsolute, dirname} from 'node:path';
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
async function installedProductForPath(config,path) {
 if(typeof path!=='string'||!path)throw new Error('reviewer_document_not_observed');
 const matches=[];
 for(const [product,root] of Object.entries(config.installed_roots??{})){
  try{await installedPath(root,path);matches.push(product);}catch{}
 }
 if(matches.length===1)return matches[0];
 throw new Error(matches.length?'reviewer_installed_product_ambiguous':'reviewer_installed_product_unresolved');
}
export function createInstalledAcceptance(config,getState) {
 const references=new Map(),referenceKeys=new Map();let nextReference=0;
 const registerReference=async(product,path)=>{
  if(!Object.hasOwn(config.installed_roots??{},product))throw new Error('Unknown installed product');
  const root=config.installed_roots[product],file=await installedPath(root,path),publishedPath=relative(root,file),commit=config.published_commits[product]??config.published_commits[config.product];
  if(!/\.(?:md|json|mjs)$/.test(file))throw new Error('Unsupported published resource');
  await readPublishedFile(root,commit,publishedPath);
  const key=product+'\0'+publishedPath;let id=referenceKeys.get(key);
  if(!id){id='file_'+(++nextReference);referenceKeys.set(key,id);references.set(id,{reference_id:id,product,path:publishedPath});}
  return references.get(id);
 };
 const tool=(name,properties,required=[])=>({name,description:name,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations:{readOnlyHint:true}});
 const list=[tool('guard_probe',{}),tool('guard_status',{}),tool('read_installed',{product:{type:'string'},path:{type:'string'},reference_id:{type:'string'}},[]),tool('validate_installed',{path:{type:'string'},mode:{type:'string',enum:installedValidatorModes},document:{type:'object'}},['path','mode','document'])];
 async function call(name,args) {
  if(name==='guard_probe')throw new Error('Guard canary executed: hook enforcement unavailable');
  if(name==='guard_status'){const s=await getState();return {ready:s.canary===true,reference_time:new Date().toISOString(),reference_time_source:'reviewer_host_utc_clock'};}
 if(name==='validate_installed'&&!installedValidatorModes.includes(args.mode))throw new Error('reviewer_validator_mode_unsupported');
 if(name==='project_contract_facts'){
  const state=await getState();
  if(!state.canary||!['positive','starter'].includes(state.kind)||!state.handle||!state.allowed_effects?.includes('read')||!state.validated_contracts?.['app-describe']||Object.values(state.failed_validations??{}).some(Boolean)||state.observations?.some(row=>row.tool==='validate.installed'&&(row.is_error||row.response?.valid===false)))throw new Error('reviewer_published_prerequisite_required');
  const scope=Object.fromEntries(['organization','application','installation','role'].map(key=>[key,state.selected_scope?.[key]]));
  if(state.selected_scope?.context_handle!==state.handle||Object.values(scope).some(value=>typeof value!=='string'||!value.trim()))throw new Error('reviewer_scope_unverified');
  if(!Array.isArray(args.documents)||args.documents.length<1||args.documents.length>32)throw new Error('reviewer_document_not_observed');
  for(const item of args.documents){
   const hash=documentDigests(item.document)[0],proof=state.validated_document_proofs?.[hash];
   if(!['operation-describe','api-contract'].includes(item.kind)||!proof||proof.mode!==item.kind||proof.context_handle!==state.handle||!observedDocument(state.observed_document_digests,item.document)||JSON.stringify(Object.fromEntries(Object.keys(scope).map(key=>[key,proof.scope?.[key]])))!==JSON.stringify(scope))throw new Error('reviewer_document_not_observed');
  }
  const documents=args.documents.map(item=>({kind:item.kind,document:item.document,scope}));
  const pinnedHandle=state.handle,proofHashes=documents.map(item=>documentDigests(item.document)[0]),pinnedScope=JSON.stringify(state.selected_scope),pinnedProofs=proofHashes.map(hash=>JSON.stringify(state.validated_document_proofs[hash]));
  const root=config.installed_roots.bos,commit=config.published_commits.bos,relativePath='skills/bos-app-discovery/scripts/project-contract-facts.mjs';
  const path=await installedPath(root,relativePath);await readPublishedFile(root,commit,relativePath);await verifyPublishedPackage(root,commit);
  const result=await new Promise((done,reject)=>{const child=spawn(process.execPath,[path],{stdio:['pipe','pipe','pipe']});let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',()=>{});const timer=setTimeout(()=>child.kill(),30000);child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('close',code=>{clearTimeout(timer);if(code!==0){reject(new Error('reviewer_validation_failed'));return;}try{done(JSON.parse(output));}catch{reject(new Error('reviewer_validation_failed'));}});child.stdin.end(JSON.stringify({documents}));});
  if(state.handle!==pinnedHandle||JSON.stringify(state.selected_scope)!==pinnedScope||proofHashes.some((hash,index)=>JSON.stringify(state.validated_document_proofs?.[hash])!==pinnedProofs[index]))throw new Error('reviewer_discovery_refresh_required');
  return result;
 }
 if(name==='compare_schemas'){
  const state=await getState();
  if(!state.canary||!['positive','starter'].includes(state.kind)||!state.handle||!state.allowed_effects?.includes('read')||!state.validated_contracts?.['app-describe']||Object.values(state.failed_validations??{}).some(Boolean))throw new Error('reviewer_published_prerequisite_required');
  if(!Array.isArray(args.pairs)||args.pairs.length<1||args.pairs.length>32||!Array.isArray(args.proof_documents)||!args.proof_documents.length||args.proof_documents.some(doc=>!observedDocument(state.observed_document_digests,doc)))throw new Error('reviewer_document_not_observed');
  const root=config.installed_roots.bos,commit=config.published_commits.bos,relativePath='skills/bos-app-discovery/scripts/compare-schema-surfaces.mjs';
  const path=await installedPath(root,relativePath);await readPublishedFile(root,commit,relativePath);await verifyPublishedPackage(root,commit);
  return await new Promise((done,reject)=>{const child=spawn(process.execPath,[path],{stdio:['pipe','pipe','pipe']});let output='',error='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>error+=c);const timer=setTimeout(()=>child.kill(),30000);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);if(code!==0){reject(new Error('reviewer_validation_failed'));return;}try{done(JSON.parse(output));}catch{reject(new Error('reviewer_validation_failed'));}});child.stdin.end(JSON.stringify({pairs:args.pairs}));});
 }
 const ref=name==='read_installed'&&args.reference_id?references.get(args.reference_id):null;
 if(name==='read_installed'&&args.reference_id&&(!ref||(args.product&&args.product!==ref.product)||(args.path&&args.path!==ref.path)))throw new Error('reviewer_document_not_observed');
 const selected=name==='validate_installed'?'bos':ref?.product??args.product??await installedProductForPath(config,args.path);
  if(!Object.hasOwn(config.installed_roots,selected))throw new Error('Unknown installed product');
  const root=name==='validate_installed'?(config.installed_roots.bos??config.installed_root):config.installed_roots[selected];
  const path=await installedPath(root,ref?.path??args.path);
  const commit=config.published_commits[name==='validate_installed'?'bos':selected]??config.published_commits[config.product];
  await readPublishedFile(root,commit,relative(root,path));
 if(name==='read_installed') {
  if(!/\.(?:md|json|mjs)$/.test(path))throw new Error('Unsupported published resource');
  const text=await readFile(path,'utf8'),self=await registerReference(selected,relative(root,path)),offered=[],unavailable=[];
  if(path.endsWith('.md')){
   const links=[...text.matchAll(/\[([^\]]+)\]\((<[^>]+>|[^)\s]+)(?:\s+"[^"]*")?\)/g)];
   const results=await Promise.allSettled(links.map(async link=>{
    const target=link[2].replace(/^<|>$/g,'').split('#')[0];
    if(!target||/^(?:[a-z][a-z0-9+.-]*:|[\/\\])/i.test(target)||! /\.(?:md|json|mjs)$/i.test(target))return null;
    const decoded=decodeURIComponent(target);
    const file=await registerReference(selected,relative(root,resolve(dirname(path),decoded)));
    return {...file,label:link[1],target};
   }));
   results.forEach((result,index)=>{if(result.status==='fulfilled'){if(result.value)offered.push(result.value);}else unavailable.push({target:links[index][2],reason:'not_in_verified_published_package'});});
  }
  return {text,reference_id:self.reference_id,references:offered,...(unavailable.length?{unavailable_references:unavailable}:{})};
 }

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
