"""Closed deterministic verification of the actual portable Oracle source/export.

Local evidence is private. This profile issues technical VERIFIED evidence only;
proposal model execution never becomes completed-source approval.
"""
from __future__ import annotations
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import time
import uuid
try:
    from . import deterministic_source as native, validation_contract as contract
except ImportError:
    import deterministic_source as native, validation_contract as contract

KIND = 'boc-deterministic-oracle/1'
PROFILE = 'portable-actual-oracle/1'
CI_KIND = 'boc-deterministic-oracle-ci/1'
COMPONENT_BASE = '9e817aed58bb85f2799204c70d84b4cac181db58'
COMPONENT_SCOPE = 'COMPONENT_ARTIFACT_VERIFIED'
SOURCE_SCOPE = 'SOURCE_RANGE_VERIFIED'
LIVE_MODULE = 'tests/oracle-public-live-proposal.test.mjs'
EMBEDDING_URL = 'https://chroma-onnx-models.s3.amazonaws.com/all-MiniLM-L6-v2/onnx.tar.gz'
EMBEDDING_ARCHIVE_SHA256 = '913d7300ceae3b2dbc2c50d1de4baacab4be7b9380491c27fab7418616a16ec3'
# Literal reviewed source inventory. No controller or directory wildcard grants scope.
OWN_PATHS = frozenset(('.github/workflows/publication-safety.yml', 'LICENSE', 'NOTICE', 'package.json', 'tests/deterministic-lanes.test.mjs', 'tests/deterministic-oracle.test.mjs', 'tests/fixtures/oracle-public/catalog.json', 'tests/fixtures/oracle-public/corpus/architecture.md', 'tests/fixtures/oracle-public/export-map.json', 'tests/fixtures/oracle-public/policy.md', 'tests/fixtures/oracle-public/proposal.txt', 'tests/fixtures/oracle-public/relevance.json', 'tests/oracle-implementation-spec.test.mjs', 'tests/oracle-public-benchmark.test.mjs', 'tests/oracle-public-chroma.test.mjs', 'tests/oracle-public-core.test.mjs', 'tests/oracle-public-export.test.mjs', 'tests/oracle-public-live-proposal.test.mjs', 'tests/oracle-public-runner.test.mjs', 'tests/oracle_review_series.py', 'tests/oracle_spec_test.py', 'tests/privacy_coverage_test.py', 'tests/published_fixture.py', 'tools/codex_child_model.py', 'tools/deterministic-oracle.md', 'tools/deterministic_oracle.py', 'tools/deterministic_package.py', 'tools/export_oracle.py', 'tools/oracle-public-export.json', 'tools/oracle_approval.py', 'tools/oracle_core/__init__.py', 'tools/oracle_core/cli.py', 'tools/oracle_core/config.py', 'tools/oracle_core/context.py', 'tools/oracle_core/custody.py', 'tools/oracle_core/index.py', 'tools/oracle_core/lifecycle.py', 'tools/oracle_core/proposal.py', 'tools/oracle_core/runner.py', 'tools/oracle_core/seal.py', 'tools/oracle_core/spec.py', 'tools/oracle_lifecycle.py', 'tools/oracle_oc_adapter.py', 'tools/oracle_public/.github/workflows/ci.yml', 'tools/oracle_public/.gitignore', 'tools/oracle_public/README.md', 'tools/oracle_public/benchmarks/public_cases.json', 'tools/oracle_public/benchmarks/run.py', 'tools/oracle_public/corpus/example-architecture.md', 'tools/oracle_public/examples/proposal.txt', 'tools/oracle_public/oracle.project.json', 'tools/oracle_public/policy/example-policy.md', 'tools/oracle_public/pyproject.toml', 'tools/oracle_public/requirements.lock', 'tools/oracle_public/schemas/proposal-output.schema.json', 'tools/oracle_public/tests/test_export_boundary.py', 'tools/oracle_public/tests/test_proposal_to_spec.py', 'tools/oracle_public/tests/test_public_chroma.py', 'tools/oracle_public/tests/test_runner_contract.py', 'tools/oracle_public/validation-catalog.json', 'tools/oracle_spec_seal.py', 'tools/validation-catalog.json', 'tools/validation-selection.json', 'tools/validation_contract.py', 'tools/vault_index.py'))
CORE_INPUTS = frozenset(('.github/workflows/publication-safety.yml', 'LICENSE', 'NOTICE', 'package.json', 'tools/codex_child_model.py', 'tools/deterministic_oracle.py', 'tools/deterministic_package.py', 'tools/export_oracle.py', 'tools/oracle-public-export.json', 'tools/oracle_approval.py', 'tools/oracle_core/__init__.py', 'tools/oracle_core/cli.py', 'tools/oracle_core/config.py', 'tools/oracle_core/context.py', 'tools/oracle_core/custody.py', 'tools/oracle_core/index.py', 'tools/oracle_core/lifecycle.py', 'tools/oracle_core/proposal.py', 'tools/oracle_core/runner.py', 'tools/oracle_core/seal.py', 'tools/oracle_core/spec.py', 'tools/oracle_lifecycle.py', 'tools/oracle_oc_adapter.py', 'tools/oracle_public/.github/workflows/ci.yml', 'tools/oracle_public/.gitignore', 'tools/oracle_public/README.md', 'tools/oracle_public/benchmarks/public_cases.json', 'tools/oracle_public/benchmarks/run.py', 'tools/oracle_public/corpus/example-architecture.md', 'tools/oracle_public/examples/proposal.txt', 'tools/oracle_public/oracle.project.json', 'tools/oracle_public/policy/example-policy.md', 'tools/oracle_public/pyproject.toml', 'tools/oracle_public/requirements.lock', 'tools/oracle_public/schemas/proposal-output.schema.json', 'tools/oracle_public/tests/test_export_boundary.py', 'tools/oracle_public/tests/test_proposal_to_spec.py', 'tools/oracle_public/tests/test_public_chroma.py', 'tools/oracle_public/tests/test_runner_contract.py', 'tools/oracle_public/validation-catalog.json', 'tools/oracle_spec_seal.py', 'tools/validation-catalog.json', 'tools/validation_contract.py', 'tools/vault_index.py'))
PUBLIC_MEMBERS = frozenset(('.github/workflows/ci.yml', '.gitignore', 'LICENSE', 'NOTICE', 'README.md', 'benchmarks/public_cases.json', 'benchmarks/run.py', 'corpus/example-architecture.md', 'examples/proposal.txt', 'oracle-export-manifest.json', 'oracle.project.json', 'oracle_core/__init__.py', 'oracle_core/cli.py', 'oracle_core/config.py', 'oracle_core/context.py', 'oracle_core/custody.py', 'oracle_core/index.py', 'oracle_core/lifecycle.py', 'oracle_core/proposal.py', 'oracle_core/runner.py', 'oracle_core/seal.py', 'oracle_core/spec.py', 'policy/example-policy.md', 'pyproject.toml', 'requirements.lock', 'schemas/proposal-output.schema.json', 'tests/test_export_boundary.py', 'tests/test_proposal_to_spec.py', 'tests/test_public_chroma.py', 'tests/test_runner_contract.py', 'validation-catalog.json'))
ALIASES = {'oracle:source:validate': 'python3 -B tools/deterministic_oracle.py validate',
           'oracle:source:verify': 'python3 -B tools/deterministic_oracle.py verify',
           'oracle:public:export': 'python3 -B tools/export_oracle.py'}
