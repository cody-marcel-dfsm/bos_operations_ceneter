import {reviewerFailureCode,reviewerModelNotificationFailure,reviewerModelDiagnostics,reviewerDiagnosticTool,reviewerDiagnosticControl} from './marketplace-reviewer-diagnostics.mjs';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline';

// Dynamic functions execute in this maintainer host. The isolated LLM has no
// configured MCP connection, shell, browser, filesystem or credential access.
export async function runReviewerModel({prompt,model,directory,instructions,tools,timeout=300000,spawnImpl=spawn,serverInventory,onToolRequest}) {
  const inventory=serverInventory??JSON.parse((await promisify(execFile)('codex',['mcp','list','--json'])).stdout);
  const disabled=inventory.flatMap(row=>{
    if(!/^[A-Za-z0-9_-]+$/.test(row.name))throw new Error('reviewer_saved_connection_not_isolated');
    const transport=row.transport?.url?`url=${JSON.stringify(row.transport.url)}`:'command="/usr/bin/false"';
    return ['-c',`mcp_servers.${row.name}={${transport},enabled=false}`];
  });
  const child=spawnImpl('codex',['app-server','--disable','shell_tool','--disable','unified_exec','--disable','multi_agent','--disable','apps','--disable','plugins','--disable','remote_plugin','--disable','in_app_browser','-c','mcp_servers={}',...disabled,'-c','web_search="disabled"'],{stdio:['pipe','pipe','ignore']});
  let id=0,threadId=null,answer='',finished=false;
  const started=Date.now();let phase='initialize',phaseStarted=started,pendingTool=null,pendingControl=null,toolStarted=0,completedTools=0;
  const durations={};
  const setPhase=value=>{const now=Date.now();durations[phase]=(durations[phase]??0)+Math.max(0,now-phaseStarted);phase=value;phaseStarted=now;};
  const diagnostics=()=>reviewerModelDiagnostics({phase,elapsed_ms:Math.max(0,Date.now()-started),phase_elapsed_ms:Math.max(0,Date.now()-phaseStarted),phase_durations:durations,pending_tool:pendingTool,pending_tool_elapsed_ms:pendingTool?Math.max(0,Date.now()-toolStarted):0,pending_control_operation:pendingControl,completed_tool_calls:completedTools});
  const pending=new Map(),nativeTools=[];
  let resolveTurn,rejectTurn;
  const completed=new Promise((resolve,reject)=>{resolveTurn=resolve;rejectTurn=reject;});
  // Attach an early handler while initialize/thread requests are still pending.
  completed.catch(()=>{});
  const send=message=>child.stdin.write(JSON.stringify(message)+'\n');
  const request=(method,params)=>new Promise((resolve,reject)=>{const current=++id;pending.set(current,{resolve,reject});send({jsonrpc:'2.0',id:current,method,params});});
  const fail=(reason='reviewer_model_failed')=>{if(finished)return;finished=true;const known=reviewerFailureCode({code:reason});const code=known.startsWith('reviewer_model_')?known:'reviewer_model_failed';const error=Object.assign(new Error(code),{reviewer_diagnostics:diagnostics()});for(const waiter of pending.values())waiter.reject(error);pending.clear();rejectTurn(error);};
  const timer=setTimeout(()=>{fail('reviewer_model_timeout');child.kill('SIGTERM');},timeout);
  child.on('error',fail);child.on('close',()=>{if(!finished)fail();});
  const lines=createInterface({input:child.stdout});
  let handling=Promise.resolve();
  lines.on('line',line=>{
    let message;try{message=JSON.parse(line);}catch{return;}
    if(message.id!==undefined&&!message.method){const waiter=pending.get(message.id);if(!waiter)return;pending.delete(message.id);if(message.error)waiter.reject(new Error(reviewerModelNotificationFailure(message,'reviewer_model_request_failed')));else waiter.resolve(message.result);return;}
    if(message.method==='item/tool/call'&&message.id!==undefined){
      handling=handling.then(async()=>{
        const params=message.params;
        // Optional host-owned attempt ledger includes capabilities rejected before execution.
        // Arguments are deliberately omitted to keep private payloads out of this receipt.
        const accepted=params.threadId===threadId&&tools.definitions.some(tool=>tool.name===params.tool);
        if(onToolRequest)await onToolRequest({server:typeof params.tool==='string'&&params.tool.startsWith('acceptance_')?'Acceptance':'reviewer-test-host',tool:params.tool,host_rejected:!accepted});
        if(!accepted){
          send({jsonrpc:'2.0',id:message.id,result:{success:false,contentItems:[{type:'inputText',text:'Unknown test capability'}]}});return;
        }
        nativeTools.push({server:params.tool.startsWith('acceptance_')?'Acceptance':'reviewer-test-host',tool:params.tool});
        setPhase('tool_handler');pendingTool=reviewerDiagnosticTool(params.tool,true);toolStarted=Date.now();pendingControl=null;
        let value;try{const args=typeof params.arguments==='string'?JSON.parse(params.arguments):params.arguments;pendingControl=params.tool==='bos_control_discover'?reviewerDiagnosticControl(args?.operation):null;value=await tools.call(params.tool,args??{});}catch(error){value={isError:true,reason:reviewerFailureCode(error)};}
        completedTools++;pendingTool=null;pendingControl=null;setPhase('turn_running');
        send({jsonrpc:'2.0',id:message.id,result:{success:value.isError!==true,contentItems:[{type:'inputText',text:JSON.stringify(value)}]}});
      }).catch(fail);return;
    }
    if(message.id!==undefined){send({jsonrpc:'2.0',id:message.id,error:{code:-32601,message:'Unsupported test-host request'}});fail();return;}
    if(message.method==='item/completed'&&message.params?.threadId===threadId){
      const item=message.params.item;if(item?.type==='agentMessage')answer=item.text??answer;
      if(['commandExecution','mcpToolCall','webSearch','fileChange'].includes(item?.type))fail();
    }
    if(message.method==='turn/completed'&&message.params?.threadId===threadId){
      if(message.params.turn?.status!=='completed')fail(reviewerModelNotificationFailure(message));else{finished=true;resolveTurn();}
    }
    if(message.method==='error'&&message.params?.willRetry!==true)fail(reviewerModelNotificationFailure(message));
  });
  try {
    await request('initialize',{clientInfo:{name:'marketplace-reviewer-integration',version:'1'},capabilities:{experimentalApi:true}});
    send({jsonrpc:'2.0',method:'initialized'});
    setPhase('server_inventory');
    const servers=await request('mcpServerStatus/list',{});
    const disabledNames=new Set(inventory.map(row=>row.name));
    if(!Array.isArray(servers.data)||servers.nextCursor!==null||servers.data.some(row=>!disabledNames.has(row.name)||row.runtimeStatus!==null||Object.keys(row.tools??{}).length||row.resources?.length||row.resourceTemplates?.length))throw new Error('reviewer_saved_connection_not_isolated');
    setPhase('thread_start');
    const thread=await request('thread/start',{model,cwd:directory,ephemeral:true,approvalPolicy:'never',sandbox:'read-only',developerInstructions:instructions,dynamicTools:tools.definitions,environments:[],selectedCapabilityRoots:[]});
    threadId=thread.thread.id;
    setPhase('turn_start');
    await request('turn/start',{threadId,input:[{type:'text',text:prompt,text_elements:[]}],outputSchema:{type:'object',additionalProperties:false,properties:{answer:{type:'string'},status:{type:'string',enum:['completed','blocked']},reason:{type:'string'}},required:['answer','status','reason']}});
    if(phase==='turn_start')setPhase('turn_running');
    await completed;await handling;
    setPhase('output_parse');
    const result=JSON.parse(answer);if(!result.answer?.trim()||!['completed','blocked'].includes(result.status))throw new Error('reviewer_model_output_invalid');
    return {result,nativeTools};
  }catch(error){if(!error.reviewer_diagnostics)error.reviewer_diagnostics=diagnostics();throw error;}
  finally{clearTimeout(timer);lines.close();child.stdin.end();child.kill('SIGTERM');}
}
