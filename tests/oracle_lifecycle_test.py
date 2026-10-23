"""Real process admission/observation and exact-candidate catch-up regressions."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import oracle_approval as o
from tools import oracle_lifecycle as lifecycle
from tools import shipment_state
from tools import publication_admission as publication
import oracle_review_series as fixtures


CHILD = r'''
from pathlib import Path
import os,sys,time,json
from tools import oracle_approval as o
root=Path(sys.argv[1]).resolve()
@o._serialized_review
def issue(root,evidence,owner):
    with (root/'.git/oracle/invocations').open('a') as f:f.write(str(os.getpid())+'\n')
    (root/'.git/oracle/entered').write_text('entered')
    if sys.argv[2]=='die':os._exit(7)
    time.sleep(1)
    return {'verdict':'APPROVED','owner':os.getpid()}
print(json.dumps(issue(root,[],None)),flush=True)
'''


class Lifecycle(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        subprocess.run(['git','init','-q',str(self.root)],check=True)
        for args in [('config','user.name','Synthetic Reviewer'),('config','user.email','review@example.invalid'),
                     ('commit','--allow-empty','-qm','base'),('branch','-M','main')]:
            subprocess.run(['git',*args],cwd=self.root,check=True)
        self.env = dict(os.environ, PYTHONPATH=str(Path(__file__).resolve().parents[1]),
                        CODEX_THREAD_ID='', CODEX_SELECTED_MODEL='synthetic-model',
                        CODEX_SELECTED_REASONING_EFFORT='low')
        self.children = []
        self.addCleanup(self.stop)

    def stop(self):
        for p in self.children:
            if p.poll() is None:p.kill()
            p.communicate()

    def start(self, mode='normal'):
        p=subprocess.Popen([sys.executable,'-c',CHILD,str(self.root),mode],env=self.env,
                           stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.children.append(p)
        return p

    def entered(self):
        deadline=time.monotonic()+5
        while not (self.root/'.git/oracle/entered').exists():
            if time.monotonic()>deadline:self.fail('Owner did not enter native attempt')
            time.sleep(.02)

    def finish(self,p):
        stdout,stderr=p.communicate(timeout=10)
        self.assertEqual(p.returncode,0,stderr)
        return json.loads(stdout)

    def test_simultaneous_callers_share_one_real_parent(self):
        a,b=self.start(),self.start()
        self.assertEqual(self.finish(a),self.finish(b))
        self.assertEqual(len((self.root/'.git/oracle/invocations').read_text().splitlines()),1)
        self.assertEqual(len(list((self.root/'.git/oracle/controllers/admissions').iterdir())),1)

    def test_controller_exec_preserves_birth_identity_and_recycled_pid_is_rejected(self):
        identity={'pid':123456,'process_identity':'Fri Oct 23 10:27:01 2026 /synthetic/old-launcher','controller_id':'synthetic'}
        with patch.object(lifecycle,'process_identity',return_value='Fri Oct 23 10:27:01 2026 /synthetic/new-launcher'), \
                patch.object(lifecycle,'process_birth',return_value='Fri Oct 23 10:27:01 2026'):
            self.assertTrue(lifecycle._alive(identity))
        with patch.object(lifecycle,'process_birth',return_value='Fri Oct 23 11:27:01 2026'):
            self.assertFalse(lifecycle._alive(identity))

    def test_independent_proposal_does_not_replace_or_wait_on_live_source_reviewer(self):
        owner = self.start()
        self.entered()
        original = next((self.root / '.git/oracle/controllers/admissions').iterdir()).read_bytes()
        script = '''
from pathlib import Path
import sys,json
from tools import oracle_approval as o
root=Path(sys.argv[1]).resolve()
@o._serialized_review
def review_proposal(root,request,evidence,owner):
    return {"verdict":"APPROVED","scope":request}
print(json.dumps(review_proposal(root,"independent new proposal",[],None)))
'''
        proposal = subprocess.run([sys.executable, '-c', script, str(self.root)], env=self.env,
                                  capture_output=True, text=True, timeout=5)
        self.assertEqual(proposal.returncode, 0, proposal.stderr)
        self.assertEqual(json.loads(proposal.stdout)['scope'], 'independent new proposal')
        self.assertEqual(next((self.root / '.git/oracle/controllers/admissions').iterdir()).read_bytes(), original)
        self.assertEqual(len(list((self.root / '.git/oracle/controllers').glob('review_proposal-*-admissions'))), 1)
        self.finish(owner)

    def test_different_proposals_have_independent_live_admission_chains(self):
        script = '''
from pathlib import Path
import sys,json,time
from tools import oracle_approval as o
root=Path(sys.argv[1]).resolve()
@o._serialized_review
def review_proposal(root,request,evidence,owner):
    time.sleep(.3)
    return {"verdict":"APPROVED","scope":request}
print(json.dumps(review_proposal(root,sys.argv[2],[],None)))
'''
        first = subprocess.Popen([sys.executable, '-c', script, str(self.root), 'first independent scope'],
                                 env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        second = subprocess.Popen([sys.executable, '-c', script, str(self.root), 'second independent scope'],
                                  env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.children.extend([first, second])
        self.assertEqual(self.finish(first)['scope'], 'first independent scope')
        self.assertEqual(self.finish(second)['scope'], 'second independent scope')
        self.assertEqual(len(list((self.root / '.git/oracle/controllers').glob('review_proposal-*-admissions'))), 2)

    def test_observer_cancel_does_not_cancel_owner(self):
        owner=self.start();self.entered();observer=self.start()
        time.sleep(.2);observer.send_signal(__import__('signal').SIGINT)
        observer.communicate(timeout=5)
        self.assertNotEqual(observer.returncode,0)
        self.finish(owner)
        self.assertEqual(len((self.root/'.git/oracle/invocations').read_text().splitlines()),1)

    def test_dead_controller_is_retained_and_recovered(self):
        dead=self.start('die');dead.communicate(timeout=5)
        self.assertEqual(dead.returncode,7)
        self.finish(self.start())
        records=sorted((self.root/'.git/oracle/controllers/admissions').iterdir())
        self.assertEqual(len(records),2)
        original=json.loads(records[0].read_text())
        terminal=json.loads((Path(original['directory'])/'terminal.json').read_text())
        self.assertEqual(terminal['status'],'ERROR')
        self.assertIn('exited',terminal['error'])

    def test_live_parent_is_selected_before_new_validation(self):
        owner=self.start();self.entered()
        result=shipment_state.selection(self.root)
        self.assertEqual(result['state'],'REVIEW_IN_PROGRESS')
        self.assertEqual(result['controller']['identity']['pid'],owner.pid)
        self.assertIn('/runs/issue-',result['controller']['attempt'])
        self.finish(owner)

    def test_foreign_or_replaced_owner_record_cannot_attach(self):
        owner=self.start();self.entered()
        path=next((self.root/'.git/oracle/controllers/admissions').iterdir())
        value=json.loads(path.read_text());value['root']='/foreign/root';path.write_text(json.dumps(value))
        with self.assertRaisesRegex(o.OracleApprovalError,'identity'):
            lifecycle.active(o,self.root)
        self.finish(owner)

    def test_process_birth_mismatch_is_not_a_live_owner(self):
        owner=self.start();self.entered()
        with patch.object(lifecycle,'process_identity',return_value='reused PID with a different birth'):
            self.assertIsNone(lifecycle.active(o,self.root))
        self.finish(owner)

    def test_preexisting_native_cli_is_observed_before_any_new_parent(self):
        tool=self.root/'tools/oracle_approval.py';tool.parent.mkdir()
        tool.write_text('''from pathlib import Path
import fcntl,json,time,os
root=Path.cwd();directory=root/'.git/oracle';directory.mkdir()
with (directory/'review.lock').open('a+') as held:
 fcntl.flock(held,fcntl.LOCK_EX)
 run=directory/'runs/issue-legacy';run.mkdir(parents=True)
 (run/'model.json').write_text('{"selected_model":"synthetic-model"}')
 (run/'request.txt').write_text('Synthetic legacy native invocation')
 (directory/'entered').write_text('entered')
 deadline=time.monotonic()+8
 while not (directory/'release-legacy').exists() and time.monotonic()<deadline:time.sleep(.02)
 (run/'outcome.json').write_text('{"outcome":"APPROVED"}')
''')
        owner=subprocess.Popen([sys.executable,str(tool),'review'],cwd=self.root,env=self.env,
                               stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.children.append(owner);self.entered()
        observation=lifecycle.active(o,self.root)
        self.assertTrue(observation['legacy'])
        self.assertEqual(observation['identity']['pid'],owner.pid)
        follower=self.start()
        deadline=time.monotonic()+5
        while not list((self.root/'.git/oracle/legacy-observations').glob('*/identity.json')):
            if time.monotonic()>deadline:self.fail('Legacy observer did not attach')
            time.sleep(.02)
        self.assertFalse((self.root/'.git/oracle/invocations').exists())
        (self.root/'.git/oracle/release-legacy').write_text('release')
        self.assertEqual(owner.communicate(timeout=5)[1],'')
        self.finish(follower)
        outcomes=list((self.root/'.git/oracle/legacy-observations').glob('*/observed-outcome.json'))
        self.assertEqual(len(outcomes),1)
        self.assertEqual(json.loads(outcomes[0].read_text())['outcome'],'APPROVED')

    def test_attachment_completion_race_preserves_each_sealed_outcome(self):
        for outcome,exception in [('APPROVED',None),('REJECTED',o.OracleCandidateRejected),
                                  ('INCOMPLETE',o.OracleReviewIncomplete),('ERROR',o.OracleApprovalError)]:
            with self.subTest(outcome=outcome), patch.object(o,'_review_settings_binding',return_value={'model':'synthetic'}):
                token=o._METADATA_ROOT.set(self.root)
                try:
                    controller=lifecycle.Controller(o,self.root,'issue','completion-race');controller.claim()
                    def finish(*args):
                        if exception is None:
                            path=controller.directory/'native-result.json'
                            digest=lifecycle._publish(o,self.root,path,{'verdict':'APPROVED','identity':outcome})
                            lifecycle._finish(o,self.root,controller.identity,{'status':outcome,'result_path':str(path),'result_sha256':digest})
                        else:
                            lifecycle._finish(o,self.root,controller.identity,{'status':outcome,'error_type':exception.__name__,'error':'retained '+outcome})
                        controller.close()
                        raise ConnectionRefusedError('Owner completed after discovery')
                    with patch.object(lifecycle,'_request',side_effect=finish):
                        if exception:
                            with self.assertRaisesRegex(exception,'retained '+outcome):
                                lifecycle._follow(o,self.root,controller.identity,'issue','completion-race',[])
                        else:
                            self.assertEqual(lifecycle._follow(o,self.root,controller.identity,'issue','completion-race',[])['identity'],outcome)
                finally:
                    controller.close();o._METADATA_ROOT.reset(token)

    def test_active_completion_race_reselects_and_terminal_tampering_denies(self):
        with patch.object(o,'_review_settings_binding',return_value={'model':'synthetic'}):
            token=o._METADATA_ROOT.set(self.root)
            try:
                controller=lifecycle.Controller(o,self.root,'issue','completion-race');controller.claim()
                def finish(*args):
                    path=controller.directory/'native-result.json'
                    digest=lifecycle._publish(o,self.root,path,{'verdict':'APPROVED'})
                    lifecycle._finish(o,self.root,controller.identity,{'status':'APPROVED','result_path':str(path),'result_sha256':digest})
                    controller.close();raise ConnectionRefusedError('Completed')
                with patch.object(lifecycle,'_request',side_effect=finish):self.assertIsNone(lifecycle.active(o,self.root))
                (controller.directory/'native-result.json').write_text('{}')
                with self.assertRaisesRegex(o.OracleApprovalError,'result changed'):
                    lifecycle._follow(o,self.root,controller.identity,'issue','completion-race',[])
                with self.assertRaisesRegex(o.OracleApprovalError,'Incompatible'):
                    lifecycle._follow(o,self.root,controller.identity,'authorize','foreign',[])
            finally:
                controller.close();o._METADATA_ROOT.reset(token)

    def test_scoped_publication_authorizations_share_only_identical_requests(self):
        directory=self.root/'.git/oracle';directory.mkdir()
        for name in ['owner-a','owner-b','prior-a','prior-b','technical']:(directory/name).write_text('synthetic '+name)
        script=r"""
