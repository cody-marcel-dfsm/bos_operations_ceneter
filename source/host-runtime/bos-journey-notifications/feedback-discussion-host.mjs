import {randomBytes,randomUUID,createHmac} from "node:crypto";
import {join} from "node:path";
import Ajv from "../../platform/bos-workflow-orchestrator/scripts/vendor/ajv2020.bundle.mjs";
import {createFeedbackDiscussion} from "../../platform/submit-feedback/scripts/item-discussion.mjs";
import {openFeedbackSocket} from "./feedback-socket.mjs";
import {fail,exact,hash,protectedRead,privateDirectory,atomicPrivateJson} from "./protected-files.mjs";

const opaque=()=>randomBytes(24).toString("hex");
const canonical=value=>JSON.stringify(value&&typeof value==="object"&&!Array.isArray(value)?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(canonical(value[key]))])):value);
const contractFingerprint=value=>hash(canonical({describe_uri:value.describe_uri,discussion:value.discussion,
  operations:value.operations?.filter(row=>["feedback.get","comments.create"].includes(row.operation_id)).sort((a,b)=>a.operation_id<b.operation_id?-1:1)}));
function sameOrigin(uri,origin){const target=new URL(uri,origin);if(target.origin!==origin||target.username||target.password||target.search||target.hash)fail();return target;}
function validator(schema){
  const visit=value=>{if(value&&typeof value==="object")for(const[key,row]of Object.entries(value)){
    if(key==="$ref"&&(typeof row!=="string"||!row.startsWith("#")))fail();visit(row);}};
  visit(schema);return new Ajv({strict:false,validateFormats:false}).compile(schema);
}
async function body(reply){
  if(!reply.body?.[Symbol.asyncIterator]||String(reply.headers?.get?.("content-type")??reply.headers?.["content-type"]).split(";",1)[0]!=="application/json")fail();
  const chunks=[];let size=0;for await(const chunk of reply.body){size+=chunk.length;if(size>1048576)fail();chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function createFeedbackDiscussionHost({enabled=false,root,credentialPath,origin,contextHandle,discovery,itemRef,
  taskIntent,lifetimeMs,assertCurrent,assertSourceCurrent=async()=>true,fetchImpl=fetch,socketFactory=openFeedbackSocket}){
  // Disabled is the default even when this source is present in an installation.
  if(enabled!==true)return Object.freeze({enabled:false});
  if(new URL(origin).origin!==origin||new URL(origin).protocol!=="https:"||!/^bos_ctx_v2_[a-f0-9]{64}$/u.test(contextHandle)||
    typeof itemRef!=="string"||!itemRef||itemRef.length>160||/[\p{Cc}\p{Cf}]/u.test(itemRef)||
    typeof taskIntent!=="string"||!taskIntent.trim()||Buffer.byteLength(taskIntent)>4000||
    !Number.isSafeInteger(lifetimeMs)||lifetimeMs<1000||lifetimeMs>900000||typeof assertCurrent!=="function")fail();
  discovery=structuredClone(discovery);
  const describeUri=sameOrigin(discovery?.describe_uri,origin);
  if(describeUri.pathname!=="/api/v1/feedback/describe")fail();
  await privateDirectory(root);
  const initial=await protectedRead(credentialPath,{maximum:4096});let secret=initial.bytes.toString("utf8").trim();initial.bytes.fill(0);
  if(!secret||/[\s\p{Cc}\p{Cf}]/u.test(secret))fail();
  const credentialIdentity=initial.identity,credentialHash=hash(secret),registrationRef=opaque(),generation=randomUUID();
  const binding=Object.freeze({registrationRef,generation,taskRef:opaque(),pendingWorkRef:opaque()});
  const queueRoot=join(root,"q-"+opaque());await privateDirectory(queueRoot,{create:true});
  const queuePath=join(queueRoot,"pending.json"),outboxPath=join(queueRoot,"outbox.json"),recordPath=join(root,registrationRef+".json");
  const signingKey=randomBytes(32),controller=new AbortController(),tickets=new Map();
  let retired=false,retirement=null,lastRefresh=0,refreshing=null,facade,reading=false,workerLeaseUntil=0,consuming=null,resyncAttested=false;
  const fingerprint=contractFingerprint(discovery);
  const retire=()=>{
    if(retirement)return retirement;retired=true;secret="";signingKey.fill(0);tickets.clear();controller.abort();
    retirement=atomicPrivateJson(recordPath,{version:1,...binding,mode:"feedback",status:"retired"});return retirement;
  };
  const localGuard=async()=>{
    try{
      if(retired||controller.signal.aborted||await assertCurrent(binding)!==true||await assertSourceCurrent()!==true)fail();
      const current=await protectedRead(credentialPath,{maximum:4096});
      const valid=current.identity===credentialIdentity&&hash(current.bytes.toString("utf8").trim())===credentialHash;current.bytes.fill(0);if(!valid)fail();
      return true;
    }catch{await retire();fail();}
  };
  const http=async(uri,method="GET",payload)=>{
    await localGuard();const target=sameOrigin(uri,origin);
    let reply;try{reply=await fetchImpl(target.href,{method,redirect:"manual",signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)]),
      headers:{authorization:`Bearer ${secret}`,"X-BOS-Context-Handle":contextHandle,accept:"application/json","cache-control":"no-store",...(payload===undefined?{}:{"content-type":"application/json"})},
      ...(payload===undefined?{}:{body:JSON.stringify(payload)})});}catch{await retire();fail();}
    await localGuard();if(reply.status!==200||(reply.url&&reply.url!==target.href)){await retire();fail();}return body(reply);
  };
  const refresh=async(force=false)=>{
    await localGuard();if(!force&&Date.now()-lastRefresh<5000)return true;
    if(!refreshing)refreshing=(async()=>{const current=await http(describeUri.href);if(contractFingerprint(current)!==fingerprint){await retire();fail();}lastRefresh=Date.now();return true;})().finally(()=>{refreshing=null;});
    return refreshing;
  };
  await refresh(true);
  const get=discovery.operations?.find(row=>row.operation_id==="feedback.get");
  if(!get||get.method!=="POST"||get.effect!=="read")fail();
  const getUri=sameOrigin(get.uri,origin),validateInput=validator(get.input_schema),validateOutput=validator(get.output_schema);
  // The URI/method/schema come from the re-read authenticated descriptor. There
  // is no generic request dispatcher or caller-selected bridge endpoint.
  const readCurrent=async({allPages=false}={})=>{
    let commentsBefore,historyBefore,first,doneComments=false,doneHistory=false;
    const seenComments=new Set(),seenHistory=new Set();
    for(let page=0;page<(allPages?20:1);page++){
      await refresh();const request={feedback_id:itemRef,page_size:100,...(commentsBefore===undefined?{}:{comments_before:commentsBefore}),...(historyBefore===undefined?{}:{history_before:historyBefore})};
      if(!validateInput(request))fail();const result=await http(getUri.href,get.method,request);
      if(!validateOutput(result)||!result.result||result.result.feedback_id!==itemRef)fail();
      const detail=result.result;if(!first)first=detail;
      if(!Array.isArray(detail.comments)||!Array.isArray(detail.history))fail();
      if(!allPages)return first;
      const nextComments=detail.comments_next_cursor,nextHistory=detail.history_next_cursor;
      const cursor=value=>value===null||typeof value==="string"&&/^[0-9a-f-]{36}$/iu.test(value);
      if(!cursor(nextComments)||!cursor(nextHistory))fail();
      if(!doneComments&&nextComments!==null){if(seenComments.has(nextComments))fail();seenComments.add(nextComments);commentsBefore=nextComments;}else doneComments=true;
      if(!doneHistory&&nextHistory!==null){if(seenHistory.has(nextHistory))fail();seenHistory.add(nextHistory);historyBefore=nextHistory;}else doneHistory=true;
      if(doneComments&&doneHistory)return first;
    }
    fail();
  };
  const initialState={itemRef,taskRef:binding.taskRef,version:0,cursor:null,pending:[],seen:[]};
  const mac=state=>createHmac("sha256",signingKey).update(canonical(state)).digest("hex");
  const outbox=[];
  let outboxOperation=Promise.resolve();
  const saveOutbox=()=>{const operation=outboxOperation.then(async()=>{await localGuard();
    const state={itemRef,taskRef:binding.taskRef,entries:structuredClone(outbox)};await atomicPrivateJson(outboxPath,{state,mac:mac(state)});});
    outboxOperation=operation.catch(()=>{});return operation;};
  const syncOutbox=async()=>{
    const last=outbox.at(-1);if(!last||!facade||!["awaiting_commit","uncertain"].includes(last.status))return;
    const status=facade.commentStatus().status;
    if(["committed","uncertain"].includes(status)&&last.status!==status){last.status=status;await saveOutbox();}
  };
  await atomicPrivateJson(queuePath,{state:initialState,mac:mac(initialState)},{replace:false});
  const load=async()=>{
    try{await localGuard();const envelope=JSON.parse((await protectedRead(queuePath,{maximum:4194304})).bytes.toString("utf8"));
      if(!exact(envelope,["state","mac"])||mac(envelope.state)!==envelope.mac)fail();return envelope.state;
    }catch{await retire();fail();}
  };
  let storageOperation=Promise.resolve();
  const serialized=operation=>{const next=storageOperation.then(operation);storageOperation=next.catch(()=>{});return next;};
  const store={load:()=>serialized(load),commit:(expected,next)=>serialized(async()=>{
    await localGuard();const before=await load();if(before.version!==expected)return false;
    if(next.itemRef!==itemRef||next.taskRef!==binding.taskRef||next.version!==expected+1)fail();
    if(Buffer.byteLength(JSON.stringify({state:next,mac:mac(next)}))>4194304)fail();
    await atomicPrivateJson(queuePath,{state:next,mac:mac(next)});await localGuard();return true;
  })};
  const sameBinding=value=>value.itemRef===itemRef&&value.taskRef===binding.taskRef;
  const host={
    getFeedbackDiscussionCapabilities:async()=>({authenticatedItemSocket:!retired,protectedAtomicQueue:!retired}),
    captureExecutionScope:async()=>async()=>{await refresh();return true;},
    getFeedbackDiscussionStore:async value=>{if(!sameBinding(value))fail();return store;},
    verifyFeedbackDiscussionIntent:async value=>{
      await refresh();if(!sameBinding(value)||contractFingerprint(value.discovery)!==fingerprint)return false;
      if(value.kind==="consume")return consuming!==null&&value.payload?.stream===consuming.stream&&value.payload?.eventId===consuming.eventId;
      if(value.kind==="resync_current_item"){if(!resyncAttested)return false;resyncAttested=false;return true;}
      return ["read","comments.create"].includes(value.kind);
    },
    openAuthenticatedFeedbackDiscussion:async value=>{
      await refresh(true);if(!sameBinding(value)||contractFingerprint(value.discovery)!==fingerprint)fail();
      const template=discovery.discussion.uri_template;
      if(typeof template!=="string"||template.split("{feedback_id}").length!==2)fail();
      const target=new URL(template.replace("{feedback_id}",encodeURIComponent(itemRef)),origin);
      if(!["https:","wss:"].includes(target.protocol)||target.host!==new URL(origin).host||target.username||target.password||target.search||target.hash)fail();target.protocol="wss:";
      return socketFactory({url:target.href,origin,headers:{Authorization:`Bearer ${secret}`,"X-BOS-Context-Handle":contextHandle},
        signal:AbortSignal.any([controller.signal,value.signal]),maxPayload:discovery.discussion.limits.max_delivery_bytes,guard:localGuard});
    }
  };
  facade=await createFeedbackDiscussion({host,discovery,itemRef,taskRef:binding.taskRef,signal:controller.signal});
  if(!facade.available){await retire();fail();}
  await atomicPrivateJson(recordPath,{version:1,...binding,mode:"feedback",status:"active"},{replace:false});
  const timeout=setTimeout(()=>{void retire().catch(()=>{});},lifetimeMs);timeout.unref?.();
  const custodyTimer=setInterval(()=>{void refresh().catch(()=>retire());},Math.min(5000,lifetimeMs));custodyTimer.unref?.();
  return Object.freeze({
    enabled:true,binding,
    assertCurrent:refresh,
    async run(){try{while(!retired){const result=await facade.run();if(result.next==="resync_current_item"){
      await readCurrent({allPages:true});resyncAttested=true;await facade.resumeAfterCurrentRead();continue;}
      if(result.next!=="reconnect"){
        await facade.pending();
        // A bounded connection budget may end before the registration lifetime.
        // Keep queued work available to the already admitted native worker.
        await new Promise(resolve=>{if(controller.signal.aborted)resolve();else controller.signal.addEventListener("abort",resolve,{once:true});});break;}
      await new Promise(resolve=>{const finish=()=>{clearTimeout(timer);controller.signal.removeEventListener("abort",finish);resolve();};
        const timer=setTimeout(finish,result.delayMs);controller.signal.addEventListener("abort",finish,{once:true});if(controller.signal.aborted)finish();});}
      }catch{await retire();fail();}},
    async poll(){await refresh();await syncOutbox();return{pending:!reading&&(await facade.pending()).length>0,wakeEligible:!reading&&Date.now()>=workerLeaseUntil,...binding};},
    async readPending(){await refresh();if(reading||Date.now()<workerLeaseUntil)fail();reading=true;
      try{const item=await readCurrent(),pending=(await facade.pending()).slice(0,4);await syncOutbox();tickets.clear();
        const deliveries=pending.map(row=>{const ticket=opaque();tickets.set(ticket,{stream:row.stream,eventId:row.event.event_id});return{...row,ticket};});
        workerLeaseUntil=Date.now()+35000;return{...binding,taskIntent,item,deliveries,comment_status:facade.commentStatus().status,outbox:structuredClone(outbox)};}finally{reading=false;}},
    async acknowledge(ticket){await refresh();const accepted=tickets.get(ticket);if(!accepted)return false;
      consuming=accepted;try{await facade.acknowledge(accepted);tickets.delete(ticket);if(!tickets.size)workerLeaseUntil=0;return true;}finally{consuming=null;}},
    async submitComment(value){
      await readCurrent();await syncOutbox();
      const prior=outbox.find(row=>row.status!=="not_submitted"&&row.body===value.body&&(row.parent_comment_id??null)===(value.parent_comment_id??null));
      if(prior)return{status:prior.status};
      // No same-actor event suppression: two installations may share an actor.
      // This task-local exact outbox check and finite write budget bound echoes.
      if(outbox.length>=5||!["none","committed"].includes(facade.commentStatus().status))fail();
      const entry={requestRef:opaque(),body:value.body,...(value.parent_comment_id===undefined?{}:{parent_comment_id:value.parent_comment_id}),status:"prepared"};
      outbox.push(entry);await saveOutbox();
      try{const result=await facade.submitComment(value);entry.status=result.status;await saveOutbox();return result;}
      catch{entry.status=["awaiting_commit","uncertain"].includes(facade.commentStatus().status)?"uncertain":"not_submitted";if(!retired)await saveOutbox();fail();}
    },
    commentStatus:()=>facade.commentStatus(),
    async retire(){clearTimeout(timeout);clearInterval(custodyTimer);if(!retired)await syncOutbox();await retire();}
  });
}
