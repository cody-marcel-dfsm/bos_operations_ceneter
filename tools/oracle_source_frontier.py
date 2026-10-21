"""Mechanical immutable-source navigation; this material grants no coverage."""
from __future__ import annotations

import ast
from collections import deque
import difflib
import hashlib
import json
from pathlib import Path
import subprocess

MAX_OBJECT_BYTES = 1024 * 1024
MAX_SOURCE_BYTES = 8 * 1024 * 1024
MAX_FRONTIER_BYTES = 2 * 1024 * 1024
MAX_PAGE_BYTES = 32 * 1024
MAX_INLINE_BYTES = 96 * 1024


def _hash(raw):
    return hashlib.sha256(raw).hexdigest()


def _git(root, args, data=None):
    return subprocess.run(['git', '--no-replace-objects', *args], cwd=root, input=data,
                          capture_output=True, check=True).stdout


def _tree(root, revision):
    result = {}
    for item in _git(root, ['ls-tree', '-r', '-z', revision]).split(b'\0'):
        if item:
            metadata, name = item.split(b'\t', 1)
            mode, kind, oid = metadata.decode('ascii').split()
            result[name.decode('utf-8', 'surrogateescape')] = (mode, kind, oid)
    return result


def _objects(root, identities):
    """Use two length-framed Git batches, independent of the number of paths."""
    names = sorted(set(identities))
    if not names:
        return {}, {}
    query = ''.join(name + '\n' for name in names).encode('ascii')
    sizes = _git(root, ['cat-file', '--batch-check'], query).splitlines()
    if len(sizes) != len(names):
        raise ValueError('Incomplete Git object metadata')
    accepted, omitted, total = [], {}, 0
    for expected, line in zip(names, sizes):
        fields = line.decode('ascii').split()
        if len(fields) != 3 or fields[:2] != [expected, 'blob'] or not fields[2].isdigit():
            raise ValueError('Unexpected Git object metadata')
        size = int(fields[2])
        if size > MAX_OBJECT_BYTES or total + size > MAX_SOURCE_BYTES:
            omitted[expected] = 'OBJECT_PREPARATION_BUDGET'
        else:
            accepted.append(expected); total += size
    raw = _git(root, ['cat-file', '--batch'], ''.join(name + '\n' for name in accepted).encode('ascii')) if accepted else b''
    result, cursor = {}, 0
    for expected in accepted:
        end = raw.find(b'\n', cursor)
        if end < 0:
            raise ValueError('Truncated Git object frame')
        fields = raw[cursor:end].decode('ascii').split()
        if len(fields) != 3 or fields[:2] != [expected, 'blob'] or not fields[2].isdigit():
            raise ValueError('Malformed Git object frame')
        size = int(fields[2]); cursor = end + 1
        body = raw[cursor:cursor + size]; cursor += size
        if len(body) != size or raw[cursor:cursor + 1] != b'\n':
            raise ValueError('Truncated Git object body')
        cursor += 1
        algorithm = hashlib.sha1 if len(expected) == 40 else hashlib.sha256
        if algorithm(b'blob ' + str(size).encode() + b'\0' + body).hexdigest() != expected:
            raise ValueError('Git source body differs from its object identity')
        result[expected] = body
    if cursor != len(raw):
        raise ValueError('Unexpected trailing Git object data')
    return result, omitted


def snapshot(o, root, context, paths):
    authority = set(context.get('guards', {}).get('authority_digests', {}))
    eligible = [p for p in sorted(set(paths)) if not p.startswith(('@', 'Vault/'))
                and p not in authority and Path(p).name != 'AGENTS.md'
                and (context['input_hashes'].get(p) is None or str(context['input_hashes'].get(p)).startswith('git-'))]
    base = context.get('previous_candidate_tree') or context.get('publication_scope', {}).get('baseline_commit')
    result = {'base': base, 'tree': context['candidate_tree'], 'before': {}, 'after': {}, 'bodies': {},
              'omitted': {}, 'authority': authority, 'git_calls': 0}
    if not eligible:
        return result
    try:
        result['before'] = _tree(root, base); result['after'] = _tree(root, result['tree'])
        result['git_calls'] = 2
        ids = []
        for path in eligible:
            current = result['after'].get(path)
            identity = context['input_hashes'].get(path)
            if current:
                mode, kind, oid = current
                expected = 'git-' + ('sha1' if len(oid) == 40 else 'sha256') + ':' + ':'.join(current)
                if identity != expected:
                    raise o.OracleApprovalError('Prepared source differs from the native candidate identity: ' + path)
            elif identity is not None:
                raise o.OracleApprovalError('Prepared source path is absent from the selected candidate: ' + path)
            for entries in (result['before'], result['after']):
                item = entries.get(path)
                if item and item[0] in {'100644', '100755'} and item[1] == 'blob':
                    ids.append(item[2])
        result['bodies'], result['omitted'] = _objects(root, ids)
        result['git_calls'] += (1 + bool(result['bodies'])) if ids else 0
    except (subprocess.CalledProcessError, ValueError) as exc:
        raise o.OracleApprovalError('Immutable source-frontier preparation failed: ' + str(exc)) from exc
    return result


