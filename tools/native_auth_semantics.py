"""Deterministic native event checks, separate from independent semantic review."""
from __future__ import annotations

import base64
import re

import native_auth_evidence as evidence

OBLIGATIONS = (
    'authenticate_oauth', 'signed_out_recovery', 'rejected_credential_recovery',
    'sequential_selected_context_return', 'parallel_selected_context',
    'combined_selected_context', 'eligible_roles', 'unauthorized_target',
    'unauthorized_role', 'cross_context_reuse', 'revocation', 'refresh',
    'restricted_grant_migration',
)
UI = frozenset(OBLIGATIONS[:3])
DENIALS = frozenset({'unauthorized_target', 'unauthorized_role', 'cross_context_reuse', 'revocation'})
CONTEXT_FIELDS = {'context_handle', 'organization_name', 'application_name',
                  'installation_name', 'role_label', 'is_default'}
STATUSES = ('PASSED', 'OPEN', 'REJECTED')


def object_schema(fields):
    return {'type': 'object', 'properties': fields, 'required': list(fields), 'additionalProperties': False}


def schema():
    string = {'type': 'string'}
    return object_schema({'nonce': string, 'binding_sha256': string,
        'status': {'type': 'string', 'enum': list(STATUSES)}, 'reason': string,
        'checks': {'type': 'array', 'items': object_schema({
            'id': {'type': 'string', 'enum': list(OBLIGATIONS)},
            'status': {'type': 'string', 'enum': list(STATUSES)}, 'observed': string,
            'event_ids': {'type': 'array', 'items': string}})}})


def context(value):
    evidence.closed(value, CONTEXT_FIELDS, 'Server context')
    if not re.fullmatch(r'bos_ctx_v2_[a-f0-9]{64}', value.get('context_handle', '')):
        raise ValueError('Unsupported server context handle')
    for name in CONTEXT_FIELDS - {'context_handle', 'is_default'}:
        label = value[name]
        if not isinstance(label, str) or not label.strip() or len(label) > 200 or any(ord(c) < 32 for c in label):
            raise ValueError('Invalid public context label')
    if type(value['is_default']) is not bool:
        raise ValueError('Invalid context default')
    return value


def original_session(events, result, *, tools_allowed=True):
    threads, completed, messages, calls, starts = [], 0, [], {}, {}
    if not isinstance(events, list) or len(events) > 2000:
        raise ValueError('Native event inventory exceeds supported bounds')
    for position, event in enumerate(events):
        kind, item = event.get('type'), event.get('item', {})
        if kind in ('error', 'turn.failed'):
            raise ValueError('Original native process reported failure')
        if kind == 'thread.started':
            threads.append(event.get('thread_id'))
        elif kind == 'turn.completed':
            completed += 1
        if item.get('type') == 'mcp_tool_call' and kind == 'item.started':
            if item.get('id') in starts:
                raise ValueError('Duplicate native tool start')
            starts[item.get('id')] = position
        if kind == 'item.completed':
            if item.get('type') == 'agent_message':
                messages.append(item.get('text'))
            elif item.get('type') == 'mcp_tool_call':
                identifier = item.get('id')
                if not tools_allowed or not isinstance(identifier, str) or identifier in calls:
                    raise ValueError('Unsupported or duplicate native tool event')
                calls[identifier] = {'item': item, 'start': starts.get(identifier), 'end': position}
            elif not tools_allowed and item.get('type') not in ('reasoning',):
                raise ValueError('Semantic issuer attempted an external operation')
    if len(threads) != 1 or not threads[0] or completed != 1 or not messages:
        raise ValueError('Original single native session did not complete')
    if evidence.json_bytes(messages[-1]) != result:
        raise ValueError('Assessment differs from original process output')
    return threads[0], calls


def checks(result, nonce, binding_digest):
    evidence.closed(result, {'nonce', 'binding_sha256', 'status', 'reason', 'checks'}, 'Native assessment')
    if result['nonce'] != nonce or result['binding_sha256'] != binding_digest:
        raise ValueError('Assessment names another nonce or binding')
    rows = result['checks']
    if (not isinstance(rows, list) or len(rows) != len(OBLIGATIONS) or
            {row.get('id') for row in rows} != set(OBLIGATIONS)):
        raise ValueError('Native obligation inventory is incomplete or duplicated')
    for row in rows:
        evidence.closed(row, {'id', 'status', 'observed', 'event_ids'}, 'Native check')
        if row['status'] not in STATUSES or not isinstance(row['observed'], str) or len(row['observed']) > 4000:
            raise ValueError('Unsupported native check result')
        refs = row['event_ids']
        if not isinstance(refs, list) or len(refs) > 32 or any(not isinstance(x, str) for x in refs) or len(refs) != len(set(refs)):
            raise ValueError('Invalid native observation references')
        if row['status'] == 'PASSED' and (not row['observed'].strip() or not refs):
            raise ValueError('Passing check has no original observation')
    status = ('REJECTED' if any(row['status'] == 'REJECTED' for row in rows) else
              'PASSED' if all(row['status'] == 'PASSED' for row in rows) else 'OPEN')
    if result['status'] != status or not isinstance(result['reason'], str) or len(result['reason']) > 4000:
        raise ValueError('Aggregate contradicts original obligations')
    return rows


