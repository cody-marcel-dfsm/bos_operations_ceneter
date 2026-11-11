#!/usr/bin/env python3
"""Project-owned executable validation selection; no approval or customer runtime."""
from __future__ import annotations
import argparse, fnmatch, hashlib, json, os, platform, re, shutil, subprocess, sys, tempfile
from datetime import datetime, timezone
from pathlib import Path
try: from . import oracle_spec_seal as spec_seal
except ImportError: import oracle_spec_seal as spec_seal

CATALOG = 'tools/validation-catalog.json'
SELECTION = 'tools/validation-selection.json'
CLASSES = {'docs_only': ['sanity'], 'bug_fix': ['sanity','focused'],
           'deep_bug_fix': ['sanity','focused','interactions'],
           'feature': ['sanity','interactions','acceptance']}
SLA_SECONDS = {'docs_only':120, 'bug_fix':180, 'deep_bug_fix':300, 'feature':300}
SELECTION_KEYS = {'change_class','scope_paths','categories','reason','revision_of','acceptance','acceptance_tests'}
SCHEMA = 'boc.validation-contract/v2'
# The sealed contract is the family oracle-spec/1 implementation spec (owner direction 2026-11-11).
STAMP_KEYS = {'engine','model','oracle_sha256','host','time','origin_main','request_sha256','proposal_sha256'}
ENGINES = ('claude','codex')
ORACLE_FILES = ('.agents/skills/oracle/SKILL.md','.agents/skills/oracle/review-output.schema.json',
                'tools/oracle_approval.py','tools/validation_contract.py','tools/oracle_spec_seal.py')
TESTED = {'focused','interactions','acceptance'}
# Family secret patterns plus local absolute paths: committed spec text stays publishable.
PRIVATE_PATTERNS = tuple(re.compile(p) for p in (
    r'(?i)\bauthorization\s*:\s*(?:bearer|basic)\s+\S+', r'(?i)\bbearer\s+[a-z0-9._~+/=-]{12,}',
    r'(?i)\b(?:cookie|set-cookie)\s*:\s*\S+', r'-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----',
    r'\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b', r'\b(?:ghp|github_pat|xox[baprs]|AIza)[A-Za-z0-9_-]{12,}\b',
    r'(?i)\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|password|private[_-]?key)\s*(?:=|:)\s*[^\s,;]{8,}',
    r'(?:^|[\s"\'(=])(?:/home/|/Users/|/root/|[A-Za-z]:\\)'))
PLAN_KIND = 'boc.feature-test-plan/v1'
PLAN_KEYS = {'kind','feature','design','design_sha256','runtime_paths','tests'}
PLAN_TEST_KEYS = {'module','covers','purpose'}
PLAN_LIMIT = 65536
BINDING_KEYS = {'design','design_sha256','plan','plan_sha256','tests'}

def delivery_policy(kind):
    return {'sla_seconds':SLA_SECONDS[kind], 'clock_owner':'build_host', 'clock_start':'original_insertion',
            'completion':'verified_remote_git', 'retries_reset_clock':False,
            'reasoning_effort':'low' if kind in {'docs_only','bug_fix'} else 'medium', 'maximum_reasoning_effort':'medium'}

def review_effort(requested, root=None):
    path=(root or Path.cwd())/SELECTION
    kind=json.loads(path.read_text())['selection']['change_class'] if path.exists() else 'deep_bug_fix'
    # Direct owner policy bounds an inherited task setting; no model/provider fallback.
    maximum=delivery_policy(kind)['reasoning_effort']
    return requested if requested in {'none','minimal','low'} else maximum


def digest(value): return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def git(root,*args): return subprocess.check_output(['git',*args],cwd=root).decode().strip()
def blob(root,tree,name):
    result=subprocess.run(['git','show',tree+':'+name],cwd=root,capture_output=True)
    return None if result.returncode else json.loads(result.stdout)
def runtime():
    return {'node':subprocess.check_output(['node','--version']).decode().strip(),'node_sha256':hashlib.sha256(Path(shutil.which('node')).read_bytes()).hexdigest(),'controller_sha256':hashlib.sha256(Path(shutil.which('python3')).read_bytes()).hexdigest(),'platform':platform.system(),'architecture':platform.machine(),'options_sha256':digest({k:os.environ.get(k) for k in ('NODE_OPTIONS','NODE_PATH','PYTHONPATH','PYTHONHOME')})}
