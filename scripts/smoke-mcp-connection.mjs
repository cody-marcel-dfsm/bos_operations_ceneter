#!/usr/bin/env node

const allowedEndpoints = new Set([
  "https://dfsm.ai/mcp/apps/leaddirector/icode-operations",
  "https://dfsm.ai/mcp/apps/leaddirector/video-ads"
]);

const endpoint = process.argv[2];
if (!allowedEndpoints.has(endpoint)) {
  throw new Error("Pass an approved named BOS MCP endpoint");
}

const apiKey = process.env.BOS_API_KEY;
if (!apiKey) {
  throw new Error("BOS_API_KEY is absent from this process");
}

function parseMcpPayload(text) {
  const eventPayloads = text
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim());
  for (const candidate of eventPayloads.length ? eventPayloads : [text.trim()]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue until a complete JSON or SSE data payload is found.
    }
  }
  return undefined;
}

async function post(body, sessionId) {
  const headers = {
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
  if (sessionId) headers["Mcp-Session-Id"] = sessionId;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  return {
    status: response.status,
    sessionId: response.headers.get("mcp-session-id"),
    correlationId: response.headers.get("x-correlation-id"),
    payload: parseMcpPayload(await response.text())
  };
}

function safeError(payload) {
  const error = payload?.error;
  if (!error) return undefined;
  return { code: error.code, message: error.message };
}

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

let initialized;
let toolsList;
if (initialize.status >= 200 && initialize.status < 300 && !initialize.payload?.error) {
  initialized = await post({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {}
  }, initialize.sessionId);
  toolsList = await post({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  }, initialize.sessionId);
}

const toolNames = toolsList?.payload?.result?.tools?.map(({ name }) => name) ?? [];
const result = {
  endpoint,
  credentialPresent: true,
  initialize: {
    status: initialize.status,
    sessionEstablished: Boolean(initialize.sessionId),
    correlationId: initialize.correlationId,
    protocolVersion: initialize.payload?.result?.protocolVersion,
    error: safeError(initialize.payload)
  },
  initialized: initialized && {
    status: initialized.status,
    correlationId: initialized.correlationId,
    error: safeError(initialized.payload)
  },
  toolsList: toolsList && {
    status: toolsList.status,
    correlationId: toolsList.correlationId,
    count: toolNames.length,
    names: toolNames,
    error: safeError(toolsList.payload)
  }
};

console.log(JSON.stringify(result, null, 2));

if (initialize.status !== 200 || initialize.payload?.error ||
    !toolsList || toolsList.status !== 200 || toolsList.payload?.error ||
    toolNames.length === 0) {
  process.exitCode = 1;
}
