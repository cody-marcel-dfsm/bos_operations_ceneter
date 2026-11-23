"""Sealed Oracle spec: seal, stamp, privacy, engines, external authority, gate, lanes and migration.

Synthetic fixtures only; no model is launched (the claude and codex runners are fakes).
"""
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import validation_contract as v
from tools import oracle_spec_seal as seal_module
from tools import oracle_approval as oracle
from tools import deterministic_source as source_lane
from tools import deterministic_package as package_lane

REPOSITORY = Path(__file__).resolve().parents[1]
PROPOSAL = 'Problem: synthetic. Cause: synthetic. Recommended change: synthetic.'
ORIGIN = 'b' * 40
APPROVED = {'verdict': 'APPROVED', 'findings': [], 'authentication_impact': 'NONE',
            'owner_approval_status': 'NOT_REQUIRED',
            'api_version_assessment': {'impact': 'NONE', 'request_kind': 'NOT_REQUIRED', 'requested_change': None,
                                       'request_quote': None, 'request_evidence': None}}


def stamp(proposal=PROPOSAL, **change):
    return {'engine': 'codex', 'model': 'synthetic-model', 'oracle_sha256': 'a' * 64, 'host': 'synthetic-host',
            'time': '2026-11-11T00:00:00Z', 'origin_main': ORIGIN, 'request_sha256': None,
            'proposal_sha256': hashlib.sha256(proposal.encode()).hexdigest(), **change}


class Fixture(unittest.TestCase):
    def setUp(self):
        environment = patch.dict(os.environ, {'BOC_ORACLE_ENGINE': 'codex'})
        environment.start()
        self.addCleanup(environment.stop)
        scratch=REPOSITORY/'Vault/tmp';scratch.mkdir(parents=True,exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=scratch,prefix='oracle-spec-')
        self.addCleanup(self.temp.cleanup)
        self.root = (Path(self.temp.name) / 'repository').resolve()
        for name in ('tools', 'tests'):
            (self.root / name).mkdir(parents=True)
        catalog = {'schema': 'boc.validation-catalog/v1', 'classes': copy.deepcopy(v.CLASSES),
                   'sla_seconds': copy.deepcopy(v.SLA_SECONDS), 'maximum_reasoning_effort': 'medium',
                   'regression': [{'test': 'tests/regression.test.mjs', 'recurrence': 'Synthetic', 'boundary': 'Synthetic'}]}
        self.catalog = catalog
        (self.root / v.CATALOG).write_text(json.dumps(catalog))
        (self.root / 'package.json').write_text(json.dumps({'scripts': {'check:privacy': 'node -e "process.exit(0)"',
                                                                         'check:publication': 'node -e "process.exit(0)"'}}))
        for module in (v, seal_module):
            (self.root / 'tools' / Path(module.__file__).name).write_bytes(Path(module.__file__).read_bytes())
        (self.root / 'source.mjs').write_text('export default true;\n')
        (self.root / 'AGENTS.md').write_text('Synthetic governing criterion\n')
        (self.root / '.gitignore').write_text('__pycache__/\n')  # Imported helper modules may write bytecode.
        (self.root / 'tests/spec.test.mjs').write_text(
            "import test from 'node:test';import assert from 'node:assert/strict';import value from '../source.mjs';"
            "test('synthetic acceptance',()=>assert.equal(value,true));\n")
        self.git('init', '-q', '-b', 'main')
        self.git('config', 'user.name', 'Synthetic')
        self.git('config', 'user.email', 'synthetic@example.invalid')
        self.base = self.commit()

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.root, stderr=subprocess.DEVNULL).decode().strip()

    def commit(self, message='synthetic'):
        self.git('add', '-A')
        self.git('commit', '-qm', message)
        return self.git('rev-parse', 'HEAD')

    def selection(self, kind='bug_fix', **change):
        value = {'change_class': kind, 'scope_paths': ['source.mjs', 'README.md', 'tests/*', 'tools/*'],
                 'categories': [{'name': name, 'tests': [] if name in {'sanity', 'regression'} else ['tests/spec.test.mjs'],
                                 'fixtures': []} for name in v.CLASSES[kind]],
                 'reason': 'Synthetic coverage', 'revision_of': None, 'design': None,
                 'acceptance': [] if kind == 'docs_only' else ['The synthetic value is true'],
                 'acceptance_tests': [] if kind == 'docs_only' else
                 [{'module': 'tests/spec.test.mjs', 'covers': [0], 'purpose': 'Proves the synthetic value'}]}
        value.update(change)
        return value

    def sealed(self, kind='bug_fix', **change):
        contract = v.seal(self.root, self.selection(kind, **change), PROPOSAL, APPROVED, base=self.base, stamp=stamp())
        v.write_selection(self.root, contract)
        return contract


class SealAndStamp(Fixture):
    def test_family_seal_formula_vector_and_tamper(self):
        value = {'kind': 'oracle-spec/1', 'title': 'Grüße', 'n': 1, 'list': [1, {'b': 2, 'a': None}]}
        canonical = json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)
        expected = hashlib.sha256(b'oracle-spec/1\0' + canonical.encode()).hexdigest()
        self.assertEqual(seal_module.compute_seal(value), expected)
        self.assertEqual(seal_module.compute_seal(dict(value, seal='ignored')), expected)
        sealed = dict(value, seal=expected)
        self.assertTrue(seal_module.seal_matches(sealed))
        for change in ({'title': 'Grusse'}, {'kind': 'other'}, {'seal': '0' * 64}, {'n': float('nan')}):
            self.assertFalse(seal_module.seal_matches(dict(sealed, **change)))

    def test_sealed_contract_is_the_spec_with_stamp_acceptance_and_seal(self):
        contract = self.sealed()
        self.assertEqual((contract['schema'], contract['kind']), (v.SCHEMA, 'oracle-spec/1'))
        self.assertTrue(seal_module.seal_matches(contract))
        self.assertEqual(contract['stamp']['origin_main'], ORIGIN)
        self.assertEqual(contract['selection']['acceptance'], ['The synthetic value is true'])
        self.assertNotIn(PROPOSAL, json.dumps(contract))
        self.commit()
        self.assertEqual(v.verify(self.root)['seal'], contract['seal'])

    def test_stamp_shape_is_required(self):
        for change in ({'engine': 'gpt'}, {'model': ' '}, {'time': '2026-11-11 00:00'}, {'origin_main': 'x'},
                       {'oracle_sha256': 'short'}, {'request_sha256': 'nothex'}, {'host': '/home/someone'}):
            with self.assertRaisesRegex(ValueError, 'stamp'):
                v.seal(self.root, self.selection(), PROPOSAL, APPROVED, base=self.base, stamp=stamp(**change))
        broken = stamp()
        broken.pop('host')
        with self.assertRaisesRegex(ValueError, 'stamp'):
            v.seal(self.root, self.selection(), PROPOSAL, APPROVED, base=self.base, stamp=broken)
        with self.assertRaisesRegex(ValueError, 'different proposal'):
            v.seal(self.root, self.selection(), 'another proposal', APPROVED, base=self.base, stamp=stamp())
        self.assertEqual(len(v.oracle_sha256(REPOSITORY)), 64)

    def test_acceptance_criteria_and_tests_are_required_and_complete(self):
        row = {'module': 'tests/spec.test.mjs', 'covers': [0], 'purpose': 'Proof'}
        for change, message in [({'acceptance': []}, 'acceptance criteria and the tests'),
                                ({'acceptance_tests': []}, 'acceptance criteria and the tests'),
                                ({'acceptance': ['One', 'Two']}, 'without a test'),
                                ({'acceptance_tests': [dict(row, module='tests/other.test.mjs')]}, 'selected test module'),
                                ({'acceptance_tests': [dict(row, covers=[3])]}, 'criterion indices'),
                                ({'acceptance_tests': [dict(row, covers=[True])]}, 'criterion indices'),
                                ({'acceptance_tests': [row, row]}, 'repeat'),
                                ({'acceptance': [' ']}, 'nonempty strings')]:
            with self.assertRaisesRegex(ValueError, message):
                v.validate_selection(self.selection(**change), self.catalog)
        self.assertEqual(v.validate_selection(self.selection('docs_only'), self.catalog)['acceptance'], [])
        self.assertIn('acceptance_tests', v.selection_schema()['required'])

    def test_private_text_is_refused(self):
        for text in ('Authorization: Bearer abcdefghijklmnop', 'password=hunter2hunter2', 'see /home/someone/notes',
                     'path C:\\Users\\someone', 'sk_live_abcdefghijklmnopqr', '-----BEGIN ' + 'PRIVATE KEY-----'):  # split so the package credential scan never sees a key header
            with self.assertRaisesRegex(ValueError, 'publishable'):
                v.validate_selection(self.selection(acceptance=[text]), self.catalog)
        self.assertEqual(v.private_matches({'a': ['tests/spec.test.mjs', 'Vault/docs/design/x.md']}), [])


