"""Portable deterministic source maintenance; no model or package release authority."""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
try: from . import validation_contract as contract
except ImportError: import validation_contract as contract

KIND = 'boc-deterministic-source/1'
REPOSITORY = 'cody-marcel-dfsm/bos_operations_ceneter'
ALLOWED = {'AGENTS.md', 'tools/deterministic_source.py', 'tools/deterministic-source.md',
           'tests/deterministic_source_test.py', '.github/workflows/publication-safety.yml',
           '.agents/skills/operations-center-implementation/SKILL.md',
           'tools/validation_contract.py', 'tools/validation-contract.md', 'tests/validation_contract_test.py',
           # Owner direction 2026-11-11: every non-docs change carries its sealed Oracle spec.
           'tools/validation-selection.json', 'tools/oracle_spec_seal.py'}
CHECKS = [['npm', 'run', 'check:privacy'], ['npm', 'run', 'check:publication'],
          [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'deterministic_source_test.py', '-v'],
          [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'validation_contract_test.py', '-v']]

def digest(value): return hashlib.sha256(value).hexdigest()
def encoded(value): return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()
def git(root, *args): return subprocess.check_output(['git', '--no-replace-objects', *args], cwd=root, text=True).strip()

def scope(root, base, source):
    if not all(re.fullmatch('[0-9a-f]{40}', x or '') for x in (base, source)):
        raise ValueError('Exact source and publication base are required')
    git(root, 'merge-base', '--is-ancestor', base, source)
    paths = set()
    for commit in git(root, 'rev-list', base+'..'+source).splitlines():
        parents = git(root, 'show', '-s', '--format=%P', commit).split()
        if len(parents) != 1 and not (commit == source and len(parents) == 2 and
                git(root, 'rev-parse', commit+'^{tree}') == git(root, 'rev-parse', parents[1]+'^{tree}')):
            raise ValueError('Unexpected merge or rewritten source tree')
        for parent in parents:
            paths.update(git(root, 'diff', '--name-only', parent, commit).splitlines())
    if not paths or paths - ALLOWED:
        raise ValueError('Outside narrowly admitted source maintenance: '+repr(sorted(paths - ALLOWED)))
    contract.gate(root, base, source)  # Missing or mismatched sealed spec fails immediately.
    return sorted(paths)

def runtime(root):
    result = {}
    for name, location in [('python', sys.executable), ('node', shutil.which('node')), ('npm', shutil.which('npm'))]:
        if not location: raise ValueError('Missing required runtime '+name)
        p=Path(location).resolve();result[name]={'path':str(p),'sha256':digest(p.read_bytes())}
    deps=[];directory=Path(root)/'node_modules'
    if not directory.is_dir():raise ValueError('Install the committed dependency lock first')
    for p in sorted(directory.rglob('*')):
        if p.is_symlink():
            if not p.resolve().is_relative_to(directory.resolve()):raise ValueError('Dependency link escapes installed tree')
            deps.append([str(p.relative_to(directory)), 'link', os.readlink(p)])
        elif p.is_file():deps.append([str(p.relative_to(directory)), p.stat().st_mode, digest(p.read_bytes())])
    result['dependencies']=digest(encoded(deps))
    result['environment']=digest(encoded({k:os.environ.get(k) for k in ['PATH','NODE_PATH','NODE_OPTIONS','PYTHONPATH','PYTHONHOME','LANG','LC_ALL']}))
    return result

def identity(root):
    if git(root,'status','--porcelain','--untracked-files=all'):raise ValueError('Clean committed source is required')
    return {'source':git(root,'rev-parse','HEAD'),'tree':git(root,'rev-parse','HEAD^{tree}'),'runtime':runtime(root)}

def directory(root):return Path(git(root,'rev-parse','--absolute-git-dir'))/'oracle/deterministic-source'
def private_write(path, value):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    with path.open('xb') as stream:os.chmod(path,0o600);stream.write(value)

