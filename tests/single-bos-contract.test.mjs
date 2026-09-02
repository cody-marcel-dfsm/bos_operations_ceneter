import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

import {
  inspectForbiddenIdentifiers,
  inspectMcpResourceUrls,
  inspectOAuthAuthorizeTarget,
  inspectSubserviceAgentDescriptor,
  verifySingleBosContract
} from "../scripts/lib/single-bos-contract.mjs";
import { readJson, root } from "../scripts/lib/package-model.mjs";

const execFileAsync = promisify(execFile);
const bosProduct = await readJson(`${root}/products/bos/product.json`);

test("single BOS contract passes canonical and generated clients", async () => {
  const result = await verifySingleBosContract({ root });
  assert.deepEqual(result.violations, []);
  assert.equal(result.status, "passed");
  assert.equal(result.owner_product, "bos");
  assert.equal(result.resource_url, bosProduct.mcp_resource_url);
  assert.deepEqual(result.request_time_authentication, {
    activation_owner: "SELECTED_OAUTH_TOOL",
    preauthentication_tool_surface: "DESCRIPTORS_ONLY",
    tool_security_scheme: "OAUTH2_PER_TOOL",
    unauthenticated_tool_result: "MCP_WWW_AUTHENTICATE",
    unauthenticated_business_execution: "DENIED",
    post_authentication_tool_catalog: "SERVER_AUTHORITY_SCOPED",
    native_action_surface: "ACTIVE_CHAT",
    continuation_policy: "RESUME_ORIGINAL_REQUEST"
  });
});

test("selected-tool authentication guidance preserves failure ownership", async () => {
  const canonical = await readFile(
    `${root}/source/platform/bos-mcp-client/SKILL.md`,
    "utf8"
  );
  assert.match(
    canonical,
    /descriptor is absent or its signed-out invocation omits[\s\S]*tool-auth-contract defect/i
  );
  assert.match(
    canonical,
    /descriptor and challenge exist but the host omits[\s\S]*client authentication-activation defect/i
  );

  for (const generated of [
    "clients/codex/plugins/bos/skills/bos-mcp-client/SKILL.md",
    "clients/claude/plugins/bos/skills/bos-mcp-client/SKILL.md",
    "clients/copilot/products/bos/skills/bos-mcp-client/SKILL.md",
    "clients/gemini/extensions/bos/skills/bos-mcp-client/SKILL.md"
  ]) {
    assert.equal(await readFile(`${root}/${generated}`, "utf8"), canonical);
  }

  const readme = await readFile(`${root}/README.md`, "utf8");
  assert.match(
    readme,
    /requested BOS tool's OAuth descriptor[\s\S]*mcp\/www_authenticate[\s\S]*inline action/i
  );
  assert.match(readme, /descriptor or challenge is absent[\s\S]*tool-auth-contract defect/i);
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

test("single BOS contract rejects every non-root BOS MCP resource", () => {
  const canonical = "https://dfsm.ai/mcp/apps/bos/platform";
  assert.deepEqual(inspectMcpResourceUrls(canonical, "good.json", canonical), []);
  const findings = inspectMcpResourceUrls(
    "resource=https://dfsm.ai/mcp/apps/leaddirector/education-center",
    "bad.json",
    canonical
  );
  assert.deepEqual(findings.map(({ code }) => code), ["subservice_mcp_resource"]);
});

test("single BOS contract validates captured OAuth authorize resource evidence", () => {
  const canonical = "https://dfsm.ai/mcp/apps/bos/platform";
  const good = new URL("https://dfsm.ai/api/v1/mcp/oauth/authorize");
  good.searchParams.set("resource", canonical);
  assert.deepEqual(inspectOAuthAuthorizeTarget(good.href, canonical), []);

  const bad = new URL(good);
  bad.searchParams.set("resource", "https://dfsm.ai/mcp/apps/leaddirector/education-center");
  assert.deepEqual(
    inspectOAuthAuthorizeTarget(bad.href, canonical).map(({ code }) => code),
    ["oauth_resource_target"]
  );
});

test("single BOS contract CLI rejects marketplace OAuth evidence for a subservice route", async () => {
  const bad = new URL("https://dfsm.ai/api/v1/mcp/oauth/authorize");
  bad.searchParams.set("resource", "https://dfsm.ai/mcp/apps/leaddirector/education-center");
  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        `${root}/scripts/verify-single-bos-contract.mjs`,
        "--format",
        "json",
        "--oauth-authorize-url",
        bad.href
      ],
      { cwd: root }
    ),
    (error) => {
      const result = JSON.parse(error.stdout);
      assert.equal(result.status, "failed");
      assert.deepEqual(
        result.violations.map(({ code }) => code),
        ["oauth_resource_target"]
      );
      return true;
    }
  );
});
