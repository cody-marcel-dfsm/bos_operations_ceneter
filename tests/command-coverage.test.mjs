import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("native command coverage accepts exact prior changelists and runs uncovered checks", () => {
  const result = spawnSync("python3", ["tests/command_coverage_test.py", "-v"], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 30000
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