def validate(root, base, requested_at, *, ci=False):
    start=datetime.fromisoformat(requested_at.replace('Z','+00:00'))
    if start.tzinfo is None or start>datetime.now(timezone.utc):raise ValueError('Original request clock is required')
    before=identity(root);paths=scope(root,base,before['source']);runs=[];store=directory(root)
    if not ci and contract.gate(root,base,before['source'])['status']=='SPEC_SEALED':contract.native_origin(root,before['source'])
    for command in CHECKS:
        began=time.time()
        try:
            run=subprocess.run(command,cwd=root,capture_output=True,timeout=300)
            output=run.stdout+b'\n'+run.stderr;code=run.returncode
        except subprocess.TimeoutExpired as error:
            output=(error.stdout or b'')+b'\n'+(error.stderr or b'');code='TIMEOUT'
        key=digest(output);path=store/(key+'.log')
        if not path.exists():private_write(path,output)
        row={'command':command,'exit_code':code,'output_sha256':key,'started_at':began,'completed_at':time.time()};runs.append(row)
        if code != 0 or ('unittest' in command and (not re.search(rb'Ran [1-9][0-9]* tests? in',output) or not re.search(rb'\nOK\s*$',output) or b'skipped=' in output)):
            private_write(store/(str(time.time_ns())+'.failure.json'),encoded({'kind':KIND+'-failure','identity':before,'base':base,'request_started_at':requested_at,'runs':runs}))
            raise ValueError('Incomplete deterministic command; retained '+str(path))
    selected=spec_runs(root,base,before['source'],store,{'kind':KIND+'-failure','identity':before,'base':base,'request_started_at':requested_at,'runs':runs},ci=ci)
    if identity(root)!=before:raise ValueError('Source or runtime changed during execution')
    value={'kind':KIND,'status':'VERIFIED','base':base,'paths':paths,**before,'runs':runs,'spec_runs':selected,'request_started_at':requested_at,
           'sla_status':'FAILED' if time.time()-start.timestamp()>120 else 'NOT_ESTABLISHED','source_only':True}
    value['spec_mode']='ci' if ci else 'native'
    value['sha256']=digest(encoded(value));target=store/(before['source']+'.json')
    # A repaired same-candidate retry gets new immutable evidence; prior executions survive.
    if target.exists():target=store/(before['source']+'.'+str(time.time_ns())+'.json')
    private_write(target,encoded(value))
    return verify(root)

def selected_commands(root, base, source):
    """The sealed spec's selected category commands for this range (none for docs-only)."""
    if contract.gate(root, base, source)['status'] != 'SPEC_SEALED':
        return []
    return contract.verify(root, source)['commands']

def spec_runs(root, base, source, store, failure, *, ci=False):
    """Execute every spec-selected category completely; a failure retains output and issues nothing.

    Locally each category runs through the native runner, which also enforces the bug-fix
    fail-before reproduction and records its result. A CI host has a different runtime and
    no owner-local reproduction, so it executes the selected argv directly as a phase check.
    """
    runs = []
    environment = {k: v for k, v in os.environ.items() if k != 'NODE_TEST_CONTEXT'}
    for row in selected_commands(root, base, source):
        command = row['argv'] if ci else [sys.executable, 'tools/validation_contract.py', 'run', '--category', row['category']]
        began = time.time()
        try:
            done = subprocess.run(command, cwd=root, capture_output=True, timeout=900, env=environment)
            output, code = done.stdout + b'\n' + done.stderr, done.returncode
        except subprocess.TimeoutExpired as error:
            output, code = (error.stdout or b'') + b'\n' + (error.stderr or b''), 'TIMEOUT'
        key = digest(output); path = store / (key + '.log')
        if not path.exists(): private_write(path, output)
        entry = {'category': row['category'], 'command': row['argv'], 'runner': command, 'exit_code': code,
                 'output_sha256': key, 'started_at': began, 'completed_at': time.time()}
        if ci:
            passed = code != 'TIMEOUT' and contract.result_summary(output.decode('utf-8', 'replace'), code, bool(row['tests']))['passed']
        else:
            native = _native_record(output)
            passed = code == 0 and native is not None and native.get('passed') is True
            if native is not None:
                record = Path(native['record'])
                entry.update(record=str(record), record_sha256=digest(record.read_bytes()) if record.is_file() else None)
        runs.append(entry)
        if not passed:
            private_write(store / (str(time.time_ns()) + '.failure.json'), encoded(dict(failure, spec_runs=runs)))
            raise ValueError('Sealed spec category failed: ' + row['category'] + '; retained ' + str(path))
    return runs

def _native_record(output):
    for line in reversed(output.decode('utf-8', 'replace').splitlines()):
        try: value = json.loads(line)
        except ValueError: continue
        if isinstance(value, dict) and 'record' in value and 'passed' in value: return value
    return None

def _completed(record):
    return max([r.get('completed_at', 0) for r in [*record.get('runs', []), *record.get('spec_runs', [])]] or [0])