from pathlib import Path
import json,sys,time
from tools import oracle_approval as o
from tools import publication_admission as p
root=Path(sys.argv[1]);candidate,ref,owner,effect,prior=sys.argv[2:]
def plan(*args):
 value={'candidate_commit':candidate,'release_ref':ref,'technical_receipt_sha256':'a'*64,
        'protected_effects':{'active':[{'id':'effect-a'},{'id':'effect-b'}]}}
 return dict(value,plan_sha256=o._sha(o._canonical(value)))
p.plan=plan;p._covered_authorizations=lambda *args:(set(),[])
o._technical_archive=lambda *args:root/'.git/oracle/technical'
def reviewer(root,prompt,prefix,**kwargs):
 with (root/'.git/oracle/authorization-calls').open('a') as f:f.write(candidate+'\n')
 (root/'.git/oracle/authorization-entered').write_text('entered')
 end=time.monotonic()+10
 while not (root/'.git/oracle/release-authorization').exists() and time.monotonic()<end:time.sleep(.02)
 request=json.loads((o._RUN.get()/'authorization-inputs.json').read_text())
 result={'verdict':'APPROVED','review_status':'COMPLETE','plan_sha256':request['plan']['plan_sha256'],
         'authorized_effect_ids':request['requested_effect_ids'],'summary':'synthetic scoped decision'}
 for name,value in {'result.json':result,'process.json':{'exit_code':0},'model.json':{'synthetic':True}}.items():
  o._atomic_write(o._RUN.get()/name,o._pretty(value))
 o._atomic_write(o._RUN.get()/'request.txt',b'Synthetic authority fixture')
 return result