def safe_path(name):
    return isinstance(name,str) and bool(name) and not name.startswith(('/','-')) and '\\' not in name and '..' not in name.split('/') and not any(c in name for c in '\n\r\x00')
def catalog_check(catalog):
    if catalog.get('schema')!='boc.validation-catalog/v1' or set(catalog.get('classes',{}))!=set(CLASSES): raise ValueError('Unknown validation catalog')
    if catalog.get('sla_seconds')!=SLA_SECONDS or catalog.get('maximum_reasoning_effort')!='medium': raise ValueError('Immutable delivery budget or reasoning maximum changed')
    if catalog['classes']!=CLASSES: raise ValueError('Change-class minimum categories changed; revise native policy first')
    registry=catalog.get('regression',[])
    if not registry or len(registry)>8 or len({r['test'] for r in registry})!=len(registry): raise ValueError('Regression registry must be a small nonempty reviewed recurrence set')
    for row in registry:
        if not safe_path(row.get('test')) or not row['test'].startswith('tests/') or not row['test'].endswith('.test.mjs') or any(c in row['test'] for c in '*?[]') or not row.get('recurrence') or not row.get('boundary'): raise ValueError('Regression entry lacks recurrence and boundary rationale')
    return catalog

def selection_schema():
    return {'type':'object','additionalProperties':False,'required':['change_class','scope_paths','categories','reason','revision_of','design','acceptance','acceptance_tests'], 'properties':{
      'acceptance':{'type':'array','items':{'type':'string'},'description':'Concrete, checkable, publishable acceptance criteria. Empty only for docs_only.'},
      'acceptance_tests':{'type':'array','description':'Every acceptance criterion maps to at least one selected focused/interactions/acceptance test module.','items':{'type':'object','additionalProperties':False,'required':['module','covers','purpose'],'properties':{'module':{'type':'string'},'covers':{'type':'array','items':{'type':'integer'}},'purpose':{'type':'string'}}}},
      'change_class':{'type':'string','enum':list(CLASSES)},'scope_paths':{'type':'array','items':{'type':'string'},'minItems':1},
      'categories':{'type':'array','minItems':1,'items':{'type':'object','additionalProperties':False,'required':['name','tests','fixtures'],'properties':{'name':{'type':'string','enum':['sanity','focused','interactions','acceptance','regression']},'tests':{'type':'array','items':{'type':'string'}},'fixtures':{'type':'array','items':{'type':'string'}}}}},
      'reason':{'type':'string','minLength':1},'revision_of':{'type':['string','null']},
      'design':{'type':['string','null'],'description':'For a feature, the repository-relative design .md file; its required test plan sits beside it as <design>.test-plan.json. Null for every other class.'}}}

def validate_selection(selection,catalog):
    catalog_check(catalog)
    if set(selection)-{'design'}!=SELECTION_KEYS: raise ValueError('Unexpected selection fields')
    kind=selection['change_class']; categories=selection['categories']; names=[r['name'] for r in categories]
    design=selection.get('design')
    if kind=='feature':
        if not safe_path(design) or not design.endswith('.md'): raise ValueError('A feature selection must name its design document')
    elif design is not None: raise ValueError('Only a feature selection names a design')
    if kind not in CLASSES or not categories or len(names)!=len(set(names)) or not set(CLASSES[kind])<=set(names): raise ValueError('Selected categories are empty, duplicated or omit class requirements')
    if kind in {'docs_only','bug_fix'} and names!=CLASSES[kind]: raise ValueError('Simple changes have only their fixed minimal categories; integration or higher risk requires deep_bug_fix')
    if not selection['reason'].strip() or not selection['scope_paths'] or any(not safe_path(p) for p in selection['scope_paths']): raise ValueError('Contract needs bounded scope and rationale')
    if selection['revision_of'] is not None and not re.fullmatch('[a-f0-9]{64}',selection['revision_of']): raise ValueError('Revision must name exact previous contract')
    acceptance_check(selection)
    for row in categories:
        if set(row)!={'name','tests','fixtures'} or row['name'] not in {'sanity','focused','interactions','acceptance','regression'}: raise ValueError('Unknown category')
        tests=row['tests']; fixtures=row['fixtures']
        if not isinstance(fixtures,list) or len(fixtures)!=len(set(fixtures)) or any(not safe_path(p) or not p.startswith('tests/') or any(c in p for c in '*?[]') for p in fixtures): raise ValueError('Fixtures require exact nonempty project test paths')
        if set(tests)&set(fixtures): raise ValueError('Test and fixture paths must be distinct')
        if not isinstance(tests,list) or len(tests)!=len(set(tests)): raise ValueError('Duplicate category tests')
        if row['name'] in {'sanity','regression'}:
            if tests or fixtures: raise ValueError('Fixed categories cannot replace their catalog commands')
        elif not tests or any(not safe_path(p) or not p.startswith('tests/') or not p.endswith('.test.mjs') or any(c in p for c in '*?[]') for p in tests): raise ValueError('Test category requires exact nonempty test paths')
    return selection