class Gate(Fixture):
    def change(self, name='source.mjs', text='export default true; // changed\n'):
        (self.root / name).write_text(text)

    def test_docs_only_range_needs_no_spec(self):
        self.change('README.md', '# Synthetic\n')
        head = self.commit()
        self.assertEqual(v.gate(self.root, self.base, head)['status'], 'DOCS_ONLY')
        for name in ('AGENTS.md', 'CLAUDE.md', '.agents/skills/x/SKILL.md', '.claude/skills/x/SKILL.md', 'source/a.md'):
            self.assertFalse(v.documentation(name))

    def test_non_docs_without_its_own_spec_fails_immediately(self):
        self.change()
        head = self.commit()
        with self.assertRaisesRegex(ValueError, 'lacks its sealed Oracle spec'):
            v.gate(self.root, self.base, head)
        self.sealed()
        self.commit()
        newer = self.git('rev-parse', 'HEAD')
        self.change(text='export default true; // later\n')
        later = self.commit()
        # A spec sealed for an earlier changelist does not admit a later one.
        with self.assertRaisesRegex(ValueError, 'lacks its sealed Oracle spec'):
            v.gate(self.root, newer, later)

    def test_valid_spec_admits_and_mismatches_fail(self):
        self.change()
        contract = self.sealed()
        head = self.commit()
        result = v.gate(self.root, self.base, head)
        self.assertEqual((result['status'], result['seal']), ('SPEC_SEALED', contract['seal']))
        forged = copy.deepcopy(contract)
        forged['selection']['acceptance'] = ['A different criterion']
        forged['contract_sha256'] = v.digest({k: x for k, x in forged.items() if k not in ('contract_sha256', 'seal')})
        (self.root / v.SELECTION).write_text(json.dumps(forged))
        with self.assertRaisesRegex(ValueError, 'does not recompute'):
            v.gate(self.root, self.base, self.commit())
        (self.root / v.SELECTION).write_text('not json')
        with self.assertRaises(ValueError):
            v.gate(self.root, self.base, self.commit())

    def test_out_of_scope_path_and_docs_only_spec_fail(self):
        self.change()
        self.sealed()
        (self.root / 'outside.mjs').write_text('export default 1;\n')
        with self.assertRaisesRegex(ValueError, 'outside fixed selection'):
            v.gate(self.root, self.base, self.commit())

    def test_whole_publication_range_must_be_inside_the_spec_scope(self):
        # Unpublished work committed before the spec's own base is still part of the range.
        (self.root / 'unscoped.mjs').write_text('export default 2;\n')
        self.base_before = self.base
        self.base = self.commit()
        self.change()
        self.sealed()
        head = self.commit()
        self.assertEqual(v.gate(self.root, self.base, head)['status'], 'SPEC_SEALED')
        with self.assertRaisesRegex(ValueError, 'outside the sealed spec scope: unscoped.mjs'):
            v.gate(self.root, self.base_before, head)

    def test_ci_execute_runs_spec_tests_and_refuses_failures(self):
        self.change()
        self.sealed()
        head = self.commit()
        result = v.ci_execute(self.root, head)
        self.assertEqual(result['status'], 'SPEC_TESTS_PASSED')
        self.assertEqual([row['category'] for row in result['results']], ['sanity', 'focused'])
        self.change(text='export default false;\n')
        self.commit()
        with self.assertRaisesRegex(ValueError, 'focused'):
            v.ci_execute(self.root)

    def test_local_admission_refuses_forged_or_altered_proposal_records(self):
        self.change()
        contract = self.sealed()
        head = self.commit()
        with self.assertRaisesRegex(ValueError, 'never reseal by hand'):
            v.native_origin(self.root, head)
        folder = self.root / '.git/oracle/proposals'
        folder.mkdir(parents=True)
        forged = {'kind': 'proposal-review', 'review': {'verdict': 'APPROVED'}, 'validation_contract': contract,
                  'proposal_sha256': contract['stamp']['proposal_sha256']}
        raw = (json.dumps(forged, indent=2, sort_keys=True) + '\n').encode()
        for name in ('not-a-native-proposal.json', hashlib.sha256(raw).hexdigest() + '.json'):
            (folder / name).write_bytes(raw)  # The four-field assertion, under any name.
        with self.assertRaisesRegex(ValueError, 'never reseal by hand'):
            v.native_origin(self.root, head)


class Lanes(Fixture):
    def test_source_lane_admits_sealed_spec_and_refuses_missing_one(self):
        self.change_tool()
        with self.assertRaisesRegex(ValueError, 'lacks its sealed Oracle spec'):
            source_lane.scope(self.root, self.base, self.commit())
        self.sealed()
        head = self.commit()
        self.assertIn(v.SELECTION, source_lane.scope(self.root, self.base, head))

    def test_package_lane_admits_only_sealed_or_pinned_selections(self):
        (self.root / 'scripts').mkdir()
        (self.root / 'scripts/release.mjs').write_text('export default 1;\n')
        with self.assertRaisesRegex(ValueError, 'lacks its sealed Oracle spec'):
            package_lane.scope(self.root, self.base, self.commit())
        contract = self.sealed(scope_paths=['scripts/*', 'tools/*'])
        head = self.commit()
        self.assertIn(v.SELECTION, package_lane.scope(self.root, self.base, head))
        self.assertTrue(package_lane.sealed_or_retired((self.root / v.SELECTION).read_bytes()))
        self.assertFalse(package_lane.sealed_or_retired(json.dumps(dict(contract, seal='0' * 64)).encode()))
        self.assertFalse(package_lane.sealed_or_retired(b'{"schema":"boc.validation-contract/v1"}'))

    def change_tool(self):
        (self.root / 'tools/validation_contract.py').write_text(
            (self.root / 'tools/validation_contract.py').read_text() + '\n# synthetic maintenance\n')


class ContinuousIntegration(Fixture):
    def run_ci(self, status, lane_admits):
        calls, real = [], subprocess.run
        refuse = lambda *args, **kwargs: (_ for _ in ()).throw(ValueError('not this lane'))
        with patch.object(package_lane.contract, 'gate', return_value={'status': status, 'seal': 's' * 64}), \
                patch.object(package_lane.native, 'scope', side_effect=None if lane_admits else refuse), \
                patch.object(package_lane.native, 'validate', return_value={'kind': 'boc-deterministic-source/1'}), \
                patch.object(package_lane, 'scope', side_effect=refuse), \
                patch.object(package_lane.contract, 'ci_execute', return_value={'status': 'SPEC_TESTS_PASSED', 'seal': 's' * 64}) as tests, \
                patch.object(package_lane.subprocess, 'run', side_effect=lambda command, *a, **kw:
                             real(command, *a, **kw) if command[0] == 'git' else calls.append(command)):
            self.assertEqual(package_lane.ci(self.root, self.base, '2026-11-11T00:00:00Z'), 0)
        return calls, tests

    def test_native_contract_range_runs_spec_tests_then_native_command_coverage(self):
        calls, tests = self.run_ci('SPEC_SEALED', lane_admits=False)
        tests.assert_called_once()
        self.assertEqual(calls[-1][1:4], ['tools/command_coverage.py', 'ci', '--candidate'])

    def test_deterministic_lane_range_needs_no_native_command_coverage(self):
        calls, tests = self.run_ci('SPEC_SEALED', lane_admits=True)
        tests.assert_not_called()  # The lane's own validate already executed and bound every category.
        self.assertFalse(any('tools/command_coverage.py' in command for command in calls))

    def test_gate_failure_stops_ci_before_any_lane(self):
        with patch.object(package_lane.contract, 'gate', side_effect=ValueError('lacks its sealed Oracle spec')), \
                patch.object(package_lane.native, 'scope') as lane:
            with self.assertRaisesRegex(ValueError, 'lacks its sealed'):
                package_lane.ci(self.root, self.base, '2026-11-11T00:00:00Z')
        lane.assert_not_called()