o._review_process=reviewer
try:print(json.dumps(p.authorize(root,candidate,ref,str(root/'.git/oracle'/owner),
 authorization=[root/'.git/oracle'/prior],effect_ids=[effect])),flush=True)
except o.OracleApprovalError as e:print(str(e),file=sys.stderr);sys.exit(2)
"""
        def start(values):
            child=subprocess.Popen([sys.executable,'-c',script,str(self.root),*values],env=self.env,
                                   stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
            self.children.append(child);return child
        original=['candidate-a','release/a','owner-a','effect-a','prior-a']
        owner=start(original);deadline=time.monotonic()+5
        while not (directory/'authorization-entered').exists():
            if time.monotonic()>deadline:self.fail('Scoped owner did not enter')
            time.sleep(.02)
        for index,value in enumerate(['candidate-b','release/b','owner-b','effect-b','prior-b']):
            changed=list(original);changed[index]=value
            child=start(changed);stdout,stderr=child.communicate(timeout=5)
            self.assertEqual(child.returncode,2,(changed,stdout,stderr))
            self.assertIn('Incompatible',stderr)
        same=start(original);time.sleep(.2)
        (directory/'release-authorization').write_text('release')
        self.assertEqual(self.finish(owner),self.finish(same))
        self.assertEqual(len((directory/'authorization-calls').read_text().splitlines()),1)
        request={'plan':{'candidate_commit':'a'},'owner_evidence':{'owner':'digest'},'requested_effect_ids':['effect-a']}
        forged={'authorization_request_sha256':o._sha(o._canonical(request)),'plan':request['plan'],
                'owner_evidence':request['owner_evidence'],'requested_effect_ids':['effect-b']}
        with self.assertRaisesRegex(o.OracleApprovalError,'scope'):
            publication._authorization_result(self.root,request,forged)

    def test_concurrent_immutable_result_publication_preserves_one_winner(self):
        barrier=threading.Barrier(2);actual=o._atomic_write;results=[]
        def prepared(path,raw):
            actual(path,raw)
            if path.name.startswith('.publish-'):barrier.wait(timeout=5)
        def publish(value):
            token=o._METADATA_ROOT.set(self.root)
            try:
                lifecycle._publish(o,self.root,self.root/'.git/oracle/result.json',{'winner':value})
                results.append(('published',value))
            except o.OracleApprovalError:results.append(('retained',value))
            finally:o._METADATA_ROOT.reset(token)
        with patch.object(o,'_atomic_write',side_effect=prepared):
            threads=[threading.Thread(target=publish,args=(value,)) for value in ['a','b']]
            for thread in threads:thread.start()
            for thread in threads:thread.join(timeout=6)
        self.assertEqual(sorted(kind for kind,_ in results),['published','retained'])
        winner=next(value for kind,value in results if kind=='published')
        self.assertEqual(json.loads((self.root/'.git/oracle/result.json').read_text()),{'winner':winner})

    def test_reviewer_registration_failure_closes_gate_and_cleans_process_group(self):
        token=o._METADATA_ROOT.set(self.root)
        controller=lifecycle.Controller(o,self.root,'issue','registration-failure');controller.claim()
        try:
            run=o._metadata_run(self.root,self.root/'.git/oracle/runs','issue-')
            for name in ['model.json','request.txt']:o._atomic_write(run/name,b'Synthetic invocation identity')
            marker=self.root/'reviewer-executed';observed=[];publish=lifecycle._publish
            def failed_registration(module,root,path,value):
                if path.parent.name=='children' and o.re.fullmatch(r'reviewer-[0-9a-f]{32}\.json',path.name):
                    observed.append(value);raise OSError('Synthetic registration publication failure')
                return publish(module,root,path,value)
            with patch.object(lifecycle,'_publish',side_effect=failed_registration):
                with self.assertRaisesRegex(OSError,'registration publication'):
                    lifecycle.reviewer_process(o,self.root,run,[sys.executable,'-c',
                        'from pathlib import Path;Path('+repr(str(marker))+').write_text("executed")'],self.env,controller)
            self.assertFalse(marker.exists(),'An unregistered reviewer must remain behind its execution gate')
            self.assertEqual(lifecycle._reviewer_group(observed[0]),[])
            failed=list((controller.directory/'children').glob('*.failure.json'))
            self.assertEqual(len(failed),1)
            self.assertEqual(json.loads(failed[0].read_text())['error_type'],'OSError')
        finally:
            controller.close();o._METADATA_ROOT.reset(token)

    def test_live_unavailable_listener_retains_error_without_replacing_owner(self):
        with patch.object(o,'_review_settings_binding',return_value={'model':'synthetic'}):
            token=o._METADATA_ROOT.set(self.root)
            controller=lifecycle.Controller(o,self.root,'issue','unavailable');controller.claim()
            try:
                with patch.object(lifecycle,'_request',side_effect=ConnectionRefusedError('Still live')):
                    with self.assertRaisesRegex(o.OracleApprovalError,'observation failed'):lifecycle.active(o,self.root)
                    with self.assertRaisesRegex(o.OracleApprovalError,'not observable'):
                        lifecycle._follow(o,self.root,controller.identity,'issue','unavailable',[])
                self.assertFalse((controller.directory/'terminal.json').exists())
                self.assertEqual(len(list((self.root/'.git/oracle/controllers/admissions').iterdir())),1)
            finally:
                controller.close();o._METADATA_ROOT.reset(token)

    def test_orphan_reviewer_blocks_duplicate_admission_until_its_group_ends(self):
        schema=self.root/'.agents/skills/oracle/review-output.schema.json'
        schema.parent.mkdir(parents=True);schema.write_text('{}')
        helper=self.root/'tools/codex_child_model.py'
        helper.parent.mkdir();helper.write_text('synthetic model helper')
        binary=self.root/'bin/codex';binary.parent.mkdir()
        binary.write_text('#!'+sys.executable+'\n'+r"""
