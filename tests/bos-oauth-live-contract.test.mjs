import assert from "node:assert/strict";
import test from "node:test";

import {
  inspectGoogleAccountSelectorRedirect,
  probeBosOAuthAuthorize
} from "../scripts/lib/bos-oauth-live-contract.mjs";

const resource = "https://dfsm.ai/mcp/apps/bos/platform";

function authorizeUrl() {
  const authorize = new URL("https://dfsm.ai/api/v1/mcp/oauth/authorize");
  authorize.searchParams.set("resource", resource);
  return authorize.href;
}

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
