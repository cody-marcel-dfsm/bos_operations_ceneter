"""Synthetic native-history integrity and complexity regressions; no model calls."""
from pathlib import Path
import importlib.util,json,sys,tempfile,unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'Vault/tmp/history-reconstruction-fixtures'
OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT))
from tools import validation_contract as v
spec=importlib.util.spec_from_file_location('owned_oracle_spec_fixture',ROOT/'tests/oracle_spec_test.py')
owned=importlib.util.module_from_spec(spec);spec.loader.exec_module(owned)
measurements=[]
class HistoricalReconstruction(owned.NativeDelta):
 def setUp(self):
  original=tempfile.TemporaryDirectory
  def temporary(*a,**kw):kw['dir']=OUT;return original(*a,**kw)
  hook=patch.object(tempfile,'TemporaryDirectory',temporary);hook.start();self.addCleanup(hook.stop);super().setUp()
 def test_exact_prior_authenticated_once_per_reconstruction(self):
  _,context,delta=self.prepared_delta();expected,audit=v.materialize_delta(self.root,context,delta)
  original=v.native_proposal_record
  with patch.object(v,'native_proposal_record',wraps=original) as called:
   actual,recovered=v.reconstruct_delta_record(self.root,audit,delta)
  self.assertEqual(actual,expected);self.assertEqual(recovered,context)
  measurements.append({'case':'single_explicit_edge','native_archive_authentications':called.call_count,'selection_identical':True})
  self.assertEqual(called.call_count,1,'Same reconstruction authenticates identical prior recursively twice')
 def test_synthetic_recursive_edges_have_linear_authentication_count(self):
  _,context,delta=self.prepared_delta();expected,audit=v.materialize_delta(self.root,context,delta)
  original=v.native_proposal_record;depth=4;active=0;calls=0
  def authenticate(*a,**kw):
   nonlocal active,calls
   calls+=1;self.assertTrue(original(*a,**kw))
   if active<depth-1:
    active+=1
    try:self.assertEqual(v.reconstruct_delta_record(self.root,audit,delta)[0],expected)
    finally:active-=1
   return True
  with patch.object(v,'native_proposal_record',side_effect=authenticate):self.assertEqual(v.reconstruct_delta_record(self.root,audit,delta)[0],expected)
  measurements.append({'case':'controlled_recursive_depth4','native_archive_authentications':calls,'selection_identical':True,'qualification':'Recursive control wrapper models graph edges while actual canonical synthetic base archive authentication still executes. Not four genuine producer archives.'})
  self.assertEqual(calls,depth)
 def test_parent_archive_movement_between_assembly_and_acceptance_refused(self):
  _,context,delta=self.prepared_delta();_,audit=v.materialize_delta(self.root,context,delta)
  archive=self.root/'.git/oracle/proposals'/(context['binding']['prior_proposal_sha256']+'.json')
  original=v._materialize_delta
  def move(*a,**kw):
   archive.write_bytes(archive.read_bytes()+b' ')
   return original(*a,**kw)
  with patch.object(v,'_materialize_delta',side_effect=move):
   with self.assertRaises(ValueError):v.reconstruct_delta_record(self.root,audit,delta)
 def test_orphan_authentication_remains_distinct_from_ancestry_acceptance(self):
  prior,context,_=self.prepared_delta()
  archive=self.root/'.git/oracle/proposals'/(context['binding']['prior_proposal_sha256']+'.json')
  orphan=self.git('commit-tree',context['binding']['source_tree'],'-m','synthetic orphan without branch movement')
  self.assertTrue(v.native_proposal_record(self.root,archive,prior,orphan,ancestry=False))
  self.assertFalse(v.native_proposal_record(self.root,archive,prior,orphan,ancestry=True))

if __name__=='__main__':
 methods=['test_exact_prior_authenticated_once_per_reconstruction', 'test_synthetic_recursive_edges_have_linear_authentication_count', 'test_parent_materializes_exact_scope_and_retains_criteria_categories_and_mapping_projection', 'test_older_closed_binding_reconstructs_only_with_the_actual_verified_native_prior', 'test_wrong_missing_replayed_hashes_and_unknown_fields_fail_without_writing_a_spec', 'test_unknown_path_criterion_drop_retained_module_replacement_and_mapping_mutation_are_rejected', 'test_genuine_native_delta_archive_rechecks_materialization_and_raw_approval', 'test_source_movement_preserves_raw_result_and_refuses_delta_seal', 'test_origin_movement_rejects_an_otherwise_unchanged_bound_delta', 'test_parent_archive_movement_between_assembly_and_acceptance_refused', 'test_orphan_authentication_remains_distinct_from_ancestry_acceptance']
 selected=sys.argv[1:]
 if not selected or any(name not in methods for name in selected) or len(selected)!=len(set(selected)):
  raise SystemExit('Select exact declared history regression identities')
 result=unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(HistoricalReconstruction(name) for name in selected))
 print(json.dumps({'kind':'synthetic-unit-observations','tests':result.testsRun,'failures':len(result.failures),'errors':len(result.errors),'skips':len(result.skipped),'measurements':measurements}))
 sys.exit(not result.wasSuccessful())