import os,sys,time,json
from pathlib import Path
root=Path.cwd();(root/'.git/oracle/reviewer-pid').write_text(str(os.getpid()))
end=time.monotonic()+12
while not (root/'.git/oracle/release-reviewer').exists() and time.monotonic()<end:time.sleep(.02)
Path(sys.argv[sys.argv.index('--output-last-message')+1]).write_text('{"verdict":"APPROVED"}')
""")
        binary.chmod(0o755)
        env=dict(self.env,PATH=str(binary.parent)+os.pathsep+self.env['PATH'])
        script=CHILD.replace('time.sleep(1)', "o._review_process(root,'Synthetic no-network reviewer fixture','reviewer')")
        owner=subprocess.Popen([sys.executable,'-c',script,str(self.root),'normal'],env=env,
                               stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.children.append(owner)
        marker=self.root/'.git/oracle/reviewer-pid';deadline=time.monotonic()+5
        while not marker.exists():
            if time.monotonic()>deadline:self.fail('Synthetic native reviewer did not start')
            time.sleep(.02)
        reviewer=int(marker.read_text());birth=lifecycle.process_identity(reviewer)
        try:
            owner.terminate();owner.wait(timeout=5)
            follower=self.start();time.sleep(.5)
            self.assertEqual(len((self.root/'.git/oracle/invocations').read_text().splitlines()),1,
                             'A reviewer OS child still runs for the interrupted native owner')
            selected=lifecycle.active(o,self.root)
            self.assertTrue(selected['orphaned_children'])
            (self.root/'.git/oracle/release-reviewer').write_text('release')
            self.finish(follower)
            records=sorted((self.root/'.git/oracle/controllers/admissions').iterdir())
            first=json.loads(records[0].read_text())
            terminal=json.loads((Path(first['directory'])/'terminal.json').read_text())
            self.assertEqual(terminal['status'],'ERROR')
            self.assertEqual(len(records),2)
        finally:
            (self.root/'.git/oracle/release-reviewer').write_text('release')
            owner.communicate(timeout=5)
            if lifecycle.process_identity(reviewer)==birth:
                try:os.kill(reviewer,__import__('signal').SIGTERM)
                except ProcessLookupError:pass

    def test_producer_commit_reexecs_same_process_owner_and_evidence(self):
        tool=self.root/'tools/oracle_approval.py';tool.parent.mkdir()
        tool.write_text('''VERSION = 'before'
from pathlib import Path
import json,os,subprocess,sys
from tools import oracle_approval as o
from tools import shipment_state
root=Path.cwd()
o._series_directory=lambda root,base:root/'.git/oracle/series/synthetic-series'
shipment_state.record_validated=lambda root,**kwargs:{'last_validated_commit':o._git(root,'rev-parse','HEAD').strip()}
@o._serialized_review
def issue(root,evidence,owner):
 controller=o._CONTROLLER.get()
 with (root/'.git/oracle/producer-turns').open('a') as f:
  f.write(json.dumps({'pid':os.getpid(),'controller':controller.identity['controller_id'],
   'version':VERSION,'evidence':evidence})+'\\n')
 if VERSION=='before':
  proof=root/'.git/oracle/new-evidence.txt';proof.write_text('bound observer evidence')
  controller.pending.put({'operation':'attach','evidence':o._files(root,[str(proof)])})
  path=Path(__file__);path.write_text(path.read_text().replace("VERSION = 'before'","VERSION = 'after'",1))
  subprocess.run(['git','add','tools/oracle_approval.py'],check=True)
  subprocess.run(['git','commit','-qm','concurrent producer correction'],check=True)
  raise o.OracleSourceBindingError('Synthetic producer committed during review')
 return {'verdict':'APPROVED','base_commit':o._git(root,'rev-parse','HEAD').strip()}
token=o._FOLLOW_COMMITS.set(True)
try:print(json.dumps(issue(root,[],None)),flush=True)
finally:o._FOLLOW_COMMITS.reset(token)
''')
        subprocess.run(['git','add','.'],cwd=self.root,check=True)
        subprocess.run(['git','commit','-qm','prepared producer'],cwd=self.root,check=True)
        child=subprocess.Popen([sys.executable,str(tool),'review'],cwd=self.root,env=self.env,
                               stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        self.children.append(child);self.finish(child)
        turns=[json.loads(x) for x in (self.root/'.git/oracle/producer-turns').read_text().splitlines()]
        self.assertEqual([x['version'] for x in turns],['before','after'])
        self.assertEqual({x['pid'] for x in turns},{child.pid})
        self.assertEqual(len({x['controller'] for x in turns}),1)
        self.assertIn('.git/oracle/new-evidence.txt',turns[1]['evidence'])
        self.assertEqual(len(list((self.root/'.git/oracle/controllers/admissions').iterdir())),1)


class CommittedCatchup(unittest.TestCase):
    def setUp(self):
        settings=patch.object(o,'_review_settings_binding',return_value={
            'model':'synthetic-model','reasoning_effort':'low'})
        settings.start();self.addCleanup(settings.stop)
        self.fixture=fixtures.ReviewSeries('runTest');self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.root=self.fixture.root
        self.fixture.git('branch','-M','main')
        self.fixture.git('commit','-qm','prepared candidate')

    def test_commit_during_review_continues_in_same_controller(self):
        calls=[]
        def reviewer(*args):
            context=json.loads((o._RUN.get()/'review-context.json').read_text())
            calls.append((o._CONTROLLER.get().identity['controller_id'],context))
            result=self.fixture.result(context)
            if len(calls)==1:
                self.fixture.change('peer.py','new peer committed during assessment')
                self.fixture.git('commit','-qm','concurrent normal commit')
            return result
        token=o._FOLLOW_COMMITS.set(True)
        try:o.issue(self.root,[str(self.fixture.evidence)],None,reviewer)
        finally:o._FOLLOW_COMMITS.reset(token)
        self.assertEqual(len(calls),2)
        self.assertEqual(calls[0][0],calls[1][0])
        records=o._read_rounds(o._series_directory(self.root,self.fixture.base))
        self.assertEqual(records[-2]['outcome'],'ERROR')
        self.assertEqual(records[-2]['raw_assessment']['reported_verdict'],'APPROVED')
        self.assertEqual(records[-1]['outcome'],'APPROVED')
        self.assertEqual(shipment_state._load(self.root)['last_validated_commit'],self.fixture.git('rev-parse','HEAD'))

    def test_late_checkpoint_commit_returns_to_affected_validation(self):
        calls=[];checkpoints=[];actual=shipment_state.record_validated
        def reviewer(*args):
            context=json.loads((o._RUN.get()/'review-context.json').read_text());calls.append(context)
            return self.fixture.result(context)
        def checkpoint(root, **kwargs):
            result=actual(root, **kwargs);checkpoints.append(result)
            if len(checkpoints)==1:
                self.fixture.change('peer.py','late checkpoint commit')
                self.fixture.git('commit','-qm','late authored commit')
            return result
        token=o._FOLLOW_COMMITS.set(True)
        try:
            with patch.object(shipment_state,'record_validated',side_effect=checkpoint):
                o.issue(self.root,[str(self.fixture.evidence)],None,reviewer)
        finally:o._FOLLOW_COMMITS.reset(token)
        self.assertEqual(len(calls),2)
        self.assertIn('source.py',{x['path'] for x in calls[1]['reusable_coverage']})
        self.assertEqual(shipment_state._load(self.root)['last_validated_commit'],self.fixture.git('rev-parse','HEAD'))

    def _assert_unadmitted_issuance(self, stage, *, same_candidate=False):
        attached=[];threads=[];entered=threading.Event();finished=threading.Event()
        def reviewer(*args):
            context=json.loads((o._RUN.get()/'review-context.json').read_text())
            return self.fixture.result(context)
        token=o._FOLLOW_COMMITS.set(True)
        try:
            original=o.issue(self.root,[str(self.fixture.evidence)],None,reviewer)
            checkpoint=shipment_state.checkpoint_path(self.root).read_bytes()
            original_digest=o._sha(o._pretty(original))
            if not same_candidate:
                self.fixture.change('peer.py','new candidate for '+stage)
                self.fixture.git('commit','-qm','new candidate')
            publish=lifecycle._publish
            follow=lifecycle._follow
            def observing_follow(*args):
                entered.set()
                return follow(*args)
            def failure(module,root,path,value):
                if path.name==stage and (value.get('status') in {'APPROVED','ADMITTED'} or value.get('verdict')=='APPROVED'):
                    if stage=='checkpoint-admission.json':
                        owner=o._CONTROLLER.get().identity
                        self.assertEqual(lifecycle.active(o,root)['identity']['controller_id'],owner['controller_id'])
                        def observer():
                            follow_token=o._FOLLOW_COMMITS.set(True)
                            try:attached.append(o.issue(root,[str(self.fixture.evidence)],None,reviewer))
                            except BaseException as exc:attached.append(exc)
                            finally:o._FOLLOW_COMMITS.reset(follow_token);finished.set()
                        thread=threading.Thread(target=observer);threads.append(thread);thread.start()
                        self.assertTrue(entered.wait(3),'Native caller did not select the pending owner')
                        self.assertFalse(finished.wait(.1))
                    raise OSError('Synthetic final issuance publication failure')
                return publish(module,root,path,value)
            save=shipment_state._save
            def save_failure(root,value):
                result=save(root,value)
                if stage=='checkpoint-write-after-effect':
                    raise OSError('Synthetic final issuance publication failure')
                return result
            with patch.object(lifecycle,'_publish',side_effect=failure), \
                    patch.object(lifecycle,'_follow',side_effect=observing_follow), \
                    patch.object(shipment_state,'_save',side_effect=save_failure):
                with self.assertRaisesRegex(OSError,'final issuance publication failure'):
                    o.issue(self.root,[str(self.fixture.evidence)],None,reviewer)
            self.assertEqual(shipment_state.checkpoint_path(self.root).read_bytes(),checkpoint)
            pending,raw=o._read_local(self.root)
            with self.assertRaises(o.OracleApprovalError):
                shipment_state.publication_eligibility(self.root,pending['base_commit'],pending['candidate_tree'],o._sha(raw))
            shipment_state.publication_eligibility(self.root,original['base_commit'],original['candidate_tree'],original_digest)
            if same_candidate:
                self.assertEqual(shipment_state.validated_receipt(self.root)[1],o._pretty(original))
            for thread in threads:thread.join(3)
            if threads:
                self.assertTrue(finished.is_set())
                self.assertEqual(len(attached),1)
                self.assertIsInstance(attached[0],o.OracleApprovalError)
                self.assertIn('final issuance publication failure',str(attached[0]))
                self.assertIsNone(lifecycle.active(o,self.root))
        finally:
            o._FOLLOW_COMMITS.reset(token)

    def test_native_result_failure_retains_complete_checkpoint_and_denies_new_issuance(self):
        self._assert_unadmitted_issuance('native-result.json')

    def test_terminal_failure_retains_complete_checkpoint_and_denies_new_issuance(self):
        self._assert_unadmitted_issuance('terminal.json')

    def test_failed_equivalent_issuance_preserves_same_candidate_original_receipt(self):
        self._assert_unadmitted_issuance('terminal.json',same_candidate=True)

    def test_checkpoint_admission_failure_restores_prior_complete_checkpoint(self):
        self._assert_unadmitted_issuance('checkpoint-admission.json')

    def test_checkpoint_write_failure_after_effect_restores_prior_complete_checkpoint(self):
        self._assert_unadmitted_issuance('checkpoint-write-after-effect')

    def test_attached_caller_waits_for_successful_checkpoint_admission(self):
        observed=[];threads=[];finished=threading.Event();entered=threading.Event();finish=lifecycle._finish
        follow=lifecycle._follow;calls=[]
        def observing_follow(*args):
            entered.set()
            return follow(*args)
        def reviewer(*args):
            calls.append(o._CONTROLLER.get().identity['controller_id'])
            context=json.loads((o._RUN.get()/'review-context.json').read_text())
            return self.fixture.result(context)
        def terminal(module,root,identity,value):
            result=finish(module,root,identity,value)
            if value.get('status')=='APPROVED':
                self.assertEqual(lifecycle.active(module,root)['identity']['controller_id'],identity['controller_id'])
                selected=shipment_state.selection(root)
                self.assertEqual(selected['state'],'REVIEW_IN_PROGRESS')
                self.assertEqual(selected['controller']['identity']['controller_id'],identity['controller_id'])
                def attached():
                    follow_token=o._FOLLOW_COMMITS.set(True)
                    try:observed.append(o.issue(root,[str(self.fixture.evidence)],None,reviewer))
                    except BaseException as exc:observed.append(exc)
                    finally:o._FOLLOW_COMMITS.reset(follow_token);finished.set()
                thread=threading.Thread(target=attached);threads.append(thread);thread.start()
                self.assertTrue(entered.wait(3),'Native caller bypassed the pending owner')
                self.assertFalse(finished.wait(.1),'Follower exposed a terminal before checkpoint admission')
            return result
        token=o._FOLLOW_COMMITS.set(True)
        try:
            with patch.object(lifecycle,'_finish',side_effect=terminal), \
                    patch.object(lifecycle,'_follow',side_effect=observing_follow):
                result=o.issue(self.root,[str(self.fixture.evidence)],None,reviewer)
        finally:o._FOLLOW_COMMITS.reset(token)
        for thread in threads:thread.join(2)
        self.assertTrue(finished.is_set())
        self.assertEqual(observed,[result])
        self.assertEqual(len(calls),1,'A second native caller dispatched a duplicate reviewer')
        self.assertEqual(len(list((self.root/'.git/oracle/controllers/admissions').iterdir())),1)
        self.assertEqual(shipment_state.validated_receipt(self.root)[1],o._pretty(result))

    def test_dead_pending_owner_recovers_checkpoint_through_status_and_claim(self):
        for selector in ('active','claim'):
            with self.subTest(selector=selector):
                controller=lifecycle.Controller(o,self.root,'issue','synthetic-recovery')
                self.assertIsNone(controller.claim())
                prior=shipment_state._save(self.root,{'last_validated_commit':'prior'})
                pending=dict(prior,last_validated_commit='new-unadmitted')
                digest='a'*64
                lifecycle._finish(o,self.root,controller.identity,{'status':'APPROVED','checkpoint_required':True,
                    'result_sha256':digest})
                lifecycle._publish(o,self.root,controller.directory/'checkpoint-before.json',{
                    'controller_id':controller.identity['controller_id'],'result_sha256':digest,
                    'previous_checkpoint':prior,'previous_sha256':o._sha(o._pretty(prior)),
                    'pending_payload_sha256':o._sha(o._canonical(lifecycle._checkpoint_payload(pending)))})
                shipment_state._save(self.root,pending)
                controller.close()
                if selector=='active':
                    self.assertIsNone(lifecycle.active(o,self.root))
                else:
                    replacement=lifecycle.Controller(o,self.root,'issue','synthetic-recovery')
                    try:self.assertIsNone(replacement.claim())
                    finally:replacement.close()
                self.assertEqual(shipment_state._load(self.root),prior)
                terminal=lifecycle._terminal(o,self.root,controller.identity)
                with self.assertRaisesRegex(o.OracleApprovalError,'exited before checkpoint admission'):
                    lifecycle.checkpoint_admitted(o,self.root,controller.identity,terminal)


if __name__=='__main__':unittest.main()
