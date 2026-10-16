import { withOracleFixture } from "./oracle-fixture.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;
const python = (script) => execFileSync("python3", ["-c", withOracleFixture(script)], { cwd: root, encoding: "utf8" });

test("pruned discovery retains every canonical path and byte hash", () => {
  python(`
import tempfile
from pathlib import Path
from tools import vault_index as v
with tempfile.TemporaryDirectory() as directory:
    v.PROJECT_ROOT=Path(directory); v.VAULT_ROOT=v.PROJECT_ROOT/'Vault'
    names=['docs/a.md','docs/B.JSON','docs/empty.txt','docs/ignored.png','nested/design.html']
    names += [f'{part}/hidden.md' for part in v.EXCLUDED_PARTS]
    names += [f'docs/{part}/deep/hidden.md' for part in v.EXCLUDED_PARTS]
    for name in names:
        path=v.VAULT_ROOT/name; path.parent.mkdir(parents=True,exist_ok=True); path.write_text(name)
    (v.VAULT_ROOT/'docs/link.md').symlink_to(v.VAULT_ROOT/'docs/a.md')
    (v.VAULT_ROOT/'directory-link').symlink_to(v.VAULT_ROOT/'nested',target_is_directory=True)
    expected={p.relative_to(v.PROJECT_ROOT).as_posix():v.file_digest(p)
              for p in sorted(v.VAULT_ROOT.rglob('*')) if p.is_file() and p.suffix.lower() in v.TEXT_SUFFIXES
              and not any(part in v.EXCLUDED_PARTS for part in p.relative_to(v.VAULT_ROOT).parts)}
    assert v.snapshot()==expected, (v.snapshot(),expected)
`);
});

test("incremental preparation reuses identical bytes and invalidates changed configuration", () => {
  python(`
import tempfile,json
from pathlib import Path
from tools import vault_index as v
class Collection:
    def __init__(self): self.rows={}; self.upserts=0
    def get(self,include): return {'ids':list(self.rows),'metadatas':[r[1] for r in self.rows.values()]}
    def count(self): return len(self.rows)
    def delete(self,ids):
        for key in ids: self.rows.pop(key)
    def upsert(self,ids,documents,metadatas):
        self.upserts+=1
        self.rows.update({key:(doc,meta) for key,doc,meta in zip(ids,documents,metadatas)})
    def query(self,**kwargs):
        rows=list(self.rows.values())[:kwargs['n_results']]
        return {'documents':[[r[0] for r in rows]],'metadatas':[[r[1] for r in rows]],'distances':[[0]*len(rows)]}
with tempfile.TemporaryDirectory() as directory:
    v.PROJECT_ROOT=Path(directory);v.VAULT_ROOT=v.PROJECT_ROOT/'Vault';v.MANIFEST_DIR=v.VAULT_ROOT/'index/manifests'
    source=v.VAULT_ROOT/'docs/a.md';source.parent.mkdir(parents=True);source.write_text('canonical bytes')
    collection=Collection();v.get_collection=lambda:collection
    config={'chunk_characters':v.CHUNK_CHARACTERS,'embedding':'synthetic-v1'};v.index_configuration=lambda:dict(config)
    first=v._sync_unlocked(quiet=True); count=collection.upserts
    original=(v.MANIFEST_DIR/'latest.json').read_bytes()
    second=v._sync_unlocked(quiet=True)
    assert second['changed_sources']==[] and collection.upserts==count
    assert (v.MANIFEST_DIR/'latest.json').read_bytes()==original
    config['embedding']='synthetic-v2'
    third=v._sync_unlocked(quiet=True)
    assert third['changed_sources']==['Vault/docs/a.md'] and collection.upserts>count
    matches=v._query_unlocked('canonical',1)
    assert matches[0]['source_sha256']==v.file_digest(source)
    assert matches[0]['chunk_sha256']==v.hashlib.sha256(b'canonical bytes').hexdigest()
    key=next(iter(collection.rows));doc,meta=collection.rows[key];collection.rows[key]=('corrupted chunk',meta)
    try: v._query_unlocked('canonical',1)
    except RuntimeError as exc: assert 'chunk' in str(exc)
    else: raise AssertionError('corrupt chunk accepted')
    source.write_text('changed canonical bytes')
    try: v._query_unlocked('canonical',1)
    except RuntimeError as exc: assert 'stale' in str(exc)
    else: raise AssertionError('stale index accepted')
`);
});

