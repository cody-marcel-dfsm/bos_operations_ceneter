import { inspectOAuthAuthorizeTarget } from "./product-mcp-contract.mjs";
import { createHttpDebugFetch } from "./http-debug-log.mjs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { oauthTargetContract, readJson, root } from "./package-model.mjs";

const bosProduct = await readJson(join(root, "products", "bos", "product.json"));
export const CANONICAL_RESOURCE_URL = bosProduct.mcp_resource_url;
export const CANONICAL_OAUTH_TARGET = oauthTargetContract(bosProduct);
export const CANONICAL_AUTHORIZATION_ENDPOINT =
  CANONICAL_OAUTH_TARGET.authorization_endpoint;
export const CANONICAL_IDENTITY_PROVIDER_AUTHORIZATION_ENDPOINT =
  CANONICAL_OAUTH_TARGET.identity_provider_authorization_endpoint;

export function expectedBosResourceChallenge(resourceUrl) {
  const resource = new URL(resourceUrl);
  const metadata = new URL(
    `/.well-known/oauth-protected-resource${resource.pathname}`,
    resource.origin
  );
  return `Bearer resource_metadata="${metadata.href}", scope="mcp:tools"`;
}

export const CANONICAL_PROTECTED_RESOURCE_METADATA_URL = new URL(
  `/.well-known/oauth-protected-resource${new URL(CANONICAL_RESOURCE_URL).pathname}`,
  CANONICAL_RESOURCE_URL
).href;
export const CANONICAL_RESOURCE_CHALLENGE =
  expectedBosResourceChallenge(CANONICAL_RESOURCE_URL);

function finding(code, message) {
  return { code, path: "oauth-authorize", message };
}

function discoveryFinding(code, message, path = "mcp-resource-get") {
  return { code, path, message };
}

export async function probeBosOAuthDiscovery({
  resourceUrl = CANONICAL_RESOURCE_URL,
  oauthTarget = CANONICAL_OAUTH_TARGET,
  fetchImpl = fetch,
  debug = false,
  debugWriter
} = {}) {
  const request = createHttpDebugFetch(fetchImpl, {
    enabled: debug,
    writer: debugWriter,
    source: "bos-oauth-discovery"
  });
  let expectedChallenge;
  try {
    expectedChallenge = expectedBosResourceChallenge(resourceUrl);
  } catch (error) {
    return discoveryResult([discoveryFinding(
      "oauth_resource_url",
      `BOS protected-resource URL is invalid: ${error.message}`
    )], resourceUrl);
  }

  let response;
  try {
    response = await request(resourceUrl, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/json" }
    });
  } catch (error) {
    return discoveryResult([discoveryFinding(
      "oauth_resource_request",
      `BOS protected-resource discovery failed: ${error.message}`
    )], resourceUrl);
  }

  const violations = [];
  if (response.status !== 401) {
    violations.push(discoveryFinding(
      "oauth_resource_status",
      `Unauthenticated BOS resource discovery must return HTTP 401; found HTTP ${response.status}.`
    ));
  }

  const challenge = response.headers.get("www-authenticate");
  if (challenge !== expectedChallenge) {
    violations.push(discoveryFinding(
      "oauth_resource_challenge",
      challenge == null
        ? "BOS resource discovery must return the canonical WWW-Authenticate challenge; no challenge was present."
        : "BOS resource discovery returned a noncanonical WWW-Authenticate challenge."
    ));
  }

  let errorCode = null;
  try {
    const payload = await response.json();
    errorCode = payload?.detail?.error ?? null;
  } catch {
    // The contract violation below reports the missing structured error.
  }
  if (errorCode !== "authentication_required") {
    violations.push(discoveryFinding(
      "oauth_resource_error",
      errorCode == null
        ? "BOS resource discovery must identify authentication_required; no structured error was present."
        : "BOS resource discovery returned a noncanonical structured error."
    ));
  }

  const result = discoveryResult(
    violations,
    resourceUrl,
    response.status,
    challenge === expectedChallenge ? expectedChallenge : null,
    errorCode === "authentication_required" ? errorCode : null
  );
  if (violations.length) return result;

  const protectedResourceMetadataUrl = new URL(
    `/.well-known/oauth-protected-resource${new URL(resourceUrl).pathname}`,
    resourceUrl
  ).href;
  let protectedResourceMetadata;
  try {
    const metadataResponse = await request(protectedResourceMetadataUrl, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/json" }
    });
    if (metadataResponse.status !== 200) {
      result.violations.push(discoveryFinding(
        "oauth_protected_resource_metadata_status",
        `Protected-resource metadata must return HTTP 200; found HTTP ${metadataResponse.status}.`,
        "protected-resource-metadata"
      ));
    } else {
      protectedResourceMetadata = await metadataResponse.json();
    }
  } catch (error) {
    result.violations.push(discoveryFinding(
      "oauth_protected_resource_metadata_request",
      `Protected-resource metadata discovery failed: ${error.message}`,
      "protected-resource-metadata"
    ));
  }

  const expectedIssuer = oauthTarget.authorization_server_issuer;
  if (protectedResourceMetadata) {
    if (protectedResourceMetadata.resource !== resourceUrl) {
      result.violations.push(discoveryFinding(
        "oauth_protected_resource_target",
        "Protected-resource metadata does not identify the requested BOS MCP resource.",
        "protected-resource-metadata"
      ));
    }
    if (JSON.stringify(protectedResourceMetadata.authorization_servers) !==
        JSON.stringify([expectedIssuer])) {
      result.violations.push(discoveryFinding(
        "oauth_authorization_server_issuer",
        "Protected-resource metadata does not identify the product-owned authorization-server issuer.",
        "protected-resource-metadata"
      ));
    }
  }

  const authorizationServerMetadataUrl = new URL(
    "/.well-known/oauth-authorization-server",
    expectedIssuer
  ).href;
  let authorizationServerMetadata;
  if (!result.violations.length) {
    try {
      const metadataResponse = await request(authorizationServerMetadataUrl, {
        method: "GET",
        redirect: "manual",
        headers: { accept: "application/json" }
      });
      if (metadataResponse.status !== 200) {
        result.violations.push(discoveryFinding(
          "oauth_authorization_server_metadata_status",
          `Authorization-server metadata must return HTTP 200; found HTTP ${metadataResponse.status}.`,
          "authorization-server-metadata"
        ));
      } else {
        authorizationServerMetadata = await metadataResponse.json();
      }
    } catch (error) {
      result.violations.push(discoveryFinding(
        "oauth_authorization_server_metadata_request",
        `Authorization-server metadata discovery failed: ${error.message}`,
        "authorization-server-metadata"
      ));
    }
  }

  if (authorizationServerMetadata) {
    if (authorizationServerMetadata.issuer !== expectedIssuer) {
      result.violations.push(discoveryFinding(
        "oauth_authorization_server_metadata_issuer",
        "Authorization-server metadata issuer does not match the product source.",
        "authorization-server-metadata"
      ));
    }
    if (authorizationServerMetadata.authorization_endpoint !==
        oauthTarget.authorization_endpoint) {
      result.violations.push(discoveryFinding(
        "oauth_authorization_endpoint",
        "Authorization-server metadata endpoint does not match the product source.",
        "authorization-server-metadata"
      ));
    }
  }

  result.status = result.violations.length ? "failed" : "passed";
  result.protected_resource_metadata_url = protectedResourceMetadataUrl;
  result.authorization_server_metadata_url = authorizationServerMetadataUrl;
  result.authorization_server_issuer = authorizationServerMetadata?.issuer ?? null;
  result.authorization_endpoint =
    authorizationServerMetadata?.authorization_endpoint ?? null;
  return result;
}

