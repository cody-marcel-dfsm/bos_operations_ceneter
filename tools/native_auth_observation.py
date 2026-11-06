"""Fixed, read-only native/deployment observations for the private IA-014 owner."""
from __future__ import annotations

import json
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import time

import native_auth_evidence as evidence


def process(argv, directory, prefix, *, cwd, timeout=60, stdin=b'', limit=8 * 1024 * 1024):
    """Own a bounded child and retain exact argv, exit, original stdout/stderr.

    No caller-supplied command is exposed by the public CLI. Native captures are
    private; they are not a printable diagnostics channel.
    """
    if not 0 < timeout <= 600 or not 0 < limit <= evidence.MAX_FILE_BYTES:
        raise ValueError('Unsupported process bounds')
    evidence.write_once(directory / f'{prefix}-command.json', evidence.canonical(argv))
    evidence.write_once(directory / f'{prefix}-stdin.bin', stdin)
    env = dict(os.environ)
    env.pop('CODEX_THREAD_ID', None)
    started = time.monotonic()
    child = subprocess.Popen(argv, cwd=cwd, env=env, stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    buffers = {'stdout': bytearray(), 'stderr': bytearray()}
    outputs = {}
    for kind in buffers:
        path = directory / f'{prefix}-{kind}.log'
        evidence.write_once(path, b'')
        outputs[kind] = path.open('ab')
    selector = selectors.DefaultSelector()
    for stream, kind in ((child.stdout, 'stdout'), (child.stderr, 'stderr')):
        os.set_blocking(stream.fileno(), False)
        selector.register(stream, selectors.EVENT_READ, kind)
    # Inputs are bounded by the inventory; write asynchronously to avoid pipe deadlock.
    os.set_blocking(child.stdin.fileno(), False)
    selector.register(child.stdin, selectors.EVENT_WRITE, 'stdin')
    remaining = memoryview(stdin)
    failure = None
    try:
        while selector.get_map():
            if time.monotonic() - started > timeout:
                failure = 'timeout'
                break
            for item, _ in selector.select(0.1):
                if item.data == 'stdin':
                    if not remaining:
                        selector.unregister(item.fileobj)
                        item.fileobj.close()
                    else:
                        try:
                            count = os.write(item.fd, remaining[:65536])
                            remaining = remaining[count:]
                        except BrokenPipeError:
                            selector.unregister(item.fileobj)
                            item.fileobj.close()
                    continue
                chunk = os.read(item.fd, 65536)
                if not chunk:
                    selector.unregister(item.fileobj)
                    item.fileobj.close()
                elif len(buffers[item.data]) + len(chunk) > limit:
                    failure = 'output_bound'
                    break
                else:
                    buffers[item.data].extend(chunk)
                    outputs[item.data].write(chunk)
                    outputs[item.data].flush()
            if failure:
                break
    finally:
        if not failure and child.poll() is None:
            try:
                child.wait(timeout=max(0.01, timeout - (time.monotonic() - started)))
            except subprocess.TimeoutExpired:
                failure = 'timeout'
        if failure:
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        child.wait(timeout=5)
        selector.close()
        for stream in (child.stdin, child.stdout, child.stderr):
            if not stream.closed:
                stream.close()
        for stream in outputs.values():
            stream.close()
        result = {'exit_code': child.returncode, 'failure': failure,
                  'elapsed_seconds': round(time.monotonic() - started, 6)}
        evidence.write_once(directory / f'{prefix}-process.json', evidence.canonical(result))
    if failure or result['exit_code'] != 0:
        raise ValueError(f'Owned observation {prefix} did not complete; originals retained')
    return bytes(buffers['stdout'])


def target(value):
    evidence.closed(value, {'project', 'region', 'service', 'resource_url', 'server'}, 'Deployment target')
    for field in ('project', 'region', 'service'):
        if not isinstance(value[field], str) or not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,100}', value[field]):
            raise ValueError('Invalid enrolled deployment target')
    if value['resource_url'] != 'https://dfsm.ai/mcp/apps/bos/platform' or value['server'] != 'BOS-Platform':
        raise ValueError('Target must use the product-owned BOS resource and connection')
    return value


