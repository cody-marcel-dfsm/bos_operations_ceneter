import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('native validation class contract boundaries',()=>{
 const result=spawnSync('python3',['tests/validation_contract_test.py'],{encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);
});
