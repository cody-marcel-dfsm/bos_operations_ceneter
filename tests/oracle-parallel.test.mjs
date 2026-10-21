import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("native independent review cohorts preserve bindings and overlap", () => {
  const output = execFileSync("python3", [fileURLToPath(new URL("./oracle_parallel_test.py", import.meta.url))], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    encoding: "utf8",
  });
  console.log(output.trim());
});
