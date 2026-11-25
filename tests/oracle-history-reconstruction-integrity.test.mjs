import assert from 'node:assert/strict';
import test from 'node:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const methods=[
  "test_parent_materializes_exact_scope_and_retains_criteria_categories_and_mapping_projection",
  "test_older_closed_binding_reconstructs_only_with_the_actual_verified_native_prior",
  "test_wrong_missing_replayed_hashes_and_unknown_fields_fail_without_writing_a_spec",
  "test_unknown_path_criterion_drop_retained_module_replacement_and_mapping_mutation_are_rejected",
  "test_genuine_native_delta_archive_rechecks_materialization_and_raw_approval",
  "test_source_movement_preserves_raw_result_and_refuses_delta_seal",
  "test_origin_movement_rejects_an_otherwise_unchanged_bound_delta",
  "test_parent_archive_movement_between_assembly_and_acceptance_refused",
  "test_orphan_authentication_remains_distinct_from_ancestry_acceptance"
];
for(const method of methods) test(method,()=>{
  const result=spawnSync('python3',['-B','tests/oracle_history_reconstruction_test.py',method],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024});
  assert.equal(result.status,0,result.stderr||String(result.error));
  const observation=JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(observation.tests,1);assert.equal(observation.failures,0);assert.equal(observation.errors,0);assert.equal(observation.skips,0);
});
