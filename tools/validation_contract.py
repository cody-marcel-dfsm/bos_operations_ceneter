#!/usr/bin/env python3
"""Project-owned executable validation selection; no approval or customer runtime."""
from __future__ import annotations
import argparse, copy, fnmatch, hashlib, json, locale, os, platform, re, selectors, shutil, signal, stat, subprocess, sys, tempfile, uuid
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
                'tools/oracle_approval.py','tools/validation_contract.py','tools/oracle_spec_seal.py') + tuple('tools/oracle_core/'+name+'.py' for name in ('__init__','cli','config','proposal','runner','context','index','spec','seal','custody','lifecycle')) + ('tools/oracle_oc_adapter.py',)
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
      'acceptance_tests':{'type':'array','description':'Every acceptance criterion maps to at least one selected focused/interactions/acceptance test module. Exactly one row per module: list every criterion index that module covers in its covers array.','items':{'type':'object','additionalProperties':False,'required':['module','covers','purpose'],'properties':{'module':{'type':'string'},'covers':{'type':'array','items':{'type':'integer'}},'purpose':{'type':'string'}}}},
      'change_class':{'type':'string','enum':list(CLASSES)},'scope_paths':{'type':'array','items':{'type':'string'},'minItems':1},
      'categories':{'type':'array','minItems':1,'items':{'type':'object','additionalProperties':False,'required':['name','tests','fixtures'],'properties':{'name':{'type':'string','enum':['sanity','focused','interactions','acceptance','regression']},'tests':{'type':'array','items':{'type':'string'}},'fixtures':{'type':'array','items':{'type':'string'}}}}},
      'reason':{'type':'string','minLength':1},'revision_of':{'type':['string','null']},
      'design':{'type':['string','null'],'description':'For a feature, the repository-relative design .md file; its required test plan sits beside it as <design>.test-plan.json. Null for every other class.'}}}

DELTA_KIND = 'boc.proposal-delta/1'
_CURRENT_ORIGIN = object()
_CURRENT_PRIOR_PROOF = object()

def _publication_projection(root, tree, scope):
    """Verify the immutable membership resolved by the native publication owner."""
    keys=('baseline_commit','candidate_tree','remote_url','target_ref','range_paths','range_sha256')
    if not isinstance(scope,dict) or any(key not in scope for key in keys):raise ValueError('Native publication scope is incomplete')
    value={key:copy.deepcopy(scope[key]) for key in keys}
    base=value['baseline_commit']
    if not re.fullmatch('[a-f0-9]{40}',base or '') or value['candidate_tree']!=tree:raise ValueError('Native publication source changed')
    paths=sorted(p for p in git(root,'diff','--name-only','--diff-filter=ACMRTD','-z',base,tree).split('\0') if p)
    raw=subprocess.check_output(['git','diff','--binary','--full-index',base,tree],cwd=root)
    if value['range_paths']!=paths or value['range_sha256']!=sha256(raw):raise ValueError('Native publication inventory changed')
    if value['target_ref'] not in (None,'refs/heads/main') or (value['target_ref'] is not None and not text(value['remote_url'])):
        raise ValueError('Native publication destination changed')
    return value

def _resolved_publication_scope(root, tree):
    # Reuse the owning adapter's authority and history resolver; no CLI or model
    # supplies a second baseline policy. Import lazily to avoid module startup cycles.
    try:from . import oracle_approval as native
    except ImportError:import oracle_approval as native
    return _publication_projection(root,tree,native._publication_scope(root,tree))

def delta_context(root, source, tree, *, origin_main=_CURRENT_ORIGIN, prior_proposal_sha256=_CURRENT_PRIOR_PROOF, publication_scope=None):
    scope=_resolved_publication_scope(root,tree)
    if publication_scope is not None and _publication_projection(root,tree,publication_scope)!=scope:
        raise ValueError('Native publication scope changed')
    return _delta_context(root,source,tree,origin_main=origin_main,prior_proposal_sha256=prior_proposal_sha256,publication_scope=scope)

