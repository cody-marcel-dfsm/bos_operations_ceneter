import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";

import {
  inspectForbiddenIdentifiers,
  inspectSubserviceAgentDescriptor,
  verifySingleBosContract
} from "../scripts/lib/single-bos-contract.mjs";
import { root } from "../scripts/lib/package-model.mjs";

const execFileAsync = promisify(execFile);

test("single BOS contract passes canonical and generated clients", async () => {
  const result = await verifySingleBosContract({ root });
  assert.deepEqual(result.violations, []);
  assert.equal(result.status, "passed");
  assert.equal(result.owner_product, "bos");
  assert.equal(result.resource_url, "https://dfsm.ai/mcp/apps/bos/platform");
});

test("single BOS contract CLI returns machine-readable server evidence", async () => {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [`${root}/scripts/verify-single-bos-contract.mjs`, "--format", "json"],
    { cwd: root }
  );
  assert.equal(stderr, "");
  const result = JSON.parse(stdout);
  assert.equal(result.schema_version, "1");
  assert.equal(result.contract_id, "bos.single-mcp-connection");
  assert.equal(result.status, "passed");
  assert.deepEqual(result.violations, []);
});

test("single BOS contract rejects a subservice MCP dependency and URL", () => {
  const findings = inspectSubserviceAgentDescriptor(
    [
      "dependencies:",
      "  tools:",
      "    - type: mcp",
      "      url: https://dfsm.ai/mcp/apps/bos/platform"
    ].join("\n"),
    "clients/codex/plugins/education-center/skills/example/agents/openai.yaml"
  );
  assert.deepEqual(
    findings.map(({ code }) => code),
    ["subservice_mcp_dependency", "subservice_mcp_url"]
  );
});

test("single BOS contract rejects retired subservice connection identifiers", () => {
  const findings = inspectForbiddenIdentifiers(
    "Call mcp__bos_education_center__bos_get_context.",
    "source/example/SKILL.md",
    ["bos_education_center", "mcp__bos_education_center__"]
  );
  assert.deepEqual(
    findings.map(({ code }) => code),
    ["subservice_connection_identifier", "subservice_connection_identifier"]
  );
});
