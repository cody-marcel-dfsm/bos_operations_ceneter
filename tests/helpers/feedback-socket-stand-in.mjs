// Repository-owned synthetic stand-in for the BOS feedback-item WebSocket. It is not
// BOS: it proves client protocol behavior only, never live service availability.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {execFileSync} from "node:child_process";
import {createServer} from "node:https";
import {WebSocketServer} from "ws";

export const secret="synthetic-subscriber-bearer",context="bos_ctx_v2_"+"5".repeat(64),item="FB-2026-000000000001";
export const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;

// BOC-authored consumer fixture in the shape the current producer advertises:
// rolling max_commands_per_minute, no connection deadline and no lifetime cap.
export function currentDescriptor(origin){
  const text={type:"string"},cursor={type:"string",maxLength:160,pattern:"^fj1:FB-[0-9]{4}-[0-9]{6,}:[0-9]{1,12}:[0-9]{1,12}$"};
  const feedback={type:"string",pattern:"^FB-[0-9]{4}-[0-9]{6,}$"};
  const closed=(properties,required)=>({type:"object",additionalProperties:false,properties,required});
  const frame=(kind,properties={},required=[])=>closed({type:{const:kind},...properties},["type",...required]);
  const event=closed(Object.fromEntries(["event_id","body","parent_comment_id","author_type","author_label","actor_id","occurred_at","status","assigned_to","resolution"]
    .map(key=>[key,{type:["string","null"],maxLength:16000}])),["event_id"]);
  const events={type:"array",maxItems:50,items:event};
  const detail={type:"object",required:["feedback_id","comments","history"],properties:{feedback_id:text,comments:{type:"array"},history:{type:"array"},
    comments_next_cursor:{type:["string","null"]},history_next_cursor:{type:["string","null"]}}};
  return {describe_uri:origin+"/api/v1/feedback/describe",operations:[
    {operation_id:"feedback.get",method:"POST",uri:origin+"/api/v1/feedback/get",effect:"read",
      input_schema:{type:"object",additionalProperties:false,required:["feedback_id"],properties:{feedback_id:feedback,page_size:{type:"integer",minimum:1,maximum:100},
        comments_before:{type:["string","null"]},history_before:{type:["string","null"]}}},
      output_schema:{type:"object",required:["result"],properties:{result:detail}}},
    {operation_id:"comments.create",method:"POST",uri:origin+"/api/v1/feedback/comments",effect:"record"}],
    discussion:{uri_template:origin.replace("https://","wss://")+"/api/v1/feedback/items/{feedback_id}/ws",
      authentication:"existing_bearer_and_context_headers",headers:["Authorization","X-BOS-Context-Handle"],
      supported_host:"native_header_capable_websocket",input_frames:["subscribe","comment","ping"],
      output_frames:["journal","ack","pong","gap","error","reconnect"],
      input_schema:{oneOf:[frame("subscribe",{cursor}),frame("comment",{body:{type:"string",minLength:1,maxLength:4000},
        parent_comment_id:{anyOf:[{type:"string",format:"uuid"},{type:"null"}]}},["body"]),frame("ping")]},
      output_schema:{oneOf:[frame("journal",{feedback_id:feedback,cursor,comments:events,history:events,earlier_history:{type:"boolean"}},["feedback_id","cursor","comments","history","earlier_history"]),
        frame("ack",{operation:{const:"comments.create"},feedback_id:feedback,status:{const:"committed"}},["operation","feedback_id","status"]),
        frame("pong"),frame("gap",{feedback_id:feedback,cursor,recovery_operation:{const:"feedback.get"}},["feedback_id","cursor","recovery_operation"]),
        frame("error",{code:{enum:["authentication_required","authorization_denied","context_required","invalid_request","rate_limited","conflict","service_unavailable"]}},["code"]),
        frame("reconnect",{cursor},["cursor"])]},
      cursor:"fj1:<feedback_id>:<comments_count>:<history_count>; opaque non-authority checkpoint",
      recovery:"feedback.get; page earlier comments/history through returned cursors",
      limits:{max_frame_bytes:16384,page_size:50,subscribe_seconds:10,max_commands_per_minute:120,max_connections_per_process:32,
        max_delivery_bytes:1048576,max_connections_per_actor:4,max_connections_per_context:2,read_seconds:15,send_seconds:10},
      close_codes:{complete:1000,invalid_or_access_lost:1008,unavailable:1011},
      authority:"current item read and comments.create; no lifecycle authority"}};
}

