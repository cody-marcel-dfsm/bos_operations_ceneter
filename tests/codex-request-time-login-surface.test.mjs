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
    unauthenticated_transport_result_scope: "NON_TRIGGER_PROTECTED_METHODS",
    signed_out_protocol_bootstrap: "INITIALIZE_WITHOUT_AUTHORITY",
    signed_out_tool_surface: "BOS_GET_CONTEXT_AUTHENTICATION_TRIGGER_ONLY",
    signed_out_authentication_tool_result: "HTTP_200_MCP_WWW_AUTHENTICATE_ERROR",
    unauthenticated_business_execution: "DENIED",
    post_authentication_tool_surface: "DYNAMIC_DOMAIN_SPECIFIC_MCP_SERVICES_AND_TOOLING",
    authenticated_tools_list_gate: "VALID_TOKEN_AND_AUTHORIZED_ORGANIZATION",
    tool_surface_authorization_semantics: "AUTHENTICATED_DESCRIPTORS_DO_NOT_GRANT_AUTHORITY",
    operation_authorization: "SERVER_EVALUATED_ON_TOOLS_CALL",
    native_action_surface: "ACTIVE_CHAT",
    rejected_refresh_token_behavior:
      "CODEX_ZERO_AUTHORITY_HANDOFF_THEN_HOST_REAUTHENTICATION_ACTION",
    codex_stale_refresh_compatibility: {
      eligible_dcr_client: {
        client_name: "Codex",
        application_type: "native",
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        redirect_uri_policy: "HTTP_LOOPBACK_CALLBACK_ONLY"
      },
      access_token_scope: "mcp:tools",
      maximum_lifetime_seconds: 120,
      authority: "NONE",
      refresh_token_returned: false,
      registered_nonmatching_client_result: "invalid_grant",
      unsupported_registration_metadata_result: "invalid_client_metadata"
    },
    session_start_blocking: false,
    continuation_policy: "RESUME_ORIGINAL_REQUEST"
  });
});
