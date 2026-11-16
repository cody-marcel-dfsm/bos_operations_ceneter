"""Portable source admission executes commands and rejects changed custody/scope."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from tools import deterministic_source as d

class SourceAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)
        self.git('init','-q','-b','main');self.git('config','user.email','fixture@example.invalid');self.git('config','user.name','Fixture')
        (self.root/'.gitignore').write_text('node_modules/\n');(self.root/'node_modules').mkdir();(self.root/'node_modules/dependency').write_text('fixed bytes')
        (self.root/'AGENTS.md').write_text('Portable maintainer documentation\n');self.commit('base');self.base=self.git('rev-parse','HEAD')
        (self.root/'AGENTS.md').write_text('Portable maintainer documentation, corrected\n');self.commit('docs')
        self.commands=patch.object(d,'CHECKS',[[sys.executable,'-c','print("real execution")']]);self.commands.start();self.addCleanup(self.commands.stop)
        # The sealed-spec gate has its own real-fixture tests (oracle_spec_test.py); lane tests isolate lane custody.
        self.gate=patch.object(d.contract,'gate',return_value={'status':'DOCS_ONLY','paths':[]});self.gate.start();self.addCleanup(self.gate.stop)
    def git(self,*args):return subprocess.check_output(['git',*args],cwd=self.root,text=True,stderr=subprocess.DEVNULL).strip()
    def commit(self,message):self.git('add','-A');self.git('commit','-qm',message)
    def validate(self):return d.validate(self.root,self.base,'2020-01-01T00:00:00Z')
    def test_validation_contract_is_admitted_only_with_its_complete_test_module(self):
        self.commands.stop()
        try:
            self.assertIn('tests/validation_contract_test.py',d.ALLOWED);self.assertIn('tools/validation_contract.py',d.ALLOWED)
            self.assertTrue(any('validation_contract_test.py' in command for command in d.CHECKS))
            self.assertNotIn('tools/oracle_approval.py',d.ALLOWED)
        finally:self.commands.start()
    def test_real_execution_has_distinct_source_only_receipt(self):
        value=self.validate();self.assertEqual(value['status'],'VERIFIED');self.assertTrue(value['source_only']);self.assertEqual(value['sla_status'],'FAILED');self.assertNotIn('verdict',value);self.assertEqual(d.verify(self.root),value)
    def test_runtime_dependency_mutation_rejected(self):
        self.validate();(self.root/'node_modules/dependency').write_text('changed')
        with self.assertRaisesRegex(ValueError,'runtime'):d.verify(self.root)
    def test_dirty_source_rejected(self):
        self.validate();(self.root/'AGENTS.md').write_text('dirty')
        with self.assertRaisesRegex(ValueError,'Clean'):d.verify(self.root)
    def test_untracked_source_rejected(self):
        (self.root/'untracked').write_text('extra')
        with self.assertRaisesRegex(ValueError,'Clean'):self.validate()
    def test_output_tamper_rejected(self):
        value=self.validate();(d.directory(self.root)/(value['runs'][0]['output_sha256']+'.log')).write_text('changed')
        with self.assertRaisesRegex(ValueError,'output'):d.verify(self.root)
    def test_receipt_tamper_rejected(self):
        value=self.validate();path=d.directory(self.root)/(value['source']+'.json');v=json.loads(path.read_text());v['base']='0'*40;path.write_text(json.dumps(v))
        with self.assertRaisesRegex(ValueError,'receipt'):d.verify(self.root)
    def test_nonzero_execution_retains_failure(self):
        with patch.object(d,'CHECKS',[[sys.executable,'-c','raise SystemExit(7)']]):
            with self.assertRaisesRegex(ValueError,'Incomplete'):self.validate()
        self.assertEqual(len(list(d.directory(self.root).glob('*.failure.json'))),1)
        self.assertFalse((d.directory(self.root)/(self.git('rev-parse','HEAD')+'.json')).exists())
    def test_skipped_or_empty_test_summary_cannot_pass(self):
        for summary in ['Ran 1 test in 0.01s\n\nOK (skipped=1)', 'Ran 0 tests in 0.01s\n\nOK']:
            with patch.object(d,'CHECKS',[[sys.executable,'-c','print('+repr(summary)+')','unittest']]):
                with self.assertRaisesRegex(ValueError,'Incomplete'):self.validate()
    def test_reverted_product_change_still_rejected(self):
        (self.root/'package.json').write_text('{"version":"9"}');self.commit('product')
        (self.root/'package.json').unlink();self.commit('revert')
        with self.assertRaisesRegex(ValueError,'scope|maintenance'):self.validate()
    def test_selected_contract_cannot_be_overridden(self):
        (self.root/'tools').mkdir();(self.root/'tools/validation-selection.json').write_text('{}');self.commit('contract')
        self.gate.stop()
        try:
            with self.assertRaises(ValueError):self.validate()
        finally:self.gate.start()
    def test_every_admission_runs_the_spec_gate(self):
        self.validate();self.gate.target.gate.assert_called();self.assertEqual(self.gate.target.gate.call_args.args[1],self.base)
    def test_outside_dependency_symlink_rejected(self):
        (self.root/'node_modules/escape').symlink_to(sys.executable)
        with self.assertRaisesRegex(ValueError,'escapes'):self.validate()
    def test_publisher_rejects_moved_baseline_before_push(self):
        value=self.validate();original=d.git;calls=[]
        def observed(root,*args):
            if args[:3]==('remote','get-url','--push'):return 'https://github.com/'+d.REPOSITORY+'.git'
            if args[0]=='ls-remote':return 'f'*40+'\trefs/heads/main'
            return original(root,*args)
        with patch.object(d,'verify',return_value=value),patch.object(d,'git',side_effect=observed),patch.object(d.subprocess,'run',side_effect=lambda *a,**k:calls.append(a)):
            with self.assertRaisesRegex(ValueError,'base moved'):d.publish(self.root,'codex/source-docs')
        self.assertEqual(calls,[])

    def test_wrong_or_multiple_destinations_have_no_publication_effect(self):
        value=self.validate()
        for remote in ['https://example.invalid/wrong-owner.git',
                       'https://github.com/cody-marcel-dfsm/bos_operations_ceneter.git\nhttps://example.invalid/second.git']:
            calls=[]
            def observed(root, *args):
                return remote if args[0]=='remote' else value['base']+'\trefs/heads/main'
            with patch.object(d,'verify',return_value=value), patch.object(d,'git',side_effect=observed), patch.object(d.subprocess,'run',side_effect=lambda *a,**k:calls.append(a)):
                with self.assertRaisesRegex(ValueError,'exact public repository'):d.publish(self.root,'codex/source-docs')
            self.assertEqual(calls,[])

    def test_selected_actual_command_confines_eight_thread_sanity_environment(self):
        row={'category':'sanity','argv':[sys.executable,'-c',
             'import os,json;print(json.dumps({"privacy_coverage":{"io_threads":int(os.environ["UV_THREADPOOL_SIZE"])}}))'],
             'tests':[],'fixtures':[]}
        previous=os.environ.get('UV_THREADPOOL_SIZE')
        with patch.object(d,'selected_commands',return_value=[row]):
            entry,passed=d.execute_spec_category(self.root,self.base,self.git('rev-parse','HEAD'),d.directory(self.root),row,
                ci=True,environment_overrides={'UV_THREADPOOL_SIZE':'8'})
            self.assertTrue(passed);d.check_spec_environment(self.root,entry,d.directory(self.root),ci=True)
            self.assertEqual(os.environ.get('UV_THREADPOOL_SIZE'),previous)
            for override in ({'UV_THREADPOOL_SIZE':'12'},{'UV_THREADPOOL_SIZE':'8','OTHER':'value'},{}):
                with self.assertRaisesRegex(ValueError,'environment'):
                    d.execute_spec_category(self.root,self.base,self.git('rev-parse','HEAD'),d.directory(self.root),row,ci=True,environment_overrides=override)
            with self.assertRaisesRegex(ValueError,'Exact current'):
                d.execute_spec_category(self.root,self.base,self.git('rev-parse','HEAD'),d.directory(self.root),dict(row,argv=['unselected']),ci=True)
        for altered in (dict(entry,environment_overrides=None),dict(entry,environment_overrides={'UV_THREADPOOL_SIZE':'4'})):
            with self.assertRaisesRegex(ValueError,'environment'):d.check_spec_environment(self.root,altered,d.directory(self.root),ci=True)
        original=d.directory(self.root)/(entry['output_sha256']+'.log');original.write_text('altered')
        with self.assertRaisesRegex(ValueError,'custody'):d.check_spec_environment(self.root,entry,d.directory(self.root),ci=True)

    def test_selected_deadline_terminates_and_drains_its_owned_process_group(self):
        code='import subprocess,sys,time;child=subprocess.Popen([sys.executable,"-c","import time;time.sleep(30)"]);print(child.pid,flush=True);time.sleep(30)'
        row={'category':'interactions','argv':[sys.executable,'-c',code],'tests':[],'fixtures':[]}
        with patch.object(d,'selected_commands',return_value=[row]):
            entry,passed=d.execute_spec_category(self.root,self.base,self.git('rev-parse','HEAD'),d.directory(self.root),row,ci=True,timeout=.1)
            self.assertFalse(passed);self.assertEqual(entry['exit_code'],'TIMEOUT')
            raw=(d.directory(self.root)/(entry['output_sha256']+'.log')).read_bytes()
            child=int(raw.splitlines()[0]);state=subprocess.run(['ps','-p',str(child),'-o','state='],capture_output=True,text=True).stdout.strip()
            self.assertTrue(not state or state.startswith('Z'),state)
            for timeout in (0,901,True,float('inf')):
                with self.assertRaisesRegex(ValueError,'deadline'):
                    d.execute_spec_category(self.root,self.base,self.git('rev-parse','HEAD'),d.directory(self.root),row,ci=True,timeout=timeout)

    def test_selected_default_source_lane_preserves_serial_failure_output(self):
        rows=[{'category':name,'argv':[sys.executable,'-c','print("actual '+name+'");raise SystemExit('+str(code)+')'],
               'tests':[],'fixtures':[]} for name,code in [('sanity',7),('acceptance',0)]]
        with patch.object(d,'selected_commands',return_value=rows):
            with self.assertRaisesRegex(ValueError,'sanity'):
                d.spec_runs(self.root,self.base,self.git('rev-parse','HEAD'),d.directory(self.root),{'runs':[]},ci=True)
        failure=json.loads(next(d.directory(self.root).glob('*.failure.json')).read_bytes())
        self.assertEqual(len(failure['spec_runs']),1);self.assertEqual(failure['spec_runs'][0]['exit_code'],7)
        self.assertNotIn('environment_overrides',failure['spec_runs'][0])
        self.assertIn(b'actual sanity',(d.directory(self.root)/(failure['spec_runs'][0]['output_sha256']+'.log')).read_bytes())

if __name__=='__main__':unittest.main()
