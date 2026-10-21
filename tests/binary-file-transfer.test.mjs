import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createBosExternalDependencyAdapter, readDiscoveredHttpResponse} from '../source/platform/bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs';
import {validateOperationDescription, validateApiContractResponse} from '../source/platform/bos-app-discovery/scripts/validate-discovery.mjs';
import {projectContractFacts} from '../source/platform/bos-app-discovery/scripts/project-contract-facts.mjs';
import {syntheticOperationDescribe, syntheticApiContract} from './helpers/synthetic-bos-discovery-service.mjs';

const descriptor = {body:'binary',content_type:'provider',integrity:'provider_md5_if_available',
  headers:['Content-Disposition','Content-Length','Content-Type','Content-MD5','X-Correlation-ID']};
const contact = () => {
  const value = structuredClone(syntheticOperationDescribe().operations[0]);
  value.operation = 'synthetic_file_download';
  value.execution.response = structuredClone(descriptor);
  Object.assign(value.limits,{maximum_attachment_bytes:20971520,maximum_file_bytes:20971520,
    maximum_duration_seconds:120,maximum_preparation_seconds:45});
  return value;
};
const filename = '計画 résumé.opaque-BLOB';
const headers = (bytes, md5 = true, contentType = 'application/octet-stream') => ({
  'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(filename),
  'Content-Length':String(bytes.byteLength),'Content-Type':contentType,'X-Correlation-ID':'synthetic-file-1',
  ...(md5 ? {'Content-MD5':createHash('md5').update(bytes).digest('base64')} : {})
});
const context = {contract_version:'bos-identity-mcp/v2',context:{context_handle:'bos_ctx_v2_'+'a'.repeat(64),
  organization_name:'Synthetic',application_name:'Synthetic App',installation_name:'Synthetic Installation',role_label:'Reviewer',is_default:true}};
const adapter = (request, create = createBosExternalDependencyAdapter) => create({hostTransport:{request,
  getProtectedResource:async()=>'https://example.invalid/mcp',recoverAuthentication:async()=>{throw Error('unexpected recovery');},
  captureExecutionScope:async()=>async()=>true,verifyExecutionIntent:async()=>true},
  contextProvider:{getCurrentContext:async()=>context,getExecutionContextHeader:async()=>'X-BOS-Context-Handle'}});
const payload = () => ({text:'Synthetic file'});
const invoke = (value, response) => adapter(async()=>response).invokeDiscoveredOperation(value,payload());
const response = (bytes, options={}) => new Response(bytes,{headers:headers(bytes,options.md5??true,options.contentType)});

test('original-file descriptor survives API discovery, projection and the closed adapter schema',async()=>{
  const value=contact(),parent={...syntheticOperationDescribe(),operations:[value]};
  value.sources[0].limits={pagination_supported:false,bulk_supported:false,streaming_supported:true,
    maximum_file_bytes:20971520,maximum_attachment_bytes:20971520,maximum_duration_seconds:120,maximum_preparation_seconds:45};
  assert.equal(validateOperationDescription(parent),parent);
  const api={...syntheticApiContract(),limits:value.limits,execution:value.execution};
  assert.equal(validateApiContractResponse(api,{operation:api.operation,source:api.source}),api);
  const scope={organization:'Synthetic',application:'Synthetic',installation:'Synthetic',role:'Reviewer'};
  const facts=projectContractFacts({documents:[{kind:'operation-describe',document:parent,scope},{kind:'api-contract',document:api,scope}]});
  assert.deepEqual(facts.operations[0].execution_response.value,descriptor);
  assert.ok(facts.operations[0].limits.some(row=>row.field==='maximum_file_bytes'&&row.value===20971520));
  const bytes=Uint8Array.of(0,255,13,10,123,125);
  const result=await invoke(value,{status:200,headers:headers(bytes),body:bytes});
  assert.deepEqual(result.body,bytes);
  assert.equal(result.headers['content-disposition'],headers(bytes)['Content-Disposition']);
  for(const change of [v=>delete v.execution.response.integrity,v=>v.execution.response.integrity='optional',
    v=>v.execution.response.headers.pop(),v=>v.execution.response.headers.push('Digest'),
    v=>v.limits.maximum_file_bytes--,v=>v.limits.maximum_attachment_bytes=20971521,
    v=>v.limits.maximum_duration_seconds=121,v=>v.limits.maximum_preparation_seconds=46]){
    const invalid=contact();change(invalid);
    assert.throws(()=>validateOperationDescription({...syntheticOperationDescribe(),operations:[invalid]}));
    await assert.rejects(invoke(invalid,{status:200,headers:headers(bytes),body:bytes}));
  }
});

