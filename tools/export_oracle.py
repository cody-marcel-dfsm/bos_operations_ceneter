#!/usr/bin/env python3
"""Export the public Oracle from immutable Git blobs; never import its code."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import hmac
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
MAP = 'tools/oracle-public-export.json'
CONTROL = 'tools/export_oracle.py'
GENERATED = 'oracle-export-manifest.json'
GENERATION_INPUT = 'tools/validation-selection.json'
ARCHIVE = 'oracle-public.tar.gz'
RECEIPT = 'oracle-export-receipt.json'
REPOSITORY = 'https://github.com/cody-marcel-dfsm/bos_operations_ceneter'
CORE = ('__init__.py', 'cli.py', 'config.py', 'proposal.py', 'runner.py', 'context.py',
        'index.py', 'spec.py', 'seal.py', 'custody.py', 'lifecycle.py')
ASSETS = ('.github/workflows/ci.yml', '.gitignore', 'README.md', 'pyproject.toml', 'requirements.lock',
          'oracle.project.json', 'schemas/proposal-output.schema.json',
          'policy/example-policy.md', 'corpus/example-architecture.md',
          'examples/proposal.txt', 'validation-catalog.json',
          'tests/test_proposal_to_spec.py', 'tests/test_public_chroma.py',
          'tests/test_runner_contract.py', 'tests/test_export_boundary.py',
          'benchmarks/run.py', 'benchmarks/public_cases.json')
EXPECTED = {**{f'oracle_core/{name}': f'tools/oracle_core/{name}' for name in CORE},
            **{name: f'tools/oracle_public/{name}' for name in ASSETS},
            'LICENSE': 'LICENSE', 'NOTICE': 'NOTICE'}
MAX_MEMBER = 2 * 1024 * 1024
MAX_TOTAL = 16 * 1024 * 1024
HEX40 = re.compile(r'[0-9a-f]{40}')
HEX64 = re.compile(r'[0-9a-f]{64}')
SECRET = (
    re.compile(r'-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----'),
    re.compile(r'(?i)\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{12,}'),
    re.compile(r'\b(?:ghp_|github_pat_|xox[baprs]-|sk_live_|sk_test_)[A-Za-z0-9_-]{12,}'),
    re.compile(r'\bAKIA[A-Z0-9]{16}\b'),
    re.compile(r'(?i)\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\s*[\"\x27]?\s*[=:]\s*[\"\x27]?[A-Za-z0-9_+/.-]{8,}'),
    re.compile(r'\bFB-\d{4}-\d+\b'),
    re.compile(r'(?:/Users/|/home/[A-Za-z0-9_.-]+/|[A-Z]:\\Users\\)'),
    re.compile(r'(?i)(?:\.git/oracle/|\.codex/sessions/|\.claude/projects/)'),
)
EMAIL = re.compile(r'[A-Za-z0-9_.+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})')


class ExportError(ValueError):
    pass


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False,
                       allow_nan=False) + '\n').encode('utf-8')


def strict_json(body):
    def pairs(rows):
        result = {}
        for key, value in rows:
            if key in result:
                raise ExportError('Duplicate JSON key')
            result[key] = value
        return result
    def constant(_):
        raise ExportError('Non-finite JSON value')
    return json.loads(body, object_pairs_hook=pairs, parse_constant=constant)


def digest(body):
    return hashlib.sha256(body).hexdigest()


def safe_path(name):
    if not isinstance(name, str) or not name or name != name.strip() or '\\' in name:
        raise ExportError('Unsafe member path')
    path = PurePosixPath(name)
    if path.is_absolute() or str(path) != name or any(p in ('', '.', '..', '.git') for p in path.parts):
        raise ExportError('Unsafe member path')
    return name


def public_text(body, name):
    if len(body) > MAX_MEMBER or b'\0' in body:
        raise ExportError('Unsupported public member size or binary content: ' + name)
    try:
        text = body.decode('utf-8')
    except UnicodeDecodeError as error:
        raise ExportError('Public members require UTF-8: ' + name) from error
    if any(pattern.search(text) for pattern in SECRET):
        raise ExportError('Private or secret content rejected: ' + name)
    for domain in EMAIL.findall(text):
        if not (domain.endswith(('.invalid', '.test', '.example')) or domain in ('example.com', 'example.org', 'example.net')):
            raise ExportError('Non-synthetic email rejected: ' + name)


def git(root, *args, input_data=None):
    env = {k: v for k, v in os.environ.items() if k not in
           ('GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
            'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_REPLACE_REF_BASE')}
    try:
        return subprocess.check_output(['git', '--no-replace-objects', '-C', str(root), *args],
                                       env=env, input=input_data, stderr=subprocess.PIPE, timeout=30)
    except (OSError, subprocess.SubprocessError) as error:
        raise ExportError('Immutable Git input unavailable') from error


def mapped_members(raw):
    value = strict_json(raw)
    if not isinstance(value, dict) or set(value) != {'kind', 'members', 'generated', 'generation_inputs'}:
        raise ExportError('Closed export map required')
    if value['kind'] != 'oracle-public-export-map' or value['generated'] != [GENERATED] or value['generation_inputs'] != [GENERATION_INPUT]:
        raise ExportError('Unsupported export map')
    if not isinstance(value['members'], list):
        raise ExportError('Complete member mapping required')
    mapping = {}
    sources = set()
    for row in value['members']:
        if not isinstance(row, dict) or set(row) != {'source', 'destination'}:
            raise ExportError('Closed member mapping required')
        source, destination = safe_path(row['source']), safe_path(row['destination'])
        if source in sources or destination in mapping:
            raise ExportError('Duplicate export source or destination')
        sources.add(source)
        mapping[destination] = source
    if mapping != EXPECTED:
        raise ExportError('Unlisted, missing or altered public mapping')
    return mapping


def blobs(root, commit, paths):
    records = {}
    for row in git(root, 'ls-tree', '-r', '-l', '-z', commit, '--', *paths).split(b'\0'):
        if not row:
            continue
        header, actual = row.split(b'\t', 1)
        mode, kind, oid, size = header.decode().split()
        name = actual.decode()
        if name not in paths or name in records or kind != 'blob' or mode not in ('100644', '100755'):
            raise ExportError('Links, submodules or nonregular Git members rejected')
        if not size.isdigit() or int(size) > MAX_MEMBER:
            raise ExportError('Git member exceeds bounded size')
        records[name] = (mode, oid, int(size))
    if set(records) != set(paths):
        raise ExportError('Missing exact Git member')
    if sum(row[2] for row in records.values()) > MAX_TOTAL:
        raise ExportError('Git selection exceeds bounded size')
    ordered = sorted(records)
    raw = git(root, 'cat-file', '--batch', input_data=''.join(records[name][1] + '\n' for name in ordered).encode())
    result, cursor = {}, 0
    for name in ordered:
        end = raw.find(b'\n', cursor)
        mode, oid, size = records[name]
        if end < 0 or raw[cursor:end] != f'{oid} blob {size}'.encode():
            raise ExportError('Git batch identity differs')
        cursor = end + 1
        body = raw[cursor:cursor + size]
        cursor += size
        if len(body) != size or raw[cursor:cursor + 1] != b'\n':
            raise ExportError('Git batch content incomplete')
        cursor += 1
        result[name] = (body, mode, oid)
    if cursor != len(raw):
        raise ExportError('Unlisted Git batch content')
    return result


def archive_bytes(members):
    result = io.BytesIO()
    with gzip.GzipFile(fileobj=result, mode='wb', filename='', mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as archive:
            for name, body, mode in sorted(members):
                member = tarfile.TarInfo(name)
                member.size, member.mode, member.mtime = len(body), mode, 0
                member.uid = member.gid = 0
                member.uname = member.gname = ''
                archive.addfile(member, io.BytesIO(body))
    return result.getvalue()


def origin_main(root, commit, raw):
    value = strict_json(raw)
    if not isinstance(value, dict) or value.get('kind') != 'oracle-spec/1' or not isinstance(value.get('stamp'), dict) or not isinstance(value.get('seal'), str):
        raise ExportError('Sealed generation input required')
    body = {key: item for key, item in value.items() if key != 'seal'}
    encoded = json.dumps(body, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode()
    expected = digest(b'oracle-spec/1\0' + encoded)
    if not hmac.compare_digest(expected, value['seal']):
        raise ExportError('Generation input seal differs')
    origin = value['stamp'].get('origin_main')
    if not isinstance(origin, str) or HEX40.fullmatch(origin) is None:
        raise ExportError('Full origin baseline required')
    if git(root, 'rev-parse', '--verify', origin + '^{commit}').decode().strip() != origin:
        raise ExportError('Exact origin baseline object required')
    git(root, 'merge-base', '--is-ancestor', origin, commit)
    return origin


def export(root, commit, output):
    root, output = Path(root).resolve(strict=True), Path(output)
    if not isinstance(commit, str) or HEX40.fullmatch(commit) is None:
        raise ExportError('Full lowercase commit SHA required')
    if git(root, 'rev-parse', '--verify', commit + '^{commit}').decode().strip() != commit:
        raise ExportError('Exact commit object required')
    tree = git(root, 'rev-parse', commit + '^{tree}').decode().strip()
    inputs = blobs(root, commit, [MAP, CONTROL, GENERATION_INPUT])
    raw_map = inputs[MAP][0]
    mapping = mapped_members(raw_map)
    origin = origin_main(root, commit, inputs[GENERATION_INPUT][0])
    control = inputs[CONTROL][0]
    if control != Path(__file__).read_bytes():
        raise ExportError('Loaded exporter differs from committed exporter')
    members, records = [], []
    selected = blobs(root, commit, list(mapping.values()))
    for destination, source in sorted(mapping.items()):
        body, mode, oid = selected[source]
        public_text(body, destination)
        numeric_mode = 0o755 if mode == '100755' else 0o644
        members.append((destination, body, numeric_mode))
        records.append({'path': destination, 'source': source, 'git_blob': oid,
                        'mode': numeric_mode, 'size': len(body), 'sha256': digest(body)})
    if sum(len(body) for _, body, _ in members) > MAX_TOTAL:
        raise ExportError('Public export exceeds bounded size')
    manifest = {'kind': 'oracle-public-export', 'source_repository': REPOSITORY,
                'source_commit': commit, 'source_tree': tree, 'origin_main': origin, 'export_map_sha256': digest(raw_map),
                'exporter_sha256': digest(control), 'members': records}
    generated = canonical(manifest)
    public_text(generated, GENERATED)
    members.append((GENERATED, generated, 0o644))
    archive = archive_bytes(members)
    receipt = {'kind': 'oracle-public-export-receipt', 'source_commit': commit,
               'source_tree': tree, 'export_map_sha256': digest(raw_map),
               'exporter_sha256': digest(control),
               'archive': {'file': ARCHIVE, 'sha256': digest(archive), 'size': len(archive)},
               'members': [{'path': name, 'size': len(body), 'mode': mode, 'sha256': digest(body)}
                           for name, body, mode in sorted(members)]}
    verify_archive_bytes(archive, receipt)
    # An explicit new output directory prevents overwriting a prior attempt or foreign files.
    if '..' in output.parts or any(part.is_symlink() for part in [output.absolute(), *output.absolute().parents]):
        raise ExportError('Output traversal or symlink route rejected')
    if output.exists() or output.is_symlink():
        raise ExportError('A new output directory is required')
    output.mkdir(mode=0o700, parents=False)
    created = []
    try:
        for name, body in [(ARCHIVE, archive), (RECEIPT, canonical(receipt))]:
            target = output / name
            with target.open('xb') as stream:
                created.append(target)
                stream.write(body)
    except BaseException:
        for target in created:
            if target.is_file() and not target.is_symlink():
                target.unlink()
        try:
            output.rmdir()
        except OSError:
            pass  # Unexpected foreign entries are preserved.
        raise
    return receipt


def verify_archive_bytes(raw, receipt):
    if not isinstance(receipt, dict) or set(receipt) != {'kind', 'source_commit', 'source_tree', 'export_map_sha256', 'exporter_sha256', 'archive', 'members'}:
        raise ExportError('Closed export receipt required')
    if receipt['kind'] != 'oracle-public-export-receipt' or any(HEX40.fullmatch(receipt.get(k, '')) is None for k in ('source_commit', 'source_tree')):
        raise ExportError('Invalid receipt identity')
    if any(HEX64.fullmatch(receipt.get(k, '')) is None for k in ('export_map_sha256', 'exporter_sha256')):
        raise ExportError('Invalid receipt input hash')
    if receipt['archive'] != {'file': ARCHIVE, 'sha256': digest(raw), 'size': len(raw)}:
        raise ExportError('Archive receipt mismatch')
    if len(raw) > MAX_TOTAL:
        raise ExportError('Archive exceeds bounded size')
    expected = set(EXPECTED) | {GENERATED}
    bodies, rows = {}, []
    try:
        with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
            for item in archive:
                name = safe_path(item.name)
                if name not in expected or name in bodies or not item.isfile() or item.mode not in (0o644, 0o755):
                    raise ExportError('Unlisted, duplicate or linked archive member')
                if item.size > MAX_MEMBER or item.uid or item.gid or item.uname or item.gname or item.mtime or item.pax_headers:
                    raise ExportError('Noncanonical archive metadata')
                stream = archive.extractfile(item)
                if stream is None:
                    raise ExportError('Missing archive content')
                body = stream.read(MAX_MEMBER + 1)
                if len(body) != item.size:
                    raise ExportError('Archive member length differs')
                public_text(body, name)
                if sum(len(value) for value in bodies.values()) + len(body) > MAX_TOTAL:
                    raise ExportError('Archive members exceed bounded size')
                bodies[name] = body
                rows.append({'path': name, 'size': len(body), 'mode': item.mode, 'sha256': digest(body)})
    except (tarfile.TarError, OSError, EOFError) as error:
        raise ExportError('Unreadable public archive') from error
    if set(bodies) != expected or rows != sorted(rows, key=lambda r: r['path']) or rows != receipt['members']:
        raise ExportError('Archive membership or content differs')
    if archive_bytes([(r['path'], bodies[r['path']], r['mode']) for r in rows]) != raw:
        raise ExportError('Noncanonical archive bytes')
    manifest = strict_json(bodies[GENERATED])
    if canonical(manifest) != bodies[GENERATED] or not isinstance(manifest, dict) or set(manifest) != {'kind', 'source_repository', 'source_commit', 'source_tree', 'origin_main', 'export_map_sha256', 'exporter_sha256', 'members'}:
        raise ExportError('Noncanonical generated manifest')
    if manifest['kind'] != 'oracle-public-export' or manifest['source_repository'] != REPOSITORY or any(manifest.get(k) != receipt[k] for k in ('source_commit', 'source_tree', 'export_map_sha256', 'exporter_sha256')):
        raise ExportError('Generated provenance differs')
    if not isinstance(manifest['origin_main'], str) or HEX40.fullmatch(manifest['origin_main']) is None:
        raise ExportError('Invalid generated origin baseline')
    if not isinstance(manifest['members'], list) or len(manifest['members']) != len(EXPECTED):
        raise ExportError('Generated member list incomplete')
    for record, name in zip(manifest['members'], sorted(EXPECTED)):
        row = next(r for r in rows if r['path'] == name)
        if not isinstance(record, dict) or set(record) != {'path', 'source', 'git_blob', 'mode', 'size', 'sha256'}:
            raise ExportError('Invalid generated member')
        if record['path'] != name or record['source'] != EXPECTED[name] or any(record[k] != row[k] for k in ('mode', 'size', 'sha256')):
            raise ExportError('Generated content binding differs')
        body = bodies[name]
        git_blob = hashlib.sha1(b'blob ' + str(len(body)).encode() + b'\0' + body).hexdigest()
        if record['git_blob'] != git_blob:
            raise ExportError('Invalid Git blob content identity')
    return manifest


def verify_archive(path, receipt):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > MAX_TOTAL:
        raise ExportError('Regular bounded archive required')
    return verify_archive_bytes(path.read_bytes(), receipt)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        print(canonical(export(ROOT, args.commit, args.output)).decode(), end='')
        return 0
    except (ExportError, OSError, ValueError, TypeError) as error:
        print('Oracle export refused: ' + str(error), file=__import__('sys').stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
