import { inspectOAuthAuthorizeTarget } from "./single-bos-contract.mjs";
import { createHttpDebugFetch } from "./http-debug-log.mjs";
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

  if (![302, 303, 307].includes(response.status)) {
    return result([finding(
      "oauth_authorize_status",
      `BOS authorization must return a provider redirect; found HTTP ${response.status}.`
    )], response.status);
  }

  const location = response.headers.get("location");
  const redirectViolations = inspectGoogleAccountSelectorRedirect(location, oauthTarget);
  return result(redirectViolations, response.status);
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
