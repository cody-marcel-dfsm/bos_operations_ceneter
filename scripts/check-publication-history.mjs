// Full unpublished-content gate. No checkout, network, source writer or admission override.
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {readFile,mkdir,mkdtemp,writeFile,rm} from "node:fs/promises";
import {join,basename,extname,resolve} from "node:path";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import {scanPrivacyFile,customerDataFindings,root as sourceRoot} from "./check-customer-data.mjs";
import {validatePublicationPaths} from "./check-publication-safety.mjs";
import {forbiddenNames,personalAbsolutePathPattern,secretPatterns} from "./lib/publication-credentials.mjs";
import {executableIdentity} from "./lib/privacy-coverage.mjs";
const execute=promisify(execFile),hash=body=>createHash("sha256").update(body).digest("hex");
const maximum=16*1024*1024;
async function git(root,args,encoding="utf8"){return(await execute("git",["--no-replace-objects",...args],{cwd:root,encoding,maxBuffer:32*1024*1024})).stdout;}
export function credentialFindings(path,body){
  const found=[];if(forbiddenNames.has(basename(path))||basename(path).startsWith(".env.")||[".pem",".key",".p12",".pfx"].includes(extname(path)))found.push("credential_filename");
  const text=body.toString("utf8"),instruction=path==="AGENTS.md"||path.startsWith(".agents/");
  for(const pattern of secretPatterns)if(!(instruction&&pattern===personalAbsolutePathPattern)&&pattern.test(text))found.push("credential_content");
  return [...new Set(found)];
}
// Exact immutable negative-fixture delimiters; every other original-byte rule remains.
const historicalHeaderRecords=Object.freeze([
  Object.freeze({"blob":"1951d9696d5e13b3860a3ece69ebdc6c767b323b","sha256":"fd59c5e0d1826b95b94b879800210bc1227dd4aef05de4625138ee5d5262c30b","bytes":27255,"offset":8568,"span_bytes":27,"context_sha256":"8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f"}),
  Object.freeze({"blob":"2619f0337bbe7b5884058d421f229b7850a781d2","sha256":"f8f0d42c12567893cf415837eb02693391fb544ced8662b6f40f400d73eb0a68","bytes":27144,"offset":8457,"span_bytes":27,"context_sha256":"8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f"}),
  Object.freeze({"blob":"6313e66c4d52cc7ed88fb5fbba50510a517f325e","sha256":"49d1d6b4b1329a5101654069432ea350cf480b554cd951b81cc5f38742033fd1","bytes":32529,"offset":8580,"span_bytes":27,"context_sha256":"8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f"}),
  Object.freeze({"blob":"68f4e0ca18671d37480c5eac05b2b840faf3e2cc","sha256":"f0121b793435573994e873099c7345d848c55ec188bda13742fb4a11f83c3a68","bytes":42404,"offset":8580,"span_bytes":27,"context_sha256":"8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f"}),
  Object.freeze({"blob":"73a6d26c670e2e22b082f3cade796c1e1dc78ab0","sha256":"2a9863e18c54fe7403c69cc8019bfd8e5cf27308083d3986f3ab508ab574b350","bytes":36281,"offset":8580,"span_bytes":27,"context_sha256":"8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f"}),
  Object.freeze({"blob":"792720d050c8c96e30ab3a11b500f019293f11cd","sha256":"e8c064398f5f304324bf34b6c089d76d42afd11024265adc99cf9bd49e198e81","bytes":40009,"offset":8580,"span_bytes":27,"context_sha256":"8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f"}),
  Object.freeze({"blob":"8651b812804aec856f337273449f44d0f9e05763","sha256":"45e0963ad42d2dc422f54dd3dcedf5e2a3fa31a960ffca8646d18588a49a6d81","bytes":30804,"offset":8568,"span_bytes":27,"context_sha256":"8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f"}),
  Object.freeze({"blob":"aa03dddc08e9905065ab7344c82724ef2debe42b","sha256":"d6befd66ad433340d43bd8aab31cc7f1ff3087107ed495c2805f9587edea7274","bytes":37047,"offset":8580,"span_bytes":27,"context_sha256":"8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f"}),
  Object.freeze({"blob":"bbb7365a6ce85ea2c92aa906f3e3aba1c2e611da","sha256":"74fe638fd6f9e291ad6dcc84d189e233027f74dee50bc94aaf92955f772633c5","bytes":35291,"offset":8580,"span_bytes":27,"context_sha256":"8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f"}),
  Object.freeze({"blob":"c6a09ce01915821bfb8ef6640c5a5f9d4a7078b5","sha256":"ab70958bb8080143945151d213801a059c6d289fa673ccd80c94530fafea8aa0","bytes":39780,"offset":8580,"span_bytes":27,"context_sha256":"8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f"}),
  Object.freeze({"blob":"d59f21a9c664818fa1566807e4c322fc64d89750","sha256":"1f4454821ebd549c233fc90fc7758bf8ab02024aec76cd817517605f25ddbf95","bytes":23322,"offset":8457,"span_bytes":27,"context_sha256":"8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f"}),
  Object.freeze({"blob":"dbd54291c0c5db40db492c5fe15692ae8b0b74be","sha256":"980812b99a77e02c0c2230698bab7169dc7ea211525ee47d85052b44f047bd52","bytes":41448,"offset":8580,"span_bytes":27,"context_sha256":"8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f"}),
  Object.freeze({"blob":"dce815948f403e5cabb276736299b1bf0d2d2bc5","sha256":"50b17f01a8cb5d6b24a6c16d5a3a79a0932ba9055a18de6a22ac399a6b2a267c","bytes":25063,"offset":8457,"span_bytes":27,"context_sha256":"8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f"}),
  Object.freeze({"blob":"fec896741581a989f6af399f0923789d3041630b","sha256":"fffe5d5ea2b9a8a9c657c8cbd4bcbbd719ecc8484daef2f2c86b457cf10a3ce8","bytes":23940,"offset":8457,"span_bytes":27,"context_sha256":"8ba4bbd1a376dce604cd14e99755f916352598bd36614a4367eb765a1ce1979f"}),
]);
export function historicalCredentials(path,blob,body){
  const original=credentialFindings(path,body),record=historicalHeaderRecords.find(row=>row.blob===blob);
  if(path!=="tests/oracle_spec_test.py"||!record||body.length!==record.bytes||hash(body)!==record.sha256)
    return{findings:original,classification:null};
  const literal=Buffer.from(["-----BEGIN ","PRIVATE KEY-----"].join("")),offset=body.indexOf(literal);
  if(offset!==record.offset||body.indexOf(literal,offset+1)!==-1||record.span_bytes!==literal.length||
    hash(body.subarray(Math.max(0,offset-48),offset+literal.length+48))!==record.context_sha256||
    createHash("sha1").update(Buffer.from("blob "+body.length+"\0")).update(body).digest("hex")!==blob)
    throw Error("Historical fixture identity changed");
  const text=body.toString("utf8"),remaining=Buffer.concat([body.subarray(0,offset),Buffer.alloc(literal.length,32),body.subarray(offset+literal.length)]).toString("utf8");
  // Only pattern zero's one exact delimiter is classified. Every other pattern
  // sees original bytes, and the complete original privacy decoder runs separately.
  const findings=original.filter(value=>value!=="credential_content");
  if(secretPatterns.slice(1).some(pattern=>pattern.test(text))||secretPatterns[0].test(remaining))findings.push("credential_content");
  return{findings,classification:{path_sha256:hash(path),...record,kind:"exact_historical_negative_fixture_key_header",literal_count:1}};
}
// One immutable historical source uses the public Git SSH transport user.
// Classify that email-shaped protocol token only; original non-email privacy
// findings and the separate original-byte credential scan remain mandatory.
export async function historicalPrivacy(path,blob,body,config){
  const absolute=join(sourceRoot,path),original=await scanPrivacyFile(absolute,body,{},config);
  const literal=["git","github.com"].join("@"),text=body.toString("utf8"),count=text.split(literal).length-1;
  if(path!=="scripts/lib/runtime-skill-export.mjs"||blob!=="7dab470bc8e3a1f647a2d2a5ec094e48be25f401"||hash(body)!=="49ae97294c1c9e0b3fa09ca0dba20603e2d02685fa5a65aee3fc847f9b4db242"||count!==1)
    return{findings:original,classification:null};
  const rawGit=createHash("sha1").update(Buffer.from("blob "+body.length+"\0")).update(body).digest("hex");
  if(rawGit!==blob)throw Error("Historical blob identity changed");
  const remaining=await scanPrivacyFile(absolute,Buffer.from(text.replaceAll(literal,"git github.com")),{},config);
  return{findings:[...new Set([...original.filter(row=>!row.endsWith(": non-synthetic email address")),...remaining])],
    classification:{path_sha256:hash(path),blob,sha256:hash(body),kind:"exact_public_git_ssh_protocol_user",literal_count:count}};
}
export async function publicationHistory({root=sourceRoot,base,source,blockedDigests,approvedBinaryDigests,githubIdentities}={}){
  if(!/^[a-f0-9]{40}$/u.test(base??"")||!/^[a-f0-9]{40}$/u.test(source??""))throw Error("Exact history required");
  if((await git(root,["rev-parse","--is-shallow-repository"])).trim()!=="false"||(await git(root,["replace","-l"])).trim())throw Error("Original history required");
  const graft=(await git(root,["rev-parse","--git-path","info/grafts"])).trim();try{if((await readFile(resolve(root,graft))).toString().trim())throw Error("Original history required");}catch(error){if(error.code!=="ENOENT")throw error;}
  await git(root,["merge-base","--is-ancestor",base,source]);
  const ruleNames=["privacy/customer-identifiers.sha256","privacy/approved-binary-assets.sha256","privacy/owned-github-pr-identities.json"];
  const ruleBytes=await Promise.all(ruleNames.map(name=>readFile(join(sourceRoot,name))));
  const config={blockedDigests:blockedDigests??new Set(ruleBytes[0].toString().split(/\s+/u).filter(Boolean)),approvedBinaryDigests:approvedBinaryDigests??new Set(ruleBytes[1].toString().split(/\s+/u).filter(Boolean)),githubIdentities:githubIdentities??JSON.parse(ruleBytes[2]),archiveExecutable:(await executableIdentity("unzip")).path};
  const policyFiles=[fileURLToPath(import.meta.url),join(sourceRoot,"scripts/check-customer-data.mjs"),join(sourceRoot,"scripts/lib/publication-credentials.mjs"),join(sourceRoot,"scripts/check-publication-safety.mjs")];
  const policySnapshot=async()=>hash(JSON.stringify([
    ...await Promise.all(policyFiles.map(async path=>[path,hash(await readFile(path))])),
    ...await Promise.all(ruleNames.map(async name=>[name,hash(await readFile(join(sourceRoot,name)))])),
    [config.archiveExecutable,hash(await readFile(config.archiveExecutable))]]));
  const policy=await policySnapshot();
  const baseline=new Set((await git(root,["ls-tree","-r","-z",base])).split("\0").filter(Boolean).map(row=>{const[header,path]=row.split("\t");return path+"\0"+header.split(" ")[2]+"\0"+header.split(" ")[0];}));
  const pairs=new Map(),commits=(await git(root,["rev-list","--reverse",base+".."+source])).trim().split("\n").filter(Boolean);
  if(!commits.length||commits.length>10000)throw Error("History bound exceeded");
  for(const commit of commits){
    const parts=(await git(root,["diff-tree","-m","-r","--raw","-z","--no-commit-id","--no-renames",commit])).split("\0");
    for(let index=0;index<parts.length;){const header=parts[index++];if(!header)continue;const path=parts[index++];const[oldMode,newMode,oldBlob,newBlob]=header.slice(1).split(" ");
      if(!path||!/^:[0-7]{6} [0-7]{6} [a-f0-9]{40} [a-f0-9]{40} [A-Z][0-9]*$/u.test(header))throw Error("Invalid history inventory");
      for(const[mode,blob]of[[oldMode,oldBlob],[newMode,newBlob]]){
        if(mode==="000000"||baseline.has(path+"\0"+blob+"\0"+mode))continue;
        const key=path+"\0"+blob+"\0"+mode;const prior=pairs.get(key);if(prior&&prior.mode!==mode)throw Error("Conflicting blob mode");pairs.set(key,{path,blob,mode});
      }
    }
  }
  if(!pairs.size||pairs.size>25000)throw Error("History inventory bound exceeded");
  const rows=[...pairs.values()].sort((a,b)=>(a.path<b.path?-1:a.path>b.path?1:a.blob<b.blob?-1:a.blob>b.blob?1:0)),findings=[],classifications=[];
  const add=(row,classification)=>findings.push({path_sha256:hash(row.path),blob:row.blob,classification});
  for(const row of rows){
    if(validatePublicationPaths([row.path]).length)add(row,"private_or_unclassified_path");
    if(!["100644","100755"].includes(row.mode)){add(row,"nonregular_source");continue;}
    const size=Number((await git(root,["cat-file","-s",row.blob])).trim());if(!Number.isSafeInteger(size)||size>maximum)throw Error("Blob bound exceeded");
    const body=await git(root,["cat-file","blob",row.blob],"buffer");if(body.length!==size)throw Error("Blob changed");
    const credentials=historicalCredentials(row.path,row.blob,body);if(credentials.classification)classifications.push(credentials.classification);
    for(const code of credentials.findings)add(row,code);
    for(const finding of customerDataFindings(row.path,row.path,config.blockedDigests))add(row,"path_customer_privacy");
    const inspected=await historicalPrivacy(row.path,row.blob,body,config);if(inspected.classification)classifications.push(inspected.classification);if(inspected.findings.length)add(row,"customer_privacy_or_unapproved_binary");
    if(row.path.endsWith(".zip")){
      const scratch=join(sourceRoot,"Vault/tmp/publication-history");await mkdir(scratch,{recursive:true,mode:0o700});const directory=await mkdtemp(join(scratch,"z-")),snapshot=join(directory,"snapshot.zip");
      const env={...process.env};for(const key of["UNZIP","UNZIPOPT","ZIPINFO","ZIPINFOOPT"])delete env[key];
      try{await writeFile(snapshot,body,{flag:"wx",mode:0o600});const list=(await execute(config.archiveExecutable,["-Z1",snapshot],{env,maxBuffer:maximum})).stdout.split(/\r?\n/u).filter(Boolean);if(list.length>10000)throw Error("Archive bound exceeded");
        for(const entry of list){if(entry.startsWith("/")||entry.split("/").includes("..")||/(^|\/)vault(\/|$)/iu.test(entry))add(row,"archive_private_path");const value=(await execute(config.archiveExecutable,["-p",snapshot,entry],{env,encoding:"buffer",maxBuffer:maximum})).stdout;if(credentialFindings(entry,value).length)add(row,"archive_credentials");}
      }finally{await rm(directory,{recursive:true,force:true});}
    }
  }
  const after=await policySnapshot();
  if(after!==policy)throw Error("Policy changed");
  return{base,source,status:findings.length?"REJECT":"PASS",pairs:rows.length,inventory_sha256:hash(JSON.stringify(rows)),policy_sha256:policy,findings,classifications};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const base=process.env.BOC_PUBLICATION_BASE,source=process.env.BOC_PUBLICATION_SOURCE;const publication_history=await publicationHistory({base,source});console.log(JSON.stringify({publication_history}));if(publication_history.status!=="PASS")process.exitCode=1;}
  catch{console.error("Complete publication history content verification failed; preserve source and inspect native evidence.");process.exitCode=1;}
}
