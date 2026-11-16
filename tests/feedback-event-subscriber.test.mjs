// Protocol tests for the Claude Code event-wake subscriber. The service side is a
// repository-owned TLS WebSocket stand-in (synthetic, not BOS): it proves client
// protocol behavior only, never live service availability or native host wake.
import assert from "node:assert/strict";
import {mkdtemp,writeFile,readFile,rm,mkdir,readdir} from "node:fs/promises";
import {join} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {execFileSync} from "node:child_process";
import {cp,realpath} from "node:fs/promises";
import {request} from "node:https";
import {spawn} from "node:child_process";
import test from "node:test";
import WebSocket from "../source/host-runtime/bos-journey-notifications/vendor/ws.bundle.mjs";
import {openFeedbackSocket} from "../source/host-runtime/bos-journey-notifications/feedback-socket.mjs";
import {createFeedbackDiscussionHost} from "../source/host-runtime/bos-journey-notifications/feedback-discussion-host.mjs";
import {createCompanionBridge,callCompanion} from "../source/host-runtime/bos-journey-notifications/muse-companion-host.mjs";
import {createEventWakeWriter,hostSubscriberCapabilities} from "../source/host-runtime/bos-journey-notifications/event-wake-subscriber.mjs";
import {installNotificationHost,recordNotificationHook} from "../scripts/install-notification-host.mjs";
import {NotificationHostError} from "../source/host-runtime/bos-journey-notifications/protected-files.mjs";
import {secret,context,item,id,standIn} from "./helpers/feedback-socket-stand-in.mjs";

const project=new URL("../",import.meta.url).pathname;
const until=async(predicate,limit=600)=>{for(let n=0;n<limit;n++){if(await predicate())return;await delay(10);}throw Error("Synthetic subscriber condition timed out");};

async function subscriber(t,options={}){
  await mkdir(join(project,"Vault/tmp"),{recursive:true});const root=await mkdtemp(join(project,"Vault/tmp/fs-"));
  const s=await standIn(t,root),credential=join(root,"credential");await writeFile(credential,secret,{mode:0o600});
  const fetchImpl=(url,init)=>new Promise((resolve,reject)=>{const req=request(url,{method:init.method,headers:init.headers,ca:s.cert,signal:init.signal},async res=>{
    const chunks=[];for await(const chunk of res)chunks.push(chunk);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers}));});req.on("error",reject);req.end(init.body);});
  class TrustedLoopbackSocket extends WebSocket{constructor(url,protocols,init){super(url,protocols,{...init,ca:s.cert});}}
  let current=true,output="",writer;const lines=()=>output.split("\n").filter(Boolean).map(line=>JSON.parse(line));
  const host=await createFeedbackDiscussionHost({enabled:true,root,credentialPath:credential,origin:s.origin,contextHandle:context,
    discovery:structuredClone(s.descriptor),itemRef:item,taskIntent:"Continue the synthetic subscriber discussion",lifetimeMs:options.lifetimeMs??60000,
    assertCurrent:async()=>current,fetchImpl,custodyIntervalMs:0,policy:options.policy,
    socketFactory:init=>openFeedbackSocket({...init,Socket:TrustedLoopbackSocket}),
    onQueueCommitted:state=>writer.committed(state),onDiscussionStopped:value=>writer.stopped(value.reason,value.code)});
  const bridge=await createCompanionBridge({root,host});
  writer=createEventWakeWriter({binding:host.binding,controlPath:bridge.controlPath,write:text=>{output+=text;}});writer.started();
  // Mirrors discussion-subscribe: the retirement reason, when one exists, names the terminal line.
  const running=host.run().catch(()=>{}).then(()=>writer.stopped(host.retirementReason()??"failed"));
  t.after(async()=>{try{await host.retire();await running;await bridge.close();}finally{await rm(root,{recursive:true,force:true});}});
  return{s,host,bridge,root,credential,lines,output:()=>output,running,revoke:()=>{current=false;}};
}

