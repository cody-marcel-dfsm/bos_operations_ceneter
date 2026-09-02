import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_PROTOCOL_VERSION,
  probeBosToolAuthentication
} from "../scripts/lib/bos-tool-auth-live-contract.mjs";
import {
  CANONICAL_PROTECTED_RESOURCE_METADATA_URL
} from "../scripts/lib/bos-oauth-live-contract.mjs";

const challenge = `Bearer resource_metadata="${CANONICAL_PROTECTED_RESOURCE_METADATA_URL}", error="invalid_token", error_description="Login required"`;

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers }
  });
}

function passingFetch({
  descriptor = {
    name: "bos_get_context",
    description: "Resolve BOS context",
    inputSchema: { type: "object", properties: {} },
    securitySchemes: [{ type: "oauth2", scopes: ["mcp:tools"] }]
  },
  callResult = {
    content: [{ type: "text", text: "Authentication required." }],
    _meta: { "mcp/www_authenticate": [challenge] },
    isError: true
  },
  sse = false,
  requests = []
} = {}) {
  return async (_url, init) => {
    const payload = JSON.parse(init.body);
    requests.push({ payload, headers: new Headers(init.headers) });
    if (payload.method === "initialize") {
      return jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: DEFAULT_PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "bos", version: "1" }
        }
      }, { headers: { "mcp-session-id": "session-1" } });
    }
    if (payload.method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }
    if (payload.method === "tools/list") {
      const rpc = { jsonrpc: "2.0", id: 2, result: { tools: [descriptor] } };
      if (!sse) return jsonResponse(rpc);
      return new Response(
        `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", method: "notifications/progress" })}\n\n` +
        `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 99, result: {} })}\n\n` +
        `event: message\ndata: ${JSON.stringify(rpc)}\n\n`,
        { headers: { "content-type": "text/event-stream" } }
      );
    }
    if (payload.method === "tools/call") {
      return jsonResponse({ jsonrpc: "2.0", id: 3, result: callResult });
    }
    throw new Error(`Unexpected method: ${payload.method}`);
  };
}

test("tool-auth probe accepts OAuth descriptor and selected-tool challenge", async () => {
  const requests = [];
  const probe = await probeBosToolAuthentication({
    fetchImpl: passingFetch({ requests })
  });

  assert.equal(probe.status, "passed");
  assert.equal(probe.tool_name, "bos_get_context");
  assert.deepEqual(probe.descriptor_oauth_scopes, ["mcp:tools"]);
  assert.deepEqual(probe.challenge, {
    scheme: "Bearer",
    resource_metadata: CANONICAL_PROTECTED_RESOURCE_METADATA_URL,
    error: "invalid_token",
    error_description: "[VALID_GENERIC_AUTHENTICATION_DESCRIPTION]"
  });
  assert.deepEqual(probe.violations, []);
  assert.deepEqual(requests.map(({ payload }) => payload.method), [
    "initialize",
    "notifications/initialized",
    "tools/list",
    "tools/call"
  ]);
  assert.equal(
    requests[2].headers.get("mcp-protocol-version"),
    DEFAULT_PROTOCOL_VERSION
  );
  assert.equal(requests[2].headers.get("mcp-session-id"), "session-1");
  assert.deepEqual(requests[3].payload.params, {
    name: "bos_get_context",
    arguments: {}
  });
});

test("tool-auth probe requires an object input schema", async () => {
  for (const inputSchema of [undefined, null, [], { type: "string" }, "object"]) {
    const probe = await probeBosToolAuthentication({
      fetchImpl: passingFetch({
        descriptor: {
          name: "bos_get_context",
          description: "Resolve BOS context",
          inputSchema,
          securitySchemes: [{ type: "oauth2", scopes: ["mcp:tools"] }]
        }
      })
    });

    assert.equal(probe.status, "failed");
    assert.deepEqual(probe.violations.map(({ code }) => code), [
      "oauth_tool_input_schema"
    ]);
  }
});

test("tool-auth probe accepts a generic missing-token authentication message", async () => {
  const probe = await probeBosToolAuthentication({
    fetchImpl: passingFetch({
      callResult: {
        content: [{
          type: "text",
          text: "Authentication required: no access token provided."
        }],
        _meta: { "mcp/www_authenticate": [challenge] },
        isError: true
      }
    })
  });

  assert.equal(probe.status, "passed");
});

