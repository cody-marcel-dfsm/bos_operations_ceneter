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
    unauthenticated_transport_result_scope: "ALL_NAMED_MCP_METHODS",
    signed_out_protocol_bootstrap: "HTTP_401_WWW_AUTHENTICATE",
    signed_out_tool_surface: "NONE",
    signed_out_authentication_result: "HTTP_401_WWW_AUTHENTICATE",
    unauthenticated_business_execution: "DENIED",
    post_authentication_tool_surface: "DYNAMIC_DOMAIN_SPECIFIC_MCP_SERVICES_AND_TOOLING",
    authenticated_tools_list_gate: "VALID_TOKEN_AND_AUTHORIZED_ORGANIZATION",
    tool_surface_authorization_semantics: "AUTHENTICATED_DESCRIPTORS_DO_NOT_GRANT_AUTHORITY",
    operation_authorization: "SERVER_EVALUATED_ON_TOOLS_CALL",
    native_action_surface: "ACTIVE_CHAT",
    rejected_refresh_token_behavior:
      "OAUTH_INVALID_GRANT_THEN_HOST_REAUTHENTICATION_ACTION",
    rejected_refresh_token_response: {
      http_status: 400,
      error: "invalid_grant",
      access_token_returned: false,
      refresh_token_returned: false,
      id_token_returned: false
    },
    session_start_blocking: false,
    continuation_policy: "RESUME_ORIGINAL_REQUEST"
  });
});
