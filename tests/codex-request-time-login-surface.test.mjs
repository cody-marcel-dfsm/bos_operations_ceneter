import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { root } from "../scripts/lib/package-model.mjs";

test("Codex request-time login contract uses protected-resource OAuth discovery", async () => {
  const contract = JSON.parse(await readFile(
    join(root, "contracts", "product-mcp-connections.v1.json"),
    "utf8"
  ));

  assert.deepEqual(contract.request_time_authentication, {
    activation_owner: "REGISTERED_PROTECTED_RESOURCE",
    preauthentication_surface: "OAUTH_PROTECTED_RESOURCE_METADATA",
    unauthenticated_transport_result: "HTTP_401_WWW_AUTHENTICATE",
    unauthenticated_business_execution: "DENIED",
    post_authentication_tool_surface: "DYNAMIC_DOMAIN_SPECIFIC_MCP_SERVICES_AND_TOOLING",
    authenticated_tools_list_gate: "VALID_TOKEN_AND_AUTHORIZED_ORGANIZATION",
    tool_surface_authorization_semantics: "AUTHENTICATED_DESCRIPTORS_DO_NOT_GRANT_AUTHORITY",
    operation_authorization: "SERVER_EVALUATED_ON_TOOLS_CALL",
    native_action_surface: "ACTIVE_CHAT",
    rejected_refresh_token_behavior: "HOST_REAUTHENTICATION_ACTION",
    session_start_blocking: false,
    continuation_policy: "RESUME_ORIGINAL_REQUEST"
  });
});
