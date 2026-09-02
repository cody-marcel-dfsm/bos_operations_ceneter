import { createHttpDebugFetch } from "./http-debug-log.mjs";
import {
  CANONICAL_RESOURCE_URL
} from "./bos-oauth-live-contract.mjs";

export const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
export const DEFAULT_AUTH_TOOL = "bos_get_context";

function finding(code, path, message) {
  return { code, path, message };
}

function result(violations, evidence = {}) {
  return {
    schema_version: "1",
    contract_id: "bos.oauth-tool-authentication",
    status: violations.length ? "failed" : "passed",
    resource_url: evidence.resourceUrl ?? CANONICAL_RESOURCE_URL,
    tool_name: evidence.toolName ?? DEFAULT_AUTH_TOOL,
    protocol_version: evidence.protocolVersion ?? null,
    descriptor_oauth_scopes: evidence.scopes ?? [],
    challenge: evidence.challenge ?? null,
    violations
  };
}

const allowedOAuthErrors = new Set(["invalid_token", "insufficient_scope"]);
const genericAuthenticationDescription =
  /^(?:(?:authentication|authorization|login|sign[- ]?in) (?:is )?required(?: to continue)?|please (?:authenticate|authorize|log in|sign in)(?: to continue)?)\.?$/i;

function rpcHeaders(protocolVersion, sessionId) {
  return {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    ...(protocolVersion ? { "MCP-Protocol-Version": protocolVersion } : {}),
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {})
  };
}

async function readMatchingRpc(response, expectedId) {
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const payloads = [];

  if (contentType.includes("text/event-stream")) {
    for (const event of text.split(/\r?\n\r?\n/)) {
      const data = event
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n");
      if (!data) continue;
      try {
        payloads.push(JSON.parse(data));
      } catch {
        // A structured violation below reports the missing matching response.
      }
    }
  } else {
    try {
      payloads.push(JSON.parse(text));
    } catch {
      // A structured violation below reports the missing matching response.
    }
  }

  return payloads.find((payload) => payload?.id === expectedId) ?? null;
}

function oauthScheme(tool) {
  const schemes = Array.isArray(tool?.securitySchemes)
    ? tool.securitySchemes
    : [];
  return schemes.find((scheme) => scheme?.type === "oauth2") ?? null;
}

function declaredSecuritySchemes(tool) {
  return Array.isArray(tool?.securitySchemes) ? tool.securitySchemes : [];
}

function challengeValues(payload) {
  const value = payload?.result?._meta?.["mcp/www_authenticate"];
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  return typeof value === "string" ? [value] : [];
}

function parseExpectedChallenge(challenge, protectedResourceMetadataUrl) {
  const match = /^Bearer\s+resource_metadata="([^"\\]+)",\s*error="([^"\\]+)",\s*error_description="([^"\\]+)"$/.exec(
    challenge
  );
  if (!match) return null;
  const [, resourceMetadata, error, errorDescription] = match;
  if (resourceMetadata !== protectedResourceMetadataUrl ||
      !allowedOAuthErrors.has(error) ||
      !genericAuthenticationDescription.test(errorDescription)) {
    return null;
  }
  return { resourceMetadata, error };
}

function sanitizedChallengeEvidence(parsedChallenge) {
  if (!parsedChallenge) return null;
  return {
    scheme: "Bearer",
    resource_metadata: parsedChallenge.resourceMetadata,
    error: parsedChallenge.error,
    error_description: "[VALID_GENERIC_AUTHENTICATION_DESCRIPTION]"
  };
}

function expectedProtectedResourceMetadataUrl(resourceUrl) {
  const resource = new URL(resourceUrl);
  return new URL(
    `/.well-known/oauth-protected-resource${resource.pathname}`,
    resource.origin
  ).href;
}

function isAuthenticationOnlyContent(content) {
  if (content == null) return true;
  if (!Array.isArray(content)) return false;
  return content.every((item) => {
    if (item?.type !== "text" || typeof item.text !== "string") return false;
    const text = item.text.trim();
    return /^(?:authentication|authorization|login|sign[- ]?in) (?:is )?required(?: to continue)?\.?$/i.test(text) ||
      /^(?:authentication|authorization) (?:is )?required: (?:no|missing|invalid|expired) (?:valid )?(?:access )?token(?: (?:was )?provided)?\.?$/i.test(text) ||
      /^please (?:authenticate|authorize|log in|sign in)(?: to continue)?\.?$/i.test(text);
  });
}

