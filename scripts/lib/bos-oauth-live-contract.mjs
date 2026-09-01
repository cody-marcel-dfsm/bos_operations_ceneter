import { inspectOAuthAuthorizeTarget } from "./single-bos-contract.mjs";

export const CANONICAL_RESOURCE_URL = "https://dfsm.ai/mcp/apps/bos/platform";
export const CANONICAL_PROTECTED_RESOURCE_METADATA_URL =
  "https://dfsm.ai/.well-known/oauth-protected-resource/mcp/apps/bos/platform";
export const CANONICAL_RESOURCE_CHALLENGE =
  `Bearer resource_metadata="${CANONICAL_PROTECTED_RESOURCE_METADATA_URL}", scope="mcp:tools"`;

export function expectedBosResourceChallenge(resourceUrl) {
  const resource = new URL(resourceUrl);
  const metadata = new URL(
    `/.well-known/oauth-protected-resource${resource.pathname}`,
    resource.origin
  );
  return `Bearer resource_metadata="${metadata.href}", scope="mcp:tools"`;
}

function finding(code, message) {
  return { code, path: "oauth-authorize", message };
}

function discoveryFinding(code, message) {
  return { code, path: "mcp-resource-get", message };
}

export async function probeBosOAuthDiscovery({
  resourceUrl = CANONICAL_RESOURCE_URL,
  fetchImpl = fetch
} = {}) {
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
    response = await fetchImpl(resourceUrl, {
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
      `BOS resource discovery must return the canonical WWW-Authenticate challenge; found ${challenge ?? "no challenge"}.`
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
      `BOS resource discovery must identify authentication_required; found ${errorCode ?? "no structured error"}.`
    ));
  }

  return discoveryResult(
    violations,
    resourceUrl,
    response.status,
    challenge,
    errorCode
  );
}

export function inspectGoogleAccountSelectorRedirect(location) {
  let redirect;
  try {
    redirect = new URL(location);
  } catch {
    return [finding(
      "oauth_provider_redirect",
      "The BOS authorization response must redirect to an absolute Google authorization URL."
    )];
  }

  if (redirect.protocol !== "https:" || redirect.hostname !== "accounts.google.com") {
    return [finding(
      "oauth_provider_redirect",
      `BOS authorization must redirect to accounts.google.com; found ${redirect.origin}.`
    )];
  }

  const prompts = new Set(
    (redirect.searchParams.get("prompt") ?? "")
      .split(/\s+/)
      .filter(Boolean)
  );
  if (!prompts.has("select_account")) {
    return [finding(
      "oauth_account_selector",
      "Google authorization must require select_account so every BOS user chooses the intended identity."
    )];
  }
  return [];
}

export async function probeBosOAuthAuthorize({
  authorizeUrl,
  fetchImpl = fetch,
  canonicalResourceUrl = CANONICAL_RESOURCE_URL
}) {
  const violations = inspectOAuthAuthorizeTarget(
    authorizeUrl,
    canonicalResourceUrl
  );
  if (violations.length) return result(violations);

  let response;
  try {
    response = await fetchImpl(authorizeUrl, {
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
  const redirectViolations = inspectGoogleAccountSelectorRedirect(location);
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
