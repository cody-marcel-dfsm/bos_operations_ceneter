import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {runReviewerModel} from '../scripts/marketplace-reviewer-model.mjs';

function host({servers=[],unexpected=false,failure,failureMethod='error',stall=false}={}) {
  const messages=[],child=new EventEmitter();let killCount=0;child.stdout=new PassThrough();child.kill=()=>{killCount++;};
  const reply=value=>queueMicrotask(()=>child.stdout.write(JSON.stringify(value)+'\n'));
  child.stdin=new Writable({write(chunk,encoding,done){
    const message=JSON.parse(chunk.toString());messages.push(message);
    if(message.method==='initialize')reply({id:message.id,result:{}});
    if(message.method==='mcpServerStatus/list')reply({id:message.id,result:{data:servers,nextCursor:null}});
    if(message.method==='thread/start')reply({id:message.id,result:{thread:{id:'isolated'}}});
    if(message.method==='turn/start'){
      reply({id:message.id,result:{}});
      if(failure)reply({method:failureMethod,params:{threadId:'isolated',willRetry:false,error:{message:failure},turn:{status:'failed',error:{message:failure}}}});
      else if(stall){}
      else if(unexpected)reply({method:'item/completed',params:{threadId:'isolated',item:{type:'mcpToolCall'}}});
      else reply({id:'tool-request',method:'item/tool/call',params:{threadId:'isolated',tool:'test_capability',arguments:{query:'business'},callId:'call',turnId:'turn'}});
    }
    if(message.id==='tool-request'){
      reply({method:'item/completed',params:{threadId:'isolated',item:{type:'agentMessage',text:JSON.stringify({answer:'observed',status:'completed',reason:''})}}});
      reply({method:'turn/completed',params:{threadId:'isolated',turn:{status:'completed'}}});
    }
    done();
  }});
  let argv;
  return {messages,get argv(){return argv;},get killCount(){return killCount;},spawnImpl:(command,args)=>{assert.equal(command,'codex');argv=args;return child;}};
}
const tool={type:'function',name:'test_capability',description:'test',inputSchema:{type:'object'}};
test('isolated host forwards the exact prompt and configured description, and executes dynamic functions',async()=>{
  const fake=host(),prompt='Use this exact configured prompt.\nKeep punctuation!',description='Configured product description';let calls=0;
  const result=await runReviewerModel({prompt,instructions:description,directory:'/tmp',serverInventory:[{name:'saved',transport:{url:'https://example.invalid/mcp'}}],spawnImpl:fake.spawnImpl,tools:{definitions:[tool],call:async(name,args)=>{assert.equal(name,tool.name);assert.deepEqual(args,{query:'business'});calls++;return {count:1};}}});
  assert.equal(calls,1);assert.equal(result.result.answer,'observed');
  assert.equal(fake.messages.find(row=>row.method==='turn/start').params.input[0].text,prompt);
  const thread=fake.messages.find(row=>row.method==='thread/start').params;
  assert.equal(thread.developerInstructions,description);assert.equal(thread.ephemeral,true);assert.deepEqual(thread.selectedCapabilityRoots,[]);
  assert.ok(fake.argv.includes('mcp_servers.saved={url="https://example.invalid/mcp",enabled=false}'));
});
test('active inherited MCP capability blocks the model before the prompt is sent',async()=>{
  const fake=host({servers:[{name:'saved',runtimeStatus:'ready',tools:{business:{}}}]});
  await assert.rejects(runReviewerModel({prompt:'exact',directory:'/tmp',serverInventory:[{name:'saved',transport:{url:'https://example.invalid'}}],spawnImpl:fake.spawnImpl,tools:{definitions:[],call:async()=>{}}}),/saved_connection_not_isolated/);
  assert.equal(fake.messages.some(row=>row.method==='turn/start'),false);
});
test('disabled connection metadata with no runtime or tools is allowed without using its grant',async()=>{
  const fake=host({servers:[{name:'saved',runtimeStatus:null,tools:{},resources:[],resourceTemplates:[]}]});
  await runReviewerModel({prompt:'exact',directory:'/tmp',serverInventory:[{name:'saved',transport:{url:'https://example.invalid'}}],spawnImpl:fake.spawnImpl,tools:{definitions:[tool],call:async()=>({count:1})}});
  assert.equal(fake.messages.some(row=>row.method==='mcpServer/tool/call'),false);
});
test('unexpected native MCP execution fails the isolated run',async()=>{
  const fake=host({unexpected:true});
  await assert.rejects(runReviewerModel({prompt:'exact',directory:'/tmp',serverInventory:[],spawnImpl:fake.spawnImpl,tools:{definitions:[],call:async()=>{}}}),/model_failed/);
});

test('an extended reviewer turn still terminates at its supplied bound',async()=>{
 const fake=host({stall:true});
 await assert.rejects(runReviewerModel({prompt:'Complete the full inventory.',directory:'/tmp',timeout:10,serverInventory:[],spawnImpl:fake.spawnImpl,tools:{definitions:[],call:async()=>({})}}),/reviewer_model_failed/);
 assert.ok(fake.killCount>=2);
});


test('upstream model policy, rate and authentication notifications retain only fixed failure categories',async()=>{
 const rows=[['content was flagged; private synthetic detail','reviewer_model_policy_rejection'],['quota exceeded; private synthetic detail','reviewer_model_rate_limit'],['authentication failed; private synthetic detail','reviewer_model_authentication_failure'],['private arbitrary failure','reviewer_model_failed']];
 for(const failureMethod of ['error','turn/completed']) for(const [failure,expected] of rows) {
  const fake=host({failure,failureMethod});let calls=0;
  await assert.rejects(runReviewerModel({prompt:'Exact configured negative prompt',directory:'/tmp',serverInventory:[],spawnImpl:fake.spawnImpl,tools:{definitions:[tool],call:async()=>{calls++;}}}),error=>error.message===expected);
  assert.equal(calls,0);
 }
});