function hasBusinessPayload(resultPayload, protectedResourceMetadataUrl) {
  const toolResult = resultPayload?.result;
  if (!toolResult || typeof toolResult !== "object" || Array.isArray(toolResult)) {
    return false;
  }
  const structured = toolResult.structuredContent;
  const hasStructuredData = structured != null && (
    typeof structured !== "object" ||
    Array.isArray(structured) ||
    Object.keys(structured).length > 0
  );
  const unexpectedFields = Object.keys(toolResult).filter((key) =>
    !["content", "structuredContent", "_meta", "isError"].includes(key)
  );
  const metadata = toolResult._meta;
  const unexpectedMetadataFields = metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata)
    ? Object.keys(metadata).filter((key) => key !== "mcp/www_authenticate")
    : metadata == null
      ? []
      : ["invalid-metadata"];
  const authenticationMetadata = metadata?.["mcp/www_authenticate"];
  const invalidAuthenticationMetadata = Array.isArray(authenticationMetadata)
    ? authenticationMetadata.some((item) =>
      typeof item !== "string" ||
      parseExpectedChallenge(item, protectedResourceMetadataUrl) == null
    )
    : authenticationMetadata != null && (
      typeof authenticationMetadata !== "string" ||
      parseExpectedChallenge(authenticationMetadata, protectedResourceMetadataUrl) == null
    );
  return hasStructuredData ||
    !isAuthenticationOnlyContent(toolResult.content) ||
    unexpectedFields.length > 0 ||
    unexpectedMetadataFields.length > 0 ||
    invalidAuthenticationMetadata;
}

