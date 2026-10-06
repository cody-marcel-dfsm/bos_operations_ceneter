import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import {runReviewerModel} from '../scripts/marketplace-reviewer-model.mjs';

function host({servers=[],unexpected=false,failure,failureMethod='error',stall=false,stallAt,toolName='test_capability',toolArguments={query:'business'}}={}) {
  const messages=[],child=new EventEmitter();let killCount=0;child.stdout=new PassThrough();child.kill=()=>{killCount++;};
  const reply=value=>queueMicrotask(()=>child.stdout.write(JSON.stringify(value)+'\n'));
  child.stdin=new Writable({write(chunk,encoding,done){
    const message=JSON.parse(chunk.toString());messages.push(message);
    if(stallAt&&message.method===stallAt){done();return;}
    if(message.method==='initialize')reply({id:message.id,result:{}});
    if(message.method==='mcpServerStatus/list')reply({id:message.id,result:{data:servers,nextCursor:null}});
    if(message.method==='thread/start')reply({id:message.id,result:{thread:{id:'isolated'}}});
    if(message.method==='turn/start'){
      reply({id:message.id,result:{}});
      if(failure)reply({method:failureMethod,params:{threadId:'isolated',willRetry:false,error:{message:failure},turn:{status:'failed',error:{message:failure}}}});
      else if(stall){}
      else if(unexpected)reply({method:'item/completed',params:{threadId:'isolated',item:{type:'mcpToolCall'}}});
      else reply({id:'tool-request',method:'item/tool/call',params:{threadId:'isolated',tool:toolName,arguments:toolArguments,callId:'call',turnId:'turn'}});
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
test('optional attempt callback records known and rejected unknown capabilities before lookup without arguments',async()=>{
  for(const name of ['test_capability','bos_unknown_operation']) {
    const fake=host({toolName:name,toolArguments:{token:'private-payload'}}),attempts=[];let calls=0;
    const result=await runReviewerModel({prompt:'exact',directory:'/tmp',serverInventory:[],spawnImpl:fake.spawnImpl,
      onToolRequest:async receipt=>{assert.equal(calls,0);attempts.push(receipt);},
      tools:{definitions:[tool],call:async()=>{calls++;return {};}}});
    assert.deepEqual(attempts,[{server:'reviewer-test-host',tool:name,host_rejected:name!==tool.name}]);
    assert.doesNotMatch(JSON.stringify(attempts),/private-payload|token|arguments/);
    assert.equal(calls,name===tool.name?1:0);
    assert.equal(result.nativeTools.length,name===tool.name?1:0);
    assert.equal(result.result.status,'completed');
    if(name!==tool.name)assert.equal(fake.messages.find(row=>row.id==='tool-request').result.success,false);
  }
});
test('unknown requests preserve legacy rejection behavior when callback is omitted',async()=>{
  const fake=host({toolName:'bos_unknown_operation'});let calls=0;
  const result=await runReviewerModel({prompt:'exact',directory:'/tmp',serverInventory:[],spawnImpl:fake.spawnImpl,
    tools:{definitions:[tool],call:async()=>{calls++;return {};}}});
  assert.equal(calls,0);assert.deepEqual(result.nativeTools,[]);
  assert.equal(fake.messages.find(row=>row.id==='tool-request').result.success,false);
});
test('isolated host forwards the exact prompt and configured description, and executes dynamic functions',async()=>{
  const fake=host(),prompt='Use this exact configured prompt.\nKeep punctuation!',description='Configured product description';let calls=0;
  const result=await runReviewerModel({prompt,instructions:description,directory:'/tmp',serverInventory:[{name:'saved',transport:{url:'https://example.invalid/mcp'}}],spawnImpl:fake.spawnImpl,tools:{definitions:[tool],call:async(name,args)=>{assert.equal(name,tool.name);assert.deepEqual(args,{query:'business'});calls++;return {count:1};}}});
  assert.equal(calls,1);assert.equal(result.result.answer,'observed');
  assert.equal(fake.messages.find(row=>row.method==='turn/start').params.input[0].text,prompt);
  const thread=fake.messages.find(row=>row.method==='thread/start').params;
  assert.equal(thread.developerInstructions,description);assert.equal(thread.ephemeral,true);assert.deepEqual(thread.selectedCapabilityRoots,[]);
  assert.ok(fake.argv.includes('mcp_servers.saved={url="https://example.invalid/mcp",enabled=false}'));
});

test('model timeout diagnostics distinguish blocked initialization and waiting turns without changing failure or cleanup',async()=>{
 for(const [options,phase] of [[{stallAt:'initialize'},'initialize'],[{stall:true},'turn_running']]){
  const fake=host(options);
  await assert.rejects(runReviewerModel({prompt:'private prompt sentinel',instructions:'Bearer private-token',directory:'/tmp',timeout:15,serverInventory:[],spawnImpl:fake.spawnImpl,tools:{definitions:[],call:async()=>({})}}),error=>{
   assert.equal(error.message,'reviewer_model_timeout');
   const d=error.reviewer_diagnostics;
   assert.equal(d.phase,phase);assert.equal(d.pending_tool,null);assert.equal(d.completed_tool_calls,0);
   assert.ok(d.elapsed_ms>=10);assert.ok(d.phase_elapsed_ms>=0);
   assert.doesNotMatch(JSON.stringify(d),/private prompt|private-token|Bearer/);
   return true;
  });
  assert.ok(fake.killCount>=2);
 }
});

test('pending dynamic control diagnostics preserve only known tool and control tokens',async()=>{
 for(const [name,operation,expectedTool,expectedControl] of [
  ['bos_control_discover','api.contract.get','bos_control_discover','api.contract.get'],
  ['bos_control_discover','private-control-sentinel','bos_control_discover',undefined],
  ['private-tool-sentinel','plugins.list','unrecognized_tool',undefined]
 ]){
  const fake=host({toolName:name,toolArguments:{operation,arguments:{context_handle:'private-context-sentinel',token:'private-token-sentinel'}}});
  await assert.rejects(runReviewerModel({prompt:'exact',directory:'/tmp',timeout:15,serverInventory:[],spawnImpl:fake.spawnImpl,
   tools:{definitions:[{...tool,name}],call:()=>new Promise(()=>{})}}),error=>{
    const d=error.reviewer_diagnostics;
    assert.equal(error.message,'reviewer_model_timeout');assert.equal(d.phase,'tool_handler');
    assert.equal(d.pending_tool,expectedTool);assert.equal(d.pending_control_operation,expectedControl);
    assert.ok(d.pending_tool_elapsed_ms>=0);assert.equal(d.completed_tool_calls,0);
    assert.doesNotMatch(JSON.stringify(d),/private-control|private-tool|private-context|private-token/);return true;
   });
 }
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
 await assert.rejects(runReviewerModel({prompt:'Complete the full inventory.',directory:'/tmp',timeout:10,serverInventory:[],spawnImpl:fake.spawnImpl,tools:{definitions:[],call:async()=>({})}}),/reviewer_model_timeout/);
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
