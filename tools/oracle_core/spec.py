"""Shared structured proposal checks and explicit-catalog oracle-spec/1 materialization."""
from datetime import datetime,timezone
import hashlib,re
from .custody import identity
from .seal import compute_seal,seal_matches

CLASSES={'docs_only':['sanity'],'bug_fix':['sanity','focused'],'deep_bug_fix':['sanity','focused','interactions'],'feature':['sanity','interactions','acceptance']}
KEYS={'change_class','scope_paths','categories','reason','revision_of','design','acceptance','acceptance_tests'}


def safe_path(value):
    return isinstance(value,str) and bool(value) and not value.startswith(('/','-')) and '\\' not in value and '..' not in value.split('/') and not any(c in value for c in '\n\r\0')


def check_review(review):
    if not isinstance(review,dict) or review.get('review_status')!='COMPLETE' or review.get('verdict') not in ['APPROVED','REJECTED']:
        raise ValueError('Complete structured proposal decision required')
    if not isinstance(review.get('summary'),str) or not review['summary'].strip() or not isinstance(review.get('findings'),list):raise ValueError('Decision summary/findings required')
    if review['verdict']=='APPROVED' and review['findings']:raise ValueError('Approved proposal has open findings')
    if review['verdict']=='REJECTED' and not review['findings']:raise ValueError('Rejected proposal needs actual findings')
    return review


def validate_review(review,catalog):
    check_review(review)
    if set(review)-{'review_status','verdict','summary','findings','validation_selection'}:raise ValueError('Unexpected proposal result fields')
    for finding in review['findings']:
        if not isinstance(finding,dict) or set(finding)!={'severity','message'} or finding['severity'] not in ['critical','high','medium','low'] or not isinstance(finding['message'],str) or not finding['message'].strip():raise ValueError('Finding shape malformed')
    if review['verdict']=='REJECTED':return review
    selection=review.get('validation_selection')
    if not isinstance(selection,dict) or set(selection)!=KEYS:raise ValueError('Complete closed validation selection required')
    if catalog.get('schema')!='boc.validation-catalog/v1' or catalog.get('classes')!=CLASSES:raise ValueError('Explicit compatible project catalog required')
    kind=selection['change_class']
    if kind not in CLASSES or not isinstance(selection['categories'],list):raise ValueError('Unknown change class')
    names=[x.get('name') for x in selection['categories']]
    if len(set(names))!=len(names) or not set(CLASSES[kind])<=set(names):raise ValueError('Required class categories missing or duplicated')
    if kind in ['docs_only','bug_fix'] and names!=CLASSES[kind]:raise ValueError('Minimal class categories must stay exact')
    if not isinstance(selection['scope_paths'],list) or not selection['scope_paths'] or not all(safe_path(p) for p in selection['scope_paths']):raise ValueError('Explicit safe source scope required')
    if not isinstance(selection['reason'],str) or not selection['reason'].strip():raise ValueError('Selection rationale required')
    if selection['revision_of'] is not None and not re.fullmatch('[a-f0-9]{64}',selection['revision_of']):raise ValueError('Revision digest malformed')
    if kind=='feature':
        if not safe_path(selection['design']) or not selection['design'].endswith('.md'):raise ValueError('Feature design required')
    elif selection['design'] is not None:raise ValueError('Only features have a design')
    selected=set()
    for row in selection['categories']:
        if set(row)!={'name','tests','fixtures'} or row['name'] not in {'sanity','focused','interactions','acceptance','regression'}:raise ValueError('Unknown category shape')
        for key in ['tests','fixtures']:
            if not isinstance(row[key],list) or len(row[key])!=len(set(row[key])) or not all(safe_path(p) and p.startswith('tests/') for p in row[key]):raise ValueError('Safe unique test inputs required')
        if set(row['tests'])&set(row['fixtures']):raise ValueError('Test/fixture roles overlap')
        if row['name'] in ['sanity','regression']:
            if row['tests'] or row['fixtures']:raise ValueError('Fixed category command cannot be replaced')
        elif not row['tests']:raise ValueError('Empty test category forbidden')
        selected.update(row['tests'])
    if not selected<=set(catalog.get('modules',{})):raise ValueError('Selected module lacks trusted catalog command')
    criteria=selection['acceptance'];tests=selection['acceptance_tests'];covered=set();modules=[]
    if not isinstance(criteria,list) or not all(isinstance(x,str) and x.strip() for x in criteria) or not isinstance(tests,list):raise ValueError('Acceptance data malformed')
    if kind!='docs_only' and (not criteria or not tests):raise ValueError('Acceptance checks required')
    for row in tests:
        if set(row)!={'module','covers','purpose'} or row['module'] not in selected or not isinstance(row['purpose'],str) or not row['purpose'].strip():raise ValueError('Test mapping malformed')
        if not row['covers'] or not all(type(i) is int and 0<=i<len(criteria) for i in row['covers']):raise ValueError('Acceptance indices malformed')
        covered.update(row['covers']);modules.append(row['module'])
    if len(modules)!=len(set(modules)) or set(range(len(criteria)))-covered:raise ValueError('Acceptance coverage incomplete')
    return review