test("writer and reader locks cover child execution and reject competing writers", () => {
  python(`
import tempfile,subprocess,fcntl,json
from pathlib import Path
from tools import vault_index as v
with tempfile.TemporaryDirectory() as directory:
    v.SYNC_LOCK_FILE=Path(directory)/'access.lock'
    actual_run=subprocess.run
    def run(command,**kwargs):
        # This probe executes in another process, during the native child lifetime.
        probe="import fcntl,sys; f=open(sys.argv[1],'a+'); blocked=False\\ntry: fcntl.flock(f,fcntl.LOCK_EX|fcntl.LOCK_NB)\\nexcept BlockingIOError: blocked=True\\nassert blocked"
        completed=actual_run(['python3','-c',probe,str(v.SYNC_LOCK_FILE)],capture_output=True,text=True)
        assert completed.returncode==0,completed.stderr
        assert kwargs['pass_fds'] and '--native-worker-lock-fd' in command
        return subprocess.CompletedProcess(command,0,'{}','')
    v.subprocess.run=run
    assert v._native_operation(['sync'])=={}
    assert v._native_operation(['query','text'])=={}
    with v.SYNC_LOCK_FILE.open('a+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
`);
});

test("native lock exclusion remains through inherited child teardown after parent exit", () => {
  python(`
import tempfile,subprocess,time,fcntl,os,signal
from pathlib import Path
with tempfile.TemporaryDirectory() as directory:
    root=Path(directory);lock=root/'lock';ready=root/'ready';release=root/'release'
    child="import pathlib,sys,time;pathlib.Path(sys.argv[1]).write_text('ready');\\nwhile not pathlib.Path(sys.argv[2]).exists(): time.sleep(.01)"
    parent="import fcntl,subprocess,sys,time;f=open(sys.argv[1],'a+');fcntl.flock(f,fcntl.LOCK_EX);subprocess.Popen(['python3','-c',sys.argv[4],sys.argv[2],sys.argv[3]],pass_fds=(f.fileno(),));time.sleep(20)"
    process=subprocess.Popen(['python3','-c',parent,str(lock),str(ready),str(release),child])
    try:
        deadline=time.monotonic()+5
        while not ready.exists() and time.monotonic()<deadline: time.sleep(.01)
        assert ready.exists()
        process.terminate();process.wait(timeout=5)
        with lock.open('a+') as probe:
            try: fcntl.flock(probe,fcntl.LOCK_EX|fcntl.LOCK_NB)
            except BlockingIOError: pass
            else: raise AssertionError('child lifetime lock disappeared with parent')
        release.write_text('exit')
        deadline=time.monotonic()+5
        with lock.open('a+') as probe:
            while True:
                try: fcntl.flock(probe,fcntl.LOCK_EX|fcntl.LOCK_NB);break
                except BlockingIOError:
                    assert time.monotonic()<deadline;time.sleep(.01)
    finally:
        release.write_text('exit')
        if process.poll() is None: process.terminate();process.wait(timeout=5)
`);
});