class Migration(Fixture):
    def proposal(self, selection):
        reviewer = lambda *args: dict(APPROVED, review_status='COMPLETE', validation_selection=selection)
        with patch.object(oracle, '_review_settings_binding', return_value={'model': 'synthetic', 'reasoning_effort': None}), \
                patch.object(oracle, '_fresh_origin', return_value=ORIGIN):
            return oracle.review_proposal(self.root, PROPOSAL, [], None, reviewer, request_bytes=b'synthetic request')

    def test_v1_contract_is_superseded_only_by_a_native_revision(self):
        body = {'schema': 'boc.validation-contract/v1', 'selection': {'change_class': 'bug_fix'}, 'base_commit': self.base}
        v1 = dict(body, contract_sha256=v.digest(body))
        (self.root / v.SELECTION).write_text(json.dumps(v1, indent=2) + '\n')
        self.commit('original v1 contract')
        v1_bytes = (self.root / v.SELECTION).read_bytes()
        with self.assertRaisesRegex(ValueError, 'revision'):
            self.proposal(self.selection())
        self.assertEqual((self.root / v.SELECTION).read_bytes(), v1_bytes)
        self.proposal(self.selection(revision_of=v1['contract_sha256']))
        migrated = json.loads((self.root / v.SELECTION).read_text())
        self.assertEqual((migrated['schema'], migrated['selection']['revision_of']), (v.SCHEMA, v1['contract_sha256']))
        stamped = migrated['stamp']
        self.assertEqual((stamped['engine'], stamped['model'], stamped['origin_main']), ('codex', 'synthetic', ORIGIN))
        self.assertEqual(stamped['request_sha256'], hashlib.sha256(b'synthetic request').hexdigest())
        self.assertEqual(stamped['proposal_sha256'], hashlib.sha256(PROPOSAL.encode()).hexdigest())
        self.assertEqual(self.git('show', 'HEAD:' + v.SELECTION).encode() + b'\n', v1_bytes)
        archive = list((self.root / '.git/oracle/proposals').glob('*.json'))
        self.assertTrue(any(json.loads(p.read_text()).get('validation_contract') == migrated for p in archive))
        (self.root / 'source.mjs').write_text('export default true; // repaired\n')
        head = self.commit()
        self.assertEqual(v.gate(self.root, self.base, head)['status'], 'SPEC_SEALED')
        self.assertTrue(v.native_origin(self.root, head))
        self.assertFalse(package_lane.sealed_or_retired(v1_bytes))

    def test_request_digest_names_the_bound_evidence_bytes(self):
        request = self.root / 'request.txt'
        request.write_text('Synthetic original request\n')
        reviewer = lambda *args: dict(APPROVED, review_status='COMPLETE', validation_selection=self.selection())
        with patch.object(oracle, '_review_settings_binding', return_value={'model': 'synthetic', 'reasoning_effort': None}), \
                patch.object(oracle, '_fresh_origin', return_value=ORIGIN):
            with self.assertRaisesRegex(oracle.OracleApprovalError, 'supplied as reviewer evidence'):
                oracle.review_proposal(self.root, PROPOSAL, [], None, reviewer, request_path=str(request))
            oracle.review_proposal(self.root, PROPOSAL, [str(request)], None, reviewer, request_path=str(request))
        stamped = json.loads((self.root / v.SELECTION).read_text())['stamp']
        self.assertEqual(stamped['request_sha256'], hashlib.sha256(request.read_bytes()).hexdigest())
        # Movement after the stamped read but before the guards bind the evidence is refused.
        actual = oracle._input_binding
        def moving(*args, **kwargs):
            request.write_text('Moved request\n')
            return actual(*args, **kwargs)
        with patch.object(oracle, '_review_settings_binding', return_value={'model': 'synthetic', 'reasoning_effort': None}), \
                patch.object(oracle, '_fresh_origin', return_value=ORIGIN), patch.object(oracle, '_input_binding', side_effect=moving):
            with self.assertRaisesRegex(oracle.OracleApprovalError, 'changed while its evidence was bound'):
                oracle.review_proposal(self.root, PROPOSAL + ' again', [str(request)], None, reviewer, request_path=str(request))

    def test_proposal_refuses_when_head_lacks_fetched_origin(self):
        remote = Path(self.temp.name) / 'origin.git'
        subprocess.run(['git', 'init', '-q', '--bare', '-b', 'main', str(remote)], check=True)
        self.git('remote', 'add', 'origin', str(remote))
        self.git('push', '-q', 'origin', 'main')
        self.assertEqual(oracle._fresh_origin(self.root), self.git('rev-parse', 'HEAD'))
        other = Path(self.temp.name) / 'other'
        subprocess.run(['git', 'clone', '-q', str(remote), str(other)], check=True, stderr=subprocess.DEVNULL)
        subprocess.run(['git', '-c', 'user.name=S', '-c', 'user.email=s@example.invalid', 'commit', '-q',
                        '--allow-empty', '-m', 'remote moved'], cwd=other, check=True)
        subprocess.run(['git', 'push', '-q', 'origin', 'main'], cwd=other, check=True, stderr=subprocess.DEVNULL)
        with self.assertRaisesRegex(oracle.OracleApprovalError, 'does not contain fetched origin/main'):
            oracle._fresh_origin(self.root)


