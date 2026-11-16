import {randomBytes,randomUUID} from "node:crypto";
import {join} from "node:path";
import {admitOnboardingDescriptor,parseOnboardingMetadata,parseOwnJson,platformAudience,onboardingResource,OwnOnboardingError,createCustomerOnboarding} from "../../platform/ada/scripts/customer-onboarding.mjs";
import {protectedRead,hash,privateDirectory,atomicPrivateJson} from "./protected-files.mjs";
const fail=code=>{throw new OwnOnboardingError(code);};
const metadataBody=()=>({jsonrpc:"2.0",id:"onboarding-metadata",method:"resources/read",params:{uri:onboardingResource}});
async function jsonResponse(reply){
  if(reply?.body?.[Symbol.asyncIterator]){
    if(String(reply.headers?.get?.("content-type")??"").split(";",1)[0]!=="application/json")fail("invalid_response");
    const chunks=[];let length=0;for await(const chunk of reply.body){length+=chunk.length;if(length>1048576)fail("response_too_large");chunks.push(chunk);}
    return{status:reply.status,body:parseOwnJson(new TextDecoder("utf-8",{fatal:true}).decode(Buffer.concat(chunks)))};
  }
  if(!Number.isSafeInteger(reply?.status)||Buffer.byteLength(JSON.stringify(reply.body))>1048576)fail("invalid_response");
  return{status:reply.status,body:typeof reply.body==="string"?parseOwnJson(reply.body):structuredClone(reply.body)};
}

// The caller is the existing BOS/host connection owner, never model JSON. This
// port neither reads an OAuth token nor creates login, refresh or account grants.
export async function createExistingOAuthOnboardingPort({enabled=false,connection}){
  const methods=["getAuthenticationKind","getProtectedResource","captureIdentityScope","request","supportsIdentityOnlyHttps"];
  if(enabled!==true||methods.some(name=>typeof connection?.[name]!=="function")||await connection.getAuthenticationKind()!=="oauth"||await connection.supportsIdentityOnlyHttps()!==true)
    return Object.freeze({getOwnOnboardingCapabilities:async()=>({metadataRead:false,ownWork:false,credentialKind:"unsupported"})});
  const audience=await connection.getProtectedResource();platformAudience(audience);const check=await connection.captureIdentityScope();if(typeof check!=="function")fail("identity_scope_unavailable");
  const guard=async()=>{if(await check()!==true||await connection.getAuthenticationKind()!=="oauth"||await connection.getProtectedResource()!==audience||await connection.supportsIdentityOnlyHttps()!==true)fail("identity_changed");return true;};
  let contract;
  const request=async(href,payload)=>{await guard();const response=await connection.request({method:"POST",href,headers:{"content-type":"application/json",accept:"application/json"},body:JSON.stringify(payload),redirect:"manual",maximumResponseBytes:1048576,timeoutMs:15000});
    await guard();if(response.url&&response.url!==href)fail("origin_mismatch");const parsed=await jsonResponse(response);await guard();return parsed;};
  const read=async()=>{const reply=await request(audience,metadataBody());if(reply.status!==200)fail("authentication_required");contract=parseOnboardingMetadata(reply.body,audience);return structuredClone(contract.descriptor);};
  return Object.freeze({getOwnOnboardingCapabilities:async()=>{await guard();return{metadataRead:true,ownWork:true,credentialKind:"oauth"};},getProtectedResource:async()=>{await guard();return audience;},captureIdentityScope:async()=>guard,
    readOwnOnboardingContract:read,
    async invokeOwnOnboardingOperation({operationId,payload,contractFingerprint}){
      await read();if(contract.fingerprint!==contractFingerprint)fail("contract_changed");const row=[...contract.operations.values()].find(row=>row.operation_id===operationId);
      if(!row||!row.input(payload))fail("invalid_payload");return request(row.uri,payload);
    }});
}

