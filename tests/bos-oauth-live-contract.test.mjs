import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_AUTHORIZATION_ENDPOINT,
  CANONICAL_IDENTITY_PROVIDER_AUTHORIZATION_ENDPOINT,
  CANONICAL_OAUTH_TARGET,
  CANONICAL_RESOURCE_CHALLENGE,
  expectedBosResourceChallenge,
  inspectGoogleAccountSelectorRedirect,
  probeBosOAuthDiscovery,
  probeBosOAuthAuthorize
} from "../scripts/lib/bos-oauth-live-contract.mjs";
import {
  createHttpDebugFetch,
  createProtocolDebugLogger,
  redactDebugValue
} from "../scripts/lib/http-debug-log.mjs";
import { readJson, root } from "../scripts/lib/package-model.mjs";

const bosProduct = await readJson(`${root}/products/bos/product.json`);
const resource = bosProduct.mcp_resource_url;

test("HTTP debug logging pairs every request with a redacted response", async () => {
  const lines = [];
  const debugFetch = createHttpDebugFetch(async (_url, init) => new Response(
    JSON.stringify({ access_token: "response-secret", method: JSON.parse(init.body).method }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "set-cookie": "session=response-secret",
        "www-authenticate": `Bearer resource_metadata="${resource}", scope="mcp:tools"`
      }
    }
  ), {
    writer: (line) => lines.push(JSON.parse(line)),
    source: "test-http"
  });

  await debugFetch(
    "https://dfsm.ai/mcp/apps/bos/platform?state=request-secret&resource=https%3A%2F%2Fdfsm.ai%2Fmcp%2Fapps%2Fbos%2Fplatform",
    {
      method: "POST",
      headers: {
        authorization: "Bearer request-secret",
        cookie: "session=request-secret",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        access_token: "request-secret"
      })
    }
  );

  assert.deepEqual(lines.map(({ event }) => event), [
    "http.request",
    "http.response"
  ]);
  assert.equal(lines[0].request_id, lines[1].request_id);
  assert.equal(lines[0].headers.authorization, "[REDACTED]");
  assert.equal(lines[0].headers.cookie, "[REDACTED]");
  assert.equal(lines[0].body.value.access_token, "[REDACTED]");
  assert.equal(lines[0].body.value.method, "initialize");
  assert.match(lines[0].url, /state=%5BREDACTED%5D/);
  assert.match(lines[0].url, /resource=https%3A%2F%2Fdfsm\.ai/);
  assert.equal(lines[1].headers["set-cookie"], "[REDACTED]");
  assert.equal(lines[1].headers["www-authenticate"], "[REDACTED]");
  assert.equal(lines[1].body.value.access_token, "[REDACTED]");
  assert.doesNotMatch(JSON.stringify(lines), /request-secret|response-secret/);
});

test("HTTP debug logging records request failures without exposing credentials", async () => {
  const lines = [];
  const debugFetch = createHttpDebugFetch(async () => {
    throw new Error("Bearer failure-secret");
  }, {
    writer: (line) => lines.push(JSON.parse(line)),
    source: "test-http-error"
  });

  await assert.rejects(
    debugFetch("https://dfsm.ai/mcp", {
      headers: { authorization: "Bearer request-secret" }
    }),
    (error) => {
      assert.match(error.message, /Bearer \[REDACTED\]/);
      assert.doesNotMatch(error.message, /failure-secret/);
      return true;
    }
  );
  assert.deepEqual(lines.map(({ event }) => event), ["http.request", "http.error"]);
  assert.doesNotMatch(JSON.stringify(lines), /request-secret|failure-secret/);
});

