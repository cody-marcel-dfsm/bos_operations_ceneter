import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { isolatedTestCohort } from "./helpers/isolated-test-cohort.mjs";

const root = new URL("../", import.meta.url);
const discovery = JSON.parse(execFileSync("python3", ["-c", `
import ast,json,sys,unittest
from pathlib import Path
sys.path.insert(0,"tests")
from shipment_workflow_test import ShipmentWorkflow
module=ast.parse(Path("tests/shipment_workflow_test.py").read_text())
case=next(node for node in module.body if isinstance(node,ast.ClassDef) and node.name=="ShipmentWorkflow")
print(json.dumps({"callable":unittest.TestLoader().getTestCaseNames(ShipmentWorkflow), "declared":[node.name for node in case.body if isinstance(node,ast.FunctionDef) and node.name.startswith("test_")]}))
`], { cwd: root, encoding: "utf8", stdio: "pipe" }));
const methods = discovery.callable;
assert.ok(methods.length > 0);
assert.deepEqual(methods, [...discovery.declared].sort());
const cohort = isolatedTestCohort(methods.map(method => ({ name: method, command: "python3",
  args: ["tests/shipment_workflow_test.py", `ShipmentWorkflow.${method}`], cwd: root })), { concurrency: 4 });
for (const signal of ["SIGINT", "SIGTERM"]) {
  const stop = () => { cohort.cancel(); void cohort.completion.then(() => {
    process.removeListener(signal, stop); process.kill(process.pid, signal);
  }); };
  process.on(signal, stop);
  void cohort.completion.then(() => process.removeListener(signal, stop));
}
for (const method of methods) {
  test(`Committed shipment: ${method.slice(5).replaceAll("_", " ")}`, async () => {
    const result = await cohort.outcome(method);
    assert.ok(result.code === 0 && !result.signal && !result.error && !result.cancelled, JSON.stringify(result));
  });
}