// Concrete Muse custody is an existing identity API-key file. It supports only
// fixed authenticated metadata. An operator/model flag cannot promote it to OAuth.
export async function createCustomerOnboardingMetadataHost({enabled=false,root,credentialPath,protectedResource,taskIntent,lifetimeMs=900000,assertCurrent,assertSourceCurrent,fetchImpl=fetch}){
  if(enabled!==true)return Object.freeze({enabled:false});
  const audience=platformAudience(protectedResource);
  if(typeof assertCurrent!=="function"||typeof assertSourceCurrent!=="function"||typeof taskIntent!=="string"||!taskIntent.trim()||Buffer.byteLength(taskIntent)>4000||!Number.isSafeInteger(lifetimeMs)||lifetimeMs<1000||lifetimeMs>900000)fail("invalid_host_binding");
  await privateDirectory(root);const first=await protectedRead(credentialPath,{maximum:4096});let secret=first.bytes.toString("utf8").trim();first.bytes.fill(0);
  if(!secret||/[\s\p{Cc}\p{Cf}]/u.test(secret))fail("invalid_credential");const identity=first.identity,fingerprint=hash(secret),controller=new AbortController();
  const opaque=()=>randomBytes(24).toString("hex"),binding=Object.freeze({registrationRef:opaque(),generation:randomUUID(),taskRef:opaque(),pendingWorkRef:opaque()});
  const record=join(root,binding.registrationRef+".json");let retired=false;
  const retire=async()=>{if(retired)return;retired=true;secret="";controller.abort();await atomicPrivateJson(record,{version:1,...binding,mode:"onboarding",status:"retired"});};
  const guard=async()=>{try{if(retired||await assertCurrent(binding)!==true||await assertSourceCurrent()!==true)fail("identity_changed");const now=await protectedRead(credentialPath,{maximum:4096});
    const same=now.identity===identity&&hash(now.bytes.toString("utf8").trim())===fingerprint;now.bytes.fill(0);if(!same)fail("identity_changed");return true;
  }catch{await retire();fail("identity_changed");}};
  const discover=async()=>{await guard();let reply;try{reply=await fetchImpl(audience.href,{method:"POST",redirect:"manual",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),
    headers:{authorization:`Bearer ${secret}`,"content-type":"application/json",accept:"application/json"},body:JSON.stringify(metadataBody())});}catch{fail("metadata_unavailable");}
    await guard();if(reply.url&&reply.url!==audience.href)fail("origin_mismatch");const value=await jsonResponse(reply);if(value.status!==200)fail("authentication_required");const contract=parseOnboardingMetadata(value.body,audience.href);await guard();
    return{descriptor:structuredClone(contract.descriptor),host:{metadataRead:true,ownWork:false,credentialKind:"api_key"},account:"not_evaluated",reason:"eligible_existing_oauth_host_required"};};
  await atomicPrivateJson(record,{version:1,...binding,mode:"onboarding",status:"active"},{replace:false});
  const timer=setTimeout(()=>{void retire().catch(()=>{});},lifetimeMs);timer.unref?.();
  const unavailable=async()=>{await guard();return{available:false,reason:"eligible_existing_oauth_host_required"};};
  return Object.freeze({enabled:true,mode:"onboarding",binding,ownWork:false,assertCurrent:guard,discover,
    getOwnOnboardingCapabilities:async()=>{await guard();return{metadataRead:true,ownWork:false,credentialKind:"api_key"};},getProtectedResource:async()=>{await guard();return audience.href;},captureIdentityScope:async()=>guard,
    readOwnOnboardingContract:async()=>(await discover()).descriptor,invokeOwnOnboardingOperation:unavailable,
    readOwn:unavailable,presentOwn:unavailable,actOwn:unavailable,stateOwn:unavailable,
    async poll(){await guard();return{pending:false,wakeEligible:false,...binding};},readPending:discover,
    async run(){if(!controller.signal.aborted)await new Promise(resolve=>controller.signal.addEventListener("abort",resolve,{once:true}));},
    async retire(){clearTimeout(timer);await retire();}});
}

// A genuine existing OAuth owner can supply its opaque port to the protected
// task bridge. Default CLI/API-key mode never manufactures that port.
export async function createCustomerOnboardingOAuthHost({enabled=false,connection,root,taskIntent,lifetimeMs=900000,assertCurrent,assertSourceCurrent}){
  if(enabled!==true)return Object.freeze({enabled:false});
  if(typeof assertCurrent!=="function"||typeof assertSourceCurrent!=="function"||typeof taskIntent!=="string"||!taskIntent.trim()||!Number.isSafeInteger(lifetimeMs)||lifetimeMs<1000||lifetimeMs>900000)fail("invalid_host_binding");
  await privateDirectory(root);const opaque=()=>randomBytes(24).toString("hex"),binding={registrationRef:opaque(),generation:randomUUID(),taskRef:opaque(),pendingWorkRef:opaque()},controller=new AbortController();let retired=false;
  if(await assertCurrent(binding)!==true||await assertSourceCurrent()!==true)fail("identity_changed");
  const port=await createExistingOAuthOnboardingPort({enabled,connection}),client=await createCustomerOnboarding({host:port});if(!client.available)fail("eligible_existing_oauth_host_required");
  if(await assertCurrent(binding)!==true||await assertSourceCurrent()!==true){client.retire();fail("identity_changed");}
  const record=join(root,binding.registrationRef+".json");
  const retire=async()=>{if(retired)return;retired=true;client.retire();controller.abort();await atomicPrivateJson(record,{version:1,...binding,mode:"onboarding",status:"retired"});};
  const guard=async()=>{try{if(retired||await assertCurrent(binding)!==true||await assertSourceCurrent()!==true)fail("identity_changed");const check=await port.captureIdentityScope();await check();return true;}catch{await retire();fail("identity_changed");}};
  await atomicPrivateJson(record,{version:1,...binding,mode:"onboarding",status:"active"},{replace:false});const timer=setTimeout(()=>{void retire().catch(()=>{});},lifetimeMs);timer.unref?.();
  const invoke=fn=>async(...args)=>{await guard();const result=await fn(...args);await guard();return result;};
  return Object.freeze({enabled:true,mode:"onboarding",ownWork:true,binding,assertCurrent:guard,discover:invoke(async()=>({descriptor:await port.readOwnOnboardingContract(),account:"evaluated_on_request"})),
    readOwn:invoke(payload=>client.read(payload)),presentOwn:invoke(ref=>client.present(ref)),actOwn:invoke((payload,confirmation)=>client.act(payload,confirmation)),stateOwn:invoke(ref=>client.state(ref)),
    async poll(){await guard();return{pending:false,wakeEligible:false,...binding};},
    async run(){if(!controller.signal.aborted)await new Promise(resolve=>controller.signal.addEventListener("abort",resolve,{once:true}));},
    async retire(){clearTimeout(timer);await retire();}});
}
