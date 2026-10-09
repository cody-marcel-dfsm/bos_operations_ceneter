import {randomBytes, createHash} from 'node:crypto';
import {createServer} from 'node:http';

export class ReviewerSessionError extends Error {
  constructor(code, diagnostic) { super(code); this.name='ReviewerSessionError'; this.code=code; if(diagnostic)this.diagnostic=diagnostic; }
}
const fail=(code,diagnostic)=>{throw new ReviewerSessionError(code,diagnostic);};
const secret=()=>randomBytes(32).toString('base64url');
const decode=value=>value.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
function resourceReadDiagnostic(method,resource,stage,details={}) {
  if(method!=='resources/read')return undefined;
  let resourceName='unknown';
  try {if(new URL(resource).pathname.split('/').filter(Boolean).at(-1)==='app.describe')resourceName='app.describe';}catch{}
  return {operation:method,resource:resourceName,stage,...details};
}
function safeRpcErrorCode(value) {
  return [-32700,-32600,-32601,-32602,-32603].includes(value)?value:undefined;
}
function rpcErrorCategory(message) {
  if(typeof message!=='string')return undefined;
  if(/method.*(?:not found|unsupported)|unknown method/i.test(message))return 'unsupported_method';
  if(/unknown resource|resource.*(?:not found|missing)|(?:not found|missing).*resource/i.test(message))return 'resource_not_found';
  if(/unauthori[sz]ed|forbidden|permission/i.test(message))return 'authorization';
  if(/invalid.*(?:uri|resource)|malformed.*(?:uri|resource)/i.test(message))return 'invalid_resource';
  if(/session.*(?:expired|invalid)|invalid session/i.test(message))return 'session';
  return 'unclassified';
}
function mediaType(response) {
  const value=response.headers.get('content-type')?.split(';',1)[0]?.trim().toLowerCase();
  return ['application/json','text/event-stream','text/plain'].includes(value)?value:'unknown';
}
function transportErrorCategory(error) {
  if(error?.name==='TimeoutError'||error?.name==='AbortError')return 'timeout_or_abort';
  if(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','EAI_AGAIN','ENOTFOUND'].includes(error?.cause?.code??error?.code))return 'network_error';
  return 'transport_error';
}
export function trustedUrl(value, origin) {
  let url;try{url=new URL(value);}catch{fail('reviewer_url_invalid');}
  if(url.protocol!=='https:'||url.origin!==origin||url.username||url.password||url.hash)fail('reviewer_origin_mismatch');
  return url;
}
export function callbackParameters(value,{redirectUri,state,issuer}) {
  let url;try{url=new URL(value);}catch{fail('reviewer_callback_invalid');}
  if(url.origin+url.pathname!==redirectUri||url.hash||url.username||url.password)fail('reviewer_callback_mismatch');
  for(const field of ['state','iss','code'])if(url.searchParams.getAll(field).length!==1)fail('reviewer_callback_invalid');
  if(url.searchParams.get('state')!==state||url.searchParams.get('iss')!==issuer||!url.searchParams.get('code')||url.searchParams.has('error'))fail('reviewer_callback_mismatch');
  return url.searchParams.get('code');
}
export function reviewerConsent(html,origin) {
  const forms=[...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)];
  if(forms.length!==1)fail('reviewer_consent_unavailable');
  const attr=(text,name)=>decode(new RegExp(`\\b${name}=["']([^"']+)["']`,'i').exec(text)?.[1]??'');
  if(attr(forms[0][1],'method').toLowerCase()!=='post')fail('reviewer_consent_invalid');
  const action=trustedUrl(new URL(attr(forms[0][1],'action'),origin).href,origin);
  if(action.pathname!=='/api/v1/mcp/oauth/handoff/identity-consent'||action.search)fail('reviewer_consent_unavailable');
  const inputs=[...forms[0][2].matchAll(/<input\b([^>]*)>/gi)].filter(row=>attr(row[1],'name')==='login_state');
  if(inputs.length!==1||attr(inputs[0][1],'type')!=='hidden')fail('reviewer_consent_invalid');
  const loginState=attr(inputs[0][1],'value');if(!loginState||loginState.length>2048)fail('reviewer_consent_invalid');
  return {action:action.href,body:new URLSearchParams({login_state:loginState,decision:'approve'}).toString()};
}

