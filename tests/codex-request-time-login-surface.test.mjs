import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { root } from "../scripts/lib/package-model.mjs";

test("Codex request-time login contract remains independent from plugin-page display", async () => {
  const contract = JSON.parse(await readFile(
    join(root, "contracts", "single-bos-mcp-connection.v1.json"),
    "utf8"
  ));

  assert.deepEqual(contract.request_time_authentication, {
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
