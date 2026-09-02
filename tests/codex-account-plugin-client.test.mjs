import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  CodexAppServerSession,
  createCodexAccountPluginClient
} from "../scripts/lib/codex-account-plugin-client.mjs";
import { codexRawAppId, readJson, root } from "../scripts/lib/package-model.mjs";

const bosProduct = await readJson(join(root, "products", "bos", "product.json"));
const pluginAppId = bosProduct.codex_connector.id;
const canonicalAppId = codexRawAppId(pluginAppId);

function appServerProcess(requests) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {};
  let buffer = "";
  child.stdin.setEncoding("utf8");
  child.stdin.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const index = buffer.indexOf("\n");
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      requests.push(message);
      if (message.id === undefined) continue;
      const result = message.method === "plugin/list"
        ? {
            marketplaces: [{
              name: "created-by-me-remote",
              plugins: [{
                id: "dev-test@created-by-me-remote",
                remotePluginId: `plugin_${canonicalAppId}`
              }]
            }]
          }
          : message.method === "plugin/read"
          ? {
              plugin: {
                apps: [{ id: pluginAppId, name: pluginAppId }],
                appTemplates: []
              }
            }
          : message.method === "app/read"
            ? {
                apps: [{
                  id: canonicalAppId,
                  name: "BOS — Business Operating System",
                  description: "Agent-first BOS runtime."
                }]
              }
          : message.method === "app/list"
            ? {
                data: [{
                  id: canonicalAppId,
                  name: "BOS — Business Operating System",
                  description: "Agent-first BOS runtime.",
                  distributionChannel: "INDIVIDUAL",
                  isAccessible: false,
                  isEnabled: true
                }],
                nextCursor: null
              }
          : { userAgent: "test" };
      child.stdout.write(`${JSON.stringify({ id: message.id, result })}\n`);
    }
  });
  return child;
}

test("Codex registered-app diagnostics log every protocol and HTTP request/response with redaction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bos-codex-app-diagnostic-"));
  const authPath = join(directory, "auth.json");
  await writeFile(authPath, JSON.stringify({
    tokens: {
      access_token: "account-secret",
      account_id: "account-id-secret"
    }
  }));
  const protocolRequests = [];
  const httpRequests = [];
  const lines = [];
  const client = createCodexAccountPluginClient({
    authPath,
    spawnProcess: () => appServerProcess(protocolRequests),
    runCommand: async () => ({ stdout: "codex-cli 1.2.3\n" }),
    fetchRequest: async (url, init) => {
      httpRequests.push({ url, init });
      return new Response(JSON.stringify({
        id: pluginAppId,
        access_token: "response-secret",
        owners: [{ type: "USER", id: "user-private-id" }]
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "set-cookie": "session=response-secret"
        }
      });
    },
    debugWriter: (line) => lines.push(JSON.parse(line))
  });

  assert.equal(client.createConnectorMetadata, undefined);
  assert.equal(typeof client.updateEstablishedProduct, "function");
  assert.equal(typeof client.provisionNewProduct, "function");
  const localPlugin = await client.readPlugin({
    pluginName: "bos",
    marketplacePath: "/tmp/marketplace.json"
  });
  assert.equal(typeof client.remove, "function");
  const plugins = await client.inspect(canonicalAppId);
  const appContent = await client.inspectAppContent(canonicalAppId);
  const appListing = await client.inspectAppListing(canonicalAppId);
  const connector = await client.inspectConnector(pluginAppId);

  assert.equal(localPlugin.plugin.apps[0].id, pluginAppId);
  assert.equal(plugins.length, 1);
  assert.equal(appContent.apps[0].id, canonicalAppId);
  assert.equal(appListing.app.id, canonicalAppId);
  assert.equal(appListing.app.isAccessible, false);
  assert.equal(appListing.pages_scanned, 1);
  assert.equal(connector.http_status, 200);
  assert.equal(connector.body.id, pluginAppId);
  assert.equal(connector.body.access_token, "[REDACTED]");
  assert.equal(connector.body.owners, "[REDACTED]");
  assert.doesNotMatch(JSON.stringify(connector), /response-secret/);
  assert.doesNotMatch(JSON.stringify(connector), /user-private-id/);
  assert.deepEqual(
    protocolRequests.filter(({ id }) => id !== undefined).map(({ method }) => method),
    [
      "initialize",
      "plugin/read",
      "initialize",
      "plugin/list",
      "initialize",
      "app/read",
      "initialize",
      "app/list"
    ]
  );
  assert.equal(httpRequests.length, 1);
  assert.equal(httpRequests[0].init.method, "GET");
  assert.equal(httpRequests[0].init.headers.Authorization, "Bearer account-secret");
  assert.deepEqual(lines.map(({ event }) => event), [
    "protocol.request",
    "protocol.response",
    "protocol.notification",
    "protocol.request",
    "protocol.response",
    "protocol.request",
    "protocol.response",
    "protocol.notification",
    "protocol.request",
    "protocol.response",
    "protocol.request",
    "protocol.response",
      "protocol.notification",
      "protocol.request",
      "protocol.response",
      "protocol.request",
      "protocol.response",
      "protocol.notification",
      "protocol.request",
      "protocol.response",
      "http.request",
      "http.response"
  ]);
  for (const request of lines.filter(({ event }) => event.endsWith("request"))) {
    const response = lines.find((entry) =>
      entry.event.endsWith("response") &&
      entry.request_id === request.request_id
    );
    assert(response, `missing response for ${request.request_id}`);
  }
  const pluginReadResponse = lines.find((entry) =>
    entry.event === "protocol.response" && entry.method === "plugin/read"
  );
  assert.equal(pluginReadResponse.summary.apps[0].id, pluginAppId);
  assert.doesNotMatch(
    JSON.stringify(lines),
    /account-secret|account-id-secret|response-secret|user-private-id/
  );
});