PROFILE_METADATA = {'native_kind': 'boc-deterministic-oracle/1', 'ci_kind': 'boc-deterministic-oracle-ci/1', 'native_result': 'VERIFIED', 'ci_result': 'CI_ONLY', 'native_commands': 'complete current sealed spec commands plus immutable export and standalone tests', 'ci_omitted_native_only_module': 'tests/oracle-public-live-proposal.test.mjs', 'ci_reason': 'Actual existing-plan CLI proposal evidence stays native and private; public CI has no provider credentials or calls. CI_ONLY grants no standalone publication authority.', 'source_inventory_sha256': '6ef1da1582f81e110540208dadd3949025db13eb0f4b7736138ddfde85d1d518', 'runtime_source_count': 44, 'public_member_count': 31, 'budgets_seconds': {'structural': 120, 'chroma_export_benchmark': 60, 'native_proposal': 90, 'receipt_publication': 30}, 'automatic_install_or_download': False, 'artifact_only': {'cli_flag': '--artifact-only', 'verification_scope': 'COMPONENT_ARTIFACT_VERIFIED', 'source_publication': False, 'feature_base': 'exact genuine sealed proposal base', 'origin_observation': 'separate read-only metadata; never an OC source publication or synchronization claim', 'full_native_selected_commands': True, 'oc_push_promote': 'always refused for artifact-only receipts even if remote later matches'}}
NATIVE_INPUTS = ('tools/deterministic_source.py', 'tools/validation_contract.py',
                 'tools/oracle_spec_seal.py', 'tools/validation-catalog.json',
                 'tools/validation-selection.json', 'tools/deterministic_package.py',
                 'tools/publication_admission.py','tools/publication_status.py','tools/shipment_state.py',
                 'tools/oracle_parallel.py','tools/oracle_source_frontier.py','tools/command_coverage.py',
                 'tests/helpers/native-validation-git.mjs','tests/helpers/native-validation-state.mjs')


def directory(root):
    path = Path(native.git(root, 'rev-parse', '--absolute-git-dir')) / 'oracle/deterministic-oracle'
    if any(p.is_symlink() for p in (path, *path.parents)):
        raise ValueError('Literal private Oracle evidence directory required')
    return path


def regular(path):
    path = Path(path)
    if any(p.is_symlink() for p in (path, *path.parents)) or not stat.S_ISREG(path.stat().st_mode):
        raise ValueError('Regular unsubstituted evidence required')
    return path.read_bytes()


def member_inventory(root):
    return {name:{'sha256':native.digest(regular(Path(root)/name)),'size':(Path(root)/name).stat().st_size,'mode':stat.S_IMODE((Path(root)/name).stat().st_mode)} for name in sorted(PUBLIC_MEMBERS)}


def changed(root, base, source):
    if not all(re.fullmatch('[0-9a-f]{40}', s or '') for s in (base, source)):
        raise ValueError('Exact source and publication base required')
    native.git(root, 'merge-base', '--is-ancestor', base, source)
    paths = set()
    for revision in native.git(root, 'rev-list', base+'..'+source).splitlines():
        parents = native.git(root, 'show', '-s', '--format=%P', revision).split()
        if len(parents) not in (1, 2):
            raise ValueError('Unanchored or octopus Oracle history')
        if len(parents) == 2:
            anchored = [p for p in parents if subprocess.run(['git', 'merge-base', '--is-ancestor', p, base], cwd=root).returncode == 0]
            if len(anchored) != 1:
                raise ValueError('Oracle merge requires one published-base parent')
            edges = anchored
        else:
            edges = parents
        for parent in edges:
            paths.update(native.git(root, 'diff', '--name-only', parent, revision).splitlines())
    return sorted(paths)


