import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
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
    `${root}/clients/copilot/products/icode-operations-center/config/customer-settings.template.json`,
    `${root}/clients/gemini/extensions/icode-operations-center/config/customer-settings.template.json`
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

test("Video Ads composes workflow skills and a scoped BOS endpoint", async () => {
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
      "manage-customer-extension",
      "video-ad-briefing",
      "video-ad-generation",
      "video-ad-drive-delivery"
    ]
  );
});

test("runtime products use native installed-app-bound MCP with bearer authentication", async () => {
  for (const client of ["codex", "claude"]) {
    const bos = JSON.parse(
      await readFile(`${root}/clients/${client}/plugins/bos/.mcp.json`, "utf8")
    );
    assert.equal(bos.mcpServers.bos.type, "http");
    assert.equal(
      bos.mcpServers.bos.url,
      "https://dfsm.ai/mcp/apps/${BOS_INSTALLED_APP_ID}"
    );
    assert.equal(
      bos.mcpServers.bos.headers.Authorization,
      "Bearer ${BOS_API_KEY}"
    );

    const videoAds = JSON.parse(
      await readFile(
        `${root}/clients/${client}/plugins/video-ads/.mcp.json`,
        "utf8"
      )
    );
    assert.deepEqual(Object.keys(videoAds.mcpServers), ["video-ads"]);
    assert.equal(videoAds.mcpServers["video-ads"].type, "http");
    assert.equal(
      videoAds.mcpServers["video-ads"].url,
      "https://dfsm.ai/mcp/video-ads"
    );
    assert.equal(
      videoAds.mcpServers["video-ads"].headers.Authorization,
      "Bearer ${BOS_API_KEY}"
    );
  }
});

test("iCode packages embed their installed-app-bound BOS connection", async () => {
  for (const [client, path] of [
    ["codex", `${root}/clients/codex/plugins/icode-operations-center/.mcp.json`],
    ["claude", `${root}/clients/claude/plugins/icode-operations-center/.mcp.json`]
  ]) {
    const config = JSON.parse(await readFile(path, "utf8"));
    assert.equal(config.mcpServers.bos.type, "http", client);
    assert.equal(
      config.mcpServers.bos.url,
      "https://dfsm.ai/mcp/apps/${BOS_INSTALLED_APP_ID}",
      client
    );
    assert.equal(
      config.mcpServers.bos.headers.Authorization,
      "Bearer ${BOS_API_KEY}",
      client
    );
  }
});

test("Claude distribution is a marketplace of self-contained plugins", async () => {
  const marketplace = JSON.parse(
    await readFile(
      `${root}/clients/claude/.claude-plugin/marketplace.json`,
      "utf8"
    )
  );
  assert.equal(marketplace.name, "bos-icode");
  assert.deepEqual(
    marketplace.plugins.map(({ name, source }) => ({ name, source })),
    [
      { name: "bos", source: "./plugins/bos" },
      {
        name: "icode-operations-center",
        source: "./plugins/icode-operations-center"
      },
      { name: "video-ads", source: "./plugins/video-ads" }
    ]
  );
  await assert.rejects(
    access(`${root}/clients/claude/.claude-plugin/plugin.json`),
    /ENOENT/
  );
  await assert.rejects(access(`${root}/clients/claude/.mcp.json`), /ENOENT/);
  const iCodeReadme = await readFile(
    `${root}/clients/claude/plugins/icode-operations-center/README.md`,
    "utf8"
  );
  assert.match(iCodeReadme, /authenticated adult/);
  assert.match(iCodeReadme, /Students and minors are data subjects/);
  assert.match(iCodeReadme, /minimum-necessary disclosure/);
  assert.match(iCodeReadme, /https:\/\/dfsm\.ai\/apps\/bos\/privacy\.html/);
});

