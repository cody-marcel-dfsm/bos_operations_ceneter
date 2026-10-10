import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const root=new URL('../',import.meta.url);
test('Oracle independently classifies API version requests alongside authentication approval',()=>{
 const schema=JSON.parse(readFileSync(new URL('.agents/skills/oracle/review-output.schema.json',root),'utf8'));
 assert(schema.required.includes('api_version_assessment'));
 assert.deepEqual(schema.properties.api_version_assessment.properties.impact.enum,['NONE','CHANGE']);
 assert.deepEqual(schema.properties.api_version_assessment.properties.request_kind.enum,['NOT_REQUIRED','EXPLICIT_REQUEST','APPROVAL_ONLY','MISSING']);
 const utility=readFileSync(new URL('tools/oracle_approval.py',root),'utf8');
 assert.match(utility,/human.*explicit request/is);
 assert.match(utility,/approval.*never substitute/is);
});

test('version change requires exact supplied direct-request evidence and rejects approval-only paths',()=>{
 const script=String.raw`
import tempfile
from pathlib import Path
from tools import oracle_approval as o
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory)
 request=root/'request.md';request.write_text('Human: I request API v1 to API v2.\n')
 evidence=o._files(root,[str(request)])
 none={'impact':'NONE','request_kind':'NOT_REQUIRED','requested_change':None,'request_quote':None,'request_evidence':None}
 o._validate_api_version_assessment(none,'APPROVED',root,evidence)
 requested={'impact':'CHANGE','request_kind':'EXPLICIT_REQUEST','requested_change':'API v1 to API v2','request_quote':'I request API v1 to API v2.','request_evidence':str(request)}
 o._validate_api_version_assessment(requested,'APPROVED',root,evidence)
 def rejects(value,provided=evidence):
  try:o._validate_api_version_assessment(value,'APPROVED',root,provided)
  except o.OracleApprovalError:pass
  else:raise AssertionError('unrequested API version change accepted')
 rejects(None)
 for kind in ['APPROVAL_ONLY','MISSING','NOT_REQUIRED']:
  rejects(dict(requested,request_kind=kind))
 for field in ['requested_change','request_quote','request_evidence']:
  rejects(dict(requested,**{field:None}))
 rejects(dict(requested,request_quote='I request API v1 to API v3.'))
 rejects(dict(requested,request_evidence='request.md'))
 rejects(requested,{})
 rejects(dict(none,request_quote='inferred permission'))
 o._validate_api_version_assessment(dict(requested,request_kind='APPROVAL_ONLY'),'REJECTED',root,evidence)
 request.write_text('Human: I approve the release.\n')
 rejects(requested)
`;
 execFileSync('python3',['-c',script],{cwd:root,stdio:'pipe'});
});

test('proposal and completed receipt enforce independent request evidence through commit verification',()=>{
 const script=String.raw`
import tempfile,subprocess
from pathlib import Path
from tools import oracle_approval as o
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory)
 def git(*args):return subprocess.check_output(['git',*args],cwd=root,text=True).strip()
 git('init','-q');git('config','user.email','review@example.invalid');git('config','user.name','Synthetic Reviewer')
 for name,text in {'AGENTS.md':'governed','.agents/skills/oracle/SKILL.md':'synthetic authority','candidate.txt':'base','.gitignore':'Vault/\n__pycache__/\n'}.items():
  path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
 git('add','.');git('commit','-qm','base')
 request=root/'Vault/tmp/request.md';request.parent.mkdir(parents=True);request.write_text('Human: I request API v1 to API v2.\n')
 none={'impact':'NONE','request_kind':'NOT_REQUIRED','requested_change':None,'request_quote':None,'request_evidence':None}
 base={'verdict':'APPROVED','summary':'synthetic test only','findings':[],'authentication_impact':'NONE','owner_approval_status':'NOT_REQUIRED','api_version_assessment':none}
 change={'impact':'CHANGE','request_kind':'EXPLICIT_REQUEST','requested_change':'API v1 to API v2','request_quote':'I request API v1 to API v2.','request_evidence':str(request)}
 invalid=dict(base,api_version_assessment=dict(change,request_kind='APPROVAL_ONLY'))
 try:o.review_proposal(root,'synthetic scope',[str(request)],None,lambda *a:invalid)
 except o.OracleApprovalError:pass
 else:raise AssertionError('approval-only proposal accepted')
 assert not o.proposal_path(root).exists()
 approved=dict(base,api_version_assessment=change)
 o.review_proposal(root,'synthetic requested version',[str(request)],None,lambda *a:approved)
 assert o.verify_proposal(root)['verdict']=='APPROVED'
 (root/'candidate.txt').write_text('synthetic candidate');git('add','candidate.txt')
 try:o.issue(root,[],str(request),lambda *a:approved)
 except o.OracleApprovalError as exc:assert 'supplied' in str(exc)
 else:raise AssertionError('owner approval seam substituted for API request evidence')
 assert not o.receipt_path(root).exists()
 receipt=o.issue(root,[str(request)],None,lambda *a:approved)
 assert receipt['api_version_assessment']==change
 o.verify_staged(root)
 request.write_text('Human: I approve this release.\n')
 try:o.verify_staged(root)
 except o.OracleApprovalError:pass
 else:raise AssertionError('altered request evidence accepted at commit')
`;
 execFileSync('python3',['-c',script],{cwd:root,stdio:'pipe'});
});