def _delta_context(root, source, tree, *, origin_main=_CURRENT_ORIGIN, prior_proposal_sha256=_CURRENT_PRIOR_PROOF, publication_scope=None):
    """Capture producer-owned exact membership; neither a model nor a caller supplies scope."""
    if not all(re.fullmatch('[a-f0-9]{40}', x or '') for x in (source, tree)):
        raise ValueError('Delta requires immutable source/tree identities')
    prior = blob(root, tree, SELECTION)
    if not isinstance(prior, dict) or not spec_seal.seal_matches(prior):
        raise ValueError('Delta requires an intact prior sealed contract')
    body = {k:v for k,v in prior.items() if k not in ('contract_sha256','seal')}
    if digest(body) != prior.get('contract_sha256'):
        raise ValueError('Prior delta contract identity changed')
    catalog = blob(root, tree, CATALOG)
    validate_selection(prior['selection'], catalog)
    if digest(catalog) != prior['catalog_sha256']:
        raise ValueError('Delta catalog changed')
    git(root, 'merge-base', '--is-ancestor', prior['base_commit'], source)
    folder=Path(git(root,'rev-parse','--absolute-git-dir'))/'oracle/proposals'
    if prior_proposal_sha256 is _CURRENT_PRIOR_PROOF:
        prior_proposal_sha256=None
        for path in sorted(folder.glob('*.json')) if folder.is_dir() else []:
            if not path.is_symlink() and path.is_file() and native_proposal_record(root,path,prior,source):
                prior_proposal_sha256=sha256(path.read_bytes());break
    elif prior_proposal_sha256 is not None:
        if not re.fullmatch('[a-f0-9]{64}',prior_proposal_sha256):raise ValueError('Exact prior native proposal required')
        path=folder/(prior_proposal_sha256+'.json')
        if path.is_symlink() or not native_proposal_record(root,path,prior,source):raise ValueError('Prior native proposal custody changed')
    if origin_main is _CURRENT_ORIGIN:
        observed=subprocess.run(['git','--no-replace-objects','rev-parse','--verify','refs/remotes/origin/main^{commit}'],cwd=root,capture_output=True,text=True)
        origin_main=observed.stdout.strip() if observed.returncode==0 else None
    if origin_main is not None:
        if not re.fullmatch('[a-f0-9]{40}',origin_main):raise ValueError('Exact delta origin required')
        git(root,'merge-base','--is-ancestor',origin_main,source)
    tracked = git(root, 'ls-tree', '-r', '--name-only', '-z', tree).split('\0')
    if publication_scope is None:
        # Historical producers used this exact local-base inventory and hash.
        paths = git(root, 'diff', '--name-only', '-z', prior['base_commit'], tree).split('\0')
        paths = sorted(set(p for p in paths if p) | set(prior['selection']['scope_paths']))
        inventory=digest(paths)
    else:
        publication_scope=_publication_projection(root,tree,publication_scope)
        if publication_scope['target_ref'] is not None and publication_scope['baseline_commit']!=origin_main:
            raise ValueError('Native publication origin changed')
        git(root,'merge-base','--is-ancestor',publication_scope['baseline_commit'],source)
        members=set(p for p in tracked if p)
        members.update(p for p in git(root,'ls-tree','-r','--name-only','-z',publication_scope['baseline_commit']).split('\0') if p)
        retained=set()
        for pattern in prior['selection']['scope_paths']:
            if any(c in pattern for c in '*?[]'):
                retained.update(p for p in members if fnmatch.fnmatchcase(p,pattern))
            else:retained.add(pattern)
        paths=sorted(set(publication_scope['range_paths'])|retained)
        inventory=digest({'paths':paths,'publication_scope':publication_scope})
    if len(paths)>4096 or any(not safe_path(p) or any(c in p for c in '*?[]\r\n') for p in paths):
        raise ValueError('Delta requires finite exact paths')
    tests = sorted(p for p in tracked if p.startswith('tests/') and safe_path(p) and not any(c in p for c in '*?[]\r\n'))
    binding = {'prior_contract_sha256':prior['contract_sha256'], 'prior_proposal_sha256':prior_proposal_sha256, 'source_commit':source,
               'source_tree':tree, 'origin_main':origin_main, 'inventory_sha256':inventory, 'test_inventory_sha256':digest(tests)}
    return {'binding':binding, 'prior':prior, 'paths':paths, 'test_paths':tests,
            **({'publication_scope':publication_scope} if publication_scope is not None else {})}

def exact_scope(patterns, tracked):
    """Expand prior sealed scope into exact paths: a glob becomes the tracked candidate paths the gate's fnmatchcase
    already admits under it; an exact path stays itself. Unsafe patterns and unsafe expansions still reject."""
    names = [p for p in tracked if p]
    exact = set()
    for pattern in patterns:
        if not safe_path(pattern) or any(c in pattern for c in '\r\n'):
            raise ValueError('Delta requires finite exact paths')
        if any(c in pattern for c in '*?['):
            exact.update(p for p in names if fnmatch.fnmatchcase(p, pattern))
        else:
            exact.add(pattern)
    return exact

def binding_schema(binding):
    """Closed exact binding in provider-accepted structured-output form: one scalar const per field (an object-level
    const is refused by the provider). materialize_delta still compares the whole returned binding exactly."""
    return {'type':'object','additionalProperties':False,'required':list(binding),
            'properties':{k:{'type':'null' if value is None else 'string','const':value} for k,value in binding.items()}}

def delta_schema(context):
    row = {'type':'object','additionalProperties':False,'required':['name','tests','fixtures'],
           'properties':{'name':{'type':'string','enum':[r['name'] for r in context['prior']['selection']['categories'] if r['name'] in TESTED]},
                         'tests':{'type':'array','items':{'type':'string'}},
                         'fixtures':{'type':'array','items':{'type':'string'}}}}
    coverage = {'type':'object','additionalProperties':False,'required':['module','covers','purpose'],
                'properties':{'module':{'type':'string'},
                              'covers':{'type':'array','items':{'type':'integer','minimum':0},'minItems':1},
                              'purpose':{'type':['string','null']}}}
    return {'type':'object','additionalProperties':False,
            'required':['kind','binding','reason','design','acceptance_additions','category_additions','coverage_additions'],
            'properties':{'kind':{'type':'string','const':DELTA_KIND},'binding':binding_schema(context['binding']),
                          'reason':{'type':'string','minLength':1},
                          'design':{'type':'string','minLength':1} if context['prior']['selection']['change_class']=='feature' else {'type':'null','const':None},
                          'acceptance_additions':{'type':'array','minItems':1,'maxItems':32,'items':{'type':'string'}},
                          'category_additions':{'type':'array','items':row,'maxItems':len(context['prior']['selection']['categories'])},
                          'coverage_additions':{'type':'array','items':coverage,'maxItems':128}}}

def materialize_delta(root, context, delta):
    return _materialize_delta(root,context,delta)

