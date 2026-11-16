import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,mkdir,writeFile,readFile,rm} from "node:fs/promises";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {publicationHistory,credentialFindings,historicalPrivacy} from "../scripts/check-publication-history.mjs";
const scratch=new URL("../Vault/tmp/",import.meta.url).pathname;
const git=(root,...args)=>execFileSync("git",["--no-replace-objects","-C",root,...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
async function fixture(t){await mkdir(scratch,{recursive:true});const root=await mkdtemp(join(scratch,"ph-"));t.after(()=>rm(root,{recursive:true,force:true}));git(root,"init","-q","-b","main");git(root,"config","user.name","Synthetic history");git(root,"config","user.email","history@example.invalid");
 const commit=async(path,text)=>{await mkdir(join(root,path,".."),{recursive:true});await writeFile(join(root,path),text);git(root,"add","-A");git(root,"commit","-qm","Synthetic history content");return git(root,"rev-parse","HEAD");};
 const base=await commit("README.md","Published synthetic baseline\n");return{root,base,commit,probe:()=>publicationHistory({root,base,source:git(root,"rev-parse","HEAD")})};}
test("complete unpublished history passes with immutable input/policy inventory",async t=>{const f=await fixture(t);await f.commit("README.md","Permitted synthetic guidance\n");const report=await f.probe();assert.equal(report.status,"PASS");assert.equal(report.pairs,1);assert.match(report.inventory_sha256,/^[a-f0-9]{64}$/u);assert.equal(report.source,git(f.root,"rev-parse","HEAD"));});
test("secret and customer content later reverted on an unpublished side branch remain rejected without exposing content",async t=>{
 for(const kind of["secret","customer"])await t.test(kind,async t=>{const f=await fixture(t);await f.commit("AGENTS.md","Local permitted change\n");git(f.root,"checkout","-qb","side",f.base);
  const sensitive=kind==="secret"?JSON.stringify({["access"+"_token"]:"synthetic-sensitive-value"}):"Synthetic person "+"name"+"@"+["outside","net"].join(".");
  await f.commit("README.md",sensitive);await f.commit("README.md","Published synthetic baseline\n");git(f.root,"checkout","main");git(f.root,"merge","--no-ff","-qm","Preserve side history","side");const report=await f.probe();assert.equal(report.status,"REJECT");assert(report.findings.some(row=>row.classification===(kind==="secret"?"credential_content":"customer_privacy_or_unapproved_binary")));assert(!JSON.stringify(report).includes(sensitive));
 });
});
test("merge-only resolution bytes are checked despite harmless parent files",async t=>{const f=await fixture(t);await f.commit("AGENTS.md","Permitted main\n");git(f.root,"checkout","-qb","side",f.base);await f.commit("README.md","Permitted side\n");const side=git(f.root,"rev-parse","HEAD");git(f.root,"checkout","main");const first=git(f.root,"rev-parse","HEAD");await writeFile(join(f.root,"README.md"),JSON.stringify({["refresh"+"_token"]:"synthetic-secret-resolution"}));git(f.root,"add","README.md");const tree=git(f.root,"write-tree"),merge=git(f.root,"commit-tree",tree,"-p",first,"-p",side,"-m","Synthetic resolution");const report=await publicationHistory({root:f.root,base:f.base,source:merge});assert.equal(report.status,"REJECT");assert(report.findings.some(row=>row.classification==="credential_content"));});
test("current customer digest policy scans historical Unicode and path content",async t=>{const f=await fixture(t);const phrase="synthetic private phrase";await f.commit("README.md",phrase);await f.commit("README.md","Clean current file\n");const {createHash}=await import("node:crypto");const report=await publicationHistory({root:f.root,base:f.base,source:git(f.root,"rev-parse","HEAD"),blockedDigests:new Set([createHash("sha256").update(phrase).digest("hex")])});assert.equal(report.status,"REJECT");});
test("same blob at a new private path and nonregular history remain rejected",async t=>{const f=await fixture(t);await f.commit("Vault/private.md","Published synthetic baseline\n");await f.commit("README.md","Current clean\n");const report=await f.probe();assert.equal(report.status,"REJECT");assert(report.findings.some(row=>row.classification==="private_or_unclassified_path"));});
test("credential classification retains existing filename/private-key/token patterns and instruction path treatment",()=>{
 assert(credentialFindings("source/fixture.mjs",Buffer.from(["-----BEGIN ","PRIVATE KEY-----"].join(""))).includes("credential_content"));assert(credentialFindings("credentials.json",Buffer.from("{}")).includes("credential_filename"));
 const path=["/Users/","synthetic/"].join("");assert(credentialFindings("source/fixture.mjs",Buffer.from(path)).includes("credential_content"));assert.deepEqual(credentialFindings("AGENTS.md",Buffer.from(path)),[]);
});
test("missing commit, foreign base and replace-object histories cannot create a pass",async t=>{const f=await fixture(t);await f.commit("README.md","Permitted current\n");const source=git(f.root,"rev-parse","HEAD");await assert.rejects(publicationHistory({root:f.root,base:"0".repeat(40),source}));git(f.root,"replace",source,f.base);await assert.rejects(f.probe());});
test("historical ZIP entries retain privacy decoders and credential custody checks after archive removal",async t=>{
 const f=await fixture(t),archive=join(f.root,"products/synthetic.zip");await mkdir(join(f.root,"products"));
 const sensitive=JSON.stringify({["access"+"_token"]:"synthetic-archive-credential"});
 execFileSync("python3",["-c","import sys,zipfile; z=zipfile.ZipFile(sys.argv[1],'w'); z.writestr('data.json',sys.argv[2]); z.close()",archive,sensitive]);git(f.root,"add","products");git(f.root,"commit","-qm","Synthetic archive");await rm(archive);git(f.root,"add","-A");git(f.root,"commit","-qm","Preserve removed archive in history");const report=await f.probe();assert.equal(report.status,"REJECT");assert(report.findings.some(row=>row.classification==="archive_credentials"));assert(!JSON.stringify(report).includes(sensitive));
});

test("exact historical public protocol classification preserves raw rules and rejects mutations/copied paths/customer/credentials",async()=>{
 const {scanPrivacyFile,root}=await import("../scripts/check-customer-data.mjs");const {executableIdentity}=await import("../scripts/lib/privacy-coverage.mjs");
 const path="scripts/lib/runtime-skill-export.mjs",blob="7dab470bc8e3a1f647a2d2a5ec094e48be25f401",body=execFileSync("git",["--no-replace-objects","cat-file","blob",blob]);
 const config={blockedDigests:new Set((await readFile(join(root,"privacy/customer-identifiers.sha256"),"utf8")).split(/\s+/u)),approvedBinaryDigests:new Set((await readFile(join(root,"privacy/approved-binary-assets.sha256"),"utf8")).split(/\s+/u)),githubIdentities:JSON.parse(await readFile(join(root,"privacy/owned-github-pr-identities.json"))),archiveExecutable:(await executableIdentity("unzip")).path};
 const raw=await scanPrivacyFile(join(root,path),body,{},config);assert(raw.some(row=>row.endsWith(": non-synthetic email address")));
 const classified=await historicalPrivacy(path,blob,body,config);assert.deepEqual(classified.findings,[]);assert.equal(classified.classification.literal_count,1);assert.deepEqual(credentialFindings(path,body),[]);
 for(const variant of [{path:"scripts/copied.mjs",body},{path,body:Buffer.concat([body,Buffer.from("\n// changed")])},{path,body:Buffer.concat([body,Buffer.from("\nname"+"@"+["outside","net"].join("."))])},{path,body:Buffer.concat([body,Buffer.from(JSON.stringify({["access"+"_token"]:"synthetic-added-credential"}))])}]){
  const result=await historicalPrivacy(variant.path,blob,variant.body,config);assert.equal(result.classification,null);assert(result.findings.length||credentialFindings(variant.path,variant.body).length);
 }
});
