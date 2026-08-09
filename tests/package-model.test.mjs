import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import test from "node:test";
import {
  listProducts,
  resolveProductSkills,
  root,
  walkFiles,
  validateProduct
} from "../scripts/lib/package-model.mjs";

test("canonical distributable skills contain no customer-specific settings", async () => {
  const files = (await walkFiles(`${root}/source`)).filter((path) =>
    /\/(platform|capabilities|verticals)\//.test(path)
  );
  const forbidden = [
    /cody(?:\.|'s|\b)/i,
    /cherry\s*creek/i,
    /cody\.marcel@/i,
    /760\s+s\s+colorado/i,
    /7206042442/,
    /America\/Denver/
  ];
  const failures = [];
  for (const path of files) {
    const content = await readFile(path, "utf8");
    if (forbidden.some((pattern) => pattern.test(content))) failures.push(path);
  }
  assert.deepEqual(failures, []);
});

test("iCode packages include an empty customer settings template", async () => {
  for (const path of [
    `${root}/clients/codex/plugins/icode-operations-center/config/customer-settings.template.json`,
    `${root}/clients/claude/plugins/icode-operations-center/config/customer-settings.template.json`,
    `${root}/clients/copilot/products/icode-operations-center/config/customer-settings.template.json`
  ]) {
    const settings = JSON.parse(await readFile(path, "utf8"));
    assert.equal(settings.schema_version, "1");
    assert.equal(settings.organization_display_name, "");
    assert.equal(settings.location_display_name, "");
    assert.equal(settings.timezone, "");
    assert.equal(settings.mailboxes.care_com, "");
  }
});

test("all product manifests validate and resolve unique skills", async () => {
  const products = await listProducts();
  assert.equal(products.length, 3);
  for (const { path, manifest } of products) {
    assert.deepEqual(validateProduct(manifest, path), []);
    const skills = await resolveProductSkills(manifest);
    assert.equal(skills.length, new Set(skills.map((skill) => skill.name)).size);
  }
});

test("Video Ads composes workflow skills and the BOS runtime", async () => {
  const products = await listProducts();
  const videoAds = products.find(
    ({ manifest }) => manifest.name === "video-ads"
  )?.manifest;
  assert(videoAds);
  assert.equal(videoAds.runtime, "bos");
  assert.equal(videoAds.mcp_profile, "video-ads");
  const skills = await resolveProductSkills(videoAds);
  assert.deepEqual(
    skills.map((skill) => skill.name),
    [
      "video-ad-briefing",
      "video-ad-generation",
      "video-ad-drive-delivery"
    ]
  );
});

test("Video Ads targets only its operational MCP profile", async () => {
  const config = JSON.parse(
    await readFile(
      `${root}/clients/codex/plugins/video-ads/.mcp.json`,
      "utf8"
    )
  );
  assert.deepEqual(config.mcpServers.bos.args, [
    "./scripts/bos_mcp_broker.py",
    "--profile",
    "video-ads"
  ]);
  const broker = await readFile(
    `${root}/clients/codex/plugins/video-ads/scripts/bos_mcp_broker.py`,
    "utf8"
  );
  assert.match(broker, /if MCP_PROFILE is None:/);
  assert.match(broker, /\/mcp\/\{MCP_PROFILE\}/);
  assert.match(
    broker,
    /BOS authenticated for the \{MCP_PROFILE\} profile/
  );
  assert.match(broker, /profile tool metadata/);
});

test("Video Ads profile rejects suppressed aggregate tool calls", () => {
  const messages = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {}
    },
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "bos_start_provider_credential_handoff",
        arguments: {}
      }
    },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "bos_get_context", arguments: {} }
    }
  ];
  const result = spawnSync(
    "python3",
    [
      "clients/codex/plugins/video-ads/scripts/bos_mcp_broker.py",
      "--profile",
      "video-ads"
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, BOS_API_KEY: "configured-client-key" },
      input: `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`
    }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const responses = result.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line))
    .filter((message) => message.id);
  assert.doesNotMatch(responses[0].result.instructions, /bos_get_context/);
  assert.doesNotMatch(responses[0].result.instructions, /start_authentication/);
  assert.deepEqual(
    responses.slice(1).map((response) => response.error?.code),
    [-32601, -32601]
  );
});

