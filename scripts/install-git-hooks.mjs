import { spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";

for (const hook of ["pre-commit", "prepare-commit-msg", "commit-msg"]) {
  accessSync(`.githooks/${hook}`, constants.X_OK);
}

const probe = spawnSync("git", ["rev-parse", "--git-dir"], { stdio: "ignore" });
if (probe.status === 0) {
  const configured = spawnSync(
    "git",
    ["config", "--local", "core.hooksPath", ".githooks"],
    { stdio: "inherit" },
  );
  if (configured.status !== 0) process.exit(configured.status ?? 1);
}