def serving(service):
    status = service.get('status', {})
    traffic = status.get('traffic', [])
    active = [row for row in traffic if row.get('percent', 0) > 0]
    if len(active) != 1 or active[0].get('percent') != 100:
        raise ValueError('Exactly one fully serving revision is required')
    row = active[0]
    revision = row.get('revisionName')
    if not revision and row.get('latestRevision') is True:
        revision = status.get('latestReadyRevisionName')
    if not isinstance(revision, str) or not re.fullmatch('[a-z0-9-]+', revision):
        raise ValueError('Actual serving revision is unresolved')
    return revision


def deployment_identity(before, revision, after, enrolled):
    target(enrolled)
    name = serving(before)
    if before != after or serving(after) != name:
        raise ValueError('Serving changed during the owned observation')
    if revision.get('metadata', {}).get('name') != name:
        raise ValueError('Revision observation names a different revision')
    source = revision.get('metadata', {}).get('labels', {}).get('source-commit')
    image = revision.get('status', {}).get('imageDigest')
    if not isinstance(source, str) or not re.fullmatch('[a-f0-9]{40}', source):
        raise ValueError('Observed source label is unavailable')
    if not isinstance(image, str) or not re.fullmatch(r'[^\s@]+@sha256:[a-f0-9]{64}', image):
        raise ValueError('Observed immutable image is unavailable')
    if not any(row.get('type') == 'Ready' and row.get('status') == 'True'
               for row in revision.get('status', {}).get('conditions', [])):
        raise ValueError('Serving revision is not Ready')
    return {'target': enrolled, 'commit': source, 'revision': name, 'image': image}


def observe_deployment(root, directory, enrolled):
    target(enrolled)
    flags = ['--project', enrolled['project'], '--region', enrolled['region'], '--quiet']
    command = ['gcloud', 'run', 'services', 'describe', enrolled['service'], *flags,
               '--format=json(metadata.uid,metadata.resourceVersion,status.traffic,status.latestReadyRevisionName)']
    before = evidence.json_bytes(process(command, directory, 'service-before', cwd=root, timeout=30))
    name = serving(before)
    revision = evidence.json_bytes(process(
        ['gcloud', 'run', 'revisions', 'describe', name, *flags,
         '--format=json(metadata.name,metadata.labels,status.imageDigest,status.conditions)'],
        directory, 'revision', cwd=root, timeout=30))
    after = evidence.json_bytes(process(command, directory, 'service-after', cwd=root, timeout=30))
    return deployment_identity(before, revision, after, enrolled)


def native_identity(inspected, version, enrolled):
    target(enrolled)
    entry = inspected.get('installed_products', {}).get('bos', {})
    binds = inspected.get('native_bindings', [])
    manifest = inspected.get('mcp_binding', {})
    if (inspected.get('resource_url') != enrolled['resource_url'] or
            len(binds) != 1 or binds[0].get('name') != enrolled['server'] or
            entry.get('state') != 'current' or manifest.get('state') != 'current' or
            manifest.get('server', {}).get('url') != enrolled['resource_url'] or
            not isinstance(entry.get('version'), str) or not entry['version']):
        raise ValueError('Current native registry and installed package binding are unavailable')
    if not re.fullmatch(r'codex-cli [a-zA-Z0-9.+_-]+\n?', version):
        raise ValueError('Native client version is not an observed supported CLI identity')
    return {'client': 'codex', 'client_version': version.strip(), 'package_version': entry['version'],
            'connection': binds[0]['name'], 'resource_url': enrolled['resource_url']}


def observe_native(root, directory, enrolled):
    version = process(['codex', '--version'], directory, 'client-version', cwd=root, timeout=15).decode()
    inspected = evidence.json_bytes(process(
        ['node', 'scripts/verify-codex-runtime.mjs', '--json'], directory, 'runtime', cwd=root, timeout=45))
    return native_identity(inspected, version, enrolled)
