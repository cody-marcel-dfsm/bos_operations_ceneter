import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

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

test("Oracle review series: discovered test targets match the declared Python suite", () => {
  assert.ok(discovery.callable.length > 0);
  assert.deepEqual(discovery.callable, [...discovery.declared].sort());
});

for (const method of discovery.callable) {
  test(`Oracle review series: ${method.slice("test_".length).replaceAll("_", " ")}`, () => {
    execFileSync("python3", ["tests/oracle_review_series.py", `ReviewSeries.${method}`],
      { cwd: root, encoding: "utf8", stdio: "pipe" });
  });
}