def _start(node):
    return min([node.lineno, *[d.lineno for d in getattr(node, 'decorator_list', [])]])


def _python_units(text, changed, affected):
    """Descend classes; retain complete function bodies and construction context."""
    lines = text.splitlines(keepends=True); tree = ast.parse(text)
    functions, classes, construction = {}, {}, []
    def walk(nodes, prefix='', parents=()):
        for node in nodes:
            if isinstance(node, ast.ClassDef):
                name = prefix + node.name
                first = min((_start(n) for n in node.body), default=node.end_lineno + 1)
                classes[name] = (node, parents, (_start(node), max(node.lineno, first - 1)))
                walk(node.body, name + '.', (*parents, name))
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                functions[prefix + node.name] = (node, parents)
            else:
                construction.append((node.lineno, node.end_lineno, prefix + type(node).__name__))
    walk(tree.body)
    overlap = lambda node: affected or any(a <= node.end_lineno and b >= _start(node) for a, b in changed)
    selected = {name for name, (node, _) in functions.items() if overlap(node)}
    direct = set(selected)
    chosen_classes = {name for name, (node, _, header) in classes.items()
                      if affected or any(a <= header[1] and b >= header[0] for a, b in changed)}
    unresolved = set(); queue = deque(sorted(selected)); seen = set()
    construction_seen = set()
    def constructors(name):
        if name not in classes or name in construction_seen:
            return
        construction_seen.add(name); chosen_classes.add(name)
        class_node = classes[name][0]
        for expression in [*class_node.decorator_list, *class_node.bases, *[item.value for item in class_node.keywords]]:
            for item in ast.walk(expression):
                if isinstance(item, ast.Name):
                    if item.id in functions and item.id not in selected:
                        selected.add(item.id); queue.append(item.id)
                    if item.id in classes:constructors(item.id)
        for method in ('__new__', '__init__', '__post_init__'):
            target = name + '.' + method
            if target in functions and target not in selected:
                selected.add(target); queue.append(target)
    for name in list(chosen_classes):constructors(name)
    while queue:
        name = queue.popleft()
        if name in seen:
            continue
        if len(seen) >= 48:
            unresolved.add('SAME_FILE_DEPENDENCY_BUDGET:' + name); continue
        seen.add(name); node, parents = functions[name]; chosen_classes.update(parents)
        for parent in parents:constructors(parent)
        for decorator in node.decorator_list:
            if isinstance(decorator, ast.Name) and decorator.id in functions and decorator.id not in selected:
                selected.add(decorator.id); queue.append(decorator.id)
        for item in ast.walk(node):
            if not isinstance(item, ast.Call):
                continue
            target = None
            if isinstance(item.func, ast.Name):
                target = item.func.id
                if target in classes:
                    constructors(target)
            elif (isinstance(item.func, ast.Attribute) and isinstance(item.func.value, ast.Name)
                  and item.func.value.id in {'self', 'cls'} and parents):
                target = parents[-1] + '.' + item.func.attr
            if target in functions and target not in selected:
                selected.add(target); queue.append(target)
            elif isinstance(item.func, ast.Attribute) and target not in functions:
                unresolved.add('EXTERNAL_CALL:' + ast.unparse(item.func))
    for name in sorted(chosen_classes):
        for method in ('__new__', '__init__', '__post_init__'):
            if name + '.' + method in functions:
                selected.add(name + '.' + method)
    units = []
    def unit(start, end, label, kind):
        units.append({'start_line': start, 'end_line': end, 'label': label, 'kind': kind,
                      'selection': 'DIRECT' if label in direct or any(a <= end and b >= start for a,b in changed) else 'CONSTRUCTION',
                      'body': ''.join(lines[start - 1:end])})
    for a, b, label in construction:
        unit(a, b, label, 'construction')
    for name in sorted(chosen_classes):
        _, _, (a, b) = classes[name]; unit(a, b, name, 'class-header')
    for name in sorted(selected):
        node, _ = functions[name]; unit(_start(node), node.end_lineno, name, 'complete-definition')
    return units, sorted(unresolved)


