"""Fixed deterministic skill-package verification and exact-source publication.

This gate issues a VERIFIED source receipt, never an approval verdict. Unsupported
runtime/configuration changes require a separate fixed verification profile.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import selectors
import secrets
import threading
import tempfile
import signal
import argparse
import hashlib
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request

try:
    from . import deterministic_source as native
except ImportError:
    import deterministic_source as native

KIND = 'boc-deterministic-package/1'
PROFILE = 'feedback-discovery-and-release-tool/9'
_OUTPUT_LOCK = threading.Lock()
WS_LOCK_RECORD = {
    'version': '8.23.0', 'resolved': 'https://registry.npmjs.org/ws/-/ws-8.23.0.tgz',
    'integrity': 'sha512-wCkmX8QMOrKjgO8HW2WyDbTSGeqkocxgDzS9iR79rEAexty6/2qzilx3Ag8Tqf9ykop3irLKle0MtVn5qjVnoQ==',
    'dev': True, 'license': 'MIT', 'engines': {'node': '>=10.0.0'},
    'peerDependencies': {'bufferutil': '^4.0.1', 'utf-8-validate': '>=5.0.2'},
    'peerDependenciesMeta': {'bufferutil': {'optional': True}, 'utf-8-validate': {'optional': True}},
}
TESTS = [
    'tests/bos-foundation-connection.test.mjs', 'tests/bos-logout.test.mjs',
    'tests/context-selection.test.mjs', 'tests/product-mcp-contract.test.mjs',
    'tests/external-authentication-handoff.test.mjs',
    'tests/feedback-evidence-guidance.test.mjs', 'tests/bos-native-compatibility.test.mjs',
    'tests/feedback-customization.test.mjs', 'tests/feedback-lifecycle.test.mjs',
    'tests/release-version.test.mjs', 'tests/skill-dependencies.test.mjs',
    'tests/versioned-skills.test.mjs', 'tests/package-model.test.mjs',
    'tests/journey-package-parity.test.mjs', 'tests/muse-package.test.mjs',
    'tests/bos-customer-profile.test.mjs', 'tests/plugin-console.test.mjs',
    'tests/plugin-settings.test.mjs', 'tests/publication-safety.test.mjs',
    'tests/ada-client.test.mjs', 'tests/ada-journey-view.test.mjs',
    'tests/runtime-skill-export.test.mjs', 'tests/feedback-item-discussion.test.mjs',
    'tests/notification-host.test.mjs', 'tests/notification-host-installer.test.mjs',
    'tests/document-cache.test.mjs', 'tests/ada-customer-onboarding.test.mjs',
    'tests/customer-onboarding-host.test.mjs',
    'tests/bos-oauth-live-contract.test.mjs', 'tests/external-dependency-adapter.test.mjs',
    'tests/journey-notifications.test.mjs', 'tests/oracle-api-version-request.test.mjs',
    'tests/oracle-performance.test.mjs', 'tests/isolated-test-cohort.test.mjs',
    'tests/publication-history.test.mjs',
    'tests/feedback-socket-host.test.mjs',
    'tests/customer-data-privacy.test.mjs', 'tests/privacy-coverage.test.mjs',
]
PYTHON_MODULES = ('deterministic_package_test', 'command_coverage_test', 'oracle_parallel_test')
PYTHON_CHECK = [sys.executable, '-B', 'tools/deterministic_package.py', 'python-category', 'unittest']
_PYTHON_ACTIVE = set()
_PYTHON_LOCK = threading.Lock()
_PYTHON_STOPPING = set()

CHECKS = [
    ['node', 'scripts/build-feedback-socket-runtime.mjs', '--check'],
    ['npm', 'run', 'build:packages'], ['git', 'diff', '--exit-code', 'HEAD', '--'],
    ['npm', 'run', 'check'], ['node', 'scripts/check-customer-data.mjs'],
    ['npm', 'run', 'check:publication'],
    ['node', '--test', '--test-reporter=tap', *TESTS],
    PYTHON_CHECK,
    ['node', 'scripts/check-publication-history.mjs'],
]
BODY_SKILLS = {'source/platform/bos-mcp-client/SKILL.md',
               'source/platform/submit-feedback/SKILL.md',
               'source/platform/submit-feedback/references/feedback-contract.md',
               'source/platform/bos-mcp-client/references/identity-context.md'}
# Profile /2 amendment: BOS customer initialization and the MCP discovery
# fallback for plugin settings/console. Exact files only; anything else in
# source/ still fails closed.
CUSTOMER_INITIALIZATION = {
    'source/platform/bos-customer-initialization/SKILL.md',
    'source/platform/bos-customer-initialization/agents/openai.yaml',
    'source/platform/bos-customer-initialization/scripts/customer-profile.mjs',
    'source/platform/bos-plugin-settings-initialization/SKILL.md',
    'source/platform/bos-plugin-console/SKILL.md',
    'source/platform/bos-mcp-client/references/identity-context.md',
    'tests/bos-customer-profile.test.mjs',
}
# Profile /3 amendment: owner-directed shared Ada client behavior and pure
# turn safeguards. Exact files only; existing auth/transport is unchanged.
ADA_CLIENT = {
    'source/platform/ada/SKILL.md',
    'source/platform/ada/scripts/customer-onboarding.mjs',
    'source/platform/ada/references/customer-onboarding.md',
    'source/host-runtime/bos-journey-notifications/customer-onboarding-host.mjs',
    'tests/ada-customer-onboarding.test.mjs', 'tests/customer-onboarding-host.test.mjs',
    'tests/helpers/synthetic-onboarding.mjs',
    'source/platform/ada/agents/openai.yaml',
    'source/platform/ada/references/turn-safeguards.md',
    'source/platform/ada/scripts/turn-safeguards.mjs',
    'tests/ada-client.test.mjs',
    'source/platform/ada/scripts/journey-view.mjs',
    'source/platform/ada/references/journey-view.md',
    'tests/ada-journey-view.test.mjs',
    'source/platform/ada/references/behavior-core.md',
    'source/platform/ada/references/runtime-export.md',
    'source/platform/ada/runtime-export.json',
    'scripts/lib/runtime-skill-export.mjs',
    'scripts/export-runtime-skill.mjs',
    'tests/runtime-skill-export.test.mjs',
    'source/platform/submit-feedback/scripts/item-discussion.mjs',
    'source/platform/submit-feedback/references/item-discussion.md',
    'tests/feedback-item-discussion.test.mjs',
    'source/host-runtime/bos-journey-notifications/feedback-socket.mjs',
    'source/host-runtime/bos-journey-notifications/feedback-discussion-host.mjs',
    'source/host-runtime/bos-journey-notifications/muse-companion-cli.mjs',
    'source/host-runtime/bos-journey-notifications/muse-companion-host.mjs',
    'source/host-runtime/bos-journey-notifications/muse-hook.sh',
    'source/host-runtime/bos-journey-notifications/README.md',
    'source/host-runtime/bos-journey-notifications/vendor/ws.bundle.mjs',
    'source/host-runtime/bos-journey-notifications/vendor/WS-LICENSE.txt',
    'source/host-runtime/bos-journey-notifications/vendor/ws.provenance.json',
    'scripts/build-feedback-socket-runtime.mjs',
    'scripts/entries/feedback-websocket-runtime.mjs',
    'scripts/install-notification-host.mjs',
    'tests/notification-host-installer.test.mjs',
    'tests/feedback-socket-host.test.mjs',
    'source/host-runtime/bos-shared-cache/document-cache.mjs', 'tests/document-cache.test.mjs',
    'scripts/check-customer-data.mjs', 'tests/customer-data-privacy.test.mjs',
    'scripts/lib/privacy-coverage.mjs', 'scripts/lib/privacy-scan-pool.mjs',
    'scripts/lib/privacy-scan-worker.mjs', 'tests/privacy-coverage.test.mjs',
}
# Profile /2 amendment: owner-approved repairs of tests that went stale when
# CI moved to this deterministic gate (aa66d553, 6d75ed26, 2dbc43b4).
STALE_TEST_REPAIRS = {
    # Workflow text assertions removed by aa66d553 / 6d75ed26 / 2dbc43b4.
    'tests/publication-safety.test.mjs',
    'tests/oracle-governance.test.mjs',
    # Reasoning effort is bounded by owner delivery policy since ca4c5108.
    'tests/oracle_parallel_test.py',
    'tests/oracle_review_series.py',
    # Patched helper was renamed (process_identity -> process_birth).
    'tests/oracle_lifecycle_test.py',
    # A killed orphan is a zombie until reaped; it is terminated either way.
    'tests/isolated-test-cohort.test.mjs',
    # Wrapper timeout (120s) was at the suite's runtime on slower hosts.
    'tests/oracle-lifecycle.test.mjs',
    # Owner-approved tool bug fixes found by these tests.
    'tools/command_coverage.py',   # crash on a tree without package.json
    'tools/oracle_approval.py',    # proposal final_tree used _tree, not _review_tree
    # Owner-approved: exporter accepts deterministic CI provenance (verify-published).
    'scripts/build-marketplace-update.mjs',
}

# /9 explicitly covers preserved feature edges, not arbitrary older history.
LEGACY_FEATURE_PATHS = {
    'scripts/lib/bos-oauth-live-contract.mjs', 'tests/bos-oauth-live-contract.test.mjs',
    'contracts/bos-client-dependency.v1/manifest.json', 'scripts/lib/package-model.mjs',
    'source/platform/authentication-context-integrity/SKILL.md',
    'source/platform/bos-external-dependency-adapter/SKILL.md',
    'source/platform/bos-external-dependency-adapter/references/dependency-adapter.md',
    'source/platform/bos-external-dependency-adapter/scripts/external-dependency-adapter.mjs',
    'source/platform/bos-guided-support/references/support-state-machine.md',
    'source/platform/bos-mcp-client/references/runtime-continuation-contract.md',
    'tests/external-authentication-handoff.test.mjs', 'tests/external-dependency-adapter.test.mjs',
    'tools/oracle_parallel.py', 'tests/oracle_parallel_test.py',
    'tests/journey-notifications.test.mjs', 'tests/command_coverage_test.py',
    'tests/helpers/isolated-test-cohort.mjs', 'tests/isolated-test-cohort.test.mjs',
    'tests/oracle-api-version-request.test.mjs', 'tests/oracle-performance.test.mjs',
    'scripts/check-publication-history.mjs', 'tests/publication-history.test.mjs',
    'scripts/lib/publication-credentials.mjs', 'scripts/check-package.mjs',
}

PRODUCT_INCLUDE_ADDITIONS = {'products/bos/product.json': {'platform/bos-customer-initialization', 'platform/ada'}}
MAINTENANCE = {
    'AGENTS.md', '.agents/skills/ship-it/SKILL.md',
    'tools/deterministic_package.py', 'tools/deterministic-package.md',
    'tests/deterministic_package_test.py', 'scripts/bump-release-version.mjs',
    'tests/release-version.test.mjs', '.github/workflows/publication-safety.yml',
    'scripts/release.mjs',
    'tests/package-model.test.mjs',
    'tests/feedback-evidence-guidance.test.mjs', 'tests/bos-native-compatibility.test.mjs',
}

# Historical selections are retained evidence, never executable validation authority.
RETIRED_SELECTION = 'tools/validation-selection.json'
RETIRED_SELECTION_SHA256 = frozenset({
    '3492d4153de820e07a13d7ecc8c187fc04c5e60a2acce2fa488ea4972b8823b4',
    'c1f0431bcc70c271d2411797d049ab1d7b18ffc375b86e08d43e42322469eddf',
    '97963c568bef047d9621c0d07bf8b7b672e3130edd018c0b5bc638eb966bd1eb',
})


def blob(root, revision, path):
    return subprocess.check_output(['git', '--no-replace-objects', 'show',
                                    revision + ':' + path], cwd=root)


def commits_and_paths(root, base, source):
    if not all(re.fullmatch('[0-9a-f]{40}', x or '') for x in (base, source)):
        raise ValueError('Exact candidate and publication base are required')
    if native.git(root, 'rev-parse', '--is-shallow-repository') != 'false' or native.git(root, 'replace', '-l'):
        raise ValueError('Complete original Git history is required')
    graft = Path(native.git(root, 'rev-parse', '--git-path', 'info/grafts'))
    if not graft.is_absolute(): graft = Path(root) / graft
    if graft.exists() and graft.read_bytes().strip():
        raise ValueError('Original Git history cannot use grafts')
    native.git(root, 'merge-base', '--is-ancestor', base, source)
    result = []
    for commit in native.git(root, 'rev-list', '--reverse', base + '..' + source).splitlines():
        parents = native.git(root, 'show', '-s', '--format=%P', commit).split()
        if len(parents) == 2:
            trusted = []
            for parent in parents:
                observation = subprocess.run(['git', '--no-replace-objects', 'merge-base',
                                               '--is-ancestor', parent, base], cwd=root,
                                              stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                if observation.returncode not in (0, 1):
                    observation.check_returncode()
                if observation.returncode == 0:
                    trusted.append(parent)
            if not trusted:
                # A preserved integration may have unpublished work after main
                # on its first parent and a side branch from older published main.
                # Every side commit remains in rev-list below; this selects only
                # the baseline for classifying the merge resolution itself.
                descendants = [parent for parent in parents if subprocess.run(
                    ['git', '--no-replace-objects', 'merge-base', '--is-ancestor', base, parent],
                    cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False).returncode == 0]
                fork = subprocess.run(['git', '--no-replace-objects', 'merge-base', base, parents[1]],
                                      cwd=root, capture_output=True, text=True)
                if descendants == [parents[0]] and fork.returncode == 0 and fork.stdout.strip():
                    trusted = [parents[0]]
            if len(trusted) != 1:
                raise ValueError('Merge needs exactly one publication-base ancestor parent or bounded published-fork integration')
            # Check the integrated result against its trusted published parent.
            # rev-list still checks every unpublished nonmerge edge, including reverts.
            parents = trusted
        elif len(parents) != 1:
            raise ValueError('Only two-parent publication-base anchored merges are mapped')
        for row in native.git(root, 'diff-tree', '--no-commit-id', '--raw', '-r',
                              '--no-renames', parents[0], commit).splitlines():
            fields, path = row.split('\t')
            old_mode, new_mode = fields.split()[:2]
            if new_mode not in {'100644', '100755'} and not (
                    path == RETIRED_SELECTION and new_mode == '000000'):
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
        if path == RETIRED_SELECTION:
            for revision, mode in ((parent, old_mode), (commit, new_mode)):
                if mode == '000000':
                    continue
                if mode != '100644' or hashlib.sha256(blob(root, revision, path)).hexdigest() not in RETIRED_SELECTION_SHA256:
                    raise ValueError('Unmapped retired validation selection')
            continue
        if path == 'contracts/bos-client-dependency.v1/manifest.json':
            values = [json.loads(blob(root, revision, path)) for revision in (parent, commit)]
            def immutable_contract(value):
                if isinstance(value, dict):
                    return {key: immutable_contract(item) for key, item in value.items()
                            if key not in {'sha256', 'bundle_sha256'}}
                if isinstance(value, list): return [immutable_contract(item) for item in value]
                return value
            if immutable_contract(values[0]) != immutable_contract(values[1]):
                raise ValueError('Existing public dependency contract identity cannot change')
            continue
        if (path in MAINTENANCE or path in BODY_SKILLS or path in CUSTOMER_INITIALIZATION
                or path in STALE_TEST_REPAIRS or path in ADA_CLIENT or path in LEGACY_FEATURE_PATHS):
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
                                                               'python3 tools/deterministic_package.py validate',
                                                               'npm run build && npm run check && npm run check:privacy && npm run contract:check && npm test'}:
                        raise ValueError('Unexpected release verification command')
                    if 'release:check' in value.get('scripts', {}):
                        value['scripts']['release:check'] = 'FIXED_DETERMINISTIC_GATE_MIGRATION'
                if path == 'package-lock.json':
                    value.get('packages', {}).get('', {}).pop('version', None)
            if path in {'package.json', 'package-lock.json'}:
                for value in (before, after):
                    owner = value if path == 'package.json' else value.get('packages', {}).get('', {})
                    ws = owner.get('devDependencies', {}).pop('ws', None)
                    if ws not in (None, '8.23.0'):
                        raise ValueError('Unmapped WebSocket dependency version')
                    if path == 'package-lock.json':
                        ws_row = value.get('packages', {}).pop('node_modules/ws', None)
                        if ws_row is not None and ws_row != WS_LOCK_RECORD:
                            raise ValueError('Unmapped WebSocket dependency integrity')
            allowed = PRODUCT_INCLUDE_ADDITIONS.get(path)
            if allowed and isinstance(before.get('includes'), list) and isinstance(after.get('includes'), list):
                added = [x for x in after['includes'] if x not in before['includes']]
                if set(added) <= allowed and len(added) == len(set(added)) and \
                        [x for x in after['includes'] if x not in added] == before['includes']:
                    after['includes'] = before['includes']
            if before != after:
                raise ValueError('Unmapped package configuration or dependency change: ' + path)
            continue
        if path == 'README.md':
            def without_release(value):
                for handoff in (b'The probe stops at the first redirect. It requires a 302/303/307 response to\n`accounts.google.com` with `prompt` containing `select_account`; an HTTP 500,\nthe wrong provider, or automatic account selection fails the contract. After\nthe selected Google identity returns, the BOS server resolves organization and\nrole from that verified identity on every authorization. The client never\nchooses or stores an organization mapping.', b'The probe accepts a direct 302/303/307 Google redirect or at most two automatic\nsame-origin continuations through the existing bound BOS handoff routes. Every\ncontinuation preserves its opaque transaction; a rendered BOS login, consent,\norganization/role or grant page fails the contract. The final Google redirect\nrequires `prompt` containing `select_account`. Google owns account choice and\nprovider consent. The probe establishes login initiation; the service-owned\nbrowser suite separately verifies automatic registered-client callback delivery,\ncode/token exchange and authenticated MCP. The server checks current membership\nand operation authority after identity verification.'):
                    value = value.replace(handoff, b'BOUNDED_AUTOMATIC_HANDOFF_GUIDANCE')
                value = re.sub(rb'\n<!-- deterministic-package-release -->.*?<!-- /deterministic-package-release -->\n',
                               b'', value, flags=re.S)
                return re.sub(rb'Current source package release: `[^`]+`\. If `[^`]+` is installed,',
                              b'RELEASE', value)
            if without_release(blob(root, parent, path)) != without_release(blob(root, commit, path)):
                raise ValueError('Unmapped documentation change')
            continue
        raise ValueError('Unsupported package-release scope: ' + path)
    if native.git(root, 'ls-tree', source, '--', RETIRED_SELECTION):
        raise ValueError('Existing selected contract must be explicitly migrated; no override')
    return sorted(paths)


_PYTHON_CANCELLED = threading.Event()
_PYTHON_OUTPUT_LIMIT = 8 * 1024 * 1024


def python_module_command(module):
    if module not in PYTHON_MODULES: raise ValueError('Unknown Python module')
    return [sys.executable, '-B', '-c',
            "import sys,unittest;sys.path.insert(0,'tests');sys.argv.pop(1);unittest.main(module=None)",
            'unittest', module, '-v']


def _stop_python_group(process, force=False):
    with _PYTHON_LOCK:
        if process not in _PYTHON_ACTIVE or not force and process in _PYTHON_STOPPING: return
        _PYTHON_STOPPING.add(process)
    try: os.killpg(process.pid, signal.SIGKILL if force else signal.SIGTERM)
    except ProcessLookupError: return
    except PermissionError:
        # A short-lived child can already be reaped before the pipe reader
        # observes its final chunk. Never signal a reused/foreign group.
        if process.poll() is None:
            try: process.terminate()
            except ProcessLookupError: pass
        return
    if not force:
        timer = threading.Timer(2, _stop_python_group, args=(process, True))
        timer.daemon = True; timer.start()


def cancel_python_category(*unused):
    _PYTHON_CANCELLED.set()
    with _PYTHON_LOCK: processes = list(_PYTHON_ACTIVE)
    for process in processes: _stop_python_group(process)


def execute_python_module(root, module, *, command=None, timeout=300):
    command = command or python_module_command(module)
    began = time.monotonic(); root = Path(root)
    scratch = root / 'Vault/tmp'; scratch.mkdir(parents=True, exist_ok=True)
    result = {'module':module, 'command':command, 'exit_code':'CANCELLED', 'output':b''}
    with tempfile.TemporaryDirectory(dir=scratch, prefix='native-python-') as temporary:
        environment = dict(os.environ, TMPDIR=temporary)
        result['temporary_directory_sha256'] = native.digest(temporary.encode())
        if not _PYTHON_CANCELLED.is_set():
            process = subprocess.Popen(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       env=environment, start_new_session=True)
            with _PYTHON_LOCK: _PYTHON_ACTIVE.add(process)
            if _PYTHON_CANCELLED.is_set(): _stop_python_group(process)
            streams = [[], []]; size = 0; lock = threading.Lock(); overflow = threading.Event(); reader_error = threading.Event()
            def collect(index, pipe):
                nonlocal size
                try:
                    while True:
                        chunk = pipe.read(65536)
                        if not chunk: break
                        with lock:
                            if size + len(chunk) > _PYTHON_OUTPUT_LIMIT:
                                overflow.set()
                            elif not overflow.is_set():
                                streams[index].append(chunk); size += len(chunk)
                        if overflow.is_set(): _stop_python_group(process)
                except Exception:
                    reader_error.set()
                    try: _stop_python_group(process)
                    except OSError: pass
                finally: pipe.close()
            readers = [threading.Thread(target=collect,args=(index,pipe),daemon=True)
                       for index,pipe in enumerate((process.stdout,process.stderr))]
            for reader in readers: reader.start()
            try:
                try: result['exit_code'] = process.wait(timeout=timeout)
                except subprocess.TimeoutExpired:
                    result['exit_code'] = 'TIMEOUT'; _stop_python_group(process)
                    process.wait(timeout=5)
                for reader in readers: reader.join(timeout=5)
                if any(reader.is_alive() for reader in readers):
                    _stop_python_group(process, True)
                    for reader in readers: reader.join(timeout=5)
                    result['exit_code'] = 'PIPE_CLEANUP_ERROR'
                if overflow.is_set(): result['exit_code'] = 'OUTPUT_LIMIT'
                if reader_error.is_set(): result['exit_code'] = 'PIPE_READER_ERROR'
                if _PYTHON_CANCELLED.is_set(): result['exit_code'] = 'CANCELLED'
                result['output'] = b''.join(streams[0])+b'\n'+b''.join(streams[1])
            finally:
                if process.poll() is None: _stop_python_group(process, True); process.wait()
                with _PYTHON_LOCK:
                    _PYTHON_ACTIVE.discard(process); _PYTHON_STOPPING.discard(process)
    result['wall_ms'] = round((time.monotonic()-began)*1000,3)
    return result


def python_category_output(before, results, *, unchanged=True):
    if [row['module'] for row in results] != list(PYTHON_MODULES):
        raise ValueError('Complete fixed Python modules required')
    frames = []; summaries = []
    passed = unchanged
    for row in results:
        raw = row['output']
        if len(raw) > _PYTHON_OUTPUT_LIMIT + 1: raise ValueError('Python output bound changed')
        count = re.findall(rb'Ran ([1-9][0-9]*) tests? in', raw)
        tests = int(count[-1]) if count else 0
        passed = passed and complete(python_module_command(row['module']), raw, row['exit_code'])
        frames.append(b'BOC_PYTHON_MODULE '+row['module'].encode()+b' '+str(len(raw)).encode()+b'\n'+raw)
        summaries.append({key:row[key] for key in ('module','command','exit_code','wall_ms','temporary_directory_sha256')} |
                         {'tests':tests,'output_sha256':native.digest(raw)})
    report = {'source':before['source'],'tree':before['tree'],'runtime_sha256':native.digest(native.encoded(before['runtime'])),
              'modules':summaries,'concurrency':3,'status':'PASS' if passed else 'REJECT'}
    return b''.join(frames)+native.encoded({'python_category':report})+b'\n', 0 if passed else 1


def run_python_category(root, executor=execute_python_module, *, reset=True):
    if reset: _PYTHON_CANCELLED.clear()
    before = native.identity(root)
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(executor, root, module) for module in PYTHON_MODULES]
        results = []
        for module, future in zip(PYTHON_MODULES, futures):
            try: results.append(future.result())
            except Exception:
                results.append({'module':module,'command':python_module_command(module),'exit_code':'EXECUTION_ERROR',
                                'output':b'Fixed Python module execution failed.\n','wall_ms':0,
                                'temporary_directory_sha256':'0'*64})
    for row in results:
        path = directory(root)/(native.digest(row['output'])+'.log')
        with _OUTPUT_LOCK:
            if not path.exists(): native.private_write(path,row['output'])
    try: unchanged = native.identity(root) == before and not _PYTHON_CANCELLED.is_set()
    except (ValueError, OSError, subprocess.SubprocessError): unchanged = False
    return python_category_output(before,results,unchanged=unchanged)


def python_category_report(output, expected=None):
    try:
        remaining = output; originals = []
        for module in PYTHON_MODULES:
            header,remaining = remaining.split(b'\n',1)
            prefix = b'BOC_PYTHON_MODULE '+module.encode()+b' '
            if not header.startswith(prefix): raise ValueError()
            size = int(header[len(prefix):])
            if not 0 < size <= _PYTHON_OUTPUT_LIMIT+1 or len(remaining)<size: raise ValueError()
            originals.append(remaining[:size]);remaining=remaining[size:]
        envelope = json.loads(remaining)
        if set(envelope) != {'python_category'}: raise ValueError()
        report = envelope['python_category']
        if set(report) != {'source','tree','runtime_sha256','modules','concurrency','status'}: raise ValueError()
        if (report['status']!='PASS' or type(report['concurrency']) is not int or report['concurrency']!=3
                or len(report['modules'])!=3 or not re.fullmatch('[0-9a-f]{40}',report['source'])
                or not re.fullmatch('[0-9a-f]{40}',report['tree'])
                or not re.fullmatch('[0-9a-f]{64}',report['runtime_sha256'])): raise ValueError()
        if expected is not None and (report['source']!=expected['source'] or report['tree']!=expected['tree']
                or report['runtime_sha256']!=native.digest(native.encoded(expected['runtime']))): raise ValueError()
        for module,row,raw in zip(PYTHON_MODULES,report['modules'],originals):
            if set(row) != {'module','command','exit_code','wall_ms','temporary_directory_sha256','tests','output_sha256'}: raise ValueError()
            count=re.findall(rb'Ran ([1-9][0-9]*) tests? in',raw)
            if (row['module']!=module or row['command']!=python_module_command(module)
                    or type(row['exit_code']) is not int or row['exit_code']!=0
                    or row['output_sha256']!=native.digest(raw) or not count
                    or type(row['tests']) is not int or row['tests']!=int(count[-1])
                    or type(row['wall_ms']) not in (int,float) or not 0<=row['wall_ms']<=305000
                    or not re.fullmatch('[0-9a-f]{64}',row['temporary_directory_sha256'])
                    or not complete(python_module_command(module),raw,row['exit_code'])): raise ValueError()
        return report
    except (ValueError, KeyError, TypeError, AttributeError, IndexError):
        raise ValueError('Exact complete Python module proof missing or changed')


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
    if 'python-category' in command:
        try: python_category_report(output)
        except ValueError: return False
        return True
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
    path = max(paths, key=lambda item: max(row['completed_at'] for row in json.loads(item.read_bytes())['runs']))
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
    if value.get('scheduling') != scheduling(CHECKS):
        raise ValueError('Fixed scheduling contract changed')
    if [row['command'] for row in value['runs']] != CHECKS:
        raise ValueError('Fixed command category changed')
    for failure in directory(root).glob('*.failure.json'):
        record = json.loads(failure.read_bytes())
        if (record.get('identity') == current and record.get('runs')
                and max(row['completed_at'] for row in record['runs']) > max(row['completed_at'] for row in value['runs'])):
            raise ValueError('A later failed execution supersedes this receipt')
    for row in value['runs']:
        path = directory(root) / (row['output_sha256'] + '.log')
        if path.is_symlink() or path.stat().st_mode & 0o077:
            raise ValueError('Unsafe command output')
        output = path.read_bytes()
        if native.digest(output) != row['output_sha256'] or not complete(row['command'], output, row['exit_code']):
            raise ValueError('Original command output changed or is incomplete')
        if row['command']==['node','scripts/check-customer-data.mjs']:privacy_report(output)
        if row['command']==['node','scripts/check-publication-history.mjs']:history_report(output, value['base'], current['source'])
        if row['command']==PYTHON_CHECK:python_category_report(output, current)
    return dict(value, sha256=checksum)


def privacy_report(output):
    try:
        reports=[json.loads(line)['privacy_coverage'] for line in output.splitlines()
                 if line.startswith(b'{"privacy_coverage":')]
    except (ValueError, KeyError):
        reports=[]
    if len(reports)!=1 or not isinstance(reports[0],dict):
        raise ValueError('Native privacy report missing or malformed')
    report=reports[0]
    if (type(report.get('io_threads')) is not int or report['io_threads']!=8 or
            type(report.get('compact_persistence_bytes')) is not int or report['compact_persistence_bytes']!=65536 or
            any(type(report.get(key)) is not int or not 0<=report[key]<=8
                for key in ('max_active_persistence','max_awaiting_persistence'))):
        raise ValueError('Native privacy I/O or persistence bounds changed')
    return report


def scheduling(commands):
    return ('source-prepared-privacy-snapshot-parallel/1' if len(commands) in (8, 9) and
            (len(commands) == 8 or commands[8] == ['node', 'scripts/check-publication-history.mjs']) and
            commands[4] == ['node', 'scripts/check-customer-data.mjs'] and
            commands[5] == ['npm', 'run', 'check:publication'] and
            commands[6][:3] == ['node', '--test', '--test-reporter=tap'] and
            'unittest' in commands[7] else 'serial/1')


def execute_check(root, command, ready=None, history=None):
    began = time.time()
    try:
        if ready is None:
            environment = dict(os.environ)
            if history is not None:
                environment.update(BOC_PUBLICATION_BASE=history[0], BOC_PUBLICATION_SOURCE=history[1])
            if command == PYTHON_CHECK:
                process = subprocess.Popen(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=environment)
                try:
                    stdout, stderr = process.communicate(timeout=300)
                    code = process.returncode
                except subprocess.TimeoutExpired:
                    # The category's TERM handler drains/kills its isolated
                    # groups. Preserve the original 300-second deadline.
                    process.terminate()
                    try: stdout, stderr = process.communicate(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill(); stdout, stderr = process.communicate()
                    code = 'TIMEOUT'
                output = stdout + b'\n' + stderr
            else:
                result = subprocess.run(command, cwd=root, capture_output=True, timeout=300, env=environment)
                output, code = result.stdout + b'\n' + result.stderr, result.returncode
        else:
            fd, token = ready
            environment = dict(os.environ, BOC_PRIVACY_READY_FD=str(fd), BOC_PRIVACY_READY_TOKEN=token, UV_THREADPOOL_SIZE="8")
            try:
                process = subprocess.Popen(command, cwd=root, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                           env=environment, pass_fds=(fd,))
            finally:
                os.close(fd)
            try:
                stdout, stderr = process.communicate(timeout=300)
                output, code = stdout + b'\n' + stderr, process.returncode
            except subprocess.TimeoutExpired:
                process.kill(); stdout, stderr = process.communicate()
                output, code = stdout + b'\n' + stderr, 'TIMEOUT'
    except subprocess.TimeoutExpired as error:
        output, code = (error.stdout or b'') + b'\n' + (error.stderr or b''), 'TIMEOUT'
    except OSError as error:
        output, code = str(error).encode(), 'EXECUTION_ERROR'
    checksum = native.digest(output)
    path = directory(root) / (checksum + '.log')
    with _OUTPUT_LOCK:
        if not path.exists():
            native.private_write(path, output)
    return {'command': command, 'exit_code': code, 'output_sha256': checksum,
            'started_at': began, 'completed_at': time.time()}


def await_privacy_snapshot(fd, token, before):
    with selectors.DefaultSelector() as selector:
        selector.register(fd, selectors.EVENT_READ)
        pending = b''; deadline = time.monotonic() + 10
        while b'\n' not in pending:
            if not selector.select(max(0, deadline-time.monotonic())):
                raise ValueError('Privacy snapshot readiness timed out')
            part = os.read(fd, 1025-len(pending))
            if not part or len(pending)+len(part)>1024:
                raise ValueError('Privacy snapshot readiness missing or oversized')
            pending += part
        row = json.loads(pending)
        if (set(row) != {'kind','token','source','tree','files','policy_sha256'} or
                row['kind'] != 'boc-privacy-snapshot-ready-v1' or row['token'] != token or
                row['source'] != before['source'] or row['tree'] != before['tree'] or
                type(row['files']) is not int or row['files'] < 1 or
                not re.fullmatch('[0-9a-f]{64}', row['policy_sha256'])):
            raise ValueError('Privacy snapshot readiness identity changed')
        return row


def run_category(root, commands, before, base=None):
    runs = []
    parallel = scheduling(commands) != 'serial/1'
    for command in commands[:4] if parallel else commands:
        row = execute_check(root, command); runs.append(row)
        if not complete(command, (directory(root)/(row['output_sha256']+'.log')).read_bytes(), row['exit_code']):
            return runs
    if not parallel:
        return runs
    read_fd, write_fd = os.pipe(); token = secrets.token_hex(32)
    with ThreadPoolExecutor(max_workers=4) as pool:
        privacy = pool.submit(execute_check, root, commands[4], (write_fd, token))
        try:
            snapshot = await_privacy_snapshot(read_fd, token, before)
        except Exception as error:
            runs.append(privacy.result())
            # A malformed/missing snapshot never starts the independent suites.
            row = runs[-1]; original=(directory(root)/(row['output_sha256']+'.log')).read_bytes()
            output=original+b'\n'+str(error).encode(); checksum=native.digest(output)
            path=directory(root)/(checksum+'.log')
            if not path.exists():native.private_write(path,output)
            row.update(exit_code='READINESS_ERROR',output_sha256=checksum)
            return runs
        finally:
            os.close(read_fd)
        others = [pool.submit(execute_check, root, command, None, (base, before['source']))
                  if command == ['node', 'scripts/check-publication-history.mjs'] else
                  pool.submit(execute_check, root, command) for command in commands[5:]]
        runs.extend([privacy.result(), *(future.result() for future in others)])
    privacy_output=(directory(root)/(runs[4]['output_sha256']+'.log')).read_bytes()
    try:
        report=privacy_report(privacy_output)
        matches=all(report.get(key)==snapshot[value] for key,value in
                    [('source_commit','source'),('source_tree','tree'),('files','files'),('policy_sha256','policy_sha256')])
    except ValueError:
        matches=False
    if not matches:runs[4]['exit_code']='SNAPSHOT_RESULT_MISMATCH'
    if commands[7] == PYTHON_CHECK:
        row = runs[7]
        try: python_category_report((directory(root)/(row['output_sha256']+'.log')).read_bytes(), before)
        except ValueError: row['exit_code'] = 'PYTHON_RESULT_MISMATCH'
    if len(commands) == 9:
        row = runs[8]
        try: history_report((directory(root)/(row['output_sha256']+'.log')).read_bytes(), base, before['source'])
        except ValueError: row['exit_code'] = 'HISTORY_RESULT_MISMATCH'
    return runs


def history_report(output, base, source):
    try:
        reports = [json.loads(line)['publication_history'] for line in output.splitlines()
                   if line.startswith(b'{"publication_history":')]
        if len(reports) != 1: raise ValueError()
        row = reports[0]
        if set(row) != {'base','source','status','pairs','inventory_sha256','policy_sha256','findings','classifications'} or row['findings'] != []:
            raise ValueError()
        classifications = row['classifications']
        if not isinstance(classifications, list) or len(classifications) > 1:
            raise ValueError()
        for item in classifications:
            expected = {'path_sha256': hashlib.sha256(b'scripts/lib/runtime-skill-export.mjs').hexdigest(),
                        'blob':'7dab470bc8e3a1f647a2d2a5ec094e48be25f401',
                        'sha256':'49ae97294c1c9e0b3fa09ca0dba20603e2d02685fa5a65aee3fc847f9b4db242',
                        'kind':'exact_public_git_ssh_protocol_user','literal_count':1}
            if item != expected or type(item.get('literal_count')) is not int:
                raise ValueError()
        if (row['base'] != base or row['source'] != source or row['status'] != 'PASS'
                or type(row['pairs']) is not int or row['pairs'] < 1
                or not re.fullmatch('[0-9a-f]{64}', row['inventory_sha256'])
                or not re.fullmatch('[0-9a-f]{64}', row['policy_sha256'])): raise ValueError()
        return row
    except (ValueError, KeyError, TypeError):
        raise ValueError('Exact complete publication history proof missing or changed')


def validate(root, base, requested_at):
    start = None if requested_at == 'unknown' else datetime.fromisoformat(requested_at.replace('Z', '+00:00'))
    if start is not None and (start.tzinfo is None or start > datetime.now(timezone.utc)):
        raise ValueError('Original timezone-aware request time is required')
    before = native.identity(root)
    paths = scope(root, base, before['source'])
    if not CHECKS:
        raise ValueError('Fixed package check category is empty')
    runs = run_category(root, CHECKS, before, base)
    if any(not complete(row['command'], (directory(root) / (row['output_sha256'] + '.log')).read_bytes(), row['exit_code']) for row in runs):
        native.private_write(directory(root) / (str(time.time_ns()) + '.failure.json'),
                             native.encoded({'kind': KIND + '-failure', 'identity': before,
                                             'base': base, 'request_started_at': requested_at, 'runs': runs}))
        raise ValueError('Required package check failed; original outputs retained: ' + str(directory(root)))
    if native.identity(root) != before:
        raise ValueError('Source, generated package or runtime changed during verification')
    value = {'kind': KIND, 'profile': PROFILE, 'status': 'VERIFIED', **before,
             'base': base, 'paths': paths, 'runs': runs, 'scheduling': scheduling(CHECKS), 'request_started_at': requested_at,
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


def effect(root, command, value):
    began = time.time()
    try:
        result = subprocess.run(command, cwd=root, capture_output=True, timeout=120)
        output, code = result.stdout + b'\n' + result.stderr, result.returncode
    except subprocess.TimeoutExpired as error:
        output, code = (error.stdout or b'') + b'\n' + (error.stderr or b''), 'TIMEOUT'
    checksum = native.digest(output)
    path = directory(root) / (checksum + '.log')
    if not path.exists():
        native.private_write(path, output)
    record = {'kind': KIND + '-publication-attempt', 'source': value['source'],
              'tree': value['tree'], 'base': value['base'], 'command': command,
              'exit_code': code, 'output_sha256': checksum,
              'started_at': began, 'completed_at': time.time()}
    native.private_write(directory(root) / (str(time.time_ns()) + '.publication.json'), native.encoded(record))
    if code != 0:
        raise ValueError('Git publication failed; original attempt retained: ' + str(path))


def publish(root, ref, pr=None):
    if pr is not None and not re.fullmatch('[1-9][0-9]*', str(pr)):
        raise ValueError('Exact numeric pull request identity required')
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
        effect(root, ['git', 'push', remote, value['source'] + ':refs/heads/' + ref], value)
        observed = native.git(root, 'ls-remote', remote, 'refs/heads/' + ref).split()
        if not observed or observed[0] != value['source']:
            raise ValueError('Release branch publication was not confirmed; read state before retrying')
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
        effect(root, ['gh', 'pr', 'merge', str(pr), '--repo', native.REPOSITORY,
                      '--merge', '--match-head-commit', value['source']], value)
        merged = native.git(root, 'ls-remote', remote, 'refs/heads/main').split()[0]
        native.git(root, 'fetch', 'origin')
        if native.git(root, 'rev-parse', merged + '^{tree}') != value['tree']:
            raise ValueError('Published main tree differs from verified package')
    return {'status': 'RELEASE_SOURCE_PUSHED' if pr is None else 'RELEASE_MERGED',
            'source': value['source'], 'deployment_authorized': False}


def github_read(path):
    request = urllib.request.Request('https://api.github.com/repos/' + native.REPOSITORY + path,
                                     headers={'Accept': 'application/vnd.github+json',
                                              'User-Agent': 'bos-deterministic-package'})
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def ci_observation(source, ref, read=github_read):
    """Consume actual repository-owned Actions execution, never a supplied PASS."""
    data = read('/actions/runs?event=push&head_sha=' + source + '&per_page=100')
    if data.get('total_count', 0) > 100:
        raise ValueError('Actions result set is incomplete')
    runs = [run for run in data.get('workflow_runs', [])
            if run.get('path') == '.github/workflows/publication-safety.yml'
            and run.get('head_sha') == source and run.get('head_branch') == ref
            and run.get('event') == 'push'
            and run.get('repository', {}).get('full_name') == native.REPOSITORY
            and run.get('head_repository', {}).get('full_name') == native.REPOSITORY]
    if not runs:
        raise ValueError('Exact-source repository Actions execution is not available yet')
    run = max(runs, key=lambda row: int(row['id']))
    if run.get('status') != 'completed' or run.get('conclusion') != 'success':
        raise ValueError('Latest exact-source repository CI is not successful: ' + str(run.get('status'))
                         + '/' + str(run.get('conclusion')))
    identity = run['id']
    if not isinstance(identity, int) or identity <= 0:
        raise ValueError('Invalid Actions execution identity')
    jobs = read('/actions/runs/' + str(identity) + '/jobs?filter=latest&per_page=100')
    if jobs.get('total_count') != len(jobs.get('jobs', [])):
        raise ValueError('Actions job evidence is incomplete')
    relevant = [job for job in jobs['jobs'] if job.get('name') == 'verify-public-repository']
    if len(relevant) != 1 or relevant[0].get('conclusion') != 'success':
        raise ValueError('Required repository verification job did not succeed')
    step = [step for step in relevant[0].get('steps', [])
            if step.get('name') == 'Verify the fixed deterministic source or skill-package category']
    if len(step) != 1 or step[0].get('conclusion') != 'success':
        raise ValueError('Fixed deterministic category has no successful native execution')
    return {'run': run, 'jobs': jobs}


def verify_published(root, source, read=github_read):
    """Accept a published main commit by its exact-source deterministic CI evidence.

    The commit must be on origin/main and its version-bound release branch must
    carry a successful repository-owned run of the fixed deterministic step for
    that exact SHA (the same evidence promote requires before publishing)."""
    if not re.fullmatch('[0-9a-f]{40}', source or ''):
        raise ValueError('Exact 40-character published commit required')
    native.git(root, 'merge-base', '--is-ancestor', source, 'origin/main')
    version = json.loads(blob(root, source, 'package.json'))['version']
    observation = ci_observation(source, 'codex/release-v' + version, read)
    return {'status': 'PUBLISHED_VERIFIED', 'source': source, 'version': version,
            'run': observation['run']['id']}


def promote(root, ref):
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
    branch = native.git(root, 'ls-remote', remote, 'refs/heads/' + ref).split()
    if not branch or branch[0] != value['source']:
        raise ValueError('Remote release ref differs from the verified source')
    observed = ci_observation(value['source'], ref)
    native.private_write(directory(root) / (str(time.time_ns()) + '.remote.json'), native.encoded(observed))
    read_receipt(root)
    if native.git(root, 'ls-remote', remote, 'refs/heads/main').split()[0] != value['base']:
        raise ValueError('Publication base moved; integrate and revalidate')
    # Ordinary fast-forward push; server protection and rejection remain active.
    effect(root, ['git', 'push', remote, value['source'] + ':refs/heads/main'], value)
    actual = native.git(root, 'ls-remote', remote, 'refs/heads/main').split()
    if not actual or actual[0] != value['source']:
        raise ValueError('Main publication was not confirmed; read state before retrying')
    return {'status': 'RELEASE_PUBLISHED', 'source': value['source'],
            'ci_run_id': observed['run']['id'], 'deployment_authorized': False}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['validate', 'verify', 'push', 'merge', 'promote', 'ci',
                                           'verify-published', 'python-category'])
    parser.add_argument('component', nargs='?')
    parser.add_argument('--base')
    parser.add_argument('--requested-at')
    parser.add_argument('--ref')
    parser.add_argument('--pr')
    parser.add_argument('--source')
    args = parser.parse_args(argv)
    root = Path(native.git(Path.cwd(), 'rev-parse', '--show-toplevel'))
    if args.action == 'python-category':
        if args.component != 'unittest' or any((args.base,args.requested_at,args.ref,args.pr,args.source)):
            raise ValueError('Exact fixed Python category required')
        _PYTHON_CANCELLED.clear()
        signal.signal(signal.SIGTERM, cancel_python_category)
        signal.signal(signal.SIGINT, cancel_python_category)
        output, code = run_python_category(root, reset=False)
        sys.stdout.buffer.write(output); sys.stdout.buffer.flush()
        return code
    if args.component is not None: raise ValueError('Unexpected category component')
    if args.action in {'validate', 'ci'}:
        requested = (datetime.now(timezone.utc).isoformat() if args.action == 'ci' else
                     args.requested_at or os.environ.get('BOS_REVIEW_STARTED_AT') or 'unknown')
        if not args.base:
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
    elif args.action == 'verify-published':
        value = verify_published(root, args.source)
    elif args.action == 'promote':
        value = promote(root, args.ref)
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
