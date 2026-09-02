import {
  codexConnectorContract,
  materializeMcpUrl,
  oauthTargetContract
} from "./package-model.mjs";

export function singleBosConnectionContract(products) {
  const owner = products.find(({ name }) => name === "bos");
  if (!owner) throw new Error("The BOS owner product is missing");
  const connector = codexConnectorContract(owner);
  const oauth = oauthTargetContract(owner);
  return {
    schema_version: "1",
    contract_id: "bos.single-mcp-connection",
    owner_product: owner.name,
    application_name: owner.application_name,
    mcp_group_name: owner.mcp_group_name,
    resource_url: materializeMcpUrl(owner),
    oauth,
    codex_app_id: connector.id,
    codex_app_required: connector.required,
    owner_authentication_policy: owner.authentication,
    provider_account_selection_policy: oauth.provider_account_selection_policy,
    identity_organization_resolution_policy: "SERVER_EVALUATED_PER_VERIFIED_IDENTITY",
    subservice_authentication_policy: "ON_USE",
    request_time_authentication: {
      activation_owner: "SELECTED_OAUTH_TOOL",
      preauthentication_tool_surface: "DESCRIPTORS_ONLY",
      tool_security_scheme: "OAUTH2_PER_TOOL",
      unauthenticated_tool_result: "MCP_WWW_AUTHENTICATE",
      unauthenticated_business_execution: "DENIED",
      post_authentication_tool_catalog: "SERVER_AUTHORITY_SCOPED",
      native_action_surface: "ACTIVE_CHAT",
      continuation_policy: "RESUME_ORIGINAL_REQUEST"
    },
    subservice_products: products
      .filter(({ release_status, runtime }) => release_status === "active" && !runtime)
      .map(({ name }) => name)
      .sort(),
    connection_artifacts: [
      "clients/claude/plugins/bos/CONNECTORS.md",
      "clients/codex/plugins/bos/.app.json",
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
  const connector = codexConnectorContract(product);
  return {
    version: 1,
    owner: "GPT client plugin detail surface",
    plugin: product.name,
    connector_id: connector.id,
    resource_url: materializeMcpUrl(product),
    oauth: oauthTargetContract(product),
    connector_binding_acceptance: {
      required: true,
      phase: "POST_RELEASE",
      registry_record_must_resolve: true,
      connector_id_must_equal_product_source: true,
      resource_url_must_equal_product_source: true
    },
    action: {
      always_visible: true,
      allowed_labels: ["Connect", "Reconnect"],
      display_metadata_fallback_order: [
        "connector_metadata",
        "directory_app",
        "plugin_declaration"
      ],
      raw_id_is_renderable: true,
      visibility_inputs: ["plugin_declares_root_bos_app"],
      forbidden_visibility_inputs: [
        "connector_metadata_resolved",
        "connector_metadata_request_succeeded",
        "display_name_is_friendly",
        "connection_exists",
        "connection_inventory_request_succeeded",
        "oauth_grant_valid",
        "callable_tools_loaded",
        "tool_discovery_request_succeeded"
      ]
    },
    states: [
      {
        connector_metadata: "missing",
        connector_metadata_request: "failed",
        display_name: "raw_id",
        connection: "missing",
        connection_inventory_request: "failed",
        grant: "missing",
        tool_discovery_request: "failed",
        visible: true,
        label: "Connect"
      },
      {
        connector_metadata: "resolved",
        connection: "missing",
        grant: "missing",
        visible: true,
        label: "Connect"
      },
      {
        connector_metadata: "resolved",
        connection: "present",
        grant: "expired_or_invalid",
        visible: true,
        label: "Reconnect"
      },
      {
        connector_metadata: "resolved",
        connection: "present",
        grant: "valid",
        visible: true,
        label: "Reconnect"
      }
    ],
    visual_acceptance: {
      required: true,
      phase: "POST_RELEASE",
      blocks_publication: false,
      artifact_pattern: "Vault/evidence/codex-login/<version>-connect-button.png",
      review_artifact_pattern: "Vault/evidence/codex-login/<version>-connect-button.review.json",
      must_show: ["BOS plugin detail page", "Connect or Reconnect action"]
    },
    diagnostics: {
      default_enabled: true,
      disable_environment_variable: "BOS_HTTP_DEBUG=0",
      stream: "stderr",
      format: "ndjson",
      correlation_field: "request_id",
      required_pairs: [
        "http.request:http.response_or_http.error",
        "protocol.request:protocol.response_or_protocol.error"
      ],
      required_redactions: [
        "authorization",
        "cookie",
        "set-cookie",
        "access_token",
        "refresh_token",
        "id_token",
        "oauth_code",
        "oauth_state",
        "oauth_verifier",
        "account_id",
        "organization_id"
      ],
      preserve_stdout_contract_output: true
    }
  };
}
