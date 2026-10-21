"""Real process admission/observation and exact-candidate catch-up regressions."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import oracle_approval as o
from tools import oracle_lifecycle as lifecycle
from tools import shipment_state
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

    def test_producer_commit_reexecs_same_process_owner_and_evidence(self):
        tool=self.root/'tools/oracle_approval.py';tool.parent.mkdir()
        tool.write_text('''VERSION = 'before'
from pathlib import Path
import json,os,subprocess,sys
from tools import oracle_approval as o
from tools import shipment_state
root=Path.cwd()
o._series_directory=lambda root,base:root/'.git/oracle/series/synthetic-series'
shipment_state.record_validated=lambda root:{'last_validated_commit':o._git(root,'rev-parse','HEAD').strip()}
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
        def checkpoint(root):
            result=actual(root);checkpoints.append(result)
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


if __name__=='__main__':unittest.main()