function loginTriggerFinding(code, message, path) {
  return { code, path, message };
}

async function postMcp(request, resourceUrl, id, method, params) {
  return postAuthorizedMcp(request, resourceUrl, id, method, params);
}

async function postAuthorizedMcp(
  request,
  resourceUrl,
  id,
  method,
  params,
  accessToken = null
) {
  const headers = {
    accept: "application/json, text/event-stream",
    "content-type": "application/json"
  };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return request(resourceUrl, {
    method: "POST",
    redirect: "manual",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params })
  });
}

function expectedBosToolChallenge(resourceUrl) {
  const metadata = new URL(
    `/.well-known/oauth-protected-resource${new URL(resourceUrl).pathname}`,
    resourceUrl
  ).href;
  return `Bearer resource_metadata="${metadata}", ` +
    'scope="mcp:tools", error="invalid_token", ' +
    'error_description="Authentication required"';
}

function validIssuerEndpoint(value, issuer) {
  try {
    const endpoint = new URL(value);
    const expectedIssuer = new URL(issuer);
    return endpoint.protocol === "https:" &&
      endpoint.origin === expectedIssuer.origin &&
      !endpoint.username && !endpoint.password && !endpoint.hash;
  } catch {
    return false;
  }
}

function staleRefreshToken() {
  return `bos_mcp_rt_${randomBytes(48).toString("base64url")}`;
}

