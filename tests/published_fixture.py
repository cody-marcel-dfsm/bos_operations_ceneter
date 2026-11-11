"""Local fixture of a published ref with genuine deterministic-lane provenance.

The repository is isolated under a temporary directory. Its published commit carries the real
published Codex product packages and a sealed Oracle spec issued through the native proposal
path (synthetic reviewer), and its VERIFIED receipt is produced by the real package lane
(`deterministic_package.validate`) with the fixed command set replaced by one synthetic check.
`verify` runs verify-commit with that same command set, so provenance is judged by the actual
lane contract. No live GitHub access is involved.

  python3 tests/published_fixture.py build <empty-directory> <source-revision>   -> prints the commit
  python3 tests/published_fixture.py verify <directory> <commit>
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from unittest.mock import patch

REPOSITORY = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPOSITORY))
from tools import deterministic_package as package_lane  # noqa: E402
from tools import oracle_approval as oracle  # noqa: E402
from tools import validation_contract as contract  # noqa: E402

CHECKS = [[sys.executable, '-c', 'print("synthetic fixed package check")']]
PROPOSAL = 'Problem: synthetic publication. Cause: synthetic. Recommended change: synthetic.'
APPROVED = {'verdict': 'APPROVED', 'review_status': 'COMPLETE', 'findings': [], 'authentication_impact': 'NONE',
            'owner_approval_status': 'NOT_REQUIRED',
            'api_version_assessment': {'impact': 'NONE', 'request_kind': 'NOT_REQUIRED', 'requested_change': None,
                                       'request_quote': None, 'request_evidence': None}}
TEST = ("import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';"
        "test('published packages present',()=>assert.ok(existsSync('clients/codex/plugins/bos/.bos-product.json')));\n")


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root, text=True, stderr=subprocess.DEVNULL).strip()


def build(root, revision):
    root = Path(root).resolve()
    git(root, 'init', '-q', '-b', 'main')
    git(root, 'config', 'user.name', 'Synthetic'); git(root, 'config', 'user.email', 'synthetic@example.invalid')
    (root / 'tools').mkdir(); (root / 'tests').mkdir(); (root / 'node_modules').mkdir()
    (root / 'node_modules/dependency').write_text('locked')
    for name in [*oracle.REVIEW_POLICY_MODULES, 'tools/deterministic_source.py', 'tools/deterministic_package.py',
                 'tools/validation-catalog.json']:
        shutil.copy2(REPOSITORY / name, root / name)
    (root / '.gitignore').write_text('__pycache__/\nnode_modules/\n')
    (root / 'AGENTS.md').write_text('Synthetic governing criterion\n')
    (root / 'package.json').write_text(json.dumps({'version': '0.0.1', 'scripts': {
        'check:privacy': 'node -e "process.exit(0)"', 'check:publication': 'node -e "process.exit(0)"',
        'release:check': 'python3 tools/deterministic_package.py validate'}}))
    (root / 'tests/spec.test.mjs').write_text(TEST)
    git(root, 'add', '-A'); git(root, 'commit', '-qm', 'base')
    base = git(root, 'rev-parse', 'HEAD')
    selection = {'change_class': 'bug_fix', 'scope_paths': ['clients/*', 'tests/*'], 'design': None,
                 'categories': [{'name': 'sanity', 'tests': [], 'fixtures': []},
                                {'name': 'focused', 'tests': ['tests/spec.test.mjs'], 'fixtures': []}],
                 'reason': 'Synthetic publication', 'revision_of': None,
                 'acceptance': ['The published product packages are present'],
                 'acceptance_tests': [{'module': 'tests/spec.test.mjs', 'covers': [0], 'purpose': 'Proves presence'}]}
    with patch.object(oracle, '_review_settings_binding', return_value={'model': 'synthetic', 'reasoning_effort': None}), \
            patch.object(oracle, '_fresh_origin', return_value=base):
        oracle.review_proposal(root, PROPOSAL, [], None, lambda *args: dict(APPROVED, validation_selection=selection))
    git(root, 'add', '-A'); git(root, 'commit', '-qm', 'sealed spec')
    reproduction = subprocess.run([sys.executable, 'tools/validation_contract.py', 'run', '--category', 'focused',
                                   '--phase', 'before'], cwd=root, capture_output=True, text=True)
    if reproduction.returncode:
        raise SystemExit('fail-before reproduction did not run: ' + reproduction.stdout + reproduction.stderr)
    archive = subprocess.run(['git', 'archive', revision, 'clients/codex/plugins/bos', 'clients/codex/plugins/education-center'],
                             cwd=REPOSITORY, capture_output=True, check=True).stdout
    subprocess.run(['tar', '-x', '-C', str(root)], input=archive, check=True)
    git(root, 'add', '-A'); git(root, 'commit', '-qm', 'published release')
    commit = git(root, 'rev-parse', 'HEAD')
    with patch.object(package_lane, 'CHECKS', CHECKS):
        package_lane.validate(root, base, '2026-11-11T00:00:00Z')
    git(root, 'update-ref', 'refs/remotes/origin/main', commit)
    return commit


def verify(root, commit):
    with patch.object(package_lane, 'CHECKS', CHECKS):
        oracle.verify_commit(Path(root).resolve(), commit)


if __name__ == '__main__':
    action, directory, value = sys.argv[1:4]
    try:
        if action == 'build':
            print(build(directory, value))
        else:
            verify(directory, value)
            print('APPROVED')
    except (oracle.OracleApprovalError, ValueError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