def _component_paths(paths):
    triggers={'tools/deterministic_oracle.py','tools/deterministic-oracle.md',
              'tools/export_oracle.py','tools/oracle-public-export.json',
              'tests/deterministic-oracle.test.mjs'}
    return [name for name in paths if name in triggers or name.startswith(('tools/oracle_core/','tools/oracle_public/'))]


def component_present(root, base, source):
    return bool(_component_paths(changed(root,base,source)))


def applies(root, base, source):
    paths=changed(root,base,source);component=_component_paths(paths)
    # Unknown component files retain closed refusal, including mixed ranges.
    # Known mixed source uses the existing general native publication contract.
    return bool(component) and (any(name not in OWN_PATHS for name in component) or set(paths)<=OWN_PATHS)


def scope(root, base, source):
    paths = changed(root, base, source)
    if not paths or set(paths) - OWN_PATHS:
        raise ValueError('Outside closed public Oracle profile: '+repr(sorted(set(paths)-OWN_PATHS)))
    for name in paths:
        row = native.git(root, 'ls-tree', source, '--', name)
        if row and row.split()[0] not in ('100644', '100755'):
            raise ValueError('Oracle source must be regular: '+name)
    def blob(revision, name):
        return json.loads(native.git(root, 'show', revision+':'+name))
    if 'package.json' in paths:
        old, new = blob(base, 'package.json'), blob(source, 'package.json')
        prior = dict(old.get('scripts', {})); current = dict(new.get('scripts', {}))
        for name, value in ALIASES.items():
            if current.get(name) != value:
                raise ValueError('Exact Oracle package alias required')
            current.pop(name, None); prior.pop(name, None)
        old.pop('scripts', None); new.pop('scripts', None)
        if old != new or prior != current:
            raise ValueError('Oracle profile preserves product versions, dependencies and prior aliases')
    if 'tools/validation-catalog.json' in paths:
        old,new=blob(base,'tools/validation-catalog.json'),blob(source,'tools/validation-catalog.json')
        prior=dict(old.pop('deterministic_profiles',{}));current=dict(new.pop('deterministic_profiles',{}))
        enrolled=current.pop(PROFILE,None);prior.pop(PROFILE,None)
        if old!=new or prior!=current or enrolled!=PROFILE_METADATA:
            raise ValueError('Oracle enrollment preserves every other catalog/profile/check/criterion')
    contract.gate(root, base, source)
    return paths


def input_inventory(root, source):
    selected_spec=json.loads(native.git(root,'show',source+':tools/validation-selection.json'))
    fixtures={name for row in selected_spec['selection']['categories'] for name in [*row['tests'],*row['fixtures']]}
    if any(not name.startswith('tests/') or not contract.safe_path(name) or any(c in name for c in '*?[]') for name in fixtures):
        raise ValueError('Closed selected fixture paths required')
    selected = sorted(OWN_PATHS | set(NATIVE_INPUTS) | fixtures)
    rows = {}
    for name in selected:
        entry = native.git(root, 'ls-tree', source, '--', name).split()
        if len(entry) < 4 or entry[0] not in ('100644', '100755') or entry[1] != 'blob':
            raise ValueError('Missing regular committed Oracle input: '+name)
        body = regular(Path(root)/name)
        expected = subprocess.check_output(['git', '--no-replace-objects', 'show', source+':'+name], cwd=root)
        mode = '100755' if (Path(root)/name).stat().st_mode & 0o111 else '100644'
        if body != expected or mode != entry[0]:
            raise ValueError('Oracle input differs from committed bytes: '+name)
        rows[name] = dict(sha256=native.digest(body), mode=mode, blob=entry[2])
    return rows


def verify_public_model_archive(archive, destination):
    """Explicit CI provisioning only; validation never calls this as a fallback."""
    archive=Path(archive);destination=Path(destination)
    if archive.stat().st_size>256*1024*1024 or native.digest(regular(archive))!=EMBEDDING_ARCHIVE_SHA256:
        raise ValueError('Public embedding archive digest/bound differs')
    with tarfile.open(archive,'r:gz') as tar:
        members=tar.getmembers();names=[m.name for m in members]
        if len(names)!=len(set(names)) or sum(m.size for m in members)>512*1024*1024:
            raise ValueError('Bounded unique model members required')
        for member in members:
            name=Path(member.name)
            if name.is_absolute() or '..' in name.parts or not name.parts or name.parts[0]!='onnx' or not(member.isdir() or member.isfile()):
                raise ValueError('Unsafe public embedding archive member')
            path=destination/name
            if any(p.is_symlink() for p in (path,*path.parents)):raise ValueError('Substituted CI cache path')
        for member in members:
            path=destination/member.name
            if member.isdir():path.mkdir(parents=True,exist_ok=True);continue
            body=tar.extractfile(member).read();path.parent.mkdir(parents=True,exist_ok=True)
            if path.exists():
                if regular(path)!=body:raise ValueError('Existing public cache differs')
            else:
                with path.open('xb') as stream:stream.write(body)
    if not(destination/'onnx/model.onnx').is_file():raise ValueError('Public embedding model missing')
    return {'url':EMBEDDING_URL,'sha256':EMBEDDING_ARCHIVE_SHA256,'size':archive.stat().st_size}