def _materialize_delta(root, context, delta, *, historical=False):
    """Normalize a genuine approval's closed delta before the unchanged seal procedure."""
    keys={'kind','binding','reason','design','acceptance_additions','category_additions','coverage_additions'}
    if not isinstance(delta,dict) or set(delta)!=keys or delta['kind']!=DELTA_KIND or delta['binding']!=context['binding']:
        raise ValueError('Delta binding or fields changed')
    capture=_delta_context if historical else delta_context
    options={'publication_scope':context['publication_scope']} if historical and 'publication_scope' in context else {}
    fresh=capture(root,context['binding']['source_commit'],context['binding']['source_tree'],origin_main=context['binding']['origin_main'],prior_proposal_sha256=context['binding']['prior_proposal_sha256'],**options)
    if fresh!=context: raise ValueError('Delta source/prior/inventory changed')
    prior=context['prior']['selection']; value=copy.deepcopy(prior)
    # A delta keeps the prior class; a null design keeps the prior feature design.
    design=delta['design'] if delta['design'] is not None else prior.get('design')
    value.update(revision_of=context['prior']['contract_sha256'], reason=delta['reason'], design=design)
    added=delta['acceptance_additions']
    if not isinstance(added,list) or not 1<=len(added)<=32 or not all(text(x) for x in added):
        raise ValueError('Delta needs bounded new criteria')
    value['acceptance']+=added
    categories={r['name']:r for r in value['categories']}; seen=set(); new_paths=set()
    if (not isinstance(delta['category_additions'],list) or len(delta['category_additions'])>len(categories)
            or not isinstance(delta['coverage_additions'],list) or len(delta['coverage_additions'])>128):
        raise ValueError('Delta category/coverage bounds changed')
    previous_paths={p for r in prior['categories'] for p in r['tests']+r['fixtures']}
    for row in delta['category_additions']:
        if (not isinstance(row,dict) or set(row)!={'name','tests','fixtures'} or row['name'] not in TESTED
                or row['name'] not in categories or row['name'] in seen): raise ValueError('Invalid delta category')
        seen.add(row['name'])
        for key in ('tests','fixtures'):
            names=row[key]
            if (not isinstance(names,list) or len(names)!=len(set(names)) or any(p not in context['test_paths'] for p in names)
                    or set(names)&previous_paths): raise ValueError('Unknown, repeated or retained delta test path')
            categories[row['name']][key]+=sorted(names);new_paths.update(names)
        if set(row['tests']) & set(row['fixtures']): raise ValueError('Delta test/fixture paths overlap')
    value['scope_paths']=sorted(set(context['paths'])|new_paths)
    offset=len(prior['acceptance']); mappings={r['module']:r for r in value['acceptance_tests']};seen=set()
    for row in delta['coverage_additions']:
        if (not isinstance(row,dict) or set(row)!={'module','covers','purpose'} or row['module'] in seen
                or not isinstance(row['covers'],list) or not row['covers'] or len(row['covers'])!=len(set(row['covers']))
                or any(type(i) is not int or not 0<=i<len(added) for i in row['covers'])): raise ValueError('Invalid delta coverage')
        seen.add(row['module']); indices=[offset+i for i in row['covers']]
        if row['module'] in mappings:
            if row['purpose'] is not None: raise ValueError('Retained mapping purpose cannot change')
            mappings[row['module']]['covers']+=indices
        else:
            value['acceptance_tests'].append({'module':row['module'],'covers':indices,'purpose':row['purpose']})
    validate_selection(value,blob(root,context['binding']['source_tree'],CATALOG))
    retained=copy.deepcopy(value)
    if retained['acceptance'][:offset]!=prior['acceptance']: raise ValueError('Prior criteria changed')
    projected=[dict(row,covers=[i for i in row['covers'] if i<offset]) for row in value['acceptance_tests'] if row['module'] in {r['module'] for r in prior['acceptance_tests']}]
    if projected!=prior['acceptance_tests']: raise ValueError('Prior coverage changed')
    audit={'kind':DELTA_KIND,'binding':context['binding'],'raw_delta_sha256':digest(delta),
           'selection_sha256':digest(value),'scope_sha256':digest(value['scope_paths']),
           'retained_acceptance_sha256':digest(prior['acceptance']), 'retained_coverage_sha256':digest(projected)}
    if 'publication_scope' in context:audit['publication_scope']=copy.deepcopy(context['publication_scope'])
    return value,audit

def reconstruct_delta_record(root,audit,delta):
    """Read both closed producer shapes without changing an older raw response/audit."""
    binding=audit['binding'];base_keys={'prior_contract_sha256','source_commit','source_tree','origin_main','inventory_sha256','test_inventory_sha256'}
    legacy=set(binding)==base_keys
    if not legacy and set(binding)!=base_keys|{'prior_proposal_sha256'}:raise ValueError('Unknown delta binding shape')
    options={'origin_main':binding['origin_main']}
    if not legacy:options['prior_proposal_sha256']=binding['prior_proposal_sha256']
    if 'publication_scope' in audit:options['publication_scope']=audit['publication_scope']
    context=_delta_context(root,binding['source_commit'],binding['source_tree'],**options)
    if context['binding']['prior_proposal_sha256'] is None:raise ValueError('Verified native prior required for delta consumption')
    if legacy:
        # The earlier producer bound the exact prior contract. Establish its
        # actual native archive now; normalize only an in-memory verification
        # copy and compare against the unchanged original audit and bytes.
        reduced={k:v for k,v in context['binding'].items() if k!='prior_proposal_sha256'}
        if reduced!=binding or delta.get('binding')!=binding:raise ValueError('Legacy delta binding changed')
        normalized=dict(delta,binding=context['binding'])
        selection,expected=_materialize_delta(root,context,normalized,historical=True)
        expected.update(binding=binding,raw_delta_sha256=digest(delta))
    else:
        selection,expected=_materialize_delta(root,context,delta,historical=True)
    if expected!=audit:raise ValueError('Delta normalization audit changed')
    return selection,context

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

