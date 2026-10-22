import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const selected = JSON.parse(execFileSync("python3", ["tools/shipment_state.py", "status"],
  { cwd: root, encoding: "utf8" }));
if (["NO_CHANGES", "DELIVER"].includes(selected.state)) {
  console.log(selected.state);
} else if (selected.state === "REVIEW_IN_PROGRESS") {
  const result = spawnSync("python3", ["tools/oracle_approval.py", "review"],
    { cwd: root, stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} else if (["INTEGRATE", "BASELINE_UNAVAILABLE"].includes(selected.state)) {
  throw new Error(selected.reason);
} else {
  const result = spawnSync("npm", ["run", "release:check"], { cwd: root, stdio: "inherit" });
  process.exitCode = result.status ?? 1;
}
