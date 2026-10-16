import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const fixture = readFileSync(new URL("./oracle_fixture.py", import.meta.url), "utf8");

export function withOracleFixture(script) {
  return script.replace(/(?:from tools import oracle_approval as o|import tools\.oracle_approval as o)/,
    (statement) => `${statement}; exec(${JSON.stringify(fixture)})`);
}

export function copyOracleModules(workspace) {
  const modules = JSON.parse(execFileSync("python3", ["-c",
    "import json; from tools.oracle_approval import REVIEW_POLICY_MODULES; print(json.dumps(REVIEW_POLICY_MODULES))"],
  { cwd: new URL("../", import.meta.url), encoding: "utf8", stdio: "pipe" }));
  for (const relative of modules) {
    const target = join(workspace, relative);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(new URL(`../${relative}`, import.meta.url), target);
  }
}