def _locator(snap, side, path, identity):
    revision = snap['base'] if side == 'before' else snap['tree']
    item = snap[side].get(path)
    if item:
        identity = 'git-' + ('sha1' if len(item[2]) == 40 else 'sha256') + ':' + ':'.join(item)
    return {'kind': 'git-source', 'tree': revision, 'path': path, 'source_identity': identity,
            'git_mode': item[0] if item else None, 'git_oid': item[2] if item else None,
            'read_argv': ['git', '--no-replace-objects', 'show', str(revision) + ':' + path] if item else None}


def _entry(context, snap, path):
    entry = {'path': path, 'source_identity': context['input_hashes'].get(path), 'units': [], 'gaps': [],
             'originals': {side: _locator(snap, side, path, context['input_hashes'].get(path)) for side in ('before', 'after')}}
    if path in snap['authority'] or Path(path).name == 'AGENTS.md' or path.startswith('Vault/'):
        entry['gaps'].append('GOVERNING_OR_PRIVATE_ORIGINAL_READ_REQUIRED'); return entry
    if path.startswith('@'):
        entry['gaps'].append('VIRTUAL_NATIVE_CONTEXT_INPUT'); return entry
    texts = {}
    for side in ('before', 'after'):
        item = snap[side].get(path)
        if not item:
            texts[side] = ''; continue
        if item[0] not in {'100644', '100755'}:
            entry['gaps'].append(side + ':NONREGULAR_GIT_INPUT'); continue
        raw = snap['bodies'].get(item[2])
        if raw is None:
            entry['gaps'].append(side + ':' + snap['omitted'].get(item[2], 'UNPREPARED_SOURCE')); continue
        try:
            text = raw.decode('utf-8')
            if '\0' in text or text.startswith('version https://git-lfs.github.com/spec/'):
                raise ValueError('Binary or LFS content requires its original reader')
            texts[side] = text
        except (UnicodeDecodeError, ValueError):
            entry['gaps'].append(side + ':NON_UTF8_BINARY_OR_LFS_ORIGINAL_REQUIRED')
    if not texts or (not snap['before'].get(path) and not snap['after'].get(path)):
        entry['gaps'].append('UNKNOWN_OR_NON_GIT_SOURCE'); return entry
    before, after = texts.get('before'), texts.get('after')
    changed = {'before': [], 'after': []}
    if before is not None and after is not None:
        a, b = before.splitlines(keepends=True), after.splitlines(keepends=True)
        for tag, i, j, k, l in difflib.SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
            if tag != 'equal':
                changed['before'].append((i + 1, max(i + 1, j)))
                changed['after'].append((k + 1, max(k + 1, l)))
        diff = ''.join(difflib.unified_diff(a, b, fromfile='before/' + path, tofile='after/' + path, n=3))
        if diff:
            entry['units'].append({'side': 'diff', 'label': 'assigned-unified-diff', 'kind': 'mechanical-diff',
                                   'start_line': None, 'end_line': None, 'body': diff})
    for side, text in texts.items():
        if not text or (side == 'before' and before == after):
            continue
        if path.endswith('.py'):
            try:
                units, unresolved = _python_units(text, changed[side], not changed['before'] and not changed['after'])
                entry['gaps'].extend(side + ':' + name for name in unresolved)
            except (SyntaxError, ValueError, RecursionError):
                units = [{'start_line': 1, 'end_line': len(text.splitlines()), 'label': 'unparsed-complete-source',
                          'kind': 'complete-text-fallback', 'body': text}]
                entry['gaps'].append(side + ':AST_UNKNOWN_COMPLETE_TEXT_FALLBACK')
        else:
            units = [{'start_line': 1, 'end_line': len(text.splitlines()), 'label': 'complete-source',
                      'kind': 'complete-text-fallback', 'body': text}]
        entry['units'].extend(dict(unit, side=side) for unit in units)
    def priority(unit):
        after = unit['side'] == 'after'
        direct = unit.get('selection') == 'DIRECT'
        if after and unit['kind'] == 'complete-definition' and direct:return 0
        if after and unit['kind'] in {'class-header','complete-definition'}:return 1
        if unit['side'] == 'diff':return 2
        if unit['side'] == 'before' and unit['kind'] == 'complete-definition' and direct:return 3
        if after:return 4
        return 5
    entry['units'].sort(key=priority)
    return entry


