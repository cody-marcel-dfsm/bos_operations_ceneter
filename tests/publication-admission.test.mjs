import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { isolatedTestCohort } from "./helpers/isolated-test-cohort.mjs";

const root = new URL("../", import.meta.url);
const discovery = JSON.parse(execFileSync("python3", ["-c", `
import ast,json,sys,unittest
from pathlib import Path
sys.path.insert(0,"tests")
from publication_admission_test import PublicationAdmission
module=ast.parse(Path("tests/publication_admission_test.py").read_text())
case=next(node for node in module.body if isinstance(node,ast.ClassDef) and node.name=="PublicationAdmission")
print(json.dumps({"callable":unittest.TestLoader().getTestCaseNames(PublicationAdmission), "declared":[node.name for node in case.body if isinstance(node,ast.FunctionDef) and node.name.startswith("test_")]}))
`], { cwd: root, encoding: "utf8", stdio: "pipe" }));
const methods = discovery.callable;
assert.ok(methods.length > 0);
assert.deepEqual(methods, [...discovery.declared].sort());
const cohort = isolatedTestCohort(methods.map(method => ({ name: method, command: "python3",
  args: ["tests/publication_admission_test.py", `PublicationAdmission.${method}`], cwd: root })), { concurrency: 4 });
for (const signal of ["SIGINT", "SIGTERM"]) {
  const stop = () => { cohort.cancel(); void cohort.completion.then(() => {
    process.removeListener(signal, stop); process.kill(process.pid, signal);
  }); };
  process.on(signal, stop);
  void cohort.completion.then(() => process.removeListener(signal, stop));
}
for (const method of methods) {
  test(`Publication admission: ${method.slice(5).replaceAll("_", " ")}`, async () => {
    const result = await cohort.outcome(method);
    assert.ok(result.code === 0 && !result.signal && !result.error && !result.cancelled, JSON.stringify(result));
  });
}
