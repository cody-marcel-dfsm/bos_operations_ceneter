"""Private IA-014 collector and conjunctive original-evidence verifier.

No deployment, source approval, credential export or paid fallback.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
import time
import uuid
import native_auth_evidence as evidence
import native_auth_issuer as issuer
import native_auth_observation as observation
import native_auth_semantics as semantics

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = 'bos.native-auth-acceptance/v2'
OBLIGATIONS, UI = semantics.OBLIGATIONS, semantics.UI
canonical, digest = evidence.canonical, evidence.digest
MAX_AGE_SECONDS = 1800
PROOF_PATHS = ('tools/native_auth_acceptance.py', 'tools/native_auth_evidence.py',
    'tools/native_auth_observation.py', 'tools/native_auth_semantics.py',
    'scripts/verify-codex-runtime.mjs', 'scripts/lib/product-mcp-contract.mjs',
    'scripts/lib/client-runtime-verification.mjs', 'scripts/lib/package-model.mjs',
    'scripts/native-auth-multi-context-proof.mjs',
    'source/platform/bos-mcp-client/scripts/context-selection.mjs',
    'products/bos/product.json', 'products/education-center/product.json',
    'contracts/identity-context-compatibility.v1.json', 'contracts/codex-login-surface.v1.json')
SEMANTIC_PATHS = ('tools/native_auth_issuer.py', 'tools/native_auth_acceptance.py',
    'tools/native_auth_evidence.py', 'tools/native_auth_observation.py', 'tools/native_auth_semantics.py')


def implementation(role):
    paths = set(PROOF_PATHS if role == 'proof' else SEMANTIC_PATHS)
    if role == 'proof':
        # The existing native inspector loads the product catalog and these
        # helpers transitively; enrolling only its entry file is insufficient.
        for pattern in ('scripts/lib/**/*.mjs', 'products/*/product.json', 'contracts/*.json'):
            paths.update(str(path.relative_to(ROOT)) for path in ROOT.glob(pattern))
        paths.update(('package.json', 'package-lock.json'))
    return evidence.implementation(ROOT, sorted(paths))


def binding(value):
    evidence.closed(value, {'commit', 'revision', 'image', 'client', 'package_version', 'connection'}, 'Binding')
    if any(not isinstance(item, str) or not item.strip() or len(item) > 512 for item in value.values()):
        raise ValueError('Exact deployed source/revision/image/client/package/connection binding required')
    if not re.fullmatch('[0-9a-f]{40}', value['commit']) or not re.fullmatch(r'[^\s@]+@sha256:[0-9a-f]{64}', value['image']):
        raise ValueError('Full source commit and immutable image required')
    if value['client'] != 'codex':
        raise ValueError('No enrolled native collector for this client')
    return value


def target():
    return observation.target(evidence.json_bytes(evidence.regular(evidence.owner_directory(ROOT) / 'target.json')))


def enrollment(role, configured_target):
    configured_target = observation.target(configured_target)
    owner = evidence.owner_directory(ROOT)
    owner.mkdir(parents=True, exist_ok=True, mode=0o700)
    path = owner / 'target.json'
    if path.exists():
        if target() != configured_target:
            raise ValueError('Native deployment target already enrolled differently')
    else:
        evidence.write_once(path, canonical(configured_target))
    return evidence.enroll(ROOT, role, implementation(role))


def new_run(prefix):
    directory = evidence.owner_directory(ROOT) / f'{prefix}-{uuid.uuid4().hex}'
    directory.mkdir(mode=0o700)
    return directory


def names(directory):
    return sorted(path.name for path in directory.iterdir() if path.name != 'capture.json')


def observed_binding(deployment, native):
    return {**{key: deployment[key] for key in ('commit', 'revision', 'image')},
            **{key: native[key] for key in ('client', 'package_version', 'connection')}}


def write_capture(directory, role, payload):
    payload = {'schema': SCHEMA, **payload, 'run': directory.name,
               'implementation': implementation(role), 'files': evidence.inventory(directory, names(directory))}
    evidence.write_once(directory / 'capture.json', canonical(evidence.seal(ROOT, role, payload, implementation(role))))
    return payload


def authenticate_run(directory, role):
    directory = evidence.run_directory(ROOT, directory)
    capture = evidence.authenticate(ROOT, role,
        evidence.json_bytes(evidence.regular(directory / 'capture.json')), implementation(role))
    if (capture.get('schema') != SCHEMA or capture.get('run') != directory.name or
            capture.get('implementation') != implementation(role) or
            capture.get('files') != evidence.inventory(directory, names(directory))):
        raise ValueError('Original native inventory, source or run changed')
    timestamp = capture.get('observed_at')
    if type(timestamp) not in (int, float) or not 0 <= time.time() - timestamp <= MAX_AGE_SECONDS:
        raise ValueError('Native observation is stale or in the future')
    if capture.get('target') != target():
        raise ValueError('Native target enrollment changed')
    return directory, capture


def read_json(directory, name):
    return evidence.json_bytes(evidence.regular(directory / name))


def read_events(directory, name):
    return [evidence.json_bytes(line) for line in evidence.regular(directory / name).splitlines() if line.strip()]


def verify_observed_identity(directory, capture, expected):
    enrolled = target()
    deployment = observation.deployment_identity(
        read_json(directory, 'service-before-stdout.log'), read_json(directory, 'revision-stdout.log'),
        read_json(directory, 'service-after-stdout.log'), enrolled)
    native = observation.native_identity(read_json(directory, 'runtime-stdout.log'),
        evidence.regular(directory / 'client-version-stdout.log').decode(), enrolled)
    if capture.get('deployment') != deployment or capture.get('native') != native or observed_binding(deployment, native) != binding(expected):
        raise ValueError('Requested identity differs from original observed deployment/client/package/connection')
    product = evidence.json_bytes(evidence.regular(ROOT / 'products/bos/product.json'))
    if native['package_version'] != product['version']:
        raise ValueError('Installed package differs from the source-bound product')
    for prefix in ('service-before', 'revision', 'service-after', 'runtime', 'client-version', 'synthetic', 'native'):
        result = read_json(directory, prefix + '-process.json')
        if result.get('exit_code') != 0 or result.get('failure') is not None:
            raise ValueError('An original producer operation did not complete')
    wanted = {'schema': 'bos.native-synthetic-context-proof/v1', 'synthetic_only': True, 'status': 'PASSED',
        'checks': ['sequential_return', 'parallel_selection', 'combined_attribution', 'foreign_target',
                   'foreign_role', 'handle_preference_denied', 'removed_context_denied']}
    if read_json(directory, 'synthetic-stdout.log') != wanted:
        raise ValueError('Owned synthetic context boundary proof did not complete')
    return deployment, native


def proof(directory, expected):
    directory, capture = authenticate_run(directory, 'proof')
    if capture.get('binding') != binding(expected):
        raise ValueError('Proof requested a different deployment binding')
    if capture.get('failure') is not None:
        return directory, capture, None, {}
    verify_observed_identity(directory, capture, expected)
    if read_json(directory, 'request.json') != {'binding': expected, 'nonce': capture['nonce'], 'obligations': list(OBLIGATIONS)}:
        raise ValueError('Original proof request changed')
    result = read_json(directory, 'result.json')
    evaluation, images = semantics.evaluate(expected, result, read_events(directory, 'native-stdout.log'),
                                             capture['nonce'], capture['native']['connection'])
    return directory, capture, evaluation, images


COLLECTOR_PROMPT = '''Perform only the authorized Operations Center native IA-014 acceptance.
This is native runtime verification, never a build, deployment or source review.
Use the existing one host-managed BOS connection. Never export credentials, use
raw credential HTTP, invent a connection, edit capture files or mutate customer
data. Current source-bound synthetic multi-organization tests run separately;
Additional live organization connections are not required. Native sequential/parallel/
combined cases use the selected authorized context and attribute each result.
Use bos_get_context and bos_list_context_tools for read-only control-plane proof;
preserve original event IDs and starts/completions. Do not use unrelated business
calls as proof. Negative authority/revocation/refresh/migration cases require the
actual scoped authorized fixture and true server results; unavailable fixture is
OPEN. Native authentication/recovery requires distinct original native-client UI
before/action/after pixels plus authenticated discovery. Browser-only protocol
pages are insufficient. Do not sign out or revoke the user's current connection
without an authorized isolated acceptance session. No permission is implied to do
so. All thirteen rows stay present. Unknown/unsupported controls stay OPEN, never
fabricated PASSED. Return only the closed schema with the original nonce and
binding digest. Every PASSED row cites distinct relevant original tool event IDs.
'''


def collect(expected):
    binding(expected)
    evidence.enrolled(ROOT, 'proof', implementation('proof'))
    configured, directory, nonce = target(), new_run('proof'), uuid.uuid4().hex
    request = {'binding': expected, 'nonce': nonce, 'obligations': list(OBLIGATIONS)}
    evidence.write_once(directory / 'request.json', canonical(request))
    evidence.write_once(directory / 'schema.json', canonical(semantics.schema()))
    payload = {'binding': expected, 'nonce': nonce, 'observed_at': time.time(), 'target': configured,
               'deployment': None, 'native': None, 'failure': None}
    try:
        payload['deployment'] = observation.observe_deployment(ROOT, directory, configured)
        payload['native'] = observation.observe_native(ROOT, directory, configured)
        if observed_binding(payload['deployment'], payload['native']) != expected:
            raise ValueError('Original observed identity differs from expected release')
        observation.process(['node', 'scripts/native-auth-multi-context-proof.mjs'], directory,
                            'synthetic', cwd=ROOT, timeout=30)
        args = ['codex', 'exec', '--ephemeral', '--json', '--sandbox', 'read-only', '--cd', str(ROOT),
                '--model', issuer.MODEL, '-c', 'model_reasoning_effort="medium"',
                '--output-schema', str(directory / 'schema.json'),
                '--output-last-message', str(directory / 'result.json'), '-']
        prompt = COLLECTOR_PROMPT + '\n' + json.dumps({**request, 'binding_sha256': digest(canonical(expected)),
            'original_capture_path': str(directory / 'native-stdout.log')})
        observation.process(args, directory, 'native', cwd=ROOT, timeout=600, stdin=prompt.encode())
    except (ValueError, OSError) as error:
        payload['failure'] = type(error).__name__  # Private originals retain diagnostics; no secret echo.
    write_capture(directory, 'proof', payload)
    return directory


def semantic_request(proof_directory, capture, expected, nonce, images):
    raw_events = read_events(proof_directory, 'native-stdout.log')
    for event in raw_events:
        for part in (event.get('item', {}).get('result') or {}).get('content', []):
            if isinstance(part, dict) and part.get('type') == 'image':
                part['data'] = '[original image attached separately]'
    return {'nonce': nonce, 'binding_sha256': digest(canonical(expected)),
        'proof_run': proof_directory.name, 'inventory_sha256': digest(canonical(capture['files'])),
        'observed_identity': {'deployment': capture['deployment'], 'native': capture['native']},
        'original_collector_assessment': read_json(proof_directory, 'result.json'),
        'original_events': raw_events,
        'images': [{key: entry[key] for key in ('event_id', 'sha256')} for entry in images.values()],
        'synthetic_context_proof': read_json(proof_directory, 'synthetic-stdout.log'), 'obligations': list(OBLIGATIONS)}


def assess(directory, expected):
    evidence.enrolled(ROOT, 'semantic', implementation('semantic'))
    directory, capture, evaluated, images = proof(directory, expected)
    if evaluated is None:
        raise ValueError('Incomplete proof cannot be semantically assessed')
    semantic_directory, nonce = new_run('semantic'), uuid.uuid4().hex
    request = semantic_request(directory, capture, expected, nonce, images)
    payload = {'binding': expected, 'nonce': nonce, 'observed_at': time.time(), 'target': target(),
               'proof_run': directory.name, 'inventory_sha256': request['inventory_sha256'],
               'observed_identity': request['observed_identity'], 'failure': None}
    try:
        issuer.assess(ROOT, semantic_directory, request, images)
    except (ValueError, OSError) as error:
        payload['failure'] = type(error).__name__
    write_capture(semantic_directory, 'semantic', payload)
    return semantic_directory


def verify(directory, expected, semantic_directory=None):
    directory, capture, evaluated, images = proof(directory, expected)
    envelope = {'schema': SCHEMA, 'status': 'OPEN', 'accepted': False, 'binding': expected,
        'observed_identity': None if evaluated is None else {'deployment': capture['deployment'], 'native': capture['native']},
        'proof': {'run': directory.name, 'issuer': 'proof', 'implementation_sha256': digest(canonical(implementation('proof'))),
                  'receipt_sha256': digest(evidence.regular(directory / 'capture.json')),
                  'inventory_sha256': digest(canonical(capture['files']))},
        'semantic': None, 'checks': [] if evaluated is None else evaluated['checks'],
        'synthetic_only_checks': [] if evaluated is None else read_json(directory, 'synthetic-stdout.log')['checks'],
        'reason': 'Original proof incomplete' if evaluated is None else 'Independent semantic assessment required'}
    if evaluated is None or semantic_directory is None:
        return envelope
    semantic_directory, semantic_capture = authenticate_run(semantic_directory, 'semantic')
    if (semantic_capture.get('binding') != expected or semantic_capture.get('proof_run') != directory.name or
            semantic_capture.get('inventory_sha256') != envelope['proof']['inventory_sha256'] or
            semantic_capture.get('observed_identity') != envelope['observed_identity']):
        raise ValueError('Independent semantic result names another original inventory or observed identity')
    envelope['semantic'] = {'run': semantic_directory.name, 'issuer': 'semantic',
        'implementation_sha256': digest(canonical(implementation('semantic'))),
        'receipt_sha256': digest(evidence.regular(semantic_directory / 'capture.json')),
        'inventory_sha256': digest(canonical(semantic_capture['files']))}
    if semantic_capture.get('failure') is not None:
        envelope['reason'] = 'Independent semantic assessment incomplete'
        return envelope
    expected_request = semantic_request(directory, capture, expected, semantic_capture['nonce'], images)
    if read_json(semantic_directory, 'request.json') != expected_request:
        raise ValueError('Semantic issuer inputs differ from original proof observations')
    result = read_json(semantic_directory, 'result.json')
    process = read_json(semantic_directory, 'semantic-process.json')
    if process.get('exit_code') != 0 or process.get('failure') is not None:
        raise ValueError('Original semantic process did not complete')
    semantic_session, _ = semantics.original_session(read_events(semantic_directory, 'semantic-stdout.log'), result, tools_allowed=False)
    if semantic_session == evaluated['session_id'] or semantic_capture['nonce'] == capture['nonce']:
        raise ValueError('Semantic issuer must have an independent session and nonce')
    rows = semantics.checks(result, semantic_capture['nonce'], digest(canonical(expected)))
    original_calls = semantics.original_session(read_events(directory, 'native-stdout.log'), read_json(directory, 'result.json'))[1]
    if any(any(ref not in original_calls for ref in row['event_ids']) for row in rows):
        raise ValueError('Semantic result cites fabricated original observations')
    by_id = {row['id']: row for row in rows}
    for row in envelope['checks']:
        semantic = by_id[row['id']]
        if semantic['status'] == 'REJECTED' or (row['status'] != 'REJECTED' and semantic['status'] == 'OPEN'):
            row['status'], row['observed'] = semantic['status'], semantic['observed']
    envelope['status'] = ('REJECTED' if any(row['status'] == 'REJECTED' for row in envelope['checks']) else
                          'PASSED' if all(row['status'] == 'PASSED' for row in envelope['checks']) else 'OPEN')
    envelope['accepted'] = envelope['status'] == 'PASSED'
    envelope['reason'] = result['reason']
    return envelope


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('enroll', 'collect', 'assess', 'verify'))
    parser.add_argument('--binding', type=Path)
    parser.add_argument('--target', type=Path)
    parser.add_argument('--role', choices=('proof', 'semantic'))
    parser.add_argument('--run', type=Path)
    parser.add_argument('--semantic-run', type=Path)
    args = parser.parse_args()
    if args.operation == 'enroll':
        if args.target is None or args.role is None:
            parser.error('Explicit --role and --target required for independent enrollment')
        result = enrollment(args.role, evidence.json_bytes(evidence.regular(args.target)))
        print(json.dumps({'enrolled': args.role, 'implementation_sha256': digest(canonical(result['implementation']))}))
        return 0
    if args.binding is None:
        parser.error('--binding required')
    expected = binding(evidence.json_bytes(evidence.regular(args.binding)))
    if args.operation == 'collect':
        directory = collect(expected)
        print(json.dumps({'schema': SCHEMA, 'proof_run': str(directory), 'status': 'COLLECTED'}))
        return 0
    if args.run is None:
        parser.error('--run required')
    if args.operation == 'assess':
        directory = assess(args.run, expected)
        print(json.dumps({'schema': SCHEMA, 'semantic_run': str(directory), 'status': 'ASSESSED'}))
        return 0
    result = verify(args.run, expected, args.semantic_run)
    print(json.dumps(result))
    return 0 if result['accepted'] else 2


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(json.dumps({'schema': SCHEMA, 'status': 'OPEN', 'accepted': False,
                          'reason': type(error).__name__ + ': verification unavailable; inspect private original evidence'}))
        raise SystemExit(2)
