import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

test('one genuine bounded existing-CLI proposal produces content-bound native evidence',()=>{
  const root=process.env.ORACLE_PUBLIC_EXPORTED_ROOT;
  const python=process.env.ORACLE_PUBLIC_PYTHON;
  assert.ok(root&&python,'Full native profile must supply its verified immutable exported artifact and existing Chroma Python');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'oracle-export-manifest.json'),'utf8'));
  const config=JSON.parse(fs.readFileSync(path.join(root,'oracle.project.json'),'utf8'));
  assert.equal(config.runner.engine,'codex');
  assert.equal(config.runner.sandbox,'read-only');
  assert.ok(config.runner.timeout_seconds<=90);
  const operationRoot=path.join(root,config.state,'operations');
  assert.ok(!fs.existsSync(operationRoot)||fs.readdirSync(operationRoot).length===0,'Native live operation must begin fresh; previous uncertain operations require explicit reconciliation');
  const run=spawnSync(python,['-B','-m','oracle_core.cli','proposal','--config','oracle.project.json','--proposal','examples/proposal.txt','--output',`${config.state}/spec.json`],{
    cwd:root,env:{...process.env,PYTHONPATH:root,PYTHONDONTWRITEBYTECODE:'1'},encoding:'utf8',timeout:110000,maxBuffer:4*1024*1024,
  });
  assert.ok(run.status===0||run.status===1,`${run.error??''}\n${run.stderr}`);
  const receipt=JSON.parse(run.stdout);
  assert.ok(['APPROVED','REJECTED'].includes(receipt.status));
  assert.equal(receipt.review.review_status,'COMPLETE');
  assert.equal(receipt.provenance.execution_mode,'native_cli');
  assert.equal(receipt.provenance.source_commit,manifest.source_commit);
  assert.equal(receipt.provenance.source_tree,manifest.source_tree);
  assert.equal(receipt.provenance.runtime.capabilities.apps,false);
  assert.equal(receipt.provenance.runtime.capabilities.mcp,false);
  assert.equal(receipt.provenance.runtime.capabilities.shell,false);
  assert.equal(receipt.provenance.runtime.capabilities.automatic_project_context,false);
  assert.equal(receipt.provenance.runtime.capabilities.sandbox,'read-only');
  if(receipt.status==='APPROVED'){
    assert.equal(receipt.spec.kind,'oracle-spec/1');assert.ok(receipt.spec.seal);assert.ok(receipt.spec.commands.length>0);
  }else{assert.equal(receipt.spec,null);assert.ok(receipt.review.findings.length>0);}
  const operation=path.join(operationRoot,receipt.operation);
  const processRecord=JSON.parse(fs.readFileSync(path.join(operation,'process.json'),'utf8'));
  assert.equal(processRecord.exit_code,0);assert.equal(processRecord.failure,null);assert.ok(processRecord.seconds<=92);
  assert.ok(fs.existsSync(path.join(operation,'completed.json')));
  assert.equal(fs.readdirSync(operationRoot).length,1);
  console.log(`native_cli conceptual proposal ${receipt.status}; source ${manifest.source_commit}; model ${receipt.provenance.model}; ${processRecord.seconds}s`);
});
