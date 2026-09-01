import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_RESOURCE_CHALLENGE,
  expectedBosResourceChallenge,
  inspectGoogleAccountSelectorRedirect,
  probeBosOAuthDiscovery,
  probeBosOAuthAuthorize
} from "../scripts/lib/bos-oauth-live-contract.mjs";

const resource = "https://dfsm.ai/mcp/apps/bos/platform";

function authorizeUrl() {
  const authorize = new URL("https://dfsm.ai/api/v1/mcp/oauth/authorize");
  authorize.searchParams.set("resource", resource);
  return authorize.href;
}

function authenticationRequiredResponse({
  status = 401,
  challenge = CANONICAL_RESOURCE_CHALLENGE,
  error = "authentication_required"
} = {}) {
  return new Response(JSON.stringify({ detail: { error } }), {
    status,
    headers: {
      "content-type": "application/json",
      "www-authenticate": challenge
    }
  });
}

test("BOS OAuth discovery accepts the canonical signed-out challenge", async () => {
  const result = await probeBosOAuthDiscovery({
    fetchImpl: async () => authenticationRequiredResponse()
  });

  assert.equal(result.status, "passed");
  assert.equal(result.http_status, 401);
  assert.equal(result.www_authenticate, CANONICAL_RESOURCE_CHALLENGE);
  assert.equal(result.error, "authentication_required");
  assert.deepEqual(result.violations, []);
});

test("BOS OAuth discovery rejects a method-only response", async () => {
  const result = await probeBosOAuthDiscovery({
    fetchImpl: async () => new Response(null, {
      status: 405,
      headers: { allow: "POST" }
    })
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(
    result.violations.map(({ code }) => code),
    ["oauth_resource_status", "oauth_resource_challenge", "oauth_resource_error"]
  );
});

test("BOS OAuth discovery rejects a noncanonical resource challenge", async () => {
  const result = await probeBosOAuthDiscovery({
    fetchImpl: async () => authenticationRequiredResponse({
      challenge: 'Bearer resource_metadata="https://dfsm.ai/.well-known/oauth-protected-resource"'
    })
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(
    result.violations.map(({ code }) => code),
    ["oauth_resource_challenge"]
  );
});

test("BOS OAuth discovery validates and reports the deployed candidate resource", async () => {
  const resourceUrl = "https://candidate.example/mcp/apps/bos/platform";
  const result = await probeBosOAuthDiscovery({
    resourceUrl,
    fetchImpl: async () => authenticationRequiredResponse({
      challenge: expectedBosResourceChallenge(resourceUrl)
    })
  });

  assert.equal(result.status, "passed");
  assert.equal(result.resource_url, resourceUrl);
  assert.equal(
    result.www_authenticate,
    'Bearer resource_metadata="https://candidate.example/.well-known/oauth-protected-resource/mcp/apps/bos/platform", scope="mcp:tools"'
  );
});

test("BOS OAuth live contract accepts a Google account-selector redirect", async () => {
  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.searchParams.set("prompt", "consent select_account");
  const result = await probeBosOAuthAuthorize({
    authorizeUrl: authorizeUrl(),
    fetchImpl: async () => new Response(null, {
      status: 302,
      headers: { location: google.href }
    })
  });
  assert.equal(result.status, "passed");
  assert.equal(result.http_status, 302);
  assert.deepEqual(result.violations, []);
});

test("BOS OAuth live contract rejects an authorization server exception", async () => {
  const result = await probeBosOAuthAuthorize({
    authorizeUrl: authorizeUrl(),
    fetchImpl: async () => new Response("Internal Server Error", { status: 500 })
  });
  assert.equal(result.status, "failed");
  assert.deepEqual(
    result.violations.map(({ code }) => code),
    ["oauth_authorize_status"]
  );
});

test("BOS OAuth live contract requires explicit Google account selection", () => {
  const redirect = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  redirect.searchParams.set("prompt", "consent");
  assert.deepEqual(
    inspectGoogleAccountSelectorRedirect(redirect.href).map(({ code }) => code),
    ["oauth_account_selector"]
  );
});
