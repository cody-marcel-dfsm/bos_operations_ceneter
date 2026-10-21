"""Immutable source preparation and actual native cohort delivery, without a model."""
from pathlib import Path
import hashlib
import json
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import oracle_approval as o
from tools import oracle_parallel as parallel
from tools import oracle_source_frontier as frontier
import oracle_parallel_test as fixture_module


BEFORE = '''def marker(fn):
    return fn

def factory(value):
    return value

@marker
class Example:
    CONFIG = "construction"
    def __init__(self, value):
        self.value = factory(value)
    def helper(self, value):
        return value + self.value
    @marker
    def changed(self, value):
        return self.helper(value)
'''
AFTER = BEFORE.replace('return self.helper(value)', 'return self.helper(value) + 1')


class SourceFrontier(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.git('init', '-q'); self.git('config', 'user.name', 'Synthetic Reviewer')
        self.git('config', 'user.email', 'review@example.invalid')
        (self.root/'source.py').write_text(BEFORE)
        (self.root/'AGENTS.md').write_text('Governing original must be read independently')
        for i in range(20):(self.root/f'peer-{i}.py').write_text('def run():\n    return 1\n')
        self.git('add', '.'); self.git('commit', '-qm', 'before')
        self.before = self.git('rev-parse', 'HEAD^{tree}')
        (self.root/'source.py').write_text(AFTER)
        self.git('add', '.'); self.git('commit', '-qm', 'after'); self.git('branch', '-M', 'main')
        self.tree = self.git('rev-parse', 'HEAD^{tree}')
        inputs = {name: 'git-sha1:' + ':'.join(value) for name,value in frontier._tree(self.root,self.tree).items()}
        self.context = {'base_commit': self.git('rev-parse', 'HEAD'), 'candidate_tree': self.tree,
                        'previous_candidate_tree': self.before, 'input_hashes': inputs,
                        'guards': {'authority_digests': {'AGENTS.md': 'authority-hash'}},
                        'publication_scope': {'baseline_commit': self.before, 'range_sha256': 'range', 'range_paths': ['source.py']}}
        self.plan = {'plan_sha256': 'plan-hash', 'context_sha256': 'context-hash'}
        self.child = self.root/'.git/oracle/runs/fixture'; self.child.mkdir(parents=True)
        self.owner = o._METADATA_ROOT.set(self.root); self.addCleanup(o._METADATA_ROOT.reset,self.owner)

    def git(self,*args):
        return subprocess.check_output(['git',*args],cwd=self.root,text=True).strip()

    def prepare(self,paths=None):
        paths = paths or ['source.py']; snapshot = frontier.snapshot(o,self.root,self.context,paths)
        reference,seal,inline = frontier.prepare(o,self.root,self.context,self.plan,{'required_paths':paths},self.child,snapshot)
        return json.loads(Path(reference['manifest']).read_text()),reference,seal,inline

    def test_changed_method_decorator_headers_constructor_and_dependencies_are_complete(self):
        manifest,reference,seal,inline = self.prepare()
        self.assertEqual(manifest['required_paths'],['source.py']); self.assertFalse(manifest['grants_coverage'])
        units = manifest['entries'][0]['units']
        labels = {(u['side'],u['label']) for u in units if u['kind']=='complete-definition'}
        for label in ['Example.changed','Example.__init__','Example.helper','factory','marker']:
            self.assertIn(('after',label),labels)
        self.assertIn('@marker\n    def changed',inline)
        self.assertIn('class Example:',inline); self.assertIn('assigned-unified-diff',inline)
        self.assertEqual(seal,o._files(self.root,list(seal)))
        self.assertEqual(manifest['snapshot_git_calls'],4)
        for page in manifest['pages']:
            raw=Path(page['path']).read_bytes(); self.assertLessEqual(len(raw),frontier.MAX_PAGE_BYTES)
            self.assertEqual(hashlib.sha256(raw).hexdigest(),page['sha256'])
        self.assertLessEqual(reference['inline_bytes'],frontier.MAX_INLINE_BYTES)

    def test_utf8_pages_reassemble_complete_large_definition_and_preserve_hashes(self):
        path=self.root/'source.py';text='def unicode_body():\n    return '+repr('é🚀'*18000)+'\n'
        path.write_text(text);self.git('add','.');self.git('commit','-qm','unicode source')
        self.context['candidate_tree']=self.git('rev-parse','HEAD^{tree}')
        self.context['base_commit']=self.git('rev-parse','HEAD')
        item=frontier._tree(self.root,self.context['candidate_tree'])['source.py']
        self.context['input_hashes']['source.py']='git-sha1:'+':'.join(item)
        manifest,_,_,_=self.prepare()
        unit=next(u for u in manifest['entries'][0]['units'] if u['side']=='after' and u['label']=='unicode_body')
        self.assertEqual(unit['preparation'],'COMPLETE_PAGED')
        bodies=[json.loads(Path(p['path']).read_bytes())['body'] for p in unit['pages']]
        self.assertEqual(''.join(bodies),text)
        self.assertEqual(hashlib.sha256(text.encode()).hexdigest(),unit['body_sha256'])
        for p in manifest['pages']:self.assertLessEqual(Path(p['path']).stat().st_size,frontier.MAX_PAGE_BYTES)

    def test_governing_virtual_unknown_and_budget_gaps_keep_all_assigned_paths(self):
        paths=['source.py','AGENTS.md','@proposal/scope','unknown.py']
        self.context['input_hashes'].update({'@proposal/scope':'sha256:scope','unknown.py':'sha256:unknown'})
        with patch.object(frontier,'MAX_FRONTIER_BYTES',64):manifest,_,_,inline=self.prepare(paths)
        self.assertEqual([e['path'] for e in manifest['entries']],paths)
        self.assertFalse(inline)
        reasons={entry['path']:entry['gaps'] for entry in manifest['entries']}
        self.assertIn('GOVERNING_OR_PRIVATE_ORIGINAL_READ_REQUIRED',reasons['AGENTS.md'])
        self.assertIn('VIRTUAL_NATIVE_CONTEXT_INPUT',reasons['@proposal/scope'])
        self.assertIn('UNKNOWN_OR_NON_GIT_SOURCE',reasons['unknown.py'])
        self.assertTrue(any(g.startswith('UNIT_ON_DEMAND') for g in reasons['source.py']))
        self.assertEqual(manifest['entries'][0]['originals']['after']['git_oid'],self.git('rev-parse','HEAD:source.py'))

    def test_deleted_binary_and_symlink_inputs_retain_scope_without_following_external_source(self):
        external=self.root.parent/(self.root.name+'-external')
        external.write_text('EXTERNAL_SENTINEL_BODY');self.addCleanup(external.unlink)
        (self.root/'source.py').unlink()
        (self.root/'binary.py').write_bytes(b'\xff\x00')
        (self.root/'link.py').symlink_to(external)
        self.git('add','-A');self.git('commit','-qm','deleted and opaque inputs')
        tree=self.git('rev-parse','HEAD^{tree}');self.context.update(candidate_tree=tree,base_commit=self.git('rev-parse','HEAD'))
        entries=frontier._tree(self.root,tree)
        self.context['input_hashes'].update({name:'git-sha1:'+':'.join(entries[name]) for name in ['binary.py','link.py']})
        self.context['input_hashes']['source.py']=None
        manifest,_,_,inline=self.prepare(['source.py','binary.py','link.py'])
        by_path={entry['path']:entry for entry in manifest['entries']}
        self.assertTrue(any(u['kind']=='complete-definition' and u['side']=='before' for u in by_path['source.py']['units']))
        self.assertIsNone(by_path['source.py']['originals']['after']['git_oid'])
        self.assertIn('after:NON_UTF8_BINARY_OR_LFS_ORIGINAL_REQUIRED',by_path['binary.py']['gaps'])
        self.assertIn('after:NONREGULAR_GIT_INPUT',by_path['link.py']['gaps'])
        self.assertNotIn('EXTERNAL_SENTINEL_BODY',inline)

    def test_git_batches_are_fixed_count_and_reject_truncated_or_modified_bodies(self):
        actual=frontier._git;counts=[]
        def observe(*args,**kwargs):counts.append(args[1]);return actual(*args,**kwargs)
        with patch.object(frontier,'_git',side_effect=observe):
            start=time.monotonic();snap=frontier.snapshot(o,self.root,self.context,['source.py',*[f'peer-{i}.py' for i in range(20)]])
        self.assertEqual(len(counts),4);self.assertEqual(snap['git_calls'],4)
        elapsed=time.monotonic()-start
        print(json.dumps({'source_frontier_batch_measurement':{'assigned_paths':21,'git_commands':len(counts),'seconds':elapsed}}))
        for mode in ['truncate','alter']:
            def corrupt(root,args,data=None):
                raw=actual(root,args,data)
                if args==['cat-file','--batch']:
                    return raw[:-1] if mode=='truncate' else raw.replace(b'return value',b'return other',1)
                return raw
            with self.subTest(mode=mode),patch.object(frontier,'_git',side_effect=corrupt):
                with self.assertRaises(o.OracleApprovalError):frontier.snapshot(o,self.root,self.context,['source.py'])

    def test_actual_parallel_prompt_delivers_exact_source_and_rejects_forged_pages(self):
        fixture=fixture_module.ParallelReview('runTest');fixture.setUp();self.addCleanup(fixture.doCleanups)
        owner=o._METADATA_ROOT.set(self.root);self.addCleanup(o._METADATA_ROOT.reset,owner)
        # Keep the real Git source fixture while reusing the native envelope constructor.
        fixture.root=self.root;fixture.run=self.child
        fixture.context.update(self.context,required_coverage_paths=['source.py'],reusable_coverage=[],
                               prior_findings={},reusable_validations=[],current_validations=[])
        fixture.context['input_hashes']['@proposal/scope']='sha256:synthetic-proposal'
        fixture.binding.update(base_commit=self.context['base_commit'])
        fixture.plan=parallel.partition(fixture.context,fixture.binding,fixture.digest)
        o._atomic_write(self.child/'review-context.json',o._pretty(fixture.context))
        schema=self.root/'.agents/skills/oracle/review-output.schema.json';schema.parent.mkdir(parents=True)
        schema.write_bytes((Path(__file__).resolve().parents[1]/'.agents/skills/oracle/review-output.schema.json').read_bytes())
        seen=[];tamper=[False];delivered=[]
        def consume(root,prompt,prefix,**kwargs):
            run=o._RUN.get();packet=json.loads((run/'cohort-context.json').read_text());cohort=packet['cohort']
            if 'source.py' in cohort['required_paths']:
                self.assertIn('return self.helper(value) + 1',prompt)
                self.assertIn('@marker',prompt);self.assertTrue(packet['prepared_source']['inline_pages'])
                delivered.append({'cohort':cohort['id'],'prompt_bytes':len(prompt.encode()),'inline_pages':packet['prepared_source']['inline_pages'],'source_navigation_commands':0})
                if tamper[0]:
                    manifest=json.loads(Path(packet['prepared_source']['manifest']).read_text())
                    page=Path(manifest['pages'][0]['path']);data=json.loads(page.read_text());data['body']='forged source'
                    data['body_sha256']=hashlib.sha256(data['body'].encode()).hexdigest();o._atomic_write(page,o._pretty(data))
                    forged_sha=hashlib.sha256(page.read_bytes()).hexdigest()
                    for reference in manifest['pages']:
                        if reference['path']==str(page):reference['sha256']=forged_sha
                    for entry in manifest['entries']:
                        for unit in entry['units']:
                            for reference in unit['pages']:
                                if reference['path']==str(page):reference['sha256']=forged_sha
                    manifest_path=Path(packet['prepared_source']['manifest']);o._atomic_write(manifest_path,o._pretty(manifest))
                    packet['prepared_source']['manifest_sha256']=hashlib.sha256(manifest_path.read_bytes()).hexdigest()
                    packet['packet_sha256']=fixture.digest({k:v for k,v in packet.items() if k!='packet_sha256'})
                    o._atomic_write(run/'cohort-context.json',o._pretty(packet))
            seen.append(cohort['id']);envelope=fixture.envelope(cohort)
            for name,value in {'model.json':{'selected_model':'inherited-model','reasoning_effort':'high'},
                               'process.json':{'exit_code':0},'result.json':envelope}.items():o._atomic_write(run/name,o._pretty(value))
            return envelope
        token=o._RUN.set(self.child)
        try:
            with patch.object(o,'_input_binding',return_value=fixture.binding),patch.object(o,'_review_process',side_effect=consume):
                result=parallel.review(o,self.root,self.context['candidate_tree'],['source.py'],{},None)
            self.assertEqual(result['review_status'],'COMPLETE',result['limitations']);self.assertEqual(len(seen),2)
            tamper[0]=True
            with patch.object(o,'_input_binding',return_value=fixture.binding),patch.object(o,'_review_process',side_effect=consume):
                result=parallel.review(o,self.root,self.context['candidate_tree'],['source.py'],{},None)
            self.assertEqual(result['review_status'],'ERROR')
            self.assertNotIn('source.py',{p['path'] for p in result['coverage']})
            self.assertTrue(list(self.child.glob('cohorts/*/prepared-source-error.json')))
            print(json.dumps({'native_frontier_delivery':delivered,'forged_page_manifest_and_context':'ERROR/no source coverage admitted'}))
        finally:o._RUN.reset(token)


if __name__=='__main__':unittest.main()
