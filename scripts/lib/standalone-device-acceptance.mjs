import {BOS_RESOURCE} from "../../source/platform/bos-mcp-client/scripts/standalone-device-auth.mjs";

// Trusted-runtime acceptance only: return bounded outcomes, never MCP payloads.
export async function verifyStandaloneDeviceSession({transport, requireResourceRead = true}) {
  const report = {contract_id: "bos.standalone-device-auth/v1", status: "failed", resource: BOS_RESOURCE,
    initialize: false, tools_list: false, context: false, resources_list: false,
    resource_read: "not_run", tool_count: 0, resource_count: 0};
  let session;
  let id = 0;
  const call = async (method, params) => {
    const response = await transport.request({href: "/mcp/apps/bos/platform", method: "POST",
      headers: {accept: "application/json, text/event-stream", "content-type": "application/json",
        ...(session ? {"mcp-session-id": session} : {})},
      body: JSON.stringify({jsonrpc: "2.0", id: ++id, method, params})});
    if (response.headers?.["mcp-session-id"]) session = response.headers["mcp-session-id"];
    if (response.status !== 200 || response.body?.jsonrpc !== "2.0" ||
        response.body.id !== id || response.body.error || response.body.result == null) throw new Error("mcp_contract_failed");
    return response.body.result;
  };
  try {
    await transport.recoverAuthentication({schema_version: "bos.authentication-handoff/v1", message_type: "request",
      protected_resource: BOS_RESOURCE, condition: {category: "authentication", code: "MISSING_GRANT", source: "client_host"}});
    const initialized = await call("initialize", {protocolVersion: "2025-06-18", capabilities: {},
      clientInfo: {name: "BOS standalone acceptance", version: "1"}});
    if (!initialized.protocolVersion || !initialized.serverInfo || !initialized.capabilities) throw new Error("initialize_failed");
    report.initialize = true;
    const notification = await transport.request({href: "/mcp/apps/bos/platform", method: "POST",
      headers: {"content-type": "application/json", ...(session ? {"mcp-session-id": session} : {})},
      body: JSON.stringify({jsonrpc: "2.0", method: "notifications/initialized"})});
    if (![200, 202, 204].includes(notification.status)) throw new Error("initialized_notification_failed");
    const tools = await call("tools/list", {});
    if (!Array.isArray(tools.tools) || !tools.tools.some(tool => tool.name === "bos_get_context")) throw new Error("context_tool_missing");
    report.tools_list = true; report.tool_count = tools.tools.length;
    const context = await call("tools/call", {name: "bos_get_context", arguments: {}});
    if (context.isError === true || (!context.structuredContent && !context.content?.length)) throw new Error("context_failed");
    const payload = context.structuredContent ?? JSON.parse(context.content.find(item => item.type === "text").text);
    if (!payload || typeof payload !== "object" || payload.error || payload.status === "error") throw new Error("context_failed");
    report.context = true;
    const resources = await call("resources/list", {});
    if (!Array.isArray(resources.resources)) throw new Error("resources_failed");
    report.resources_list = true; report.resource_count = resources.resources.length;
    if (resources.resources.length) {
      const uri = resources.resources[0].uri;
      if (typeof uri !== "string" || !uri || uri.length > 4096) throw new Error("resource_uri_failed");
      const result = await call("resources/read", {uri});
      if (!Array.isArray(result.contents) || !result.contents.length) throw new Error("resource_read_failed");
      report.resource_read = "passed";
    } else {
      report.resource_read = "not_advertised";
      if (requireResourceRead) throw new Error("readable_resource_missing");
    }
    report.status = "passed";
  } catch (error) {
    const known = new Set(["mcp_contract_failed", "initialize_failed", "initialized_notification_failed",
      "context_tool_missing", "context_failed", "resources_failed", "resource_uri_failed", "resource_read_failed", "readable_resource_missing"]);
    if (error.message === "readable_resource_missing") report.status = "incomplete";
    report.error = known.has(error.message) ? error.message : "authentication_or_transport_failed";
  }
  return report;
}
