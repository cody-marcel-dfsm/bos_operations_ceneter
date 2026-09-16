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

const PREAUTHENTICATION_SURFACE_KEYS = new Set([
  "result", "tools", "inputSchema", "outputSchema", "resources", "prompts",
  "structuredContent"
]);

function exposesPreauthenticationSurface(value) {
  if (!value || typeof value !== "object") return false;
  for (const [key, nested] of Object.entries(value)) {
    if (PREAUTHENTICATION_SURFACE_KEYS.has(key)) return true;
    if (exposesPreauthenticationSurface(nested)) return true;
  }
  return false;
}

async function inspectMcpAuthenticationChallenge(response, resourceUrl) {
  const violations = [];
  if (response.status !== 401) {
    violations.push(`expected HTTP 401; found HTTP ${response.status}`);
  }
  if (response.headers.get("www-authenticate") !==
      expectedBosResourceChallenge(resourceUrl)) {
    violations.push("the WWW-Authenticate header is not the exact canonical protected-resource challenge");
  }
  const payload = await parseJsonResponse(response);
  if (exposesPreauthenticationSurface(payload)) {
    violations.push("the response exposed a pre-authentication tool, schema, resource, prompt, or result surface");
  }
  return violations;
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
    fail("oauth_stale_refresh_initialize_request", `Bridge-bearer MCP initialization failed: ${error.message}`, "initialize");
    return result;
  }
  const initializeViolations = await inspectMcpAuthenticationChallenge(
    initializeResponse, resourceUrl
  );
  if (initializeViolations.length) {
    fail(
      "oauth_stale_refresh_initialize_challenge",
      `The bridge bearer must receive the canonical authentication challenge during initialization: ${initializeViolations.join("; ")}.`,
      "initialize"
    );
  }

  let toolsResponse;
  try {
    toolsResponse = await postAuthorizedMcp(request, resourceUrl, 102, "tools/list", {}, accessToken);
    result.tools_list_status = toolsResponse.status;
  } catch (error) {
    fail("oauth_stale_refresh_tools_list_request", `Bridge-bearer tool discovery failed: ${error.message}`, "tools/list");
    return result;
  }
  const toolsViolations = await inspectMcpAuthenticationChallenge(
    toolsResponse, resourceUrl
  );
  if (toolsViolations.length) {
    fail(
      "oauth_stale_refresh_tool_surface",
      `The bridge bearer must receive the canonical authentication challenge and no tool or schema surface: ${toolsViolations.join("; ")}.`,
      "tools/list"
    );
  }

  let contextResponse;
  try {
    contextResponse = await postAuthorizedMcp(request, resourceUrl, 103, "tools/call", {
      name: "bos_get_context",
      arguments: {}
    }, accessToken);
    result.tools_call_status = contextResponse.status;
  } catch (error) {
    fail("oauth_stale_refresh_context_request", `Bridge-bearer context call failed: ${error.message}`, "tools/call");
    return result;
  }
  const contextViolations = await inspectMcpAuthenticationChallenge(
    contextResponse, resourceUrl
  );
  if (contextViolations.length) {
    fail(
      "oauth_stale_refresh_context_challenge",
      `The bridge bearer must not expose bos_get_context and must receive the canonical authentication challenge: ${contextViolations.join("; ")}.`,
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
    fail("oauth_stale_refresh_business_request", `Bridge-bearer business-tool probe failed: ${error.message}`, "business-tools/call");
    return result;
  }
  const businessViolations = await inspectMcpAuthenticationChallenge(
    businessResponse, resourceUrl
  );
  if (businessViolations.length) {
    fail(
      "oauth_stale_refresh_business_denial",
      `The bridge bearer must not authorize business access and must receive the canonical authentication challenge: ${businessViolations.join("; ")}.`,
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
    violations
  };

  const probes = [
    ["initialize_status", "initialize", 1, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "bos-login-contract", version: "1" }
    }],
    ["tools_list_status", "tools/list", 2, "tools/list", {}],
    ["tools_call_status", "tools/call", 3, "tools/call", {
      name: "bos_get_context",
      arguments: {}
    }],
    ["business_call_status", "business-tools/call", 4, "tools/call", {
      name: "bos_login_contract_business_probe",
      arguments: {}
    }]
  ];
  for (const [statusField, path, id, method, params] of probes) {
    let response;
    try {
      response = await postMcp(request, resourceUrl, id, method, params);
      result[statusField] = response.status;
    } catch (error) {
      violations.push(loginTriggerFinding(
        `oauth_login_${path.replaceAll("/", "_")}_request`,
        `Signed-out MCP ${path} probe failed: ${error.message}`,
        path
      ));
      return result;
    }
    const responseViolations = await inspectMcpAuthenticationChallenge(
      response, resourceUrl
    );
    if (responseViolations.length) {
      violations.push(loginTriggerFinding(
        `oauth_login_${path.replaceAll("/", "_")}_challenge`,
        `Signed-out MCP ${path} must return the canonical protected-resource challenge without exposing tools or schemas: ${responseViolations.join("; ")}.`,
        path
      ));
    }
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
  // The server supports a native link and the original GET form. Both must
  // preserve the same opaque transaction and stay on the BOS handoff endpoint.
  const googleLinks = [...loginHtml.matchAll(/<a\b[^>]*>/gi)]
    .filter(([tag]) => /\bid=["']mcp-oauth-google-login-link["']/i.test(tag));
  const googleAction = /<form[^>]*action=["']([^"']+)["'][^>]*>/i.exec(loginHtml)?.[1];
  const handoffValues = [...loginHtml.matchAll(
    /<input[^>]*name=["']agent_auth_transaction["'][^>]*value=["']([^"']+)["'][^>]*>/gi
  )];
  const expectedHandoffValue = loginUrl.searchParams.get("agent_auth_transaction");
  let providerStartUrl;
  try {
    if (googleLinks.length) {
      if (googleLinks.length !== 1) throw new Error("Ambiguous continuation");
      const href = /\bhref=["']([^"']+)["']/i.exec(googleLinks[0][0])?.[1];
      if (!href) throw new Error("Missing continuation");
      providerStartUrl = new URL(href.replaceAll("&amp;", "&"), authorizationOrigin);
    } else {
      if (!googleAction || handoffValues.length !== 1) throw new Error("Missing continuation");
      providerStartUrl = new URL(googleAction.replaceAll("&amp;", "&"), authorizationOrigin);
      // A pre-existing transaction would produce ambiguous GET form semantics.
      if (providerStartUrl.searchParams.has("agent_auth_transaction")) throw new Error("Ambiguous transaction");
      providerStartUrl.searchParams.set("agent_auth_transaction", handoffValues[0][1]);
    }
  } catch {
    return result([finding(
      "oauth_login_handoff",
      "BOS login handoff returned an invalid Google continuation target."
    )], loginResponse.status);
  }
  if (!expectedHandoffValue ||
      providerStartUrl.searchParams.getAll("agent_auth_transaction").length !== 1 ||
      providerStartUrl.searchParams.get("agent_auth_transaction") !== expectedHandoffValue ||
      providerStartUrl.username || providerStartUrl.password || providerStartUrl.hash ||
      providerStartUrl.origin !== authorizationOrigin ||
      providerStartUrl.pathname !== "/api/v1/mcp/oauth/handoff/google/start") {
    return result([finding(
      "oauth_login_handoff",
      "BOS login handoff returned an off-contract Google continuation target or transaction."
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