test("Codex established-product update requires and passes the permanent ID", async () => {
  const protocolRequests = [];
  const client = createCodexAccountPluginClient({
    debug: false,
    spawnProcess: () => appServerProcess(protocolRequests)
  });
  await client.updateEstablishedProduct("/tmp/generated-product", {
    remotePluginId: pluginAppId
  });
  const save = protocolRequests.find(({ method }) => method === "plugin/share/save");
  assert.deepEqual(save.params, {
    pluginPath: "/tmp/generated-product",
    remotePluginId: pluginAppId,
    discoverability: "PRIVATE",
    shareTargets: []
  });
  await assert.rejects(
    client.updateEstablishedProduct("/tmp/generated-product", {}),
    /require the permanent/
  );
});

test("Codex connector inspection normalizes package and raw IDs to one account URL", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bos-codex-connector-inspect-"));
  const authPath = join(directory, "auth.json");
  await writeFile(authPath, JSON.stringify({
    tokens: {
      access_token: "inspect-secret",
      account_id: "inspect-account"
    }
  }));
  const requests = [];
  const client = createCodexAccountPluginClient({
    authPath,
    runCommand: async () => ({ stdout: "codex-cli 1.2.3\n" }),
    fetchRequest: async (url, init) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ id: canonicalAppId }), { status: 200 });
    },
    debug: false
  });

  const fromPackageId = await client.inspectConnector(pluginAppId);
  const fromRawId = await client.inspectConnector(canonicalAppId);

  assert.equal(fromPackageId.app_id, canonicalAppId);
  assert.equal(fromRawId.app_id, canonicalAppId);
  assert.deepEqual(
    requests.map(({ url }) => url),
    [
      `https://chatgpt.com/backend-api/aip/connectors/${canonicalAppId}`,
      `https://chatgpt.com/backend-api/aip/connectors/${canonicalAppId}`
    ]
  );
  assert(requests.every(({ init }) => init.method === "GET"));
  await assert.rejects(
    client.inspectConnector("plugin_invalid"),
    /Invalid Codex connector ID/
  );
});

test("Codex connector inspection retries a transient HTML challenge", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bos-codex-connector-retry-"));
  const authPath = join(directory, "auth.json");
  await writeFile(authPath, JSON.stringify({
    tokens: {
      access_token: "retry-secret",
      account_id: "retry-account"
    }
  }));
  const requests = [];
  const client = createCodexAccountPluginClient({
    authPath,
    async fetchRequest(url, options) {
      requests.push({ url, options });
      if (requests.length < 3) {
        return new Response("challenge", {
          status: 403,
          headers: { "content-type": "text/html; charset=UTF-8" }
        });
      }
      return new Response(JSON.stringify({
        id: canonicalAppId,
        base_url: bosProduct.mcp_resource_url
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    },
    async runCommand() { return { stdout: "codex-cli 0.152.1" }; }
  });

  const result = await client.inspectConnector(pluginAppId);
  assert.equal(requests.length, 3);
  assert.equal(result.ok, true);
  assert.equal(result.body.id, canonicalAppId);
  assert.equal(result.body.base_url, bosProduct.mcp_resource_url);
});

test("Codex connector inspection returns the final exhausted HTML challenge", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bos-codex-connector-exhausted-"));
  const authPath = join(directory, "auth.json");
  await writeFile(authPath, JSON.stringify({
    tokens: {
      access_token: "exhausted-secret",
      account_id: "exhausted-account"
    }
  }));
  let requests = 0;
  const client = createCodexAccountPluginClient({
    authPath,
    async fetchRequest() {
      requests += 1;
      return new Response("challenge", {
        status: 403,
        headers: { "content-type": "text/html; charset=UTF-8" }
      });
    },
    async runCommand() { return { stdout: "codex-cli 0.152.1" }; },
    debug: false
  });

  const result = await client.inspectConnector(pluginAppId);
  assert.equal(requests, 3);
  assert.equal(result.ok, false);
  assert.equal(result.http_status, 403);
  assert.equal(result.body, "challenge");
});

test("Codex new-product provisioning is an explicit native workflow", async () => {
  const protocolRequests = [];
  const client = createCodexAccountPluginClient({
    debug: false,
    spawnProcess: () => appServerProcess(protocolRequests)
  });
  await client.provisionNewProduct("/tmp/generated-new-product");
  const save = protocolRequests.find(({ method }) => method === "plugin/share/save");
  assert.deepEqual(save.params, {
    pluginPath: "/tmp/generated-new-product",
    remotePluginId: null,
    discoverability: "PRIVATE",
    shareTargets: []
  });
});

test("Codex account cleanup deletes the exact authenticated app and verifies idempotent absence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bos-codex-account-delete-"));
  const authPath = join(directory, "auth.json");
  await writeFile(authPath, JSON.stringify({
    tokens: {
      access_token: "delete-secret",
      account_id: "delete-account"
    }
  }));
  const requests = [];
  const client = createCodexAccountPluginClient({
    authPath,
    runCommand: async () => ({ stdout: "codex-cli 1.2.3\n" }),
    fetchRequest: async (url, init) => {
      requests.push({ url, init });
      return new Response(null, { status: requests.length === 1 ? 204 : 404 });
    },
    debug: false
  });

  assert.deepEqual(await client.remove(canonicalAppId), { alreadyAbsent: false });
  assert.deepEqual(await client.remove(canonicalAppId), { alreadyAbsent: true });
  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url, `https://chatgpt.com/backend-api/aip/connectors/${canonicalAppId}`);
    assert.equal(request.init.method, "DELETE");
    assert.equal(request.init.headers.Authorization, "Bearer delete-secret");
    assert.equal(request.init.headers["ChatGPT-Account-Id"], "delete-account");
  }
  await assert.rejects(client.remove("plugin_asdk_app_invalid"), /invalid Codex account app ID/);
});

