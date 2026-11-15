import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import {mkdtemp,writeFile,readFile,readdir,rm,mkdir,chmod,rename} from "node:fs/promises";
import {join} from "node:path";
import {setTimeout as delay} from "node:timers/promises";
import {execFileSync} from "node:child_process";
import {createServer,request} from "node:https";
import {WebSocketServer} from "ws";
import test from "node:test";
import WebSocket from "../source/host-runtime/bos-journey-notifications/vendor/ws.bundle.mjs";
import {openFeedbackSocket} from "../source/host-runtime/bos-journey-notifications/feedback-socket.mjs";
import {createFeedbackDiscussionHost} from "../source/host-runtime/bos-journey-notifications/feedback-discussion-host.mjs";
import {createCompanionBridge,callCompanion} from "../source/host-runtime/bos-journey-notifications/muse-companion-host.mjs";
import {FeedbackDiscussionTransportError} from "../source/platform/submit-feedback/scripts/item-discussion.mjs";

const project=new URL("../",import.meta.url).pathname;
const secret="synthetic-existing-bos-key",context="bos_ctx_v2_"+"4".repeat(64),item="item_demo";
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const closed=properties=>({type:"object",additionalProperties:false,required:Object.keys(properties),properties});
const str={type:"string"};
function descriptor(origin="https://service.example.invalid"){
  const event={type:"object",additionalProperties:false,required:["event_id"],properties:{event_id:str,body:str,actor_id:str}};
  const detail=closed({feedback_id:str,comments:{type:"array"},history:{type:"array"},comments_total:{type:"integer"},history_total:{type:"integer"},comments_next_cursor:{type:["string","null"]},history_next_cursor:{type:["string","null"]}});
  return {describe_uri:origin+"/api/v1/feedback/describe",operations:[
    {operation_id:"feedback.get",method:"POST",uri:origin+"/synthetic/current-read",effect:"read",
      input_schema:{type:"object",additionalProperties:false,required:["feedback_id"],properties:{feedback_id:{const:item},page_size:{type:"integer",minimum:1,maximum:100},comments_before:{type:["string","null"]},history_before:{type:["string","null"]}}},
      output_schema:{$defs:{detail},oneOf:[closed({result:{$ref:"#/$defs/detail"}})]}},
    {operation_id:"comments.create",method:"POST",uri:origin+"/synthetic/comment",effect:"record"}],
    discussion:{uri_template:origin.replace("https:","wss:")+"/synthetic/socket/{feedback_id}",authentication:"existing_bearer_and_context_headers",
      supported_host:"native_header_capable_websocket",headers:["Authorization","X-BOS-Context-Handle"],
      input_schema:{oneOf:[{type:"object",additionalProperties:false,required:["type"],properties:{type:{const:"subscribe"},cursor:str}},
        {type:"object",additionalProperties:false,required:["type","body"],properties:{type:{const:"comment"},body:{type:"string",minLength:1,maxLength:4000},parent_comment_id:{type:["string","null"]}}}]},
      output_schema:{oneOf:[closed({type:{const:"journal"},feedback_id:str,cursor:str,comments:{type:"array",items:event},history:{type:"array",items:event},earlier_history:{type:"boolean"}}),
        closed({type:{const:"ack"},operation:{const:"comments.create"},feedback_id:str,status:{const:"committed"}}),
        closed({type:{const:"gap"},feedback_id:str,cursor:str,recovery_operation:{const:"feedback.get"}}),
        closed({type:{const:"reconnect"},cursor:str}),closed({type:{const:"pong"}})]},
      limits:{max_frame_bytes:16384,page_size:50,max_delivery_bytes:1048576,max_connection_seconds:1,max_commands:120}}
  };
}
const journal=(cursor,events=[{event_id:id(1)}])=>({type:"journal",feedback_id:item,cursor,comments:events,history:[],earlier_history:false});
const detail=()=>({feedback_id:item,comments:[],history:[],comments_total:0,history_total:0,comments_next_cursor:null,history_next_cursor:null});
const until=async predicate=>{for(let n=0;n<300;n++){if(await predicate())return;await delay(10);}throw Error("Synthetic host condition timed out");};
async function directory(t){await mkdir(join(project,"Vault/tmp"),{recursive:true});const root=await mkdtemp(join(project,"Vault/tmp/fh-"));
  return root;}