BUG_CLASSES = {'bug_fix', 'deep_bug_fix'}

def _reproduces(record):
    output = Path(record['output_file']).read_text(errors='replace')
    summary = contract.result_summary(output, record['exit_code'], True)
    return (record['exit_code'] != 0 and summary.get('complete') and summary.get('fail', 0) > 0 and 'ERR_ASSERTION' in output
            and not any(summary.get(k, 0) for k in ('skipped', 'todo', 'cancelled')))

def _native_original(root, selected, source, row, record):
    """The category record must be a custody-verified native runner original for this exact commit,
    tree, contract and runtime whose own retained output re-derives a complete pass; a bug-fix
    focused category also needs its retained unchanged-test fail-before original."""
    results = Path(git(root, 'rev-parse', '--absolute-git-dir')) / 'oracle/validation-contract-results' / selected['contract_sha256'] / source
    originals = {Path(r['_record_path']).resolve(): r for r in contract.originals(root, selected, 'after')}
    value = originals.get(record.resolve())
    tree = git(root, 'rev-parse', source + '^{tree}')
    if (value is None or record.resolve().parent != results.resolve() or value.get('kind') != 'boc-validation-execution-v1'
            or value.get('phase') != 'after' or value.get('commit') != source or value.get('tree') != tree
            or value.get('category') != row['category'] or value.get('command') != row['command']
            or value.get('contract_sha256') != selected['contract_sha256'] or value.get('catalog_sha256') != selected['catalog_sha256']
            or value.get('runtime') != selected['runtime'] or value.get('passed') is not True
            or value.get('inputs_unchanged') is not True or value.get('exit_code') != 0):
        raise ValueError('Spec category output changed or is incomplete')
    tested = any(r['category'] == row['category'] and r['tests'] for r in selected['commands'])
    output = Path(value['output_file']).read_text(errors='replace')
    if not contract.result_summary(output, value['exit_code'], tested)['passed']:
        raise ValueError('Spec category output changed or is incomplete')
    if row['category'] == 'focused' and selected['selection']['change_class'] in BUG_CLASSES:
        before = [r for r in contract.originals(root, selected, 'before') if r['category'] == 'focused'
                  and r.get('fixtures') == value.get('fixtures') and r.get('runtime') == selected['runtime']
                  and r.get('inputs_unchanged') is True and _reproduces(r)]
        if not before:
            raise ValueError('Spec category lacks its retained fail-before reproduction')
    return value

def check_spec_runs(root, base, source, runs, store, *, receipt_completed=None, mode='native'):
    """A receipt holds the native runner's passing records of exactly the spec's selected commands,
    and no later failed execution of the same candidate supersedes them."""
    expected = selected_commands(root, base, source)
    if not isinstance(runs, list) or [r.get('command') for r in runs] != [r['argv'] for r in expected]:
        raise ValueError('Receipt lacks the sealed spec category executions')
    selected = contract.verify(root, source) if expected else None
    if mode not in {'native', 'ci'}:
        raise ValueError('Unknown spec execution mode')
    for row, chosen in zip(runs, expected):
        path = store / (row['output_sha256'] + '.log')
        if mode == 'ci':
            # A CI phase receipt binds the complete retained output of the directly executed argv.
            if (path.is_symlink() or not path.is_file() or digest(path.read_bytes()) != row['output_sha256'] or row['exit_code'] == 'TIMEOUT'
                    or row.get('runner') != chosen['argv']
                    or not contract.result_summary(path.read_bytes().decode('utf-8', 'replace'), row['exit_code'], bool(chosen['tests']))['passed']):
                raise ValueError('Spec category output changed or is incomplete')
            continue
        record = Path(row.get('record') or '')
        if (path.is_symlink() or not path.is_file() or digest(path.read_bytes()) != row['output_sha256']
                or row['exit_code'] != 0 or not record.is_file() or digest(record.read_bytes()) != row.get('record_sha256')):
            raise ValueError('Spec category output changed or is incomplete')
        value = _native_original(root, selected, source, row, record)
        later = [r for r in contract.originals(root, selected, 'after') if r['commit'] == source and r['category'] == row['category']
                 and r['finished_at'] > value['finished_at'] and not r['passed']]
        if later:
            raise ValueError('A later failed spec category execution supersedes this receipt')
    if receipt_completed is not None:
        for failure in store.glob('*.failure.json'):
            value = json.loads(failure.read_bytes())
            if value.get('identity', {}).get('source') == source and _completed(value) > receipt_completed:
                raise ValueError('A later failed execution supersedes this receipt')

