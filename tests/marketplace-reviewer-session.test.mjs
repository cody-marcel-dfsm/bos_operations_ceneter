import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openReviewerSession,callbackParameters,reviewerConsent} from '../scripts/marketplace-reviewer-session.mjs';

const origin='https://dfsm.ai',resource=origin+'/mcp/apps/bos/platform';
const reviewerUrl=origin+'/app?app=synthetic&org_id=review&entry=openai';
const json=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json',...headers}});
function fixture(change={}) {
  const calls=[];let auth=null,registration=null;
  const fetchImpl=async(value,options={})=>{
    const url=new URL(value),headers=new Headers(options.headers),body=options.body;
    calls.push({url:url.href,headers,body});
    if(url.href===reviewerUrl)return new Response('',{headers:{'set-cookie':'bos_session=entry-reviewer; Secure; HttpOnly; Path=/','refresh':'2; url=/app?state_token=entry-only'}});
    if(url.pathname==='/app') {assert.equal(headers.get('cookie'),'bos_session=entry-reviewer');return new Response('static');}
    if(url.pathname.startsWith('/.well-known/oauth-protected-resource'))return json({resource,authorization_servers:[origin]});
    if(url.pathname==='/.well-known/oauth-authorization-server')return json({issuer:origin,registration_endpoint:origin+'/register',authorization_endpoint:origin+'/authorize',token_endpoint:origin+'/token',revocation_endpoint:origin+'/revoke',code_challenge_methods_supported:['S256'],grant_types_supported:['authorization_code'],token_endpoint_auth_methods_supported:['none'],...change.metadata});
    if(url.pathname==='/register'){registration=JSON.parse(body);return json({...registration,client_id:'isolated-test-client'},201);}
    if(url.pathname==='/authorize') {
      assert.equal(headers.get('cookie'),'bos_session=entry-reviewer');auth=url.searchParams;
      if(change.noConsent)return new Response('<a href="https://accounts.google.com">Google</a>');
      return new Response('<form method="post" action="/api/v1/mcp/oauth/handoff/identity-consent"><input type="hidden" name="login_state" value="entry-handoff"></form>');
    }
    if(url.pathname==='/api/v1/mcp/oauth/handoff/identity-consent') {
      assert.equal(headers.get('cookie'),'bos_session=entry-reviewer');assert.equal(headers.get('origin'),origin);
      assert.equal(new URLSearchParams(body).get('login_state'),'entry-handoff');
      const callback=new URL(registration.redirect_uris[0]);callback.search=new URLSearchParams({code:'private-reviewer-code',state:auth.get('state'),iss:origin,...change.callback}).toString();
      return new Response(`<a id="oauth-callback" href="${callback.href.replaceAll('&','&amp;')}">Continue</a>`);
    }
    if(url.pathname==='/token') {
      const form=new URLSearchParams(body);
      assert.equal(form.get('code'),'private-reviewer-code');assert.equal(form.get('resource'),resource);
      assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'),auth.get('code_challenge'));
      assert.equal(headers.get('cookie'),null);
      return json({access_token:'private-reviewer-token',token_type:'Bearer',scope:'mcp:tools',expires_in:300,...change.grant});
    }
    if(url.pathname==='/revoke'){assert.equal(headers.get('cookie'),null);return new Response('',{status:change.revokeStatus??200});}
    assert.equal(headers.get('authorization'),'Bearer private-reviewer-token');assert.equal(headers.get('cookie'),null);
    if(url.href===resource){const req=JSON.parse(body);assert.equal(headers.get('mcp-protocol-version'),'2025-06-18');if(req.method==='initialize')assert.equal(req.params.protocolVersion,'2025-06-18');if(!req.id)return new Response(null,{status:202});if(req.method==='resources/read'&&change.resourceReadHttpStatus)return new Response('private server response Bearer secret',{status:change.resourceReadHttpStatus,headers:{'content-type':'text/plain'}});if(req.method==='resources/read'&&change.resourceReadError)return json({jsonrpc:'2.0',id:change.resourceReadError.mismatch?req.id+1:req.id,error:{code:change.resourceReadError.code??-32602,message:change.resourceReadError.message??'private upstream text https://private.invalid/?token=secret'}});return json({jsonrpc:'2.0',id:req.id,result:req.method==='initialize'?{protocolVersion:Object.hasOwn(change,'negotiatedProtocol')?change.negotiatedProtocol:'2025-06-18'}:req.method==='resources/read'?{contents:[]}:{contexts:[]}});}
    if(url.pathname==='/api/read')return json({count:1});
    throw new Error('Unexpected transport');
  };
  return {calls,fetchImpl};
}