test('MD5 is optional only for the explicit provider variant and verifies the exact body view',async()=>{
  for(const bytes of [new Uint8Array(),Uint8Array.of(0,255,128,10,0)]){
    for(const md5 of [true,false]){
      const result=await invoke(contact(),{status:200,headers:headers(bytes,md5),body:bytes});
      assert.deepEqual(result.body,bytes);
      assert.equal(Object.hasOwn(result.headers,'content-md5'),md5);
    }
    for(const checksum of ['wrong',createHash('md5').update('other bytes').digest('base64')]){
      await assert.rejects(invoke(contact(),{status:200,headers:{...headers(bytes),'Content-MD5':checksum},body:bytes}),/Content-MD5/);
    }
    for(const name of ['Content-Disposition','Content-Length','Content-Type','X-Correlation-ID']){
      const missing=headers(bytes);delete missing[name];
      await assert.rejects(invoke(contact(),{status:200,headers:missing,body:bytes}),/missing described header/);
    }
  }
  const backing=Uint8Array.of(77,0,255,66),view=backing.subarray(1,3);
  assert.deepEqual((await invoke(contact(),{status:200,headers:headers(view),body:view})).body,view);
  const legacy=contact();delete legacy.execution.response.integrity;
  legacy.execution.response.headers=['Content-Disposition','Content-Length','Content-Type','Digest','X-Content-SHA256','X-Correlation-ID'];
  legacy.limits.maximum_attachment_bytes=25*1024*1024;delete legacy.limits.maximum_file_bytes;
  const bytes=Uint8Array.of(7),legacyHeaders={...headers(bytes,false),Digest:'sha-256=synthetic-digest','X-Content-SHA256':'synthetic-sha256'};
  assert.deepEqual((await invoke(legacy,{status:200,headers:legacyHeaders,body:bytes})).body,bytes);
  delete legacyHeaders.Digest;
  await assert.rejects(invoke(legacy,{status:200,headers:legacyHeaders,body:bytes}),/missing described header Digest/);
});