async function fixture(t,options={}){
  const root=await directory(t),credential=join(root,"credential");await writeFile(credential,secret,{mode:0o600});
  let current=true,source=true,denied=false,dropAck=false;const discovery=descriptor(),frames=[],sockets=[],requests=[],sends=[];
  const fetchImpl=async(url,request)=>{
    requests.push({url,request});assert.equal(request.headers.authorization,`Bearer ${secret}`);assert.equal(request.headers["X-BOS-Context-Handle"],context);
    assert.equal(request.redirect,"manual");
    if(denied)return new Response("{}",{status:403,headers:{"content-type":"application/json"}});
    if(url===discovery.describe_uri){assert.equal(request.method,"GET");return Response.json(discovery);}
    assert.equal(url,discovery.operations[0].uri);assert.equal(request.method,"POST");
    assert.equal(JSON.parse(request.body).feedback_id,item);
    return Response.json({result:options.page?.(JSON.parse(request.body))??detail()});
  };
  const socketFactory=async value=>{
    assert.equal(value.url,"wss://service.example.invalid/synthetic/socket/item_demo");
    assert.equal(value.headers.Authorization,`Bearer ${secret}`);assert.equal(value.headers["X-BOS-Context-Handle"],context);
    sockets.push(value);frames.push(journal("opaque_position"));
    return {send:async text=>{const frame=JSON.parse(text);sends.push(frame);if(frame.type==="comment"){
      if(!dropAck)frames.push({type:"ack",operation:"comments.create",feedback_id:item,status:"committed"});
      frames.push(journal("opaque_next",[{event_id:id(2),body:frame.body}]));}},close:async()=>{},
      messages:(async function*(){while(!value.signal.aborted){if(frames.length){const frame=frames.shift();if(frame instanceof Error)throw frame;yield JSON.stringify(frame);}else await delay(5);}})()};
  };
  const host=await createFeedbackDiscussionHost({enabled:true,root,credentialPath:credential,origin:"https://service.example.invalid",contextHandle:context,
    discovery,itemRef:item,taskIntent:"Continue this synthetic registered discussion",lifetimeMs:30000,assertCurrent:async()=>current,
    assertSourceCurrent:async()=>source,fetchImpl,socketFactory});
  let running;t.after(async()=>{try{await host.retire();await running?.catch(()=>{});}finally{await rm(root,{recursive:true,force:true});}});
  return{root,credential,host,frames,sockets,requests,sends,discovery,
    async start(){running=host.run();void running.catch(()=>{});await until(async()=>{try{return(await host.poll()).pending;}catch{return false;}});},
    revoke:()=>{current=false;},replaceSource:()=>{source=false;},deny:()=>{denied=true;},loseAck:()=>{dropAck=true;}};
}

