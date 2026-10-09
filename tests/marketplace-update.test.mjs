import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createMarketplaceUpdate, readPublishedBosEntries, readPublishedProductEntries } from "../scripts/build-marketplace-update.mjs";
import { readZipEntries } from "../scripts/lib/deterministic-zip.mjs";

const legacyName = `app-${"a".repeat(32)}`;
const fixture = () => [
  { path: ".codex-plugin/plugin.json", mode: 0o644, content: Buffer.from('{\n  "name": "bos",\n  "version": "1.2.3",\n  "mcpServers": "./.mcp.json"\n}\n') },
  { path: ".bos-product.json", mode: 0o644, content: Buffer.from('{"name":"bos","version":"1.2.3"}\n') },
  { path: ".mcp.json", mode: 0o644, content: Buffer.from('{"mcpServers":{"synthetic":{"type":"http","url":"https://example.invalid/mcp","oauth_resource":"https://example.invalid/mcp"}}}\n') },
  { path: "skills/synthetic/run.mjs", mode: 0o755, content: Buffer.from("#!/usr/bin/env node\n") }
];

const educationFixture = () => [
  { path: ".codex-plugin/plugin.json", mode: 0o644, content: Buffer.from('{\n  "name": "education-center",\n  "version": "0.4.191"\n}\n') },
  { path: ".bos-product.json", mode: 0o644, content: Buffer.from('{"name":"education-center","version":"0.4.191","connection_owner":"bos","dependency_products":["bos"]}\n') },
  { path: "skills/synthetic/run.mjs", mode: 0o755, content: Buffer.from("#!/usr/bin/env node\n") }
];

test("Education marketplace identity mapping preserves its canonical identity, bytes and version", () => {
  const entries = educationFixture();
  const result = createMarketplaceUpdate(entries, legacyName, { product: "education-center" });
  const actual = readZipEntries(result.archive);
  assert.equal(result.version, "0.4.191");
  assert.equal(actual.size, entries.length);
  for (const entry of entries) {
    const expected = entry.path === ".codex-plugin/plugin.json" ? Buffer.from(entry.content.toString().replace('"education-center"', JSON.stringify(legacyName))) : entry.content;
    assert.deepEqual(actual.get(entry.path), { content: expected, mode: entry.mode });
  }
  assert.equal(JSON.parse(entries[0].content).name, "education-center");
  assert.ok(createMarketplaceUpdate([...entries].reverse(), legacyName, { product: "education-center" }).archive.equals(result.archive));
});

test("Education export rejects mismatched products and independent connection declarations", () => {
  assert.throws(() => createMarketplaceUpdate(educationFixture(), legacyName), /stable canonical/);
  assert.throws(() => createMarketplaceUpdate(fixture(), legacyName, { product: "education-center" }), /stable canonical/);
  assert.throws(() => createMarketplaceUpdate(educationFixture(), legacyName, { product: "education-center", preserveExistingMcp: true }), /BOS-only/);
  assert.throws(() => readPublishedProductEntries("a".repeat(40), "../bos"), /Unsupported/);
  for (const change of [
    entries => entries.push({ path: ".mcp.json", mode: 0o644, content: Buffer.from("{}") }),
    entries => { const manifest = JSON.parse(entries[0].content); manifest.mcpServers = "./.mcp.json"; entries[0].content = Buffer.from(JSON.stringify(manifest)); },
    entries => { const metadata = JSON.parse(entries[1].content); metadata.connection_owner = "education-center"; entries[1].content = Buffer.from(JSON.stringify(metadata)); }
  ]) {
    const entries = educationFixture(); change(entries);
    assert.throws(() => createMarketplaceUpdate(entries, legacyName, { product: "education-center" }), /BOS-owned/);
  }
});

test("Education export retains accepted published-commit provenance and real package parity", () => {
  const revision = execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim();
  assert.throws(() => readPublishedProductEntries("main", "education-center"), /exact 40-character/);
  assert.throws(() => readPublishedProductEntries("a".repeat(40), "education-center"), /Command failed/);
  const entries = readPublishedProductEntries(revision, "education-center");
  const actual = readZipEntries(createMarketplaceUpdate(entries, legacyName, { product: "education-center" }).archive);
  assert.ok(entries.length > 3);
  assert.equal(actual.size, entries.length);
  for (const entry of entries.filter(entry => entry.path !== ".codex-plugin/plugin.json")) assert.deepEqual(actual.get(entry.path), { content: entry.content, mode: entry.mode });
  assert.equal(actual.has(".mcp.json"), false);
});

test("marketplace update preserves release bytes, modes and version except the required name token", () => {
  const entries = fixture();
  const originals = entries.map(entry => Buffer.from(entry.content));
  const result = createMarketplaceUpdate(entries, legacyName);
  const actual = readZipEntries(result.archive);
  assert.equal(result.version, "1.2.3");
  assert.equal(actual.size, entries.length);
  for (const [index, entry] of entries.entries()) {
    assert.ok(entry.content.equals(originals[index]));
    assert.equal(actual.get(entry.path).mode, entry.mode);
    const expected = index === 0 ? entry.content.toString().replace('"bos"', JSON.stringify(legacyName)) : entry.content;
    assert.ok(actual.get(entry.path).content.equals(Buffer.from(expected)));
  }
  assert.ok(createMarketplaceUpdate([...entries].reverse(), legacyName).archive.equals(result.archive));
});

