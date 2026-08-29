import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
}

test("Education Center class operations route requested Calimatic access through BOS", () => {
  const skill = read("source/verticals/education-center/education-center-class-operations/SKILL.md");

  assert.match(skill, /use the BOS connection/i);
  assert.match(skill, /omit `org_id`,\s*`app_code`, `installed_app_id`, and `delegated_role_id`/i);
  assert.match(skill, /BOS\s+derives them from the authenticated installation/i);
  assert.match(skill, /Never use a direct provider\s+client/i);
  assert.match(skill, /secure handoff flow/i);
  assert.doesNotMatch(skill, /Settings\s*\/\s*Integrations|return here and let me know/i);
  assert.match(skill, /exact missing route, capability, scope, and freshness/i);
});

test("Education Center service routing preserves BOS scope while honoring evidence routes", () => {
  const skill = read("source/verticals/education-center/education-center-service-routing/SKILL.md");

  assert.match(skill, /tenant-neutral BOS/i);
  assert.match(skill, /source_routes\.calimatic[\s\S]*package default is BOS/i);
  assert.match(skill, /source_routes\.care_com/i);
  assert.match(skill, /connected_gmail[\s\S]*normal Gmail connector/i);
  assert.match(skill, /external connector supplies evidence only/i);
  assert.match(skill, /never changes BOS tenant, role, organization, or mutation authority/i);
  assert.match(skill, /org_id.*app_code.*installed_app_id.*delegated_role_id/is);
  assert.match(skill, /Calimatic[\s\S]*short-lived BOS credential page[\s\S]*portal[\s\S]*API key/i);
  assert.match(skill, /Never replace either path with dashboard navigation/i);
});

test("BOS request interception distinguishes Gmail OAuth from Calimatic API-key recovery", () => {
  const client = read("source/platform/bos-mcp-client/SKILL.md");

  assert.match(client, /request interceptor around every BOS domain[\s\S]*tools\/call/i);
  assert.match(client, /OAuth:[\s\S]*provider URL/i);
  assert.match(client, /API key:[\s\S]*Calimatic[\s\S]*portal URL and API\s+key/i);
  assert.match(client, /model and MCP client[\s\S]*never receive either value/i);
  assert.match(client, /poll[\s\S]*bos_resume_operation/i);
  assert.match(client, /explicit request to connect or authenticate[\s\S]*server-returned recovery `next_action`/i);
  assert.doesNotMatch(client, /go to (settings|the BOS dashboard)/i);
});
