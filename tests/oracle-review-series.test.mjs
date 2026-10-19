import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { isolatedTestCohort } from "./helpers/isolated-test-cohort.mjs";

const root = new URL("../", import.meta.url);
const discovery = JSON.parse(execFileSync("python3", ["-c", `
import ast,json,sys,unittest
from pathlib import Path
sys.path.insert(0,"tests")
import oracle_review_series as suite
module=ast.parse(Path("tests/oracle_review_series.py").read_text())
case=next(node for node in module.body if isinstance(node,ast.ClassDef) and node.name=="ReviewSeries")
print(json.dumps({"callable":unittest.TestLoader().getTestCaseNames(suite.ReviewSeries),
                  "declared":[node.name for node in case.body if isinstance(node,ast.FunctionDef) and node.name.startswith("test_")]}))
`], { cwd: root, encoding: "utf8", stdio: "pipe" }));

assert.ok(discovery.callable.length > 0);
assert.deepEqual(discovery.callable, [...discovery.declared].sort());
test("Oracle review series: discovered test targets match the declared Python suite", () => {
  assert.deepEqual(discovery.callable, [...discovery.declared].sort());
});

// ReviewSeries.setUp creates a unique TemporaryDirectory and Git repository for
// each case. Separate processes preserve its module patches and fixture custody.
const cohort = isolatedTestCohort(discovery.callable.map(method => ({ name: method,
  command: "python3", args: ["tests/oracle_review_series.py", `ReviewSeries.${method}`], cwd: root })),
{ concurrency: 4 });
for (const signal of ["SIGINT", "SIGTERM"]) {
  const stop = () => {
    cohort.cancel();
    void cohort.completion.then(() => {
      process.removeListener(signal, stop);
      process.kill(process.pid, signal);
    });
  };
  process.on(signal, stop);
  void cohort.completion.then(() => process.removeListener(signal, stop));
}

for (const method of discovery.callable) {
  test(`Oracle review series: ${method.slice("test_".length).replaceAll("_", " ")}`, async () => {
    const result = await cohort.outcome(method);
    assert.ok(result.code === 0 && !result.signal && !result.error && !result.cancelled,
      JSON.stringify(result));
  });
}
