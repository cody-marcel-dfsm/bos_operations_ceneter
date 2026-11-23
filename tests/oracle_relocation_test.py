"""Relocated-checkout regressions: retire old-root admissions without adopting them."""
from pathlib import Path
import fcntl
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import oracle_approval as o
from tools import oracle_lifecycle as lifecycle


CHILD = r'''
from pathlib import Path
import os,sys,time,json
from tools import oracle_approval as o
root=Path(sys.argv[1]).resolve()
def body(root,evidence,owner):
    (root/'.git/oracle/entered').write_text('entered')
    if sys.argv[2]=='sleep':time.sleep(30)
    return {'verdict':'APPROVED','owner':os.getpid()}
kind=sys.argv[3]
body.__name__=kind
issue=o._serialized_review(body)
print(json.dumps(issue(root,[],None)),flush=True)
'''


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


class Relocation(unittest.TestCase):
    def setUp(self):
        engine = patch.dict(os.environ, {'BOC_ORACLE_ENGINE': 'codex'}); engine.start(); self.addCleanup(engine.stop)
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name).resolve()
        self.old = self.base / 'old'
        self.new = self.base / 'new'
        subprocess.run(['git', 'init', '-q', str(self.old)], check=True)
        for args in [('config', 'user.name', 'Synthetic Reviewer'), ('config', 'user.email', 'review@example.invalid'),
                     ('commit', '--allow-empty', '-qm', 'base'), ('branch', '-M', 'main')]:
            subprocess.run(['git', *args], cwd=self.old, check=True)
        self.env = dict(os.environ, PYTHONPATH=str(Path(__file__).resolve().parents[1]),
                        CODEX_THREAD_ID='', CODEX_SELECTED_MODEL='synthetic-model',
                        CODEX_SELECTED_REASONING_EFFORT='low')
        self.children = []
        self.addCleanup(self.stop)

    def stop(self):
        for p in self.children:
            if p.poll() is None:
                p.kill()
            p.communicate()

    def start(self, root, mode='normal', kind='issue'):
        p = subprocess.Popen([sys.executable, '-c', CHILD, str(root), mode, kind], env=self.env,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.children.append(p)
        return p

    def run_child(self, root, kind='issue'):
        p = self.start(root, kind=kind)
        stdout, stderr = p.communicate(timeout=30)
        self.assertEqual(p.returncode, 0, stderr)
        return json.loads(stdout)

    def admissions(self, root, name='admissions'):
        directory = root / '.git/oracle/controllers' / name
        return sorted(directory.iterdir()) if directory.exists() else []

    def snapshot(self, root):
        controllers = root / '.git/oracle/controllers'
        return {str(p.relative_to(controllers)): p.read_bytes()
                for p in controllers.rglob('*') if p.is_file() and not p.name.startswith('.')}

    def renamed(self):
        self.run_child(self.old)
        before = self.snapshot(self.old)
        self.old.rename(self.new)
        return before

    def relocate(self, root, old):
        return lifecycle.relocate(o, root, str(old))

    def test_renamed_checkout_fails_before_and_admits_fresh_controller_after(self):
        before = self.renamed()
        with self.assertRaisesRegex(o.OracleApprovalError, 'identity'):
            lifecycle.active(o, self.new)
        record = self.relocate(self.new, self.old)
        self.assertEqual(record['from_root'], str(self.old))
        self.assertEqual(record['to_root'], str(self.new))
        self.assertEqual(record['retired']['admissions']['count'], 1)
        self.assertEqual(lifecycle._last(o, self.new), (None, 1))
        self.assertIsNone(lifecycle.active(o, self.new))
        self.run_child(self.new)
        first, second = self.admissions(self.new)
        self.assertEqual(json.loads(second.read_text())['previous_sha256'], sha(first.read_bytes()))
        self.assertEqual(json.loads(second.read_text())['root'], str(self.new))
        after = self.snapshot(self.new)
        self.assertEqual({k: after[k] for k in before}, before)
        identity, count = lifecycle._last(o, self.new)
        self.assertEqual(count, 2)
        self.assertEqual(identity['root'], str(self.new))

    def test_relocation_refuses_existing_identical_unknown_and_repeated_roots(self):
        self.renamed()
        self.old.mkdir()
        with self.assertRaisesRegex(o.OracleApprovalError, 'still exists'):
            self.relocate(self.new, self.old)
        self.old.rmdir()
        with self.assertRaisesRegex(o.OracleApprovalError, 'current checkout'):
            self.relocate(self.new, self.new)
        with self.assertRaisesRegex(o.OracleApprovalError, 'Nothing to retire'):
            self.relocate(self.new, self.base / 'unknown')
        with self.assertRaisesRegex(o.OracleApprovalError, 'relative'):
            self.relocate(self.new, 'relative/root')
        self.relocate(self.new, self.old)
        with self.assertRaisesRegex(o.OracleApprovalError, 'Nothing to retire|does not end'):
            self.relocate(self.new, self.old)
        self.assertEqual(len(self.admissions(self.new)), 1)

    def test_repeated_renames_retire_cumulatively(self):
        self.renamed()
        self.relocate(self.new, self.old)
        self.run_child(self.new)
        third = self.base / 'third'
        self.new.rename(third)
        with self.assertRaisesRegex(o.OracleApprovalError, 'does not name this checkout|identity'):
            lifecycle.active(o, third)
        record = lifecycle.relocate(o, third, str(self.new))
        self.assertEqual(record['retired']['admissions']['count'], 2)
        self.assertEqual(lifecycle._last(o, third), (None, 2))
        self.run_child(third)
        self.assertEqual(len(self.admissions(third)), 3)

    def test_independent_current_chain_is_not_retired_and_keeps_its_checks(self):
        self.renamed()
        self.run_child(self.new, kind='other_kind')
        name = next(p.name for p in (self.new / '.git/oracle/controllers').iterdir()
                    if p.name.startswith('other_kind-') and p.name.endswith('-admissions'))
        current = [p.read_bytes() for p in self.admissions(self.new, name)]
        record = self.relocate(self.new, self.old)
        self.assertEqual(set(record['retired']), {'admissions'})
        self.assertEqual([p.read_bytes() for p in self.admissions(self.new, name)], current)
        identity, count = lifecycle._last(o, self.new, 'other_kind', 'other_kind')
        self.assertEqual((identity['root'], count), (str(self.new), 1))

    def test_mixed_or_foreign_root_segment_is_refused(self):
        self.renamed()
        first = self.admissions(self.new)[0]
        value = json.loads(first.read_text())
        value.update(root='/foreign/root', previous_sha256=sha(first.read_bytes()))
        forged = first.parent / '00000002.json'
        forged.write_bytes(o._pretty(value))
        with self.assertRaisesRegex(o.OracleApprovalError, 'mixes roots'):
            self.relocate(self.new, self.old)
        self.assertFalse((self.new / '.git/oracle/relocations').exists())

    def test_tampered_relocation_or_retired_records_fail_closed(self):
        self.renamed()
        self.relocate(self.new, self.old)
        relocation = next((self.new / '.git/oracle/relocations').iterdir())
        original = relocation.read_bytes()
        value = json.loads(original); value['to_root'] = '/foreign/root'
        relocation.write_bytes(o._pretty(value))
        with self.assertRaisesRegex(o.OracleApprovalError, 'relocation'):
            lifecycle.active(o, self.new)
        relocation.write_bytes(original)
        retired = self.admissions(self.new)[0]
        raw = retired.read_bytes()
        retired.write_bytes(raw.replace(b'"kind"', b'"kind" ', 1))
        with self.assertRaisesRegex(o.OracleApprovalError, 'Retired admission'):
            lifecycle.active(o, self.new)
        retired.write_bytes(raw)
        self.assertIsNone(lifecycle.active(o, self.new))

    def test_copied_repository_after_relocation_is_rejected(self):
        self.renamed()
        self.relocate(self.new, self.old)
        copy = self.base / 'copy'
        shutil.copytree(self.new, copy, symlinks=True)
        with self.assertRaisesRegex(o.OracleApprovalError, 'does not name this checkout|another Git directory'):
            lifecycle.active(o, copy)

    def test_pre_relocation_copy_gains_no_historical_result(self):
        self.run_child(self.old)
        copy = self.base / 'copy'
        shutil.copytree(self.old, copy, symlinks=True)
        self.old.rename(self.new)
        lifecycle.relocate(o, copy, str(self.old))
        self.assertEqual(lifecycle._last(o, copy), (None, 1))
        self.assertIsNone(lifecycle.active(o, copy))
        result = self.run_child(copy)
        self.assertEqual(result['verdict'], 'APPROVED')
        identity, count = lifecycle._last(o, copy)
        self.assertEqual((identity['root'], count), (str(copy), 2))

    def test_live_original_controller_blocks_retirement(self):
        owner = self.start(self.old, 'sleep')
        deadline = time.monotonic() + 10
        while not (self.old / '.git/oracle/entered').exists():
            if time.monotonic() > deadline:
                self.fail('Owner did not enter native attempt')
            time.sleep(.02)
        self.old.rename(self.new)
        with self.assertRaisesRegex(o.OracleApprovalError, 'alive'):
            self.relocate(self.new, self.old)
        self.assertFalse((self.new / '.git/oracle/relocations').exists())
        owner.kill(); owner.communicate()
        self.relocate(self.new, self.old)

    def test_malformed_liveness_evidence_refuses_retirement(self):
        self.renamed()
        record = json.loads(self.admissions(self.new)[0].read_text())
        directory = Path(str(self.new) + record['directory'][len(str(self.old)):])
        children = directory / 'children'
        children.mkdir(exist_ok=True)
        (children / ('reviewer-' + '0' * 32 + '.json')).write_text('not json')
        with self.assertRaisesRegex(o.OracleApprovalError, 'alive'):
            self.relocate(self.new, self.old)

    def test_concurrent_relocation_and_moved_heads_fail_closed(self):
        self.renamed()
        lock = self.new / '.git/oracle/controllers/.relocation.lock'
        with lock.open('a') as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            with self.assertRaisesRegex(o.OracleApprovalError, 'in progress'):
                self.relocate(self.new, self.old)
        real = lifecycle._retirement_plan
        calls = []
        def moving(*args, **kwargs):
            plan = real(*args, **kwargs)
            calls.append(plan)
            if len(calls) == 2:
                plan = {name: dict(value, count=value['count'] + 1) for name, value in plan.items()}
            return plan
        with patch.object(lifecycle, '_retirement_plan', moving):
            with self.assertRaisesRegex(o.OracleApprovalError, 'moved'):
                self.relocate(self.new, self.old)
        self.assertFalse((self.new / '.git/oracle/relocations').exists())


if __name__ == '__main__':
    unittest.main()