async function parseJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function probeBosCodexStaleRefreshRecovery({
  resourceUrl = CANONICAL_RESOURCE_URL,
  businessToolName = "bos_list_plugin_services",
  verifyNonCodexControl = false,
  verifyCodexNearMatchControls = false,
  fetchImpl = fetch,
  debug = false,
  debugWriter
} = {}) {
  const request = createHttpDebugFetch(fetchImpl, {
    enabled: debug,
    writer: debugWriter,
    source: "bos-codex-stale-refresh-recovery"
  });
  const violations = [];
  const result = {
    schema_version: "1",
    contract_id: "bos.oauth-codex-stale-refresh-recovery",
    status: "failed",
    resource_url: resourceUrl,
    protected_resource_metadata_status: null,
    authorization_server_metadata_status: null,
    codex_registration_status: null,
    stale_refresh_status: null,
    access_token_expires_in: null,
    access_token_scope: null,
    initialize_status: null,
    tools_list_status: null,
    tools_call_status: null,
    business_call_status: null,
    authentication_tool: null,
    non_codex_registration_status: null,
    non_codex_refresh_status: null,
    non_codex_error: null,
    codex_near_match_controls: [],
    violations
  };
  const fail = (code, message, path) => {
    violations.push(loginTriggerFinding(code, message, path));
  };

  let parsedResource;
  try {
    parsedResource = new URL(resourceUrl);
    if (parsedResource.protocol !== "https:" || parsedResource.username ||
        parsedResource.password || parsedResource.hash) {
      throw new Error("resource must be an HTTPS URL without credentials or a fragment");
    }
  } catch (error) {
    fail("oauth_stale_refresh_resource", `Invalid product resource: ${error.message}`, "resource");
    return result;
  }

  const protectedMetadataUrl = new URL(
    `/.well-known/oauth-protected-resource${parsedResource.pathname}`,
    parsedResource.origin
  ).href;
  let protectedMetadata;
  try {
    const response = await request(protectedMetadataUrl, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/json" }
    });
    result.protected_resource_metadata_status = response.status;
    protectedMetadata = await parseJsonResponse(response);
    if (response.status !== 200) {
      fail(
        "oauth_stale_refresh_protected_metadata_status",
        `Protected-resource metadata must return HTTP 200; found HTTP ${response.status}.`,
        "protected-resource-metadata"
      );
    }
  } catch (error) {
    fail(
      "oauth_stale_refresh_protected_metadata_request",
      `Protected-resource metadata request failed: ${error.message}`,
      "protected-resource-metadata"
    );
    return result;
  }
  if (protectedMetadata?.resource !== resourceUrl ||
      !Array.isArray(protectedMetadata?.authorization_servers) ||
      protectedMetadata.authorization_servers.length !== 1) {
    fail(
      "oauth_stale_refresh_protected_metadata",
      "Protected-resource metadata must identify the exact product resource and one authorization server.",
      "protected-resource-metadata"
    );
    return result;
  }

  const issuer = protectedMetadata.authorization_servers[0];
  if (!validIssuerEndpoint(issuer, issuer)) {
    fail(
      "oauth_stale_refresh_issuer",
      "The discovered authorization-server issuer must be an absolute HTTPS URL.",
      "authorization-server-metadata"
    );
    return result;
  }
  const authorizationMetadataUrl = new URL(
    "/.well-known/oauth-authorization-server",
    issuer
  ).href;
  let authorizationMetadata;
  try {
    const response = await request(authorizationMetadataUrl, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "application/json" }
    });
    result.authorization_server_metadata_status = response.status;
    authorizationMetadata = await parseJsonResponse(response);
    if (response.status !== 200) {
      fail(
        "oauth_stale_refresh_authorization_metadata_status",
        `Authorization-server metadata must return HTTP 200; found HTTP ${response.status}.`,
        "authorization-server-metadata"
      );
    }
  } catch (error) {
    fail(
      "oauth_stale_refresh_authorization_metadata_request",
      `Authorization-server metadata request failed: ${error.message}`,
      "authorization-server-metadata"
    );
    return result;
  }
  const registrationEndpoint = authorizationMetadata?.registration_endpoint;
  const tokenEndpoint = authorizationMetadata?.token_endpoint;
  if (authorizationMetadata?.issuer !== issuer ||
      !validIssuerEndpoint(registrationEndpoint, issuer) ||
      !validIssuerEndpoint(tokenEndpoint, issuer)) {
    fail(
      "oauth_stale_refresh_authorization_metadata",
      "Authorization-server metadata must identify its exact issuer and same-origin HTTPS registration and token endpoints.",
      "authorization-server-metadata"
    );
    return result;
  }

  const register = async (clientName, applicationType, redirectUri, overrides = {}) => {
    const response = await request(registrationEndpoint, {
      method: "POST",
      redirect: "manual",
      headers: {
        accept: "application/json",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        client_name: clientName,
        redirect_uris: [redirectUri],
        application_type: applicationType,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        ...overrides
      })
    });
    return { response, payload: await parseJsonResponse(response) };
  };
  const exchangeUnknownRefresh = async (clientId) => {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: staleRefreshToken(),
      client_id: clientId,
      resource: resourceUrl
    });
    const response = await request(tokenEndpoint, {
      method: "POST",
      redirect: "manual",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
    return { response, payload: await parseJsonResponse(response) };
  };

  let codexRegistration;
  try {
    codexRegistration = await register(
      "Codex",
      "native",
      "http://127.0.0.1:1455/callback"
    );
    result.codex_registration_status = codexRegistration.response.status;
  } catch (error) {
    fail("oauth_codex_registration_request", `Codex DCR failed: ${error.message}`, "registration");
    return result;
  }
  const codexClientId = codexRegistration.payload?.client_id;
  if (codexRegistration.response.status !== 201 ||
      typeof codexClientId !== "string" || !codexClientId ||
      codexRegistration.payload?.client_name !== "Codex" ||
      codexRegistration.payload?.application_type !== "native" ||
      Object.hasOwn(codexRegistration.payload ?? {}, "client_secret")) {
    fail(
      "oauth_codex_registration_contract",
      "Codex DCR must create the exact native public client without a client secret.",
      "registration"
    );
    return result;
  }

  let refresh;
  try {
    refresh = await exchangeUnknownRefresh(codexClientId);
    result.stale_refresh_status = refresh.response.status;
  } catch (error) {
    fail("oauth_stale_refresh_request", `Codex stale-refresh exchange failed: ${error.message}`, "token");
    return result;
  }
  const accessToken = refresh.payload?.access_token;
  result.access_token_expires_in = refresh.payload?.expires_in ?? null;
  result.access_token_scope = refresh.payload?.scope ?? null;
  if (refresh.response.status !== 200 ||
      typeof accessToken !== "string" || !accessToken.startsWith("bos_mcp_at_") ||
      refresh.payload?.token_type !== "Bearer" ||
      refresh.payload?.scope !== "mcp:tools" ||
      !Number.isInteger(refresh.payload?.expires_in) ||
      refresh.payload.expires_in <= 0 || refresh.payload.expires_in > 120 ||
      Object.hasOwn(refresh.payload ?? {}, "refresh_token")) {
    fail(
      "oauth_stale_refresh_token_contract",
      "Codex stale-refresh recovery must return a BOS bearer scoped only to mcp:tools for at most 120 seconds and must not return a refresh token.",
      "token"
    );
    return result;
  }

  let initializeResponse;
  try {
    initializeResponse = await postAuthorizedMcp(request, resourceUrl, 101, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "Codex", version: "0.153.4" }
    }, accessToken);
    result.initialize_status = initializeResponse.status;
  } catch (error) {
    fail("oauth_stale_refresh_initialize_request", `Recovered MCP initialization failed: ${error.message}`, "initialize");
    return result;
  }
  if (initializeResponse.status !== 200) {
    fail(
      "oauth_stale_refresh_initialize_status",
      `Recovered MCP initialization must return HTTP 200; found HTTP ${initializeResponse.status}.`,
      "initialize"
    );
  }

  let toolsResponse;
  let toolsPayload;
  try {
    toolsResponse = await postAuthorizedMcp(request, resourceUrl, 102, "tools/list", {}, accessToken);
    result.tools_list_status = toolsResponse.status;
    toolsPayload = await parseJsonResponse(toolsResponse);
  } catch (error) {
    fail("oauth_stale_refresh_tools_list_request", `Recovered tool discovery failed: ${error.message}`, "tools/list");
    return result;
  }
  const tools = toolsPayload?.result?.tools;
  const authenticationTool = Array.isArray(tools)
    ? tools.find((tool) => tool?.name === "bos_get_context")
    : null;
  if (toolsResponse.status !== 200 || !Array.isArray(tools) || tools.length !== 1 ||
      !authenticationTool) {
    fail(
      "oauth_stale_refresh_tool_surface",
      "The recovery bearer must expose only bos_get_context and no business tools or schemas.",
      "tools/list"
    );
  } else {
    result.authentication_tool = authenticationTool.name;
    const inputSchema = authenticationTool.inputSchema;
    const securitySchemes = authenticationTool.securitySchemes;
    const inputSchemaKeys = inputSchema && typeof inputSchema === "object"
      ? Object.keys(inputSchema).sort()
      : [];
    if (inputSchema?.type !== "object" ||
        JSON.stringify(inputSchema?.properties) !== "{}" ||
        inputSchema?.additionalProperties !== false ||
        JSON.stringify(inputSchemaKeys) !==
          JSON.stringify(["additionalProperties", "properties", "type"]) ||
        !Array.isArray(securitySchemes) || securitySchemes.length !== 1 ||
        securitySchemes[0]?.type !== "oauth2" ||
        JSON.stringify(securitySchemes[0]?.scopes) !== JSON.stringify(["mcp:tools"]) ||
        JSON.stringify(Object.keys(securitySchemes[0] ?? {}).sort()) !==
          JSON.stringify(["scopes", "type"])) {
      fail(
        "oauth_stale_refresh_authentication_tool_contract",
        "bos_get_context must expose an empty authority-free input and the exact mcp:tools OAuth security scheme.",
        "tools/list"
      );
    }
  }

  let contextResponse;
  let contextPayload;
  try {
    contextResponse = await postAuthorizedMcp(request, resourceUrl, 103, "tools/call", {
      name: "bos_get_context",
      arguments: {}
    }, accessToken);
    result.tools_call_status = contextResponse.status;
    contextPayload = await parseJsonResponse(contextResponse);
  } catch (error) {
    fail("oauth_stale_refresh_context_request", `Recovered context call failed: ${error.message}`, "tools/call");
    return result;
  }
  const contextResult = contextPayload?.result;
  const contextChallenges = contextResult?._meta?.["mcp/www_authenticate"];
  const contextResultKeys = contextResult && typeof contextResult === "object"
    ? Object.keys(contextResult).sort()
    : [];
  const contextMetaKeys = contextResult?._meta &&
      typeof contextResult._meta === "object"
    ? Object.keys(contextResult._meta).sort()
    : [];
  if (contextResponse.status !== 200 || contextResult?.isError !== true ||
      JSON.stringify(contextResultKeys) !==
        JSON.stringify(["_meta", "content", "isError"]) ||
      JSON.stringify(contextMetaKeys) !==
        JSON.stringify(["mcp/www_authenticate"]) ||
      JSON.stringify(contextResult?.content) !== JSON.stringify([
        { type: "text", text: "Authentication required." }
      ]) ||
      Object.hasOwn(contextResult ?? {}, "structuredContent") ||
      JSON.stringify(contextChallenges) !==
        JSON.stringify([expectedBosToolChallenge(resourceUrl)])) {
    fail(
      "oauth_stale_refresh_context_challenge",
      "Recovered bos_get_context must return the exact canonical MCP authentication challenge.",
      "tools/call"
    );
  }

  if (verifyCodexNearMatchControls) {
    const controls = [
      ["codex", "native", "http://127.0.0.1:1455/callback", {}, 201],
      ["Codex", "web", "https://example.com/callback", {}, 201],
      ["Codex", "native", "https://example.com/callback", {}, 201],
      ["Codex", "native", "http://127.0.0.1:1455/callback", {
        token_endpoint_auth_method: "client_secret_post"
      }, 400],
      ["Codex", "native", "http://127.0.0.1:1455/callback", {
        grant_types: ["authorization_code", "refresh_token", "client_credentials"]
      }, 400],
      ["Codex", "native", "http://127.0.0.1:1455/callback", {
        response_types: ["token"]
      }, 400]
    ];
    for (const [clientName, applicationType, redirectUri, overrides,
      expectedRegistrationStatus] of controls) {
      const registration = await register(
        clientName, applicationType, redirectUri, overrides
      );
      const control = {
        client_name: clientName,
        application_type: applicationType,
        redirect_uri: redirectUri,
        registration_status: registration.response.status,
        refresh_status: null,
        error: null
      };
      const controlClientId = registration.payload?.client_id;
      if (registration.response.status !== expectedRegistrationStatus) {
        fail(
          "oauth_codex_near_match_registration",
          "A near-match client must either register for an invalid_grant control or receive canonical invalid_client_metadata.",
          "codex-near-match-registration"
        );
        result.codex_near_match_controls.push(control);
        continue;
      }
      if (expectedRegistrationStatus === 400) {
        control.error = registration.payload?.error ?? null;
        result.codex_near_match_controls.push(control);
        if (control.error !== "invalid_client_metadata") {
          fail(
            "oauth_codex_near_match_registration_error",
            "Unsupported DCR metadata must receive canonical invalid_client_metadata.",
            "codex-near-match-registration"
          );
        }
        continue;
      }
      if (typeof controlClientId !== "string") {
        fail(
          "oauth_codex_near_match_client_id",
          "A registered near-match control must return a client identifier.",
          "codex-near-match-registration"
        );
        result.codex_near_match_controls.push(control);
        continue;
      }
      const exchange = await exchangeUnknownRefresh(controlClientId);
      control.refresh_status = exchange.response.status;
      control.error = exchange.payload?.error ?? null;
      result.codex_near_match_controls.push(control);
      if (exchange.response.status !== 400 || exchange.payload?.error !== "invalid_grant") {
        fail(
          "oauth_codex_near_match_handoff",
          "A near-match Codex registration must receive canonical invalid_grant for an unknown refresh token.",
          "codex-near-match-token"
        );
      }
    }
  }

  let businessResponse;
  try {
    businessResponse = await postAuthorizedMcp(request, resourceUrl, 104, "tools/call", {
      name: businessToolName,
      arguments: {}
    }, accessToken);
    result.business_call_status = businessResponse.status;
  } catch (error) {
    fail("oauth_stale_refresh_business_request", `Recovered business-tool probe failed: ${error.message}`, "business-tools/call");
    return result;
  }
  if (businessResponse.status !== 401 ||
      businessResponse.headers.get("www-authenticate") !==
        expectedBosResourceChallenge(resourceUrl)) {
    fail(
      "oauth_stale_refresh_business_denial",
      "The recovery bearer must not authorize business access and must receive HTTP 401 with the exact protected-resource challenge.",
      "business-tools/call"
    );
  }

  if (verifyNonCodexControl) {
    let controlRegistration;
    try {
      controlRegistration = await register(
        "OpenAI",
        "web",
        "https://chatgpt.com/connector/oauth/callback"
      );
      result.non_codex_registration_status = controlRegistration.response.status;
    } catch (error) {
      fail("oauth_non_codex_registration_request", `Non-Codex DCR failed: ${error.message}`, "non-codex-registration");
      return result;
    }
    const controlClientId = controlRegistration.payload?.client_id;
    if (controlRegistration.response.status !== 201 ||
        typeof controlClientId !== "string" || !controlClientId ||
        controlRegistration.payload?.client_name !== "OpenAI" ||
        controlRegistration.payload?.application_type !== "web") {
      fail(
        "oauth_non_codex_registration_contract",
        "The non-Codex control must register as the exact public web client.",
        "non-codex-registration"
      );
      return result;
    }
    let controlRefresh;
    try {
      controlRefresh = await exchangeUnknownRefresh(controlClientId);
      result.non_codex_refresh_status = controlRefresh.response.status;
      result.non_codex_error = controlRefresh.payload?.error ?? null;
    } catch (error) {
      fail("oauth_non_codex_refresh_request", `Non-Codex stale-refresh control failed: ${error.message}`, "non-codex-token");
      return result;
    }
    if (controlRefresh.response.status !== 400 ||
        controlRefresh.payload?.error !== "invalid_grant" ||
        controlRefresh.payload?.error_description !== "Invalid refresh token") {
      fail(
        "oauth_non_codex_invalid_grant",
        "A non-Codex client must retain the canonical invalid_grant response for an unknown refresh token.",
        "non-codex-token"
      );
    }
  }

  result.status = violations.length ? "failed" : "passed";
  return result;
}

