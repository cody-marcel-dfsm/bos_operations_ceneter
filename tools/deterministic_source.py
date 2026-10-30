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

KIND = 'boc-deterministic-source/1'
REPOSITORY = 'cody-marcel-dfsm/bos_operations_ceneter'
ALLOWED = {'AGENTS.md', 'tools/deterministic_source.py', 'tools/deterministic-source.md',
           'tests/deterministic_source_test.py', '.github/workflows/publication-safety.yml',
           '.agents/skills/operations-center-implementation/SKILL.md'}
CHECKS = [['npm', 'run', 'check:privacy'], ['npm', 'run', 'check:publication'],
          [sys.executable, '-B', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'deterministic_source_test.py', '-v']]

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
    if (Path(root)/'tools/validation-selection.json').exists():
        raise ValueError('A selected contract requires its native owner; no override')
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

def validate(root, base, requested_at):
    start=datetime.fromisoformat(requested_at.replace('Z','+00:00'))
    if start.tzinfo is None or start>datetime.now(timezone.utc):raise ValueError('Original request clock is required')
    before=identity(root);paths=scope(root,base,before['source']);runs=[];store=directory(root)
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
    if identity(root)!=before:raise ValueError('Source or runtime changed during execution')
    value={'kind':KIND,'status':'VERIFIED','base':base,'paths':paths,**before,'runs':runs,'request_started_at':requested_at,
           'sla_status':'FAILED' if time.time()-start.timestamp()>120 else 'NOT_ESTABLISHED','source_only':True}
    value['sha256']=digest(encoded(value));private_write(store/(before['source']+'.json'),encoded(value))
    return verify(root)

def verify(root):
    current=identity(root);path=directory(root)/(current['source']+'.json')
    if path.is_symlink() or path.stat().st_mode&0o077:raise ValueError('Unsafe source evidence file')
    value=json.loads(path.read_bytes());key=value.pop('sha256')
    if digest(encoded(value))!=key or value.get('kind')!=KIND or value.get('status')!='VERIFIED' or value.get('source_only') is not True:
        raise ValueError('Invalid deterministic source receipt')
    if any(value.get(k)!=v for k,v in current.items()) or value['paths']!=scope(root,value['base'],current['source']):raise ValueError('Source/runtime/range changed')
    if [x['command'] for x in value['runs']]!=CHECKS:raise ValueError('Required commands changed')
    for row in value['runs']:
        if row['exit_code']!=0 or digest((directory(root)/(row['output_sha256']+'.log')).read_bytes())!=row['output_sha256']:raise ValueError('Original execution output changed')
    return dict(value,sha256=key)

def publish(root, ref, pr=None):
    value=verify(root)
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
        value=validate(root,a.base,datetime.now(timezone.utc).isoformat());value['sla_status']='CI_PHASE_ONLY'
    elif a.action=='validate':value=validate(root,a.base,a.requested_at)
    elif a.action=='verify':value=verify(root)
    else:value=publish(root,a.ref,a.pr if a.action=='merge' else None)
    print(json.dumps({'kind':value.get('kind'), 'status':value['status'],'source':value['source'],'sla_status':value.get('sla_status'),'deployment_authorized':False}));return 0

if __name__=='__main__':
    try:raise SystemExit(main())
    except (ValueError,OSError,KeyError,TypeError,subprocess.SubprocessError) as error:print(str(error),file=sys.stderr);raise SystemExit(1)
