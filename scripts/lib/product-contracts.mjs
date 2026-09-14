import {
  materializeMcpUrl,
  oauthTargetContract
} from "./package-model.mjs";

export const authorizationScopePolicy =
  "ONE_ORGANIZATION_APPLICATION_INSTALLATION_ROLE_PER_GRANT";

export const authenticationConditionCategories = Object.freeze([
  "MISSING_GRANT",
  "EXPIRED_TOKEN",
  "REVOKED_GRANT",
  "INVALID_CLIENT",
  "INVALID_GRANT",
  "RESOURCE_MISMATCH",
  "REAUTHENTICATION_REQUIRED",
  "AUTHORIZATION_REQUIRED",
  "MCP_SESSION_CLOSED",
  "PROVIDER_AUTHORIZATION_REQUIRED"
]);

export function authenticationHandoffContract(foundationProduct = "bos") {
  return {
    contract_id: "bos.authentication-handoff",
    contract_version: "1",
    authentication_manager: foundationProduct,
    credential_lifecycle_owner: "host",
    authorization_enforcement_owner: "bos-service",
    delegation_policy: "AUTOMATIC",
    recognized_condition_categories: [...authenticationConditionCategories],
    readiness_result: {
      owner: foundationProduct,
      statuses: ["READY", "HOST_ACTION_REQUIRED", "NOT_READY"],
      representation: "AUTHENTICATION_READINESS_ONLY",
      authority_data: "EXCLUDED"
    }
  };
}

export function externalProductDependencyContract(
  foundationProduct = "bos"
) {
  return {
    contract_id: "bos.external-product-dependency",
    contract_version: "1",
    metadata_file: ".bos-product.json",
    metadata_schema: "bos://contracts/external-product-dependency/v1",
    foundation_dependency: foundationProduct,
    product_source_location: "EXTERNAL_ALLOWED",
    connection_owner: "DEPENDENT_PRODUCT",
    authentication_manager: foundationProduct,
    credential_lifecycle_owner: "host",
    authorization_enforcement_owner: "bos-service",
    authorization_scope_policy: authorizationScopePolicy,
    authentication_handoff_contract: "bos.authentication-handoff/v1",
    compatibility: {
      additive_fields: "ACCEPT",
      unknown_authentication_condition: "DELEGATE_TO_BOS",
      breaking_change: "NEW_CONTRACT_MAJOR"
    }
  };
}

export function productRuntimeOwnershipMetadata(
  product,
  foundationProduct = "bos"
) {
  return {
    connection_owner: product.name,
    dependency_products: product.dependencies,
    authentication: product.runtime ? "oauth_2_1" : "none",
    ...(product.runtime ? {
      authorization_scope_policy: authorizationScopePolicy,
      authentication_handoff: authenticationHandoffContract(foundationProduct)
    } : {})
  };
}

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
    external_product_contract: externalProductDependencyContract(foundation.name),
    authentication_policy: {
      foundation: "ON_INSTALL",
      dependent_product: "ON_USE"
    },
    provider_account_selection_policy: oauth.provider_account_selection_policy,
    authorization_scope_policy: authorizationScopePolicy,
    request_time_authentication: {
      activation_owner: "REGISTERED_PROTECTED_RESOURCE",
      preauthentication_surface: "OAUTH_PROTECTED_RESOURCE_METADATA",
      unauthenticated_transport_result: "HTTP_401_WWW_AUTHENTICATE",
      unauthenticated_business_execution: "DENIED",
      post_authentication_tool_surface: "DYNAMIC_DOMAIN_SPECIFIC_MCP_SERVICES_AND_TOOLING",
      authenticated_tools_list_gate: "VALID_TOKEN_AND_AUTHORIZED_ORGANIZATION",
      tool_surface_authorization_semantics: "AUTHENTICATED_DESCRIPTORS_DO_NOT_GRANT_AUTHORITY",
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
      authentication_handoff: authenticationHandoffContract(foundation.name),
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