test("tool-auth probe selects the matching SSE response", async () => {
  const probe = await probeBosToolAuthentication({
    fetchImpl: passingFetch({ sse: true })
  });
  assert.equal(probe.status, "passed");
});

test("tool-auth probe rejects HTTP 401 before tool discovery", async () => {
  const probe = await probeBosToolAuthentication({
    fetchImpl: async () => jsonResponse(
      { detail: { error: "authentication_required" } },
      { status: 401 }
    )
  });

  assert.equal(probe.status, "failed");
  assert.deepEqual(probe.violations.map(({ code }) => code), [
    "oauth_tool_initialize_status"
  ]);
});

test("tool-auth probe never emits raw transport failure data", async () => {
  const privateValues = /transport-secret|account-secret/;
  const probe = await probeBosToolAuthentication({
    fetchImpl: async () => {
      throw new Error(
        "authorization=Bearer transport-secret account_id=account-secret"
      );
    }
  });

  assert.equal(probe.status, "failed");
  assert.deepEqual(probe.violations.map(({ code }) => code), [
    "oauth_tool_initialize_request"
  ]);
  assert.match(probe.violations[0].message, /\[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(probe), privateValues);
});

test("tool-auth probe requires OAuth scheme, complete challenge, and no business payload", async () => {
  const probe = await probeBosToolAuthentication({
    fetchImpl: passingFetch({
      descriptor: {
        name: "bos_get_context",
        inputSchema: { type: "object", properties: {} }
      },
      callResult: {
        structuredContent: { customer: "must-not-leak" },
        _meta: {
          "mcp/www_authenticate": [
            `Bearer resource_metadata="${CANONICAL_PROTECTED_RESOURCE_METADATA_URL}"`
          ]
        },
        isError: false
      }
    })
  });

  assert.equal(probe.status, "failed");
  assert.deepEqual(probe.violations.map(({ code }) => code), [
    "oauth_tool_security_scheme",
    "oauth_tool_error_result",
    "oauth_tool_challenge",
    "oauth_tool_business_payload"
  ]);
});

test("tool-auth probe rejects business data in ordinary MCP content", async () => {
  const probe = await probeBosToolAuthentication({
    fetchImpl: passingFetch({
      callResult: {
        content: [{ type: "text", text: "customer_email=private@example.com" }],
        _meta: { "mcp/www_authenticate": [challenge] },
        isError: true
      }
    })
  });

  assert.equal(probe.status, "failed");
  assert.deepEqual(probe.violations.map(({ code }) => code), [
    "oauth_tool_business_payload"
  ]);
});

test("tool-auth probe rejects non-string data mixed into the authentication challenge", async () => {
  const probe = await probeBosToolAuthentication({
    fetchImpl: passingFetch({
      callResult: {
        content: [{ type: "text", text: "Authentication required." }],
        _meta: {
          "mcp/www_authenticate": [
            challenge,
            { customer_email: "private@example.com" }
          ]
        },
        isError: true
      }
    })
  });

  assert.equal(probe.status, "failed");
  assert.deepEqual(probe.violations.map(({ code }) => code), [
    "oauth_tool_business_payload"
  ]);
});

test("tool-auth probe rejects and never emits business data inside a string challenge", async () => {
  const privateValue = "private@example.com";
  const probe = await probeBosToolAuthentication({
    fetchImpl: passingFetch({
      callResult: {
        content: [{ type: "text", text: "Authentication required." }],
        _meta: {
          "mcp/www_authenticate": [
            `Bearer resource_metadata="${CANONICAL_PROTECTED_RESOURCE_METADATA_URL}", error="invalid_token", error_description="Customer ${privateValue} must sign in"`
          ]
        },
        isError: true
      }
    })
  });

  assert.equal(probe.status, "failed");
  assert.deepEqual(probe.violations.map(({ code }) => code), [
    "oauth_tool_challenge",
    "oauth_tool_business_payload"
  ]);
  assert.equal(probe.challenge, null);
  assert.doesNotMatch(JSON.stringify(probe), new RegExp(privateValue));
});

test("tool-auth probe derives protected-resource metadata from a candidate resource URL", async () => {
  const resourceUrl = "https://candidate.example/mcp/apps/bos/platform";
  const candidateChallenge =
    'Bearer resource_metadata="https://candidate.example/.well-known/oauth-protected-resource/mcp/apps/bos/platform", error="invalid_token", error_description="Login required"';
  const probe = await probeBosToolAuthentication({
    resourceUrl,
    fetchImpl: passingFetch({
      callResult: {
        content: [{ type: "text", text: "Authentication required." }],
        _meta: { "mcp/www_authenticate": [candidateChallenge] },
        isError: true
      }
    })
  });

  assert.equal(probe.status, "passed");
  assert.deepEqual(probe.challenge, {
    scheme: "Bearer",
    resource_metadata: "https://candidate.example/.well-known/oauth-protected-resource/mcp/apps/bos/platform",
    error: "invalid_token",
    error_description: "[VALID_GENERIC_AUTHENTICATION_DESCRIPTION]"
  });
});

test("tool-auth probe rejects invalid OAuth scopes and extra signed-out metadata", async () => {
  const probe = await probeBosToolAuthentication({
    fetchImpl: passingFetch({
      descriptor: {
        name: "bos_get_context",
        inputSchema: { type: "object", properties: {} },
        securitySchemes: [{ type: "oauth2", scopes: [null] }]
      },
      callResult: {
        content: [{ type: "text", text: "Authentication required." }],
        _meta: {
          "mcp/www_authenticate": [challenge],
          customer: { email: "private@example.com" }
        },
        isError: true
      }
    })
  });

  assert.equal(probe.status, "failed");
  assert.deepEqual(probe.violations.map(({ code }) => code), [
    "oauth_tool_security_scheme",
    "oauth_tool_business_payload"
  ]);
});

test("tool-auth probe rejects any anonymous security scheme on the protected tool", async () => {
  const probe = await probeBosToolAuthentication({
    fetchImpl: passingFetch({
      descriptor: {
        name: "bos_get_context",
        inputSchema: { type: "object", properties: {} },
        securitySchemes: [
          { type: "noauth" },
          { type: "oauth2", scopes: ["mcp:tools"] }
        ]
      }
    })
  });

  assert.equal(probe.status, "failed");
  assert.deepEqual(probe.violations.map(({ code }) => code), [
    "oauth_tool_security_scheme"
  ]);
});

test("tool-auth probe debug trace omits untrusted tool-result bodies", async () => {
  const lines = [];
  const probe = await probeBosToolAuthentication({
    debug: true,
    debugWriter: (line) => lines.push(line),
    fetchImpl: passingFetch({
      callResult: {
        content: [{ type: "text", text: "private@example.com" }],
        _meta: { "mcp/www_authenticate": [challenge] },
        isError: true
      }
    })
  });

  assert.equal(probe.status, "failed");
  assert.doesNotMatch(lines.join("\n"), /private@example\.com/);
  assert.match(lines.join("\n"), /OMITTED_BY_POLICY/);
});

test("tool-auth probe returns a structured violation for post-initialize transport errors", async () => {
  const base = passingFetch();
  const probe = await probeBosToolAuthentication({
    fetchImpl: async (url, init) => {
      const payload = JSON.parse(init.body);
      if (payload.method === "tools/list") {
        throw new Error("candidate unavailable");
      }
      return base(url, init);
    }
  });

  assert.equal(probe.status, "failed");
  assert.deepEqual(probe.violations.map(({ code }) => code), [
    "oauth_tool_list_request"
  ]);
});

test("tool-auth probe returns a structured violation for unreadable RPC responses", async () => {
  const base = passingFetch();
  const probe = await probeBosToolAuthentication({
    fetchImpl: async (url, init) => {
      const payload = JSON.parse(init.body);
      if (payload.method === "tools/list") {
        return {
          status: 200,
          headers: new Headers({ "content-type": "application/json" }),
          text: async () => { throw new Error("response stream failed"); }
        };
      }
      return base(url, init);
    }
  });

  assert.equal(probe.status, "failed");
  assert.deepEqual(probe.violations.map(({ code }) => code), [
    "oauth_tool_list_response"
  ]);
});

test("tool-auth probe requires HTTP 202 for initialized notification", async () => {
  const base = passingFetch();
  const probe = await probeBosToolAuthentication({
    fetchImpl: async (url, init) => {
      const payload = JSON.parse(init.body);
      if (payload.method === "notifications/initialized") {
        return new Response(null, { status: 204 });
      }
      return base(url, init);
    }
  });

  assert.equal(probe.status, "failed");
  assert.deepEqual(probe.violations.map(({ code }) => code), [
    "oauth_tool_initialized_status"
  ]);
});
