import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import test from "node:test";

import {
  publicationFailures,
  validatePublicationPaths,
} from "../scripts/check-publication-safety.mjs";

test("publication safety rejects Vault and unclassified top-level paths", () => {
  assert.deepEqual(validatePublicationPaths(["package-lock.json"]), []);
  assert.deepEqual(validatePublicationPaths(["skill-release-manifest.json"]), []);
  assert.deepEqual(validatePublicationPaths(["skill-release-manifest.json.backup"]), [
    "Path is outside the public allowlist: skill-release-manifest.json.backup",
  ]);
  assert.deepEqual(validatePublicationPaths(["package-lock.json.backup"]), [
    "Path is outside the public allowlist: package-lock.json.backup",
  ]);
  assert.deepEqual(validatePublicationPaths(["Vault/docs/private.md"]), [
    "Private Vault path is public: Vault/docs/private.md",
  ]);
  assert.deepEqual(validatePublicationPaths(["private-notes/incident.md"]), [
    "Path is outside the public allowlist: private-notes/incident.md",
  ]);
});

test("current tracked files and reachable refs contain no Vault history", async () => {
  assert.deepEqual(await publicationFailures(), []);
});

test("publication workflow audits release refs without importing retained pull-request refs", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/publication-safety.yml", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(workflow, /refs\/pull|publication-audit/);
  assert.match(workflow, /python3 tools\/command_coverage\.py ci --candidate "\$VALIDATION_SOURCE_SHA"/);
  const commands = JSON.parse(execFileSync("python3", ["-c",
    "import json; from pathlib import Path; from tools import command_coverage as c; print(json.dumps([row['command'] for row in c.requirements(Path.cwd(), 'HEAD')]))"],
  {cwd: new URL("../", import.meta.url), encoding: "utf8"}));
  assert.deepEqual(commands, [["npm", "run", "build"], ["npm", "run", "check"],
    ["npm", "run", "check:privacy"], ["npm", "run", "contract:check"], ["npm", "test"],
    ["npm", "run", "check:publication"]]);
});
