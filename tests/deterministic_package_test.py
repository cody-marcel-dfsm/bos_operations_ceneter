"""Negative admission, completeness, custody and publication tests; no model calls."""
import json
import hashlib
import threading
import os
import time
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import deterministic_package as d


class PackageGateTests(unittest.TestCase):
    def setUp(self):
        scratch = Path(__file__).resolve().parents[1] / "Vault/tmp"
        scratch.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=scratch, prefix="dp-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.git('init', '-q', '-b', 'main')
        self.git('config', 'user.email', 'fixture@example.invalid')
        self.git('config', 'user.name', 'Fixture')
        (self.root / '.gitignore').write_text('node_modules/\n')
        (self.root / 'node_modules').mkdir()
        (self.root / 'node_modules/dependency').write_text('locked dependency')
        (self.root / 'package.json').write_text('{"version":"1.0.0"}')
        (self.root / 'AGENTS.md').write_text('base instructions')
        self.commit()
        self.base = self.git('rev-parse', 'HEAD')
        (self.root / 'AGENTS.md').write_text('changed instructions')
        self.commit()
        self.fixed_commands = d.CHECKS
        self.commands = patch.object(d, 'CHECKS', [[sys.executable, '-c', 'print("actual command")']])
        self.commands.start()
        self.addCleanup(self.commands.stop)
        # The sealed-spec gate has its own real-fixture tests (oracle_spec_test.py); lane tests isolate lane custody.
        self.gate = patch.object(d.contract, 'gate', return_value={'status': 'DOCS_ONLY', 'paths': []})
        self.gate.start()
        self.addCleanup(self.gate.stop)

    def real_gate(self):
        self.gate.stop()
        self.addCleanup(self.gate.start)

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, text=True,
                                       stderr=subprocess.DEVNULL).strip()

    def commit(self):
        self.git('add', '-A')
        self.git('commit', '-qm', 'fixture source')

    def validate(self):
        return d.validate(self.root, self.base, '2020-01-01T00:00:00Z')

    def scheduled_execution(self, *, bad_ready=False, bad_report=False, failed=False, mutate=False, io_threads=8, writers=1):
        self.enterContext(patch.object(d,'python_inventory',return_value=self.python_inventory(count=1)))
        before=d.native.identity(self.root); ready=threading.Event(); peers=threading.Event()
        lock=threading.Lock(); calls=[]; active=0; peak=0; peer_count=0
        def execute(root, command, channel=None, history=None):
            nonlocal active,peak,peer_count
            began=time.time()
            with lock:
                calls.append(command); active+=1;peak=max(peak,active)
            if channel:
                fd,token=channel
                row={'kind':'boc-privacy-snapshot-ready-v1','token':('0'*64 if bad_ready else token),
                     'source':before['source'],'tree':before['tree'],'files':1,'policy_sha256':'a'*64}
                os.write(fd,(json.dumps(row)+'\n').encode());os.close(fd)
                if not bad_ready: peers.wait(2)
                output=json.dumps({'privacy_coverage':{'source_commit':before['source'],'source_tree':before['tree'],
                    'files':2 if bad_report else 1,'policy_sha256':'a'*64,'io_threads':io_threads,'max_active_persistence':writers,'max_awaiting_persistence':1,'compact_persistence_bytes':65536}}).encode()
            else:
                if command in self.fixed_commands[5:]:
                    self.assertTrue(ready.is_set())
                    with lock:
                        peer_count+=1
                        if peer_count==3:peers.set()
                    peers.wait(2)
                    if mutate and command==self.fixed_commands[6]:(self.root/'AGENTS.md').write_text('concurrent mutation')
                if history is not None:
                    output=json.dumps({'publication_history':{'base':history[0],'source':history[1],
                        'status':'PASS','pairs':1,'inventory_sha256':'b'*64,'policy_sha256':'c'*64,'findings':[],'classifications':[]}}).encode()
                elif command == d.PYTHON_CHECK:
                    results=[{'module':module,'command':d.python_module_command(module),'exit_code':0,
                              'output':self.python_output(module,count=1),'wall_ms':1,
                              'temporary_directory_sha256':'d'*64} for module in d.PYTHON_UNITS]
                    output,_=d.python_category_output(before,results,inventory=self.python_inventory(count=1))
                else:
                    output=(b'# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n' if '--test-reporter=tap' in command else
                        b'Ran 1 test in 0.01s\n\nOK\n' if 'unittest' in command else b'synthetic completed command')
            time.sleep(.01)
            checksum=d.native.digest(output);path=d.directory(root)/(checksum+'.log')
            with lock:
                if not path.exists():d.native.private_write(path,output)
                active-=1
            return {'command':command,'exit_code':7 if failed and command==self.fixed_commands[6] else 0,
                    'output_sha256':checksum,'started_at':began,'completed_at':time.time()}
        original=d.await_privacy_snapshot
        def snapshot(*args):
            value=original(*args);ready.set();return value
        return execute,snapshot,calls,lambda:peak

    def test_parallel_category_waits_for_snapshot_preserves_order_and_all_real_results(self):
        execute,snapshot,calls,peak=self.scheduled_execution()
        with patch.object(d,'CHECKS',self.fixed_commands),patch.object(d,'execute_check',side_effect=execute),patch.object(d,'await_privacy_snapshot',side_effect=snapshot):
            value=self.validate();self.assertEqual(value['scheduling'],'source-prepared-privacy-snapshot-parallel/1')
            self.assertEqual([r['command']for r in value['runs']],self.fixed_commands)
            self.assertEqual(d.read_receipt(self.root),value)
        self.assertEqual(calls[:4],self.fixed_commands[:4]);self.assertEqual(len(calls),9);self.assertEqual(peak(),4)

    def test_parallel_failed_peer_retains_every_completed_output_and_prevents_receipt(self):
        execute,snapshot,calls,peak=self.scheduled_execution(failed=True)
        with patch.object(d,'CHECKS',self.fixed_commands),patch.object(d,'execute_check',side_effect=execute),patch.object(d,'await_privacy_snapshot',side_effect=snapshot):
            with self.assertRaisesRegex(ValueError,'check failed'):self.validate()
        record=json.loads(next(d.directory(self.root).glob('*.failure.json')).read_bytes())
        self.assertEqual(len(record['runs']),9);self.assertEqual(record['runs'][6]['exit_code'],7)
        self.assertTrue(all((d.directory(self.root)/(row['output_sha256']+'.log')).exists()for row in record['runs']))

    def test_parallel_wrong_snapshot_starts_no_peer_and_retains_failed_privacy(self):
        execute,snapshot,calls,peak=self.scheduled_execution(bad_ready=True)
        with patch.object(d,'CHECKS',self.fixed_commands),patch.object(d,'execute_check',side_effect=execute):
            with self.assertRaisesRegex(ValueError,'check failed'):self.validate()
        self.assertEqual(calls,self.fixed_commands[:5])
        record=json.loads(next(d.directory(self.root).glob('*.failure.json')).read_bytes())
        self.assertEqual(record['runs'][-1]['exit_code'],'READINESS_ERROR')

    def test_parallel_snapshot_result_mismatch_retains_all_outputs_and_rejects(self):
        execute,snapshot,calls,peak=self.scheduled_execution(bad_report=True)
        with patch.object(d,'CHECKS',self.fixed_commands),patch.object(d,'execute_check',side_effect=execute),patch.object(d,'await_privacy_snapshot',side_effect=snapshot):
            with self.assertRaisesRegex(ValueError,'check failed'):self.validate()
        record=json.loads(next(d.directory(self.root).glob('*.failure.json')).read_bytes())
        self.assertEqual(len(record['runs']),9);self.assertEqual(record['runs'][4]['exit_code'],'SNAPSHOT_RESULT_MISMATCH')

    def test_parallel_wrong_privacy_io_configuration_rejects_all_outputs(self):
        execute,snapshot,calls,peak=self.scheduled_execution(io_threads=4)
        with patch.object(d,'CHECKS',self.fixed_commands),patch.object(d,'execute_check',side_effect=execute),patch.object(d,'await_privacy_snapshot',side_effect=snapshot):
            with self.assertRaisesRegex(ValueError,'check failed'):self.validate()
        record=json.loads(next(d.directory(self.root).glob('*.failure.json')).read_bytes())
        self.assertEqual(len(record['runs']),9);self.assertEqual(record['runs'][4]['exit_code'],'SNAPSHOT_RESULT_MISMATCH')

    def test_parallel_overbound_persistence_report_prevents_receipt(self):
        execute,snapshot,calls,peak=self.scheduled_execution(writers=9)
        with patch.object(d,'CHECKS',self.fixed_commands),patch.object(d,'execute_check',side_effect=execute),patch.object(d,'await_privacy_snapshot',side_effect=snapshot):
            with self.assertRaisesRegex(ValueError,'check failed'):self.validate()
        record=json.loads(next(d.directory(self.root).glob('*.failure.json')).read_bytes())
        self.assertEqual(len(record['runs']),9);self.assertEqual(record['runs'][4]['exit_code'],'SNAPSHOT_RESULT_MISMATCH')

    def combined_execution(self, *, sanity_threads=8, snapshot_files=1, selected_fail=False):
        execute,snapshot,calls,peak=self.scheduled_execution()
        before=d.native.identity(self.root)
        report={'source_commit':before['source'],'source_tree':before['tree'],'files':1,'policy_sha256':'a'*64,
                'io_threads':sanity_threads,'max_active_persistence':1,'max_awaiting_persistence':1,'compact_persistence_bytes':65536}
        selected=[{'category':'sanity','argv':[sys.executable,'-c','import json;print(json.dumps({"privacy_coverage":'+repr(report)+'}))'],
                   'tests':[],'fixtures':[]}]
        for name in ('interactions','acceptance'):
            code='from pathlib import Path;import time;assert Path(".git/snapshot-published").is_file();time.sleep(.08);print("actual '+name+'");raise SystemExit('+str(7 if selected_fail and name=='interactions' else 0)+')'
            selected.append({'category':name,'argv':[sys.executable,'-c',code],'tests':[],'fixtures':[]})
        def ready(*args):
            value=snapshot(*args);(self.root/'.git/snapshot-published').write_text('ready')
            value['files']=snapshot_files;return value
        with patch.object(d,'CHECKS',self.fixed_commands),patch.object(d,'execute_check',side_effect=execute),patch.object(d,'await_privacy_snapshot',side_effect=ready),patch.object(d.native,'selected_commands',return_value=selected):
            result=d.run_complete_category(self.root,self.base,before,selected,ci=True)
            return before,result,calls

    def test_combined_selected_sanity_finishes_before_readiness_then_real_selected_jobs_overlap(self):
        before,(runs,selected,schedule,errors),calls=self.combined_execution()
        self.assertEqual(errors,[]);self.assertEqual(len(runs),9);self.assertEqual(len(selected),3)
        self.assertEqual([row['category'] for row in selected],['sanity','interactions','acceptance'])
        self.assertLess(max(row['started_at'] for row in selected[1:]),min(row['completed_at'] for row in selected[1:]))
        with patch.object(d,'CHECKS',self.fixed_commands):
            d.check_combined_schedule(self.root,before,runs,selected,schedule,ci=True)
            with self.assertRaisesRegex(ValueError,'schedule missing'):
                d.check_combined_schedule(self.root,before,runs,[{k:v for k,v in row.items() if k!='environment_overrides'} for row in selected],None,ci=True)
            for change in ('environment','ready','source','missing','output','sequential'):
                changed=json.loads(json.dumps(schedule));rows=json.loads(json.dumps(selected))
                if change=='environment':rows[0]['environment_overrides']={'UV_THREADPOOL_SIZE':'4'}
                if change=='ready':changed['ready_at']=0
                if change=='source':changed['snapshot']['source']='f'*40
                if change=='missing':rows.pop()
                if change=='output':rows[0]['output_sha256']='f'*64
                if change=='sequential':rows[2]['started_at']=rows[1]['completed_at']+.01;rows[2]['completed_at']=rows[2]['started_at']+.01
                with self.assertRaisesRegex(ValueError,'scheduling custody'):
                    d.check_combined_schedule(self.root,before,runs,rows,changed,ci=True)

    def test_combined_bad_sanity_environment_starts_no_privacy_or_independent_test(self):
        before,(runs,selected,schedule,errors),calls=self.combined_execution(sanity_threads=4)
        self.assertTrue(errors);self.assertEqual(calls,self.fixed_commands[:4]);self.assertEqual(len(selected),1)
        self.assertIsNone(schedule)

    def test_combined_snapshot_mismatch_starts_no_independent_test(self):
        before,(runs,selected,schedule,errors),calls=self.combined_execution(snapshot_files=2)
        self.assertTrue(errors);self.assertEqual(calls,self.fixed_commands[:5]);self.assertEqual(len(selected),1)
        self.assertIsNone(schedule)

    def test_combined_selected_failure_awaits_and_retains_every_real_result(self):
        before,(runs,selected,schedule,errors),calls=self.combined_execution(selected_fail=True)
        self.assertTrue(errors);self.assertEqual(len(runs),9);self.assertEqual(len(selected),3)
        self.assertEqual([row['exit_code'] for row in selected],[0,7,0])
        self.assertTrue(all((d.directory(self.root)/(row['output_sha256']+'.log')).exists() for row in selected))

    def test_report_bounds_require_exact_integer_configuration_and_bounded_waiting(self):
        original={'io_threads':8,'compact_persistence_bytes':65536,'max_active_persistence':8,'max_awaiting_persistence':8}
        self.assertEqual(d.privacy_report(json.dumps({'privacy_coverage':original}).encode()),original)
        for key in original:
            for value in [None,True,-1,8.0,9 if 'persistence' in key and key!='compact_persistence_bytes' else 0]:
                changed=dict(original,**{key:value})
                with self.assertRaises(ValueError):d.privacy_report(json.dumps({'privacy_coverage':changed}).encode())

    def test_snapshot_channel_rejects_missing_oversized_and_stale_identity(self):
        before=d.native.identity(self.root); token='b'*64
        correct={'kind':'boc-privacy-snapshot-ready-v1','token':token,'source':before['source'],
                 'tree':before['tree'],'files':1,'policy_sha256':'a'*64}
        bodies=[b'',b'x'*1025,b'{}\n',b'{malformed}\n']
        for key,value in [('source','0'*40),('tree','0'*40),('files',0),('policy_sha256','wrong')]:
            bodies.append((json.dumps(dict(correct,**{key:value}))+'\n').encode())
        for body in bodies:
            fd,writer=os.pipe()
            try:
                if body:os.write(writer,body)
                os.close(writer)
                with self.assertRaises((ValueError,TypeError)):d.await_privacy_snapshot(fd,token,before)
            finally:os.close(fd)

    def test_parallel_source_mutation_is_rejected_after_every_peer_completes(self):
        execute,snapshot,calls,peak=self.scheduled_execution(mutate=True)
        with patch.object(d,'CHECKS',self.fixed_commands),patch.object(d,'execute_check',side_effect=execute),patch.object(d,'await_privacy_snapshot',side_effect=snapshot):
            with self.assertRaisesRegex(ValueError,'Clean|changed'):self.validate()
        self.assertEqual(len(calls),9)

    def test_actual_execution_and_distinct_verified_receipt(self):
        value = self.validate()
        self.assertEqual(value['status'], 'VERIFIED')
        self.assertEqual(value['sla_status'], 'BREACHED')
        self.assertFalse(value['deployment_authorized'])
        self.assertNotIn('verdict', value)
        self.assertEqual(d.read_receipt(self.root), value)

    def test_unknown_original_clock_cannot_become_sla_success(self):
        value = d.validate(self.root, self.base, 'unknown')
        self.assertEqual(value['request_started_at'], 'unknown')
        self.assertEqual(value['sla_status'], 'BREACHED_ORIGINAL_TIME_UNAVAILABLE')

    def test_later_failure_revokes_old_success_and_repair_preserves_history(self):
        value = self.validate()
        command = d.CHECKS[0]
        failed = subprocess.CompletedProcess(command, 7, b'actual failed retry', b'')
        store = d.directory(self.root)
        with patch.object(d.subprocess, 'run', return_value=failed):
            # Keep the synthetic input observations outside this command-only stub.
            with patch.object(d.native, 'identity', return_value={k: value[k] for k in ('source', 'tree', 'runtime')}), \
                    patch.object(d, 'scope', return_value=value['paths']), \
                    patch.object(d, 'directory', return_value=store):
                with self.assertRaisesRegex(ValueError, 'check failed'):
                    self.validate()
        with self.assertRaisesRegex(ValueError, 'later failed'):
            d.read_receipt(self.root)
        repaired = self.validate()
        self.assertEqual(repaired['status'], 'VERIFIED')
        self.assertEqual(len(list(d.directory(self.root).glob('*.failure.json'))), 1)
        self.assertTrue((d.directory(self.root) / (value['source'] + '.json')).exists())

    def test_dirty_and_untracked_source_refused(self):
        for path in ('AGENTS.md', 'untracked.txt'):
            with self.subTest(path=path):
                (self.root / path).write_text('dirty')
                with self.assertRaisesRegex(ValueError, 'Clean'):
                    self.validate()
                if path == 'AGENTS.md':
                    self.git('restore', path)
                else:
                    (self.root / path).unlink()

    def test_runtime_dependency_change_invalidates_receipt(self):
        self.validate()
        (self.root / 'node_modules/dependency').write_text('mutated')
        with self.assertRaisesRegex(ValueError, 'runtime|dependency'):
            d.read_receipt(self.root)

    def test_input_change_during_command_cannot_issue_receipt(self):
        command = [sys.executable, '-c', 'open("AGENTS.md","w").write("moved")']
        with patch.object(d, 'CHECKS', [command]):
            with self.assertRaisesRegex(ValueError, 'Clean|changed'):
                self.validate()
        self.assertFalse((d.directory(self.root) / (self.git('rev-parse', 'HEAD') + '.json')).exists())

    def test_nonzero_execution_retains_failure_and_no_receipt(self):
        with patch.object(d, 'CHECKS', [[sys.executable, '-c', 'raise SystemExit(7)']]):
            with self.assertRaisesRegex(ValueError, 'check failed'):
                self.validate()
        self.assertEqual(len(list(d.directory(self.root).glob('*.failure.json'))), 1)
        self.assertFalse((d.directory(self.root) / (self.git('rev-parse', 'HEAD') + '.json')).exists())

    def test_node_test_terminal_counts_are_required_and_complete(self):
        command = ['node', '--test', '--test-reporter=tap']
        good = b'# tests 2\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n'
        self.assertTrue(d.complete(command, good, 0))
        for output in (b'', b'passed', good.replace(b'tests 2', b'tests 0'),
                       good.replace(b'pass 2', b'pass 1'),
                       good.replace(b'skipped 0', b'skipped 1'),
                       good.replace(b'todo 0', b'todo 1'),
                       good.replace(b'cancelled 0', b'cancelled 1')):
            with self.subTest(output=output):
                self.assertFalse(d.complete(command, output, 0))
        self.assertFalse(d.complete(command, good, 1))

    def test_unittest_empty_skipped_or_partial_is_not_passing(self):
        command = ['python3', '-m', 'unittest']
        self.assertTrue(d.complete(command, b'Ran 2 tests in 0.01s\n\nOK\n', 0))
        for output in (b'Ran 0 tests in 0.01s\n\nOK\n',
                       b'Ran 1 test in 0.01s\n\nOK (skipped=1)\n', b'Ran 2 tests'):
            self.assertFalse(d.complete(command, output, 0))

    def test_output_or_receipt_tampering_is_refused(self):
        value = self.validate()
        output = d.directory(self.root) / (value['runs'][0]['output_sha256'] + '.log')
        original = output.read_bytes()
        output.write_text('tampered')
        with self.assertRaisesRegex(ValueError, 'output'):
            d.read_receipt(self.root)
        output.write_bytes(original)
        path = d.directory(self.root) / (value['source'] + '.json')
        changed = json.loads(path.read_bytes())
        changed['base'] = '0' * 40
        path.write_text(json.dumps(changed))
        with self.assertRaisesRegex(ValueError, 'receipt'):
            d.read_receipt(self.root)

    def test_output_symlink_is_refused(self):
        value = self.validate()
        output = d.directory(self.root) / (value['runs'][0]['output_sha256'] + '.log')
        output.unlink()
        output.symlink_to(self.root / 'AGENTS.md')
        with self.assertRaisesRegex(ValueError, 'Unsafe'):
            d.read_receipt(self.root)

    def test_changed_command_category_invalidates_receipt(self):
        self.validate()
        with patch.object(d, 'CHECKS', []):
            with self.assertRaisesRegex(ValueError, 'category'):
                d.read_receipt(self.root)

    def test_changed_profile_invalidates_original_receipt(self):
        self.validate()
        with patch.object(d, 'PROFILE', 'untrusted-replacement'):
            with self.assertRaisesRegex(ValueError, 'receipt'):
                d.read_receipt(self.root)

    def test_runtime_source_change_even_if_reverted_is_not_admitted(self):
        (self.root / 'runtime.js').write_text('execute()')
        self.commit()
        (self.root / 'runtime.js').write_text('restored')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            self.validate()

    def test_package_permissions_and_dependencies_are_not_version_changes(self):
        (self.root / 'package.json').write_text('{"version":"1.0.1","scripts":{"release":"bypass"}}')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'configuration'):
            self.validate()

    def test_unknown_skill_body_cannot_hide_behind_pin_change(self):
        path = self.root / 'source/other/SKILL.md'
        path.parent.mkdir(parents=True)
        path.write_text('---\nname: other\nmetadata:\n  version: "1.0.0"\n---\nbody\n')
        self.commit()
        baseline = self.git('rev-parse', 'HEAD')
        path.write_text('---\nname: other\nmetadata:\n  version: "1.0.1"\n---\nbody changed\n')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'Unmapped skill'):
            d.scope(self.root, baseline, self.git('rev-parse', 'HEAD'))

    def test_failed_summary_exposes_only_bounded_public_locators_not_failure_bodies(self):
        output = (b'not ok 2 - safe public acceptance\n'
                  b'FAIL: test_closed_case (fixture.Case)\n'
                  b'error: private body\npassword=private-value\n'
                  b'not ok 3 - <unsafe title>\n' + b'not ok 4 - '+b'a'*513+b'\n')
        checksum = d.native.digest(output)
        d.native.private_write(d.directory(self.root) / (checksum+'.log'), output)
        row = {'command':['node','--test'], 'exit_code':1, 'output_sha256':checksum}
        summaries = d.failed_check_summary([row], self.root)
        self.assertEqual(summaries[0]['failed_tests'],
                         ['safe public acceptance','test_closed_case (fixture.Case)'])
        self.assertNotIn('private', json.dumps(summaries))
        self.assertNotIn('unsafe', json.dumps(summaries))
        self.assertEqual(summaries[0]['output_sha256'], checksum)

    def test_preserved_native_scope_requires_complete_spec_modules_and_rejects_neighboring_paths(self):
        self.assertEqual(len(d.PRESERVED_SPEC_PATHS),32)
        self.assertEqual(d.native.digest('\n'.join(sorted(d.PRESERVED_SPEC_PATHS)).encode()),
                         '45bf62bc4a7d0daf27d0bbd4b4cc364cce234f92ff60cc1620ef1695ecc74bdd')
        baseline=self.git('rev-parse','HEAD');path=self.root/'tools/vault_index.py'
        path.parent.mkdir(parents=True,exist_ok=True);path.write_text('bounded preserved implementation\n');self.commit()
        source=self.git('rev-parse','HEAD')
        selection={'selection':{'categories':[{'tests':sorted(d.PRESERVED_SPEC_TESTS)}]}}
        with patch.object(d.contract,'gate',return_value={'status':'SPEC_SEALED'}),patch.object(d.contract,'verify',return_value=selection):
            self.assertIn('tools/vault_index.py',d.scope(self.root,baseline,source))
            incomplete={'selection':{'categories':[{'tests':sorted(d.PRESERVED_SPEC_TESTS)[1:]}]}}
            with patch.object(d.contract,'verify',return_value=incomplete):
                with self.assertRaisesRegex(ValueError,'conformance modules missing'):d.scope(self.root,baseline,source)
            (self.root/'tools/unmapped_runtime.py').write_text('unapproved neighboring implementation\n');self.commit()
            with self.assertRaisesRegex(ValueError,'Unsupported'):d.scope(self.root,baseline,self.git('rev-parse','HEAD'))
        with self.assertRaisesRegex(ValueError,'complete sealed spec'):d.scope(self.root,baseline,source)

    def test_exact_parallel_wrapper_edit_requires_its_executed_sealed_module(self):
        baseline=self.git('rev-parse','HEAD');path=self.root/'tests/oracle-parallel.test.mjs'
        path.parent.mkdir();path.write_text('bounded wrapper implementation\n');self.commit();source=self.git('rev-parse','HEAD')
        selection={'selection':{'categories':[{'tests':sorted(d.PRESERVED_SPEC_TESTS)}]}}
        with patch.object(d.contract,'gate',return_value={'status':'SPEC_SEALED'}),patch.object(d.contract,'verify',return_value=selection):
            self.assertIn('tests/oracle-parallel.test.mjs',d.scope(self.root,baseline,source))
            missing={'selection':{'categories':[{'tests':sorted(d.PRESERVED_SPEC_TESTS-{'tests/oracle-parallel.test.mjs'})}]}}
            with patch.object(d.contract,'verify',return_value=missing):
                with self.assertRaisesRegex(ValueError,'modules missing'):d.scope(self.root,baseline,source)
            (path.parent/'oracle-parallel-neighbor.test.mjs').write_text('unknown wrapper');self.commit()
            with self.assertRaisesRegex(ValueError,'Unsupported'):d.scope(self.root,baseline,self.git('rev-parse','HEAD'))

    def test_test_only_git_and_series_paths_require_actual_sealed_helper_coverage(self):
        baseline=self.git('rev-parse','HEAD')
        for name in ('tests/oracle-review-series.test.mjs','tests/helpers/native-validation-git.mjs'):
            path=self.root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text('exact bounded test-only resource\n')
        self.commit();source=self.git('rev-parse','HEAD')
        selection={'selection':{'categories':[{'tests':sorted(d.PRESERVED_SPEC_TESTS)}]}}
        with patch.object(d.contract,'gate',return_value={'status':'SPEC_SEALED'}),patch.object(d.contract,'verify',return_value=selection):
            admitted=d.scope(self.root,baseline,source);self.assertIn('tests/helpers/native-validation-git.mjs',admitted)
            incomplete={'selection':{'categories':[{'tests':sorted(d.PRESERVED_SPEC_TESTS-{'tests/isolated-test-cohort.test.mjs'})}]}}
            with patch.object(d.contract,'verify',return_value=incomplete):
                with self.assertRaisesRegex(ValueError,'modules missing'):d.scope(self.root,baseline,source)
            (self.root/'tests/helpers/native-git-neighbor.mjs').write_text('unadmitted helper');self.commit()
            with self.assertRaisesRegex(ValueError,'Unsupported'):d.scope(self.root,baseline,self.git('rev-parse','HEAD'))

    def test_exact_history_fixture_metadata_rejects_mutation_duplicate_unknown_and_boolean_counts(self):
        records=[dict(row,path_sha256=hashlib.sha256(b'tests/oracle_spec_test.py').hexdigest(),
                      kind='exact_historical_negative_fixture_key_header',literal_count=1) for row in d.HISTORICAL_HEADER_RECORDS]
        self.assertEqual(len(records),14);self.assertEqual(len({row['blob'] for row in records}),14)
        report={'base':self.base,'source':self.git('rev-parse','HEAD'),'status':'PASS','pairs':14,
                'inventory_sha256':'a'*64,'policy_sha256':'b'*64,'findings':[],'classifications':records}
        encode=lambda value:json.dumps({'publication_history':value}).encode()
        self.assertEqual(d.history_report(encode(report),report['base'],report['source']),report)
        for key,value in [('blob','0'*40),('path_sha256','0'*64),('sha256','0'*64),('context_sha256','0'*64),
                          ('offset',0),('literal_count',True),('span_bytes',True),('kind','caller_allowlist')]:
            bad=json.loads(json.dumps(report));bad['classifications'][0][key]=value
            with self.assertRaises(ValueError):d.history_report(encode(bad),report['base'],report['source'])
        bad=dict(report,classifications=records+[records[0]])
        with self.assertRaises(ValueError):d.history_report(encode(bad),report['base'],report['source'])

    def test_muse_guidance_amendment_admits_only_exact_named_files(self):
        baseline = self.git('rev-parse', 'HEAD')
        expected = {'source/platform/bos-visual-output/SKILL.md',
                    'source/platform/bos-visual-output/references/graph-rendering.md',
                    'tests/muse-workflow-guidance.test.mjs'}
        self.assertEqual(d.MUSE_GUIDANCE, expected)
        for name in sorted(expected):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('bounded guidance acceptance\n')
        self.commit()
        self.assertTrue(expected <= set(d.scope(self.root, baseline, self.git('rev-parse', 'HEAD'))))
        for name in ('source/platform/bos-visual-output/references/unrelated.md',
                     'source/platform/bos-visual-output/scripts/execute.mjs'):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('unrequested behavior\n')
            self.commit()
            with self.assertRaisesRegex(ValueError, 'Unsupported|Deletion or nonregular'):
                d.scope(self.root, baseline, self.git('rev-parse', 'HEAD'))
            self.git('rm', name)
            self.commit()

    def test_only_the_feedback_contract_reference_is_admitted(self):
        baseline = self.git('rev-parse', 'HEAD')
        allowed = self.root / 'source/platform/submit-feedback/references/feedback-contract.md'
        allowed.parent.mkdir(parents=True, exist_ok=True)
        allowed.write_text('current contract\n')
        self.commit()
        admitted = self.git('rev-parse', 'HEAD')
        self.assertIn(str(allowed.relative_to(self.root)), d.scope(self.root, baseline, admitted))
        (allowed.parent / 'other.md').write_text('other reference\n')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            d.scope(self.root, baseline, self.git('rev-parse', 'HEAD'))

    def side_merge(self, path, content='compatible instructions', revert=False):
        published = self.git('rev-parse', 'HEAD')
        self.git('checkout', '-qb', 'topic', self.base)
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        self.commit()
        if revert:
            target.unlink()
            self.commit()
        self.git('checkout', 'main')
        self.git('merge', '--no-ff', '-qm', 'integrate compatibility', 'topic')
        return published, self.git('rev-parse', 'HEAD')

    def test_base_anchored_merge_checks_unpublished_side_history(self):
        path = 'source/platform/bos-mcp-client/references/identity-context.md'
        published, source = self.side_merge(path)
        self.assertIn(path, d.scope(self.root, published, source))

    def test_unanchored_and_two_trusted_parent_merges_are_rejected(self):
        published, source = self.side_merge('source/platform/bos-mcp-client/references/identity-context.md')
        self.assertIn('source/platform/bos-mcp-client/references/identity-context.md',
                      d.scope(self.root, self.base, source))
        redundant = self.git('commit-tree', 'HEAD^{tree}', '-p', self.base, '-p', published, '-m', 'two trusted parents')
        with self.assertRaisesRegex(ValueError, 'exactly one'):
            d.scope(self.root, published, redundant)

    def preserved_integration(self, path='source/platform/bos-mcp-client/references/identity-context.md', revert=False):
        published = self.git('rev-parse', 'HEAD')
        (self.root / 'AGENTS.md').write_text('unpublished main after published base')
        self.commit()
        self.git('checkout', '-qb', 'old-fork', self.base)
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text('unpublished fork content')
        self.commit()
        if revert:
            target.unlink(); self.commit()
        self.git('checkout', 'main')
        self.git('merge', '--no-ff', '-qm', 'preserve unpublished integration', 'old-fork')
        return published, self.git('rev-parse', 'HEAD')

    def test_descendant_first_parent_and_older_published_fork_are_fully_checked(self):
        published, source = self.preserved_integration()
        self.assertIn('source/platform/bos-mcp-client/references/identity-context.md', d.scope(self.root, published, source))

    def test_preserved_integration_cannot_hide_reverted_side_content_or_resolution(self):
        published, source = self.preserved_integration('runtime.js', revert=True)
        with self.assertRaisesRegex(ValueError, 'Unsupported|Deletion'):
            d.scope(self.root, published, source)

    def test_preserved_integration_rejects_unmapped_merge_resolution(self):
        published, source = self.preserved_integration()
        (self.root / 'runtime.js').write_text('unmapped merge-only bytes')
        self.git('add', 'runtime.js')
        merge = self.git('commit-tree', self.git('write-tree'), '-p', self.git('rev-parse', source+'^1'), '-p', self.git('rev-parse', source+'^2'), '-m', 'resolution')
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            d.scope(self.root, published, merge)

    def test_exact_base_two_descendants_retain_both_edges_and_merge_resolution(self):
        published, source = self.side_merge('runtime.js')
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            d.scope(self.root, self.base, source)
        # A clean final tree cannot erase an inadmissible side edge.
        self.git('rm', 'runtime.js')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'Unsupported|Deletion'):
            d.scope(self.root, self.base, self.git('rev-parse', 'HEAD'))

    def test_exact_base_two_descendants_inspect_merge_only_resolution(self):
        published, source = self.side_merge('source/platform/bos-mcp-client/references/identity-context.md')
        (self.root / 'runtime.js').write_text('merge-only unsupported resolution')
        self.git('add', 'runtime.js')
        merge = self.git('commit-tree', self.git('write-tree'),
                         '-p', self.git('rev-parse', source+'^1'),
                         '-p', self.git('rev-parse', source+'^2'), '-m', 'resolution')
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            d.scope(self.root, self.base, merge)

    def test_two_descendants_with_older_common_fork_remain_rejected(self):
        published, source = self.side_merge('source/platform/bos-mcp-client/references/identity-context.md')
        # Both inputs descend from the older fork, but the selected publication
        # base is a sibling and therefore cannot authorize this candidate.
        self.git('checkout', '-qb', 'other-base', self.base)
        (self.root / 'AGENTS.md').write_text('different publication line')
        self.commit()
        foreign = self.git('rev-parse', 'HEAD')
        with self.assertRaises(Exception):
            d.scope(self.root, foreign, source)

    def unpublished_shared_fork(self,path='source/platform/bos-mcp-client/references/identity-context.md',revert=False):
        published=self.git('rev-parse','HEAD')
        (self.root/'AGENTS.md').write_text('shared unpublished work');self.commit();shared=self.git('rev-parse','HEAD')
        self.git('branch','peer',shared)
        (self.root/'AGENTS.md').write_text('first unpublished line');self.commit();first=self.git('rev-parse','HEAD')
        self.git('checkout','-q','peer');target=self.root/path;target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text('second unpublished line');self.commit()
        if revert:target.unlink();self.commit()
        second=self.git('rev-parse','HEAD');self.git('checkout','-q','main');self.git('merge','--no-ff','-qm','private source sync','peer')
        return published,shared,first,second,self.git('rev-parse','HEAD')

    def test_private_sync_with_unique_unpublished_shared_fork_checks_both_lines(self):
        published,shared,first,second,source=self.unpublished_shared_fork()
        self.assertNotEqual(shared,published);self.assertEqual(self.git('merge-base','--all',first,second),shared)
        self.assertIn('source/platform/bos-mcp-client/references/identity-context.md',d.scope(self.root,published,source))

    def test_private_sync_cannot_hide_reverted_unmapped_side_bytes_or_merge_resolution(self):
        published,_,_,_,source=self.unpublished_shared_fork('runtime.js',revert=True)
        with self.assertRaisesRegex(ValueError,'Unsupported|Deletion'):d.scope(self.root,published,source)
        # A separate merge-only unknown path is rejected with the same valid topology.
        fixture=PackageGateTests();fixture.setUp()
        try:
            published,_,_,_,source=fixture.unpublished_shared_fork()
            target=fixture.root/'runtime.js';target.write_text('unmapped resolution');fixture.git('add','runtime.js')
            resolution=fixture.git('commit-tree',fixture.git('write-tree'),'-p',source+'^1','-p',source+'^2','-m','unmapped private sync resolution')
            with self.assertRaisesRegex(ValueError,'Unsupported'):d.scope(fixture.root,published,resolution)
        finally:fixture.doCleanups()

    def test_ambiguous_shared_unpublished_merge_bases_still_reject(self):
        published=self.git('rev-parse','HEAD');(self.root/'AGENTS.md').write_text('first line');self.commit();first=self.git('rev-parse','HEAD')
        self.git('checkout','-qb','peer',published);target=self.root/'source/platform/bos-mcp-client/references/identity-context.md'
        target.parent.mkdir(parents=True,exist_ok=True);target.write_text('second line');self.commit();second=self.git('rev-parse','HEAD')
        a=self.git('commit-tree',first+'^{tree}','-p',first,'-p',second,'-m','first crisscross')
        b=self.git('commit-tree',second+'^{tree}','-p',second,'-p',first,'-m','second crisscross')
        self.assertEqual(set(self.git('merge-base','--all',a,b).splitlines()),{first,second})
        source=self.git('commit-tree',first+'^{tree}','-p',a,'-p',b,'-m','ambiguous private sync')
        with self.assertRaisesRegex(ValueError,'exactly one'):d.scope(self.root,published,source)

    def test_private_sync_never_converts_an_ancestry_execution_error_to_authority(self):
        published,_,first,second,source=self.unpublished_shared_fork();execute=d.subprocess.run
        def unavailable(command,*args,**kwargs):
            if command[:5]==['git','--no-replace-objects','merge-base','--is-ancestor',published] and command[-1] in (first,second):
                return subprocess.CompletedProcess(command,128,b'',b'Synthetic Git observation unavailable')
            return execute(command,*args,**kwargs)
        with patch.object(d.subprocess,'run',side_effect=unavailable):
            with self.assertRaises(subprocess.CalledProcessError):d.scope(self.root,published,source)

    def test_original_history_rejects_replace_refs_and_grafts(self):
        source = self.git('rev-parse', 'HEAD')
        self.git('replace', source, self.base)
        with self.assertRaisesRegex(ValueError, 'original Git history'):
            d.scope(self.root, self.base, source)
        self.git('replace', '-d', source)
        graft = self.root / '.git/info/grafts'
        graft.write_text(source+' '+self.base+'\n')
        with self.assertRaisesRegex(ValueError, 'grafts'):
            d.scope(self.root, self.base, source)

    def test_history_receipt_never_accepts_foreign_source_base_or_partial_pass(self):
        report = {'publication_history': {'base':self.base,'source':'a'*40,'status':'PASS','pairs':1,'inventory_sha256':'b'*64,'policy_sha256':'c'*64,'findings':[],'classifications':[]}}
        self.assertEqual(d.history_report(json.dumps(report).encode(), self.base, 'a'*40)['status'], 'PASS')
        for key, value in [('source','d'*40),('base','e'*40),('status','REJECT'),('pairs',0),('findings',[{'classification':'customer_privacy'}]),('classifications',[{'kind':'arbitrary'}])]:
            changed = json.loads(json.dumps(report));changed['publication_history'][key] = value
            with self.assertRaisesRegex(ValueError, 'history proof'):
                d.history_report(json.dumps(changed).encode(), self.base, 'a'*40)

    def test_unrelated_side_parent_cannot_become_a_published_fork(self):
        published = self.git('rev-parse', 'HEAD')
        (self.root / 'AGENTS.md').write_text('unpublished main')
        self.commit()
        first = self.git('rev-parse', 'HEAD')
        unrelated = self.git('commit-tree', 'HEAD^{tree}', '-m', 'unrelated root')
        merge = self.git('commit-tree', 'HEAD^{tree}', '-p', first, '-p', unrelated, '-m', 'unrelated integration')
        with self.assertRaisesRegex(ValueError, 'exactly one|two-parent'):
            d.scope(self.root, published, merge)

    def test_legacy_dependency_digest_migration_cannot_change_existing_public_version(self):
        path = self.root / 'contracts/bos-client-dependency.v1/manifest.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        value = {'contract_version':'bos-client-dependency/v1','executable_files':[{'path':'same.mjs','sha256':'a'*64}],'bundle_sha256':'a'*64}
        path.write_text(json.dumps(value));self.commit();base = self.git('rev-parse','HEAD')
        value['executable_files'][0]['sha256']='b'*64;value['bundle_sha256']='b'*64
        path.write_text(json.dumps(value));self.commit()
        self.assertIn(str(path.relative_to(self.root)), d.scope(self.root,base,self.git('rev-parse','HEAD')))
        value['contract_version']='bos-client-dependency/v2';path.write_text(json.dumps(value));self.commit()
        with self.assertRaisesRegex(ValueError,'public dependency contract'):
            d.scope(self.root,base,self.git('rev-parse','HEAD'))

    def test_preserved_instruction_aliases_bind_only_the_existing_exact_handlers(self):
        package={'version':'1.0.0','scripts':{'test':'node synthetic.mjs'}}
        path=self.root/'package.json';path.write_text(json.dumps(package));self.commit();base=self.git('rev-parse','HEAD')
        package['scripts'].update(d.LEGACY_RELEASE_SCRIPT_ALIASES);path.write_text(json.dumps(package));self.commit()
        self.assertIn('package.json',d.scope(self.root,base,self.git('rev-parse','HEAD')))
        package['scripts']['release:instruction']+=' --unapproved';path.write_text(json.dumps(package));self.commit()
        with self.assertRaisesRegex(ValueError,'instruction alias'):d.scope(self.root,base,self.git('rev-parse','HEAD'))

    def test_null_alias_and_unrelated_package_script_remain_unmapped(self):
        for changes in ({'release:question':None},{'release:unapproved':'python3 tools/publication_admission.py question'}):
            with self.subTest(changes=changes):
                fixture=PackageGateTests();fixture.setUp()
                try:
                    package={'version':'1.0.0','scripts':{'test':'node synthetic.mjs'}};path=fixture.root/'package.json'
                    path.write_text(json.dumps(package));fixture.commit();base=fixture.git('rev-parse','HEAD')
                    package['scripts'].update(changes);path.write_text(json.dumps(package));fixture.commit()
                    with self.assertRaisesRegex(ValueError,'instruction alias|configuration'):d.scope(fixture.root,base,fixture.git('rev-parse','HEAD'))
                finally:fixture.doCleanups()

    def python_inventory(self, count=2):
        units={unit:([unit] if unit.count('.')==2 else [unit+('.Synthetic' if unit in d.PYTHON_MODULES[:2] else '')+'.test_'+str(index) for index in range(count)]) for unit in d.PYTHON_UNITS}
        return {'units':units,'modules':{module:sorted(name for unit,ids in units.items() if unit.split('.')[0]==module for name in ids) for module in d.PYTHON_MODULES},
                'source_sha256':{module:'a'*64 for module in d.PYTHON_MODULES}}

    def python_output(self, module, count=2):
        ids=self.python_inventory(count=count)['units'][module]
        return ''.join(name.split('.')[-1]+' ('+name+') ... ok\n' for name in ids).encode()+('Ran '+str(len(ids))+' tests in 0.01s\n\nOK\n').encode()

    def python_results(self):
        return [{'module':module,'command':d.python_module_command(module),'exit_code':0,
                 'output':self.python_output(module),'wall_ms':10,
                 'temporary_directory_sha256':'d'*64} for module in d.PYTHON_UNITS]

    def test_fixed_python_category_runs_all_three_independently_and_merges_in_fixed_order(self):
        self.assertEqual(d.PYTHON_DISPATCH[0],d.PYTHON_MODULES[0])
        self.assertEqual(set(d.PYTHON_DISPATCH),set(d.PYTHON_UNITS));self.assertEqual(len(d.PYTHON_DISPATCH),len(d.PYTHON_UNITS))
        before=d.native.identity(self.root);barrier=threading.Barrier(3);active=0;peak=0;lock=threading.Lock()
        def execute(root,module):
            nonlocal active,peak
            with lock: active+=1;peak=max(peak,active)
            if module in d.PYTHON_DISPATCH[:3]:barrier.wait(timeout=3)
            time.sleep(.03 if module==d.PYTHON_MODULES[0] else .001)
            with lock: active-=1
            return next(row for row in self.python_results() if row['module']==module)
        output,code=d.run_python_category(self.root,execute,inventory_loader=lambda root:self.python_inventory())
        self.assertEqual(code,0);self.assertEqual(peak,3)
        report=d.python_category_report(output,before)
        self.assertEqual([row['module'] for row in report['modules']],list(d.PYTHON_UNITS))
        self.assertEqual(sum(row['tests'] for row in report['modules']),sum(map(len,self.python_inventory()['units'].values())))
        for row in report['modules']:
            self.assertEqual(d.native.digest((d.directory(self.root)/(row['output_sha256']+'.log')).read_bytes()),row['output_sha256'])

    def test_python_category_keeps_every_failure_skip_and_original_output(self):
        before=d.native.identity(self.root)
        for kind in ('failure','skip','empty','timeout','error'):
            with self.subTest(kind=kind):
                attempted=[]
                def execute(root,module):
                    attempted.append(module)
                    row=next(row for row in self.python_results() if row['module']==module)
                    if module==d.PYTHON_MODULES[1]:
                        if kind=='error': raise OSError('synthetic module execution error')
                        if kind=='failure': row.update(exit_code=1,output=b'Ran 2 tests in .01s\nFAILED (failures=1)\n')
                        if kind=='skip': row['output']=b'Ran 2 tests in .01s\nOK (skipped=1)\n'
                        if kind=='empty': row['output']=b'Ran 0 tests in .01s\nOK\n'
                        if kind=='timeout': row['exit_code']='TIMEOUT'
                    return row
                output,code=d.run_python_category(self.root,execute,inventory_loader=lambda root:self.python_inventory())
                self.assertEqual(code,1);self.assertEqual(set(attempted),set(d.PYTHON_UNITS))
                with self.assertRaisesRegex(ValueError,'Python module proof'):d.python_category_report(output,before)

    def test_python_category_rejects_framing_hash_command_environment_and_source_tamper(self):
        before=d.native.identity(self.root);output,code=d.python_category_output(before,self.python_results(),inventory=self.python_inventory())
        self.assertTrue(d.complete(d.PYTHON_CHECK,output,code))
        for bad in (output[:-12],output.replace(b'Ran 2',b'Ran 3',1),output.replace(b'BOC_PYTHON_MODULE',b'BAD_PYTHON_MODULE',1)):
            self.assertFalse(d.complete(d.PYTHON_CHECK,bad,0))
        for changed in ({**before,'source':'e'*40},{**before,'tree':'f'*40},{**before,'runtime':{}}):
            with self.assertRaisesRegex(ValueError,'Python module proof'):d.python_category_report(output,changed)
        rows=self.python_results();rows[0]['command']=['python','unittest','different_module']
        bad,_=d.python_category_output(before,rows,inventory=self.python_inventory())
        self.assertFalse(d.complete(d.PYTHON_CHECK,bad,0))

    def test_actual_python_ids_cannot_be_omitted_repeated_or_replaced_by_equal_counts(self):
        before=d.native.identity(self.root)
        for change in ('omit','repeat','foreign'):
            rows=self.python_results();raw=rows[0]['output'];lines=raw.splitlines(keepends=True)
            if change=='omit':lines.pop(0)
            if change=='repeat':lines[1]=lines[0]
            if change=='foreign':lines[0]=lines[0].replace(b'test_0',b'foreign')
            rows[0]['output']=b''.join(lines)
            output,code=d.python_category_output(before,rows,inventory=self.python_inventory())
            self.assertEqual(code,1)
            with self.assertRaisesRegex(ValueError,'Python module proof'):d.python_category_report(output,before)

    def test_python_category_source_change_retains_every_module_but_prevents_pass(self):
        def execute(root,module):
            if module==d.PYTHON_MODULES[0]:(self.root/'AGENTS.md').write_text('intervening candidate')
            return next(row for row in self.python_results() if row['module']==module)
        output,code=d.run_python_category(self.root,execute,inventory_loader=lambda root:self.python_inventory())
        self.assertEqual(code,1);self.assertFalse(d.complete(d.PYTHON_CHECK,output,code))
        self.assertEqual(len(list(d.directory(self.root).glob('*.log'))),len({d.native.digest(row['output']) for row in self.python_results()}))

    def test_actual_python_subprocesses_have_isolated_private_temp_and_bounded_timeout_output(self):
        import concurrent.futures
        def execute(module):
            code="import os,sys,time; assert os.stat(os.environ['TMPDIR']).st_mode & 0o777 == 0o700; time.sleep(.03); print('Ran 1 test in 0.03s\\n\\nOK')"
            return d.execute_python_module(self.root,module,command=[sys.executable,'-c',code])
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            rows=list(pool.map(execute,d.PYTHON_MODULES))
        self.assertEqual(len({row['temporary_directory_sha256'] for row in rows}),3)
        self.assertTrue(all(row['exit_code']==0 for row in rows))
        timeout=d.execute_python_module(self.root,d.PYTHON_MODULES[0],command=[sys.executable,'-c','import time;time.sleep(5)'],timeout=.05)
        self.assertEqual(timeout['exit_code'],'TIMEOUT')
        with patch.object(d,'_PYTHON_OUTPUT_LIMIT',1024):
            overflow=d.execute_python_module(self.root,d.PYTHON_MODULES[0],command=[sys.executable,'-c',"print('x'*10000)"])
        self.assertEqual(overflow['exit_code'],'OUTPUT_LIMIT');self.assertLessEqual(len(overflow['output']),1025)
        self.assertEqual(list((self.root/'Vault/tmp').iterdir()),[])
        self.assertEqual(d._PYTHON_ACTIVE,set())

    def test_python_module_cancellation_joins_owned_process_group_and_prevents_pass(self):
        import concurrent.futures
        d._PYTHON_CANCELLED.clear()
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            pending=pool.submit(d.execute_python_module,self.root,d.PYTHON_MODULES[0],
                                command=[sys.executable,'-c','import time;time.sleep(5)'])
            for attempt in range(200):
                with d._PYTHON_LOCK: active=bool(d._PYTHON_ACTIVE)
                if active: break
                time.sleep(.005)
            self.assertTrue(active);d.cancel_python_category()
            row=pending.result(timeout=5)
        self.assertEqual(row['exit_code'],'CANCELLED');self.assertEqual(d._PYTHON_ACTIVE,set())
        d._PYTHON_CANCELLED.clear()

    def test_late_exited_python_group_permission_error_never_targets_another_process(self):
        from unittest.mock import Mock
        process=Mock(pid=999999);process.poll.return_value=0
        with d._PYTHON_LOCK:d._PYTHON_ACTIVE.add(process)
        try:
            with patch.object(d.os,'killpg',side_effect=PermissionError()):d._stop_python_group(process)
            process.terminate.assert_not_called()
        finally:
            with d._PYTHON_LOCK:d._PYTHON_ACTIVE.discard(process);d._PYTHON_STOPPING.discard(process)

    def test_python_inventory_retains_all_exact_ids_and_rejects_duplicate_or_omitted_cases(self):
        inventory=self.python_inventory();self.assertEqual(d.validate_python_inventory(inventory),inventory)
        for kind in ('missing','duplicate','module','class','source'):
            changed=json.loads(json.dumps(inventory))
            if kind=='missing':changed['units'][d.PYTHON_UNITS[-1]].pop()
            if kind=='duplicate':changed['units'][d.PYTHON_UNITS[-1]].append(changed['units'][d.PYTHON_UNITS[-1]][0])
            if kind=='module':changed['modules'][d.PYTHON_MODULES[-1]].pop()
            if kind=='class':changed['units']['oracle_parallel_test.ForeignClass']=changed['units'].pop(d.PYTHON_UNITS[-1])
            if kind=='source':changed['source_sha256'][d.PYTHON_MODULES[0]]='bad'
            with self.assertRaisesRegex(ValueError,'membership'):d.validate_python_inventory(changed)
        before=d.native.identity(self.root);output,code=d.python_category_output(before,self.python_results(),inventory=inventory)
        changed=json.loads(json.dumps(inventory));changed['source_sha256'][d.PYTHON_MODULES[0]]='f'*64
        with self.assertRaisesRegex(ValueError,'Python module proof'):d.python_category_report(output,before,changed)

    def test_actual_python_discovery_seals_full_module_union_and_preserves_class_fixture_semantics(self):
        directory=self.root/'tests';directory.mkdir()
        base='import unittest\nclass Synthetic(unittest.TestCase):\n def test_fixture(self): pass\n'
        for module in d.PYTHON_MODULES[:2]:(directory/(module+'.py')).write_text(base)
        oracle='import unittest\n'+''.join('class '+name+'(unittest.TestCase):\n'+''.join(' def '+method+'(self): pass\n' for method in d.ORACLE_INDEPENDENT_CASES.get(name,('test_fixture',))) for name in d.ORACLE_CLASSES)
        path=directory/'oracle_parallel_test.py';path.write_text(oracle);self.commit()
        result=d.python_inventory(self.root)
        self.assertEqual(len(result['modules']['oracle_parallel_test']),11)
        self.assertEqual(set(result['units']),set(d.PYTHON_UNITS))
        path.write_text(oracle+'def setUpModule(): pass\n');self.commit()
        with self.assertRaisesRegex(ValueError,'discovery'):d.python_inventory(self.root)
        path.write_text(oracle+'class Extra(unittest.TestCase):\n def test_unadmitted(self): pass\n');self.commit()
        with self.assertRaisesRegex(ValueError,'discovery'):d.python_inventory(self.root)

    def test_scope_batch_retains_identical_raw_bytes_including_newlines_and_zero_bytes(self):
        path=self.root/'source/fixture.txt';path.parent.mkdir();path.write_bytes(b'first\nline\0tail\n');self.commit();first=self.git('rev-parse','HEAD')
        path.write_bytes(b'second\n\0body');self.commit();second=self.git('rev-parse','HEAD')
        requests=[(first,'source/fixture.txt'),(second,'source/fixture.txt'),(first,'source/fixture.txt')]
        result=d.scope_blob_snapshot(self.root,requests)
        self.assertEqual(result,{key:d.blob(self.root,*key) for key in set(requests)})
        path.write_bytes(b'changed current reference');self.commit()
        self.assertEqual(d.scope_blob_snapshot(self.root,requests),result)
        with self.assertRaisesRegex(ValueError,'Immutable'):d.scope_blob_snapshot(self.root,[('HEAD','source/fixture.txt')])
        with self.assertRaisesRegex(ValueError,'Immutable'):d.scope_blob_snapshot(self.root,[(first,'source/fixture.txt\n'+second+':AGENTS.md')])

    def test_scope_batch_scope_equivalence_uses_same_complete_immutable_inputs(self):
        path=self.root/'source/platform/new-synthetic/SKILL.md';path.parent.mkdir(parents=True)
        path.write_text('---\nname: synthetic\nmetadata:\n  version: "1.0.0"\n---\nFixed guidance\n');self.commit();base=self.git('rev-parse','HEAD')
        path.write_text(path.read_text().replace('1.0.0','1.0.1'));self.commit();source=self.git('rev-parse','HEAD')
        with patch.object(d,'scope_blob_snapshot',side_effect=lambda root,requests:{key:d.blob(root,*key) for key in requests}):
            expected=d.scope(self.root,base,source)
        self.assertEqual(d.scope(self.root,base,source),expected)

    def test_scope_batch_rejects_malformed_order_type_size_hash_eof_and_foreign_repository(self):
        from types import SimpleNamespace
        requests=[(self.base,'AGENTS.md'),(self.git('rev-parse','HEAD'),'AGENTS.md')]
        original=subprocess.run;outputs=[]
        def batch_call(args):
            return args[0][2:3]==['cat-file'] or '--revs-only' in args[0]
        def observe(*args,**kwargs):
            result=original(*args,**kwargs)
            if batch_call(args):outputs.append(result.stdout)
            return result
        with patch.object(d.subprocess,'run',side_effect=observe):d.scope_blob_snapshot(self.root,requests)
        self.assertEqual(len(outputs),3)
        variants=[]
        for index,body in [(0,b'bad\n'),(1,outputs[1].replace(b' blob ',b' tree ',1)),(1,outputs[1].splitlines()[1]+b'\n'+outputs[1].splitlines()[0]+b'\n'),(1,outputs[1].replace(b' 17\n',b' 9000000\n',1)),(2,outputs[2][:-1]),(2,outputs[2]+b'extra'),(2,outputs[2].replace(b'base instructions',b'bad! instructions',1))]:
            changed=list(outputs);changed[index]=body;variants.append(changed)
        for output in variants:
            pending=iter(output)
            def malformed(*args,**kwargs):
                return SimpleNamespace(stdout=next(pending)) if batch_call(args) else original(*args,**kwargs)
            with patch.object(d.subprocess,'run',side_effect=malformed):
                with self.assertRaises(ValueError):d.scope_blob_snapshot(self.root,requests)
        with tempfile.TemporaryDirectory(dir=self.root,prefix='foreign-') as other:
            subprocess.run(['git','init','-q',other],check=True)
            with self.assertRaisesRegex(ValueError,'resolution incomplete'):d.scope_blob_snapshot(Path(other),requests)
        with patch.object(d.native,'git',side_effect=lambda root,*args:'sha256' if args==('rev-parse','--show-object-format') else 'false' if args==('rev-parse','--is-shallow-repository') else '' if args==('replace','-l') else '.git/info/grafts'):
            with self.assertRaisesRegex(ValueError,'object format'):d.scope_blob_snapshot(self.root,requests)

    def test_octopus_merge_is_rejected(self):
        published, source = self.side_merge('source/platform/bos-mcp-client/references/identity-context.md')
        octopus = self.git('commit-tree', 'HEAD^{tree}', '-p', self.base, '-p', published, '-p', source, '-m', 'octopus')
        with self.assertRaisesRegex(ValueError, 'two-parent'):
            d.scope(self.root, published, octopus)

    def test_merge_cannot_hide_out_of_scope_side_change_or_revert(self):
        for revert in (False, True):
            with self.subTest(revert=revert):
                # Independent fixture per case preserves the complete DAG observation.
                fixture = PackageGateTests()
                fixture.setUp()
                try:
                    published, source = fixture.side_merge('runtime.js', revert=revert)
                    with self.assertRaisesRegex(ValueError, 'Unsupported|Deletion'):
                        d.scope(fixture.root, published, source)
                finally:
                    fixture.doCleanups()

    def test_merge_result_cannot_introduce_unmapped_resolution(self):
        published, source = self.side_merge('source/platform/bos-mcp-client/references/identity-context.md')
        (self.root / 'runtime.js').write_text('unexpected resolution')
        self.git('add', 'runtime.js')
        tree = self.git('write-tree')
        resolution = self.git('commit-tree', tree, '-p', published, '-p', self.git('rev-parse', 'topic'), '-m', 'unmapped resolution')
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            d.scope(self.root, published, resolution)

    def test_only_exact_native_reference_and_named_regressions_are_mapped(self):
        for path in ('source/platform/bos-mcp-client/references/identity-context.md',
                     'tests/bos-native-compatibility.test.mjs', 'tests/feedback-evidence-guidance.test.mjs'):
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text('mapped')
        self.commit()
        d.scope(self.root, self.base, self.git('rev-parse', 'HEAD'))
        (self.root / 'source/platform/bos-mcp-client/references/another.md').write_text('unmapped')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            d.scope(self.root, self.base, self.git('rev-parse', 'HEAD'))
        for path in ('tests/bos-native-compatibility.test.mjs', 'tests/feedback-evidence-guidance.test.mjs'):
            self.assertIn(path, d.TESTS)

    def test_only_exact_retired_selection_absent_from_final_candidate_is_mapped(self):
        path = self.root / d.RETIRED_SELECTION
        path.parent.mkdir()
        path.write_text('retired immutable bytes')
        self.commit()
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        with patch.object(d, 'RETIRED_SELECTION_SHA256', frozenset({digest})):
            self.gate.stop()
            try:
                # A retained retired v1 blob is never this changelist's sealed spec.
                with self.assertRaises(ValueError):
                    d.scope(self.root, self.base, self.git('rev-parse', 'HEAD'))
            finally:
                self.gate.start()
            path.unlink()
            self.commit()
            self.assertIn(d.RETIRED_SELECTION, d.scope(self.root, self.base, self.git('rev-parse', 'HEAD')))
            path.write_text('retired immutable bytes')
            self.commit()
            self.gate.stop()
            try:
                with self.assertRaises(ValueError):
                    d.scope(self.root, self.base, self.git('rev-parse', 'HEAD'))
            finally:
                self.gate.start()

    def test_unknown_retired_selection_even_if_removed_is_rejected(self):
        path = self.root / d.RETIRED_SELECTION
        path.parent.mkdir()
        path.write_text('unknown selection')
        self.commit()
        path.unlink()
        self.commit()
        with self.assertRaisesRegex(ValueError, 'Unmapped retired'):
            d.scope(self.root, self.base, self.git('rev-parse', 'HEAD'))

    def test_wrong_retired_selection_path_and_arbitrary_deletion_are_rejected(self):
        path = self.root / 'tools/another-selection.json'
        path.parent.mkdir()
        path.write_text('retired immutable bytes')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            d.scope(self.root, self.base, self.git('rev-parse', 'HEAD'))
        path.unlink()
        self.commit()
        with self.assertRaisesRegex(ValueError, 'Deletion'):
            d.scope(self.root, self.base, self.git('rev-parse', 'HEAD'))
    def write_product(self, includes, **extra):
        path = self.root / 'products/bos/product.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({'name': 'bos', 'version': '1.0.0', 'includes': includes, **extra}))
        return path

    def test_customer_initialization_files_and_include_are_admitted(self):
        self.write_product(['platform/bos-mcp-client', 'platform/bos-plugin-settings'])
        console = self.root / 'source/platform/bos-plugin-console/SKILL.md'
        console.parent.mkdir(parents=True)
        console.write_text('---\nname: bos-plugin-console\n---\nbody\n')
        self.commit()
        baseline = self.git('rev-parse', 'HEAD')
        self.write_product(['platform/bos-mcp-client', 'platform/bos-customer-initialization',
                            'platform/bos-plugin-settings'])
        console.write_text('---\nname: bos-plugin-console\n---\nbody with discovery fallback\n')
        helper = self.root / 'source/platform/bos-customer-initialization/scripts/customer-profile.mjs'
        helper.parent.mkdir(parents=True)
        helper.write_text('export const profile = true;\n')
        self.commit()
        paths = d.scope(self.root, baseline, self.git('rev-parse', 'HEAD'))
        self.assertIn('products/bos/product.json', paths)
        self.assertIn('source/platform/bos-customer-initialization/scripts/customer-profile.mjs', paths)

    def test_other_product_include_is_not_admitted(self):
        self.write_product(['platform/bos-mcp-client'])
        self.commit()
        baseline = self.git('rev-parse', 'HEAD')
        self.write_product(['platform/bos-mcp-client', 'platform/unreviewed-skill'])
        self.commit()
        with self.assertRaisesRegex(ValueError, 'configuration'):
            d.scope(self.root, baseline, self.git('rev-parse', 'HEAD'))

    def test_exact_ws_dependency_addition_is_admitted_and_other_versions_rejected(self):
        package = self.root / 'package.json'
        package.write_text(json.dumps({'version': '1.0.0', 'devDependencies': {'esbuild': '0.28.2'}}))
        self.commit()
        baseline = self.git('rev-parse', 'HEAD')
        package.write_text(json.dumps({'version': '1.0.0', 'devDependencies': {'esbuild': '0.28.2', 'ws': '8.23.0'}}))
        self.commit()
        self.assertIn('package.json', d.scope(self.root, baseline, self.git('rev-parse', 'HEAD')))
        package.write_text(json.dumps({'version': '1.0.0', 'devDependencies': {'esbuild': '0.28.2', 'ws': '99.0.0'}}))
        self.commit()
        with self.assertRaisesRegex(ValueError, 'WebSocket dependency version'):
            d.scope(self.root, baseline, self.git('rev-parse', 'HEAD'))

    def test_ws_lock_integrity_scope_cannot_hide_resolution_or_script_changes(self):
        lock = self.root / 'package-lock.json'
        value = {'lockfileVersion': 3, 'packages': {'': {'version': '1.0.0', 'devDependencies': {'esbuild': '0.28.2'}}}}
        lock.write_text(json.dumps(value)); self.commit()
        baseline = self.git('rev-parse', 'HEAD')
        value['packages']['']['devDependencies']['ws'] = '8.23.0'
        value['packages']['node_modules/ws'] = dict(d.WS_LOCK_RECORD)
        lock.write_text(json.dumps(value)); self.commit()
        self.assertIn('package-lock.json', d.scope(self.root, baseline, self.git('rev-parse', 'HEAD')))
        value['packages']['node_modules/ws']['resolved'] = 'https://example.invalid/untrusted.tgz'
        lock.write_text(json.dumps(value)); self.commit()
        with self.assertRaisesRegex(ValueError, 'WebSocket dependency integrity'):
            d.scope(self.root, baseline, self.git('rev-parse', 'HEAD'))

    def test_ada_exact_files_and_product_include_are_admitted(self):
        self.write_product(['platform/bos-mcp-client'])
        self.commit()
        baseline = self.git('rev-parse', 'HEAD')
        self.write_product(['platform/bos-mcp-client', 'platform/ada'])
        for name in d.ADA_CLIENT:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('synthetic Ada source\n')
        self.commit()
        paths = d.scope(self.root, baseline, self.git('rev-parse', 'HEAD'))
        self.assertTrue(d.ADA_CLIENT <= set(paths))
        self.assertIn('tests/ada-client.test.mjs', d.TESTS)
        self.assertIn('tests/ada-journey-view.test.mjs', d.TESTS)
        self.assertIn('tests/runtime-skill-export.test.mjs', d.TESTS)
        self.assertIn('tests/feedback-item-discussion.test.mjs', d.TESTS)

    def test_unknown_ada_source_is_rejected(self):
        path = self.root / 'source/platform/ada/scripts/credentials.mjs'
        path.parent.mkdir(parents=True)
        path.write_text('unapproved source\n')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            d.scope(self.root, self.base, self.git('rev-parse', 'HEAD'))

    def test_ada_include_cannot_hide_transport_change(self):
        self.write_product(['platform/bos-mcp-client'])
        self.commit()
        baseline = self.git('rev-parse', 'HEAD')
        self.write_product(['platform/bos-mcp-client', 'platform/ada'], connection_owner='other')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'configuration'):
            d.scope(self.root, baseline, self.git('rev-parse', 'HEAD'))

    def test_include_addition_cannot_hide_other_product_changes(self):
        self.write_product(['platform/bos-mcp-client'])
        self.commit()
        baseline = self.git('rev-parse', 'HEAD')
        self.write_product(['platform/bos-mcp-client', 'platform/bos-customer-initialization'],
                           mcp_resource_url='https://attacker.invalid/mcp')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'configuration'):
            d.scope(self.root, baseline, self.git('rev-parse', 'HEAD'))

    def test_other_skill_files_beside_customer_initialization_are_not_admitted(self):
        path = self.root / 'source/platform/bos-customer-initialization/scripts/extra.mjs'
        path.parent.mkdir(parents=True)
        path.write_text('execute()\n')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'Unsupported'):
            self.validate()

    def test_existing_selected_contract_cannot_be_overridden(self):
        path = self.root / 'tools/validation-selection.json'
        path.parent.mkdir()
        path.write_text('{}')
        self.commit()
        with self.assertRaises(ValueError):
            self.validate()

    def test_wrong_ref_destination_or_moved_base_has_no_write(self):
        value = self.validate()
        for ref, remote, base, message in (
            ('codex/release-v9.0.0', 'https://github.com/' + d.native.REPOSITORY + '.git', value['base'], 'version-bound'),
            ('codex/release-v1.0.0', 'https://example.invalid/other.git', value['base'], 'destination'),
            ('codex/release-v1.0.0', 'https://github.com/' + d.native.REPOSITORY + '.git', 'f' * 40, 'base moved'),
        ):
            def observed(root, *args):
                return remote if args[0] == 'remote' else base + '\trefs/heads/main'
            with self.subTest(message=message), patch.object(d, 'read_receipt', return_value=value), \
                    patch.object(d, 'blob', return_value=b'{"version":"1.0.0"}'), \
                    patch.object(d.native, 'git', side_effect=observed), patch.object(d.subprocess, 'run') as run:
                with self.assertRaisesRegex(ValueError, message):
                    d.publish(self.root, ref)
                run.assert_not_called()

    def test_failed_remote_ci_cannot_merge(self):
        value = self.validate()
        from tools import publication_admission as admission
        def observed(root, *args):
            if args[0] == 'remote':
                return 'https://github.com/' + d.native.REPOSITORY + '.git'
            return value['base'] + '\trefs/heads/main'
        with patch.object(d, 'read_receipt', return_value=value), \
                patch.object(d, 'blob', return_value=b'{"version":"1.0.0"}'), \
                patch.object(d.native, 'git', side_effect=observed), \
                patch.object(admission, '_remote_admission', side_effect=ValueError('required CI failed')), \
                patch.object(d.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'CI failed'):
                d.publish(self.root, 'codex/release-v1.0.0', '1')
            run.assert_not_called()

    def test_existing_owner_ssh_publishes_only_the_verified_sha_and_version_ref(self):
        value = self.validate()
        store = d.directory(self.root)
        remote = 'git' + chr(64) + 'github.com:' + d.native.REPOSITORY + '.git'
        def observed(root, *args):
            if args[-1] == 'refs/heads/codex/release-v1.0.0':
                return value['source'] + '\t' + args[-1]
            return remote if args[0] == 'remote' else value['base'] + '\trefs/heads/main'
        with patch.object(d, 'read_receipt', return_value=value), \
                patch.object(d, 'blob', return_value=b'{"version":"1.0.0"}'), \
                patch.object(d, 'directory', return_value=store), \
                patch.object(d.native, 'git', side_effect=observed), \
                patch.object(d.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'published', b'')) as run:
            result = d.publish(self.root, 'codex/release-v1.0.0')
            self.assertEqual(result['status'], 'RELEASE_SOURCE_PUSHED')
            self.assertFalse(result['deployment_authorized'])
            run.assert_called_once_with(['git', 'push', remote,
                                         value['source'] + ':refs/heads/codex/release-v1.0.0'],
                                        cwd=self.root, capture_output=True, timeout=120)
            self.assertEqual(len(list(store.glob('*.publication.json'))), 1)

    def test_failed_publication_retains_actual_native_output_without_success(self):
        value = self.validate()
        store = d.directory(self.root)
        result = subprocess.CompletedProcess(['git'], 128, b'', b'permission denied')
        with patch.object(d, 'directory', return_value=store), \
                patch.object(d.subprocess, 'run', return_value=result):
            with self.assertRaisesRegex(ValueError, 'publication failed'):
                d.effect(self.root, ['git', 'push'], value)
        records = [json.loads(path.read_bytes()) for path in store.glob('*.publication.json')]
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]['exit_code'], 128)
        self.assertEqual(records[0]['source'], value['source'])
        self.assertIn(b'permission denied', (store / (records[0]['output_sha256'] + '.log')).read_bytes())

    def test_pull_request_option_injection_is_refused_before_any_effect(self):
        with patch.object(d, 'read_receipt') as read, patch.object(d.subprocess, 'run') as run:
            with self.assertRaisesRegex(ValueError, 'numeric'):
                d.publish(self.root, 'codex/release-v1.0.0', '--admin')
            read.assert_not_called()
            run.assert_not_called()

    def actions(self):
        source = self.git('rev-parse', 'HEAD')
        run = {'id': 41, 'path': '.github/workflows/publication-safety.yml',
               'head_sha': source, 'head_branch': 'codex/release-v1.0.0', 'event': 'push',
               'repository': {'full_name': d.native.REPOSITORY},
               'head_repository': {'full_name': d.native.REPOSITORY},
               'status': 'completed', 'conclusion': 'success'}
        jobs = {'total_count': 1, 'jobs': [{'name': 'verify-public-repository',
                'conclusion': 'success', 'steps': [{'name':
                'Verify the fixed deterministic source or skill-package category',
                'conclusion': 'success'}]}]}
        return source, run, jobs

    def test_ci_consumes_exact_repository_source_and_required_native_step(self):
        source, run, jobs = self.actions()
        def read(path):
            return jobs if '/jobs?' in path else {'total_count': 1, 'workflow_runs': [run]}
        result = d.ci_observation(source, 'codex/release-v1.0.0', read)
        self.assertEqual(result['run']['id'], 41)

    def test_published_main_commit_is_verified_by_exact_release_ci(self):
        source, run, jobs = self.actions()
        self.git('update-ref', 'refs/remotes/origin/main', source)
        def read(path):
            return jobs if '/jobs?' in path else {'total_count': 1, 'workflow_runs': [run]}
        result = d.verify_published(self.root, source, read)
        self.assertEqual((result['status'], result['version'], result['run']), ('PUBLISHED_VERIFIED', '1.0.0', 41))

    def test_published_verification_requires_main_ancestry_success_and_exact_sha(self):
        source, run, jobs = self.actions()
        read = lambda path: jobs if '/jobs?' in path else {'total_count': 1, 'workflow_runs': [run]}
        with self.assertRaises(subprocess.CalledProcessError):
            d.verify_published(self.root, source, read)  # not on origin/main
        self.git('update-ref', 'refs/remotes/origin/main', self.base)
        with self.assertRaises(subprocess.CalledProcessError):
            d.verify_published(self.root, source, read)  # main does not contain it
        self.git('update-ref', 'refs/remotes/origin/main', source)
        failed = {**run, 'conclusion': 'failure'}
        with self.assertRaisesRegex(ValueError, 'not successful'):
            d.verify_published(self.root, source,
                               lambda path: jobs if '/jobs?' in path else {'total_count': 1, 'workflow_runs': [failed]})
        for value in ('main', 'a' * 39, None):
            with self.assertRaisesRegex(ValueError, 'Exact 40-character'):
                d.verify_published(self.root, value, read)

    def test_ci_foreign_source_branch_repository_workflow_or_event_cannot_pass(self):
        source, run, jobs = self.actions()
        for key, wrong in [('head_sha', 'f' * 40), ('head_branch', 'main'),
                           ('repository', {'full_name': 'other/repository'}),
                           ('head_repository', {'full_name': 'other/repository'}),
                           ('path', '.github/workflows/unrelated.yml'), ('event', 'workflow_dispatch')]:
            changed = dict(run, **{key: wrong})
            with self.subTest(key=key):
                with self.assertRaises(ValueError):
                    d.ci_observation(source, 'codex/release-v1.0.0', lambda path:
                                     jobs if '/jobs?' in path else {'total_count': 1, 'workflow_runs': [changed]})

    def test_later_failed_ci_cannot_fall_back_to_older_success(self):
        source, run, jobs = self.actions()
        failed = dict(run, id=42, conclusion='failure')
        with self.assertRaisesRegex(ValueError, 'not successful'):
            d.ci_observation(source, 'codex/release-v1.0.0', lambda path:
                             {'total_count': 2, 'workflow_runs': [run, failed]})

    def test_pending_absent_or_incomplete_ci_cannot_pass(self):
        source, run, jobs = self.actions()
        for data in ({'total_count': 0, 'workflow_runs': []},
                     {'total_count': 101, 'workflow_runs': [run]},
                     {'total_count': 1, 'workflow_runs': [dict(run, status='in_progress')]}):
            with self.subTest(data=data):
                with self.assertRaises(ValueError):
                    d.ci_observation(source, 'codex/release-v1.0.0', lambda path: data)

    def test_skipped_missing_or_failed_fixed_ci_step_cannot_pass(self):
        source, run, jobs = self.actions()
        for conclusion in ('skipped', 'failure', None):
            changed = json.loads(json.dumps(jobs))
            changed['jobs'][0]['steps'][0]['conclusion'] = conclusion
            with self.subTest(conclusion=conclusion):
                with self.assertRaisesRegex(ValueError, 'native execution'):
                    d.ci_observation(source, 'codex/release-v1.0.0', lambda path:
                                     changed if '/jobs?' in path else {'total_count': 1, 'workflow_runs': [run]})

    def test_ssh_promotion_requires_green_ci_and_unchanged_base_before_write(self):
        value = self.validate()
        store = d.directory(self.root)
        remote = 'git' + chr(64) + 'github.com:' + d.native.REPOSITORY + '.git'
        for moved in (True, False):
            def observed(root, *args):
                if args[0] == 'remote':
                    return remote
                if args[-1].endswith('release-v1.0.0'):
                    return value['source'] + '\t' + args[-1]
                return ('f' * 40 if moved else value['base']) + '\trefs/heads/main'
            with self.subTest(moved=moved), patch.object(d, 'read_receipt', return_value=value), \
                    patch.object(d, 'blob', return_value=b'{"version":"1.0.0"}'), \
                    patch.object(d, 'directory', return_value=store), \
                    patch.object(d.native, 'git', side_effect=observed), \
                    patch.object(d, 'ci_observation', side_effect=(None if moved else ValueError('CI pending')),
                                 return_value={'run': {'id': 41}}), \
                    patch.object(d, 'effect') as effect:
                with self.assertRaisesRegex(ValueError, 'base moved|CI pending'):
                    d.promote(self.root, 'codex/release-v1.0.0')
                effect.assert_not_called()

    def test_successful_ssh_promotion_uses_ordinary_push_and_checks_remote_sha(self):
        value = self.validate()
        store = d.directory(self.root)
        remote = 'git' + chr(64) + 'github.com:' + d.native.REPOSITORY + '.git'
        written = []
        def observed(root, *args):
            if args[0] == 'remote':
                return remote
            if args[-1].endswith('release-v1.0.0') or written:
                return value['source'] + '\t' + args[-1]
            return value['base'] + '\trefs/heads/main'
        with patch.object(d, 'read_receipt', return_value=value), \
                patch.object(d, 'blob', return_value=b'{"version":"1.0.0"}'), \
                patch.object(d, 'directory', return_value=store), \
                patch.object(d.native, 'git', side_effect=observed), \
                patch.object(d, 'ci_observation', return_value={'run': {'id': 41}}), \
                patch.object(d, 'effect', side_effect=lambda root, command, receipt: written.append(command)):
            result = d.promote(self.root, 'codex/release-v1.0.0')
            self.assertEqual(result['status'], 'RELEASE_PUBLISHED')
            self.assertEqual(written, [['git', 'push', '--force-with-lease=refs/heads/main:' + value['base'], remote,
                                        value['source'] + ':refs/heads/main']])


if __name__ == '__main__':
    unittest.main()