test('exact reviewer URL, cookie, consent and PKCE establish one private grant for MCP and HTTPS',async()=>{
  const f=fixture();const session=await openReviewerSession({reviewerUrl,resource,fetchImpl:f.fetchImpl});
  try {
    assert.equal(f.calls[0].url,reviewerUrl);
    await session.rpc('tools/call',{name:'bos.get_context',arguments:{}});
    const response=await session.request(origin+'/api/read');assert.deepEqual(await response.json(),{count:1});
    assert.equal(session.evidence.reviewer_url_sha256,createHash('sha256').update(reviewerUrl).digest('hex'));
    assert.doesNotMatch(JSON.stringify(session),/private-reviewer|entry-reviewer|entry-handoff/);
    await assert.rejects(session.request('https://foreign.example/api/read'),/origin_mismatch/);
    await assert.rejects(session.request(origin+'/api/read',{headers:{authorization:'substituted'}}),/credential_substitution/);
  }finally{await session.close();}
  assert.equal(f.calls.filter(row=>new URL(row.url).pathname==='/revoke').length,1);
  await assert.rejects(session.request(origin+'/api/read'),/session_expired/);
});
test('foreign metadata and absent reviewer consent stop before token exchange',async()=>{
  for(const change of [{metadata:{token_endpoint:'https://foreign.example/token'}},{noConsent:true},{callback:{state:'wrong'}},{callback:{iss:'https://foreign.example'}}]) {
    const f=fixture(change);await assert.rejects(openReviewerSession({reviewerUrl,resource,fetchImpl:f.fetchImpl}));
    assert.equal(f.calls.some(row=>new URL(row.url).pathname==='/token'),false);
    assert.equal(f.calls.some(row=>new URL(row.url).origin!==origin),false);
  }
});
test('invalid issued scope is rejected and the obtained grant is revoked',async()=>{
  const f=fixture({grant:{scope:'other'}});await assert.rejects(openReviewerSession({reviewerUrl,resource,fetchImpl:f.fetchImpl}),/grant_invalid/);
  assert.equal(f.calls.filter(row=>new URL(row.url).pathname==='/revoke').length,1);
});
test('revocation failure fails the run while discarding the in-memory grant',async()=>{
  const f=fixture({revokeStatus:503});const session=await openReviewerSession({reviewerUrl,resource,fetchImpl:f.fetchImpl});
  await assert.rejects(session.close(),/revocation_failed/);
  await assert.rejects(session.request(origin+'/api/read'),/session_expired/);
});
test('callback and consent parsing reject duplicated, redirected or substituted authority',()=>{
  const settings={redirectUri:'http://127.0.0.1:3000/exact',state:'state',issuer:origin};
  assert.equal(callbackParameters(settings.redirectUri+'?state=state&iss=https%3A%2F%2Fdfsm.ai&code=code',settings),'code');
  for(const url of [settings.redirectUri+'?state=state&state=state&iss=https%3A%2F%2Fdfsm.ai&code=code','http://127.0.0.1:3001/exact?state=state&iss=https%3A%2F%2Fdfsm.ai&code=code'])assert.throws(()=>callbackParameters(url,settings));
  for(const html of ['<form method="post" action="https://foreign.example/api/v1/mcp/oauth/handoff/identity-consent"><input type="hidden" name="login_state" value="state"></form>','<form method="post" action="/api/v1/mcp/oauth/authorize"><input type="hidden" name="login_state" value="state"></form>'])assert.throws(()=>reviewerConsent(html,origin));
});