export async function probeBosNativeLoginTrigger({
  resourceUrl = CANONICAL_RESOURCE_URL,
  fetchImpl = fetch,
  debug = false,
  debugWriter
} = {}) {
  const request = createHttpDebugFetch(fetchImpl, {
    enabled: debug,
    writer: debugWriter,
    source: "bos-native-login-trigger"
  });
  const violations = [];
  const result = {
    schema_version: "1",
    contract_id: "bos.oauth-native-login-trigger",
    status: "failed",
    resource_url: resourceUrl,
    initialize_status: null,
    tools_list_status: null,
    tools_call_status: null,
    business_call_status: null,
    authentication_tool: null,
    violations
  };

  let initializeResponse;
  try {
    initializeResponse = await postMcp(request, resourceUrl, 1, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "bos-login-contract", version: "1" }
    });
    result.initialize_status = initializeResponse.status;
  } catch (error) {
    violations.push(loginTriggerFinding(
      "oauth_login_initialize_request",
      `Signed-out MCP initialization failed: ${error.message}`,
      "initialize"
    ));
    return result;
  }
  if (initializeResponse.status !== 200) {
    violations.push(loginTriggerFinding(
      "oauth_login_initialize_status",
      `Signed-out MCP initialization must return HTTP 200; found HTTP ${initializeResponse.status}.`,
      "initialize"
    ));
  }

  let toolsResponse;
  let toolsPayload;
  try {
    toolsResponse = await postMcp(request, resourceUrl, 2, "tools/list", {});
    result.tools_list_status = toolsResponse.status;
    toolsPayload = await toolsResponse.json();
  } catch (error) {
    violations.push(loginTriggerFinding(
      "oauth_login_tools_list_request",
      `Signed-out MCP tool discovery failed: ${error.message}`,
      "tools/list"
    ));
    return result;
  }
  if (toolsResponse.status !== 200) {
    violations.push(loginTriggerFinding(
      "oauth_login_tools_list_status",
      `Signed-out MCP tool discovery must return HTTP 200; found HTTP ${toolsResponse.status}.`,
      "tools/list"
    ));
  }
  const tools = toolsPayload?.result?.tools;
  const authenticationTool = Array.isArray(tools)
    ? tools.find((tool) => tool?.name === "bos_get_context")
    : null;
  if (!Array.isArray(tools) || tools.length !== 1) {
    violations.push(loginTriggerFinding(
      "oauth_login_tool_surface",
      "Signed-out tool discovery must expose exactly one authentication trigger and no business tools or schemas.",
      "tools/list"
    ));
  }
  const schemes = authenticationTool?.securitySchemes;
  if (!authenticationTool || !Array.isArray(schemes) ||
      !schemes.some((scheme) =>
        scheme?.type === "oauth2" &&
        Array.isArray(scheme.scopes) &&
        scheme.scopes.includes("mcp:tools")
      )) {
    violations.push(loginTriggerFinding(
      "oauth_login_tool_security",
      "Signed-out tool discovery must advertise bos_get_context with its OAuth2 mcp:tools security scheme.",
      "tools/list"
    ));
  } else {
    result.authentication_tool = authenticationTool.name;
  }

  let callResponse;
  let callPayload;
  try {
    callResponse = await postMcp(request, resourceUrl, 3, "tools/call", {
      name: "bos_get_context",
      arguments: {}
    });
    result.tools_call_status = callResponse.status;
    callPayload = await callResponse.json();
  } catch (error) {
    violations.push(loginTriggerFinding(
      "oauth_login_tools_call_request",
      `Signed-out authentication tool call failed: ${error.message}`,
      "tools/call"
    ));
    return result;
  }
  if (callResponse.status !== 200) {
    violations.push(loginTriggerFinding(
      "oauth_login_tools_call_status",
      `Signed-out authentication tool call must return HTTP 200; found HTTP ${callResponse.status}.`,
      "tools/call"
    ));
  }
  const toolResult = callPayload?.result;
  const challenges = toolResult?._meta?.["mcp/www_authenticate"];
  const expectedToolChallenge = expectedBosToolChallenge(resourceUrl);
  if (toolResult?.isError !== true ||
      JSON.stringify(challenges) !== JSON.stringify([expectedToolChallenge])) {
    violations.push(loginTriggerFinding(
      "oauth_login_tool_challenge",
      "Signed-out bos_get_context must return the exact canonical MCP authentication challenge that causes the host to render its native login action.",
      "tools/call"
    ));
  }

  let businessResponse;
  try {
    businessResponse = await postMcp(request, resourceUrl, 4, "tools/call", {
      name: "bos_login_contract_business_probe",
      arguments: {}
    });
    result.business_call_status = businessResponse.status;
  } catch (error) {
    violations.push(loginTriggerFinding(
      "oauth_login_business_call_request",
      `Signed-out business-tool denial probe failed: ${error.message}`,
      "business-tools/call"
    ));
    return result;
  }
  const businessChallenge = businessResponse.headers.get("www-authenticate");
  const expectedBusinessChallenge = expectedBosResourceChallenge(resourceUrl);
  if (businessResponse.status !== 401 || businessChallenge !== expectedBusinessChallenge) {
    violations.push(loginTriggerFinding(
      "oauth_login_business_call_denial",
      "Signed-out business tools must remain denied with HTTP 401 and the exact protected-resource challenge.",
      "business-tools/call"
    ));
  }

  result.status = violations.length ? "failed" : "passed";
  return result;
}