test("feedback mode remains disabled by default without touching credentials or network",async()=>{
  assert.deepEqual(await createFeedbackDiscussionHost({}),{enabled:false});
});
test("host queue and fixed task ticket preserve later events, canonical reads and committed comments",async t=>{
  const f=await fixture(t);await f.start();const bridge=await createCompanionBridge({root:f.root,host:f.host});t.after(()=>bridge.close());
  const first=await callCompanion(bridge.controlPath,"read");assert.equal(first.deliveries.length,1);assert.equal(first.item.feedback_id,item);
  assert.equal((await callCompanion(bridge.controlPath,"poll")).pending,false);
  assert.equal((await callCompanion(bridge.controlPath,"comment",{comment:{body:"Synthetic client reply"}})).status,"awaiting_commit");
  await until(()=>f.host.commentStatus().status==="committed");
  assert.equal((await callCompanion(bridge.controlPath,"ack",{ticket:first.deliveries[0].ticket,accepted:true})).acknowledged,true);
  await until(async()=>(await f.host.poll()).pending);
  const second=await callCompanion(bridge.controlPath,"read");assert.equal(second.deliveries.length,1);assert.equal(second.deliveries[0].event.event_id,id(2));
  assert.equal(second.comment_status,"committed");assert.equal(await f.host.acknowledge(first.deliveries[0].ticket),false);
  assert.equal(await f.host.acknowledge(second.deliveries[0].ticket),true);
  assert.equal((await f.host.poll()).pending,false);
  await assert.rejects(callCompanion(bridge.controlPath,"comment",{comment:{body:"invalid",uri:"https://example.invalid"}}));
  await assert.rejects(callCompanion(bridge.controlPath,"read",{binding:{...f.host.binding,taskRef:"another_task"}}));
});
test("credential/content/inode/mode, scope and source changes retire without persisting credentials",async t=>{
  for(const kind of ["credential","inode","mode","scope","source"]){await t.test(kind,async t=>{
    const f=await fixture(t);await f.start();
    if(kind==="credential")await writeFile(f.credential,"synthetic-changed-key");
    if(kind==="inode"){await rename(f.credential,f.credential+".old");await writeFile(f.credential,secret,{mode:0o600});}
    if(kind==="mode")await chmod(f.credential,0o644);
    if(kind==="scope")f.revoke();if(kind==="source")f.replaceSource();
    await assert.rejects(f.host.assertCurrent());
    const inspect=async path=>{for(const name of await readdir(path,{withFileTypes:true})){
      const child=join(path,name.name);if(name.isDirectory())await inspect(child);else if(!name.name.startsWith("credential")){
        const bytes=await readFile(child,"utf8");assert(!bytes.includes(secret));assert(!bytes.includes(context));}}};await inspect(f.root);
    const records=(await readdir(f.root)).filter(name=>name.endsWith(".json"));assert(records.length>0);
  });}
});
test("server denial, descriptor replacement, queue tampering and cross-item journals fail closed",async t=>{
  for(const kind of ["denied","discovery","queue","item"]){await t.test(kind,async t=>{
    const f=await fixture(t);await f.start();
    if(kind==="denied"){f.deny();await assert.rejects(f.host.readPending());}
    if(kind==="discovery"){f.discovery.discussion.limits.max_commands=119;
      f.frames.push({type:"reconnect",cursor:"hint"});await until(async()=>{try{await f.host.assertCurrent();return false;}catch{return true;}});}
    if(kind==="queue"){const directory=(await readdir(f.root)).find(name=>name.startsWith("q-"));const path=join(f.root,directory,"pending.json");
      const value=JSON.parse(await readFile(path));value.state.cursor="tampered";await writeFile(path,JSON.stringify(value));await assert.rejects(f.host.poll());}
    if(kind==="item"){f.frames.push({...journal("foreign"),feedback_id:"other_item"});await until(async()=>{try{await f.host.poll();return false;}catch{return true;}});}
  });}
});
test("gap recovery uses separate advertised HTTP paging cursors and retains worker work",async t=>{
  const page=request=>({...detail(),comments_next_cursor:request.comments_before?null:id(90),history_next_cursor:request.history_before?null:id(91)});
  const f=await fixture(t,{page});await f.start();f.frames.push({type:"gap",feedback_id:item,cursor:"opaque_socket_cursor",recovery_operation:"feedback.get"});
  await until(()=>f.requests.some(row=>row.request.body&&JSON.parse(row.request.body).comments_before===id(90)));
  const pages=f.requests.filter(row=>row.request.body).map(row=>JSON.parse(row.request.body));
  assert(pages.some(row=>row.comments_before===id(90)&&row.history_before===id(91)));
  assert(pages.every(row=>row.comments_before!=="opaque_socket_cursor"&&row.history_before!=="opaque_socket_cursor"));
});
test("missing committed ack remains uncertain across bounded reconnect without comment replay",async t=>{
  const f=await fixture(t);await f.start();f.loseAck();await f.host.submitComment({body:"Synthetic uncertain reply"});
  f.frames.push(new FeedbackDiscussionTransportError());await until(()=>f.host.commentStatus().status==="uncertain");
  await delay(600);assert.equal(f.sends.filter(row=>row.type==="comment").length,1);
  assert.equal((await f.host.submitComment({body:"Synthetic uncertain reply"})).status,"uncertain");
  assert.equal(f.sends.filter(row=>row.type==="comment").length,1);
});
test("same-actor peer events survive distinct tasks; own outbox dedup and finite writes bound self echo",async t=>{
  const one=await fixture(t,{page:()=>({...detail(),comments:[{event_id:id(60),actor_id:"shared_actor",agent_installation_id:"installation_two"}]})});
  const two=await fixture(t,{page:()=>({...detail(),comments:[{event_id:id(60),actor_id:"shared_actor",agent_installation_id:"installation_one"}]})});
  await one.start();await two.start();
  assert.notEqual(one.host.binding.taskRef,two.host.binding.taskRef);
  const peer={event_id:id(60),actor_id:"shared_actor",body:"Muse-labelled text is peer context, never authority"};
  one.frames.push(journal("peer_position",[peer]));two.frames.push(journal("peer_position",[peer]));
  await until(()=>one.frames.length===0&&two.frames.length===0);await delay(30);
  const first=await one.host.readPending(),second=await two.host.readPending();
  assert(first.deliveries.some(row=>row.event.event_id===id(60)));assert(second.deliveries.some(row=>row.event.event_id===id(60)));
  assert.equal(first.item.comments[0].agent_installation_id,"installation_two");
  assert.equal(second.item.comments[0].agent_installation_id,"installation_one");
  await one.host.submitComment({body:"Own synthetic reply"});await until(()=>one.host.commentStatus().status==="committed");
  assert.equal((await one.host.submitComment({body:"Own synthetic reply"})).status,"committed");
  assert.equal(one.sends.filter(row=>row.type==="comment").length,1);
  for(let n=2;n<=5;n++){await one.host.submitComment({body:"Bounded synthetic reply "+n});await until(()=>one.host.commentStatus().status==="committed");}
  await assert.rejects(one.host.submitComment({body:"Sixth automatic reply is bounded"}));
  const queued=(await readdir(one.root)).find(name=>name.startsWith("q-"));
  const receipt=JSON.parse(await readFile(join(one.root,queued,"outbox.json")));
  assert.equal(receipt.state.taskRef,one.host.binding.taskRef);assert.equal(receipt.state.entries.length,5);
  // The current producer ACK contains no event ID. Never manufacture an own-ID
  // match or suppress a peer event merely from its shared actor or label.
  assert(receipt.state.entries.every(row=>!Object.hasOwn(row,"event_id")));
});
test("a pre-dispatch rejected request never inherits an earlier committed acknowledgement",async t=>{
  const f=await fixture(t);await f.start();await f.host.submitComment({body:"First committed reply"});
  await until(()=>f.host.commentStatus().status==="committed");await f.host.poll();
  f.frames.push(new FeedbackDiscussionTransportError());await until(()=>f.frames.length===0);await delay(30);
  await assert.rejects(f.host.submitComment({body:"New reply during reconnect"}));await f.host.poll();
  const q=(await readdir(f.root)).find(name=>name.startsWith("q-"));const receipt=JSON.parse(await readFile(join(f.root,q,"outbox.json")));
  assert.equal(receipt.state.entries[0].status,"committed");assert.equal(receipt.state.entries[1].status,"not_submitted");
  assert.equal(f.sends.filter(row=>row.type==="comment").length,1);
});