def classify(item, connection, known_contexts):
    """Only owned v2 discovery/catalog and explicit typed denial are proof facts.

    Other advertised business operations stay visible to the semantic issuer but
    cannot silently substitute for these authentication/control-plane predicates.
    """
    if item.get('server') != connection:
        return 'ui'
    args, result = item.get('arguments'), item.get('result')
    if not isinstance(args, dict) or not isinstance(result, dict):
        raise ValueError('Native BOS call lacks original structured arguments/result')
    structured = result.get('structuredContent')
    if not isinstance(structured, dict):
        raise ValueError('Native BOS result lacks a supported structured envelope')
    if result.get('isError') is True:
        # Current MCP transport publishes AgentRuntimeError as these fields.
        # A timeout/invalid request is never proof of authority enforcement.
        if (isinstance(structured.get('error'), str) and
                structured.get('error_code') == 'authorization_denied'):
            return 'denial'
        raise ValueError('Error is not a supported typed authentication/authority denial')
    if result.get('isError') not in (False, None) or structured.get('contract_version') != 'bos-identity-mcp/v2':
        raise ValueError('Unsupported native discovery contract')
    if item.get('tool') == 'bos_get_context':
        if args or not isinstance(structured.get('contexts'), list) or not structured['contexts']:
            raise ValueError('Context discovery did not return current authorized contexts')
        for row in structured['contexts']:
            context(row)
            known_contexts[row['context_handle']] = row
        return 'discovery'
    if item.get('tool') == 'bos_list_context_tools':
        evidence.closed(args, {'context_handle'}, 'Catalog arguments')
        handle = args['context_handle']
        if handle not in known_contexts or structured.get('context_handle') != handle:
            raise ValueError('Catalog is not bound to fresh discovered context')
        tools = structured.get('tools')
        if not isinstance(tools, list) or not tools or len(tools) > 500:
            raise ValueError('Catalog did not return a supported operation inventory')
        names = []
        for tool in tools:
            if (not isinstance(tool, dict) or not isinstance(tool.get('name'), str) or
                    not isinstance(tool.get('inputSchema'), dict) or not isinstance(tool.get('outputSchema'), dict)):
                raise ValueError('Catalog operation schema is incomplete')
            names.append(tool['name'])
        if len(names) != len(set(names)):
            raise ValueError('Catalog contains duplicate operations')
        return 'catalog'
    raise ValueError('Unsupported native control operation cannot establish acceptance')


def image_inventory(calls):
    images = {}
    for identifier, call in calls.items():
        parts = (call['item'].get('result') or {}).get('content', [])
        for offset, part in enumerate(parts):
            if not isinstance(part, dict) or part.get('type') != 'image':
                continue
            if part.get('mimeType') not in ('image/png', 'image/jpeg'):
                raise ValueError('Unsupported original image encoding')
            try:
                raw = base64.b64decode(part.get('data', ''), validate=True)
            except (ValueError, TypeError) as error:
                raise ValueError('Invalid original image bytes') from error
            if not raw or len(raw) > 5 * 1024 * 1024 or not (raw.startswith(b'\x89PNG\r\n\x1a\n') or raw.startswith(b'\xff\xd8\xff')):
                raise ValueError('Original image is absent or not a supported raster')
            images[f'{identifier}:{offset}'] = {'event_id': identifier, 'sha256': evidence.digest(raw), 'bytes': raw}
    if len(images) > 24:
        raise ValueError('Native image inventory exceeds its bound')
    return images


def evaluate(expected, result, events, nonce, connection):
    rows = checks(result, nonce, evidence.digest(evidence.canonical(expected)))
    session, calls = original_session(events, result)
    known, kinds = {}, {}
    for identifier, call in sorted(calls.items(), key=lambda item: item[1]['end']):
        kinds[identifier] = classify(call['item'], connection, known)
    images = image_inventory(calls)
    seen_refs, seen_ui_pixels = set(), set()
    for row in rows:
        if row['status'] != 'PASSED':
            continue
        refs = row['event_ids']
        if any(ref not in calls for ref in refs) or seen_refs.intersection(refs):
            raise ValueError('Passing cases require distinct original native observations')
        seen_refs.update(refs)
        selected = [calls[ref] for ref in refs]
        selected_kinds = [kinds[ref] for ref in refs]
        if row['id'] in UI:
            pixels = [entry['sha256'] for entry in images.values() if entry['event_id'] in refs]
            if len(set(pixels)) < 2 or seen_ui_pixels.intersection(pixels) or 'discovery' not in selected_kinds:
                raise ValueError('UI case requires distinct original before/after pixels and authenticated discovery')
            seen_ui_pixels.update(pixels)
        elif row['id'] in DENIALS:
            if 'denial' not in selected_kinds:
                raise ValueError('Negative authority case lacks a typed server denial')
        elif not any(kind in ('discovery', 'catalog') for kind in selected_kinds):
            raise ValueError('Native case lacks supported current control-plane observations')
        if row['id'] == 'sequential_selected_context_return':
            if len(selected) < 3 or any(call['start'] is None for call in selected):
                raise ValueError('Sequential case lacks original start/completion evidence')
            ordered = sorted(selected, key=lambda call: call['start'])
            if any(a['end'] >= b['start'] for a, b in zip(ordered, ordered[1:])):
                raise ValueError('Sequential case is not sequential')
        if row['id'] == 'parallel_selected_context':
            if not any(a['start'] is not None and b['start'] is not None and
                       a['start'] < b['start'] < a['end']
                       for a in selected for b in selected if a is not b):
                raise ValueError('Parallel case lacks actual overlapping native calls')
        if row['id'] == 'combined_selected_context' and len(selected) < 2:
            raise ValueError('Combined case lacks multiple original observations')
    return {'status': result['status'], 'session_id': session, 'checks': rows}, images