test("Video Ads profile uses the configured API key and calls a scoped upstream without context discovery", async () => {
  let contextCalls = 0;
  const server = createServer((request, response) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const message = JSON.parse(body);
      let result = {};
      if (message.method === "initialize") {
        result = {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "video-ads", version: "0.1.0" }
        };
      } else if (message.method === "tools/list") {
        result = {
          tools: [{
            name: "video_ads_get_readiness",
            description: "Scoped readiness",
            inputSchema: { type: "object" }
          }]
        };
      } else if (message.method === "tools/call") {
        if (message.params?.name === "bos_get_context") contextCalls += 1;
        result = {
          content: [{ type: "text", text: JSON.stringify({ status: "ready" }) }],
          isError: false
        };
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address === "object");
  const child = spawn(
    "python3",
    [
      "clients/codex/plugins/video-ads/scripts/bos_mcp_broker.py",
      "--profile",
      "video-ads"
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        BOS_API_KEY: "configured-client-key",
        BOS_MCP_BASE_URL: `http://127.0.0.1:${address.port}`,
        BOS_ALLOW_INSECURE_TEST_URL: "1"
      },
      stdio: ["pipe", "pipe", "pipe"]
    }
  );
  const responses = new Map();
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    output += chunk;
    const lines = output.split("\n");
    output = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined) responses.set(message.id, message);
    }
  });
  const waitFor = async (id) => {
    const deadline = Date.now() + 5000;
    while (!responses.has(id) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert(responses.has(id), `missing broker response ${id}`);
    return responses.get(id);
  };
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  try {
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {}
    });
    await waitFor(1);
    send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    });
    const listed = await waitFor(2);
    assert.deepEqual(
      listed.result.tools.map((tool) => tool.name),
      ["video_ads_get_readiness"]
    );
    send({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "bos_admin_delete", arguments: {} }
    });
    const rejectedAdmin = await waitFor(4);
    assert.equal(rejectedAdmin.error.code, -32601);
    send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "video_ads_get_readiness",
        arguments: { org_id: "00000000-0000-0000-0000-000000000060" }
      }
    });
    const scoped = await waitFor(3);
    assert.equal(scoped.result.isError, false);
    assert.equal(contextCalls, 0);
  } finally {
    child.stdin.end();
    child.kill();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Video Ads profile fails closed without the client-configured API key", () => {
  const result = spawnSync(
    "python3",
    [
      "clients/codex/plugins/video-ads/scripts/bos_mcp_broker.py",
      "--profile",
      "video-ads"
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: Object.fromEntries(
        Object.entries(process.env).filter(([name]) => name !== "BOS_API_KEY")
      ),
      input: `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {}
      })}\n`
    }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const response = JSON.parse(result.stdout.trim());
  assert.equal(response.error.code, -32000);
  assert.match(response.error.message, /missing its configured BOS API key/);
  assert.doesNotMatch(response.error.message, /password|local window/i);
});

test("iCode composition contains only the shared feedback foundation", async () => {
  const products = await listProducts();
  const byName = Object.fromEntries(
    products.map(({ manifest }) => [manifest.name, manifest])
  );
  const iCode = await resolveProductSkills(byName["icode-operations-center"]);
  assert(iCode.some((skill) => skill.name === "icode-class-operations"));
  const bos = await resolveProductSkills(byName.bos);
  const bosNames = new Set(bos.map((skill) => skill.name));
  const shared = iCode
    .filter((skill) => bosNames.has(skill.name))
    .map((skill) => skill.name);
  assert.deepEqual(shared, ["submit-feedback"]);
});

test("the packaged BOS broker compiles with the system Python runtime", () => {
  const result = spawnSync(
    "python3",
    ["-m", "py_compile", "source/runtime/bos/scripts/bos_mcp_broker.py"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, PYTHONPYCACHEPREFIX: "/tmp/bos-package-pycache" }
    }
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("generated clients exclude Python cache and bytecode files", async () => {
  for (const client of ["codex", "claude", "copilot"]) {
    const files = await walkFiles(`${root}/clients/${client}`);
    assert.equal(
      files.some(
        (path) => path.includes("/__pycache__/") || path.endsWith(".pyc")
      ),
      false
    );
  }
});