test("Codex app-server protocol and child-process failures are redacted and bounded", async () => {
  const protocolChild = appServerProcess([]);
  protocolChild.stdin.removeAllListeners("data");
  protocolChild.stdin.on("data", (chunk) => {
    const message = JSON.parse(String(chunk).trim());
    protocolChild.stdout.write(`${JSON.stringify({
      id: message.id,
      error: {
        message: "account_id=protocol-secret",
        organization_id: "organization-secret"
      }
    })}\n`);
  });
  const protocolSession = new CodexAppServerSession({
    spawnProcess: () => protocolChild,
    debug: false
  });
  await assert.rejects(
    protocolSession.initialize(),
    (error) => {
      assert.match(error.message, /account_id=\[REDACTED\]/);
      assert.doesNotMatch(error.message, /protocol-secret|organization-secret/);
      assert(error.message.length <= 4_096);
      return true;
    }
  );
  protocolSession.close();

  const exitChild = appServerProcess([]);
  exitChild.stdin.removeAllListeners("data");
  const exitSession = new CodexAppServerSession({
    spawnProcess: () => exitChild,
    debug: false
  });
  const pending = exitSession.initialize();
  exitChild.stderr.write("authorization=Bear");
  exitChild.stderr.write(`er ${"S".repeat(8_192)} account_id=stderr-secret`);
  exitChild.emit("exit", 1, null);
  await assert.rejects(
    pending,
    (error) => {
      assert.match(error.message, /authorization=\[REDACTED\]/);
      assert.doesNotMatch(error.message, /S{128}|stderr-secret/);
      assert(error.message.length <= 4_096);
      return true;
    }
  );
  exitSession.close();
});

test("Codex app-list diagnostics paginate to the exact private app record", async () => {
  const requests = [];
  const client = createCodexAccountPluginClient({
    debug: false,
    spawnProcess: () => {
      const child = appServerProcess(requests);
      child.stdin.removeAllListeners("data");
      child.stdin.on("data", (chunk) => {
        const message = JSON.parse(String(chunk).trim());
        requests.push(message);
        if (message.id === undefined) return;
        const result = message.method === "app/list"
          ? message.params.cursor === null
            ? {
                data: [{ id: "asdk_app_other", name: "Other" }],
                nextCursor: "page-2"
              }
            : {
                data: [{
                  id: canonicalAppId,
                  name: canonicalAppId,
                  description: null,
                  distributionChannel: null,
                  isAccessible: false,
                  isEnabled: true
                }],
                nextCursor: null
              }
          : { userAgent: "test" };
        child.stdout.write(`${JSON.stringify({ id: message.id, result })}\n`);
      });
      return child;
    }
  });

  const listing = await client.inspectAppListing(canonicalAppId, {
    limit: 1,
    maxPages: 3
  });

  assert.equal(listing.app.id, canonicalAppId);
  assert.equal(listing.app.name, canonicalAppId);
  assert.equal(listing.app.isAccessible, false);
  assert.equal(listing.pages_scanned, 2);
  assert.equal(listing.records_scanned, 2);
  assert.deepEqual(
    requests.filter(({ method }) => method === "app/list").map(({ params }) => params),
    [
      { cursor: null, forceRefetch: true, limit: 1 },
      { cursor: "page-2", forceRefetch: false, limit: 1 }
    ]
  );
});