def private_matches(value, where='spec'):
    """Field paths whose text looks like a secret or a local absolute path."""
    if isinstance(value,str): return [where] if any(p.search(value) for p in PRIVATE_PATTERNS) else []
    if isinstance(value,dict): return [hit for k,item in value.items() for hit in private_matches(item,where+'.'+str(k))]
    if isinstance(value,list): return [hit for i,item in enumerate(value) for hit in private_matches(item,'%s[%d]'%(where,i))]
    return []

def acceptance_check(selection):
    criteria=selection['acceptance'];rows=selection['acceptance_tests']
    if not isinstance(criteria,list) or not all(text(c) for c in criteria) or not isinstance(rows,list): raise ValueError('Spec acceptance criteria must be nonempty strings')
    if selection['change_class']=='docs_only':
        if rows and not criteria: raise ValueError('Acceptance tests need acceptance criteria')
    elif not criteria or not rows: raise ValueError('A spec needs acceptance criteria and the tests that must pass')
    selected={t for r in selection['categories'] if r['name'] in TESTED for t in r['tests']};covered=set();names=[]
    for row in rows:
        if (not isinstance(row,dict) or set(row)!={'module','covers','purpose'} or row['module'] not in selected or not text(row['purpose'])
                or not isinstance(row['covers'],list) or not row['covers']
                or not all(isinstance(i,int) and not isinstance(i,bool) and 0<=i<len(criteria) for i in row['covers'])):
            raise ValueError('Each acceptance test needs a selected test module, purpose and valid criterion indices')
        covered.update(row['covers']);names.append(row['module'])
    if len(set(names))!=len(names): raise ValueError('Acceptance tests repeat a module')
    if set(range(len(criteria)))-covered: raise ValueError('Acceptance criteria without a test: '+str(sorted(set(range(len(criteria)))-covered)))
    hits=private_matches({'reason':selection['reason'],'acceptance':criteria,'acceptance_tests':rows})
    if hits: raise ValueError('Spec text must stay publishable; secret or local path in: '+', '.join(hits))