test("host capability states are truthful: Claude Code stdout wake, Codex missing facility",()=>{
  assert.equal(hostSubscriberCapabilities.claude_code.available,true);
  assert.equal(hostSubscriberCapabilities.claude_code.native_wake_proven,false);
  assert.equal(hostSubscriberCapabilities.claude_code.bounded_watch,true);
  assert.equal(hostSubscriberCapabilities.claude_code.long_lived_plugin_monitor,false);
  assert.equal(hostSubscriberCapabilities.codex.available,false);
  assert.match(hostSubscriberCapabilities.codex.missing_facility,/background/u);
});

test("current producer descriptor: one ready line, then exactly one line per pushed committed event",async t=>{
  const f=await subscriber(t);f.s.comment("existing history before subscribe");
  await until(()=>f.lines().some(line=>line.type==="ready"));
  const ready=f.lines().find(line=>line.type==="ready");
  assert.equal(ready.pending,1);assert.equal(ready.cursor,`fj1:${item}:1:0`);
  f.s.comment("first pushed event");f.s.comment("second pushed event");
  await until(()=>f.lines().filter(line=>line.type==="event").length===2);
  const events=f.lines().filter(line=>line.type==="event");
  assert.deepEqual(events.map(line=>line.event_id),[id(1001),id(1002)]);
  assert.equal(events.at(-1).cursor,`fj1:${item}:3:0`);
  for(const line of f.lines()){assert.equal(line.kind,"bos.feedback.subscriber");assert.equal(line.registration_ref,f.host.binding.registrationRef);}
  assert(!f.output().includes(secret)&&!f.output().includes(context)&&!f.output().includes("pushed event"),"no credential, handle or body on stdout");
  assert.equal(f.s.subscribes.length,1);
});

test("worker reads and acknowledges through the existing control bridge; acks never re-emit",async t=>{
  const f=await subscriber(t);await until(()=>f.s.subscribes.length===1);
  await until(()=>f.lines().some(line=>line.type==="ready"));f.s.comment("needs the agent");
  f.s.comment("second");await until(()=>f.lines().filter(line=>line.type==="event").length===2);
  const read=await callCompanion(f.bridge.controlPath,"read");assert.equal(read.deliveries.length,2);
  for(const delivery of read.deliveries)assert.equal((await callCompanion(f.bridge.controlPath,"ack",{ticket:delivery.ticket,accepted:true})).acknowledged,true);
  await delay(50);assert.equal(f.lines().filter(line=>line.type==="event").length,2);
  assert.equal((await callCompanion(f.bridge.controlPath,"poll")).pending,false);
});

test("idle subscription performs no reads, sends or describe polls",async t=>{
  const f=await subscriber(t);await until(()=>f.lines().some(line=>line.type==="ready")||f.s.subscribes.length===1);
  f.s.comment("wake once");await until(()=>f.lines().some(line=>line.type==="ready"));
  const snapshot={received:f.s.received.length,reads:f.s.httpReads,describes:f.s.describeReads};
  await delay(6500);
  assert.deepEqual({received:f.s.received.length,reads:f.s.httpReads,describes:f.s.describeReads},snapshot);
});

test("one long-lived connection carries more than 120 mixed frames with no reconnect or duplicate wake",async t=>{
  const f=await subscriber(t,{policy:{maxConnections:3,maxPending:500}});
  f.s.comment("baseline");await until(()=>f.lines().some(line=>line.type==="ready"));
  for(let n=0;n<5;n++){await f.host.submitComment({body:"own "+n});await until(()=>f.host.commentStatus().status==="committed");
    for(let m=0;m<25;m++)f.s.comment(`peer ${n}.${m}`);
    // Advance the next write only after this real pushed batch is durably
    // committed. ACK latency must not include the previous batch's backlog.
    await until(()=>f.lines().filter(line=>line.type==="event").length===(n+1)*26);
    assert.equal(f.lines().filter(line=>line.type==="event").at(-1).cursor,`fj1:${item}:${1+(n+1)*26}:0`);
  }
  await until(()=>f.lines().filter(line=>line.type==="event").length===130,1500);
  const events=f.lines().filter(line=>line.type==="event");
  assert.equal(new Set(events.map(line=>line.event_id)).size,130,"no duplicate wake");
  assert.equal(events.at(-1).cursor,`fj1:${item}:131:0`);
  assert.equal(f.s.subscribes.length,1,"no reconnect");
  assert.equal(f.s.received.filter(frame=>frame.type==="comment").length,5);
});

