"""Portable hash-bound Chroma indexing extracted from OC vault_index. Apache-2.0.

The caller supplies every corpus member and state path; no workspace discovery.
"""
from __future__ import annotations
import fcntl, hashlib, json, os, tempfile, time
from pathlib import Path
from datetime import datetime, timezone
from html.parser import HTMLParser
from importlib.metadata import version
INDEX_VERSION=1
CHUNK_CHARACTERS=3000
OVERLAP_CHARACTERS=300
def utc_timestamp():
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")

def canonical_digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()

def atomic_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        try:
            output.write((json.dumps(payload, indent=2, sort_keys=True) + "\n").encode())
            output.flush()
            os.fsync(output.fileno())
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)

def file_digest(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

def chunks(text: str) -> list[str]:
    normalized = text.replace("\x00", "").strip()
    if not normalized:
        return []
    output = []
    start = 0
    while start < len(normalized):
        end = min(start + CHUNK_CHARACTERS, len(normalized))
        output.append(normalized[start:end])
        if end == len(normalized):
            break
        start = end - OVERLAP_CHARACTERS
    return output

class _ReadableHTMLParser(HTMLParser):
    """Extract readable text while excluding script and style content."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden_depth = 0

    def handle_starttag(self, tag: str, _attrs) -> None:
        if tag.lower() in {"script", "style"}:
            self.hidden_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style"} and self.hidden_depth:
            self.hidden_depth -= 1

    def handle_data(self, data: str) -> None:
        if not self.hidden_depth and data.strip():
            self.parts.append(data.strip())

def read_source_text(path: Path, raw: bytes | None = None) -> str:
    text = (path.read_bytes() if raw is None else raw).decode("utf-8", errors="replace")
    if path.suffix.lower() not in {".html", ".htm"}:
        return text
    parser = _ReadableHTMLParser()
    parser.feed(text)
    return "\n".join(parser.parts)

class Index:
    def __init__(self, root, sources, state, *, collection="oracle_knowledge"):
        self.root=Path(root).resolve(strict=True)
        self.sources=tuple(sources)
        if not self.sources or len(set(self.sources))!=len(self.sources):
            raise ValueError("Explicit unique nonempty corpus allowlist required")
        self.state=Path(state).resolve()
        self.directory=self.state/"chroma"
        self.manifests=self.state/"manifests"
        self.collection_name=collection
        self.snapshot()

    def embedding_identity(self):
        from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2
        cache=Path(ONNXMiniLM_L6_V2.DOWNLOAD_PATH)/'onnx'
        required=['tokenizer_config.json','special_tokens_map.json','config.json','tokenizer.json','vocab.txt','model.onnx']
        if any(not (cache/name).is_file() for name in required):raise RuntimeError('Existing embedding cache required; automatic downloads disabled')
        return canonical_digest({name:file_digest(cache/name) for name in required})

    def snapshot(self):
        result={}
        for name in self.sources:
            p=Path(name)
            if not isinstance(name,str) or p.is_absolute() or ".." in p.parts or not p.parts:
                raise ValueError("Corpus sources require safe relative paths")
            target=self.root/p
            if target.is_symlink() or any(x.is_symlink() for x in target.parents if x!=self.root and x.is_relative_to(self.root)):
                raise ValueError("Corpus symlinks are forbidden")
            target=target.resolve(strict=True)
            if not target.is_relative_to(self.root) or not target.is_file():
                raise ValueError("Corpus source escapes explicit root")
            result[name]=file_digest(target)
        return result

    def _locked(self, operation, *args, **kwargs):
        self.state.mkdir(parents=True,exist_ok=True)
        deadline=time.monotonic()+5
        with (self.state/"index.lock").open("a+") as lock:
            while True:
                try:
                    fcntl.flock(lock.fileno(),fcntl.LOCK_EX|fcntl.LOCK_NB);break
                except BlockingIOError:
                    if time.monotonic()>=deadline:raise RuntimeError("Index lock unavailable")
                    time.sleep(.05)
            return operation(*args,**kwargs)

    def sync(self):
        return self._locked(self._sync_unlocked,quiet=True)

    def query(self,text,limit=5):
        return self._locked(self._query_unlocked,text,limit)

    def snapshot_evidence(self,text,supplemental=None,limit=5):
        return self._locked(self._snapshot_evidence_unlocked,text,supplemental,limit)

    def index_configuration(self) -> dict:
        return {'index_version': INDEX_VERSION, 'collection': self.collection_name, 'chunk_characters': CHUNK_CHARACTERS, 'overlap_characters': OVERLAP_CHARACTERS, 'embedding': 'Chroma DefaultEmbeddingFunction/all-MiniLM-L6-v2', 'chromadb_version': version('chromadb'), 'embedding_cache_sha256': self.embedding_identity(), 'indexer_sha256': file_digest(Path(__file__))}

    def get_collection(self):
        try:
            import chromadb
        except ImportError as exc:
            raise RuntimeError('ChromaDB is required. Install tools/requirements-dev.txt.') from exc
        from chromadb.utils.embedding_functions import ONNXMiniLM_L6_V2
        cache = Path(ONNXMiniLM_L6_V2.DOWNLOAD_PATH) / 'onnx'
        required = ['tokenizer_config.json', 'special_tokens_map.json', 'config.json', 'tokenizer.json', 'vocab.txt', 'model.onnx']
        if any(not (cache / name).is_file() for name in required):
            raise RuntimeError('Configured existing Chroma embedding cache is unavailable; automatic downloads are disabled')
        client = chromadb.PersistentClient(path=str(self.directory))
        return client.get_or_create_collection(name=self.collection_name, metadata={'hnsw:space': 'cosine', 'index_version': INDEX_VERSION})

    def write_manifest(self, payload: dict) -> Path:
        self.manifests.mkdir(parents=True, exist_ok=True)
        path = self.manifests / f"{payload['indexed_at']}.json"
        atomic_json(path, payload)
        latest = self.manifests / 'latest.json'
        atomic_json(latest, payload)
        return path

    def _sync_unlocked(self, *, quiet: bool=False, force_manifest: bool=False) -> dict:
        started = time.monotonic()
        indexed_at = utc_timestamp()
        source_hashes = self.snapshot()
        configuration = self.index_configuration()
        configuration_sha256 = canonical_digest(configuration)
        collection = self.get_collection()
        existing = collection.get(include=['metadatas'])
        ids_by_source: dict[str, list[str]] = {}
        hashes_by_source: dict[str, str] = {}
        incompatible_sources: set[str] = set()
        chunks_by_source: dict[str, list[int]] = {}
        counts_by_source: dict[str, set[int]] = {}
        for item_id, metadata in zip(existing.get('ids', []), existing.get('metadatas', [])):
            metadata = metadata or {}
            source = str(metadata.get('source', ''))
            if not source:
                raise RuntimeError('Vault collection contains an unbound source')
            ids_by_source.setdefault(source, []).append(item_id)
            hashes_by_source[source] = str(metadata.get('source_sha256', ''))
            if metadata.get('source_sha256') != source_hashes.get(source):
                incompatible_sources.add(source)
            if metadata.get('index_configuration_sha256') != configuration_sha256:
                incompatible_sources.add(source)
            chunk, count = (metadata.get('chunk'), metadata.get('chunk_count'))
            if type(chunk) is not int or type(count) is not int or chunk < 0 or (count <= 0):
                incompatible_sources.add(source)
            else:
                chunks_by_source.setdefault(source, []).append(chunk)
                counts_by_source.setdefault(source, set()).add(count)
        for source, identifiers in ids_by_source.items():
            if counts_by_source.get(source) != {len(identifiers)} or sorted(chunks_by_source.get(source, [])) != list(range(len(identifiers))):
                incompatible_sources.add(source)
        removed = sorted(set(ids_by_source) - set(source_hashes))
        changed = sorted((source for source, digest in source_hashes.items() if hashes_by_source.get(source) != digest or source in incompatible_sources))
        for source in removed + changed:
            stale_ids = ids_by_source.get(source, [])
            if stale_ids:
                collection.delete(ids=stale_ids)
        chunk_count = 0
        for source in changed:
            path = self.root / source
            try:
                raw = path.read_bytes()
                text = read_source_text(path, raw)
            except OSError as exc:
                raise RuntimeError(f'Vault source disappeared during indexing: {source}') from exc
            if hashlib.sha256(raw).hexdigest() != source_hashes[source]:
                raise RuntimeError(f'Vault source changed during indexing: {source}')
            source_chunks = chunks(text)
            if not source_chunks:
                source_chunks = [f'Empty knowledge file: {source}']
            digest = source_hashes[source]
            ids = [hashlib.sha256(f'{source}:{index}:{digest}'.encode()).hexdigest() for index in range(len(source_chunks))]
            metadatas = [{'source': source, 'source_sha256': digest, 'chunk': index, 'chunk_count': len(source_chunks), 'indexed_at': indexed_at, 'index_version': INDEX_VERSION, 'index_configuration_sha256': configuration_sha256} for index in range(len(source_chunks))]
            for offset in range(0, len(ids), 100):
                collection.upsert(ids=ids[offset:offset + 100], documents=source_chunks[offset:offset + 100], metadatas=metadatas[offset:offset + 100])
            chunk_count += len(source_chunks)
        if self.snapshot() != source_hashes:
            raise RuntimeError('Vault sources changed during indexing; manifest was not published')
        payload = {'index_version': INDEX_VERSION, 'indexed_at': indexed_at, 'collection': self.collection_name, 'source_count': len(source_hashes), 'canonical_source_snapshot_sha256': canonical_digest(source_hashes), 'source_hashes': source_hashes, 'index_configuration': configuration, 'index_configuration_sha256': configuration_sha256, 'collection_count': collection.count(), 'changed_sources': changed, 'removed_sources': removed, 'indexed_chunks': chunk_count, 'duration_seconds': round(time.monotonic() - started, 3)}
        manifest = self.write_manifest(payload) if changed or removed or force_manifest or (not (self.manifests / 'latest.json').is_file()) else None
        if not quiet:
            print(f'Vault index synchronized: {len(changed)} changed, {len(removed)} removed, {chunk_count} chunks')
            print(f'Timestamp: {indexed_at}')
            if manifest is not None:
                try:
                    relative_manifest = manifest.relative_to(self.root)
                except ValueError:
                    relative_manifest = manifest
                print(f'Manifest: {relative_manifest}')
            else:
                print('Manifest: unchanged (no Vault source changes)')
        return payload

    def _current_manifest(self) -> tuple[dict, bytes]:
        raw = (self.manifests / 'latest.json').read_bytes()
        manifest = json.loads(raw)
        if manifest.get('index_configuration_sha256') != canonical_digest(self.index_configuration()):
            raise RuntimeError('Vault index configuration changed; synchronize before querying')
        if manifest.get('index_configuration_sha256') != canonical_digest(manifest.get('index_configuration')):
            raise RuntimeError('Vault manifest configuration binding is invalid')
        if manifest.get('canonical_source_snapshot_sha256') != canonical_digest(manifest.get('source_hashes')):
            raise RuntimeError('Vault manifest source binding is invalid')
        if manifest.get('source_hashes') != self.snapshot():
            raise RuntimeError('Vault index is stale for canonical sources; synchronize before querying')
        return (manifest, raw)

    def _snapshot_evidence_unlocked(self, text: str, supplemental: str | None, limit: int) -> dict:
        started = time.monotonic()
        sync_started = time.monotonic()
        self._sync_unlocked(quiet=True)
        sync_seconds = time.monotonic() - sync_started
        manifest, raw = self._current_manifest()
        queries = [{'text': text, 'limit': limit, 'results': self._query_unlocked(text, limit)}]
        if supplemental and supplemental != text:
            queries.append({'text': supplemental, 'limit': limit, 'results': self._query_unlocked(supplemental, limit)})
        after, after_raw = self._current_manifest()
        if raw != after_raw or manifest != after:
            raise RuntimeError('Vault index changed during retrieval')
        return {'kind': 'vault-query-snapshot-v1', 'index_manifest_sha256': hashlib.sha256(raw).hexdigest(), 'canonical_source_snapshot_sha256': manifest['canonical_source_snapshot_sha256'], 'source_hashes': manifest['source_hashes'], 'indexed_at': manifest['indexed_at'], 'index_configuration': manifest['index_configuration'], 'index_configuration_sha256': manifest['index_configuration_sha256'], 'queries': queries, 'timings': {'sync_seconds': round(sync_seconds, 6), 'total_seconds': round(time.monotonic() - started, 6)}}

    def _query_unlocked(self, text: str, limit: int=5) -> list[dict]:
        if limit <= 0:
            raise ValueError('Vault query limit must be positive')
        manifest, _ = self._current_manifest()
        collection = self.get_collection()
        if collection.count() != manifest['collection_count']:
            raise RuntimeError('Vault collection count does not match its manifest; synchronize before querying')
        if collection.count() == 0:
            return []
        results = collection.query(query_texts=[text], n_results=min(limit, collection.count()), include=['documents', 'metadatas', 'distances'])
        matches = []
        for document, metadata, distance in zip(results['documents'][0], results['metadatas'][0], results['distances'][0]):
            source = metadata['source']
            if metadata.get('source_sha256') != manifest['source_hashes'].get(source):
                raise RuntimeError('Vault query source hash does not match its manifest')
            if metadata.get('index_configuration_sha256') != manifest['index_configuration_sha256']:
                raise RuntimeError('Vault query configuration does not match its manifest')
            source_path = self.root / source
            raw_source = source_path.read_bytes()
            if hashlib.sha256(raw_source).hexdigest() != metadata['source_sha256']:
                raise RuntimeError('Vault query source changed during retrieval')
            canonical_chunks = chunks(read_source_text(source_path, raw_source)) or [f'Empty knowledge file: {source}']
            chunk = metadata['chunk']
            if type(chunk) is not int or not 0 <= chunk < len(canonical_chunks) or document != canonical_chunks[chunk]:
                raise RuntimeError('Vault query chunk does not match its canonical source')
            matches.append({'source': source, 'source_sha256': metadata['source_sha256'], 'chunk_sha256': hashlib.sha256(document.encode()).hexdigest(), 'index_configuration_sha256': metadata['index_configuration_sha256'], 'chunk': metadata['chunk'], 'indexed_at': metadata['indexed_at'], 'distance': round(float(distance), 6), 'text': document})
        return matches
