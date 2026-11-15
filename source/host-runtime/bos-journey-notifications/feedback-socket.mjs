import WebSocket from "./vendor/ws.bundle.mjs";
import {FeedbackDiscussionTransportError} from "../../platform/submit-feedback/scripts/item-discussion.mjs";
import {fail} from "./protected-files.mjs";

// Only a trusted host calls this function. Headers never leave the host process.
export async function openFeedbackSocket({url,headers,origin,signal,maxPayload,guard,Socket=WebSocket}) {
  const target=new URL(url), source=new URL(origin);
  if (source.protocol!=="https:" || source.origin!==origin || target.protocol!=="wss:" || target.host!==source.host ||
      target.username || target.password || target.search || target.hash || typeof guard!=="function" ||
      !Number.isSafeInteger(maxPayload) || maxPayload<1 || maxPayload>1048576 || signal?.aborted) fail();
  await guard();
  const socket=new Socket(target.href,[],{headers,followRedirects:false,perMessageDeflate:false,maxPayload,
    handshakeTimeout:10000,closeTimeout:1000,rejectUnauthorized:true,skipUTF8Validation:false});
  const queue=[];let queuedBytes=0,closed=false,failure=null,notify=()=>{};
  const wake=()=>{const prior=notify;notify=()=>{};prior();};
  const end=error=>{if(closed)return;closed=true;failure=error;socket.terminate();wake();};
  socket.on("error",()=>end(new FeedbackDiscussionTransportError()));
  socket.on("unexpected-response",(_req,response)=>{response.resume();end(response.statusCode===429||response.statusCode===503?new FeedbackDiscussionTransportError():new Error("Socket admission denied"));});
  socket.on("message",(bytes,binary)=>{
    if(binary || bytes.length>maxPayload || queuedBytes+bytes.length>2*maxPayload || queue.length>=100){end(new Error("Invalid bounded discussion frame"));return;}
    queue.push(bytes.toString("utf8"));queuedBytes+=bytes.length;wake();
  });
  socket.on("close",code=>{
    if(closed)return;closed=true;
    if(code===1008){queue.length=0;queuedBytes=0;failure=new Error("Discussion authority ended");}
    else if(code!==1000)failure=new FeedbackDiscussionTransportError();
    wake();
  });
  const abort=()=>end(null);signal?.addEventListener("abort",abort,{once:true});
  try {
    await new Promise((resolve,reject)=>{socket.once("open",resolve);socket.once("error",()=>reject(new FeedbackDiscussionTransportError()));
      socket.once("close",()=>reject(new Error("Discussion closed before ready")));socket.once("unexpected-response",()=>reject(new Error("Discussion admission denied")));});
    await guard();
  } catch(error){signal?.removeEventListener("abort",abort);end(error);throw error;}
  return Object.freeze({
    messages:(async function*(){try{
      while(true){await guard();if(queue.length){const text=queue.shift();queuedBytes-=Buffer.byteLength(text);yield text;continue;}
        if(closed){if(failure)throw failure;return;}await new Promise(resolve=>{notify=resolve;});}
    }finally{signal?.removeEventListener("abort",abort);end(null);}})(),
    async send(text){await guard();if(closed||signal?.aborted||typeof text!=="string"||Buffer.byteLength(text)>16384)fail();
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Discussion send timed out")),10000);timer.unref?.();
        socket.send(text,{binary:false,compress:false},error=>{clearTimeout(timer);error?reject(new FeedbackDiscussionTransportError()):resolve();});});await guard();},
    async close(){signal?.removeEventListener("abort",abort);end(null);}
  });
}
