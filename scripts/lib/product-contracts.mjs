import {
  materializeMcpUrl,
  oauthTargetContract
} from "./package-model.mjs";

export function productMcpConnectionsContract(products) {
  const foundation = products.find(({ name }) => name === "bos");
  if (!foundation) throw new Error("The BOS foundation product is missing");
  const oauth = oauthTargetContract(foundation);
  const runtimeProducts = products
    .filter(({ runtime }) => runtime)
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    schema_version: "1",
    contract_id: "bos.product-mcp-connections",
    foundation_product: foundation.name,
    dependency_policy: "DEPENDENT_PRODUCTS_REQUIRE_BOS",
    connection_policy: "EACH_PRODUCT_OWNS_ONE_SCOPED_MCP",
    authentication_policy: {
      foundation: "ON_INSTALL",
      dependent_product: "ON_USE"
    },
    provider_account_selection_policy: oauth.provider_account_selection_policy,
    identity_organization_resolution_policy: "SERVER_EVALUATED_PER_VERIFIED_IDENTITY",
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
    products: runtimeProducts.map((product) => ({
      name: product.name,
      dependencies: product.dependencies,
      application_name: product.application_name,
      mcp_group_name: product.mcp_group_name,
      resource_url: materializeMcpUrl(product),
      oauth: oauthTargetContract(product),
      authentication: product.authentication,
      codex_mcp_startup_timeout_sec: product.codex_mcp_startup_timeout_sec,
      codex_mcp_tool_timeout_sec: product.codex_mcp_tool_timeout_sec,
      connection_artifacts: [
        `clients/claude/plugins/${product.name}/CONNECTORS.md`,
        `clients/codex/plugins/${product.name}/.mcp.json`,
        `clients/copilot/products/${product.name}/.github/mcp.json`,
        `clients/gemini/extensions/${product.name}/mcp_config.json`
      ]
    }))
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
      startup_timeout_sec: product.codex_mcp_startup_timeout_sec,
      tool_timeout_sec: product.codex_mcp_tool_timeout_sec
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