test("generated clients use native remote MCP without local transport", async () => {
  for (const client of ["codex", "claude", "copilot", "gemini"]) {
    const files = await walkFiles(`${root}/clients/${client}`);
    assert.equal(files.some((path) => /bos_mcp_broker\.py$/.test(path)), false);
    assert.equal(files.some((path) => /__pycache__|\.pyc$|\/bin\//.test(path)), false);
    for (const path of files.filter((path) => path.endsWith(".mcp.json"))) {
      const content = await readFile(path, "utf8");
      assert.doesNotMatch(content, /"command"|"stdio"|127\.0\.0\.1/);
    }
  }
});

test("Gemini extensions bundle canonical skills and Streamable HTTP MCP", async () => {
  const manifest = JSON.parse(
    await readFile(
      `${root}/clients/gemini/extensions/bos/gemini-extension.json`,
      "utf8"
    )
  );
  assert.equal(manifest.name, "bos");
  assert.equal(
    manifest.mcpServers.bos.httpUrl,
    "https://dfsm.ai/mcp/apps/${BOS_INSTALLED_APP_ID}"
  );
  assert.equal(manifest.mcpServers.bos.url, undefined);
  assert.equal(
    manifest.mcpServers.bos.headers.Authorization,
    "Bearer ${BOS_API_KEY}"
  );
  assert.deepEqual(
    manifest.settings.map(({ envVar, sensitive }) => ({ envVar, sensitive })),
    [
      { envVar: "BOS_API_KEY", sensitive: true },
      { envVar: "BOS_INSTALLED_APP_ID", sensitive: false }
    ]
  );
  await access(
    `${root}/clients/gemini/extensions/bos/skills/submit-feedback/SKILL.md`
  );
});

test("feedback contract keeps route scope in the connection and retry identity stable", async () => {
  const runtime = JSON.parse(
    await readFile(`${root}/source/runtime/bos/.mcp.json`, "utf8")
  );
  const url = runtime.mcpServers.bos.url;
  assert.equal(url, "https://dfsm.ai/mcp/apps/${BOS_INSTALLED_APP_ID}");
  assert.notEqual(url, "https://dfsm.ai/mcp");
  assert.notEqual(
    url.replace("${BOS_INSTALLED_APP_ID}", "install-a"),
    url.replace("${BOS_INSTALLED_APP_ID}", "install-b")
  );

  const skill = await readFile(
    `${root}/source/platform/submit-feedback/SKILL.md`,
    "utf8"
  );
  const contract = await readFile(
    `${root}/source/platform/submit-feedback/references/feedback-contract.md`,
    "utf8"
  );
  assert.match(skill, /Copy only `delegated_role_id`/);
  assert.match(skill, /Never put\s+`org_id`, `app_code`, or `installed_app_id`/);
  assert.match(skill, /retry once with the same submission ID/);
  assert.match(skill, /Do not claim triage, assignment, prioritization/);
  assert.match(contract, /missing_or_ambiguous_scope/);
  assert.match(contract, /feedback_create_not_allowed/);
  assert.match(contract, /feedback_rate_limit_exceeded/);
  assert.match(contract, /feedback_storage_unavailable/);
  assert.match(contract, /idempotency_conflict/);
  assert.doesNotMatch(contract, /"org_id"|"app_code"|"installed_app_id"/);
});

test("iCode composition contains only the shared feedback foundation", async () => {
  const products = await listProducts();
  const byName = Object.fromEntries(
    products.map(({ manifest }) => [manifest.name, manifest])
  );
  const iCode = await resolveProductSkills(byName["icode-operations-center"]);
  assert(iCode.some((skill) => skill.name === "icode-class-operations"));
  assert(iCode.some((skill) => skill.name === "icode-customer-initialization"));
  const bos = await resolveProductSkills(byName.bos);
  const bosNames = new Set(bos.map((skill) => skill.name));
  const shared = iCode
    .filter((skill) => bosNames.has(skill.name))
    .map((skill) => skill.name);
  assert.deepEqual(shared, ["submit-feedback", "manage-customer-extension"]);
});

test("every product and client ships tenant extension management metadata", async () => {
  const products = await listProducts();
  const roots = {
    codex: (name) => `${root}/clients/codex/plugins/${name}`,
    claude: (name) => `${root}/clients/claude/plugins/${name}`,
    copilot: (name) => `${root}/clients/copilot/products/${name}`,
    gemini: (name) => `${root}/clients/gemini/extensions/${name}`
  };
  for (const { manifest } of products) {
    for (const client of manifest.clients) {
      const productRoot = roots[client](manifest.name);
      const metadata = JSON.parse(
        await readFile(`${productRoot}/.bos-product.json`, "utf8")
      );
      assert.deepEqual(metadata, {
        schema_version: "1",
        name: manifest.name,
        version: manifest.version,
        client
      });
      const manager = await readFile(
        `${productRoot}/skills/manage-customer-extension/SKILL.md`,
        "utf8"
      );
      assert.match(manager, /asks to update, customize, override, specialize/);
    }
  }
});

test("generated feedback skill automatically discovers customer customizations", async () => {
  const products = await listProducts();
  for (const { manifest } of products) {
    const skills = await resolveProductSkills(manifest);
    if (!skills.some((skill) => skill.name === "submit-feedback")) continue;
    for (const client of manifest.clients) {
      const roots = {
        codex: `${root}/clients/codex/plugins/${manifest.name}`,
        claude: `${root}/clients/claude/plugins/${manifest.name}`,
        copilot: `${root}/clients/copilot/products/${manifest.name}`,
        gemini: `${root}/clients/gemini/extensions/${manifest.name}`
      };
      const feedbackRoot = `${roots[client]}/skills/submit-feedback`;
      const skill = await readFile(`${feedbackRoot}/SKILL.md`, "utf8");
      assert.match(skill, /automatically discover customer-owned extensions/i);
      await access(`${feedbackRoot}/scripts/discover-customizations.mjs`);
    }
  }
});

test("generated clients exclude Python cache and bytecode files", async () => {
  for (const client of ["codex", "claude", "copilot", "gemini"]) {
    const files = await walkFiles(`${root}/clients/${client}`);
    assert.equal(
      files.some(
        (path) => path.includes("/__pycache__/") || path.endsWith(".pyc")
      ),
      false
    );
  }
});