test('streamed opaque download, ordinary local save and discovered durable upload preserve bytes and Unicode extension',async()=>{
  for(const bytes of [new Uint8Array(),Uint8Array.of(0,255,128,13,10,123,34,0)]){
    let uploaded;
    const server=createServer(async(req,res)=>{
      if(req.url.endsWith('/upload')){
        let body='';for await(const part of req)body+=part;uploaded=JSON.parse(body);
        res.setHeader('Content-Type','application/json');res.end(JSON.stringify({stored:true}));return;
      }
      res.writeHead(200,headers(bytes));
      for(let offset=0;offset<bytes.length;offset+=2)res.write(bytes.subarray(offset,offset+2));
      res.end();
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const directory=await mkdtemp(join(tmpdir(),'bos-byte-roundtrip-'));
    try{
      const download=contact();download.execution.uri='/bos/apps/synthetic/api/v1/files/download';
      const upload=contact();upload.operation='synthetic_file_upload';upload.effect='write';delete upload.execution.response;
      upload.execution.uri='/bos/apps/synthetic/api/v1/files/upload';
      upload.input_schema={type:'object',additionalProperties:false,required:['filename','content_base64'],
        properties:{filename:{type:'string'},content_base64:{type:'string'}},'x-bos-fields':[]};
      const current=adapter(async request=>{
        const reply=await fetch('http://127.0.0.1:'+server.address().port+request.href,{method:request.method,headers:request.headers,body:request.body});
        return readDiscoveredHttpResponse(reply,request.href.endsWith('/upload')?upload:download);
      });
      const downloaded=await current.invokeDiscoveredOperation(download,payload());
      const savedName=decodeURIComponent(downloaded.headers['content-disposition'].split("UTF-8''")[1]);
      assert.equal(savedName,filename);
      const path=join(directory,savedName);await writeFile(path,downloaded.body);
      const saved=await readFile(path);assert.deepEqual(saved,Buffer.from(bytes));
      await current.invokeDiscoveredOperation(upload,{filename:savedName,content_base64:saved.toString('base64')});
      assert.equal(uploaded.filename,filename);assert.deepEqual(Buffer.from(uploaded.content_base64,'base64'),Buffer.from(bytes));
    }finally{await rm(directory,{recursive:true,force:true});await new Promise(resolve=>server.close(resolve));}
  }
});

test('declared JSON and text files remain byte bodies while ordinary JSON and typed failures remain JSON',async()=>{
  const bytes=new TextEncoder().encode('{"token":"opaque file content"}\n');
  for(const contentType of ['application/json','text/plain','application/x-unregistered-format']){
    const result=await readDiscoveredHttpResponse(response(bytes,{contentType}),contact());
    assert.deepEqual(result.body,bytes);
  }
  const ordinary=contact();delete ordinary.execution.response;
  assert.deepEqual((await readDiscoveredHttpResponse(new Response('{"records":[]}',{headers:{'Content-Type':'application/json'}}),ordinary)).body,{records:[]});
  const failure=new Response('{"error":{"code":"FILE_NOT_AVAILABLE"}}',{status:404,headers:{'Content-Type':'application/json'}});
  assert.equal((await readDiscoveredHttpResponse(failure,contact())).body.error.code,'FILE_NOT_AVAILABLE');
});

test('all generated BOS clients carry the same byte helper and execute the new descriptor',async()=>{
  const canonical=await readFile(new URL('../source/platform/bos-external-dependency-adapter/scripts/binary-response.mjs',import.meta.url),'utf8');
  for(const root of ['codex/plugins','claude/plugins','copilot/products','gemini/extensions','muse/plugins']){
    const directory=new URL('../clients/'+root+'/bos/skills/bos-external-dependency-adapter/scripts/',import.meta.url);
    assert.equal(await readFile(new URL('binary-response.mjs',directory),'utf8'),canonical,root);
    const runtime=await import(new URL('external-dependency-adapter.mjs',directory));
    const bytes=Uint8Array.of(0,255,9);
    const current=adapter(async()=>runtime.readDiscoveredHttpResponse(response(bytes,{md5:false}),contact()),runtime.createBosExternalDependencyAdapter);
    assert.deepEqual((await current.invokeDiscoveredOperation(contact(),payload())).body,bytes,root);
  }
});

test('stream reader cancels oversized, incomplete, invalid-MD5 and timed-out bodies before returning bytes',async()=>{
  const value=contact();value.limits.maximum_file_bytes=value.limits.maximum_attachment_bytes=4;
  for(const [declared,chunks,checksum] of [[5,[Uint8Array.of(1)],null],[1,[Uint8Array.of(1,2)],null],
    [2,[Uint8Array.of(1)],null],[1,[Uint8Array.of(1)],'not-md5']]){
    let cancelled=false;
    const stream=new ReadableStream({start(controller){for(const chunk of chunks)controller.enqueue(chunk);},cancel(){cancelled=true;}});
    const h={...headers(Uint8Array.of(1),false),'Content-Length':String(declared),...(checksum?{'Content-MD5':checksum}:{})};
    // Explicit end for length/checksum checks; oversize cases verify cancellation.
    if(declared===2||checksum){const closed=new Response(new Blob(chunks),{headers:h});await assert.rejects(readDiscoveredHttpResponse(closed,value));}
    else{await assert.rejects(readDiscoveredHttpResponse(new Response(stream,{headers:h}),value));assert.equal(cancelled,true);}
    await stream.cancel().catch(()=>{});
  }
  let cancelled=false;const stalled=new ReadableStream({cancel(){cancelled=true;}});
  const short=contact();short.limits.maximum_duration_seconds=1;
  await assert.rejects(readDiscoveredHttpResponse(new Response(stalled,{headers:headers(new Uint8Array(),false)}),short),/duration limit/);
  assert.equal(cancelled,true);
});