def materialize(review,proposal,catalog,provenance):
    validate_review(review,catalog)
    if review['verdict']=='REJECTED':return None
    import re
    if any(not isinstance(provenance.get(k),str) or not re.fullmatch('[a-f0-9]{40}',provenance[k]) for k in ['source_commit','source_tree']):raise ValueError('An exact declared Git or export source identity is required')
    if any(not isinstance(provenance.get(k),str) or not re.fullmatch('[a-f0-9]{64}',provenance[k]) for k in ['core_sha256','host_sha256']):raise ValueError('Exact core/runtime identity required')
    selection=review['validation_selection'];commands=[]
    for row in selection['categories']:
        entries=[(name,catalog['modules'][name]) for name in row['tests']]
        if row['name']=='sanity':entries=[('',catalog.get('sanity'))]
        if row['name']=='regression':entries=[(name,catalog['modules'][name]) for name in catalog.get('regression',[])]
        if not entries:raise ValueError('Category has no executable project command')
        for name,argv in entries:
            if not isinstance(argv,list) or not argv or not all(isinstance(x,str) and x for x in argv):raise ValueError('Trusted catalog argv malformed')
            commands.append({'category':row['name'],'argv':argv,'tests':[name] if name else [],'fixtures':row['fixtures']})
    stamp={'engine':provenance['engine'],'model':provenance['model'],'oracle_sha256':provenance['core_sha256'],
           'host':provenance['host_sha256'],'time':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),
           'origin_main':provenance.get('source_commit'),'request_sha256':hashlib.sha256(proposal.encode()).hexdigest(),
           'proposal_sha256':hashlib.sha256(proposal.encode()).hexdigest()}
    value={'schema':'boc.validation-contract/v2','kind':'oracle-spec/1','stamp':stamp,'selection':selection,
           'base_commit':provenance.get('source_commit'),'base_tree':provenance.get('source_tree'),'catalog_sha256':identity(catalog),
           'runtime':provenance,'proposal_sha256':stamp['proposal_sha256'],'review_sha256':identity(review),'commands':commands,
           'delivery_policy':{'sla_seconds':{'docs_only':120,'bug_fix':180,'deep_bug_fix':300,'feature':300}[selection['change_class']],
                              'clock_owner':'build_host','clock_start':'original_insertion','completion':'verified_remote_git','retries_reset_clock':False,
                              'reasoning_effort':'low' if selection['change_class'] in ['docs_only','bug_fix'] else 'medium','maximum_reasoning_effort':'medium'}}
    if selection['change_class']=='feature':
        binding=provenance.get('design_binding')
        if not binding or binding.get('design')!=selection['design']:raise ValueError('Current exact feature design/test-plan binding required')
        value['design_binding']=binding
    value['contract_sha256']=identity(value);value['seal']=compute_seal(value);return value


def verify(value):
    if not seal_matches(value) or value.get('schema')!='boc.validation-contract/v2' or value.get('contract_sha256')!=identity({k:v for k,v in value.items() if k not in ['seal','contract_sha256']}):raise ValueError('Spec identity changed')
    return value
