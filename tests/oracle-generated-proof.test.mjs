import { execFileSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { isolatedTestCohort } from "./helpers/isolated-test-cohort.mjs";

const root = new URL("../", import.meta.url);
const discovery = JSON.parse(execFileSync("python3", ["-c", `
import ast,json,sys,unittest
from pathlib import Path
sys.path.insert(0,"tests")
import oracle_generated_proof_test as suite
module=ast.parse(Path("tests/oracle_generated_proof_test.py").read_text())
classes=[node for node in module.body if isinstance(node,ast.ClassDef)]
print(json.dumps({"callable":sorted(f"{node.name}.{name}" for node in classes
    for name in unittest.TestLoader().getTestCaseNames(getattr(suite,node.name))),
    "declared":sorted(f"{node.name}.{method.name}" for node in classes for method in node.body
    if isinstance(method,ast.FunctionDef) and method.name.startswith("test_"))}))
`], {cwd: root, encoding: "utf8", stdio: "pipe"}));
assert.ok(discovery.callable.length > 0);
assert.deepEqual(discovery.callable, discovery.declared);
test("generated proof discovery retains every declared Python case", () => {
  assert.deepEqual(discovery.callable, discovery.declared);
});

// Each case owns its synthetic repository and native child processes. The
// existing deadline applies per case, with bounded workers and group cleanup.
const cohort = isolatedTestCohort(discovery.callable.map(name => ({name, command: "python3",
  args: ["tests/oracle_generated_proof_test.py", name], cwd: root})), {concurrency: 4, timeoutMs: 120000});
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
for (const name of discovery.callable) {
  test(`generated proof: ${name}`, async () => {
    const result = await cohort.outcome(name);
    assert.ok(result.code === 0 && !result.signal && !result.error && !result.cancelled,
      JSON.stringify(result));
  });
}
