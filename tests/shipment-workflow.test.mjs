import { execFileSync } from "node:child_process";
import test from "node:test";

test("committed shipment selection, continuity, publication and CI safety", () => {
  execFileSync("python3", ["tests/shipment_workflow_test.py", "-v"],
    { cwd: new URL("../", import.meta.url), encoding: "utf8", stdio: "pipe", timeout: 180000 });
});
