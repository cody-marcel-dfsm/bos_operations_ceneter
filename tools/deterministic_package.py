"""Fixed deterministic skill-package verification and exact-source publication.

This gate issues a VERIFIED source receipt, never an approval verdict. Unsupported
runtime/configuration changes require a separate fixed verification profile.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

try:
    from . import deterministic_source as native
except ImportError:
    import deterministic_source as native

KIND = 'boc-deterministic-package/1'
PROFILE = 'feedback-discovery-and-release-tool/1'
TESTS = [
    'tests/bos-foundation-connection.test.mjs', 'tests/bos-logout.test.mjs',
    'tests/context-selection.test.mjs', 'tests/product-mcp-contract.test.mjs',
    'tests/external-authentication-handoff.test.mjs',
    'tests/feedback-customization.test.mjs', 'tests/feedback-lifecycle.test.mjs',
    'tests/release-version.test.mjs', 'tests/skill-dependencies.test.mjs',
    'tests/versioned-skills.test.mjs', 'tests/package-model.test.mjs',
    'tests/journey-package-parity.test.mjs', 'tests/muse-package.test.mjs',
]
CHECKS = [
    ['npm', 'run', 'build:packages'], ['git', 'diff', '--exit-code', 'HEAD', '--'],
    ['npm', 'run', 'check'], ['npm', 'run', 'check:privacy'],
    ['npm', 'run', 'check:publication'],
    ['node', '--test', '--test-reporter=tap', *TESTS],
    [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tests',
     '-p', 'deterministic_package_test.py', '-v'],
]
BODY_SKILLS = {'source/platform/bos-mcp-client/SKILL.md',
               'source/platform/submit-feedback/SKILL.md'}
MAINTENANCE = {
    'AGENTS.md', '.agents/skills/ship-it/SKILL.md',
    'tools/deterministic_package.py', 'tools/deterministic-package.md',
    'tests/deterministic_package_test.py', 'scripts/bump-release-version.mjs',
    'tests/release-version.test.mjs', '.github/workflows/publication-safety.yml',
    'scripts/release.mjs',
    'tests/package-model.test.mjs',
}


def blob(root, revision, path):
    return subprocess.check_output(['git', '--no-replace-objects', 'show',
                                    revision + ':' + path], cwd=root)


def commits_and_paths(root, base, source):
    if not all(re.fullmatch('[0-9a-f]{40}', x or '') for x in (base, source)):
        raise ValueError('Exact candidate and publication base are required')
    native.git(root, 'merge-base', '--is-ancestor', base, source)
    result = []
    for commit in native.git(root, 'rev-list', '--reverse', base + '..' + source).splitlines():
        parents = native.git(root, 'show', '-s', '--format=%P', commit).split()
        if len(parents) != 1:
            raise ValueError('Integrate merge candidates through a separately mapped profile')
        for row in native.git(root, 'diff-tree', '--no-commit-id', '--raw', '-r',
                              '--no-renames', parents[0], commit).splitlines():
            fields, path = row.split('\t')
            old_mode, new_mode = fields.split()[:2]
            if new_mode not in {'100644', '100755'}:
                raise ValueError('Deletion or nonregular source change: ' + path)
            result.append((parents[0], commit, path, old_mode[1:], new_mode))
    if not result:
        raise ValueError('No package changes to verify')
    return result


def scope(root, base, source):
    rows = commits_and_paths(root, base, source)
    paths = set()
    for parent, commit, path, old_mode, new_mode in rows:
        paths.add(path)
        if path in MAINTENANCE or path in BODY_SKILLS:
            continue
        if path.startswith('clients/'):
            # The fixed build+clean-tree checks independently regenerate all consumers.
            continue
        if path in {'skill-release-manifest.json', 'products/bos/openai/bos-skills.zip',
                    'products/education-center/openai/education-center-skills.zip'}:
            continue
        if path.startswith('source/') and path.endswith('/SKILL.md'):
            def without_pins(value):
                parts = value.split(b'---', 2)
                if len(parts) != 3 or parts[0].strip():
                    raise ValueError('Skill frontmatter is required')
                parts[1] = re.sub(rb'^  (?:version|requires):.*$', b'', parts[1], flags=re.M)
                return b'---'.join(parts)
            if without_pins(blob(root, parent, path)) != without_pins(blob(root, commit, path)):
                raise ValueError('Unmapped skill behavior: ' + path)
            continue
        if path in {'package.json', 'package-manifest.json', 'package-lock.json',
                    'products/bos/product.json', 'products/education-center/product.json'}:
            before, after = (json.loads(blob(root, ref, path)) for ref in (parent, commit))
            for value in (before, after):
                value.pop('version', None)
                if path == 'package.json':
                    command = value.get('scripts', {}).get('release:check')
                    if command is not None and command not in {'python3 tools/validation_contract.py release',
                                                               'python3 tools/deterministic_package.py validate'}:
                        raise ValueError('Unexpected release verification command')
                    if 'release:check' in value.get('scripts', {}):
                        value['scripts']['release:check'] = 'FIXED_DETERMINISTIC_GATE_MIGRATION'
                if path == 'package-lock.json':
                    value.get('packages', {}).get('', {}).pop('version', None)
            if before != after:
                raise ValueError('Unmapped package configuration or dependency change: ' + path)
            continue
        if path == 'README.md':
            def without_release(value):
                return re.sub(rb'Current source package release: `[^`]+`\. If `[^`]+` is installed,',
                              b'RELEASE', value)
            if without_release(blob(root, parent, path)) != without_release(blob(root, commit, path)):
                raise ValueError('Unmapped documentation change')
            continue
        raise ValueError('Unsupported package-release scope: ' + path)
    if (Path(root) / 'tools/validation-selection.json').exists():
        raise ValueError('Existing selected contract must be explicitly migrated; no override')
    return sorted(paths)


def complete(command, output, code):
    if code != 0:
        return False
    if '--test-reporter=tap' in command:
        values = {}
        for key, number in re.findall(rb'^# (tests|pass|fail|cancelled|skipped|todo) ([0-9]+)\s*$', output, re.M):
            values[key.decode()] = int(number)
        return (set(values) == {'tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'}
                and values['tests'] > 0 and values['pass'] == values['tests']
                and not any(values[k] for k in ('fail', 'cancelled', 'skipped', 'todo')))
    if 'unittest' in command:
        return (bool(re.search(rb'Ran [1-9][0-9]* tests? in', output))
                and bool(re.search(rb'\nOK\s*$', output)) and b'skipped=' not in output)
    return True


def directory(root):
    return Path(native.git(root, 'rev-parse', '--absolute-git-dir')) / 'oracle/deterministic-package'


def read_receipt(root):
    current = native.identity(root)
    paths = [directory(root) / (current['source'] + '.json'),
             *directory(root).glob(current['source'] + '.*.json')]
    paths = [path for path in paths if path.exists()]
    if not paths:
        raise ValueError('No deterministic package receipt for this candidate')
    for candidate in paths:
        if candidate.is_symlink() or candidate.stat().st_mode & 0o077:
            raise ValueError('Unsafe package receipt')
    path = max(paths, key=lambda item: json.loads(item.read_bytes())['runs'][-1]['completed_at'])
    if path.is_symlink() or path.stat().st_mode & 0o077:
        raise ValueError('Unsafe package receipt')
    value = json.loads(path.read_bytes())
    checksum = value.pop('sha256')
    if (native.digest(native.encoded(value)) != checksum or value.get('kind') != KIND
            or value.get('profile') != PROFILE or value.get('status') != 'VERIFIED'):
        raise ValueError('Invalid deterministic package receipt')
    if any(value.get(k) != v for k, v in current.items()):
        raise ValueError('Candidate, runtime or dependency inputs changed')
    if value['paths'] != scope(root, value['base'], current['source']):
        raise ValueError('Publication range changed')
    if [row['command'] for row in value['runs']] != CHECKS:
        raise ValueError('Fixed command category changed')
    for failure in directory(root).glob('*.failure.json'):
        record = json.loads(failure.read_bytes())
        if (record.get('identity') == current and record.get('runs')
                and record['runs'][-1]['completed_at'] > value['runs'][-1]['completed_at']):
            raise ValueError('A later failed execution supersedes this receipt')
    for row in value['runs']:
        path = directory(root) / (row['output_sha256'] + '.log')
        if path.is_symlink() or path.stat().st_mode & 0o077:
            raise ValueError('Unsafe command output')
        output = path.read_bytes()
        if native.digest(output) != row['output_sha256'] or not complete(row['command'], output, row['exit_code']):
            raise ValueError('Original command output changed or is incomplete')
    return dict(value, sha256=checksum)


def validate(root, base, requested_at):
    start = None if requested_at == 'unknown' else datetime.fromisoformat(requested_at.replace('Z', '+00:00'))
    if start is not None and (start.tzinfo is None or start > datetime.now(timezone.utc)):
        raise ValueError('Original timezone-aware request time is required')
    before = native.identity(root)
    paths = scope(root, base, before['source'])
    if not CHECKS:
        raise ValueError('Fixed package check category is empty')
    runs = []
    for command in CHECKS:
        began = time.time()
        try:
            result = subprocess.run(command, cwd=root, capture_output=True, timeout=300)
            output, code = result.stdout + b'\n' + result.stderr, result.returncode
        except subprocess.TimeoutExpired as error:
            output, code = (error.stdout or b'') + b'\n' + (error.stderr or b''), 'TIMEOUT'
        checksum = native.digest(output)
        path = directory(root) / (checksum + '.log')
        if not path.exists():
            native.private_write(path, output)
        runs.append({'command': command, 'exit_code': code, 'output_sha256': checksum,
                     'started_at': began, 'completed_at': time.time()})
        if not complete(command, output, code):
            native.private_write(directory(root) / (str(time.time_ns()) + '.failure.json'),
                                 native.encoded({'kind': KIND + '-failure', 'identity': before,
                                                 'base': base, 'request_started_at': requested_at, 'runs': runs}))
            raise ValueError('Required package check failed; original output retained: ' + str(path))
    if native.identity(root) != before:
        raise ValueError('Source, generated package or runtime changed during verification')
    value = {'kind': KIND, 'profile': PROFILE, 'status': 'VERIFIED', **before,
             'base': base, 'paths': paths, 'runs': runs, 'request_started_at': requested_at,
             'sla_status': ('BREACHED_ORIGINAL_TIME_UNAVAILABLE' if start is None else
                            'BREACHED' if time.time() - start.timestamp() > 300 else 'NOT_ESTABLISHED'),
             'deployment_authorized': False}
    value['sha256'] = native.digest(native.encoded(value))
    path = directory(root) / (before['source'] + '.json')
    if path.exists():
        # A repaired retry gets new immutable evidence; prior executions survive.
        path = directory(root) / (before['source'] + '.' + str(time.time_ns()) + '.json')
    native.private_write(path, native.encoded(value))
    return read_receipt(root)


def publish(root, ref, pr=None):
    value = read_receipt(root)
    version = json.loads(blob(root, value['source'], 'package.json'))['version']
    if ref != 'codex/release-v' + version:
        raise ValueError('Exact version-bound release ref required')
    destinations = native.git(root, 'remote', 'get-url', '--push', '--all', 'origin').splitlines()
    owned = {'https://github.com/' + native.REPOSITORY + '.git',
             'git' + chr(64) + 'github.com:' + native.REPOSITORY + '.git'}
    if len(destinations) != 1 or destinations[0] not in owned:
        raise ValueError('Exact owned publication destination required')
    remote = destinations[0]
    if native.git(root, 'ls-remote', remote, 'refs/heads/main').split()[0] != value['base']:
        raise ValueError('Remote publication base moved; integrate and revalidate')
    if pr is None:
        subprocess.run(['git', 'push', remote, value['source'] + ':refs/heads/' + ref], cwd=root, check=True)
    else:
        try:
            from . import publication_admission as admission
        except ImportError:
            import publication_admission as admission
        selected = {'candidate_commit': value['source'], 'candidate_tree': value['tree'],
                    'release_ref': ref, 'publication_scope': {'baseline_commit': value['base']}}
        observed = admission._remote_admission(root, selected, pr=pr)
        native.private_write(directory(root) / (str(time.time_ns()) + '.remote.json'), native.encoded(observed))
        read_receipt(root)
        if native.git(root, 'ls-remote', remote, 'refs/heads/main').split()[0] != value['base']:
            raise ValueError('Remote publication base moved during CI admission')
        subprocess.run(['gh', 'pr', 'merge', str(pr), '--repo', native.REPOSITORY,
                        '--merge', '--match-head-commit', value['source']], cwd=root, check=True)
        merged = native.git(root, 'ls-remote', remote, 'refs/heads/main').split()[0]
        native.git(root, 'fetch', 'origin')
        if native.git(root, 'rev-parse', merged + '^{tree}') != value['tree']:
            raise ValueError('Published main tree differs from verified package')
    return {'status': 'RELEASE_SOURCE_PUSHED' if pr is None else 'RELEASE_MERGED',
            'source': value['source'], 'deployment_authorized': False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['validate', 'verify', 'push', 'merge', 'ci'])
    parser.add_argument('--base')
    parser.add_argument('--requested-at')
    parser.add_argument('--ref')
    parser.add_argument('--pr')
    args = parser.parse_args(argv)
    root = Path(native.git(Path.cwd(), 'rev-parse', '--show-toplevel'))
    if args.action in {'validate', 'ci'}:
        requested = (datetime.now(timezone.utc).isoformat() if args.action == 'ci' else
                     args.requested_at or os.environ.get('BOS_REVIEW_STARTED_AT') or 'unknown')
        if not args.base:
            native.git(root, 'fetch', 'origin')
            args.base = native.git(root, 'rev-parse', 'origin/main^{commit}')
        if args.action == 'ci':
            try:
                native.scope(root, args.base, native.git(root, 'rev-parse', 'HEAD'))
            except ValueError:
                pass
            else:
                value = native.validate(root, args.base, requested)
                print(json.dumps({'kind': value['kind'], 'status': value['status'],
                                  'source': value['source'], 'sla_status': 'CI_PHASE_ONLY'}))
                return 0
        value = validate(root, args.base, requested)
    elif args.action == 'verify':
        value = read_receipt(root)
    else:
        value = publish(root, args.ref, args.pr if args.action == 'merge' else None)
    print(json.dumps({key: value[key] for key in ('kind', 'status', 'source', 'sla_status',
                                                 'deployment_authorized') if key in value}))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
