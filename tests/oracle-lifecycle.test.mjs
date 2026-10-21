import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

test("native review controller observation and commit catch-up", () => {
  const result = spawnSync("python3", ["tests/oracle_lifecycle_test.py", "-v"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)), encoding: "utf8", timeout: 120000
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
});