def commands(selection,catalog,*,legacy=False):
    if type(legacy) is not bool: raise ValueError('Closed command generation mode required')
    result=[]
    for row in selection['categories']:
        name=row['name']; tests=row['tests']; fixtures=row['fixtures']
        if not isinstance(fixtures,list) or len(fixtures)!=len(set(fixtures)) or any(not safe_path(p) or not p.startswith('tests/') or any(c in p for c in '*?[]') for p in fixtures): raise ValueError('Fixtures require exact nonempty project test paths')
        if set(tests)&set(fixtures): raise ValueError('Test and fixture paths must be distinct')
        if name=='sanity': argv=['python3','tools/validation_contract.py','sanity']
        else:
            if name=='regression': tests=[r['test'] for r in catalog['regression']]
            argv=['node','--test','--test-reporter=tap',*([] if legacy else ['--test-concurrency=1']),*tests]
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
    # Historical genuine seals keep their original complete vector. A new seal
    # always declares the bounded vector; mixed or caller-chosen options reject.
    if contract['catalog_sha256']!=digest(catalog) or contract['commands'] not in (
            commands(selection,catalog),commands(selection,catalog,legacy=True)):
        raise ValueError('Catalog or selected commands changed; obtain explicit Oracle revision')
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

# History integrity (owner direction, 2026-11-23: "the oracle should have
# prevented you from changing git history"). Recorded commits never leave
# history: a reset, rebase, amend or force-push is refused deterministically,
# naming the record and commit. The remedy is merging forward, never a rewrite.
# Continuation records bind the current tip; candidate-owned prerequisites bind
# the candidate itself, so a prepared ancestor survives later descendant work.
HISTORY_REFUSAL='History integrity refusal'

class HistoryRewritten(ValueError):
    """A recorded or published commit is no longer in the required history."""

def _history_json(path):
    try:
        path=Path(path)
        if path.is_symlink() or not path.is_file():return None
        value=json.loads(path.read_bytes())
    except (OSError,ValueError):return None
    return value if isinstance(value,dict) else None

def _history_commit(root,rev):
    p=subprocess.run(['git','rev-parse','--verify','--quiet',rev+'^{commit}'],cwd=root,capture_output=True,text=True)
    return p.stdout.strip() if p.returncode==0 else None

def _history_spec(root,commit):
    try:spec=blob(root,commit,SELECTION)
    except ValueError:return None
    return spec if isinstance(spec,dict) else None

def candidate_history(root,candidate):
    """Candidate-owned prerequisites, read from the candidate itself."""
    rows=[];spec=_history_spec(root,candidate)
    if spec is None:return rows,None
    rows.append(('sealed spec base_commit',spec.get('base_commit')))
    if isinstance(spec.get('stamp'),dict):rows.append(('sealed spec stamp origin_main',spec['stamp'].get('origin_main')))
    folder=Path(git(root,'rev-parse','--absolute-git-dir'))/'oracle/proposals'
    archived={}
    for path in sorted(folder.glob('*.json')) if folder.is_dir() else []:
        record=_history_json(path);prior=record.get('validation_contract') if record else None
        if isinstance(prior,dict) and isinstance(prior.get('contract_sha256'),str):archived.setdefault(prior['contract_sha256'],[]).append((path,record,prior))
    selection=spec.get('selection') if isinstance(spec.get('selection'),dict) else {}
    wanted,seen=selection.get('revision_of'),set()
    while isinstance(wanted,str) and wanted not in seen:
        seen.add(wanted);found=None
        for path,record,prior in archived.get(wanted,[]):
            body={k:v for k,v in prior.items() if k not in ('contract_sha256','seal')}
            if (not path.is_symlink() and prior.get('schema')==SCHEMA and digest(body)==wanted and spec_seal.seal_matches(prior)
                    and native_proposal_record(root,path,prior,candidate,ancestry=False)):
                found=(path,record,prior);break
        if found is None:break # Earlier history without an authentic native archive binds nothing further.
        path,record,prior=found;label='revision '+wanted[:12]+' archive'
        rows.extend([(label+' base_commit',record.get('base_commit')),(label+' lifecycle_origin',record.get('lifecycle_origin',record.get('base_commit'))),
                     (label+' stamp origin_main',prior['stamp'].get('origin_main') if isinstance(prior.get('stamp'),dict) else None)])
        wanted=prior['selection'].get('revision_of') if isinstance(prior.get('selection'),dict) else None
    return rows,spec.get('contract_sha256')

def continuation_history(root,contracts=(),series=None):
    """Active continuation records, which the current checkout tip must contain."""
    oracle=Path(git(root,'rev-parse','--absolute-git-dir'))/'oracle';rows=[]
    for name,keys in (('proposal.json',('base_commit','lifecycle_origin')),('lifecycle-origin.json',('origin',)),('approval.json',('base_commit',))):
        record=_history_json(oracle/name)
        for key in keys if record else ():
            if key in record:rows.append(('recorded '+name+' '+key,record[key]))
    for contract in dict.fromkeys(c for c in contracts if isinstance(c,str) and re.fullmatch('[0-9a-f]{64}',c)):
        results=oracle/'validation-contract-results'/contract
        for entry in sorted(results.iterdir()) if results.is_dir() and not results.is_symlink() else []:
            if entry.is_dir() and not entry.is_symlink():rows.append(('recorded validation commit',entry.name))
    if series is not None and Path(series).is_dir():
        for path in sorted(Path(series).glob('round-*.json')):
            record=_history_json(path)
            if record is not None:rows.append(('review series '+path.name+' base_commit',record.get('base_commit')))
    return rows