def verify(root, *, publication=False):
    current=identity(root)
    paths=[p for p in [directory(root)/(current['source']+'.json'),*directory(root).glob(current['source']+'.*.json')] if p.exists()]
    if not paths:raise ValueError('No deterministic source receipt for this candidate')
    if any(p.is_symlink() or p.stat().st_mode&0o077 for p in paths):raise ValueError('Unsafe source evidence file')
    path=max(paths,key=lambda p:_completed(json.loads(p.read_bytes())))
    value=json.loads(path.read_bytes());key=value.pop('sha256')
    if publication and value.get('spec_mode')!='native':raise ValueError('Publication requires the local native spec execution receipt')
    if digest(encoded(value))!=key or value.get('kind')!=KIND or value.get('status')!='VERIFIED' or value.get('source_only') is not True:
        raise ValueError('Invalid deterministic source receipt')
    if any(value.get(k)!=v for k,v in current.items()) or value['paths']!=scope(root,value['base'],current['source']):raise ValueError('Source/runtime/range changed')
    if [x['command'] for x in value['runs']]!=CHECKS:raise ValueError('Required commands changed')
    check_spec_runs(root,value['base'],current['source'],value.get('spec_runs'),directory(root),receipt_completed=_completed(value),mode=value.get('spec_mode'))
    for row in value['runs']:
        if row['exit_code']!=0 or digest((directory(root)/(row['output_sha256']+'.log')).read_bytes())!=row['output_sha256']:raise ValueError('Original execution output changed')
    return dict(value,sha256=key)

def publish(root, ref, pr=None):
    value=verify(root,publication=True)
    if not re.fullmatch('codex/source-[a-z0-9-]+',ref):raise ValueError('Source-maintenance review ref required')
    destinations=git(root,'remote','get-url','--push','--all','origin').splitlines()
    allowed={'https://github.com/'+REPOSITORY+suffix for suffix in ['', '.git']}
    if len(destinations)!=1 or destinations[0] not in allowed:
        raise ValueError('Publication requires the exact public repository destination')
    remote=destinations[0]
    base=git(root,'ls-remote',remote,'refs/heads/main').split()[0]
    if base!=value['base']:raise ValueError('Remote base moved; reconcile and validate complete range')
    if pr is None:
        subprocess.run(['git','push',remote,value['source']+':refs/heads/'+ref],cwd=root,check=True)
    else:
        try:from . import publication_admission as native
        except ImportError:import publication_admission as native
        selected={'candidate_commit':value['source'],'candidate_tree':value['tree'],'release_ref':ref,'publication_scope':{'baseline_commit':base}}
        observation=native._remote_admission(root,selected,pr=pr)
        private_write(directory(root)/(str(time.time_ns())+'.remote.json'),encoded(observation))
        verify(root)
        subprocess.run(['gh','pr','merge',str(pr),'--repo',native.public_status.REPOSITORY,'--merge','--match-head-commit',value['source']],cwd=root,check=True)
    return {'status':'SOURCE_PUSHED' if pr is None else 'SOURCE_PR_MERGED','source':value['source'],'deployment_authorized':False}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('action',choices=['validate','verify','push','merge','ci']);p.add_argument('--base');p.add_argument('--requested-at');p.add_argument('--ref');p.add_argument('--pr');a=p.parse_args();root=Path(git(Path.cwd(),'rev-parse','--show-toplevel'))
    if a.action=='ci':
        try:scope(root,a.base,git(root,'rev-parse','HEAD'))
        except ValueError:return subprocess.run([sys.executable,'tools/command_coverage.py','ci','--candidate',git(root,'rev-parse','HEAD')],cwd=root).returncode
        value=validate(root,a.base,datetime.now(timezone.utc).isoformat(),ci=True);value['sla_status']='CI_PHASE_ONLY'
    elif a.action=='validate':value=validate(root,a.base,a.requested_at)
    elif a.action=='verify':value=verify(root)
    else:value=publish(root,a.ref,a.pr if a.action=='merge' else None)
    print(json.dumps({'kind':value.get('kind'), 'status':value['status'],'source':value['source'],'sla_status':value.get('sla_status'),'deployment_authorized':False}));return 0

if __name__=='__main__':
    try:raise SystemExit(main())
    except (ValueError,OSError,KeyError,TypeError,subprocess.SubprocessError) as error:print(str(error),file=sys.stderr);raise SystemExit(1)