class LaneExecution(Fixture):
    def genuine_spec(self, selection):
        reviewer = lambda *args: dict(APPROVED, review_status='COMPLETE', validation_selection=selection)
        with patch.object(oracle, '_review_settings_binding', return_value={'model': 'synthetic', 'reasoning_effort': None}), \
                patch.object(oracle, '_fresh_origin', return_value=ORIGIN):
            oracle.review_proposal(self.root, PROPOSAL, [], None, reviewer)

    MARKER = "import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';"
    REPAIRED = MARKER + "test('repaired',()=>assert.match(readFileSync('tools/validation_contract.py','utf8'),/synthetic maintenance/));\n"
    NEVER = MARKER + "test('never repaired',()=>assert.match(readFileSync('tools/validation_contract.py','utf8'),/absent marker/));\n"

    def prepare(self, test_body, *, reproduce=True):
        (self.root / '.gitignore').write_text('__pycache__/\nnode_modules/\n')
        (self.root / 'node_modules').mkdir()
        (self.root / 'node_modules/dependency').write_text('locked')
        (self.root / 'tests/spec.test.mjs').write_text(test_body)
        self.base = self.commit()
        self.genuine_spec(self.selection())
        self.commit('sealed spec')
        if reproduce:  # The bug-fix reproduction fails before the repair, through the native runner.
            done = subprocess.run([sys.executable, 'tools/validation_contract.py', 'run', '--category', 'focused',
                                   '--phase', 'before'], cwd=self.root, capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        (self.root / 'tools/validation_contract.py').write_text(
            (self.root / 'tools/validation_contract.py').read_text() + '\n# synthetic maintenance\n')
        return self.commit('repair')

    def validate(self):
        with patch.object(source_lane, 'CHECKS', [[sys.executable, '-c', 'print("fixed check")']]):
            return source_lane.validate(self.root, self.base, '2026-11-11T00:00:00Z')

    def test_genuine_native_record_is_accepted(self):
        head = self.prepare(self.REPAIRED)
        self.assertTrue(v.native_origin(self.root, head).endswith('.json'))

    def test_source_lane_executes_and_binds_every_selected_category(self):
        self.prepare(self.REPAIRED)
        receipt = self.validate()
        self.assertEqual([row['category'] for row in receipt['spec_runs']], ['sanity', 'focused'])
        self.assertTrue(all(row['runner'][1:3] == ['tools/validation_contract.py', 'run'] for row in receipt['spec_runs']))
        with patch.object(source_lane, 'CHECKS', [[sys.executable, '-c', 'print("fixed check")']]):
            self.assertEqual(source_lane.verify(self.root)['spec_runs'], receipt['spec_runs'])
            record = Path(receipt['spec_runs'][1]['record'])
            original = record.read_bytes()
            record.write_bytes(original.replace(b'"passed": true', b'"passed": false'))
            with self.assertRaisesRegex(ValueError, 'Spec category output|custody changed'):
                source_lane.verify(self.root)
            record.write_bytes(original)
            # A later failed execution of the same candidate supersedes the earlier receipt.
            later = {'kind': source_lane.KIND + '-failure', 'identity': {'source': receipt['source']},
                     'runs': [{'completed_at': time.time() + 60}]}
            source_lane.private_write(source_lane.directory(self.root) / 'later.failure.json', source_lane.encoded(later))
            with self.assertRaisesRegex(ValueError, 'later failed'):
                source_lane.verify(self.root)
        # A newer complete passing execution of the same candidate restores readiness; history survives.
        with patch.object(source_lane, 'time') as clock:
            clock.time.side_effect = lambda: later['runs'][0]['completed_at'] + 120
            clock.time_ns.side_effect = time.time_ns
            retry = self.validate()
        with patch.object(source_lane, 'CHECKS', [[sys.executable, '-c', 'print("fixed check")']]):
            self.assertEqual(source_lane.verify(self.root)['sha256'], retry['sha256'])
        self.assertEqual(len(list(source_lane.directory(self.root).glob(receipt['source'] + '*.json'))), 2)

    def test_ci_mode_admits_complete_direct_execution_without_native_records(self):
        self.prepare(self.REPAIRED, reproduce=False)  # CI has no owner-local reproduction.
        with patch.object(source_lane, 'CHECKS', [[sys.executable, '-c', 'print("fixed check")']]):
            receipt = source_lane.validate(self.root, self.base, '2026-11-11T00:00:00Z', ci=True)
            self.assertEqual(receipt['spec_mode'], 'ci')
            self.assertEqual([row['runner'] for row in receipt['spec_runs']], [row['command'] for row in receipt['spec_runs']])
            with self.assertRaisesRegex(ValueError, 'local native spec execution'):
                source_lane.verify(self.root, publication=True)
            # A same-candidate local retry records new evidence beside the CI receipt and recovers.
            done = subprocess.run([sys.executable, 'tools/validation_contract.py', 'run', '--category', 'focused'],
                                  cwd=self.root, capture_output=True, text=True)
            self.assertNotEqual(done.returncode, 0)  # No fail-before reproduction locally.

    def test_package_lane_ci_mode_completes_selected_categories(self):
        (self.root / '.gitignore').write_text('__pycache__/\nnode_modules/\n')
        (self.root / 'node_modules').mkdir()
        (self.root / 'node_modules/dependency').write_text('locked')
        (self.root / 'tests/spec.test.mjs').write_text(self.MARKER + "test('passes',()=>{});\n")
        self.base = self.commit()
        self.genuine_spec(self.selection(scope_paths=['scripts/*', 'tools/*', 'tests/*']))
        (self.root / 'scripts').mkdir()
        (self.root / 'scripts/release.mjs').write_text('export default 1;\n')
        self.commit('package maintenance')
        with patch.object(package_lane, 'CHECKS', [[sys.executable, '-c', 'print("fixed check")']]):
            receipt = package_lane.validate(self.root, self.base, '2026-11-11T00:00:00Z', ci=True)
        self.assertEqual((receipt['status'], receipt['spec_mode']), ('VERIFIED', 'ci'))
        self.assertEqual([row['category'] for row in receipt['spec_runs']], ['sanity', 'focused'])

    def test_bug_fix_without_fail_before_reproduction_is_not_verified(self):
        self.prepare(self.REPAIRED, reproduce=False)
        with self.assertRaisesRegex(ValueError, 'Sealed spec category failed: focused'):
            self.validate()

    def test_failing_selected_category_issues_no_receipt_and_retains_output(self):
        head = self.prepare(self.NEVER)
        with self.assertRaisesRegex(ValueError, 'Sealed spec category failed: focused'):
            self.validate()
        self.assertFalse((source_lane.directory(self.root) / (head + '.json')).exists())
        failures = [json.loads(p.read_text()) for p in source_lane.directory(self.root).glob('*.failure.json')]
        self.assertEqual(failures[-1]['spec_runs'][-1]['category'], 'focused')


class DeterministicProvenance(unittest.TestCase):
    """Genuine receipts come from the real package lane; forgeries recompute the self-digest."""
    def setUp(self):
        import published_fixture
        self.published = published_fixture
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.commit = published_fixture.build(self.root, subprocess.check_output(['git', 'rev-parse', 'origin/main'], cwd=REPOSITORY, text=True).strip())
        self.tree = subprocess.check_output(['git', 'rev-parse', self.commit + '^{tree}'], cwd=self.root, text=True).strip()
        self.path = self.root / '.git/oracle/deterministic-package' / (self.commit + '.json')
        self.original = self.path.read_bytes()
        checks = patch.object(package_lane, 'CHECKS', published_fixture.CHECKS); checks.start(); self.addCleanup(checks.stop)

    def forge(self, change):
        value = json.loads(self.original); value.pop('sha256'); change(value)
        value['sha256'] = source_lane.digest(source_lane.encoded(value))
        self.path.write_text(json.dumps(value))

    def test_genuine_lane_receipt_is_provenance_for_its_exact_commit_only(self):
        self.assertEqual(oracle._deterministic_provenance(self.root, self.commit, self.tree), str(self.path))
        oracle.verify_commit(self.root, self.commit)
        self.assertIsNone(oracle._deterministic_provenance(self.root, self.commit, '0' * 40))
        with patch.object(package_lane, 'CHECKS', [['different', 'fixed', 'check']]):
            self.assertIsNone(oracle._deterministic_provenance(self.root, self.commit, self.tree))

    def test_self_consistent_forgeries_grant_nothing(self):
        forgeries = [lambda v: v.update(runs=[dict(v['runs'][0], command=['synthetic'])]),
                     lambda v: v.update(spec_runs=[]), lambda v: v.update(paths=['clients/codex/plugins/bos/x']),
                     lambda v: v.update(spec_mode='ci'), lambda v: v.update(profile='another-profile'),
                     lambda v: v['spec_runs'][1].update(record_sha256='0' * 64),
                     lambda v: v.update(base=v['source'])]
        for forgery in forgeries:
            with self.subTest(forgery=forgeries.index(forgery)):
                self.forge(forgery)
                self.assertIsNone(oracle._deterministic_provenance(self.root, self.commit, self.tree))
        self.path.write_bytes(self.original)
        self.assertTrue(oracle._deterministic_provenance(self.root, self.commit, self.tree))

    def replace_category_record(self, change, *, rename=False):
        value = json.loads(self.original); record = Path(value['spec_runs'][1]['record'])
        data = json.loads(self.category_original); data.pop('record_sha256'); change(data)
        data['record_sha256'] = v.digest(data)  # A self-consistent replacement record.
        target = record.with_name('focused-after-' + data['record_sha256'] + '.json') if rename else record
        os.chmod(record, 0o600); target.write_text(json.dumps(data, indent=2) + '\n')
        self.forge(lambda receipt: receipt['spec_runs'][1].update(record=str(target), record_sha256=source_lane.digest(target.read_bytes())))
        return record, target

    def test_fabricated_native_category_records_grant_nothing(self):
        record = Path(json.loads(self.original)['spec_runs'][1]['record'])
        self.category_original = record.read_bytes()
        changes = {'tree': lambda d: d.update(tree='0' * 40), 'runtime': lambda d: d.update(runtime={'node': 'fabricated'}),
                   'exit': lambda d: d.update(exit_code=1), 'inputs': lambda d: d.update(inputs_unchanged=False),
                   'output': lambda d: d.update(output_file=str(self.root / 'absent.log')),
                   'fixtures-empty': lambda d: d.update(fixtures={}),
                   'fixtures-wrong': lambda d: d.update(fixtures={k: '0' * 40 for k in d['fixtures']})}
        for name, change in changes.items():
            for rename in (False, True):
                with self.subTest(field=name, renamed=rename):
                    original, target = self.replace_category_record(change, rename=rename)
                    self.assertIsNone(oracle._deterministic_provenance(self.root, self.commit, self.tree))
                    original.write_bytes(self.category_original)  # Isolate each case.
                    if target != original: target.unlink()
                    self.path.write_bytes(self.original)
        self.assertTrue(oracle._deterministic_provenance(self.root, self.commit, self.tree))

    def test_bug_fix_category_without_its_fail_before_original_grants_nothing(self):
        selected = v.verify(self.root, self.commit)
        for record in v.originals(self.root, selected, 'before'):
            Path(record['_record_path']).unlink()
        self.assertIsNone(oracle._deterministic_provenance(self.root, self.commit, self.tree))

    def test_later_failure_of_the_same_commit_supersedes_the_receipt(self):
        later = {'identity': {'source': self.commit}, 'runs': [{'completed_at': time.time() + 3600}]}
        target = self.path.parent / 'later.failure.json'; target.write_text(json.dumps(later)); os.chmod(target, 0o600)
        self.assertIsNone(oracle._deterministic_provenance(self.root, self.commit, self.tree))


class Engines(Fixture):
    def test_engine_selection(self):
        self.assertEqual(oracle.oracle_engine({'CLAUDECODE': '1'}), 'claude')
        self.assertEqual(oracle.oracle_engine({}), 'codex')
        self.assertEqual(oracle.oracle_engine({'BOC_ORACLE_ENGINE': 'auto', 'CLAUDECODE': '1'}), 'claude')
        self.assertEqual(oracle.oracle_engine({'BOC_ORACLE_ENGINE': 'codex', 'CLAUDECODE': '1'}), 'codex')
        self.assertEqual(oracle.oracle_engine({'BOC_ORACLE_ENGINE': 'claude'}), 'claude')
        with self.assertRaisesRegex(oracle.OracleApprovalError, 'Unknown Oracle engine'):
            oracle.oracle_engine({'BOC_ORACLE_ENGINE': 'gemini'})

    def test_claude_command_is_read_only_and_schema_bound(self):
        command = oracle._claude_command('-prompt', '{"type":"object"}', 'role', oracle.CLAUDE_DEFAULT_MODEL)
        for flag in ('-p', '--restricted', '--strict-mcp-config', '--no-session-persistence'):
            self.assertIn(flag, command)
        self.assertEqual(command[command.index('--output-format') + 1], 'json')
        self.assertEqual(command[command.index('--json-schema') + 1], '{"type":"object"}')
        self.assertEqual(command[command.index('--tools') + 1], 'Read,Grep,Glob')
        self.assertEqual(command[command.index('--allowedTools') + 1], 'Read,Grep,Glob')
        self.assertEqual(command[-2:], ['--', '-prompt'])
        self.assertNotIn('--model', command)
        self.assertIn('--model', oracle._claude_command('p', '{}', 'r', 'claude-synthetic'))
        self.assertFalse(any(tool in ' '.join(command) for tool in ('Bash', 'Write', 'Edit', 'WebFetch')))

    def test_claude_schema_argument_omits_only_the_meta_schema_declaration(self):
        schema = {'$schema': 'https://json-schema.org/draft/2020-12/schema', 'type': 'object',
                  'additionalProperties': False, 'required': ['verdict'],
                  'properties': {'verdict': {'const': 'APPROVED'}}}
        command = oracle._claude_command('p', json.dumps(schema), 'r', oracle.CLAUDE_DEFAULT_MODEL)
        passed = json.loads(command[command.index('--json-schema') + 1])
        self.assertEqual(passed, {key: value for key, value in schema.items() if key != '$schema'})
        plain = oracle._claude_command('p', '{"type":"object"}', 'r', oracle.CLAUDE_DEFAULT_MODEL)
        self.assertEqual(plain[plain.index('--json-schema') + 1], '{"type":"object"}')

    def test_claude_envelope_parsing(self):
        envelope = {'structured_output': {'verdict': 'APPROVED'}, 'modelUsage': {'claude-synthetic-1': {}}}
        self.assertEqual(oracle._claude_answer(json.dumps(envelope), oracle.CLAUDE_DEFAULT_MODEL),
                         ({'verdict': 'APPROVED'}, 'claude-synthetic-1'))
        self.assertEqual(oracle._claude_answer(json.dumps({'result': '{"verdict":"REJECTED"}', 'modelUsage': {'m': {}}}), 'requested')[0],
                         {'verdict': 'REJECTED'})
        # An explicit selector never substitutes for the model that actually ran.
        self.assertEqual(oracle._claude_answer(json.dumps(dict(envelope, modelUsage={'claude-resolved-2': {}})), 'opus')[1],
                         'claude-resolved-2')
        with self.assertRaisesRegex(oracle.OracleApprovalError, 'actual model'):
            oracle._claude_answer(json.dumps({'structured_output': {'v': 1}}), 'opus')
        with self.assertRaisesRegex(oracle.OracleApprovalError, 'actual model'):
            oracle._claude_answer(json.dumps({'structured_output': {'v': 1}, 'modelUsage': {'a': {}, 'b': {}}}), 'opus')
        for stdout in ('not json', json.dumps({'is_error': True, 'result': 'failure'}), json.dumps({'result': 'prose'}),
                       json.dumps({'structured_output': {'v': 1}})):
            with self.assertRaises(oracle.OracleApprovalError):
                oracle._claude_answer(stdout, oracle.CLAUDE_DEFAULT_MODEL)

    def test_claude_event_list_reads_its_single_result_event(self):
        result = {'type': 'result', 'is_error': False, 'structured_output': {'verdict': 'REJECTED'},
                  'modelUsage': {'claude-synthetic-1': {}}}
        events = [{'type': 'system', 'subtype': 'init'}, {'type': 'assistant', 'message': {}}, result]
        try:
            answer = oracle._claude_answer(json.dumps(events), oracle.CLAUDE_DEFAULT_MODEL)
        except oracle.OracleApprovalError as error:
            answer = error
        self.assertEqual(answer, ({'verdict': 'REJECTED'}, 'claude-synthetic-1'))
        for listed in ([{'type': 'system'}], [result, result], [dict(result, is_error=True)]):
            with self.assertRaises(oracle.OracleApprovalError):
                oracle._claude_answer(json.dumps(listed), oracle.CLAUDE_DEFAULT_MODEL)

    def external_family(self, body='Synthetic family authority\n'):
        projects = Path(self.temp.name) / 'projects'
        family = projects / 'Vault/docs/architecture/bos-product-family.md'
        family.parent.mkdir(parents=True)
        family.write_text(body)
        (projects / 'AGENTS.md').write_text('Synthetic Projects instructions\n')
        (self.root / 'AGENTS.md').write_text('Family: `' + str(family) + '`\n')
        return projects, family

    def launch(self, stdout):
        schema = self.root / 'schema.json'
        schema.write_text('{"type":"object"}')
        (self.root / 'tools/codex_child_model.py').write_text('# synthetic model helper\n')
        run = self.root / '.git/oracle/runs/synthetic'
        run.mkdir(parents=True, exist_ok=True)
        calls = []

        def fake(argv, **kwargs):
            calls.append((argv, kwargs))
            return subprocess.CompletedProcess(argv, 0, stdout, '')
        token = oracle._RUN.set(run)
        try:
            with patch.dict(os.environ, {'BOC_ORACLE_ENGINE': 'claude', 'CLAUDECODE': '1', 'CLAUDE_CODE_ENTRYPOINT': 'cli'}), \
                    patch.object(oracle.subprocess, 'run', side_effect=fake):
                answer = oracle._review_process(self.root, 'Synthetic review prompt', 'synthetic', schema_path=schema)
        finally:
            oracle._RUN.reset(token)
        return answer, calls, run

    def test_claude_launch_through_fake_runner_with_external_authority(self):
        projects, family = self.external_family()
        envelope = {'structured_output': {'verdict': 'APPROVED'}, 'modelUsage': {'claude-synthetic-1': {}}}
        answer, calls, run = self.launch(json.dumps(envelope))
        self.assertEqual(answer, {'verdict': 'APPROVED'})
        argv, kwargs = calls[0]
        self.assertEqual(argv[0], 'claude')
        self.assertNotIn('CLAUDECODE', kwargs['env'])
        self.assertNotIn('CLAUDE_CODE_ENTRYPOINT', kwargs['env'])
        prompt = argv[-1]
        digest = hashlib.sha256(family.read_bytes()).hexdigest()
        self.assertIn('Synthetic family authority', prompt)
        self.assertIn('Synthetic Projects instructions', prompt)
        self.assertIn('sha256="' + digest + '"', prompt)
        metadata = json.loads((run / 'model.json').read_text())
        self.assertEqual((metadata['engine'], metadata['external_inputs'][str(family)]), ('claude', digest))
        self.assertEqual(json.loads((run / 'engine-model.json').read_text()),
                         {'engine': 'claude', 'model': 'claude-synthetic-1', 'requested_model': oracle.CLAUDE_DEFAULT_MODEL})
        self.assertEqual(json.loads((run / 'result.json').read_text()), {'verdict': 'APPROVED'})

    def test_missing_or_changed_external_authority_fails_before_launch(self):
        projects, family = self.external_family()
        family.unlink()
        with self.assertRaisesRegex(oracle.OracleApprovalError, 'inaccessible'):
            self.launch('{}')
        family.write_text('Restored authority\n')
        stale = {str(projects / 'AGENTS.md'): '0' * 64, str(family): hashlib.sha256(family.read_bytes()).hexdigest()}
        with patch.object(oracle, '_declared_parent_authorities', return_value=stale):
            with self.assertRaisesRegex(oracle.OracleApprovalError, 'changed'):
                self.launch('{}')

    def test_claude_error_envelope_is_an_error(self):
        with self.assertRaisesRegex(oracle.OracleApprovalError, 'reported an error'):
            self.launch(json.dumps({'is_error': True, 'result': 'synthetic failure'}))


class NativeDelta(Fixture):
    def publication_delta(self, *, patterns=False):
        published=self.base
        self.git('remote','add','origin','https://code.example/synthetic/repository.git')
        self.git('update-ref','refs/remotes/origin/main',published)
        (self.root/'older_foreign.py').write_text('synthetic_pending = True\n')
        self.commit('older pending foreign change')
        scope=['source.mjs','README.md',v.SELECTION,v.CATALOG,'tests/*' if patterns else 'tests/spec.test.mjs']
        reviewer=lambda *args:dict(APPROVED,review_status='COMPLETE',validation_selection=self.selection(scope_paths=scope))
        with patch.object(oracle,'_review_settings_binding',return_value={'model':'synthetic','reasoning_effort':None}),patch.object(oracle,'_fresh_origin',return_value=published):
            oracle.review_proposal(self.root,PROPOSAL,[],None,reviewer)
        self.commit('newer native prior specification')
        (self.root/'source.mjs').write_text('export default false;\n')
        (self.root/'tests/extra.test.mjs').write_text('synthetic additive coverage\n')
        source=self.commit('current additive change')
        return published,source,self.git('rev-parse','HEAD^{tree}')

    def test_publication_delta_retains_older_foreign_paths_and_admits_whole_range(self):
        published,source,tree=self.publication_delta()
        context=v.delta_context(self.root,source,tree)
        self.assertIn('older_foreign.py',context['paths'])
        self.assertEqual(context['publication_scope']['baseline_commit'],published)
        delta={'kind':v.DELTA_KIND,'binding':copy.deepcopy(context['binding']),'reason':'Complete pending source coverage',
               'design':None,'acceptance_additions':['The complete pending publication inventory is covered'],
               'category_additions':[{'name':'focused','tests':['tests/extra.test.mjs'],'fixtures':[]}],
               'coverage_additions':[{'module':'tests/extra.test.mjs','covers':[0],'purpose':'Covers the additional synthetic condition'}]}
        selected,audit=v.materialize_delta(self.root,context,delta)
        contract=v.seal(self.root,selected,PROPOSAL,{'verdict':'APPROVED'},base=source,stamp=stamp(origin_main=published))
        v.write_selection(self.root,contract);candidate=self.commit('synthetic complete-range selection')
        self.assertEqual(v.gate(self.root,published,candidate)['status'],'SPEC_SEALED')
        # Historical reconstruction uses its original bound range after the
        # published ref advances; a new enrollment must use the new actual ref.
        self.git('update-ref','refs/remotes/origin/main',source)
        reconstructed,_=v.reconstruct_delta_record(self.root,audit,delta)
        self.assertEqual(reconstructed,selected)

    def test_publication_delta_materializes_retained_patterns_and_rejects_stale_scope(self):
        published,source,tree=self.publication_delta(patterns=True)
        try:context=v.delta_context(self.root,source,tree)
        except ValueError as error:self.fail(f'Reviewed patterns must materialize immutable tracked paths: {error}')
        self.assertIn('older_foreign.py',context['paths'])
        self.assertIn('tests/spec.test.mjs',context['paths'])
        self.assertIn('tests/extra.test.mjs',context['paths'])
        self.assertFalse(any(any(c in path for c in '*?[]') for path in context['paths']))
        scope=oracle._publication_scope(self.root,tree)
        forged=copy.deepcopy(scope);forged['range_paths'].remove('older_foreign.py')
        with self.assertRaises(ValueError):v.delta_context(self.root,source,tree,publication_scope=forged)
        delta={'kind':v.DELTA_KIND,'binding':copy.deepcopy(context['binding']),'reason':'Preserve exact pending membership',
               'design':None,'acceptance_additions':['Stale publication membership is refused'],
               'category_additions':[],'coverage_additions':[{'module':'tests/spec.test.mjs','covers':[0],'purpose':None}]}
        self.git('update-ref','refs/remotes/origin/main',source)
        with self.assertRaisesRegex(ValueError,'changed'):v.materialize_delta(self.root,context,delta)

    def test_both_historical_binding_shapes_keep_original_inventory_after_publication_advances(self):
        _,context,delta=self.prepared_delta()
        selected,audit=v.materialize_delta(self.root,context,delta)
        # Historic producers hashed literal inventory alone and recorded no
        # publication projection. Preserve those raw bytes and their audit.
        binding=dict(context['binding'],inventory_sha256=v.digest(context['paths']))
        original_delta=dict(delta,binding=binding)
        original_audit={k:value for k,value in audit.items() if k!='publication_scope'}
        original_audit.update(binding=binding,raw_delta_sha256=v.digest(original_delta))
        self.git('remote','add','origin','https://code.example/synthetic/repository.git')
        self.git('update-ref','refs/remotes/origin/main',context['binding']['source_commit'])
        for missing_proof in (False,True):
            raw_binding={k:value for k,value in binding.items() if not (missing_proof and k=='prior_proposal_sha256')}
            raw_delta=dict(original_delta,binding=raw_binding)
            raw_audit=dict(original_audit,binding=raw_binding,raw_delta_sha256=v.digest(raw_delta))
            retained=copy.deepcopy((raw_audit,raw_delta))
            recovered,_=v.reconstruct_delta_record(self.root,raw_audit,raw_delta)
            self.assertEqual(recovered,selected)
            self.assertEqual((raw_audit,raw_delta),retained)

    def prepared_delta(self):
        selection=self.selection(scope_paths=['source.mjs','README.md','tests/spec.test.mjs',v.SELECTION,v.CATALOG])
        reviewer=lambda *args:dict(APPROVED,review_status='COMPLETE',validation_selection=selection)
        with patch.object(oracle,'_review_settings_binding',return_value={'model':'synthetic','reasoning_effort':None}),patch.object(oracle,'_fresh_origin',return_value=ORIGIN):
            oracle.review_proposal(self.root,PROPOSAL,[],None,reviewer)
        prior=json.loads((self.root/v.SELECTION).read_text())
        self.commit('intact exact prior')
        (self.root/'source.mjs').write_text('export default false;\n')
        (self.root/'tests/extra.test.mjs').write_text('synthetic selected extra test\n')
        source=self.commit('captured additive source')
        context=v.delta_context(self.root,source,self.git('rev-parse','HEAD^{tree}'))
        delta={'kind':v.DELTA_KIND,'binding':copy.deepcopy(context['binding']),'reason':'Add bounded synthetic coverage',
               'design':None,'acceptance_additions':['The extra synthetic condition is checked'],
               'category_additions':[{'name':'focused','tests':['tests/extra.test.mjs'],'fixtures':[]}],
               'coverage_additions':[{'module':'tests/spec.test.mjs','covers':[0],'purpose':None},
                                     {'module':'tests/extra.test.mjs','covers':[0],'purpose':'Proves the additional condition'}]}
        return prior,context,delta

    def test_sanity_seal_without_native_prior_never_dispatches_an_additive_approval(self):
        self.sealed(scope_paths=['source.mjs',v.SELECTION,v.CATALOG,'tests/spec.test.mjs']);self.commit()
        from unittest.mock import Mock
        reviewer=Mock()
        with patch.object(oracle,'_review_settings_binding',return_value={'model':'synthetic','reasoning_effort':None}),patch.object(oracle,'_fresh_origin',return_value=ORIGIN):
            with self.assertRaisesRegex(oracle.OracleApprovalError,'verified native prior'):
                oracle.review_proposal(self.root,PROPOSAL,[],None,reviewer,delta=True)
        reviewer.assert_not_called()

    def test_native_dispatch_uses_closed_delta_schema_and_full_mode_pins_the_exact_revision(self):
        prior,context,delta=self.prepared_delta()
        schema=self.root/'.agents/skills/oracle/review-output.schema.json';schema.parent.mkdir(parents=True)
        schema.write_bytes((REPOSITORY/'.agents/skills/oracle/review-output.schema.json').read_bytes())
        run=self.root/'.git/oracle/runs/schema-test';run.mkdir(parents=True)
        captured=[]
        def dispatch(root,prompt,prefix,*,schema_path):
            captured.append((prompt,json.loads(schema_path.read_text())))
            return dict(APPROVED,review_status='COMPLETE',validation_selection=delta)
        metadata=oracle._METADATA_ROOT.set(self.root);active=oracle._RUN.set(run)
        try:
            for mode in (context,None):
                token=oracle._PROPOSAL_DELTA.set(mode)
                try:
                    with patch.object(oracle,'_review_process',side_effect=dispatch):oracle._proposal_oracle(self.root,PROPOSAL,{},None)
                finally:oracle._PROPOSAL_DELTA.reset(token)
        finally:oracle._RUN.reset(active);oracle._METADATA_ROOT.reset(metadata)
        selected=captured[0][1]['properties']['validation_selection']
        self.assertEqual(selected['properties']['binding']['const'],context['binding'])
        self.assertNotIn('scope_paths',selected['properties'])
        self.assertNotIn('"scope_paths": [',captured[0][0])
        self.assertEqual(captured[1][1]['properties']['validation_selection']['properties']['revision_of'],
                         {'type':'string','const':prior['contract_sha256']})

    def test_parent_materializes_exact_scope_and_retains_criteria_categories_and_mapping_projection(self):
        prior,context,delta=self.prepared_delta();before=copy.deepcopy(prior)
        value,audit=v.materialize_delta(self.root,context,delta)
        self.assertEqual(prior,before)
        self.assertEqual(value['revision_of'],prior['contract_sha256'])
        self.assertEqual(value['acceptance'][:1],prior['selection']['acceptance'])
        self.assertEqual(value['acceptance_tests'][0],dict(prior['selection']['acceptance_tests'][0],covers=[0,1]))
        self.assertEqual(value['categories'][1]['tests'],['tests/spec.test.mjs','tests/extra.test.mjs'])
        self.assertEqual(value['scope_paths'],sorted(set(context['paths'])|{'tests/extra.test.mjs'}))
        self.assertEqual(audit['retained_coverage_sha256'],v.digest(prior['selection']['acceptance_tests']))
        self.assertEqual(v.materialize_delta(self.root,context,delta),(value,audit))
        schema=v.delta_schema(context)
        self.assertEqual(schema['properties']['binding']['const'],context['binding'])
        self.assertFalse(schema['additionalProperties'])

    def test_older_closed_binding_reconstructs_only_with_the_actual_verified_native_prior(self):
        _,context,delta=self.prepared_delta();selected,audit=v.materialize_delta(self.root,context,delta)
        old_binding={k:value for k,value in context['binding'].items() if k!='prior_proposal_sha256'}
        old_delta=dict(delta,binding=old_binding);old_audit=dict(audit,binding=old_binding,raw_delta_sha256=v.digest(old_delta))
        before=copy.deepcopy((old_audit,old_delta));actual,recovered=v.reconstruct_delta_record(self.root,old_audit,old_delta)
        self.assertEqual(actual,selected);self.assertEqual((old_audit,old_delta),before)
        self.assertEqual(recovered['binding']['prior_proposal_sha256'],context['binding']['prior_proposal_sha256'])
        for changes in ({'extra':'unapproved'},{'prior_contract_sha256':'0'*64},{'inventory_sha256':'0'*64}):
            bad=dict(old_binding,**changes)
            with self.assertRaises((ValueError,subprocess.SubprocessError)):
                v.reconstruct_delta_record(self.root,dict(old_audit,binding=bad),dict(old_delta,binding=bad))
        archive=self.root/'.git/oracle/proposals'/(context['binding']['prior_proposal_sha256']+'.json');archive.unlink()
        with self.assertRaisesRegex(ValueError,'Verified native prior'):v.reconstruct_delta_record(self.root,old_audit,old_delta)

    def test_wrong_missing_replayed_hashes_and_unknown_fields_fail_without_writing_a_spec(self):
        prior,context,delta=self.prepared_delta();original=(self.root/v.SELECTION).read_bytes()
        for key in context['binding']:
            for value in ('0'*64,None):
                if value==context['binding'][key]:continue
                bad=copy.deepcopy(delta);bad['binding'][key]=value
                with self.assertRaisesRegex(ValueError,'binding'):v.materialize_delta(self.root,context,bad)
            bad=copy.deepcopy(delta);del bad['binding'][key]
            with self.assertRaisesRegex(ValueError,'binding'):v.materialize_delta(self.root,context,bad)
        for change in ({'scope_paths':['unapproved.mjs']},{'acceptance':[]},{'revision_of':'0'*64}):
            with self.assertRaisesRegex(ValueError,'fields'):v.materialize_delta(self.root,context,dict(delta,**change))
        corrupt=copy.deepcopy(context);corrupt['paths'].append('unapproved.mjs')
        with self.assertRaisesRegex(ValueError,'inventory'):v.materialize_delta(self.root,corrupt,delta)
        self.assertEqual((self.root/v.SELECTION).read_bytes(),original)

    def test_unknown_path_criterion_drop_retained_module_replacement_and_mapping_mutation_are_rejected(self):
        _,context,delta=self.prepared_delta()
        bads=[]
        bad=copy.deepcopy(delta);bad['category_additions'][0]['tests']=['tests/unknown.test.mjs'];bads.append(bad)
        bad=copy.deepcopy(delta);bad['acceptance_additions']=[];bads.append(bad)
        bad=copy.deepcopy(delta);bad['coverage_additions'][0]['purpose']='Changed retained purpose';bads.append(bad)
        bad=copy.deepcopy(delta);bad['coverage_additions'][0]['covers']=[-1];bads.append(bad)
        bad=copy.deepcopy(delta);bad['category_additions'][0]['tests']=['tests/spec.test.mjs'];bads.append(bad)
        bad=copy.deepcopy(delta);bad['category_additions']*=2;bads.append(bad)
        for bad in bads:
            with self.assertRaises(ValueError):v.materialize_delta(self.root,context,bad)

    def test_genuine_native_delta_archive_rechecks_materialization_and_raw_approval(self):
        _,_,delta=self.prepared_delta()
        def reviewer(*args):
            current=oracle._PROPOSAL_DELTA.get()
            return dict(APPROVED,review_status='COMPLETE',validation_selection=dict(delta,binding=current['binding']))
        with patch.object(oracle,'_review_settings_binding',return_value={'model':'synthetic','reasoning_effort':None}),patch.object(oracle,'_fresh_origin',return_value=ORIGIN):
            oracle.review_proposal(self.root,PROPOSAL,[],None,reviewer,delta=True)
        self.commit('native-produced delta spec')
        record=Path(v.native_origin(self.root));raw=json.loads(record.read_text());contract=raw['validation_contract']
        self.assertEqual(raw['proposal_materialization']['raw_delta_sha256'],v.digest(raw['raw_review']['validation_selection']))
        self.assertTrue(v.native_proposal_record(self.root,record,contract,self.git('rev-parse','HEAD')))
        observed=self.root/raw['raw_response']['path'];original=observed.read_bytes();observed.write_bytes(original+b' ')
        self.assertFalse(v.native_proposal_record(self.root,record,contract,self.git('rev-parse','HEAD')))
        observed.write_bytes(original)
        raw['raw_review']['review_status']='INCOMPLETE'
        # Even a freshly named canonical archive with recomputed bookkeeping cannot adopt a partial approval.
        body={k:x for k,x in raw.items() if k!='proposal_review_id'};raw['proposal_review_id']=oracle._sha(oracle._canonical(body))
        content=oracle._pretty(raw);other=record.parent/(oracle._sha(content)+'.json');other.write_bytes(content)
        self.assertFalse(v.native_proposal_record(self.root,other,contract,self.git('rev-parse','HEAD')))

    def test_source_movement_preserves_raw_result_and_refuses_delta_seal(self):
        _,_,delta=self.prepared_delta();before=(self.root/v.SELECTION).read_bytes()
        def reviewer(*args):
            current=oracle._PROPOSAL_DELTA.get();(self.root/'source.mjs').write_text('changed during proposal\n')
            return dict(APPROVED,review_status='COMPLETE',validation_selection=dict(delta,binding=current['binding']))
        with patch.object(oracle,'_review_settings_binding',return_value={'model':'synthetic','reasoning_effort':None}),patch.object(oracle,'_fresh_origin',return_value=ORIGIN):
            with self.assertRaisesRegex(oracle.OracleSourceBindingError,'Delta source changed'):
                oracle.review_proposal(self.root,PROPOSAL,[],None,reviewer,delta=True)
        self.assertEqual((self.root/v.SELECTION).read_bytes(),before)

    def test_origin_movement_rejects_an_otherwise_unchanged_bound_delta(self):
        _,_,delta=self.prepared_delta();before=(self.root/v.SELECTION).read_bytes()
        self.git('remote','add','origin','https://example.invalid/native-delta.git')
        self.git('update-ref','refs/remotes/origin/main',self.base)
        def reviewer(*args):
            current=oracle._PROPOSAL_DELTA.get();self.git('update-ref','refs/remotes/origin/main',self.git('rev-parse','HEAD'))
            return dict(APPROVED,review_status='COMPLETE',validation_selection=dict(delta,binding=current['binding']))
        with patch.object(oracle,'_review_settings_binding',return_value={'model':'synthetic','reasoning_effort':None}),patch.object(oracle,'_fresh_origin',return_value=self.base):
            with self.assertRaisesRegex(oracle.OracleSourceBindingError,'origin moved'):
                oracle.review_proposal(self.root,PROPOSAL,[],None,reviewer,delta=True)
        self.assertEqual((self.root/v.SELECTION).read_bytes(),before)



class NativePolicyBatch(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=REPOSITORY/'Vault/tmp',prefix='policy-batch-')
        self.addCleanup(self.temp.cleanup);self.root=Path(self.temp.name)/'repository'
        self.make_repo(self.root)
        self.revision=self.git(self.root,'rev-parse','HEAD').decode().strip()

    def git(self,root,*args):
        return subprocess.check_output(['git',*args],cwd=root,stderr=subprocess.DEVNULL)

    def make_repo(self,root,seed=0):
        root.mkdir();self.git(root,'init','-q');self.git(root,'config','user.name','Synthetic')
        self.git(root,'config','user.email','fixture@example.invalid')
        for index,name in enumerate(oracle.REVIEW_POLICY_MODULES):
            path=root/name;path.parent.mkdir(exist_ok=True)
            path.write_text('value_'+str(index)+' = '+str(seed+index)+'\n')
            if index==0:path.chmod(0o755)
        self.git(root,'add','.');self.git(root,'commit','-qm','synthetic policy')

    def original(self):
        values={}
        for name in oracle.REVIEW_POLICY_MODULES:
            metadata,actual=self.git(self.root,'ls-tree','-z',self.revision,'--',name)[:-1].split(b'\t')
            mode,kind,oid=metadata.split();self.assertEqual(actual.decode(),name)
            values[name]=(mode.decode(),self.git(self.root,'show',self.revision+':'+name))
        return values

    def wire(self):
        inventory=self.git(self.root,'ls-tree','--long','-z','--full-tree',self.revision,'--',*oracle.REVIEW_POLICY_MODULES)
        rows=[line.split(b'\t')[0].split() for line in inventory[:-1].split(b'\0')]
        payload=subprocess.check_output(['git','cat-file','--batch'],cwd=self.root,input=b'\n'.join(row[2] for row in rows)+b'\n')
        return inventory,payload,rows

    def test_real_fourteen_modules_keep_exact_modes_ast_and_reduce_twenty_eight_to_two(self):
        with patch.object(oracle,'_git_bytes',wraps=oracle._git_bytes) as calls:
            expected={}
            for name in oracle.REVIEW_POLICY_MODULES:
                metadata,actual=oracle._git_bytes(self.root,'ls-tree','-z',self.revision,'--',name)[:-1].split(b'\t')
                mode,kind,oid=metadata.split()
                expected[name]={'mode':mode.decode(),'ast':oracle._policy_ast(oracle._git_bytes(self.root,'show',self.revision+':'+name))}
            # Stable case identity; extracted core dependencies enlarge the exact inventory.
            self.assertEqual(len(oracle.REVIEW_POLICY_MODULES),26)
            self.assertEqual(calls.call_count,52)
        with patch.object(oracle,'_git_bytes',wraps=oracle._git_bytes) as calls:
            self.assertEqual(oracle._review_policy_sources(self.root,self.revision),expected)
            self.assertEqual(calls.call_count,2)
        self.assertEqual(expected[oracle.REVIEW_POLICY_MODULES[0]]['mode'],'100755')
        # Exercise the same copy functions called by all three real constructors.
        child = r"""
import importlib, json, stat, sys
from pathlib import Path
source = Path(sys.argv[1])
sys.path.insert(0, str(source / 'tests'))
module = importlib.import_module(sys.argv[2])
target = Path(sys.argv[3])
module.copy_review_policy_inputs(target)
from tools import oracle_approval
rows = []
for name in oracle_approval.REVIEW_POLICY_MODULES:
    actual, original = target / name, source / name
    assert actual.read_bytes() == original.read_bytes(), name
    assert stat.S_IMODE(actual.stat().st_mode) == stat.S_IMODE(original.stat().st_mode), name
    rows.append(name)
assert len(rows) == 26
from unittest.mock import patch
with patch.object(oracle_approval, '__file__', str(target / 'tools/oracle_approval.py')):
    actual_policy = oracle_approval._review_policy_sources(target)
assert set(actual_policy) == set(rows)
for name in rows:
    assert actual_policy[name]['ast'] == oracle_approval._policy_ast((source / name).read_bytes())
print(json.dumps(rows))
"""
        for module in ('published_fixture', 'oracle_review_series', 'privacy_coverage_test'):
            with self.subTest(constructor=module):
                output = subprocess.check_output(
                    [sys.executable, '-B', '-c', child, str(REPOSITORY), module,
                     str(Path(self.temp.name) / module)], cwd=REPOSITORY, text=True)
                self.assertEqual(json.loads(output), list(oracle.REVIEW_POLICY_MODULES))

    def test_raw_binary_and_newline_bodies_preserve_original_git_bytes(self):
        path=self.root/oracle.REVIEW_POLICY_MODULES[0];path.write_bytes(b'first\n\0middle\r\nlast\xff')
        self.git(self.root,'add','.');self.git(self.root,'commit','-qm','binary synthetic payload')
        self.revision=self.git(self.root,'rev-parse','HEAD').decode().strip()
        self.assertEqual(oracle._review_policy_tree_sources(self.root,self.revision),self.original())
        with self.assertRaises((ValueError,SyntaxError)):
            oracle._review_policy_sources(self.root,self.revision)

    def test_closed_revision_inputs_never_dispatch_git(self):
        for revision in ('HEAD','',self.revision+'\n',None,'-'+self.revision,'z'*40):
            with self.subTest(revision=revision),patch.object(oracle,'_git_bytes') as git:
                with self.assertRaises(ValueError):oracle._review_policy_tree_sources(self.root,revision)
                git.assert_not_called()

    def test_inventory_missing_duplicate_unknown_mode_kind_identity_size_and_order_reject(self):
        inventory,payload,rows=self.wire();entries=inventory[:-1].split(b'\0')
        first=entries[0];metadata,name=first.split(b'\t');mode,kind,oid,size=metadata.split()
        def entry(*,m=mode,k=kind,o=oid,n=name,z=size):return b' '.join((m,k,o,z))+b'\t'+n
        variants=[b'\0'.join(entries[:-1])+b'\0',inventory+entries[-1]+b'\0',
            b'\0'.join([entry(n=b'tools/unknown.py'),*entries[1:]])+b'\0',
            b'\0'.join(reversed(entries))+b'\0',inventory[:-1],b'x'*32769,b'\0']
        variants += [b'\0'.join([bad,*entries[1:]])+b'\0' for bad in
                     (entry(m=b'120000'),entry(k=b'tree'),entry(o=b'z'*40),entry(z=b'-1'),entry(z=b'00'),entry(z=b'99999999999999999999'))]
        for raw in variants:
            with self.subTest(digest=hashlib.sha256(raw).hexdigest()),patch.object(oracle,'_git_bytes',side_effect=[raw,payload]):
                with self.assertRaises(ValueError):oracle._review_policy_tree_sources(self.root,self.revision)

    def test_per_body_and_aggregate_limits_reject_before_body_process(self):
        inventory,payload,rows=self.wire();entries=inventory[:-1].split(b'\0')
        for count,size in ((1,8*1024*1024+1),(5,8*1024*1024)):
            altered=[]
            for index,entry in enumerate(entries):
                metadata,name=entry.split(b'\t');mode,kind,oid,old=metadata.split()
                altered.append(b' '.join((mode,kind,oid,str(size).encode() if index<count else old))+b'\t'+name)
            with patch.object(oracle,'_git_bytes',return_value=b'\0'.join(altered)+b'\0') as git:
                with self.assertRaisesRegex(ValueError,'bound'):oracle._review_policy_tree_sources(self.root,self.revision)
                self.assertEqual(git.call_count,1)

    def test_batch_type_size_order_framing_hash_truncation_and_trailing_bytes_reject(self):
        inventory,payload,rows=self.wire();first_header=rows[0][2]+b' blob '+rows[0][3]+b'\n'
        body_start=len(first_header);end=body_start+int(rows[0][3]);first_frame=payload[:end+1]
        variants=[payload[:-1],payload+b'x',payload.replace(b' blob ',b' tree ',1),
                  b'0'+payload[1:],payload[:body_start]+bytes([payload[body_start]^1])+payload[body_start+1:],
                  payload[:end]+b'!'+payload[end+1:],payload[end+1:]+first_frame,b'']
        variants.append(payload.replace(first_header,rows[0][2]+b' blob '+b'0'*len(rows[0][3])+b'\n',1))
        for raw in variants:
            with self.subTest(digest=hashlib.sha256(raw).hexdigest()),patch.object(oracle,'_git_bytes',side_effect=[inventory,raw]):
                with self.assertRaises(ValueError):oracle._review_policy_tree_sources(self.root,self.revision)

    def test_independent_revisions_modes_and_repositories_never_reuse_prior_reads(self):
        original=oracle._review_policy_tree_sources(self.root,self.revision)
        name=oracle.REVIEW_POLICY_MODULES[1];path=self.root/name;path.write_text('changed = 100\n');path.chmod(0o755)
        self.git(self.root,'add','.');self.git(self.root,'commit','-qm','new immutable source')
        revision=self.git(self.root,'rev-parse','HEAD').decode().strip()
        current=oracle._review_policy_tree_sources(self.root,revision)
        self.assertNotEqual(current[name],original[name]);self.assertEqual(current[name][0],'100755')
        self.assertEqual(oracle._review_policy_tree_sources(self.root,self.revision),original)
        peer=Path(self.temp.name)/'peer';self.make_repo(peer,seed=100)
        peer_revision=self.git(peer,'rev-parse','HEAD').decode().strip()
        self.assertNotEqual(oracle._review_policy_tree_sources(peer,peer_revision),original)
        with self.assertRaises((ValueError,oracle.OracleApprovalError)):
            oracle._review_policy_tree_sources(self.root,'0'*40)
        path.unlink();self.git(self.root,'add','-A');self.git(self.root,'commit','-qm','missing original module')
        missing=self.git(self.root,'rev-parse','HEAD').decode().strip()
        with self.assertRaises(ValueError):oracle._review_policy_tree_sources(self.root,missing)
        self.assertEqual(oracle._review_policy_tree_sources(self.root,self.revision),original)




class NativeValidationFixtureInputs(unittest.TestCase):
    def test_actual_constructor_projection_rejects_body_mode_link_missing_and_extra(self):
        import oracle_review_series as suite
        case = suite.ReviewSeries('runTest')
        try:
            case.setUp()
            self.assertEqual(len(case.fixture_inputs), 42)
            for name in ('source.py', 'peer.py'):
                (case.root/name).write_bytes(subprocess.check_output(['git','show','HEAD:'+name],cwd=case.root))
            self.assertEqual(suite.fixture_projection(case.root), case.fixture_inputs)
            path=case.root/'source.py'; original=path.read_bytes(); mode=path.stat().st_mode&0o777
            path.write_bytes(original+b'changed')
            with self.assertRaisesRegex(ValueError,'committed bytes'):suite.fixture_projection(case.root)
            path.write_bytes(original);path.chmod(mode^0o111)
            with self.assertRaisesRegex(ValueError,'committed bytes or mode'):suite.fixture_projection(case.root)
            path.chmod(mode);path.unlink()
            with self.assertRaises(FileNotFoundError):suite.fixture_projection(case.root)
            path.symlink_to(case.root/'peer.py')
            with self.assertRaises(OSError):suite.fixture_projection(case.root)
            path.unlink();path.write_bytes(original);path.chmod(mode)
            (case.root/'unexpected.py').write_text('synthetic extra input')
            case.git('add','unexpected.py','source.py','peer.py');case.git('commit','-qm','Synthetic extra input')
            with self.assertRaisesRegex(ValueError,'inventory'):suite.fixture_projection(case.root)
        finally:case.doCleanups()

    def test_real_wrapper_startup_source_rejection_cleans_owned_resources(self):
        import shutil
        files=set(oracle.REVIEW_POLICY_MODULES)|{
            'tests/oracle-review-series.test.mjs','tests/oracle_review_series.py',
            'tests/helpers/isolated-test-cohort.mjs','tests/helpers/native-validation-git.mjs',
            'tests/helpers/native-validation-state.mjs','.agents/skills/oracle/review-output.schema.json'}
        scratch=REPOSITORY/'Vault/tmp';scratch.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(dir=scratch,prefix='startup-custody-') as temporary:
            root=Path(temporary)/'repository';root.mkdir()
            for name in files:
                target=root/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(REPOSITORY/name,target)
            def git(*args):return subprocess.check_output(['git',*args],cwd=root,stderr=subprocess.PIPE)
            git('init','-q');git('config','user.name','Synthetic Validation')
            git('config','user.email','validation@example.invalid');git('add','.')
            git('commit','-qm','Synthetic validation inputs')
            schema=root/'.agents/skills/oracle/review-output.schema.json'
            schema.write_bytes(schema.read_bytes()+b'\n')
            environment={key:value for key,value in os.environ.items() if key!='NODE_TEST_CONTEXT'}
            result=subprocess.run(['node','--test','tests/oracle-review-series.test.mjs'],cwd=root,env=environment,
                                  stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
            self.assertNotEqual(result.returncode,0)
            self.assertIn(b'Discovery differs from committed source',result.stdout+result.stderr)
            self.assertEqual(list((root/'Vault/tmp').iterdir()),[])


if __name__ == '__main__':
    unittest.main()