test("transport drop and server reconnect frame resume from the committed cursor without duplicate lines",async t=>{
  const f=await subscriber(t);f.s.comment("baseline");await until(()=>f.lines().some(line=>line.type==="ready"));
  f.s.comment("before drop");await until(()=>f.lines().filter(line=>line.type==="event").length===1);
  f.s.dropAll();await until(()=>f.s.subscribes.length===2);
  assert.equal(f.s.subscribes[1],`fj1:${item}:2:0`);
  f.s.comment("after drop");await until(()=>f.lines().filter(line=>line.type==="event").length===2);
  f.s.sendAll({type:"reconnect",cursor:`fj1:${item}:3:0`});await until(()=>f.s.subscribes.length===3);
  assert.equal(f.s.subscribes[2],`fj1:${item}:3:0`);
  f.s.comment("after reconnect frame");await until(()=>f.lines().filter(line=>line.type==="event").length===3);
  const ids=f.lines().filter(line=>line.type==="event").map(line=>line.event_id);assert.equal(new Set(ids).size,3);
});

test("access loss close 1008 and non-retryable error stop with one terminal line and no reconnect",async t=>{
  for(const kind of ["close","error"]){await t.test(kind,async t=>{
    const f=await subscriber(t);f.s.comment("baseline");await until(()=>f.lines().some(line=>line.type==="ready"));
    if(kind==="close")f.s.closeAll(1008);else f.s.sendAll({type:"error",code:"authorization_denied"});
    await until(()=>f.lines().some(line=>line.type==="stopped"));
    const stopped=f.lines().filter(line=>line.type==="stopped");assert.equal(stopped.length,1);assert.equal(stopped[0].reason,"stopped");
    if(kind==="error")assert.equal(stopped[0].code,"authorization_denied");
    await delay(300);assert.equal(f.s.subscribes.length,1);
  });}
});

test("revocation, credential change and registration lifetime end retire with a terminal reason",async t=>{
  await t.test("revocation",async t=>{const f=await subscriber(t);f.s.comment("b");await until(()=>f.lines().some(line=>line.type==="ready"));
    f.revoke();f.s.comment("after revocation");await until(()=>f.lines().some(line=>line.type==="stopped"));
    assert.equal(f.lines().filter(line=>line.type==="event").length,0);
    assert.equal(f.lines().find(line=>line.type==="stopped").reason,"authority_ended");});
  await t.test("credential",async t=>{const f=await subscriber(t);f.s.comment("b");await until(()=>f.lines().some(line=>line.type==="ready"));
    await writeFile(f.credential,"synthetic-rotated-bearer");f.s.comment("after rotation");
    await until(()=>f.lines().some(line=>line.type==="stopped"));assert.equal(f.lines().filter(line=>line.type==="event").length,0);
    assert.equal(f.lines().find(line=>line.type==="stopped").reason,"authority_ended");
    assert(!f.output().includes("synthetic-rotated-bearer"));});
  await t.test("lifetime",async t=>{const f=await subscriber(t,{lifetimeMs:1500});
    await until(()=>f.lines().some(line=>line.type==="stopped"),400);
    assert.equal(f.lines().find(line=>line.type==="stopped").reason,"lifetime_ended");});
});