class FakeSocket extends EventEmitter{
  static latest;
  constructor(url,protocols,options){super();Object.assign(this,{url,protocols,options});FakeSocket.latest=this;queueMicrotask(()=>this.emit("open"));}
  send(text,options,callback){this.sent={text,options};callback();}
  terminate(){this.emit("close",1006);}
}
test("socket wrapper enforces TLS/origin/header confinement, text-only delivery and terminal access loss",async()=>{
  const controller=new AbortController(),args={url:"wss://service.example.invalid/item",origin:"https://service.example.invalid",
    headers:{Authorization:"Bearer synthetic", "X-BOS-Context-Handle":context},signal:controller.signal,maxPayload:1024,guard:async()=>true,Socket:FakeSocket};
  const channel=await openFeedbackSocket(args),socket=FakeSocket.latest;
  assert.equal(socket.options.followRedirects,false);assert.equal(socket.options.perMessageDeflate,false);assert.equal(socket.options.rejectUnauthorized,true);
  assert.deepEqual(socket.protocols,[]);assert.equal(socket.options.headers["X-BOS-Context-Handle"],context);
  socket.emit("message",Buffer.from('{"type":"pong"}'),false);assert.equal((await channel.messages.next()).value,'{"type":"pong"}');
  socket.emit("message",Buffer.from("binary"),true);await assert.rejects(channel.messages.next());await channel.close();
  const terminal=await openFeedbackSocket(args);FakeSocket.latest.emit("message",Buffer.from("undelivered"),false);FakeSocket.latest.emit("close",1008);
  await assert.rejects(terminal.messages.next());
  for(const url of ["ws://service.example.invalid/item","wss://other.example.invalid/item","wss://user:password@service.example.invalid/item","wss://service.example.invalid/item?token=x"]){
    await assert.rejects(openFeedbackSocket({...args,url}));
  }
});

