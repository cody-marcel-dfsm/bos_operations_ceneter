import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { isolatedTestCohort } from "./helpers/isolated-test-cohort.mjs";

const root = new URL("../", import.meta.url);
const methods = JSON.parse(execFileSync("python3", ["-c", `
import json,sys,unittest
sys.path.insert(0,"tests")
from publication_admission_test import PublicationAdmission
print(json.dumps(unittest.TestLoader().getTestCaseNames(PublicationAdmission)))
`], { cwd: root, encoding: "utf8", stdio: "pipe" }));
assert.ok(methods.length > 0);
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
