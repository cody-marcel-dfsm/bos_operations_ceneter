#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const MCP_CONNECTION_PROFILES = Object.freeze({
  "https://dfsm.ai/mcp/apps/leaddirector/education-center": Object.freeze({
    applicationCode: "lead_director",
    credentialEnvVar: "EDUCATION_CENTER_BOS_API_KEY",
    requiredTools: Object.freeze([
      "bos_get_context",
      "education_center_get_email_thread",
      "education_center_list_enrollments",
      "education_center_search_calendar_events",
      "education_center_search_email_evidence",
      "education_center_search_leads",
      "education_center_search_students"
    ])
  }),
  "https://dfsm.ai/mcp/apps/leaddirector/video-ads": Object.freeze({
    applicationCode: "lead_director",
    credentialEnvVar: "VIDEO_ADS_BOS_API_KEY",
    requiredTools: Object.freeze([
      "bos_get_context",
      "video_ads_get_readiness",
      "video_ads_list_options",
      "video_ads_start_generation",
      "video_ads_get_generation",
      "video_ads_list_generations",
      "video_ads_retry_transfer"
    ])
  })
});

function parseMcpPayload(text) {
  const eventPayloads = String(text ?? "")
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());
  for (const candidate of eventPayloads.length
    ? eventPayloads
    : [String(text ?? "").trim()]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue until a complete JSON or SSE data payload is found.
    }
  }
  return undefined;
}

function safeCorrelationId(value) {
  const text = String(value ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : undefined;
}

function safeError(payload) {
  if (!payload?.error) return undefined;
  return Number.isInteger(payload.error.code)
    ? { present: true, code: payload.error.code }
    : { present: true };
}

function structuredResult(payload) {
  return payload?.result?.structuredContent?.result;
}

function contextObservation(payload, expectedApplicationCode) {
  const result = payload?.result;
  const context = structuredResult(payload);
  const apps = Array.isArray(context?.apps) ? context.apps : [];
  const roles = new Set(
    apps.map((app) => app?.delegated_role_id).filter(Boolean)
  );
  return {
    toolResultSucceeded: result?.isError === false,
    installationPresent: Boolean(context?.installation_id),
    organizationPresent: Boolean(context?.org_id),
    appCount: apps.length,
    roleCount: roles.size,
    expectedApplication: apps.length === 1 &&
      apps[0]?.app_code === expectedApplicationCode
  };
}

export class McpConnectionSmokeFailure extends Error {
  constructor(report) {
    super("Named MCP connection contract failed");
    this.name = "McpConnectionSmokeFailure";
    this.report = report;
  }
}

export async function runMcpConnectionSmoke({
  endpoint,
  apiKey,
  fetchImpl = fetch
} = {}) {
  const profile = MCP_CONNECTION_PROFILES[endpoint];
  if (!profile) throw new Error("Pass an approved named BOS MCP endpoint");
  if (!apiKey) throw new Error(`${profile.credentialEnvVar} is absent from this process`);

  const report = { endpoint, credentialPresent: true };
  let sessionId;
  const post = async (body) => {
    const headers = {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-03-26"
    };
    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
      redirect: "error"
    });
    sessionId = response.headers.get("mcp-session-id") ?? sessionId;
    return {
      status: response.status,
      correlationId: safeCorrelationId(
        response.headers.get("x-correlation-id")
      ),
      payload: parseMcpPayload(await response.text())
    };
  };
  const fail = () => {
    report.ok = false;
    throw new McpConnectionSmokeFailure(report);
  };

  const initialize = await post({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "bos-mcp-connection-smoke", version: "1" }
    }
  });
  report.initialize = {
    status: initialize.status,
    sessionEstablished: Boolean(sessionId),
    correlationId: initialize.correlationId,
    protocolAccepted:
      initialize.payload?.result?.protocolVersion === "2025-03-26",
    error: safeError(initialize.payload)
  };
  if (initialize.status !== 200 || initialize.payload?.error ||
      !report.initialize.protocolAccepted) fail();

  const initialized = await post({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  });
  report.initialized = {
    status: initialized.status,
    correlationId: initialized.correlationId,
    error: safeError(initialized.payload)
  };
  if (initialized.status < 200 || initialized.status >= 300 ||
      initialized.payload?.error) fail();

  const toolsList = await post({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  });
  const returnedNames = toolsList.payload?.result?.tools
    ?.map(({ name }) => name)
    .filter((name) => typeof name === "string") ?? [];
  const recognizedNames = profile.requiredTools.filter(
    (name) => returnedNames.includes(name)
  );
  const missingTools = profile.requiredTools.filter(
    (name) => !returnedNames.includes(name)
  );
  report.toolsList = {
    status: toolsList.status,
    correlationId: toolsList.correlationId,
    count: returnedNames.length,
    recognizedNames,
    missingTools,
    unrecognizedCount: returnedNames.filter(
      (name) => !profile.requiredTools.includes(name)
    ).length,
    error: safeError(toolsList.payload)
  };
  if (toolsList.status !== 200 || toolsList.payload?.error || missingTools.length) {
    fail();
  }

  const contextCall = await post({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "bos_get_context", arguments: {} }
  });
  report.context = {
    status: contextCall.status,
    correlationId: contextCall.correlationId,
    ...contextObservation(contextCall.payload, profile.applicationCode),
    error: safeError(contextCall.payload)
  };
  if (contextCall.status !== 200 || contextCall.payload?.error ||
      !report.context.toolResultSucceeded ||
      !report.context.installationPresent ||
      !report.context.organizationPresent ||
      report.context.appCount !== 1 ||
      report.context.roleCount !== 1 ||
      !report.context.expectedApplication) fail();

  report.ok = true;
  return report;
}

async function main() {
  try {
    const report = await runMcpConnectionSmoke({
      endpoint: process.argv[2],
      apiKey: process.env[
        MCP_CONNECTION_PROFILES[process.argv[2]]?.credentialEnvVar
      ]
    });
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    if (error instanceof McpConnectionSmokeFailure) {
      console.error(JSON.stringify(error.report, null, 2));
    } else {
      console.error("Named MCP connection smoke failed before a safe contract report was available");
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
