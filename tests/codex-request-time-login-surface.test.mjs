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
    post_authentication_tool_catalog: "COMPLETE_STATIC_BOS_CATALOG",
    authenticated_tools_list_gate: "VALID_TOKEN_AND_AUTHORIZED_ORGANIZATION",
    catalog_authorization_semantics: "DESCRIPTORS_DO_NOT_GRANT_AUTHORITY",
    operation_authorization: "SERVER_EVALUATED_ON_TOOLS_CALL",
    native_action_surface: "ACTIVE_CHAT",
    continuation_policy: "RESUME_ORIGINAL_REQUEST"
  });
});
