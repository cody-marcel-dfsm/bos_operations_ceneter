import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { isolatedTestCohort } from "./helpers/isolated-test-cohort.mjs";

const root = new URL("../", import.meta.url);
const methods = JSON.parse(execFileSync("python3", ["-c", `
import json,sys,unittest
sys.path.insert(0,"tests")
from shipment_workflow_test import ShipmentWorkflow
print(json.dumps(unittest.TestLoader().getTestCaseNames(ShipmentWorkflow)))
`], { cwd: root, encoding: "utf8", stdio: "pipe" }));
assert.ok(methods.length > 0);
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