def _history_refuse(root,rows,target,role):
    """Verify every recorded row; returns the number of rows verified."""
    checked=set()
    for label,commit in rows:
        if commit in checked:continue
        if not isinstance(commit,str) or not re.fullmatch('[0-9a-f]{40}',commit) or _history_commit(root,commit)!=commit:
            raise HistoryRewritten(HISTORY_REFUSAL+': recorded '+label+' '+str(commit)+' is missing from this repository; '
                                   'recover that commit and merge it forward, never rewrite recorded history')
        if subprocess.run(['git','merge-base','--is-ancestor',commit,target],cwd=root,capture_output=True).returncode:
            if label=='published origin/main':
                raise HistoryRewritten(HISTORY_REFUSAL+': candidate '+target+' would not fast-forward published origin/main '+commit+
                                       '; fetch and merge origin/main forward, never force-push')
            raise HistoryRewritten(HISTORY_REFUSAL+': recorded '+label+' '+commit+' is not an ancestor of the '+role+' '+target+
                                   '; history was rewritten (reset, rebase, amend or force-push). Merge that commit forward instead')
        checked.add(commit)
    return len(rows)

def require_history(root,candidate='HEAD',*,tip='HEAD',series=None,published=True,extra=()):
    """Refuse a candidate whose recorded or published history is no longer ancestry.

    Continuation records (including the active review series, resolved through the
    native series selection when `series` is not supplied) and the candidate must be
    ancestors of the current tip; the candidate's own sealed spec, revision chain,
    `extra` prerequisites and the fetched origin/main (when `published`) must be
    ancestors of the candidate."""
    head,current=_history_commit(root,candidate),_history_commit(root,tip)
    if head is None or current is None:raise HistoryRewritten(HISTORY_REFUSAL+': candidate '+str(candidate)+' or tip '+str(tip)+' is not a commit')
    if series is None:
        try: from . import oracle_approval as native
        except ImportError: import oracle_approval as native
        series=native._current_series(Path(root))
    owned,contract=candidate_history(root,head)
    rows=[*owned,*extra]
    if published:
        main=_history_commit(root,'refs/remotes/origin/main')
        if main is not None:rows.append(('published origin/main',main))
    checked=_history_refuse(root,rows,head,'candidate')
    tip_spec=_history_spec(root,current) if current!=head else None
    continuation=[('selected candidate',head),*continuation_history(root,[contract,(tip_spec or {}).get('contract_sha256')],series)]
    checked+=_history_refuse(root,continuation,current,'current tip')
    return {'candidate':head,'tip':current,'checked':checked}

def gate(root,base,head='HEAD'):
    """Fail immediately unless a non-docs range carries its own valid sealed spec."""
    require_history(root,head,published=False)
    head=git(root,'rev-parse',head+'^{commit}');base=git(root,'rev-parse',base+'^{commit}')
    if subprocess.run(['git','merge-base','--is-ancestor',base,head],cwd=root,capture_output=True).returncode: raise ValueError('Publication base is not candidate ancestry')
    paths=git(root,'diff','--name-only',base,head).splitlines()
    if not paths: raise ValueError('No changes to admit')
    if all(documentation(p) for p in paths): return {'status':'DOCS_ONLY','paths':paths}
    if SELECTION not in paths or blob(root,head,SELECTION) is None: raise ValueError('Non-docs change lacks its sealed Oracle spec: '+SELECTION+' must be sealed for this changelist')
    try: contract=verify(root,head)
    except (KeyError,TypeError,AttributeError,subprocess.CalledProcessError) as error: raise ValueError('Sealed Oracle spec is malformed: '+type(error).__name__) from error
    if contract['selection']['change_class']=='docs_only': raise ValueError('A docs_only spec cannot admit non-document changes')
    outside=sorted(p for p in paths if p!=SELECTION and not scoped(p,contract['selection']))
    if outside: raise ValueError('Publication range changes paths outside the sealed spec scope: '+', '.join(outside))
    return {'status':'SPEC_SEALED','paths':paths,'seal':contract['seal'],'contract_sha256':contract['contract_sha256'],'categories':[r['category'] for r in contract['commands']]}

def native_proposal_record(root,path,contract,head,*,ancestry=True):
    """True only for an immutable, canonical, self-bound APPROVED native proposal archive of this exact spec.

    `ancestry=False` authenticates the archive without its history predicate so the
    history-integrity check can refuse an orphaned archive instead of skipping it."""
    try: from . import oracle_approval as native
    except ImportError: import oracle_approval as native
    try:
        raw=Path(path).read_bytes();record=json.loads(raw)
    except (OSError,ValueError): return False
    if not isinstance(record,dict) or Path(path).name!=native._sha(raw)+'.json' or raw!=native._pretty(record): return False
    body={k:x for k,x in record.items() if k!='proposal_review_id'}
    review=record.get('review') if isinstance(record.get('review'),dict) else {}
    proposal=record.get('proposal')
    if record.get('validation_contract')!=contract:return False
    if not (record.get('proposal_review_id')==native._sha(native._canonical(body))
            and record.get('schema_version')==native.SCHEMA_VERSION and record.get('issuer')==native.ISSUER
            and record.get('kind')=='proposal-review' and record.get('review_scope')=='CONCEPTUAL_PROPOSAL'
            and review.get('verdict')=='APPROVED' and review.get('review_status')=='COMPLETE' and review.get('findings')==[]
            and isinstance(proposal,str) and record.get('proposal_sha256')==hashlib.sha256(proposal.encode()).hexdigest()
            and record.get('proposal_sha256')==contract['stamp']['proposal_sha256']
            and record.get('base_commit')==contract['base_commit']
            and (not ancestry or subprocess.run(['git','merge-base','--is-ancestor',contract['base_commit'],head],cwd=root,capture_output=True).returncode==0)):return False
    if record.get('proposal_materialization') is not None:
        try:
            audit=record['proposal_materialization']; raw_review=record['raw_review']
            if audit['binding']['source_commit']!=record['base_commit']:return False
            prior=blob(root,audit['binding']['source_tree'],SELECTION)
            if (prior['contract_sha256']!=audit['binding']['prior_contract_sha256']
                    or len(prior['selection']['acceptance'])>=len(contract['selection']['acceptance'])):return False
            response=record['raw_response']
            if set(response)!={'path','sha256','engine_path','engine_sha256'}:return False
            for path_key,hash_key in (('path','sha256'),('engine_path','engine_sha256')):
                name=response[path_key]
                if not isinstance(name,str) or not re.fullmatch(r'\.git/oracle/runs/review_proposal-[a-f0-9]+/(?:raw-proposal-response|result)\.json',name):return False
                raw=native._custody_read(root,Path(root)/name)[1]
                if native._sha(raw)!=response[hash_key] or json.loads(raw)!=raw_review:return False
            if (raw_review.get('verdict')!='APPROVED' or raw_review.get('review_status')!='COMPLETE'
                    or raw_review.get('findings')!=[]): return False
            selection,context=reconstruct_delta_record(root,audit,raw_review['validation_selection'])
            if audit['binding']['origin_main'] is not None and contract['stamp']['origin_main']!=audit['binding']['origin_main']:return False
            if selection!=contract['selection'] or selection!=review.get('validation_selection'):
                return False
        except (ValueError,KeyError,TypeError,OSError,subprocess.SubprocessError,native.OracleApprovalError): return False
    return True