test("proposal verification and completed review reject mutable authorities, evidence, tree and Vault", () => {
  python(`
import tempfile,subprocess,shutil
from pathlib import Path
from tools import oracle_approval as o
repository=Path.cwd()
review={'verdict':'APPROVED','findings':[],'authentication_impact':'NONE','owner_approval_status':'NOT_REQUIRED','api_version_assessment':{'impact':'NONE','request_kind':'NOT_REQUIRED','requested_change':None,'request_quote':None,'request_evidence':None}}
with tempfile.TemporaryDirectory() as directory:
    root=Path(directory)
    def git(*args): return subprocess.check_output(['git',*args],cwd=root,text=True).strip()
    git('init','-q');git('config','user.name','Synthetic Reviewer');git('config','user.email','review@example.invalid')
    for name,text in {'AGENTS.md':'governed','.agents/skills/oracle/SKILL.md':'synthetic authority',
                      'candidate.txt':'base','.gitignore':'Vault/\\n__pycache__/\\n'}.items():
        path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
    git('add','.');git('commit','-qm','base')
    evidence=root/'Vault/tmp/validation.json';evidence.parent.mkdir(parents=True);evidence.write_text('{}')
    authority=root/'Vault/docs/CONSTITUTION.md';authority.parent.mkdir(parents=True);authority.write_text('authority')
    o.review_proposal(root,'Problem: slow; Cause: repeated prep; Recommended change: coherent prep',[str(evidence)],None,lambda *a:review)
    assert o.verify_proposal(root)['verdict']=='APPROVED'
    authority.write_text('changed')
    try:o.verify_proposal(root)
    except o.OracleApprovalError as exc:assert 'authority' in str(exc)
    else:raise AssertionError('changed proposal authority accepted')
    authority.write_text('authority')
    candidate=root/'candidate.txt';candidate.write_text('candidate');git('add','candidate.txt')
    o.issue(root,[str(evidence)],None,lambda *a:review)
    assert o.receipt_path(root).exists()
    for target,changed in [(evidence,'changed evidence'),(authority,'changed authority'),(candidate,'changed candidate')]:
        original=target.read_text()
        def drift(*args):target.write_text(changed);return review
        try:o.issue(root,[str(evidence)],None,drift)
        except o.OracleApprovalError as exc:assert 'changed' in str(exc)
        else:raise AssertionError('changed inputs accepted')
        assert not o.receipt_path(root).exists()
        target.write_text(original)
    knowledge=root/'Vault/specs/design.md';knowledge.parent.mkdir(parents=True)
    def vault_drift(*args):knowledge.write_text('new knowledge');return review
    try:o.issue(root,[str(evidence)],None,vault_drift)
    except o.OracleApprovalError as exc:assert 'changed' in str(exc)
    else:raise AssertionError('Vault drift accepted')
    assert not o.receipt_path(root).exists()
    knowledge.unlink()
    base=git('rev-parse','HEAD')
    def base_drift(*args):git('commit','-qm','concurrent base change');return review
    try:o.issue(root,[str(evidence)],None,base_drift)
    except o.OracleApprovalError as exc:assert 'changed' in str(exc)
    else:raise AssertionError('base drift accepted')
    git('reset','--soft',base)
    def staged_drift(*args):candidate.write_text('concurrent staged change');git('add','candidate.txt');return review
    try:o.issue(root,[str(evidence)],None,staged_drift)
    except o.OracleApprovalError as exc:assert 'changed' in str(exc)
    else:raise AssertionError('staged tree drift accepted')
    assert not o.receipt_path(root).exists()
`);
});

test("same-worktree concurrent review is rejected without overwriting active state", () => {
  python(`
import tempfile,subprocess,fcntl
from pathlib import Path
from tools import oracle_approval as o
with tempfile.TemporaryDirectory() as directory:
    root=Path(directory);subprocess.run(['git','init','-q',str(root)],check=True)
    state=o.receipt_path(root).parent;state.mkdir(parents=True)
    lock=(state/'review.lock').open('a+');fcntl.flock(lock,fcntl.LOCK_EX)
    script="from pathlib import Path;from tools import oracle_approval as o;\\ntry:o.review_proposal(Path(__import__('sys').argv[1]),'proposal',[],None,lambda *a:{})\\nexcept o.OracleApprovalError as exc:assert 'active' in str(exc)\\nelse:raise AssertionError('concurrent review accepted')"
    result=subprocess.run(['python3','-c',script,str(root)],capture_output=True,text=True)
    assert result.returncode==0,result.stderr
    assert not o.proposal_path(root).exists()
`);
});