// One ephemeral test-host connection. Cookies and grants never leave this closure.
export async function openReviewerSession({reviewerUrl,resource,fetchImpl=fetch}) {
  const origin=new URL(resource).origin;
  trustedUrl(resource,origin);trustedUrl(reviewerUrl,origin);
  const requestedProtocol='2025-06-18';
  let negotiatedProtocol=requestedProtocol;
  let grant=null,metadata=null,clientId=null,closed=false,sessionId=null,rpcId=0;
  const cookies=new Map();
  const listener=createServer((req,res)=>{res.writeHead(404);res.end();});
  await new Promise((done,reject)=>{listener.once('error',reject);listener.listen(0,'127.0.0.1',done);});
  const redirectUri=`http://127.0.0.1:${listener.address().port}/${secret()}`;
  const request=async(url,options={},browser=false)=>{
    trustedUrl(url,origin);
    const headers=new Headers(options.headers??{});
    if(browser&&cookies.size)headers.set('cookie',[...cookies].map(([k,v])=>`${k}=${v}`).join('; '));
    const response=await fetchImpl(url,{...options,headers,redirect:'manual',signal:AbortSignal.timeout(30000)});
    if(browser)for(const value of response.headers.getSetCookie()){
      const match=/^([^=;\s]+)=([^;]*)/.exec(value);if(!match)fail('reviewer_cookie_invalid');
      const domain=/;\s*Domain=([^;]+)/i.exec(value)?.[1]?.replace(/^\./,'');
      if(domain&&domain!==new URL(url).hostname)fail('reviewer_cookie_domain_mismatch');
      if(/;\s*Max-Age=0(?:;|$)/i.test(value))cookies.delete(match[1]);else cookies.set(match[1],match[2]);
    }
    return response;
  };
  const json=async(response,code)=>{
    if(!response.ok)fail(code);
    let value;try{value=JSON.parse(await response.text());}catch{fail(code);}
    if(!value||typeof value!=='object'||Array.isArray(value))fail(code);return value;
  };
  const cleanup=async()=>{
    closed=true;let revoked=true;
    if(grant){
      for(const token of [grant.refresh_token,grant.access_token].filter(Boolean)){
        try{const result=await request(metadata.revocation_endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token,client_id:clientId}).toString()});await result.body?.cancel();if(!result.ok)revoked=false;}catch{revoked=false;}
      }
    }
    grant=null;cookies.clear();
    await new Promise(done=>listener.close(done));
    if(!revoked)fail('reviewer_grant_revocation_failed');
  };
  try {
    const entry=await request(reviewerUrl,{},true);
    if(entry.status!==200||!cookies.size)fail('reviewer_entry_failed');
    const refresh=entry.headers.get('refresh');await entry.body?.cancel();
    const target=/^\d+\s*;\s*url=(.+)$/i.exec(refresh??'')?.[1];
    if(!target)fail('reviewer_static_continuation_missing');
    const continuation=trustedUrl(new URL(target,reviewerUrl).href,origin);
    if(continuation.pathname!=='/app'||continuation.searchParams.getAll('state_token').length!==1)fail('reviewer_static_continuation_invalid');
    const completion=await request(continuation.href,{},true);
    if(completion.status!==200)fail('reviewer_static_completion_failed');await completion.body?.cancel();
    const protectedMetadata=await json(await request(new URL(`/.well-known/oauth-protected-resource${new URL(resource).pathname}`,origin).href),'reviewer_resource_metadata_failed');
    if(protectedMetadata.resource!==resource||protectedMetadata.authorization_servers?.length!==1)fail('reviewer_resource_mismatch');
    const issuer=protectedMetadata.authorization_servers[0];trustedUrl(issuer,origin);
    const issuerPath=new URL(issuer).pathname;
    metadata=await json(await request(new URL(`/.well-known/oauth-authorization-server${issuerPath==='/'?'':issuerPath}`,origin).href),'reviewer_oauth_metadata_failed');
    if(metadata.issuer!==issuer||!metadata.code_challenge_methods_supported?.includes('S256')||!metadata.grant_types_supported?.includes('authorization_code')||!metadata.token_endpoint_auth_methods_supported?.includes('none'))fail('reviewer_oauth_metadata_invalid');
    for(const field of ['registration_endpoint','authorization_endpoint','token_endpoint','revocation_endpoint'])trustedUrl(metadata[field],origin);
    const registration=await json(await request(metadata.registration_endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Marketplace reviewer integration test',redirect_uris:[redirectUri],token_endpoint_auth_method:'none',grant_types:['authorization_code'],response_types:['code']})}),'reviewer_registration_failed');
    clientId=registration.client_id;
    if(typeof clientId!=='string'||!clientId||registration.redirect_uris?.length!==1||registration.redirect_uris[0]!==redirectUri||registration.token_endpoint_auth_method!=='none')fail('reviewer_registration_invalid');
    const state=secret(),verifier=secret(),scope='mcp:tools';
    const authorization=new URL(metadata.authorization_endpoint);
    authorization.search=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,resource,scope,state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
    const consentResponse=await request(authorization.href,{},true);
    if(consentResponse.status!==200)fail('reviewer_consent_unavailable');
    const consent=reviewerConsent(await consentResponse.text(),origin);
    const decision=await request(consent.action,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin},body:consent.body},true);
    let callback=decision.headers.get('location');
    if(!callback&&decision.status===200){const page=await decision.text();callback=decode(/<a\b[^>]*id=["']oauth-callback["'][^>]*href=["']([^"']+)["']/i.exec(page)?.[1]??'');}
    else await decision.body?.cancel();
    const code=callbackParameters(callback,{redirectUri,state,issuer});
    // The consent response's callback is the browser continuation, validated before exchange.
    grant=await json(await request(metadata.token_endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:clientId,redirect_uri:redirectUri,resource,code_verifier:verifier}).toString()}),'reviewer_pkce_exchange_failed');
    if(typeof grant.access_token!=='string'||!grant.access_token||grant.token_type?.toLowerCase()!=='bearer'||grant.scope!==scope||!Number.isFinite(grant.expires_in)||grant.expires_in<=0)fail('reviewer_grant_invalid');
    const expiresAt=Date.now()+grant.expires_in*1000;
    const authorized=async(url,options={})=>{
      if(closed||!grant||Date.now()>=expiresAt)fail('reviewer_session_expired');
      const headers=new Headers(options.headers??{});
      if(headers.has('authorization')||headers.has('cookie'))fail('reviewer_credential_substitution');
      headers.set('authorization',`Bearer ${grant.access_token}`);
      return request(url,{...options,headers});
    };
    const rpc=async(method,params={})=>{
      const headers={'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':negotiatedProtocol};
      if(sessionId)headers['mcp-session-id']=sessionId;
      const id=++rpcId;let response;
      try {response=await authorized(resource,{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id,method,params})});}
      catch(error){if(method==='resources/read')fail('reviewer_mcp_request_failed',resourceReadDiagnostic(method,params.uri,'transport_error',{transport_error_category:transportErrorCategory(error)}));throw error;}
      if(!response.ok){await response.body?.cancel();fail('reviewer_mcp_request_failed',resourceReadDiagnostic(method,params.uri,'http_response',{http_status:response.status,content_type:mediaType(response)}));}
      const nextSession=response.headers.get('mcp-session-id');if(nextSession)sessionId=nextSession;
      let text;
      try {text=await response.text();}
      catch(error){if(method==='resources/read')fail('reviewer_mcp_response_invalid',resourceReadDiagnostic(method,params.uri,'body_read_error',{http_status:response.status,content_type:mediaType(response),transport_error_category:transportErrorCategory(error)}));throw error;}
      let envelope,responseFormat='json';
      try{envelope=JSON.parse(text);}catch{responseFormat='sse';const rows=text.split(/\r?\n/).filter(row=>row.startsWith('data:')).map(row=>{try{return JSON.parse(row.slice(5).trim());}catch{return null;}});envelope=rows.find(row=>row?.id===id);}
      const diagnostic=resourceReadDiagnostic(method,params.uri,'jsonrpc_response',{http_status:response.status,content_type:mediaType(response),response_bytes:Buffer.byteLength(text),response_format:responseFormat,request_id_matches:envelope?.id===id,jsonrpc_error_present:!!envelope?.error,result_present:!!envelope&&Object.hasOwn(envelope,'result'),...(envelope?.error&&safeRpcErrorCode(envelope.error.code)!==undefined?{jsonrpc_error_code:safeRpcErrorCode(envelope.error.code)}:{}),...(envelope?.error?.message?{jsonrpc_error_category:rpcErrorCategory(envelope.error.message)}:{})});
      if(envelope?.id!==id||envelope.error||!Object.hasOwn(envelope,'result'))fail('reviewer_mcp_response_invalid',diagnostic);return envelope.result;
    };
    const negotiation=await rpc('initialize',{protocolVersion:requestedProtocol,capabilities:{},clientInfo:{name:'marketplace-reviewer-test',version:'1'}});
    if(negotiation.protocolVersion!==requestedProtocol)fail('reviewer_mcp_protocol_unsupported');
    negotiatedProtocol=negotiation.protocolVersion;
    const initializedHeaders={'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':negotiatedProtocol,...(sessionId?{'mcp-session-id':sessionId}:{})};
    const initialized=await authorized(resource,{method:'POST',headers:initializedHeaders,body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})});
    if(!initialized.ok)fail('reviewer_mcp_initialization_failed');await initialized.body?.cancel();
    return Object.freeze({rpc,request:authorized,close:cleanup,evidence:Object.freeze({reviewer_url_sha256:createHash('sha256').update(reviewerUrl).digest('hex'),reviewer_login_http_status:200,authentication_source:'exact_reviewer_entry_consent_pkce',isolated_connection:true})});
  } catch(error) {await cleanup();throw error instanceof ReviewerSessionError?error:new ReviewerSessionError('reviewer_session_failed');}
}