test("marketplace export rejects malformed names, missing files, ambiguous identity and divergent release versions", () => {
  for (const name of ["bos", "app-../private", `app-${"A".repeat(32)}`, `${legacyName}\n`, ""]) {
    assert.throws(() => createMarketplaceUpdate(fixture(), name), /legacy listing/);
  }
  assert.throws(() => readPublishedBosEntries("main"), /exact 40-character/);
  assert.throws(() => readPublishedBosEntries(`${"a".repeat(40)}\n`), /exact 40-character/);
  assert.throws(() => readPublishedBosEntries("a".repeat(40)), /Command failed/);
  assert.throws(() => createMarketplaceUpdate(fixture().slice(0, 2), legacyName), /Expected one/);
  const divergent = fixture();
  divergent[1].content = Buffer.from('{"name":"bos","version":"1.2.4"}');
  assert.throws(() => createMarketplaceUpdate(divergent, legacyName), /stable canonical/);
  const ambiguous = fixture();
  ambiguous[0].content = Buffer.from('{"name":"bos","name":"bos","version":"1.2.3"}');
  assert.throws(() => createMarketplaceUpdate(ambiguous, legacyName), /Ambiguous/);
  const symlink = fixture(); symlink[3].mode = 0o777;
  assert.throws(() => createMarketplaceUpdate(symlink, legacyName), /Unsupported/);
});

test("published release export verifies accepted Git provenance and preserves every real package entry", () => {
  const revision = execFileSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).trim();
  const entries = readPublishedBosEntries(revision);
  assert.ok(entries.length > 3);
  const actual = readZipEntries(createMarketplaceUpdate(entries, legacyName).archive);
  for (const entry of entries.filter(entry => entry.path !== ".codex-plugin/plugin.json")) {
    assert.equal(actual.get(entry.path).mode, entry.mode);
    assert.ok(actual.get(entry.path).content.equals(entry.content));
  }
  const legacy = readZipEntries(createMarketplaceUpdate(entries, legacyName, { preserveExistingMcp: true }).archive);
  const before = JSON.parse(entries.find(entry => entry.path === ".codex-plugin/plugin.json").content);
  const after = JSON.parse(legacy.get(".codex-plugin/plugin.json").content);
  delete before.mcpServers; before.name = legacyName;
  assert.deepEqual(after, before);
  for (const entry of entries.filter(entry => entry.path !== ".codex-plugin/plugin.json")) {
    assert.equal(legacy.get(entry.path).mode, entry.mode);
    assert.ok(legacy.get(entry.path).content.equals(entry.content));
  }
});

test("explicit legacy metadata mode omits only the manifest MCP declaration and keeps configuration inert", () => {
  const entries = fixture();
  const originals = entries.map(entry => Buffer.from(entry.content));
  const options = { preserveExistingMcp: true };
  const result = createMarketplaceUpdate(entries, legacyName, options);
  const actual = readZipEntries(result.archive);
  const expected = JSON.parse(entries[0].content);
  expected.name = legacyName; delete expected.mcpServers;
  assert.deepEqual(JSON.parse(actual.get(entries[0].path).content), expected);
  assert.equal(result.version, "1.2.3");
  assert.equal(result.preserveExistingMcp, true);
  assert.equal(actual.size, entries.length);
  for (const [index, entry] of entries.entries()) {
    assert.ok(entry.content.equals(originals[index]));
    assert.equal(actual.get(entry.path).mode, entry.mode);
    if (index !== 0) assert.ok(actual.get(entry.path).content.equals(entry.content));
  }
  assert.ok(createMarketplaceUpdate(entries, legacyName, options).archive.equals(result.archive));
  const ordinary = readZipEntries(createMarketplaceUpdate(entries, legacyName, { preserveExistingMcp: false }).archive);
  assert.equal(JSON.parse(ordinary.get(entries[0].path).content).mcpServers, "./.mcp.json");
  assert.equal(actual.has(".app.json"), false);
});

test("legacy metadata mode rejects implicit options and noncanonical connection declarations", () => {
  for (const options of [null, [], { preserveExistingMcp: "true" }, { replaceConnection: true }]) {
    assert.throws(() => createMarketplaceUpdate(fixture(), legacyName, options), /Invalid marketplace/);
  }
  const inherited = Object.create({ preserveExistingMcp: true });
  assert.equal(createMarketplaceUpdate(fixture(), legacyName, inherited).preserveExistingMcp, false);
  const missing = fixture();
  missing[0].content = Buffer.from('{"name":"bos","version":"1.2.3"}');
  assert.throws(() => createMarketplaceUpdate(missing, legacyName, { preserveExistingMcp: true }), /canonical final MCP/);
  const conflicting = fixture();
  const manifest = JSON.parse(conflicting[0].content); manifest.apps = "./.app.json";
  conflicting[0].content = Buffer.from(JSON.stringify(manifest, null, 2));
  assert.throws(() => createMarketplaceUpdate(conflicting, legacyName, { preserveExistingMcp: true }), /canonical final MCP/);
});