def prepare(o, root, context, plan, cohort, child, snap):
    entries = [_entry(context, snap, path) for path in cohort['required_paths']]
    queues = [deque(entry['units']) for entry in entries]; pages = []; total = 0
    while any(queues):
        for entry, queue in zip(entries, queues):
            if not queue:
                continue
            unit = queue.popleft(); raw = unit.pop('body').encode('utf-8')
            unit['body_sha256'] = _hash(raw); unit['body_bytes'] = len(raw); unit['pages'] = []
            prepared = []; start = 0
            while start < len(raw):
                end = min(len(raw), start + 12 * 1024)
                while True:
                    try:body = raw[start:end].decode('utf-8'); break
                    except UnicodeDecodeError:end -= 1
                page = {'kind': 'boc-source-frontier-page-v1', 'path': entry['path'], 'side': unit['side'],
                        'source_identity': entry['originals'].get(unit['side'], {}).get('source_identity', entry['source_identity']), 'unit_body_sha256': unit['body_sha256'],
                        'unit_label': unit['label'][:256], 'start_line': unit['start_line'], 'end_line': unit['end_line'],
                        'fragment_byte_start': start, 'fragment_byte_end': end, 'body': body, 'body_sha256': _hash(raw[start:end])}
                encoded = o._pretty(page)
                while len(encoded) > MAX_PAGE_BYTES:
                    end = start + max(1, (end - start) // 2)
                    while True:
                        try:body = raw[start:end].decode('utf-8'); break
                        except UnicodeDecodeError:end -= 1
                    page.update(fragment_byte_end=end, body=body, body_sha256=_hash(raw[start:end])); encoded = o._pretty(page)
                prepared.append(encoded); start = end
            if total + sum(map(len, prepared)) > MAX_FRONTIER_BYTES:
                unit['preparation'] = 'ON_DEMAND_BUDGET'; entry['gaps'].append('UNIT_ON_DEMAND:' + unit['side'] + ':' + unit['label'])
            else:
                unit['preparation'] = 'COMPLETE_PAGED'
                for encoded in prepared:
                    path = child / ('source-page-%04d.json' % (len(pages) + 1))
                    o._atomic_write(path, encoded); total += len(encoded)
                    reference = {'path': str(path), 'sha256': _hash(encoded), 'bytes': len(encoded)}
                    pages.append(reference); unit['pages'].append(reference)
    manifest = {'kind': 'boc-source-frontier-v1', 'preparation_only': True, 'grants_coverage': False,
                'candidate_commit': context['base_commit'], 'candidate_tree': context['candidate_tree'],
                'comparison_tree': snap['base'], 'plan_sha256': plan['plan_sha256'],
                'parent_context_sha256': plan['context_sha256'], 'required_paths': list(cohort['required_paths']),
                'entries': entries, 'pages': pages, 'prepared_bytes': total,
                'snapshot_git_calls': snap['git_calls'], 'mandatory_governing_reads': sorted(snap['authority'])}
    path = child / 'source-frontier.json'; encoded = o._pretty(manifest); o._atomic_write(path, encoded)
    seal = o._files(root, [str(path), *[page['path'] for page in pages]])
    inline = []; size = 0
    for page in pages:
        body = o._custody_read(root, page['path'])[1]
        if _hash(body) != page['sha256']:
            raise o.OracleApprovalError('Prepared source page changed before delivery')
        decoded = json.loads(body)
        header = dict(page, **{key: value for key, value in decoded.items() if key != 'body'})
        fragment = json.dumps(header, sort_keys=True) + '\n' + decoded['body'] + '\n'
        amount = len(fragment.encode('utf-8'))
        if size + amount > MAX_INLINE_BYTES:
            break
        inline.append(fragment); size += amount
    return {'manifest': str(path), 'manifest_sha256': _hash(encoded), 'prepared_pages': len(pages),
            'inline_pages': len(inline), 'inline_bytes': size, 'prepared_bytes': total,
            'required_paths': list(cohort['required_paths']), 'preparation_only': True}, seal, '\n'.join(inline)
