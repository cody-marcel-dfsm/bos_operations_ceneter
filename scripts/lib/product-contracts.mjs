import {
  materializeMcpUrl,
  oauthTargetContract
} from "./package-model.mjs";

export function singleBosConnectionContract(products) {
  const owner = products.find(({ name }) => name === "bos");
  if (!owner) throw new Error("The BOS owner product is missing");
  const oauth = oauthTargetContract(owner);
  return {
    schema_version: "1",
    contract_id: "bos.single-mcp-connection",
    owner_product: owner.name,
    application_name: owner.application_name,
    mcp_group_name: owner.mcp_group_name,
    resource_url: materializeMcpUrl(owner),
    oauth,
    owner_authentication_policy: owner.authentication,
    codex_mcp_server_required: true,
    codex_oauth_resource_equals_resource_url: true,
    codex_mcp_startup_timeout_sec: owner.codex_mcp_startup_timeout_sec,
    provider_account_selection_policy: oauth.provider_account_selection_policy,
    identity_organization_resolution_policy: "SERVER_EVALUATED_PER_VERIFIED_IDENTITY",
    subservice_authentication_policy: "ON_USE",
    request_time_authentication: {
      activation_owner: "SELECTED_OAUTH_TOOL",
      preauthentication_tool_surface: "DESCRIPTORS_ONLY",
      tool_security_scheme: "OAUTH2_PER_TOOL",
      unauthenticated_tool_result: "MCP_WWW_AUTHENTICATE",
      unauthenticated_business_execution: "DENIED",
      post_authentication_tool_surface: "DYNAMIC_DOMAIN_SPECIFIC_MCP_SERVICES_AND_TOOLING",
      authenticated_tools_list_gate: "VALID_TOKEN_AND_AUTHORIZED_ORGANIZATION",
      tool_surface_authorization_semantics: "DESCRIPTORS_DO_NOT_GRANT_AUTHORITY",
      operation_authorization: "SERVER_EVALUATED_ON_TOOLS_CALL",
      native_action_surface: "ACTIVE_CHAT",
      continuation_policy: "RESUME_ORIGINAL_REQUEST"
    },
    subservice_products: products
      .filter(({ release_status, runtime }) => release_status === "active" && !runtime)
      .map(({ name }) => name)
      .sort(),
    connection_artifacts: [
      "clients/claude/plugins/bos/CONNECTORS.md",
      "clients/codex/plugins/bos/.mcp.json",
      "clients/copilot/products/bos/.github/mcp.json",
      "clients/gemini/extensions/bos/mcp_config.json"
    ],
    forbidden_subservice_connection_identifiers: [
      "bos_education_center",
      "mcp__bos_education_center__",
      "connection must be education-center",
      "trace.get(\"connection\") == \"education-center\""
    ]
  };
}

export function codexLoginSurfaceContract(product) {
  return {
    version: 1,
    owner: "Codex package MCP authentication surface",
    plugin: product.name,
    resource_url: materializeMcpUrl(product),
    oauth: oauthTargetContract(product),
    package_binding_acceptance: {
      required: true,
      manifest_field: "mcpServers",
      manifest_path: "./.mcp.json",
      server_name: product.mcp_group_name,
      server_type: "http",
      resource_url_must_equal_product_source: true,
      oauth_resource_must_equal_resource_url: true,
      server_required: true,
      startup_timeout_sec: product.codex_mcp_startup_timeout_sec
    },
    action: {
      trigger: "MCP_OAUTH_CHALLENGE",
      allowed_labels: ["Connect", "Sign in", "Authenticate", "Reconnect"],
      authorization_target: product.oauth.authorization_endpoint,
      forbidden_authorization_hosts: ["auth.openai.com", "chatgpt.com"]
    },
    visual_acceptance: {
      required: true,
      phase: "POST_RELEASE",
      blocks_publication: false,
      artifact_pattern: "Vault/evidence/codex-login/<version>-connect-button.png",
      review_artifact_pattern: "Vault/evidence/codex-login/<version>-connect-button.review.json",
      review_required_fields: {
        schema_version: "1",
        product_version: "<version>",
        screenshot: "<screenshot basename>",
        screenshot_sha256: "<exact screenshot SHA-256>",
        surface: "GPT_PLUGIN_DETAIL",
        visible_action: "<allowed action label>",
        observed_authorization_target: product.oauth.authorization_endpoint,
        reviewer: "ORACLE",
        verdict: "APPROVED"
      },
      must_show: ["BOS authentication action", "dfsm.ai authorization target"]
    }
  };
}
