import assert from "node:assert/strict";
import test from "node:test";

import {
  CANONICAL_AUTHORIZATION_ENDPOINT,
  CANONICAL_IDENTITY_PROVIDER_AUTHORIZATION_ENDPOINT,
  CANONICAL_OAUTH_TARGET,
  CANONICAL_RESOURCE_CHALLENGE,
  expectedBosResourceChallenge,
  inspectGoogleAccountSelectorRedirect,
  probeBosCodexStaleRefreshRecovery,
  probeBosOAuthDiscovery,
  probeBosNativeLoginTrigger,
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

test("BOS native login trigger challenges every signed-out MCP method", async () => {
  const calls = [];
  const result = await probeBosNativeLoginTrigger({
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(init.body);
      calls.push(request.method);
      return authenticationRequiredResponse();
    }
  });

  assert.equal(result.status, "passed");
  assert.equal(result.initialize_status, 401);
  assert.equal(result.tools_list_status, 401);
  assert.equal(result.tools_call_status, 401);
  assert.equal(result.business_call_status, 401);
  assert.deepEqual(calls, ["initialize", "tools/list", "tools/call", "tools/call"]);
});

test("BOS native login trigger rejects a noncanonical protected-resource challenge", async () => {
  const result = await probeBosNativeLoginTrigger({
    fetchImpl: async () => authenticationRequiredResponse({
      challenge: 'Bearer scope="mcp:tools"'
    })
  });

  assert.equal(result.status, "failed");
  assert.equal(result.violations.length, 4);
  assert.ok(result.violations.every(({ code }) => code.endsWith("_challenge")));
});

test("BOS native login trigger rejects every pre-authentication result surface", async () => {
  const result = await probeBosNativeLoginTrigger({
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(init.body);
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: request.id,
        result: request.method === "tools/list"
          ? { tools: [{ name: "bos_get_context", inputSchema: { type: "object" } }] }
          : {}
      }), {
        status: 401,
        headers: {
          "content-type": "application/json",
          "www-authenticate": CANONICAL_RESOURCE_CHALLENGE
        }
      });
    }
  });

  assert.equal(result.status, "failed");
  assert.equal(result.violations.length, 4);
  assert.ok(result.violations.every(({ message }) =>
    message.includes("pre-authentication")));
});

function staleRefreshRecoveryFetch(resourceUrl, {
  includeRefreshToken = false,
  nonCodexGetsHandoff = false,
  mcpResponseOverride = null,
  tokenPayloadOverrides = {}
} = {}) {
  const issuer = new URL(resourceUrl).origin;
  const protectedMetadataUrl = new URL(
    `/.well-known/oauth-protected-resource${new URL(resourceUrl).pathname}`,
    issuer
  ).href;
  const authorizationMetadataUrl = new URL(
    "/.well-known/oauth-authorization-server",
    issuer
  ).href;
  const registrationEndpoint = new URL("/api/v1/mcp/oauth/register", issuer).href;
  const tokenEndpoint = new URL("/api/v1/mcp/oauth/token", issuer).href;
  const clients = new Map();
  const requests = [];
  let clientSequence = 0;
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init });
    if (url === protectedMetadataUrl) {
      return Response.json({
        resource: resourceUrl,
        authorization_servers: [issuer]
      });
    }
    if (url === authorizationMetadataUrl) {
      return Response.json({
        issuer,
        registration_endpoint: registrationEndpoint,
        token_endpoint: tokenEndpoint
      });
    }
    if (url === registrationEndpoint) {
      const body = JSON.parse(init.body);
      if (body.token_endpoint_auth_method !== "none" ||
          body.grant_types.some((value) =>
            !new Set(["authorization_code", "refresh_token"]).has(value)) ||
          JSON.stringify(body.response_types) !== JSON.stringify(["code"])) {
        return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
      }
      const clientId = `client-${++clientSequence}`;
      clients.set(clientId, body);
      return Response.json({ client_id: clientId, ...body }, { status: 201 });
    }
    if (url === tokenEndpoint) {
      const body = new URLSearchParams(init.body);
      const client = clients.get(body.get("client_id"));
      const parsedRedirect = (() => {
        try {
          return new URL(client?.redirect_uris?.[0]);
        } catch {
          return null;
        }
      })();
      const canRecover = (
        client?.client_name === "Codex" &&
        client?.application_type === "native" &&
        client?.token_endpoint_auth_method === "none" &&
        JSON.stringify(client?.grant_types) ===
          JSON.stringify(["authorization_code", "refresh_token"]) &&
        JSON.stringify(client?.response_types) === JSON.stringify(["code"]) &&
        parsedRedirect?.protocol === "http:" &&
        new Set(["127.0.0.1", "::1", "localhost"]).has(parsedRedirect?.hostname) &&
        parsedRedirect?.pathname === "/callback"
      ) || nonCodexGetsHandoff;
      if (!canRecover) {
        return Response.json({
          error: "invalid_grant",
          error_description: "Invalid refresh token"
        }, { status: 400 });
      }
      return Response.json({
        access_token: "bos_mcp_at_reauthentication_handoff_secret",
        token_type: "Bearer",
        scope: "mcp:tools",
        expires_in: 120,
        ...(includeRefreshToken
          ? { refresh_token: "bos_mcp_rt_forbidden_secret" }
          : {}),
        ...tokenPayloadOverrides
      });
    }
    if (url === resourceUrl) {
      const body = JSON.parse(init.body);
      if (mcpResponseOverride) return mcpResponseOverride(body);
      return Response.json(
        { detail: { error: "authentication_required" } },
        {
          status: 401,
          headers: {
            "content-type": "application/json",
            "www-authenticate": expectedBosResourceChallenge(resourceUrl)
          }
        }
      );
    }
    throw new Error(`Unexpected request URL: ${url}`);
  };
  return { fetchImpl, requests };
}

