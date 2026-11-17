import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url).pathname;

test("Vault index runs only in the project-local runtime", () => {
  const run = spawnSync("python3", ["-B", "-m", "unittest", "-v", "tests/vault_index_runtime_test.py"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
  const output = `${run.stdout}${run.stderr}`;
  assert.equal(run.status, 0, output);
  assert.match(output, /Ran \d+ tests?/);
  assert.match(output, /\nOK/);
});