def python_runtime(root):
    executable = Path(os.environ.get('ORACLE_PUBLIC_PYTHON', str(Path(root)/'Vault/index/venv/bin/python')))
    if not executable.is_absolute() or not executable.is_file():
        raise ValueError('Existing explicit Chroma Python runtime required; no installation fallback')
    probe = r'''import hashlib,importlib.metadata as m,json,pathlib,re,sys
import chromadb,onnxruntime
if sys.version_info[:3]!=(3,13,5):raise RuntimeError('Declared Python3.13.5 required')
pins={}
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
 match=re.fullmatch(r'([A-Za-z0-9_.-]+)==([^\s;]+)\s*\\?',line)
 if match:
  name,version=match.groups()
  if name in pins or m.version(name)!=version:raise RuntimeError('Installed dependency differs from declared lock')
  pins[name]=version
if not pins:raise RuntimeError('Nonempty declared dependency lock required')
from chromadb.utils.embedding_functions.onnx_mini_lm_l6_v2 import ONNXMiniLM_L6_V2
cache=pathlib.Path(ONNXMiniLM_L6_V2.DOWNLOAD_PATH)/'onnx'
if not cache.is_dir() or not (cache/'model.onnx').is_file():raise RuntimeError('Existing embedding cache required; downloads forbidden')
files={}
for dist in m.distributions():
 for name in dist.files or ():
  p=pathlib.Path(dist.locate_file(name))
  if p.is_file() and p.suffix not in ('.pyc','.pyo'):
   files[str(p.resolve())]=hashlib.sha256(p.read_bytes()).hexdigest()
cachefiles={str(p.relative_to(cache)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(cache.rglob('*')) if p.is_file()}
print(json.dumps({'python':sys.version,'prefix':sys.prefix,'chromadb':m.version('chromadb'),'onnxruntime':m.version('onnxruntime'),'locked_versions':pins,'dependencies_sha256':hashlib.sha256(json.dumps(files,sort_keys=True).encode()).hexdigest(),'embedding_cache_sha256':hashlib.sha256(json.dumps(cachefiles,sort_keys=True).encode()).hexdigest()}))'''
    p = subprocess.run([str(executable), '-B', '-c', probe, str(Path(root)/'tools/oracle_public/requirements.lock')], cwd=root, capture_output=True, timeout=60)
    if p.returncode:
        raise ValueError('Existing Chroma runtime/cache unavailable; no automatic install/download')
    value = json.loads(p.stdout)
    value.update(executable=str(executable), executable_sha256=native.digest(executable.resolve().read_bytes()))
    return value


def identity(root, *, native_proposal=True):
    if native.git(root, 'ls-files', '-v') and any(line[0].islower() or line[0]=='S' for line in native.git(root, 'ls-files', '-v').splitlines()):
        raise ValueError('Hidden worktree flags are forbidden')
    value = native.identity(root)
    value['inputs'] = input_inventory(root, value['source'])
    value['oracle_runtime'] = python_runtime(root)
    value['environment_sha256'] = native.digest(native.encoded(dict(os.environ)))
    value['proposal_cli']=None
    if native_proposal:
        config=json.loads(regular(Path(root)/'tools/oracle_public/oracle.project.json'))
        settings=config['runner'];binary=shutil.which(settings['executable'])
        if not binary:raise ValueError('Explicit existing native proposal CLI unavailable')
        value['proposal_cli']={'engine':settings['engine'],'model':settings['model'],'executable_sha256':native.digest(Path(binary).resolve().read_bytes())}
    return value