test("Codex stale-refresh recovery stays zero-authority across every product resource", async () => {
  const contract = await readJson(`${root}/contracts/product-mcp-connections.v1.json`);
  for (const [index, product] of contract.products.entries()) {
    const mock = staleRefreshRecoveryFetch(product.resource_url);
    const result = await probeBosCodexStaleRefreshRecovery({
      resourceUrl: product.resource_url,
      verifyNonCodexControl: true,
      verifyCodexNearMatchControls: true,
      fetchImpl: mock.fetchImpl
    });

    assert.equal(result.status, "passed", JSON.stringify(result.violations));
    assert.equal(result.codex_registration_status, 201);
    assert.equal(result.stale_refresh_status, 200);
    assert.equal(result.access_token_expires_in, 120);
    assert.equal(result.access_token_scope, "mcp:tools");
    assert.equal(result.initialize_status, 401);
    assert.equal(result.tools_list_status, 401);
    assert.equal(result.tools_call_status, 401);
    assert.equal(result.business_call_status, 401);
    assert.equal(result.non_codex_registration_status, 201);
    assert.equal(result.non_codex_refresh_status, 400);
    assert.equal(result.non_codex_error, "invalid_grant");
    assert.equal(result.codex_near_match_controls.length, 6);
    assert.ok(result.codex_near_match_controls.slice(0, 3).every((control) =>
      control.registration_status === 201 && control.refresh_status === 400 &&
      control.error === "invalid_grant"));
    assert.ok(result.codex_near_match_controls.slice(3).every((control) =>
      control.registration_status === 400 && control.refresh_status === null &&
      control.error === "invalid_client_metadata"));
    assert.doesNotMatch(
      JSON.stringify(result),
      /reauthentication_handoff_secret|forbidden_secret|bos_mcp_rt_[A-Za-z0-9_-]+/
    );

    const registrations = mock.requests
      .filter(({ url }) => url.endsWith("/api/v1/mcp/oauth/register"))
      .map(({ init }) => JSON.parse(init.body));
    assert.deepEqual(registrations[0], {
      client_name: "Codex",
      redirect_uris: ["http://127.0.0.1:1455/callback"],
      application_type: "native",
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"]
    });
    const refreshRequests = mock.requests
      .filter(({ url }) => url.endsWith("/api/v1/mcp/oauth/token"))
      .map(({ init }) => new URLSearchParams(init.body));
    assert.match(refreshRequests[0].get("refresh_token"), /^bos_mcp_rt_[A-Za-z0-9_-]{64}$/);
    assert.equal(refreshRequests[0].get("resource"), product.resource_url);
    const mcpRequests = mock.requests.filter(({ url }) => url === product.resource_url);
    assert.deepEqual(
      mcpRequests.map(({ init }) => JSON.parse(init.body).method),
      ["initialize", "tools/list", "tools/call", "tools/call"]
    );
    assert.ok(mcpRequests.every(({ init }) =>
      init.headers.authorization ===
        "Bearer bos_mcp_at_reauthentication_handoff_secret"
    ));
  }
});

