import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("iCode class operations route requested Calimatic access through BOS", () => {
  const skill = read("source/verticals/icode/icode-class-operations/SKILL.md");

  assert.match(skill, /tenant-neutral `bos` MCP/i);
  assert.match(skill, /authorized BOS context exposing.*Calimatic/is);
  assert.match(skill, /org_id.*app_code.*installed_app_id.*delegated_role_id/is);
  assert.match(skill, /Never use a direct provider client/i);
  assert.match(skill, /useful partial result.*authorized BOS capabilities/is);
});

test("iCode service routing preserves tenant scope for every provider", () => {
  const skill = read("source/verticals/icode/icode-service-routing/SKILL.md");

  assert.match(skill, /tenant-neutral BOS/i);
  assert.match(skill, /explicitly requested provider through its authorized BOS capability/i);
  assert.match(skill, /authorized BOS Calimatic capability/i);
  assert.match(skill, /Never route.*private provider work around BOS/is);
  assert.match(skill, /org_id.*app_code.*installed_app_id.*delegated_role_id/is);
});