const git=(root,...args)=>execFileSync("git",["-C",root,"-c","user.name=Synthetic installer","-c","user.email=installer@example.invalid",...args],{encoding:"utf8",stdio:["ignore","pipe","pipe"]}).trim();
test("installed discussion-subscribe: subscriber mode plans no hook and its stdout wakes once per committed event",async t=>{
  await mkdir(join(project,"Vault/tmp"),{recursive:true});
  const temporary=await realpath(await mkdtemp(join(project,"Vault/tmp/fi-")));t.after(()=>rm(temporary,{recursive:true,force:true}));
  // Keep the installed host directly under Vault/tmp: CI checkout prefixes can
  // otherwise exceed the protected bridge's portable Unix socket path limit.
  const root=await realpath(await mkdtemp(join(project,"Vault/tmp/h")));t.after(()=>rm(root,{recursive:true,force:true}));
  assert(Buffer.byteLength(join(root,"run","0".repeat(16)))<=103,"Installed subscriber fixture requires a compact private socket root");
  const source=join(temporary,"source");await mkdir(source,{mode:0o700});
  for(const name of ["source/host-runtime/bos-journey-notifications","source/host-runtime/bos-shared-cache","source/platform/bos-workflow-orchestrator/scripts",
    "source/platform/bos-app-discovery/scripts","source/platform/bos-external-dependency-adapter/scripts","source/platform/submit-feedback/scripts","source/platform/ada/scripts"]){
    await mkdir(join(source,name,".."),{recursive:true});await cp(join(project,name),join(source,name),{recursive:true});}
  await mkdir(join(source,"scripts"),{mode:0o700});
  await cp(join(project,"scripts/install-notification-host.mjs"),join(source,"scripts/install-notification-host.mjs"));
  await writeFile(join(source,"package.json"),JSON.stringify({name:"synthetic-host-fixture",version:"0.4.204",type:"module"}));
  git(source,"init","--initial-branch=main");git(source,"add",".");git(source,"commit","-m","Synthetic source fixture");
  const revision=git(source,"rev-parse","HEAD");git(source,"update-ref","refs/remotes/origin/main",revision);
  const install=await installNotificationHost({sourceRoot:source,root,revision,mode:"subscriber"});
  assert.equal(install.native_hook_installed,false);assert.equal(install.hook_definition_plan,undefined);
  assert.equal(install.subscriber_plan.wake,"stdout_line_per_committed_event");assert.equal(install.subscriber_plan.native_hook,null);
  assert.deepEqual(install.subscriber_plan.argv.slice(2,4),["discussion-subscribe","--root"]);
  assert.match(install.subscriber_plan.prompt,/worker-read/u);assert.match(install.subscriber_plan.prompt,/worker-comment/u);
  assert.equal(JSON.parse(await readFile(join(root,"active.json"))).hook,null);
  await assert.rejects(recordNotificationHook({root,observation:{id:"synthetic-hook",enabled:true,version:1,script_path:"x",observed_at:new Date().toISOString(),
    poll_interval_secs:5,script_timeout_secs:60,prompt:install.subscriber_plan.prompt,delivery:{surface:"main"}}}),NotificationHostError);
  const s=await standIn(t,temporary),credential=join(temporary,"credential");await writeFile(credential,secret,{mode:0o600});
  const caPath=join(temporary,"cert.pem");
  const cli=install.subscriber_plan.argv[1];
  const child=spawn(process.execPath,[cli,"discussion-subscribe","--root",root,"--credential-file",credential],
    {stdio:["pipe","pipe","pipe"],env:{...process.env,NODE_EXTRA_CA_CERTS:caPath}});
  let stdout="",stderr="";child.stdout.on("data",data=>{stdout+=data;});child.stderr.on("data",data=>{stderr+=data;});
  const done=new Promise(resolve=>child.on("close",resolve));t.after(()=>child.kill());
  child.stdin.end(JSON.stringify({origin:s.origin,contextHandle:context,discovery:s.descriptor,itemRef:item,
    taskIntent:"Continue the synthetic installed subscriber discussion",lifetimeMs:60000,intentConfirmed:true}));
  const lines=()=>stdout.split("\n").filter(Boolean).map(line=>JSON.parse(line));
  await until(()=>lines().some(line=>line.type==="ready"),1000).catch(error=>{throw new Error(error.message+": "+stderr);});
  const started=lines()[0];assert.equal(started.type,"started");assert.equal(started.wake,"stdout_line_per_committed_event");
  s.comment("installed wake one");s.comment("installed wake two");
  await until(()=>lines().filter(line=>line.type==="event").length===2);
  const read=await callCompanion(started.control_path,"read");assert.equal(read.deliveries.length,2);
  assert.equal((await callCompanion(started.control_path,"retire")).retired,true);
  assert.equal(await done,0,stderr);
  const stopped=lines().filter(line=>line.type==="stopped");assert.equal(stopped.length,1);assert.equal(stopped[0].reason,"retired");
  assert(!stdout.includes(secret)&&!stdout.includes(context)&&!stdout.includes("installed wake"));
  assert(!stderr.includes(secret)&&!stderr.includes(context));
});