test("BOS OAuth discovery never emits raw transport failure data", async () => {
  const privateValues = /transport-secret|account-secret/;
  const result = await probeBosOAuthDiscovery({
    fetchImpl: async () => {
      throw new Error(
        "authorization=Bearer transport-secret account_id=account-secret"
      );
    }
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(result.violations.map(({ code }) => code), [
    "oauth_resource_request"
  ]);
  assert.match(result.violations[0].message, /\[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(result), privateValues);
});

test("HTTP debug logging never records HTML challenge bodies", async () => {
  const lines = [];
  const debugFetch = createHttpDebugFetch(async () => new Response(
    '<html><script>challenge_token="challenge-secret"</script></html>',
    { status: 403, headers: { "content-type": "text/html; charset=UTF-8" } }
  ), {
    writer: (line) => lines.push(JSON.parse(line)),
    source: "test-html-challenge"
  });

  await debugFetch("https://chatgpt.com/backend-api/aip/connectors/test");

  assert.deepEqual(lines.map(({ event }) => event), [
    "http.request",
    "http.response"
  ]);
  assert.equal(
    lines[1].body.value,
    "[REDACTED_NON_STRUCTURED_BODY]"
  );
  assert.equal(lines[1].body.content_type, "text/html; charset=UTF-8");
  assert.doesNotMatch(JSON.stringify(lines), /challenge-secret/);
});

test("HTTP debug logging omits server-controlled status text", async () => {
  const lines = [];
  const debugFetch = createHttpDebugFetch(async () => new Response(null, {
    status: 401,
    statusText: "Bearer response-secret"
  }), {
    writer: (line) => lines.push(JSON.parse(line)),
    source: "test-status-text",
    includeHeaders: false,
    includeBodies: false
  });

  await debugFetch("https://dfsm.ai/mcp");

  assert.equal(lines[1].status, 401);
  assert.equal(lines[1].status_text, undefined);
  assert.doesNotMatch(JSON.stringify(lines), /response-secret/);
});

test("HTTP debug logging redacts oversized JSON before bounding it", async () => {
  const lines = [];
  const debugFetch = createHttpDebugFetch(async () => new Response(
    JSON.stringify({
      account_id: "account-secret",
      organization_id: "organization-secret",
      access_token: "token-secret",
      nested: { refresh_token: "refresh-secret" },
      padding: "x".repeat(20_000)
    }),
    { headers: { "content-type": "application/json" } }
  ), {
    writer: (line) => lines.push(JSON.parse(line)),
    source: "test-oversized-json"
  });

  await debugFetch("https://chatgpt.com/backend-api/aip/connectors/test");

  assert.equal(lines[1].body.truncated, true);
  assert.equal(typeof lines[1].body.value, "string");
  assert.match(lines[1].body.value, /\[REDACTED\]/);
  assert.doesNotMatch(
    JSON.stringify(lines),
    /account-secret|organization-secret|token-secret|refresh-secret/
  );
});

test("HTTP debug logging suppresses malformed structured bodies", async () => {
  const lines = [];
  const debugFetch = createHttpDebugFetch(async () => new Response(
    '{"account_id":"account-secret",',
    { headers: { "content-type": "application/json" } }
  ), {
    writer: (line) => lines.push(JSON.parse(line)),
    source: "test-malformed-json"
  });

  await debugFetch("https://chatgpt.com/backend-api/aip/connectors/test");

  assert.equal(
    lines[1].body.value,
    "[REDACTED_UNPARSEABLE_STRUCTURED_BODY]"
  );
  assert.doesNotMatch(JSON.stringify(lines), /account-secret/);
});

test("HTTP debug logging redacts account and organization identifiers in free-form diagnostics", () => {
  for (const diagnostic of [
    "account_id=account-secret organization_id=organization-secret",
    "account-id: account-secret; organization-id: organization-secret",
    "ChatGPT-Account-Id: account-secret",
    "ChatGPT account id = account-secret",
    "cookie=session-secret session=session-secret client_secret=client-secret",
    "authorization: opaque-secret credential=credential-secret"
  ]) {
    const redacted = redactDebugValue(diagnostic);
    assert.match(redacted, /\[REDACTED\]/);
    assert.doesNotMatch(
      redacted,
      /account-secret|organization-secret|session-secret|client-secret|opaque-secret|credential-secret/
    );
  }
});

test("free-form diagnostics redact complete Basic, Digest, and cookie tails", () => {
  const privateValues = /basic-secret|basic-tail|digest-user|digest-nonce|digest-tail|cookie-secret|cookie-tail/;
  for (const diagnostic of [
    "Basic basic-secret basic-tail",
    'authorization=Digest username="digest-user", realm="bos"\n nonce="digest-nonce" digest-tail',
    "cookie=session=cookie-secret;\n preference=cookie-tail",
    "set-cookie: session=cookie-secret; HttpOnly; SameSite=Lax"
  ]) {
    const redacted = redactDebugValue(diagnostic);
    assert.match(redacted, /\[REDACTED\]/);
    assert.doesNotMatch(redacted, privateValues);
  }
});

test("protocol diagnostics bound the final serialized event after oversized summaries", () => {
  const lines = [];
  const logger = createProtocolDebugLogger({
    writer: (line) => lines.push(line),
    source: "test-protocol"
  });

  logger.write({
    event: "protocol.response",
    request_id: "test-protocol-1",
    method: "plugin/read",
    summary: {
      apps: [{ id: "bos", name: "x".repeat(20_000) }]
    },
    payload: { ok: true }
  });

  assert.equal(lines.length, 1);
  assert(lines[0].length <= 4_096, lines[0].length);
  const event = JSON.parse(lines[0]);
  assert.equal(event.event, "protocol.response");
  assert.equal(event.request_id, "test-protocol-1");
  assert.equal(event.method, "plugin/read");
  assert.equal(event.summary, undefined);
  assert.equal(event.payload.truncated, true);
  assert(event.payload.original_characters > 20_000);
});

function authorizeUrl() {
  const authorize = new URL(CANONICAL_AUTHORIZATION_ENDPOINT);
  authorize.searchParams.set("resource", resource);
  return authorize.href;
}

test("BOS OAuth live targets derive from the product source", () => {
  assert.deepEqual(CANONICAL_OAUTH_TARGET, bosProduct.oauth);
  assert.equal(
    CANONICAL_AUTHORIZATION_ENDPOINT,
    bosProduct.oauth.authorization_endpoint
  );
  assert.equal(
    CANONICAL_IDENTITY_PROVIDER_AUTHORIZATION_ENDPOINT,
    bosProduct.oauth.identity_provider_authorization_endpoint
  );
});

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

function discoveryFetch(resourceUrl = resource, overrides = {}) {
  const protectedResourceMetadataUrl = new URL(
    `/.well-known/oauth-protected-resource${new URL(resourceUrl).pathname}`,
    resourceUrl
  ).href;
  const authorizationServerMetadataUrl = new URL(
    "/.well-known/oauth-authorization-server",
    bosProduct.oauth.authorization_server_issuer
  ).href;
  return async (url) => {
    if (url === resourceUrl) {
      return authenticationRequiredResponse({
        challenge: expectedBosResourceChallenge(resourceUrl)
      });
    }
    if (url === protectedResourceMetadataUrl) {
      return Response.json({
        resource: resourceUrl,
        authorization_servers: [bosProduct.oauth.authorization_server_issuer],
        ...overrides.protectedResource
      });
    }
    if (url === authorizationServerMetadataUrl) {
      return Response.json({
        issuer: bosProduct.oauth.authorization_server_issuer,
        authorization_endpoint: bosProduct.oauth.authorization_endpoint,
        ...overrides.authorizationServer
      });
    }
    throw new Error(`Unexpected discovery URL: ${url}`);
  };
}

test("BOS OAuth discovery accepts the canonical signed-out challenge", async () => {
  const result = await probeBosOAuthDiscovery({
    fetchImpl: discoveryFetch()
  });

  assert.equal(result.status, "passed");
  assert.equal(result.http_status, 401);
  assert.equal(result.www_authenticate, CANONICAL_RESOURCE_CHALLENGE);
  assert.equal(result.error, "authentication_required");
  assert.equal(
    result.authorization_server_issuer,
    bosProduct.oauth.authorization_server_issuer
  );
  assert.equal(
    result.authorization_endpoint,
    bosProduct.oauth.authorization_endpoint
  );
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
  assert.equal(result.www_authenticate, null);
});

test("BOS OAuth discovery never reflects an untrusted challenge or error", async () => {
  const privateValues = /challenge-secret|account-secret/;
  const result = await probeBosOAuthDiscovery({
    fetchImpl: async () => authenticationRequiredResponse({
      challenge: 'Digest username="challenge-secret", nonce="account-secret"',
      error: "account-secret"
    })
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(result.violations.map(({ code }) => code), [
    "oauth_resource_challenge",
    "oauth_resource_error"
  ]);
  assert.equal(result.www_authenticate, null);
  assert.equal(result.error, null);
  assert.doesNotMatch(JSON.stringify(result), privateValues);
});

test("BOS OAuth discovery validates and reports the deployed candidate resource", async () => {
  const resourceUrl = "https://candidate.example/mcp/apps/bos/platform";
  const result = await probeBosOAuthDiscovery({
    resourceUrl,
    fetchImpl: discoveryFetch(resourceUrl)
  });

  assert.equal(result.status, "passed");
  assert.equal(result.resource_url, resourceUrl);
  assert.equal(
    result.www_authenticate,
    'Bearer resource_metadata="https://candidate.example/.well-known/oauth-protected-resource/mcp/apps/bos/platform", scope="mcp:tools"'
  );
});

test("BOS OAuth discovery rejects a wrong authorization endpoint", async () => {
  const result = await probeBosOAuthDiscovery({
    fetchImpl: discoveryFetch(resource, {
      authorizationServer: {
        authorization_endpoint: "https://auth.openai.com/about-you"
      }
    })
  });

  assert.equal(result.status, "failed");
  assert.deepEqual(
    result.violations.map(({ code }) => code),
    ["oauth_authorization_endpoint"]
  );
});

test("BOS OAuth live contract accepts a Google account-selector redirect", async () => {
  const google = new URL(CANONICAL_IDENTITY_PROVIDER_AUTHORIZATION_ENDPOINT);
  google.searchParams.set(
    "prompt",
    `consent ${CANONICAL_OAUTH_TARGET.provider_account_selection_prompt}`
  );
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
  const redirect = new URL(CANONICAL_IDENTITY_PROVIDER_AUTHORIZATION_ENDPOINT);
  redirect.searchParams.set("prompt", "consent");
  assert.deepEqual(
    inspectGoogleAccountSelectorRedirect(redirect.href).map(({ code }) => code),
    ["oauth_account_selector"]
  );
});

test("BOS OAuth live contract rejects off-contract provider endpoints", () => {
  const valid = new URL(CANONICAL_IDENTITY_PROVIDER_AUTHORIZATION_ENDPOINT);
  valid.searchParams.set(
    "prompt",
    CANONICAL_OAUTH_TARGET.provider_account_selection_prompt
  );
  for (const candidate of [
    new URL(valid.href.replace("https:", "http:")),
    new URL(valid.href.replace(valid.host, "wrong.example")),
    new URL(valid.href.replace(valid.pathname, "/wrong/oauth")),
    new URL(`${valid.href}#fragment`)
  ]) {
    assert.deepEqual(
      inspectGoogleAccountSelectorRedirect(candidate.href).map(({ code }) => code),
      ["oauth_provider_redirect"],
      candidate.href
    );
  }
});

test("BOS OAuth live contract rejects a provider contract other than product Google", () => {
  const redirect = new URL(CANONICAL_IDENTITY_PROVIDER_AUTHORIZATION_ENDPOINT);
  redirect.searchParams.set(
    "prompt",
    CANONICAL_OAUTH_TARGET.provider_account_selection_prompt
  );
  assert.deepEqual(
    inspectGoogleAccountSelectorRedirect(redirect.href, {
      ...CANONICAL_OAUTH_TARGET,
      identity_provider: "other"
    }).map(({ code }) => code),
    ["oauth_provider_contract"]
  );
});