def stamp_check(stamp):
    hexes=lambda v,n: isinstance(v,str) and re.fullmatch('[0-9a-f]{%d}'%n,v) is not None
    if (not isinstance(stamp,dict) or set(stamp)!=STAMP_KEYS or stamp['engine'] not in ENGINES
            or not all(text(stamp[k]) for k in ('model','host')) or not hexes(stamp['oracle_sha256'],64)
            or not hexes(stamp['proposal_sha256'],64) or not hexes(stamp['origin_main'],40)
            or not (stamp['request_sha256'] is None or hexes(stamp['request_sha256'],64))
            or not isinstance(stamp['time'],str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z',stamp['time'])):
        raise ValueError('Spec stamp needs engine, model, oracle_sha256, host, UTC time, origin_main, request_sha256 (or null) and proposal_sha256')
    if private_matches({'model':stamp['model'],'host':stamp['host']}): raise ValueError('Spec stamp must stay publishable')
    return stamp

def oracle_sha256(root):
    """SHA-256 over the Oracle's own skill and tool files, in fixed order."""
    value=hashlib.sha256()
    for name in ORACLE_FILES:
        path=Path(root)/name
        value.update(name.encode()+b'\0'+(sha256(path.read_bytes()) if path.is_file() else 'absent').encode()+b'\n')
    return value.hexdigest()

def plan_path(design): return design[:-len('.md')]+'.test-plan.json'
def text(value): return isinstance(value,str) and bool(value.strip())
def sha256(content): return hashlib.sha256(content).hexdigest()
def scoped(name,selection): return any(fnmatch.fnmatchcase(name,p) for p in selection['scope_paths'])
def planned(selection): return {t for r in selection['categories'] if r['name'] in {'interactions','acceptance'} for t in r['tests']}

def design_binding(root,selection):
    """Refuse a feature design without its bound test plan. Shape only; no model judges quality."""
    design=selection['design'];plan=plan_path(design)
    if not (root/design).is_file(): raise ValueError('Feature design document is missing: '+design)
    if not (root/plan).is_file(): raise ValueError('A feature design must include a test plan document: '+plan)
    raw=(root/plan).read_bytes();design_sha256=sha256((root/design).read_bytes())
    if len(raw)>PLAN_LIMIT: raise ValueError('Test plan is too large')
    try: value=json.loads(raw)
    except (ValueError,RecursionError) as error: raise ValueError('Test plan is not valid JSON') from error
    if not isinstance(value,dict) or set(value)!=PLAN_KEYS or value['kind']!=PLAN_KIND: raise ValueError('Test plan requires exactly: '+', '.join(sorted(PLAN_KEYS)))
    if value['design']!=design: raise ValueError('Test plan is bound to a different design: '+str(value['design']))
    if value['design_sha256']!=design_sha256: raise ValueError('Test plan is bound to a different revision of its design')
    if not text(value['feature']): raise ValueError('Test plan must name its feature')
    covered=value['runtime_paths']
    if not isinstance(covered,list) or not covered or not all(safe_path(p) for p in covered): raise ValueError('Test plan must list the runtime paths it covers')
    outside=sorted(p for p in covered if not scoped(p,selection))
    if outside: raise ValueError('Test plan covers paths outside the selected scope: '+', '.join(outside))
    rows=value['tests']
    if not isinstance(rows,list) or not rows: raise ValueError('Test plan must name its tests')
    reached,names=set(),[]
    for row in rows:
        if not isinstance(row,dict) or set(row)!=PLAN_TEST_KEYS or not text(row['module']) or not text(row['purpose']) or not isinstance(row['covers'],list) or not row['covers'] or not all(text(p) for p in row['covers']): raise ValueError('Each planned test requires: '+', '.join(sorted(PLAN_TEST_KEYS)))
        if row['module'] not in planned(selection): raise ValueError('Planned test is not selected for execution: '+row['module'])
        unknown=sorted(set(row['covers'])-set(covered))
        if unknown: raise ValueError('Planned test covers unlisted paths: '+', '.join(unknown))
        reached.update(row['covers']);names.append(row['module'])
    if len(set(names))!=len(names): raise ValueError('Test plan repeats a test module')
    unreached=sorted(set(covered)-reached)
    if unreached: raise ValueError('No planned test covers: '+', '.join(unreached))
    return {'design':design,'design_sha256':design_sha256,'plan':plan,'plan_sha256':sha256(raw),'tests':sorted(names)}

def verify_binding(root,contract,tree):
    selection=contract['selection'];binding=contract.get('design_binding')
    if selection['change_class']!='feature':
        if binding is not None: raise ValueError('Only a feature contract binds a design')
        return
    if not isinstance(binding,dict) or set(binding)!=BINDING_KEYS or binding['design']!=selection['design'] or binding['plan']!=plan_path(selection['design']) or not isinstance(binding['tests'],list) or not binding['tests'] or not set(binding['tests'])<=planned(selection): raise ValueError('Feature contract lacks its bound test plan')
    for module in binding['tests']:
        if subprocess.run(['git','cat-file','-e',tree+':'+module],cwd=root,capture_output=True).returncode: raise ValueError('Planned test is missing from the candidate: '+module)
    # Designs are private maintainer material, so a public checkout holds only the hashes.
    for name,key in ((binding['design'],'design_sha256'),(binding['plan'],'plan_sha256')):
        if (root/name).is_file() and sha256((root/name).read_bytes())!=binding[key]: raise ValueError('Design or test plan changed after approval; obtain explicit Oracle revision: '+name)

def commands(selection,catalog):
    result=[]
    for row in selection['categories']:
        name=row['name']; tests=row['tests']; fixtures=row['fixtures']
        if not isinstance(fixtures,list) or len(fixtures)!=len(set(fixtures)) or any(not safe_path(p) or not p.startswith('tests/') or any(c in p for c in '*?[]') for p in fixtures): raise ValueError('Fixtures require exact nonempty project test paths')
        if set(tests)&set(fixtures): raise ValueError('Test and fixture paths must be distinct')
        if name=='sanity': argv=['python3','tools/validation_contract.py','sanity']
        else:
            if name=='regression': tests=[r['test'] for r in catalog['regression']]
            argv=['node','--test','--test-reporter=tap',*tests]
        result.append({'category':name,'argv':argv,'tests':tests,'fixtures':row['fixtures']})
    return result

def seal(root,selection,proposal,review,base=None,*,stamp):
    catalog=json.loads((root/CATALOG).read_text());validate_selection(selection,catalog)
    previous=json.loads((root/SELECTION).read_text()) if (root/SELECTION).exists() else None
    if selection['revision_of']!=(previous or {}).get('contract_sha256'): raise ValueError('Explicit revision does not name current original contract')
    base=base or git(root,'rev-parse','HEAD')
    stamp_check(stamp)
    if stamp['proposal_sha256']!=hashlib.sha256(proposal.encode()).hexdigest(): raise ValueError('Stamp is bound to a different proposal')
    value={'schema':SCHEMA,'kind':spec_seal.KIND,'stamp':stamp,'selection':selection,'base_commit':base,'base_tree':git(root,'rev-parse',base+'^{tree}'),'catalog_sha256':digest(catalog),'runtime':runtime(),'proposal_sha256':hashlib.sha256(proposal.encode()).hexdigest(),'review_sha256':digest(review),'commands':commands(selection,catalog),'delivery_policy':delivery_policy(selection['change_class'])}
    if selection['change_class']=='feature': value['design_binding']=design_binding(root,selection)
    value['contract_sha256']=digest(value)
    hits=private_matches(value)
    if hits: raise ValueError('Sealed spec must stay publishable; secret or local path in: '+', '.join(hits))
    value['seal']=spec_seal.compute_seal(value);return value

def write_selection(root,value):
    path=root/SELECTION
    if path.exists():
        old=json.loads(path.read_text())
        if value['selection']['revision_of']!=old.get('contract_sha256'): raise ValueError('Selection changed before write')
    elif value['selection']['revision_of'] is not None: raise ValueError('Previous contract disappeared')
    tmp=path.with_suffix('.json.tmp');tmp.write_text(json.dumps(value,indent=2)+'\n');os.replace(tmp,path)

def verify(root,tree='HEAD',proposal=None):
    contract=blob(root,tree,SELECTION)
    if contract is None: return None # Bootstrap commits are separately admitted by native source review.
    catalog=blob(root,tree,CATALOG)
    if not isinstance(catalog,dict) or not isinstance(contract,dict): raise ValueError('Validation catalog or sealed spec is missing or malformed')
    catalog_check(catalog)
    body={k:v for k,v in contract.items() if k not in ('contract_sha256','seal')}
    if contract.get('schema')!=SCHEMA or contract.get('contract_sha256')!=digest(body): raise ValueError('Validation contract identity changed')
    if not spec_seal.seal_matches(contract): raise ValueError('Sealed Oracle spec does not recompute; obtain a fresh native proposal')
    stamp_check(contract.get('stamp'))
    selection=validate_selection(contract['selection'],catalog)
    if contract.get('delivery_policy')!=delivery_policy(selection['change_class']): raise ValueError('Delivery policy changed; original host clock must survive revision')
    if contract['catalog_sha256']!=digest(catalog) or contract['commands']!=commands(selection,catalog): raise ValueError('Catalog or selected commands changed; obtain explicit Oracle revision')
    verify_binding(root,contract,tree)
    if proposal is not None and proposal.get('validation_contract')!=contract: raise ValueError('Candidate selection lacks its exact original Oracle proposal')
    if git(root,'rev-parse',contract['base_commit']+'^{tree}')!=contract['base_tree']: raise ValueError('Baseline tree differs')
    candidate = tree if git(root,'cat-file','-t',tree)=='commit' else git(root,'rev-parse','HEAD')
    if git(root,'rev-parse',candidate+'^{tree}')!=git(root,'rev-parse',tree+'^{tree}'): raise ValueError('Candidate tree is not the captured commit')
    if subprocess.run(['git','merge-base','--is-ancestor',contract['base_commit'],candidate],cwd=root,capture_output=True).returncode: raise ValueError('Contract baseline is not candidate ancestry')
    changed=git(root,'diff','--name-only',contract['base_commit'],tree).splitlines()
    for name in changed:
        if name==SELECTION: continue
        if not any(fnmatch.fnmatchcase(name,p) for p in selection['scope_paths']): raise ValueError('Changed path outside fixed selection: '+name)
        if selection['change_class']=='docs_only' and not documentation(name): raise ValueError('Executable instructions or non-document change cannot use docs_only')
    return contract

def documentation(name):
    """Genuine documentation: needs no spec. Instructions, skills, packages and source do."""
    return name.endswith('.md') and name not in {'AGENTS.md','CLAUDE.md'} and not name.startswith(('.agents/','.claude/','source/','clients/'))

def gate(root,base,head='HEAD'):
    """Fail immediately unless a non-docs range carries its own valid sealed spec."""
    head=git(root,'rev-parse',head+'^{commit}');base=git(root,'rev-parse',base+'^{commit}')
    if subprocess.run(['git','merge-base','--is-ancestor',base,head],cwd=root,capture_output=True).returncode: raise ValueError('Publication base is not candidate ancestry')
    paths=git(root,'diff','--name-only',base,head).splitlines()
    if not paths: raise ValueError('No changes to admit')
    if all(documentation(p) for p in paths): return {'status':'DOCS_ONLY','paths':paths}
    if SELECTION not in paths or blob(root,head,SELECTION) is None: raise ValueError('Non-docs change lacks its sealed Oracle spec: '+SELECTION+' must be sealed for this changelist')
    try: contract=verify(root,head)
    except (KeyError,TypeError,AttributeError,subprocess.CalledProcessError) as error: raise ValueError('Sealed Oracle spec is malformed: '+type(error).__name__) from error
    if contract['selection']['change_class']=='docs_only': raise ValueError('A docs_only spec cannot admit non-document changes')
    return {'status':'SPEC_SEALED','paths':paths,'seal':contract['seal'],'contract_sha256':contract['contract_sha256'],'categories':[r['category'] for r in contract['commands']]}

def native_origin(root,head='HEAD'):
    """Local admission: the committed spec must equal an APPROVED native proposal record's contract."""
    contract=verify(root,head)
    if contract is None: raise ValueError('No sealed spec to admit')
    folder=Path(git(root,'rev-parse','--absolute-git-dir'))/'oracle/proposals'
    for path in sorted(folder.glob('*.json')) if folder.is_dir() else []:
        try: record=json.loads(path.read_bytes())
        except (OSError,ValueError): continue
        if (isinstance(record,dict) and record.get('kind')=='proposal-review' and record.get('review',{}).get('verdict')=='APPROVED'
                and record.get('validation_contract')==contract and record.get('proposal_sha256')==contract['stamp']['proposal_sha256']):
            return str(path)
    raise ValueError('Committed spec has no matching APPROVED native proposal record; obtain it from npm run oracle:proposal, never reseal by hand')

def ci_execute(root,head='HEAD'):
    """Run the sealed spec's selected commands on a CI host; complete positive TAP or a clean exit only."""
    contract=verify(root,head);results=[]
    env={k:v for k,v in os.environ.items() if k!='NODE_TEST_CONTEXT'}
    for row in contract['commands']:
        done=subprocess.run(row['argv'],cwd=root,capture_output=True,text=True,env=env);output=done.stdout+done.stderr
        summary=result_summary(output,done.returncode,bool(row['tests']));results.append({'category':row['category'],'summary':summary})
        if not summary['passed']:
            sys.stdout.write(output);raise ValueError('Sealed spec category failed: '+row['category'])
    return {'status':'SPEC_TESTS_PASSED','seal':contract['seal'],'results':results}

def result_summary(text,exit_code,is_test):
    if not is_test: return {'passed':exit_code==0,'tests':None,'skipped':0}
    counts={key:[int(v) for v in re.findall(r'^# '+key+r' (\d+)\s*$',text,re.M)] for key in ('tests','pass','fail','cancelled','skipped','todo')}
    if any(len(v)!=1 for v in counts.values()): return {'passed':False,'reason':'Missing or ambiguous complete TAP summary'}
    counts={k:v[0] for k,v in counts.items()}
    complete=counts['tests']>0 and counts['tests']==counts['pass']+counts['fail']+counts['cancelled']+counts['skipped']+counts['todo']
    clean=complete and not any(counts[n] for n in ('fail','cancelled','skipped','todo')) and not re.search(r'OK \(skipped=[1-9]|# SKIP\b|# TODO\b',text)
    return {**counts,'passed':exit_code==0 and clean,'complete':complete}

def store(root,contract,commit,category,phase,record,output):
    folder=Path(git(root,'rev-parse','--absolute-git-dir'))/'oracle/validation-contract-results'/contract['contract_sha256']/commit;folder.mkdir(parents=True,exist_ok=True)
    content=output.encode(); output_hash=hashlib.sha256(content).hexdigest();log=folder/(output_hash+'.log')
    if not log.exists():log.write_bytes(content)
    record={**record,'output_sha256':output_hash,'output_file':str(log)};record['record_sha256']=digest(record)
    target=folder/(category+'-'+phase+'-'+record['record_sha256']+'.json')
    if not target.exists():target.write_text(json.dumps(record,indent=2)+'\n')
    return target

def originals(root,contract,phase):
    folder=Path(git(root,'rev-parse','--absolute-git-dir'))/'oracle/validation-contract-results'/contract['contract_sha256']
    for p in folder.glob('*/*-'+phase+'-*.json'):
        d=json.loads(p.read_text());body={k:v for k,v in d.items() if k!='record_sha256'}
        if digest(body)!=d.get('record_sha256') or hashlib.sha256(Path(d['output_file']).read_bytes()).hexdigest()!=d['output_sha256']:raise ValueError('Original execution custody changed')
        yield {**d, '_record_path':str(p)}

def execute(root,category,phase='after'):
    if git(root,'status','--porcelain=v1','--untracked-files=all'):raise ValueError('Execute a clean committed candidate')
    commit=git(root,'rev-parse','HEAD');contract=verify(root,commit)
    if contract is None:raise ValueError('No Oracle-selected contract')
    if runtime()!=contract['runtime']:raise ValueError('Execution runtime changed; revise contract explicitly')
    row=next((r for r in contract['commands'] if r['category']==category),None)
    if row is None:raise ValueError('Category not selected by Oracle')
    fixtures={p:git(root,'rev-parse',commit+':'+p) for p in [*row['tests'],*row['fixtures']]}
    if phase=='before':
        if category!='focused' or contract['selection']['change_class'] not in {'bug_fix','deep_bug_fix'}:raise ValueError('Before evidence is the selected bug reproduction only')
        changed=git(root,'diff','--name-only',contract['base_commit'],commit).splitlines()
        if any(p!=SELECTION and p not in fixtures for p in changed):raise ValueError('Fail-before source includes implementation changes')
    elif category=='focused' and contract['selection']['change_class'] in {'bug_fix','deep_bug_fix'}:
        before=[r for r in originals(root,contract,'before') if r.get('inputs_unchanged') is True and r['category']==category and r['fixtures']==fixtures and r['runtime']==contract['runtime'] and r['exit_code']!=0 and r['summary'].get('complete') and r['summary'].get('fail',0)>0 and 'ERR_ASSERTION' in Path(r['output_file']).read_text() and not any(r['summary'].get(k,0) for k in ('skipped','todo','cancelled'))]
        if not before:raise ValueError('Missing unchanged-test fail-before execution; do not substitute an infrastructure error')
    env={k:v for k,v in os.environ.items() if k!='NODE_TEST_CONTEXT'}
    result=subprocess.run(row['argv'],cwd=root,capture_output=True,text=True,env=env);text=result.stdout+result.stderr
    summary=result_summary(text,result.returncode,bool(row['tests']));unchanged=git(root,'rev-parse','HEAD')==commit and not git(root,'status','--porcelain=v1','--untracked-files=all') and runtime()==contract['runtime']
    record={'kind':'boc-validation-execution-v1','result_scope':'validation_phase','e2e_status':'NOT_EVALUATED','delivery_policy':contract['delivery_policy'],'finished_at':datetime.now(timezone.utc).isoformat(),'execution_environment':{'node':contract['runtime']['node'],'python':platform.python_version(),'platform':platform.system()},'contract_sha256':contract['contract_sha256'],'catalog_sha256':contract['catalog_sha256'],'commit':commit,'tree':git(root,'rev-parse',commit+'^{tree}'),'category':category,'phase':phase,'command':row['argv'],'fixtures':fixtures,'runtime':contract['runtime'],'controller_python':platform.python_version(),'exit_code':result.returncode,'summary':summary,'inputs_unchanged':unchanged,'passed':phase=='after' and summary['passed'] and unchanged}
    target=store(root,contract,commit,category,phase,record,text);print(json.dumps({'record':str(target),'passed':record['passed'],'phase':phase,'summary':summary}))
    return 0 if record['passed'] or phase=='before' and unchanged and summary.get('complete') and summary.get('fail',0)>0 and not any(summary.get(k,0) for k in ('skipped','todo','cancelled')) and 'ERR_ASSERTION' in text and result.returncode!=0 else 1

def admit(root,tree,proposal):
    contract=verify(root,tree,proposal)
    if contract is None:
        if blob(root,proposal['base_commit'],CATALOG) is not None:raise ValueError('Native proposal must select validation before implementation')
        return None
    results=list(originals(root,contract,'after'));selected=[]
    for row in contract['commands']:
        matches=sorted([r for r in results if r['tree']==tree and r['command']==row['argv'] and r['runtime']==contract['runtime'] and r['category']==row['category'] and r['catalog_sha256']==contract['catalog_sha256']],key=lambda r:r['finished_at'])
        if not matches or not matches[-1]['passed']:raise ValueError('Incomplete or failed selected category: '+row['category'])
        selected.append(matches[-1])
    return {'contract':contract,'results':selected}

def required(root,tree):
    contract=verify(root,tree)
    if contract is None:
        return [['npm','run','build'],['npm','run','check'],['npm','run','check:privacy'],['npm','run','contract:check'],['npm','test'],['npm','run','check:publication']]
    return [['python3','tools/validation_contract.py','run','--category',r['category']] for r in contract['commands']]

def main():
    p=argparse.ArgumentParser();p.add_argument('action',choices=['run','sanity','release','gate','ci']);p.add_argument('--category');p.add_argument('--base');p.add_argument('--phase',choices=['before','after'],default='after');a=p.parse_args();root=Path(git(Path.cwd(),'rev-parse','--show-toplevel'))
    if a.action in {'gate','ci'}:
        value=gate(root,a.base or 'origin/main')
        if a.action=='ci' and value['status']=='SPEC_SEALED': value=dict(value,**ci_execute(root))
        print(json.dumps(value));return 0
    if a.action=='release':
        for command in required(root,'HEAD'):subprocess.run(command,cwd=root,check=True)
        return 0
    if a.action=='sanity':
        contract=verify(root,'HEAD'); baseline=contract['base_commit'] if contract else 'HEAD~1'
        for command in [['git','diff','--check',baseline,'HEAD'],['npm','run','check:privacy'],['npm','run','check:publication']]:subprocess.run(command,cwd=root,check=True)
        return 0
    return execute(root,a.category,a.phase)
if __name__=='__main__':
    try:sys.exit(main())
    except (ValueError,KeyError,OSError,subprocess.CalledProcessError) as exc:print(str(exc),file=sys.stderr);sys.exit(2)