test("Codex stale-refresh recovery rejects a refresh-bearing handoff", async () => {
  const mock = staleRefreshRecoveryFetch(resource, { includeRefreshToken: true });
  const result = await probeBosCodexStaleRefreshRecovery({
    resourceUrl: resource,
    fetchImpl: mock.fetchImpl
  });

  assert.equal(result.status, "failed");
  assert.ok(result.violations.some(({ code }) =>
    code === "oauth_stale_refresh_token_contract"
  ));
  assert.doesNotMatch(JSON.stringify(result), /forbidden_secret/);
});

test("Codex stale-refresh recovery requires exact scope and a 120-second maximum", async () => {
  for (const tokenPayloadOverrides of [
    { scope: "mcp:tools extra" },
    { expires_in: 121 }
  ]) {
    const mock = staleRefreshRecoveryFetch(resource, { tokenPayloadOverrides });
    const result = await probeBosCodexStaleRefreshRecovery({
      resourceUrl: resource,
      fetchImpl: mock.fetchImpl
    });

    assert.equal(result.status, "failed");
    assert.ok(result.violations.some(({ code }) =>
      code === "oauth_stale_refresh_token_contract"
    ));
  }
});

test("Codex stale-refresh recovery rejects compatibility granted to another client", async () => {
  const mock = staleRefreshRecoveryFetch(resource, { nonCodexGetsHandoff: true });
  const result = await probeBosCodexStaleRefreshRecovery({
    resourceUrl: resource,
    verifyNonCodexControl: true,
    fetchImpl: mock.fetchImpl
  });

  assert.equal(result.status, "failed");
  assert.ok(result.violations.some(({ code }) =>
    code === "oauth_non_codex_invalid_grant"
  ));
  assert.doesNotMatch(JSON.stringify(result), /reauthentication_handoff_secret/);
});

test("Codex stale-refresh recovery diagnostics never expose either token", async () => {
  const mock = staleRefreshRecoveryFetch(resource);
  const debugLines = [];
  const result = await probeBosCodexStaleRefreshRecovery({
    resourceUrl: resource,
    fetchImpl: mock.fetchImpl,
    debug: true,
    debugWriter: (line) => debugLines.push(line)
  });
  const tokenRequest = mock.requests.find(({ url }) =>
    url.endsWith("/api/v1/mcp/oauth/token")
  );
  const unknownRefresh = new URLSearchParams(tokenRequest.init.body)
    .get("refresh_token");

  assert.equal(result.status, "passed");
  assert.doesNotMatch(
    debugLines.join("\n"),
    new RegExp(`${unknownRefresh}|reauthentication_handoff_secret`)
  );
  assert.match(debugLines.join("\n"), /\[REDACTED\]/);
});

test("Codex stale-refresh recovery rejects a pre-authentication tool surface", async () => {
  const mock = staleRefreshRecoveryFetch(resource, {
    mcpResponseOverride: (body) => Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        tools: [{ name: "bos_get_context", inputSchema: { type: "object" } }]
      }
    }, {
      status: 401,
      headers: { "www-authenticate": expectedBosResourceChallenge(resource) }
    })
  });
  const result = await probeBosCodexStaleRefreshRecovery({
    fetchImpl: mock.fetchImpl
  });
  assert.equal(result.status, "failed");
  assert.ok(result.violations.some(({ code }) =>
    code === "oauth_stale_refresh_tool_surface"));
  assert.ok(result.violations.some(({ code }) =>
    code === "oauth_stale_refresh_context_challenge"));
});

