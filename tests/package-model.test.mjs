import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
      "video-ad-briefing",
      "video-ad-generation",
      "video-ad-drive-delivery"
    ]
  );
});

test("runtime products use native remote HTTP with environment authentication", async () => {
  for (const client of ["codex", "claude"]) {
    const bos = JSON.parse(
      await readFile(`${root}/clients/${client}/plugins/bos/.mcp.json`, "utf8")
    );
    assert.deepEqual(bos, {
      mcpServers: {
        bos: {
          type: "http",
          url: "https://dfsm.ai/mcp",
          headers: { Authorization: "Bearer ${BOS_API_KEY}" }
        }
      }
    });

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

test("generated clients contain no local MCP transport implementation", async () => {
  for (const client of ["codex", "claude", "copilot"]) {
    const files = await walkFiles(`${root}/clients/${client}`);
    assert.equal(files.some((path) => /bos_mcp_broker|\/bin\//.test(path)), false);
    for (const path of files.filter((path) => path.endsWith(".mcp.json"))) {
      const content = await readFile(path, "utf8");
      assert.doesNotMatch(content, /"command"|"stdio"|127\.0\.0\.1/);
    }
  }
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
  assert.deepEqual(shared, ["submit-feedback"]);
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
