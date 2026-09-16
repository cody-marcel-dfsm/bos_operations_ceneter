import {
  materializeMcpUrl,
  oauthTargetContract,
  ownsHostConnection
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
  foundationProduct = "bos",
  version = "2"
) {
  return {
    contract_id: "bos.external-product-dependency",
    contract_version: version,
    metadata_file: ".bos-product.json",
    metadata_schema: `bos://contracts/external-product-dependency/v${version}`,
    foundation_dependency: foundationProduct,
    product_source_location: "EXTERNAL_ALLOWED",
    connection_owner: version === "1" ? "DEPENDENT_PRODUCT" : "BOS_FOUNDATION",
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
    connection_owner: product.connection_owner,
    dependency_products: product.dependencies,
    authentication: product.runtime ? (ownsHostConnection(product) ? "oauth_2_1" : "bos_dependency") : "none",
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
    schema_version: "2",
    contract_id: "bos.product-mcp-connections",
    foundation_product: foundation.name,
    dependency_policy: "DEPENDENT_PRODUCTS_REQUIRE_BOS",
    connection_policy: "BOS_FOUNDATION_OWNS_HOST_CONNECTION",
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
        mcp_transport_result: "HTTP_401_WWW_AUTHENTICATE",
        tool_surface: "NONE",
        refresh_token_returned: false,
        registered_nonmatching_client_result: "invalid_grant",
        unsupported_registration_metadata_result: "invalid_client_metadata"
      },
      session_start_blocking: false,
      continuation_policy: "RESUME_ORIGINAL_REQUEST"
    },
    products: runtimeProducts.map((product) => ({
      name: product.name,
      dependencies: product.dependencies,
      application_name: product.application_name,
      connection_owner: product.connection_owner,
      authentication: product.authentication,
      authorization_scope_policy: authorizationScopePolicy,
      runtime_verification_tools: product.runtime_verification_tools
    })),
    connections: runtimeProducts.filter(ownsHostConnection).map((product) => ({
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
      server_required: false,
      authenticated_business_execution_required: true,
      rejected_refresh_token_behavior: "HOST_REAUTHENTICATION_ACTION",
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