test("Codex stale-refresh recovery requires the exact MCP resource challenge", async () => {
  const mock = staleRefreshRecoveryFetch(resource, {
    mcpResponseOverride: () => authenticationRequiredResponse({
      challenge: 'Bearer resource_metadata="https://dfsm.ai/.well-known/oauth-protected-resource/mcp/apps/bos/platform", scope="wrong"'
    })
  });
  const result = await probeBosCodexStaleRefreshRecovery({
    fetchImpl: mock.fetchImpl
  });
  assert.equal(result.status, "failed");
  assert.ok(result.violations.some(({ code }) =>
    code === "oauth_stale_refresh_initialize_challenge"));
  assert.ok(result.violations.some(({ code }) =>
    code === "oauth_stale_refresh_tool_surface"));
  assert.ok(result.violations.some(({ code }) =>
    code === "oauth_stale_refresh_context_challenge"));
  assert.ok(result.violations.some(({ code }) =>
    code === "oauth_stale_refresh_business_denial"));
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

test("BOS OAuth live contract follows the secure login handoff to Google", async () => {
  const google = new URL(CANONICAL_IDENTITY_PROVIDER_AUTHORIZATION_ENDPOINT);
  google.searchParams.set(
    "prompt",
    CANONICAL_OAUTH_TARGET.provider_account_selection_prompt
  );
  const responses = [
    new Response(
      '<main id="mcp-oauth-login"><a id="mcp-oauth-login-link" href="/api/v1/mcp/oauth/handoff/login?agent_auth_transaction=opaque">Open BOS sign in</a></main>',
      {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
          pragma: "no-cache",
          "referrer-policy": "no-referrer"
        }
      }
    ),
    new Response(
      '<form method="get" action="/api/v1/mcp/oauth/handoff/google/start"><input type="hidden" name="agent_auth_transaction" value="opaque"><button>Continue with Google</button></form>',
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      }
    ),
    new Response(null, {
      status: 302,
      headers: { location: google.href }
    })
  ];
  const calls = [];
  const result = await probeBosOAuthAuthorize({
    authorizeUrl: authorizeUrl(),
    fetchImpl: async (url, init) => {
      calls.push({ url: String(url), init });
      return responses.shift();
    }
  });

  assert.equal(result.status, "passed");
  assert.equal(result.http_status, 302);
  assert.equal(calls.length, 3);
  assert.match(calls[1].url, /\/api\/v1\/mcp\/oauth\/handoff\/login/);
  assert.match(calls[2].url, /\/api\/v1\/mcp\/oauth\/handoff\/google\/start/);
  assert.equal(calls[2].init.headers["sec-fetch-site"], "same-origin");
});

const embeddedCredentialsTarget = new URL(
  "/api/v1/mcp/oauth/handoff/google/start?agent_auth_transaction=opaque",
  CANONICAL_AUTHORIZATION_ENDPOINT
);
embeddedCredentialsTarget.username = "synthetic-user";

for (const [label, target, expected] of [
  ["canonical link", "/api/v1/mcp/oauth/handoff/google/start?agent_auth_transaction=opaque", "passed"],
  ["different transaction", "/api/v1/mcp/oauth/handoff/google/start?agent_auth_transaction=other", "failed"],
  ["duplicate transaction", "/api/v1/mcp/oauth/handoff/google/start?agent_auth_transaction=opaque&amp;agent_auth_transaction=other", "failed"],
  ["missing transaction", "/api/v1/mcp/oauth/handoff/google/start", "failed"],
  ["foreign origin", "https://wrong.example/api/v1/mcp/oauth/handoff/google/start?agent_auth_transaction=opaque", "failed"],
  ["wrong path", "/other?agent_auth_transaction=opaque", "failed"],
  ["fragment", "/api/v1/mcp/oauth/handoff/google/start?agent_auth_transaction=opaque#fragment", "failed"],
  ["embedded credentials", embeddedCredentialsTarget.href, "failed"]
]) {
  test(`BOS OAuth live Google link: ${label}`, async () => {
    const google = new URL(CANONICAL_IDENTITY_PROVIDER_AUTHORIZATION_ENDPOINT);
    google.searchParams.set("prompt", "select_account");
    const responses = [
      new Response('<main id="mcp-oauth-login"><a id="mcp-oauth-login-link" href="/api/v1/mcp/oauth/handoff/login?agent_auth_transaction=opaque">Sign in</a></main>', {
        headers: { "content-type": "text/html", "cache-control": "no-store", pragma: "no-cache", "referrer-policy": "no-referrer" }
      }),
      new Response(`<a href="${target}" id="mcp-oauth-google-login-link">Continue with Google</a>`),
      new Response(null, { status: 302, headers: { location: google.href } })
    ];
    const calls = [];
    const result = await probeBosOAuthAuthorize({
      authorizeUrl: authorizeUrl(),
      fetchImpl: async (url) => { calls.push(String(url)); return responses.shift(); }
    });
    assert.equal(result.status, expected);
    assert.equal(calls.length, expected === "passed" ? 3 : 2);
    if (expected === "passed") {
      assert.equal(new URL(calls[2]).searchParams.get("agent_auth_transaction"), "opaque");
    }
  });
}

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