export function inspectGoogleAccountSelectorRedirect(
  location,
  oauthTarget = CANONICAL_OAUTH_TARGET
) {
  let redirect;
  let expected;
  try {
    redirect = new URL(location);
  } catch {
    return [finding(
      "oauth_provider_redirect",
      "The BOS authorization response must redirect to an absolute Google authorization URL."
    )];
  }
  try {
    expected = new URL(oauthTarget.identity_provider_authorization_endpoint);
  } catch {
    return [finding(
      "oauth_provider_contract",
      "The BOS product contract has no valid identity-provider authorization endpoint."
    )];
  }
  if (oauthTarget.identity_provider !== "google" ||
      oauthTarget.provider_account_selection_policy !== "ALWAYS_SELECT_ACCOUNT") {
    return [finding(
      "oauth_provider_contract",
      "The BOS product contract must select the Google identity provider and always require account selection."
    )];
  }
  if (redirect.protocol !== expected.protocol || redirect.host !== expected.host ||
      redirect.pathname !== expected.pathname || redirect.username || redirect.password ||
      redirect.hash) {
    return [finding(
      "oauth_provider_redirect",
      `BOS authorization must redirect to ${expected.origin}${expected.pathname}.`
    )];
  }

  const requiredPrompt = oauthTarget.provider_account_selection_prompt;
  const prompts = new Set(
    (redirect.searchParams.get("prompt") ?? "")
      .split(/\s+/)
      .filter(Boolean)
  );
  if (!prompts.has(requiredPrompt)) {
    return [finding(
      "oauth_account_selector",
      `Google authorization must require ${requiredPrompt} so every BOS user chooses the intended identity.`
    )];
  }
  return [];
}