export async function probeBosToolAuthentication({
  resourceUrl = CANONICAL_RESOURCE_URL,
  protectedResourceMetadataUrl,
  toolName = DEFAULT_AUTH_TOOL,
  toolArguments = {},
  protocolVersion = DEFAULT_PROTOCOL_VERSION,
  fetchImpl = fetch,
  debug = false,
  debugWriter
} = {}) {
  const violations = [];
  const evidence = { resourceUrl, toolName, protocolVersion, scopes: [], challenge: null };
  let expectedMetadataUrl = protectedResourceMetadataUrl;
  if (expectedMetadataUrl == null) {
    try {
      expectedMetadataUrl = expectedProtectedResourceMetadataUrl(resourceUrl);
    } catch (error) {
      return result([finding(
        "oauth_tool_resource_url",
        "resource-url",
        `BOS MCP resource URL is invalid: ${error.message}`
      )], evidence);
    }
  }
  const request = createHttpDebugFetch(fetchImpl, {
    enabled: debug,
    writer: debugWriter,
    source: "bos-oauth-tool-authentication",
    includeHeaders: false,
    includeBodies: false
  });

  let initialize;
  try {
    initialize = await request(resourceUrl, {
      method: "POST",
      headers: rpcHeaders(null, null),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion,
          capabilities: {},
          clientInfo: { name: "bos-operations-center-auth-probe", version: "1" }
        }
      })
    });
  } catch (error) {
    return result([finding(
      "oauth_tool_initialize_request",
      "initialize",
      `BOS MCP initialize failed: ${error.message}`
    )], evidence);
  }

  if (initialize.status !== 200) {
    return result([finding(
      "oauth_tool_initialize_status",
      "initialize",
      `Tool-triggered OAuth requires MCP initialize before consent; found HTTP ${initialize.status}.`
    )], evidence);
  }

  let initializePayload;
  try {
    initializePayload = await readMatchingRpc(initialize, 1);
  } catch (error) {
    return result([finding(
      "oauth_tool_initialize_response",
      "initialize",
      `MCP initialize response could not be read: ${error.message}`
    )], evidence);
  }
  const negotiatedVersion = initializePayload?.result?.protocolVersion;
  if (!negotiatedVersion) {
    return result([finding(
      "oauth_tool_initialize_response",
      "initialize",
      "MCP initialize returned no matching JSON-RPC result with protocolVersion."
    )], evidence);
  }
  evidence.protocolVersion = negotiatedVersion;
  const sessionId = initialize.headers.get("mcp-session-id");

  let initialized;
  try {
    initialized = await request(resourceUrl, {
      method: "POST",
      headers: rpcHeaders(negotiatedVersion, sessionId),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {}
      })
    });
  } catch (error) {
    return result([finding(
      "oauth_tool_initialized_request",
      "notifications/initialized",
      `MCP initialized notification failed: ${error.message}`
    )], evidence);
  }
  if (initialized.status !== 202) {
    violations.push(finding(
      "oauth_tool_initialized_status",
      "notifications/initialized",
      `MCP initialized notification must return HTTP 202; found HTTP ${initialized.status}.`
    ));
  }

  let toolsList;
  try {
    toolsList = await request(resourceUrl, {
      method: "POST",
      headers: rpcHeaders(negotiatedVersion, sessionId),
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
    });
  } catch (error) {
    violations.push(finding(
      "oauth_tool_list_request",
      "tools/list",
      `Pre-consent tools/list failed: ${error.message}`
    ));
    return result(violations, evidence);
  }
  if (toolsList.status !== 200) {
    violations.push(finding(
      "oauth_tool_list_status",
      "tools/list",
      `Pre-consent tools/list must expose OAuth-tagged descriptors; found HTTP ${toolsList.status}.`
    ));
    return result(violations, evidence);
  }

  let toolsPayload;
  try {
    toolsPayload = await readMatchingRpc(toolsList, 2);
  } catch (error) {
    violations.push(finding(
      "oauth_tool_list_response",
      "tools/list",
      `Pre-consent tools/list response could not be read: ${error.message}`
    ));
    return result(violations, evidence);
  }
  const tools = toolsPayload?.result?.tools;
  const tool = Array.isArray(tools)
    ? tools.find((candidate) => candidate?.name === toolName)
    : null;
  if (!tool) {
    violations.push(finding(
      "oauth_tool_descriptor_missing",
      "tools/list",
      `Pre-consent tools/list must include ${toolName}.`
    ));
    return result(violations, evidence);
  }

  const inputSchema = tool.inputSchema;
  const validInputSchema = inputSchema !== null &&
    typeof inputSchema === "object" &&
    !Array.isArray(inputSchema) &&
    inputSchema.type === "object";
  if (!validInputSchema) {
    violations.push(finding(
      "oauth_tool_input_schema",
      `tools/list:${toolName}:inputSchema`,
      `${toolName} must expose an object inputSchema before consent.`
    ));
  }

  const schemes = declaredSecuritySchemes(tool);
  const scheme = oauthScheme(tool);
  const scopes = schemes
    .filter((candidate) => candidate?.type === "oauth2" && Array.isArray(candidate.scopes))
    .flatMap((candidate) => candidate.scopes);
  evidence.scopes = scopes;
  const validSchemes = schemes.length > 0 && schemes.every((candidate) =>
    candidate?.type === "oauth2" &&
    Array.isArray(candidate.scopes) &&
    candidate.scopes.length > 0 &&
    candidate.scopes.every((scope) =>
      typeof scope === "string" && scope.trim().length > 0
    )
  );
  if (!scheme || !validSchemes) {
    violations.push(finding(
      "oauth_tool_security_scheme",
      `tools/list:${toolName}`,
      `${toolName} must declare a per-tool oauth2 securitySchemes entry with scopes.`
    ));
  }

  let toolCall;
  try {
    toolCall = await request(resourceUrl, {
      method: "POST",
      headers: rpcHeaders(negotiatedVersion, sessionId),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: toolName, arguments: toolArguments }
      })
    });
  } catch (error) {
    violations.push(finding(
      "oauth_tool_call_request",
      `tools/call:${toolName}`,
      `Signed-out tools/call failed: ${error.message}`
    ));
    return result(violations, evidence);
  }
  if (toolCall.status !== 200) {
    violations.push(finding(
      "oauth_tool_call_status",
      `tools/call:${toolName}`,
      `Signed-out tools/call must return its OAuth challenge as a JSON-RPC result; found HTTP ${toolCall.status}.`
    ));
    return result(violations, evidence);
  }

  let callPayload;
  try {
    callPayload = await readMatchingRpc(toolCall, 3);
  } catch (error) {
    violations.push(finding(
      "oauth_tool_call_response",
      `tools/call:${toolName}`,
      `Signed-out tools/call response could not be read: ${error.message}`
    ));
    return result(violations, evidence);
  }
  if (!callPayload?.result || callPayload.result.isError !== true) {
    violations.push(finding(
      "oauth_tool_error_result",
      `tools/call:${toolName}`,
      "Signed-out tools/call must return an isError result."
    ));
  }

  const challenges = challengeValues(callPayload);
  const parsedChallenge = challenges
    .map((candidate) => parseExpectedChallenge(candidate, expectedMetadataUrl))
    .find(Boolean) ?? null;
  evidence.challenge = sanitizedChallengeEvidence(parsedChallenge);
  if (!parsedChallenge) {
    violations.push(finding(
      "oauth_tool_challenge",
      `tools/call:${toolName}`,
      "Signed-out tools/call must return _meta[mcp/www_authenticate] with canonical resource_metadata, error, and error_description."
    ));
  }
  if (hasBusinessPayload(callPayload, expectedMetadataUrl)) {
    violations.push(finding(
      "oauth_tool_business_payload",
      `tools/call:${toolName}`,
      "Signed-out authentication challenge must contain only a generic authentication message and no business data."
    ));
  }

  return result(violations, evidence);
}