def run(root, command, store, timeout=60, *, cwd=None):
    began=time.time()
    try:
        p=subprocess.Popen(command,cwd=cwd or root,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        try:stdout,stderr=p.communicate(timeout=timeout);code=p.returncode
        except subprocess.TimeoutExpired:
            try:os.killpg(p.pid,signal.SIGTERM)
            except ProcessLookupError:pass
            try:stdout,stderr=p.communicate(timeout=2)
            except subprocess.TimeoutExpired:
                try:os.killpg(p.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                stdout,stderr=p.communicate(timeout=2)
            code='TIMEOUT'
        output=stdout+b'\n'+stderr
    except OSError as error:
        output=str(error).encode();code='EXECUTION_ERROR'
    checksum=native.digest(output); path=store/(checksum+'.log')
    if not path.exists():native.private_write(path, output)
    return {'command':command,'exit_code':code,'output_sha256':checksum,
            'started_at':began,'completed_at':time.time()}, output


def load_exporter(root):
    spec=importlib.util.spec_from_file_location('oracle_public_export_verifier',Path(root)/'tools/export_oracle.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module


def export_proof(root, source, store, executable):
    target=store/'export'
    row, output=run(root,[sys.executable,'-B','tools/export_oracle.py','--commit',source,'--output',str(target)],store)
    if row['exit_code']!=0:raise ValueError('Exact immutable Oracle export failed')
    receipt=json.loads((target/'oracle-export-receipt.json').read_bytes())
    if (receipt.get('kind')!='oracle-public-export-receipt' or receipt.get('source_commit')!=source
            or receipt.get('source_tree')!=native.git(root,'rev-parse',source+'^{tree}')
            or {x['path'] for x in receipt['members']}!=PUBLIC_MEMBERS or len(receipt['members'])!=len(PUBLIC_MEMBERS)
            or receipt['archive']['file']!='oracle-public.tar.gz'):
        raise ValueError('Closed export member/source binding differs')
    archive=target/receipt['archive']['file']
    raw=regular(archive)
    if native.digest(raw)!=receipt['archive']['sha256'] or len(raw)!=receipt['archive']['size']:
        raise ValueError('Export archive bytes differ')
    export_oracle=load_exporter(root)
    export_oracle.verify_archive(archive,receipt)
    standalone=store/'standalone';standalone.mkdir()
    with tarfile.open(archive,'r:gz') as tar:
        for member in tar.getmembers():
            if member.name not in PUBLIC_MEMBERS or not member.isfile() or Path(member.name).is_absolute() or '..' in Path(member.name).parts:
                raise ValueError('Unsafe standalone export member')
            p=standalone/member.name;p.parent.mkdir(parents=True,exist_ok=True)
            with p.open('xb') as stream:stream.write(tar.extractfile(member).read())
            p.chmod(member.mode)
    upstream_witness(root,source,standalone)
    inventory=member_inventory(standalone)
    return {'receipt':receipt,'receipt_sha256':native.digest(regular(target/'oracle-export-receipt.json')),
            'archive_path':str(archive),'standalone_inputs':inventory,'runs':[row]}


@contextmanager
def cohort_environment(store, executable):
    root=store/'standalone'
    values={'ORACLE_PUBLIC_EXPORTED_ROOT':str(root),'ORACLE_PUBLIC_SHARED_STATE':str(root/'.oracle'),
            'ORACLE_PUBLIC_PYTHON':str(executable)}
    previous={key:os.environ.get(key) for key in values}
    os.environ.update(values)
    try:yield values
    finally:
        for key,value in previous.items():
            if value is None:os.environ.pop(key,None)
            else:os.environ[key]=value


def standalone_proof(root, store, artifact, executable):
    standalone=store/'standalone'
    # Isolated Python sees only the public artifact and its installed dependencies.
    launch="import sys,unittest;sys.path.insert(0,sys.argv[1]);s=unittest.defaultTestLoader.discover('tests');r=unittest.TextTestRunner(verbosity=2).run(s);sys.exit(not r.wasSuccessful())"
    test, output=run(root,[executable,'-B','-I','-c',launch,str(standalone)],store,cwd=standalone)
    required_modules=[Path(n).stem for n in PUBLIC_MEMBERS if n.startswith('tests/') and n.endswith('.py')]
    if any(not re.search(rb'\('+re.escape(n.encode())+rb'\.',output) for n in required_modules):
        raise ValueError('Every exported standalone test module must execute')
    if (test['exit_code']!=0 or not re.search(rb'Ran [1-9][0-9]* tests? in',output)
            or not re.search(rb'\nOK\s*$',output) or re.search(rb'(?i)skipped|expected failure|unexpected success',output)):
        raise ValueError('Standalone Oracle tests incomplete or skipped')
    if artifact['standalone_inputs']!=member_inventory(standalone):
        raise ValueError('Standalone inputs changed during verification')
    return dict(artifact,runs=[*artifact['runs'],test])


def upstream_witness(root, source, artifact, completed=None):
    """Keep the sealed upstream independent of the exported tool source pin."""
    selected=json.loads(native.git(root,'show',source+':tools/validation-selection.json'))
    origin=selected.get('stamp',{}).get('origin_main')
    manifest=json.loads(regular(Path(artifact)/'oracle-export-manifest.json'))
    if not isinstance(origin,str) or not re.fullmatch('[a-f0-9]{40}',origin) or manifest.get('origin_main')!=origin:
        raise ValueError('Export upstream differs from the immutable candidate native stamp')
    if completed is not None:
        if completed.get('provenance',{}).get('origin_main')!=origin:
            raise ValueError('Native proposal upstream differs from the immutable export')
        spec=completed.get('spec')
        if completed.get('status')=='APPROVED':
            if not isinstance(spec,dict) or spec.get('stamp',{}).get('origin_main')!=origin:
                raise ValueError('Materialized native spec upstream differs')
        elif completed.get('status')=='REJECTED':
            if spec is not None or not completed.get('review',{}).get('findings'):
                raise ValueError('Rejected native proposal needs findings and no invented spec')
        else:raise ValueError('Complete native proposal outcome required')
    return origin


def native_proposal_witness(store, source, tree, *, root):
    state=store/'standalone/.oracle/operations'
    found=[]
    for path in state.glob('*/completed.json'):
        value=json.loads(regular(path))
        if value.get('provenance',{}).get('execution_mode')=='native_cli':found.append((path,value))
    if len(found)!=1:raise ValueError('Exactly one actual native CLI proposal witness required; synthetic evidence never substitutes')
    path,value=found[0];provenance=value['provenance'];operation=path.parent
    if (value.get('status') not in ('APPROVED','REJECTED') or value.get('operation')!=operation.name
            or provenance.get('source_commit')!=source or provenance.get('source_tree')!=tree):
        raise ValueError('Native proposal source/operation/outcome differs')
    artifact=store/'standalone'
    origin=upstream_witness(root,source,artifact,value)
    expected_core={Path(name).name:native.digest(regular(artifact/name)) for name in sorted(PUBLIC_MEMBERS) if name.startswith('oracle_core/') and name.endswith('.py')}
    expected_core_hash=native.digest(json.dumps(expected_core,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())
    if provenance.get('core_sha256')!=expected_core_hash or provenance.get('config_sha256')!=native.digest(regular(artifact/'oracle.project.json')):
        raise ValueError('Native proposal core/configuration differs from immutable export')
    inputs=json.loads(regular(operation/'inputs.json'));runtime=json.loads(regular(operation/'runtime.json'))
    config=json.loads(regular(artifact/'oracle.project.json'))
    binary=shutil.which(config['runner']['executable'])
    if not binary or runtime.get('executable_sha256')!=native.digest(Path(binary).resolve().read_bytes()) or runtime.get('engine')!=config['runner']['engine'] or runtime.get('model')!=config['runner']['model']:
        raise ValueError('Native proposal configured engine/model/executable changed')
    process=json.loads(regular(operation/'process.json'))
    if inputs.get('proposal')!=regular(artifact/'examples/proposal.txt').decode():raise ValueError('Native demonstration must use exact public example proposal')
    binding=inputs.get('binding',{})
    # Core custody uses canonical JSON without a newline for identity hashing.
    canonical=lambda v:json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
    if native.digest(canonical(binding))!=operation.name or binding.get('execution_mode')!='native_cli' or binding.get('runtime')!=runtime or provenance.get('runtime')!=runtime:
        raise ValueError('Native proposal runtime/binding differs')
    if (runtime.get('engine') not in ('codex','claude') or not runtime.get('model')
            or not re.fullmatch('[a-f0-9]{64}',runtime.get('executable_sha256',''))
            or not 0<runtime.get('timeout_seconds',0)<=90
            or runtime.get('capabilities')!={'sandbox':'read-only','apps':False,'mcp':False,'shell':False,'automatic_project_context':False}
            or process.get('exit_code')!=0 or process.get('failure') is not None
            or not isinstance(process.get('seconds'),(int,float)) or not 0<=process['seconds']<=90):
        raise ValueError('Native proposal process/capability limits did not verify')
    for name in ('stdout','stderr'):
        if native.digest(regular(operation/(name+'.log')))!=process.get(name+'_sha256'):
            raise ValueError('Original native model output changed')
    files={}
    for name in ('completed.json','inputs.json','invocation.json','runtime.json','process.json','result.json','stdout.log','stderr.log'):
        f=operation/name;files[str(f.relative_to(store))]=native.digest(regular(f))
    return {'execution_mode':'native_cli','operation':operation.name,'status':value['status'],
            'source_commit':source,'source_tree':tree,'origin_main':origin,'runtime':runtime,'process':process,'files':files}


def validate(root, base, requested_at, *, ci=False, artifact_only=False):
    if type(artifact_only) is not bool:raise ValueError('Closed artifact-only mode required')
    if artifact_only and base!=COMPONENT_BASE:raise ValueError('Artifact verification retains the original component base')
    if ci:
        if artifact_only:raise ValueError('CI_ONLY never becomes full component-artifact verification')
        return validate_ci(root,base,requested_at)
    start=None if requested_at=='unknown' else datetime.fromisoformat(requested_at.replace('Z','+00:00'))
    if start is not None and (start.tzinfo is None or start>datetime.now(timezone.utc)):
        raise ValueError('Original timezone-aware request time required')
    initial=native.identity(root); paths=scope(root,base,initial['source'])
    if contract.gate(root,base,initial['source'])['status']!='SPEC_SEALED':raise ValueError('Exact Oracle feature spec required')
    contract.native_origin(root,initial['source'])
    origin_observed=observe_origin(root) if artifact_only else None
    store=directory(root)/str(time.time_ns());store.mkdir(parents=True,mode=0o700)
    failure={'kind':KIND+'-failure','identity':initial,'base':base,'request_started_at':requested_at}
    try:
        executable=python_runtime(root)['executable']
        artifact=export_proof(root,initial['source'],store,executable)
        with cohort_environment(store,executable):
            before=identity(root)
            selected=native.spec_runs(root,base,before['source'],store,failure,ci=ci)
            witness=native_proposal_witness(store,before['source'],before['tree'],root=root)
            artifact=standalone_proof(root,store,artifact,executable)
            if identity(root)!=before:raise ValueError('Source/runtime/dependencies/environment changed during Oracle verification')
    except (ValueError,OSError,KeyError,TypeError,subprocess.SubprocessError) as error:
        native.private_write(store/'failure.json',native.encoded(dict(failure,error=type(error).__name__)))
        raise
    value={'kind':KIND,'profile':PROFILE,'status':'VERIFIED',**before,'base':base,'paths':paths,
           'spec_runs':selected,'spec_mode':'native','export':artifact,'native_proposal':witness,'store':str(store),
           'request_started_at':requested_at,'completed_at':time.time(),'source_only':True,
           'verification_scope':COMPONENT_SCOPE if artifact_only else SOURCE_SCOPE,
           'source_publication':not artifact_only,'origin_main_observed':origin_observed,
           'deployment_authorized':False,'sla_status':'BREACHED_ORIGINAL_TIME_UNAVAILABLE' if start is None else
           ('BREACHED' if time.time()-start.timestamp()>300 else 'NOT_ESTABLISHED')}
    value['sha256']=native.digest(native.encoded(value));native.private_write(store/'receipt.json',native.encoded(value))
    return verify(root)


def verify(root):
    source=native.git(root,'rev-parse','HEAD'); found=[]
    for path in directory(root).glob('*/receipt.json'):
        value=json.loads(regular(path))
        if value.get('source')==source:found.append((value.get('completed_at',0),path,value))
    if not found:raise ValueError('No native Oracle verification for this exact candidate')
    _,path,value=max(found,key=lambda row:row[0]); checksum=value.pop('sha256')
    if (native.digest(native.encoded(value))!=checksum or value.get('kind')!=KIND or value.get('profile')!=PROFILE
            or value.get('status')!='VERIFIED' or value.get('spec_mode')!='native'):
        raise ValueError('Invalid deterministic Oracle receipt')
    store=path.parent
    executable=value['oracle_runtime'].get('executable')
    if executable is None:raise ValueError('Bound native Python runtime missing')
    with cohort_environment(store,executable):current=identity(root)
    if value.get('verification_scope') not in (COMPONENT_SCOPE,SOURCE_SCOPE) or value.get('source_publication') is not (value.get('verification_scope')==SOURCE_SCOPE):
        raise ValueError('Native verification purpose changed')
    if value['verification_scope']==COMPONENT_SCOPE:
        observed=value.get('origin_main_observed')
        if (value['base']!=COMPONENT_BASE or not isinstance(observed,dict)
                or set(observed)!={'repository','commit','ref','observed_at','source_publication_claimed'}
                or observed['repository']!=native.REPOSITORY or observed['ref']!='refs/heads/main'
                or not re.fullmatch('[a-f0-9]{40}',observed.get('commit',''))
                or type(observed.get('observed_at')) not in (float,int) or observed['observed_at']>time.time()
                or observed['source_publication_claimed'] is not False):
            raise ValueError('Original component scope/origin observation missing or changed')
    if any(value.get(k)!=v for k,v in current.items()) or scope(root,value['base'],current['source'])!=value['paths']:
        raise ValueError('Oracle committed inputs/runtime/scope changed')
    store=Path(value['store'])
    if store!=path.parent:raise ValueError('Oracle evidence directory differs')
    for failure in directory(root).glob('*/failure.json'):
        failed=json.loads(regular(failure))
        if failed.get('identity',{}).get('source')==current['source'] and failure.parent.name>store.name:
            raise ValueError('A later native Oracle failure invalidated readiness')
    native.check_spec_runs(root,value['base'],current['source'],value['spec_runs'],store,receipt_completed=value['completed_at'],mode='native')
    if native_proposal_witness(store,current['source'],current['tree'],root=root)!=value.get('native_proposal'):
        raise ValueError('Original actual proposal witness changed')
    export=value['export']; receipt=export['receipt']; archive=Path(export['archive_path'])
    if archive!=store/'export/oracle-public.tar.gz' or native.digest(regular(archive))!=receipt['archive']['sha256']:
        raise ValueError('Original Oracle archive changed')
    if native.digest(regular(store/'export/oracle-export-receipt.json'))!=export['receipt_sha256']:
        raise ValueError('Original Oracle export receipt changed')
    export_oracle=load_exporter(root)
    export_oracle.verify_archive(archive,receipt)
    for row in export['runs']:
        if row['exit_code']!=0 or native.digest(regular(store/(row['output_sha256']+'.log')))!=row['output_sha256']:
            raise ValueError('Original Oracle export/standalone output changed')
    if export['standalone_inputs']!=member_inventory(store/'standalone'):
        raise ValueError('Original standalone Oracle input changed')
    return dict(value,sha256=checksum)


def offline_commands(rows):
    """The approved CI-only projection; every other selected test remains exact."""
    result=[];omitted=[]
    for row in rows:
        current=dict(row)
        if LIVE_MODULE in row['tests']:
            if row['category']!='acceptance' or row['tests'].count(LIVE_MODULE)!=1 or row['argv'].count(LIVE_MODULE)!=1:
                raise ValueError('Native-only proposal module has an ambiguous selected vector')
            current['tests']=[name for name in row['tests'] if name!=LIVE_MODULE]
            current['argv']=[arg for arg in row['argv'] if arg!=LIVE_MODULE]
            omitted.append(LIVE_MODULE)
            if not current['tests']:raise ValueError('CI acceptance projection cannot be empty')
        result.append(current)
    if omitted!=[LIVE_MODULE]:raise ValueError('CI projection requires exactly the selected native-only proposal module')
    return result


def validate_ci(root,base,requested_at):
    initial=native.identity(root);paths=scope(root,base,initial['source'])
    if contract.gate(root,base,initial['source'])['status']!='SPEC_SEALED':raise ValueError('Current sealed Oracle feature spec required')
    selected=native.selected_commands(root,base,initial['source']);projection=offline_commands(selected)
    store=directory(root)/str(time.time_ns());store.mkdir(parents=True,mode=0o700)
    failure={'kind':CI_KIND+'-failure','identity':initial,'base':base}
    try:
        executable=python_runtime(root)['executable']
        artifact=export_proof(root,initial['source'],store,executable)
        with cohort_environment(store,executable):
            before=identity(root,native_proposal=False);rows=[]
            for row in projection:
                outcome,output=run(root,row['argv'],store,timeout=60 if row['category']=='acceptance' else 120)
                outcome.update(category=row['category'],tests=row['tests'])
                rows.append(outcome)
                if outcome['exit_code']!=0 or not contract.result_summary(output.decode('utf-8','replace'),outcome['exit_code'],bool(row['tests']))['passed']:
                    raise ValueError('CI-only exact deterministic category did not completely pass')
            artifact=standalone_proof(root,store,artifact,executable)
            if identity(root,native_proposal=False)!=before:raise ValueError('CI-only source/runtime/dependencies changed')
    except (ValueError,OSError,KeyError,TypeError,subprocess.SubprocessError) as error:
        native.private_write(store/'failure.json',native.encoded(dict(failure,error=type(error).__name__)))
        raise
    value={'kind':CI_KIND,'profile':PROFILE,'status':'CI_ONLY',**before,'base':base,'paths':paths,
           'commands':projection,'runs':rows,'export':artifact,'native_only_module':LIVE_MODULE,
           'native_model_executed':False,'publication_authorized':False,'deployment_authorized':False,
           'store':str(store),'request_started_at':requested_at,'completed_at':time.time(),'sla_status':'CI_PHASE_ONLY'}
    value['sha256']=native.digest(native.encoded(value));native.private_write(store/'ci-receipt.json',native.encoded(value))
    return value


def observe_origin(root):
    destinations=native.git(root,'remote','get-url','--push','--all','origin').splitlines()
    allowed={'https://github.com/'+native.REPOSITORY+x for x in ('','.git')}|{'git'+chr(64)+'github.com:'+native.REPOSITORY+'.git'}
    if len(destinations)!=1 or destinations[0] not in allowed:raise ValueError('Exact OC origin required for component provenance')
    value=native.git(root,'ls-remote',destinations[0],'refs/heads/main').split()
    if len(value)!=2 or not re.fullmatch('[a-f0-9]{40}',value[0]) or value[1]!='refs/heads/main':
        raise ValueError('Actual OC origin main observation unavailable')
    return {'repository':native.REPOSITORY,'commit':value[0],'ref':value[1],'observed_at':time.time(),'source_publication_claimed':False}


def publish(root, ref, *, promote=False):
    value=verify(root)  # CI_ONLY is deliberately never accepted here.
    if value.get('verification_scope')!=SOURCE_SCOPE or value.get('source_publication') is not True:
        raise ValueError('Artifact-only evidence never authorizes OC source push or promotion')
    if not re.fullmatch(r'codex/source-oracle-[a-z0-9-]+',ref or ''):
        raise ValueError('Exact Oracle source review ref required')
    destinations=native.git(root,'remote','get-url','--push','--all','origin').splitlines()
    allowed={'https://github.com/'+native.REPOSITORY+x for x in ('','.git')}|{'git'+chr(64)+'github.com:'+native.REPOSITORY+'.git'}
    if len(destinations)!=1 or destinations[0] not in allowed:raise ValueError('Exact OC source destination required')
    remote=destinations[0];target='refs/heads/main' if promote else 'refs/heads/'+ref
    def head(name):
        rows=native.git(root,'ls-remote',remote,name).split()
        return rows[0] if rows else None
    main=head('refs/heads/main')
    if main not in (value['base'],value['source']):raise ValueError('Publication base moved; reconcile source')
    observed=None
    if promote:
        if head('refs/heads/'+ref)!=value['source']:raise ValueError('Oracle review ref differs from verified source')
        try:from . import deterministic_package as package
        except ImportError:import deterministic_package as package
        observed=package.ci_observation(value['source'],ref)
        # Existing exact-source Actions consumer requires the fixed repository job/step.
        verify(root)
    actual=head(target)
    if actual==value['source']:
        return {'kind':KIND,'status':'PUBLICATION_RECONCILED','source':value['source'],'deployment_authorized':False}
    if actual is not None and (not promote or actual!=value['base']):raise ValueError('Oracle destination ref already differs')
    store=Path(value['store']);intent=store/('promote-intent.json' if promote else 'push-intent.json')
    if intent.exists():raise ValueError('Prior publication outcome is uncertain; reconcile remote state, never replay blindly')
    command=['git','push']
    if promote:command+=['--force-with-lease=refs/heads/main:'+value['base']]
    command += [remote,value['source']+':'+target]
    native.private_write(intent,native.encoded({'kind':KIND+'-publication-intent','source':value['source'],'base':value['base'],'target':target,'started_at':time.time(),'ci_observation_sha256':native.digest(native.encoded(observed)) if observed else None}))
    row,output=run(root,command,store,timeout=120)
    delivered=head(target)==value['source']
    native.private_write(store/('promote-outcome.json' if promote else 'push-outcome.json'),native.encoded({'kind':KIND+'-publication-outcome','delivered':delivered,'run':row,'completed_at':time.time()}))
    if not delivered or row['exit_code']!=0:raise ValueError('Oracle publication uncertain; original attempt retained, read back before any next effect')
    return {'kind':KIND,'status':'SOURCE_PUBLISHED' if promote else 'SOURCE_PUSHED','source':value['source'],'deployment_authorized':False}


def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=('validate','verify','status','ci','push','promote'))
    parser.add_argument('--base');parser.add_argument('--requested-at',default='unknown');parser.add_argument('--ref');parser.add_argument('--artifact-only',action='store_true')
    args=parser.parse_args(argv);root=Path(native.git(Path.cwd(),'rev-parse','--show-toplevel'))
    if args.artifact_only and args.action not in ('validate','verify','status'):raise ValueError('Artifact-only mode cannot dispatch OC publication or CI')
    if args.action in ('verify','status'):
        result=verify(root)
        if args.artifact_only and result['verification_scope']!=COMPONENT_SCOPE:raise ValueError('Component-artifact proof required')
    elif args.action in ('push','promote'):result=publish(root,args.ref,promote=args.action=='promote')
    else:result=validate(root,args.base,args.requested_at,ci=args.action=='ci',artifact_only=args.artifact_only)
    print(json.dumps({k:result[k] for k in ('kind','profile','status','verification_scope','source_publication','source','sla_status','deployment_authorized') if k in result}));return 0

if __name__=='__main__':
    try:raise SystemExit(main())
    except (ValueError,OSError,KeyError,TypeError,subprocess.SubprocessError) as error:
        print(str(error),file=sys.stderr);raise SystemExit(1)
