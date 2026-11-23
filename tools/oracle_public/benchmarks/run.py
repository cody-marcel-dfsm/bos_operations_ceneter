#!/usr/bin/env python3
"""Measure actual public Chroma retrieval; no model or comparative quality claims."""
from __future__ import annotations
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys
import time


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode()


def labels(path, sources):
    body = Path(path).read_bytes()
    value = json.loads(body)
    if not isinstance(value, dict) or set(value) != {'mode', 'label_origin', 'cases'} or value['mode'] != 'synthetic-public-retrieval-labels' or not value['label_origin']:
        raise ValueError('Explicit independently authored synthetic labels required')
    seen = set()
    for row in value['cases']:
        if not isinstance(row, dict) or set(row) != {'id', 'query', 'relevant_sources'} or not isinstance(row['id'], str) or not row['id'] or row['id'] in seen or not isinstance(row['query'], str) or not row['query'].strip():
            raise ValueError('Unique explicit label cases required')
        if not isinstance(row['relevant_sources'], list) or len(set(row['relevant_sources'])) != len(row['relevant_sources']) or not set(row['relevant_sources']) <= set(sources):
            raise ValueError('Labels must name declared public sources')
        seen.add(row['id'])
    if not seen:
        raise ValueError('Nonempty label cases required')
    return value, hashlib.sha256(body).hexdigest()


def measure(index, cases):
    rows = []
    for case in cases:
        started = time.perf_counter()
        evidence = index.snapshot_evidence(case['query'], limit=5)
        elapsed = time.perf_counter() - started
        results = evidence['queries'][0]['results']
        returned = sorted({row['source'] for row in results})
        rows.append({'id': case['id'], 'query': case['query'],
                     'expected_sources': case['relevant_sources'], 'returned_sources': returned,
                     'label_overlap': sorted(set(returned) & set(case['relevant_sources'])),
                     'elapsed_seconds': elapsed, 'retrieval_evidence': evidence})
    return rows


def run(config_path, labels_path, output):
    # Load only the installed/exported core; this script has no private-project adapter.
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from oracle_core.config import load
    from oracle_core.index import Index
    root, config = load(Path(config_path))
    corpus = config['corpus']
    label_path = Path(labels_path).resolve(strict=True)
    if not label_path.is_relative_to(root):
        raise ValueError('Labels must belong to this explicit public project')
    expected, label_sha = labels(label_path, corpus['sources'])
    output = Path(output).resolve()
    state = (root / config['state']).resolve()
    if not output.is_relative_to(state) or output == state:
        raise ValueError('Benchmark output must be in the declared state directory')
    if output.exists() or output.is_symlink():
        raise ValueError('Fresh benchmark output required')
    index = Index(root / corpus['root'], corpus['sources'], root / config['state'] / 'index')
    index.sync()
    rows = measure(index, expected['cases'])
    artifact_path = root / 'oracle-export-manifest.json'
    artifact = json.loads(artifact_path.read_text())
    if artifact.get('kind') != 'oracle-public-export':
        raise ValueError('Exact exported source provenance required')
    source_hashes = {source: hashlib.sha256((root / corpus['root'] / source).read_bytes()).hexdigest() for source in corpus['sources']}
    report = {'mode': 'actual-local-chroma-synthetic-public-corpus',
              'label_mode': expected['mode'], 'label_origin': expected['label_origin'],
              'labels_sha256': label_sha, 'config_sha256': hashlib.sha256(Path(config_path).read_bytes()).hexdigest(),
              'source_hashes': source_hashes,
              'source_commit': artifact['source_commit'], 'source_tree': artifact['source_tree'],
              'artifact_manifest_sha256': hashlib.sha256(artifact_path.read_bytes()).hexdigest(),
              'runtime': {'python': sys.version, 'chromadb': importlib.metadata.version('chromadb')},
              'embedding': {'implementation': 'ChromaDefault/ONNXMiniLM_L6_V2', 'model': 'all-MiniLM-L6-v2', 'archive_sha256': '913d7300ceae3b2dbc2c50d1de4baacab4be7b9380491c27fab7418616a16ec3'},
              'proposal_model': None, 'meko': 'not_implemented',
              'spec_quality': None, 'comparative_claim': None,
              'measurement_limit': 'Source-label overlap on the included synthetic cases only; not spec quality, regression precision/recall or downstream outcomes.',
              'cases': rows}
    if hashlib.sha256(label_path.read_bytes()).hexdigest() != label_sha or hashlib.sha256(Path(config_path).read_bytes()).hexdigest() != report['config_sha256']:
        raise ValueError('Benchmark inputs changed during measurement')
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = canonical(report)
    temporary = output.with_name(output.name + '.partial')
    created = False
    try:
        with temporary.open('xb') as stream:
            created = True
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, output)
    finally:
        if created and temporary.exists():
            temporary.unlink()
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, type=Path)
    parser.add_argument('--labels', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args(argv)
    report = run(args.config, args.labels, args.output)
    print(canonical(report).decode(), end='')


if __name__ == '__main__':
    main()