test("receipts retain actual structured reviewer process settings without pinning future task models", () => {
  python(`
import tempfile,subprocess,json,shutil
from pathlib import Path
from tools import oracle_approval as o
repository=Path.cwd();approved={'verdict':'APPROVED','findings':[],'authentication_impact':'NONE','owner_approval_status':'NOT_REQUIRED','api_version_assessment':{'impact':'NONE','request_kind':'NOT_REQUIRED','requested_change':None,'request_quote':None,'request_evidence':None}}
with tempfile.TemporaryDirectory() as directory:
    root=Path(directory)
    def git(*args):return subprocess.check_output(['git',*args],cwd=root,text=True).strip()
    git('init','-q');git('config','user.name','Synthetic Reviewer');git('config','user.email','review@example.invalid')
    for name,text in {'AGENTS.md':'governed','.agents/skills/oracle/SKILL.md':'synthetic authority',
                      '.agents/skills/oracle/review-output.schema.json':'{}','candidate.txt':'base',
                      '.gitignore':'Vault/\\n__pycache__/\\n'}.items():
        path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
    (root/'tools').mkdir();shutil.copy(repository/'tools/codex_child_model.py',root/'tools/codex_child_model.py')
    git('add','.');git('commit','-qm','base')
    original_run=subprocess.run
    def child(command,**kwargs):
        if command[0]!='codex':return original_run(command,**kwargs)
        assert '--ephemeral' in command and '--ignore-user-config' in command
        assert any(item.startswith('developer_instructions=') and 'independent' in item for item in command)
        assert command[command.index('--sandbox')+1]=='danger-full-access'
        assert kwargs['env']['CODEX_SELECTED_MODEL']=='actual-caller-model'
        assert o.LOCAL_EXECUTION_POLICY in command[-1]
        result=dict(approved,review_status='COMPLETE',coverage=[],validations=[],resolutions=[],limitations=[],repair_plan='')
        context=o._RUN.get()/'review-context.json'
        if context.is_file():result=_oracle_fixture_result(approved,json.loads(context.read_text()))
        Path(command[command.index('--output-last-message')+1]).write_text(json.dumps(result))
        return subprocess.CompletedProcess(command,0,'retained stdout','retained stderr')
    o.subprocess.run=child;o.selected_model=lambda:'actual-caller-model'
    o.review_proposal(root,'Problem: repeated; Cause: setup; Recommended change: combined',[],None)
    candidate=root/'candidate.txt';candidate.write_text('candidate');git('add','candidate.txt')
    def vault(*args):
        path=o._RUN.get()/'vault-query.json';path.write_text('{}');return path
    o._vault_evidence=vault
    receipt=o.issue(root,[],None)
    settings=[name for name in receipt['validation_evidence'] if Path(name).name=='model.json']
    assert len(settings)==1
    metadata=json.loads((root/settings[0]).read_text())
    assert metadata['selected_model']=='actual-caller-model' and metadata['sandbox']=='danger-full-access'
    assert metadata['ephemeral'] and metadata['ignore_user_config']
    assert len(metadata['schema_sha256'])==64 and len(metadata['model_helper_sha256'])==64
    o.selected_model=lambda:'future-task-model'
    o._environment_digest=lambda:'later-git-hook-launcher-environment'
    o.verify_staged(root)
`);
});

test("durable telemetry preserves failures, logical verdicts and unstarted phases", () => {
  python(`
import tempfile,subprocess,json
from pathlib import Path
from tools import oracle_approval as o
with tempfile.TemporaryDirectory() as directory:
    root=Path(directory);subprocess.run(['git','init','-q',str(root)],check=True)
    @o._serialized_review
    def measured(root,scenario):
        with o._phase('precheck_seconds'):
            if scenario=='precheck':raise o.OracleApprovalError('synthetic precheck')
        def child():
            if scenario=='timeout':raise subprocess.TimeoutExpired('synthetic-child',1)
            return {'verdict':scenario}
        return o._timed('reviewer_seconds',child)
    for scenario in ['APPROVED','REJECTED','precheck','timeout']:
        try:result=measured(root,scenario)
        except (o.OracleApprovalError,subprocess.TimeoutExpired):assert scenario in {'precheck','timeout'}
        else:assert result['verdict']==scenario
    records=[]
    for run in (o.receipt_path(root).parent/'runs').iterdir():
        timing=json.loads((run/'timings.json').read_text());outcome=json.loads((run/'outcome.json').read_text())
        assert timing['total_seconds']>=timing['precheck_seconds']>=0
        assert outcome['started_at']<=outcome['finished_at']
        if outcome['error'] and outcome['error']['message']=='synthetic precheck':
            assert 'reviewer_seconds' not in timing and not outcome['reviewer_invoked']
        else:assert timing['reviewer_seconds']>=0 and outcome['reviewer_invoked']
        records.append(outcome['outcome'])
    assert sorted(records)==['APPROVED','ERROR','ERROR','REJECTED']
    # The actual public issue precondition also records a failed precheck.
    (root/'pending.txt').write_text('unstaged candidate')
    try:o.issue(root,[],None)
    except o.OracleApprovalError as exc:assert 'requires every' in str(exc)
    else:raise AssertionError('pending source accepted')
    run=next(run for run in (o.receipt_path(root).parent/'runs').iterdir() if run.name.startswith('issue-'))
    timing=json.loads((run/'timings.json').read_text());outcome=json.loads((run/'outcome.json').read_text())
    assert timing['precheck_seconds']>=0 and outcome['outcome']=='ERROR' and not outcome['reviewer_invoked']
`);
});