def native_origin(root,head='HEAD'):
    """Local admission: the committed spec must equal a genuine APPROVED native proposal archive's contract."""
    contract=verify(root,head)
    if contract is None: raise ValueError('No sealed spec to admit')
    head=git(root,'rev-parse',head+'^{commit}')
    folder=Path(git(root,'rev-parse','--absolute-git-dir'))/'oracle/proposals'
    for path in sorted(folder.glob('*.json')) if folder.is_dir() else []:
        if not path.is_symlink() and path.is_file() and native_proposal_record(root,path,contract,head): return str(path)
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

def _stream_directory(root,binding,run_id,*,create=False):
    """Open the exact native namespace without following a substituted directory."""
    if (not re.fullmatch('[a-f0-9]{64}',binding.get('contract_sha256',''))
            or not re.fullmatch('[a-f0-9]{40}',binding.get('commit',''))
            or not re.fullmatch('[a-f0-9]{32}',run_id)):
        raise ValueError('Invalid native stream identity')
    fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        for name in ('.git','oracle','validation-contract-results',binding['contract_sha256'],binding['commit'],'streams',run_id):
            if create:
                try:os.mkdir(name,0o700,dir_fd=fd)
                except FileExistsError:
                    if name==run_id:raise ValueError('Native stream identity already exists')
            child=os.open(name,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            fact=os.fstat(child)
            if fact.st_uid!=os.getuid() or fact.st_mode&0o022:
                os.close(child);raise ValueError('Native stream directory custody changed')
            os.close(fd);fd=child
        return fd
    except BaseException:
        os.close(fd);raise

def _stream_write(directory,name,raw):
    temporary='.pending-'+uuid.uuid4().hex
    fd=os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=directory)
    try:
        with os.fdopen(fd,'wb') as stream:
            stream.write(raw);stream.flush();os.fsync(stream.fileno())
        os.link(temporary,name,src_dir_fd=directory,dst_dir_fd=directory,follow_symlinks=False)
        os.fsync(directory)
    finally:os.unlink(temporary,dir_fd=directory)
    return sha256(raw)

def _stream_read(directory,name,limit=16*1024*1024):
    if not re.fullmatch(r'[a-zA-Z0-9._-]+',name):raise ValueError('Invalid native stream member')
    fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=directory)
    with os.fdopen(fd,'rb') as stream:
        before=os.fstat(stream.fileno())
        if (not stat.S_ISREG(before.st_mode) or before.st_uid!=os.getuid()
                or stat.S_IMODE(before.st_mode)!=0o600 or before.st_size>limit):
            raise ValueError('Native stream member custody changed')
        raw=stream.read(limit+1);after=os.fstat(stream.fileno())
        if (len(raw)!=before.st_size or (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)
                !=(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns)):
            raise ValueError('Native stream member changed during read')
        return raw

def _stream_binding(record):
    return {key:record[key] for key in ('contract_sha256','commit','tree','category','phase','command','fixtures','runtime')}

def stream_summary_text(stdout,stderr):
    # subprocess.run(text=True) historically translated each stream separately.
    return ''.join(raw.decode(locale.getpreferredencoding(False)).replace('\r\n','\n').replace('\r','\n') for raw in (stdout,stderr))