// Stand-in service: commits comments into an append-only journal and pushes the
// delta to every subscriber on commit; subscribe resumes from an exact cursor.
export async function standIn(t,root){
  const keyPath=join(root,"key.pem"),certPath=join(root,"cert.pem");
  execFileSync("openssl",["req","-x509","-newkey","rsa:2048","-nodes","-days","1","-subj","/CN=synthetic.example.invalid",
    "-addext","subjectAltName=IP:127.0.0.1","-keyout",keyPath,"-out",certPath],{stdio:"ignore"});
  const key=await readFile(keyPath),cert=await readFile(certPath);
  const s={comments:[],history:[],subscribes:[],received:[],httpReads:0,describeReads:0,sockets:new Set(),authorized:true,descriptor:null,cert};
  const cursorOf=()=>`fj1:${item}:${s.comments.length}:${s.history.length}`;
  const page=(from)=>({type:"journal",feedback_id:item,cursor:cursorOf(),comments:s.comments.slice(from[0]),history:s.history.slice(from[1]),earlier_history:false});
  const server=createServer({key,cert},async(req,res)=>{
    assert.equal(req.headers.authorization,`Bearer ${secret}`);assert.equal(req.headers["x-bos-context-handle"],context);
    if(!s.authorized){res.writeHead(403,{"content-type":"application/json"});res.end("{}");return;}
    let result;if(req.url==="/api/v1/feedback/describe"){s.describeReads++;result=s.descriptor;}
    else{s.httpReads++;let body="";for await(const chunk of req)body+=chunk;assert.equal(JSON.parse(body).feedback_id,item);
      result={result:{feedback_id:item,comments:s.comments,history:s.history,comments_next_cursor:null,history_next_cursor:null}};}
    res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify(result));
  });
  const wss=new WebSocketServer({noServer:true,maxPayload:16384,perMessageDeflate:false});
  server.on("upgrade",(req,socket,head)=>{
    assert.equal(req.url,`/api/v1/feedback/items/${item}/ws`);assert.equal(req.headers.authorization,`Bearer ${secret}`);
    assert.equal(req.headers["x-bos-context-handle"],context);assert(!req.url.includes(secret)&&!req.url.includes(context));
    wss.handleUpgrade(req,socket,head,ws=>{
      s.sockets.add(ws);ws.on("close",()=>s.sockets.delete(ws));ws.position=null;
      ws.on("message",bytes=>{const frame=JSON.parse(bytes);s.received.push(frame);
        if(frame.type==="subscribe"){s.subscribes.push(frame.cursor??null);
          const from=frame.cursor?frame.cursor.split(":").slice(2).map(Number):[Math.max(0,s.comments.length-50),Math.max(0,s.history.length-50)];
          ws.position=true;ws.send(JSON.stringify(page(from)));}
        else if(frame.type==="comment"){s.comment(frame.body,"reporter");ws.send(JSON.stringify({type:"ack",operation:"comments.create",feedback_id:item,status:"committed"}));}
        else if(frame.type==="ping")ws.send(JSON.stringify({type:"pong"}));
      });
    });
  });
  // Commit-driven push: every subscribed socket receives exactly the new delta.
  s.comment=(body,author_type="agent")=>{const before=[s.comments.length,s.history.length];
    s.comments.push({event_id:id(1000+s.comments.length),body,author_type,occurred_at:"2026-11-16T00:00:00Z"});
    for(const ws of s.sockets)if(ws.position)ws.send(JSON.stringify(page(before)));};
  s.closeAll=code=>{for(const ws of s.sockets)ws.close(code);};
  s.dropAll=()=>{for(const ws of s.sockets)ws.terminate();};
  s.sendAll=frame=>{for(const ws of s.sockets)ws.send(JSON.stringify(frame));};
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  s.origin=`https://127.0.0.1:${server.address().port}`;s.descriptor=currentDescriptor(s.origin);
  t.after(async()=>{for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  return s;
}