test('unsupported or missing negotiated MCP version stops before discovery and revokes the grant',async()=>{
  for(const negotiatedProtocol of ['2024-11-05','2099-01-01',null,undefined]) {
    const f=fixture({negotiatedProtocol});
    await assert.rejects(openReviewerSession({reviewerUrl,resource,fetchImpl:f.fetchImpl}),/reviewer_mcp_protocol_unsupported/);
    assert.equal(f.calls.filter(row=>new URL(row.url).pathname==='/revoke').length,1);
    assert.equal(f.calls.filter(row=>new URL(row.url).pathname===new URL(resource).pathname).length,1);
  }
});

test('resource read errors retain bounded protocol diagnostics without exposing upstream text or URI query',async()=>{
  for(const [change,expected] of [
    [{resourceReadError:{code:-32602,message:'private upstream text https://private.invalid/?token=secret'}},{stage:'jsonrpc_response',jsonrpc_error_code:-32602,jsonrpc_error_category:'unclassified'}],
    [{resourceReadError:{code:-32601,message:'Method not found'}},{stage:'jsonrpc_response',jsonrpc_error_code:-32601,jsonrpc_error_category:'unsupported_method'}],
    [{resourceReadError:{code:'synthetic_private_token',message:'private upstream text https://private.invalid/?token=secret'}},{stage:'jsonrpc_response',jsonrpc_error_category:'unclassified',jsonrpc_error_code:undefined}],
    [{resourceReadError:{mismatch:true,message:'private mismatch'}},{stage:'jsonrpc_response',request_id_matches:false,jsonrpc_error_present:true,result_present:false}],
    [{resourceReadHttpStatus:502},{stage:'http_response',http_status:502,content_type:'text/plain'}],
    [{resourceReadTransportError:true},{stage:'transport_error',transport_error_category:'network_error'}],
  ]) {
    const configured=fixture(change),original=configured.fetchImpl,active=await openReviewerSession({reviewerUrl,resource,fetchImpl:async(url,options)=>{
      if(change.resourceReadTransportError&&String(url)===resource&&JSON.parse(options.body).method==='resources/read')throw Object.assign(new Error('private network response'),{code:'ECONNRESET'});
      return original(url,options);
    }});
    try {
      const uri='bos://apps/education-center/app.describe?context_handle=bos_ctx_v2_private&token=secret';
      await assert.rejects(active.rpc('resources/read',{uri}),error=>{
        assert.equal(error.code,change.resourceReadHttpStatus||change.resourceReadTransportError?'reviewer_mcp_request_failed':'reviewer_mcp_response_invalid');
        assert.equal(error.diagnostic.operation,'resources/read');assert.equal(error.diagnostic.resource,'app.describe');
        for(const [key,value] of Object.entries(expected))assert.equal(error.diagnostic[key],value);
        assert.doesNotMatch(JSON.stringify(error),/private.invalid|token=secret|private upstream|bos_ctx_v2/);return true;
      });
    } finally {await active.close();}
  }
  const configured=fixture({resourceReadError:{code:'synthetic_private_token',message:'private upstream text'}}),original=configured.fetchImpl;
  const active=await openReviewerSession({reviewerUrl,resource,fetchImpl:async(url,options)=>{
    if(String(url)===resource&&JSON.parse(options.body).method==='resources/read')return new Response(JSON.stringify({jsonrpc:'2.0',id:2,error:{code:'synthetic_private_token',message:'private upstream text'}}),{headers:{'content-type':'application/x-synthetic-private-token-7f3a91'}});
    return original(url,options);
  }});
  try {
    await assert.rejects(active.rpc('resources/read',{uri:'bos://apps/synthetic-private-identifier?token=secret'}),error=>{
      assert.equal(error.diagnostic.resource,'unknown');assert.equal(error.diagnostic.content_type,'unknown');
      assert.equal(Object.hasOwn(error.diagnostic,'jsonrpc_error_code'),false);
      assert.doesNotMatch(JSON.stringify(error),/synthetic_private|private-identifier|token=secret/);return true;
    });
  } finally {await active.close();}
});
