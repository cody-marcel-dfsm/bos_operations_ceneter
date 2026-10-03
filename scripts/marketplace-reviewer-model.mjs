import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';

// Dynamic functions execute in this maintainer host. The isolated LLM has no
// configured MCP connection, shell, browser, filesystem or credential access.
export async function runReviewerModel({prompt,model,directory,instructions,tools,timeout=300000,spawnImpl=spawn,serverInventory}) {
  const inventory=serverInventory??JSON.parse((await promisify(execFile)('codex',['mcp','list','--json'])).stdout);
  const disabled=inventory.flatMap(row=>{
    if(!/^[A-Za-z0-9_-]+$/.test(row.name))throw new Error('reviewer_saved_connection_not_isolated');
    const transport=row.transport?.url?`url=${JSON.stringify(row.transport.url)}`:'command="/usr/bin/false"';
    return ['-c',`mcp_servers.${row.name}={${transport},enabled=false}`];
  });
  const child=spawnImpl('codex',['app-server','--disable','shell_tool','--disable','unified_exec','--disable','multi_agent','--disable','apps','--disable','plugins','--disable','remote_plugin','--disable','in_app_browser','-c','mcp_servers={}',...disabled,'-c','web_search="disabled"'],{stdio:['pipe','pipe','ignore']});
  let id=0,threadId=null,answer='',finished=false;
  const pending=new Map(),nativeTools=[];
  let resolveTurn,rejectTurn;
  const completed=new Promise((resolve,reject)=>{resolveTurn=resolve;rejectTurn=reject;});
  // Attach an early handler while initialize/thread requests are still pending.
  completed.catch(()=>{});
  const send=message=>child.stdin.write(JSON.stringify(message)+'\n');
  const request=(method,params)=>new Promise((resolve,reject)=>{const current=++id;pending.set(current,{resolve,reject});send({jsonrpc:'2.0',id:current,method,params});});
  const fail=()=>{if(finished)return;finished=true;for(const waiter of pending.values())waiter.reject(new Error('reviewer_model_failed'));pending.clear();rejectTurn(new Error('reviewer_model_failed'));};
  const timer=setTimeout(()=>{fail();child.kill('SIGTERM');},timeout);
  child.on('error',fail);child.on('close',()=>{if(!finished)fail();});
  const lines=createInterface({input:child.stdout});
  let handling=Promise.resolve();
  lines.on('line',line=>{
    let message;try{message=JSON.parse(line);}catch{return;}
    if(message.id!==undefined&&!message.method){const waiter=pending.get(message.id);if(!waiter)return;pending.delete(message.id);if(message.error)waiter.reject(new Error('reviewer_model_request_failed'));else waiter.resolve(message.result);return;}
    if(message.method==='item/tool/call'&&message.id!==undefined){
      handling=handling.then(async()=>{
        const params=message.params;
        if(params.threadId!==threadId||!tools.definitions.some(tool=>tool.name===params.tool)){
          send({jsonrpc:'2.0',id:message.id,result:{success:false,contentItems:[{type:'inputText',text:'Unknown test capability'}]}});return;
        }
        nativeTools.push({server:params.tool.startsWith('acceptance_')?'Acceptance':'reviewer-test-host',tool:params.tool});
        let value;try{const args=typeof params.arguments==='string'?JSON.parse(params.arguments):params.arguments;value=await tools.call(params.tool,args??{});}catch{value={isError:true,reason:'reviewer_tool_failed'};}
        send({jsonrpc:'2.0',id:message.id,result:{success:value.isError!==true,contentItems:[{type:'inputText',text:JSON.stringify(value)}]}});
      }).catch(fail);return;
    }
    if(message.id!==undefined){send({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Unsupported test-host request'}});fail();return;}
    if(message.method==='item/completed'&&message.params?.threadId===threadId){
      const item=message.params.item;if(item?.type==='agentMessage')answer=item.text??answer;
      if(['commandExecution','mcpToolCall','webSearch','fileChange'].includes(item?.type))fail();
    }
    if(message.method==='turn/completed'&&message.params?.threadId===threadId){
      if(message.params.turn?.status!=='completed')fail();else{finished=true;resolveTurn();}
    }
    if(message.method==='error'&&message.params?.willRetry!==true)fail();
  });
  try {
    await request('initialize',{clientInfo:{name:'marketplace-reviewer-integration',version:'1'},capabilities:{experimentalApi:true}});
    send({jsonrpc:'2.0',method:'initialized'});
    const servers=await request('mcpServerStatus/list',{});
    const disabledNames=new Set(inventory.map(row=>row.name));
    if(!Array.isArray(servers.data)||servers.nextCursor!==null||servers.data.some(row=>!disabledNames.has(row.name)||row.runtimeStatus!==null||Object.keys(row.tools??{}).length||row.resources?.length||row.resourceTemplates?.length))throw new Error('reviewer_saved_connection_not_isolated');
    const thread=await request('thread/start',{model,cwd:directory,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',developerInstructions:instructions,dynamicTools:tools.definitions,environments:[],selectedCapabilityRoots:[]});
    threadId=thread.thread.id;
    await request('turn/start',{threadId,input:[{type:'text',text:prompt,text_elements:[]}],outputSchema:{type:'object',additionalProperties:false,properties:{answer:{type:'string'},status:{type:'string',enum:['completed','blocked']},reason:{type:'string'}},required:['answer','status','reason']}});
    await completed;await handling;
    const result=JSON.parse(answer);if(!result.answer?.trim()||!['completed','blocked'].includes(result.status))throw new Error('reviewer_model_output_invalid');
    return {result,nativeTools};
  }finally{clearTimeout(timer);lines.close();child.stdin.end();child.kill('SIGTERM');}
}
