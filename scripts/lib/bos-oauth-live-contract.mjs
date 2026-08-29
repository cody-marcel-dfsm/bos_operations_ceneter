import { inspectOAuthAuthorizeTarget } from "./single-bos-contract.mjs";

const CANONICAL_RESOURCE_URL = "https://dfsm.ai/mcp/apps/bos/platform";

function finding(code, message) {
  return { code, path: "oauth-authorize", message };
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