def stream_execution(root,command,environment,binding,*,forward=True):
    """Retain each real binary read before forwarding it to the owning supervisor.

    A killed controller leaves an explicitly unfinished start record and immutable
    chunks. Neither those chunks nor a signal-handling child's zero exit is PASS.
    """
    if binding.get('command')!=command:raise ValueError('Stream command binding changed')
    run_id=uuid.uuid4().hex;directory=_stream_directory(root,binding,run_id,create=True)
    encode=lambda value:json.dumps(value,sort_keys=True,separators=(',',':')).encode()
    reference={'kind':'boc.validation-stream/1','run_id':run_id}
    child=None;interrupted=[];handlers={};chunks=[];parts={'stdout':[],'stderr':[]}
    def stop(number,frame):
        interrupted.append(number)
        if child is not None and child.poll() is None:
            try:child.send_signal(number)
            except ProcessLookupError:pass
    try:
        identity=os.fstat(directory)
        start={'kind':reference['kind'],'binding':binding,'run_id':run_id,
               'directory':{'dev':identity.st_dev,'ino':identity.st_ino,'uid':identity.st_uid,'mode':stat.S_IMODE(identity.st_mode)},
               'environment_sha256':digest(environment)}
        reference['start_sha256']=_stream_write(directory,'start.json',encode(start))
        for number in (signal.SIGINT,signal.SIGTERM):
            handlers[number]=signal.signal(number,stop)
        child=subprocess.Popen(command,cwd=root,env=environment,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        with selectors.DefaultSelector() as ready:
            for stream,name in ((child.stdout,'stdout'),(child.stderr,'stderr')):ready.register(stream,selectors.EVENT_READ,name)
            while ready.get_map():
                for key,event in ready.select(.2):
                    raw=os.read(key.fileobj.fileno(),65536)
                    if not raw:ready.unregister(key.fileobj);key.fileobj.close();continue
                    name=key.data;index=len(chunks);checksum=sha256(raw)
                    member=f'{index:08d}-{name}-{checksum}.bin'
                    _stream_write(directory,member,raw)
                    chunks.append({'index':index,'stream':name,'file':member,'bytes':len(raw),'sha256':checksum});parts[name].append(raw)
                    if forward:
                        output=getattr(sys,name).buffer;output.write(raw);output.flush()
        child_code=child.wait();code=128+interrupted[0] if interrupted else child_code
        outputs={name:b''.join(values) for name,values in parts.items()}
        inventory={'chunks':chunks,'streams':{name:{'bytes':len(raw),'sha256':sha256(raw)} for name,raw in outputs.items()}}
        reference['index_sha256']=_stream_write(directory,'index.json',encode(inventory))
        finish={'status':'INCOMPLETE' if interrupted else 'COMPLETE','returncode':code,'child_returncode':child_code,
                'signals':interrupted,'start_sha256':reference['start_sha256'],'index_sha256':reference['index_sha256']}
        reference['finish_sha256']=_stream_write(directory,'finish.json',encode(finish))
        result=subprocess.CompletedProcess(command,code,outputs['stdout'],outputs['stderr']);result.stream_custody=reference
        return result
    finally:
        for number,handler in handlers.items():signal.signal(number,handler)
        if child is not None and child.poll() is None:
            child.terminate()
            try:child.wait(timeout=5)
            except subprocess.TimeoutExpired:child.kill();child.wait()
        for stream in (getattr(child,'stdout',None),getattr(child,'stderr',None)):
            if stream is not None:stream.close()
        os.close(directory)

def verify_stream_execution(root,record):
    reference=record['stream_custody'];keys={'kind','run_id','start_sha256','index_sha256','finish_sha256'}
    if (not isinstance(reference,dict) or set(reference)!=keys or reference['kind']!='boc.validation-stream/1'
            or any(not re.fullmatch('[a-f0-9]{64}',reference[key]) for key in keys-{'kind','run_id'})):
        raise ValueError('Native stream reference changed')
    binding=_stream_binding(record);directory=_stream_directory(root,binding,reference['run_id'])
    try:
        values={}
        for name in ('start','index','finish'):
            raw=_stream_read(directory,name+'.json')
            if sha256(raw)!=reference[name+'_sha256']:raise ValueError('Native stream evidence changed')
            values[name]=json.loads(raw)
        start,index,finish=(values[name] for name in ('start','index','finish'));fact=os.fstat(directory)
        if (set(start)!={'kind','binding','run_id','directory','environment_sha256'} or start['kind']!=reference['kind']
                or start['binding']!=binding or start['run_id']!=reference['run_id']
                or start['directory']!={'dev':fact.st_dev,'ino':fact.st_ino,'uid':fact.st_uid,'mode':stat.S_IMODE(fact.st_mode)}
                or not re.fullmatch('[a-f0-9]{64}',start['environment_sha256'])):
            raise ValueError('Native stream input custody changed')
        if (set(index)!={'chunks','streams'} or set(finish)!={'status','returncode','child_returncode','signals','start_sha256','index_sha256'}
                or finish['start_sha256']!=reference['start_sha256'] or finish['index_sha256']!=reference['index_sha256']
                or finish['returncode']!=record['exit_code'] or finish['status'] not in ('COMPLETE','INCOMPLETE')
                or (finish['status']=='COMPLETE' and (finish['signals'] or finish['child_returncode']!=record['exit_code']))
                or not isinstance(finish['signals'],list)
                or any(type(number) is not int or number not in (signal.SIGINT,signal.SIGTERM) for number in finish['signals'])
                or (finish['status']=='INCOMPLETE' and (not finish['signals'] or record['exit_code']!=128+finish['signals'][0]
                    or record.get('passed') is True))):
            raise ValueError('Native stream completion changed')
        parts={'stdout':[],'stderr':[]};members={'start.json','index.json','finish.json'}
        for number,chunk in enumerate(index['chunks']):
            if (set(chunk)!={'index','stream','file','bytes','sha256'} or type(chunk['index']) is not int or chunk['index']!=number
                    or chunk['stream'] not in parts or type(chunk['bytes']) is not int or not 0<chunk['bytes']<=65536
                    or not re.fullmatch('[a-f0-9]{64}',chunk['sha256'])
                    or chunk['file']!=f"{number:08d}-{chunk['stream']}-{chunk['sha256']}.bin"):
                raise ValueError('Native stream sequence changed')
            raw=_stream_read(directory,chunk['file'],65536)
            if len(raw)!=chunk['bytes'] or sha256(raw)!=chunk['sha256']:raise ValueError('Native stream bytes changed')
            parts[chunk['stream']].append(raw);members.add(chunk['file'])
        if set(os.listdir(directory))!=members:raise ValueError('Native stream membership changed')
        outputs={name:b''.join(values) for name,values in parts.items()}
        if index['streams']!={name:{'bytes':len(raw),'sha256':sha256(raw)} for name,raw in outputs.items()}:
            raise ValueError('Native stream summary changed')
        return outputs,finish
    finally:os.close(directory)

def originals(root,contract,phase):
    folder=Path(git(root,'rev-parse','--absolute-git-dir'))/'oracle/validation-contract-results'/contract['contract_sha256']
    for p in folder.glob('*/*-'+phase+'-*.json'):
        d=json.loads(p.read_text());body={k:v for k,v in d.items() if k!='record_sha256'}
        if digest(body)!=d.get('record_sha256') or hashlib.sha256(Path(d['output_file']).read_bytes()).hexdigest()!=d['output_sha256']:raise ValueError('Original execution custody changed')
        if 'stream_custody' in d:
            streams,finish=verify_stream_execution(root,d)
            if stream_summary_text(streams['stdout'],streams['stderr'])!=Path(d['output_file']).read_text():
                raise ValueError('Native stream output differs from original execution')
        yield {**d, '_record_path':str(p)}

def revision_chain(root,contract,head):
    """This contract, then each prior revision it names, each proven by its own APPROVED native proposal archive."""
    folder=Path(git(root,'rev-parse','--absolute-git-dir'))/'oracle/proposals'
    archived={}
    for path in sorted(folder.glob('*.json')) if folder.is_dir() else []:
        try:prior=json.loads(path.read_bytes()).get('validation_contract')
        except (OSError,ValueError,AttributeError):continue
        if isinstance(prior,dict) and isinstance(prior.get('contract_sha256'),str):archived.setdefault(prior['contract_sha256'],[]).append((path,prior))
    chain,current=[contract],contract
    while current['selection'].get('revision_of') is not None:
        wanted=current['selection']['revision_of']
        if any(item['contract_sha256']==wanted for item in chain):raise ValueError('Contract revision chain repeats')
        found=None
        for path,prior in archived.get(wanted,[]):
            body={k:v for k,v in prior.items() if k not in ('contract_sha256','seal')}
            if (not path.is_symlink() and prior.get('schema')==SCHEMA and digest(body)==wanted
                    and spec_seal.seal_matches(prior) and native_proposal_record(root,path,prior,head)):
                found=prior;break
        if found is None:break # Earlier history without a native archive supplies no reproduction.
        chain.append(found);current=found
    return chain

def fail_before(root,contract,category,fixtures,command,head):
    """Genuine assertion-failure reproductions of exactly these test bytes.

    A revision keeps the reproduction its revision chain already captured when the
    selected command, every test/fixture blob and the runtime are identical and the
    reproduced commit remains in history; nothing is re-run on withdrawn fixes."""
    records=[]
    for owner in revision_chain(root,contract,head):
        for r in originals(root,owner,'before'):
            output=Path(r['output_file']).read_text(errors='replace')
            if (r.get('inputs_unchanged') is True and r['category']==category and r.get('phase')=='before'
                    and r['contract_sha256']==owner['contract_sha256'] and r['fixtures']==fixtures
                    and r['command']==command and r['runtime']==contract['runtime'] and r['exit_code']!=0
                    and r['summary'].get('complete') and r['summary'].get('fail',0)>0 and 'ERR_ASSERTION' in output
                    and not any(r['summary'].get(k,0) for k in ('skipped','todo','cancelled'))
                    and Path(r['_record_path']).name==category+'-before-'+str(r.get('record_sha256'))+'.json'
                    and subprocess.run(['git','merge-base','--is-ancestor',r['commit'],head],cwd=root,capture_output=True).returncode==0):
                records.append(r)
    return records

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
        if not fail_before(root,contract,category,fixtures,row['argv'],commit):raise ValueError('Missing unchanged-test fail-before execution; do not substitute an infrastructure error')
    env={k:v for k,v in os.environ.items() if k!='NODE_TEST_CONTEXT'}
    binding={'contract_sha256':contract['contract_sha256'],'commit':commit,'tree':git(root,'rev-parse',commit+'^{tree}'),
             'category':category,'phase':phase,'command':row['argv'],'fixtures':fixtures,'runtime':contract['runtime']}
    result=stream_execution(root,row['argv'],env,binding);text=stream_summary_text(result.stdout,result.stderr)
    summary=result_summary(text,result.returncode,bool(row['tests']));unchanged=git(root,'rev-parse','HEAD')==commit and not git(root,'status','--porcelain=v1','--untracked-files=all') and runtime()==contract['runtime']
    record={'kind':'boc-validation-execution-v1','result_scope':'validation_phase','e2e_status':'NOT_EVALUATED','delivery_policy':contract['delivery_policy'],'finished_at':datetime.now(timezone.utc).isoformat(),'execution_environment':{'node':contract['runtime']['node'],'python':platform.python_version(),'platform':platform.system()},'contract_sha256':contract['contract_sha256'],'catalog_sha256':contract['catalog_sha256'],'commit':commit,'tree':git(root,'rev-parse',commit+'^{tree}'),'category':category,'phase':phase,'command':row['argv'],'fixtures':fixtures,'runtime':contract['runtime'],'controller_python':platform.python_version(),'exit_code':result.returncode,'summary':summary,'inputs_unchanged':unchanged,'passed':phase=='after' and summary['passed'] and unchanged}
    record['stream_custody']=result.stream_custody
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
