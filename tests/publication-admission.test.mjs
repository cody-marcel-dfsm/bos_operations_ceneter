import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { isolatedTestCohort } from "./helpers/isolated-test-cohort.mjs";

const root = new URL("../", import.meta.url);
const discovery = JSON.parse(execFileSync("python3", ["-c", `
import ast,json,sys,unittest
from pathlib import Path
sys.path.insert(0,"tests")
import publication_admission_test as module
classes=('PublicationAdmission','OwnedDestinationResolution')
tree=ast.parse(Path("tests/publication_admission_test.py").read_text())
actual=sorted(name for name,value in vars(module).items() if isinstance(value,type) and issubclass(value,unittest.TestCase) and value.__module__==module.__name__)
assert actual==sorted(classes)
callable_ids=[];declared=[]
for name in classes:
 cls=getattr(module,name)
 case=next(node for node in tree.body if isinstance(node,ast.ClassDef) and node.name==name)
 callable_ids.extend(name+'.'+method for method in unittest.TestLoader().getTestCaseNames(cls))
 declared.extend(name+'.'+node.name for node in case.body if isinstance(node,ast.FunctionDef) and node.name.startswith("test_"))
print(json.dumps({"callable":callable_ids,"declared":declared}))
`], { cwd: root, encoding: "utf8", stdio: "pipe" }));
const methods = discovery.callable;
assert.ok(methods.length > 0);
assert.deepEqual([...methods].sort(), [...discovery.declared].sort());
assert.equal(new Set(methods).size, methods.length);
const cohort = isolatedTestCohort(methods.map(method => ({ name: method, command: "python3",
  args: ["tests/publication_admission_test.py", method], cwd: root })), { concurrency: 4 });
for (const signal of ["SIGINT", "SIGTERM"]) {
  const stop = () => { cohort.cancel(); void cohort.completion.then(() => {
    process.removeListener(signal, stop); process.kill(process.pid, signal);
  }); };
  process.on(signal, stop);
  void cohort.completion.then(() => process.removeListener(signal, stop));
}
for (const method of methods) {
  test(`Publication admission: ${method.replace(/^PublicationAdmission\./u, "").replace(/^OwnedDestinationResolution\./u, "destination ").replace(/^test_/u, "").replaceAll("_", " ")}`, async () => {
    const result = await cohort.outcome(method);
    assert.ok(result.code === 0 && !result.signal && !result.error && !result.cancelled, JSON.stringify(result));
  });
}
