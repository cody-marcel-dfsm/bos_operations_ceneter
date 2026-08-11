import assert from "node:assert/strict";
import test from "node:test";

import {
  MCP_CONNECTION_PROFILES,
  McpConnectionSmokeFailure,
  runMcpConnectionSmoke
} from "../scripts/smoke-mcp-connection.mjs";

const endpoint = "https://dfsm.ai/mcp/apps/leaddirector/video-ads";
const profile = MCP_CONNECTION_PROFILES[endpoint];
const uuid = "11111111-1111-4111-8111-111111111111";

function response(payload, status = 200, headers = {}) {
  return new Response(
    payload === undefined ? "" : JSON.stringify(payload),
    { status, headers: { "x-correlation-id": uuid, ...headers } }
  );
}

function contextPayload(appCode = "lead_director") {
  return {
    jsonrpc: "2.0",
    id: 3,
    result: {
      isError: false,
      structuredContent: {
        result: {
          installation_id: "installed-app",
          org_id: "organization",
          apps: [{ app_code: appCode, delegated_role_id: "operator" }]
        }
      }
    }
  };
}

function videoFetch({ tools = profile.requiredTools, appCode, error } = {}) {
  return async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") return response({
      jsonrpc: "2.0",
      id: body.id,
      result: { protocolVersion: "2025-03-26" }
    }, 200, { "mcp-session-id": "video-session" });
    assert.equal(options.headers["Mcp-Session-Id"], "video-session");
    if (body.method === "notifications/initialized") {
      return response(undefined, 202);
    }
    if (body.method === "tools/list") {
      if (error) return response({ jsonrpc: "2.0", id: body.id, error });
      return response({
        jsonrpc: "2.0",
        id: body.id,
        result: { tools: tools.map((name) => ({ name })) }
      });
    }
    return response(contextPayload(appCode));
  };
}

test("Video Ads smoke proves the complete tool contract and exact scope", async () => {
  const report = await runMcpConnectionSmoke({
    endpoint,
    apiKey: "test-key",
    fetchImpl: videoFetch()
  });
  assert.equal(report.ok, true);
  assert.deepEqual(report.toolsList.missingTools, []);
  assert.equal(report.context.expectedApplication, true);
  assert.equal(report.context.appCount, 1);
  assert.equal(report.context.roleCount, 1);
});

test("Video Ads smoke rejects a context-only or unrelated catalog", async () => {
  for (const tools of [
    ["bos_get_context"],
    ["bos_get_context", "education_center_list_enrollments"]
  ]) {
    await assert.rejects(
      runMcpConnectionSmoke({
        endpoint,
        apiKey: "test-key",
        fetchImpl: videoFetch({ tools })
      }),
      (error) => error instanceof McpConnectionSmokeFailure &&
        error.report.toolsList.missingTools.length === 6
    );
  }
});

test("Video Ads smoke rejects the wrong server-derived application scope", async () => {
  await assert.rejects(
    runMcpConnectionSmoke({
      endpoint,
      apiKey: "test-key",
      fetchImpl: videoFetch({ appCode: "other_application" })
    }),
    (error) => error instanceof McpConnectionSmokeFailure &&
      error.report.context.expectedApplication === false
  );
});

test("Video Ads smoke strips PII and credentials from errors and correlations", async () => {
  const privateText = "Jane Student test-secret family@example.com";
  const fetchImpl = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.method === "initialize") return new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: body.id,
      result: { protocolVersion: "2025-03-26" }
    }), {
      status: 200,
      headers: { "x-correlation-id": privateText }
    });
    if (body.method === "notifications/initialized") {
      return response(undefined, 202);
    }
    return response({
      jsonrpc: "2.0",
      id: body.id,
      error: { code: -32003, message: privateText }
    });
  };
  await assert.rejects(
    runMcpConnectionSmoke({ endpoint, apiKey: "test-secret", fetchImpl }),
    (error) => {
      const output = JSON.stringify(error.report);
      assert.doesNotMatch(output, /Jane|family@example|test-secret/);
      assert.match(output, /-32003/);
      return true;
    }
  );
});

test("Video Ads smoke treats protocol and result flags as untrusted scalars", async () => {
  const privateText = "Jane Student test-secret family@example.com";
  const protocolFetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    return response({
      jsonrpc: "2.0",
      id: body.id,
      result: { protocolVersion: privateText }
    });
  };
  await assert.rejects(
    runMcpConnectionSmoke({
      endpoint,
      apiKey: "test-secret",
      fetchImpl: protocolFetch
    }),
    (error) => {
      const output = JSON.stringify(error.report);
      assert.doesNotMatch(output, /Jane|family@example|test-secret/);
      assert.equal(error.report.initialize.protocolAccepted, false);
      return true;
    }
  );

  const resultFetch = videoFetch();
  const hostileResultFetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (body.method !== "tools/call") return resultFetch(url, options);
    const payload = contextPayload();
    payload.result.isError = privateText;
    return response(payload);
  };
  await assert.rejects(
    runMcpConnectionSmoke({
      endpoint,
      apiKey: "test-secret",
      fetchImpl: hostileResultFetch
    }),
    (error) => {
      const output = JSON.stringify(error.report);
      assert.doesNotMatch(output, /Jane|family@example|test-secret/);
      assert.equal(error.report.context.toolResultSucceeded, false);
      return true;
    }
  );
});
