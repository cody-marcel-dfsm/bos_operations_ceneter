import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('native review scope index, trailer provenance and execution suffixes',()=>{
 const result=spawnSync('python3',['-B','tests/oracle_scope_index_test.py'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
 assert.match(result.stderr,/Ran [1-9][0-9]* tests/);
});
