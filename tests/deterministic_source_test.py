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
    def git(self,*args):return subprocess.check_output(['git',*args],cwd=self.root,text=True,stderr=subprocess.DEVNULL).strip()
    def commit(self,message):self.git('add','-A');self.git('commit','-qm',message)
    def validate(self):return d.validate(self.root,self.base,'2020-01-01T00:00:00Z')
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
        with self.assertRaises(ValueError):self.validate()
    def test_outside_dependency_symlink_rejected(self):
        (self.root/'node_modules/escape').symlink_to(sys.executable)
        with self.assertRaisesRegex(ValueError,'escapes'):self.validate()
    def test_publisher_rejects_moved_baseline_before_push(self):
        value=self.validate();original=d.git;calls=[]
        def observed(root,*args):
            if args[:3]==('remote','get-url','--push'):return 'fixture-destination'
            if args[0]=='ls-remote':return 'f'*40+'\trefs/heads/main'
            return original(root,*args)
        with patch.object(d,'verify',return_value=value),patch.object(d,'git',side_effect=observed),patch.object(d.subprocess,'run',side_effect=lambda *a,**k:calls.append(a)):
            with self.assertRaisesRegex(ValueError,'base moved'):d.publish(self.root,'codex/source-docs')
        self.assertEqual(calls,[])

if __name__=='__main__':unittest.main()