export async function probeBosOAuthAuthorize({
  authorizeUrl,
  fetchImpl = fetch,
  canonicalResourceUrl = CANONICAL_RESOURCE_URL,
  oauthTarget = CANONICAL_OAUTH_TARGET,
  debug = false,
  debugWriter
}) {
  const request = createHttpDebugFetch(fetchImpl, {
    enabled: debug,
    writer: debugWriter,
    source: "bos-oauth-authorize"
  });
  const violations = inspectOAuthAuthorizeTarget(
    authorizeUrl,
    canonicalResourceUrl,
    oauthTarget
  );
  if (violations.length) return result(violations);

  let response;
  try {
    response = await request(authorizeUrl, {
      redirect: "manual",
      headers: { accept: "text/html" }
    });
  } catch (error) {
    return result([finding(
      "oauth_authorize_request",
      `BOS authorization request failed: ${error.message}`
    )]);
  }

  if ([302, 303, 307].includes(response.status)) {
    const location = response.headers.get("location");
    const redirectViolations = inspectGoogleAccountSelectorRedirect(location, oauthTarget);
    return result(redirectViolations, response.status);
  }

  if (response.status !== 200) {
    return result([finding(
      "oauth_authorize_status",
      `BOS authorization must return its secure login handoff; found HTTP ${response.status}.`
    )], response.status);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const cacheControl = response.headers.get("cache-control") ?? "";
  const pragma = response.headers.get("pragma") ?? "";
  const referrerPolicy = response.headers.get("referrer-policy") ?? "";
  if (!contentType.toLowerCase().includes("text/html") ||
      !cacheControl.toLowerCase().includes("no-store") ||
      pragma.toLowerCase() !== "no-cache" ||
      referrerPolicy.toLowerCase() !== "no-referrer") {
    return result([finding(
      "oauth_authorize_handoff_headers",
      "BOS authorization login handoff must be no-store HTML with no-referrer protection."
    )], response.status);
  }

  const html = await response.text();
  const loginLink = /id=["']mcp-oauth-login-link["'][^>]*href=["']([^"']+)["']/i.exec(
    html
  )?.[1];
  if (!/id=["']mcp-oauth-login["']/i.test(html) || !loginLink) {
    return result([finding(
      "oauth_authorize_handoff",
      "BOS authorization did not return the canonical login handoff surface."
    )], response.status);
  }

  let loginUrl;
  try {
    loginUrl = new URL(loginLink.replaceAll("&amp;", "&"), oauthTarget.authorization_endpoint);
  } catch {
    return result([finding(
      "oauth_authorize_handoff",
      "BOS authorization returned an invalid login handoff target."
    )], response.status);
  }
  const authorizationOrigin = new URL(oauthTarget.authorization_endpoint).origin;
  if (loginUrl.origin !== authorizationOrigin ||
      loginUrl.pathname !== "/api/v1/mcp/oauth/handoff/login" ||
      loginUrl.searchParams.getAll("agent_auth_transaction").length !== 1) {
    return result([finding(
      "oauth_authorize_handoff",
      "BOS authorization returned an off-contract login handoff target."
    )], response.status);
  }

  let loginResponse;
  try {
    loginResponse = await request(loginUrl.href, {
      redirect: "manual",
      headers: { accept: "text/html" }
    });
  } catch (error) {
    return result([finding(
      "oauth_login_handoff_request",
      `BOS login handoff failed: ${error.message}`
    )], response.status);
  }
  if (loginResponse.status !== 200) {
    return result([finding(
      "oauth_login_handoff_status",
      `BOS login handoff must return its Google continuation page; found HTTP ${loginResponse.status}.`
    )], loginResponse.status);
  }
  const loginHtml = await loginResponse.text();
  const googleAction = /<form[^>]*action=["']([^"']+)["'][^>]*>/i.exec(
    loginHtml
  )?.[1];
  const handoffValue = /<input[^>]*name=["']agent_auth_transaction["'][^>]*value=["']([^"']+)["'][^>]*>/i.exec(
    loginHtml
  )?.[1];
  const expectedHandoffValue = loginUrl.searchParams.get("agent_auth_transaction");
  if (!googleAction || !handoffValue || handoffValue !== expectedHandoffValue) {
    return result([finding(
      "oauth_login_handoff",
      "BOS login handoff did not preserve its opaque authorization transaction."
    )], loginResponse.status);
  }
  let providerStartUrl;
  try {
    providerStartUrl = new URL(googleAction, authorizationOrigin);
    providerStartUrl.searchParams.set("agent_auth_transaction", handoffValue);
  } catch {
    return result([finding(
      "oauth_login_handoff",
      "BOS login handoff returned an invalid Google continuation target."
    )], loginResponse.status);
  }
  if (providerStartUrl.origin !== authorizationOrigin ||
      providerStartUrl.pathname !== "/api/v1/mcp/oauth/handoff/google/start") {
    return result([finding(
      "oauth_login_handoff",
      "BOS login handoff returned an off-contract Google continuation target."
    )], loginResponse.status);
  }

  let providerResponse;
  try {
    providerResponse = await request(providerStartUrl.href, {
      redirect: "manual",
      headers: {
        accept: "text/html",
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "navigate"
      }
    });
  } catch (error) {
    return result([finding(
      "oauth_provider_request",
      `BOS provider handoff failed: ${error.message}`
    )], response.status);
  }
  if (![302, 303, 307].includes(providerResponse.status)) {
    return result([finding(
      "oauth_provider_status",
      `BOS provider handoff must redirect to Google; found HTTP ${providerResponse.status}.`
    )], providerResponse.status);
  }
  const redirectViolations = inspectGoogleAccountSelectorRedirect(
    providerResponse.headers.get("location"),
    oauthTarget
  );
  return result(redirectViolations, providerResponse.status);
}

function result(violations, httpStatus = null) {
  return {
    schema_version: "1",
    contract_id: "bos.oauth-account-selection",
    status: violations.length ? "failed" : "passed",
    resource_url: CANONICAL_RESOURCE_URL,
    http_status: httpStatus,
    violations
  };
}

function discoveryResult(
  violations,
  resourceUrl,
  httpStatus = null,
  challenge = null,
  errorCode = null
) {
  return {
    schema_version: "1",
    contract_id: "bos.oauth-protected-resource-discovery",
    status: violations.length ? "failed" : "passed",
    resource_url: resourceUrl,
    http_status: httpStatus,
    www_authenticate: challenge,
    error: errorCode,
    violations
  };
}