test("actual bundled WebSocket loopback covers authenticated handshake, journal, canonical ACK and fixed private worker",async t=>{
  const root=await directory(t),keyPath=join(root,"key.pem"),certPath=join(root,"cert.pem");
  execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-days","1","-subj","/CN=synthetic.example.invalid",
    "-addext","subjectAltName=IP:127.0.0.1","-keyout",keyPath,"-out",certPath],{stdio:"ignore"});
  const key=await readFile(keyPath),cert=await readFile(certPath);let discovery,origin;const canonicalComments=[];let handshake=false,firstSubscribe=false;
  const server=createServer({key,cert},async(req,res)=>{
    assert.equal(req.headers.authorization,`Bearer ${secret}`);assert.equal(req.headers["x-bos-context-handle"],context);
    let result;if(req.url==="/api/v1/feedback/describe")result=discovery;else{
      assert.equal(req.method,"POST");assert.equal(req.url,"/synthetic/current-read");let text="";for await(const chunk of req)text+=chunk;
      assert.equal(JSON.parse(text).feedback_id,item);result={result:{...detail(),comments:canonicalComments,comments_total:canonicalComments.length}};
    }
    res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(result));
  });
  const wsServer=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
  server.on("upgrade",(req,socket,head)=>{
    assert.equal(req.url,"/synthetic/socket/item_demo");assert.equal(req.headers.authorization,`Bearer ${secret}`);
    assert.equal(req.headers["x-bos-context-handle"],context);assert.equal(req.headers["sec-websocket-protocol"],undefined);handshake=true;
    wsServer.handleUpgrade(req,socket,head,ws=>{
      ws.on("message",(bytes,binary)=>{assert.equal(binary,false);const frame=JSON.parse(bytes);
        if(!firstSubscribe){assert.deepEqual(frame,{type:"subscribe"});firstSubscribe=true;ws.send(JSON.stringify(journal("loopback_position")));}
        else{assert.equal(frame.type,"comment");canonicalComments.push({event_id:id(2),body:frame.body});
          ws.send(JSON.stringify({type:"ack",operation:"comments.create",feedback_id:item,status:"committed"}));
          ws.send(JSON.stringify(journal("loopback_next",canonicalComments)));}
      });
    });
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));origin=`https://127.0.0.1:${server.address().port}`;discovery=descriptor(origin);discovery.discussion.limits.max_connection_seconds=5;
  t.after(async()=>{for(const client of wsServer.clients)client.terminate();await new Promise(resolve=>wsServer.close(resolve));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const credential=join(root,"credential");await writeFile(credential,secret,{mode:0o600});
  const fetchImpl=(url,options)=>new Promise((resolve,reject)=>{const req=request(url,{method:options.method,headers:options.headers,ca:cert,signal:options.signal},async res=>{
    const chunks=[];for await(const chunk of res)chunks.push(chunk);resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers}));});req.on("error",reject);req.end(options.body);});
  class TrustedLoopbackSocket extends WebSocket{constructor(url,protocols,options){super(url,protocols,{...options,ca:cert});}}
  const host=await createFeedbackDiscussionHost({enabled:true,root,credentialPath:credential,origin,contextHandle:context,discovery,itemRef:item,
    taskIntent:"Continue this synthetic loopback discussion",lifetimeMs:10000,assertCurrent:async()=>true,fetchImpl,
    socketFactory:options=>openFeedbackSocket({...options,Socket:TrustedLoopbackSocket})});
  const running=host.run();void running.catch(()=>{});const bridge=await createCompanionBridge({root,host});
  t.after(async()=>{try{await host.retire();await running.catch(()=>{});await bridge.close();}finally{await rm(root,{recursive:true,force:true});}});
  await until(async()=>(await host.poll()).pending);assert(handshake&&firstSubscribe);
  const first=await callCompanion(bridge.controlPath,"read");
  assert.equal((await callCompanion(bridge.controlPath,"comment",{comment:{body:"Loopback synthetic reply"}})).status,"awaiting_commit");
  await until(()=>host.commentStatus().status==="committed");assert.equal(canonicalComments.length,1);
  assert.equal((await callCompanion(bridge.controlPath,"ack",{ticket:first.deliveries[0].ticket,accepted:true})).acknowledged,true);
  await until(async()=>(await host.poll()).pending);const second=await callCompanion(bridge.controlPath,"read");
  assert.equal(second.comment_status,"committed");assert.equal(second.item.comments.length,1);
  assert.equal(await host.acknowledge(second.deliveries[0].ticket),true);
  await host.retire();await running.catch(()=>{});await assert.rejects(host.poll());
});
