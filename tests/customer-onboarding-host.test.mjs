import test from "node:test";
import assert from "node:assert/strict";
import {mkdir,mkdtemp,writeFile,readFile,chmod,rename,rm} from "node:fs/promises";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createServer,request} from "node:https";
import {createExistingOAuthOnboardingPort,createCustomerOnboardingMetadataHost,createCustomerOnboardingOAuthHost} from "../source/host-runtime/bos-journey-notifications/customer-onboarding-host.mjs";
import {createCompanionBridge,callCompanion} from "../source/host-runtime/bos-journey-notifications/muse-companion-host.mjs";
import {syntheticOnboarding,syntheticSnapshot,metadata,ref} from "./helpers/synthetic-onboarding.mjs";
const base=new URL("../Vault/tmp/",import.meta.url).pathname;
async function directory(t){await mkdir(base,{recursive:true});const path=await mkdtemp(join(base,"onb-"));t.after(async()=>{await t.onboardingCleanup?.();await rm(path,{recursive:true,force:true});});return path;}
const secret="synthetic-existing-key";
async function apiFixture(t,options={}){
  const root=await directory(t),credentialPath=join(root,"existing-key");await writeFile(credentialPath,secret,{mode:0o600});
  let current=true,source=true;const requests=[],descriptor=syntheticOnboarding();
  const host=await createCustomerOnboardingMetadataHost({enabled:true,root,credentialPath,protectedResource:descriptor.audience,taskIntent:"Review synthetic own onboarding",lifetimeMs:30000,
    assertCurrent:async binding=>current&&typeof binding.taskRef==="string",assertSourceCurrent:async()=>source,
    fetchImpl:async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify(metadata(descriptor)),{headers:{"content-type":"application/json"}});},...options});
  t.onboardingCleanup=()=>host.retire();return{host,root,credentialPath,requests,setCurrent:v=>current=v,setSource:v=>source=v};
}
async function oauthFixture(t,options={}){
  const root=await directory(t);let current=true,kind="oauth",audience="https://service.example.invalid/mcp/apps/bos/platform",source=true,status=200,body=syntheticSnapshot();const requests=[];
  const connection={getAuthenticationKind:async()=>kind,getProtectedResource:async()=>audience,captureIdentityScope:async()=>async()=>current,supportsIdentityOnlyHttps:async()=>true,
    request:async args=>{requests.push(args);if(new URL(args.href).pathname.startsWith("/mcp/"))return{status:200,body:metadata(syntheticOnboarding(audience))};return{status,body};}};
  const host=await createCustomerOnboardingOAuthHost({enabled:true,connection,root,taskIntent:"Review synthetic own-work",lifetimeMs:30000,assertCurrent:async binding=>typeof binding.taskRef==="string",assertSourceCurrent:async()=>source,...options});
  t.onboardingCleanup=()=>host.retire();return{host,root,requests,connection,setCurrent:v=>current=v,setKind:v=>kind=v,setAudience:v=>audience=v,setSource:v=>source=v,setResponse:(s,b)=>{status=s;body=b;}};
}
test("concrete API-key mode uses only exact fixed metadata, no app context/init/session and no account execution",async t=>{
  const f=await apiFixture(t),bridge=await createCompanionBridge({root:f.root,host:f.host});t.after(()=>bridge.close());
  const result=await callCompanion(bridge.controlPath,"onboarding-discover");assert.equal(result.account,"not_evaluated");assert.equal(result.host.ownWork,false);
  const sent=f.requests[0];assert.equal(sent.url,result.descriptor.audience);assert.equal(sent.options.headers.authorization,`Bearer ${secret}`);assert.equal(sent.options.redirect,"manual");
  assert.deepEqual(Object.keys(sent.options.headers).sort(),["accept","authorization","content-type"]);
  assert.deepEqual(JSON.parse(sent.options.body),{jsonrpc:"2.0",id:"onboarding-metadata",method:"resources/read",params:{uri:result.descriptor.descriptor_uri}});
  for(const [operation,extra]of[["onboarding-read",{payload:{}}],["onboarding-present",{action_ref:ref(1)}],["onboarding-action",{payload:{action_ref:ref(1),decision:"confirm"},confirmation:{confirmed:true}}],["onboarding-state",{action_ref:ref(1)}]])assert.equal((await callCompanion(bridge.controlPath,operation,extra)).available,false);
  assert.equal(f.requests.length,1);assert.equal((await callCompanion(bridge.controlPath,"poll")).pending,false);
  await assert.rejects(callCompanion(bridge.controlPath,"onboarding-read",{payload:{},url:"https://elsewhere.example.invalid"}));
});
test("API-key task/source/content/inode/mode invalidation retires without credential disclosure",async t=>{
  for(const kind of["task","source","content","inode","mode"])await t.test(kind,async t=>{const f=await apiFixture(t);if(kind==="task")f.setCurrent(false);if(kind==="source")f.setSource(false);
    if(kind==="content")await writeFile(f.credentialPath,"changed");if(kind==="inode"){await rename(f.credentialPath,f.credentialPath+".old");await writeFile(f.credentialPath,secret,{mode:0o600});}if(kind==="mode")await chmod(f.credentialPath,0o644);
    await assert.rejects(f.host.discover());assert.equal(f.requests.length,0);const receipt=await readFile(join(f.root,f.host.binding.registrationRef+".json"),"utf8");assert.equal(JSON.parse(receipt).status,"retired");assert(!receipt.includes(secret));
  });
});
test("existing OAuth port admits actual trusted capability only; kind mismatch stays false",async()=>{
  assert.equal((await createExistingOAuthOnboardingPort({})).getOwnOnboardingCapabilities instanceof Function,true);
  for(const kind of["api_key","legacy_email"]){const port=await createExistingOAuthOnboardingPort({enabled:true,connection:{getAuthenticationKind:async()=>kind,getProtectedResource:async()=>"https://service.example.invalid/mcp/apps/bos/platform",captureIdentityScope:async()=>async()=>true,request:async()=>assert.fail("No metadata call"),supportsIdentityOnlyHttps:async()=>true}});assert.equal((await port.getOwnOnboardingCapabilities()).ownWork,false);}
});
test("protected eligible OAuth host routes exact read/present/action/state over same opaque existing connection",async t=>{
  const f=await oauthFixture(t),bridge=await createCompanionBridge({root:f.root,host:f.host});t.after(()=>bridge.close());
  assert.equal((await callCompanion(bridge.controlPath,"onboarding-read",{payload:{}})).body.status,"read");
  const shown=await callCompanion(bridge.controlPath,"onboarding-present",{action_ref:ref(1)});assert.equal(shown.subject.revision,3);
  f.setResponse(200,{...syntheticSnapshot(),status:"applied",receipt_ref:ref(200)});
  const result=await callCompanion(bridge.controlPath,"onboarding-action",{payload:{action_ref:ref(1),decision:"confirm"},confirmation:{presentation_ref:shown.presentation_ref,confirmed:true}});assert.equal(result.body.status,"applied");
  assert.equal((await callCompanion(bridge.controlPath,"onboarding-state",{action_ref:ref(1)})).body.receipt_ref,ref(200));
  for(const request of f.requests){assert.equal(request.method,"POST");assert.equal(new URL(request.href).origin,"https://service.example.invalid");assert.deepEqual(Object.keys(request.headers).sort(),["accept","content-type"]);assert.equal(request.redirect,"manual");assert.equal(request.maximumResponseBytes,1048576);}
  await assert.rejects(callCompanion(bridge.controlPath,"onboarding-action",{payload:{action_ref:ref(1),decision:"confirm"},confirmation:{confirmed:true},headers:{authorization:"forged"}}));
  await callCompanion(bridge.controlPath,"retire");await assert.rejects(callCompanion(bridge.controlPath,"onboarding-read",{payload:{}}));
});
test("OAuth generation/kind/audience/source revocation retires current task; HTTP account denial has no fallback",async t=>{
  for(const kind of["generation","kind","audience","source"])await t.test(kind,async t=>{const f=await oauthFixture(t);if(kind==="generation")f.setCurrent(false);if(kind==="kind")f.setKind("api_key");if(kind==="audience")f.setAudience("https://elsewhere.example.invalid/mcp/apps/bos/platform");if(kind==="source")f.setSource(false);
    await assert.rejects(f.host.readOwn({}));assert.equal(JSON.parse(await readFile(join(f.root,f.host.binding.registrationRef+".json"))).status,"retired");
  });
  const f=await oauthFixture(t);f.setResponse(403,{error:{code:"authorization_denied"}});assert.equal((await f.host.readOwn({})).code,"authorization_denied");assert.equal(f.requests.filter(row=>row.href.includes("/api/v1/")).length,1);
});
test("redirect, external schema and oversized metadata reject; host is disabled unless explicitly enabled",async t=>{
  assert.equal((await createCustomerOnboardingMetadataHost({})).enabled,false);
  for(const kind of["redirect","schema","oversized"])await t.test(kind,async t=>{const d=syntheticOnboarding();if(kind==="schema")d.operations[0].input_schema={$ref:"https://elsewhere.example.invalid/schema"};
    const f=await apiFixture(t,{fetchImpl:async()=>kind==="redirect"?{status:302,body:{}}:new Response(kind==="oversized"?"x".repeat(1048577):JSON.stringify(metadata(d)),{headers:{"content-type":"application/json"}})});await assert.rejects(f.host.discover());
  });
});
test("actual loopback TLS metadata through concrete protected API-key host and private fixed bridge",async t=>{
  const root=await directory(t),keyPath=join(root,"key.pem"),certPath=join(root,"cert.pem");execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-days","1","-subj","/CN=synthetic.example.invalid","-addext","subjectAltName=IP:127.0.0.1","-keyout",keyPath,"-out",certPath],{stdio:"ignore"});
  const cert=await readFile(certPath);let audience,hits=0;
  const server=createServer({key:await readFile(keyPath),cert},async(req,res)=>{hits++;assert.equal(req.method,"POST");assert.equal(req.url,"/mcp/apps/bos/platform");assert.equal(req.headers.authorization,`Bearer ${secret}`);assert.equal(req.headers["x-bos-context-handle"],undefined);assert.equal(req.headers["mcp-session-id"],undefined);
    let text="";for await(const chunk of req)text+=chunk;assert.deepEqual(JSON.parse(text),{jsonrpc:"2.0",id:"onboarding-metadata",method:"resources/read",params:{uri:"bos://platform/customer-onboarding/contract"}});res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(metadata(syntheticOnboarding(audience))));});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));audience=`https://127.0.0.1:${server.address().port}/mcp/apps/bos/platform`;t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const fetchImpl=(url,options)=>new Promise((resolve,reject)=>{const req=request(url,{method:options.method,headers:options.headers,ca:cert,signal:options.signal},res=>resolve({status:res.statusCode,headers:{get:name=>res.headers[name]},body:res}));req.on("error",reject);req.end(options.body);});
  const credentialPath=join(root,"existing-key");await writeFile(credentialPath,secret,{mode:0o600});const host=await createCustomerOnboardingMetadataHost({enabled:true,root,credentialPath,protectedResource:audience,taskIntent:"Read synthetic current metadata",lifetimeMs:30000,assertCurrent:async()=>true,assertSourceCurrent:async()=>true,fetchImpl});
  const bridge=await createCompanionBridge({root,host});t.onboardingCleanup=async()=>{await host.retire();await bridge.close();};assert.equal((await callCompanion(bridge.controlPath,"onboarding-discover")).descriptor.audience,audience);assert.equal(hits,1);assert.equal((await callCompanion(bridge.controlPath,"onboarding-read",{payload:{}})).available,false);assert.equal(hits,1);
});
test("finite metadata lifetime retires without scheduling work or sending a business request",async t=>{
  const f=await apiFixture(t,{lifetimeMs:1000});await Promise.all([f.host.run(),new Promise(resolve=>setTimeout(resolve,1100))]);await assert.rejects(f.host.discover());assert.equal(f.requests.length,0);
});
