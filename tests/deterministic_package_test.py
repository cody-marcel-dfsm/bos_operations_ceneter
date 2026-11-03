"""Negative admission, completeness, custody and publication tests; no model calls."""
import json
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
        self.temp = tempfile.TemporaryDirectory()
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
        self.commands = patch.object(d, 'CHECKS', [[sys.executable, '-c', 'print("actual command")']])
        self.commands.start()
        self.addCleanup(self.commands.stop)

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, text=True,
                                       stderr=subprocess.DEVNULL).strip()

    def commit(self):
        self.git('add', '-A')
        self.git('commit', '-qm', 'fixture source')

    def validate(self):
        return d.validate(self.root, self.base, '2020-01-01T00:00:00Z')

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


if __name__ == '__main__':
    unittest.main()
