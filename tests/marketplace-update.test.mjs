import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createMarketplaceUpdate, readPublishedBosEntries } from "../scripts/build-marketplace-update.mjs";
import { readZipEntries } from "../scripts/lib/deterministic-zip.mjs";

const legacyName = `app-${"a".repeat(32)}`;
const fixture = () => [
  { path: ".codex-plugin/plugin.json", mode: 0o644, content: Buffer.from('{\n  "name": "bos",\n  "version": "1.2.3",\n  "mcpServers": "./.mcp.json"\n}\n') },
  { path: ".bos-product.json", mode: 0o644, content: Buffer.from('{"name":"bos","version":"1.2.3"}\n') },
  { path: ".mcp.json", mode: 0o644, content: Buffer.from('{"mcpServers":{"synthetic":{"type":"http","url":"https://example.invalid/mcp","oauth_resource":"https://example.invalid/mcp"}}}\n') },
  { path: "skills/synthetic/run.mjs", mode: 0o755, content: Buffer.from("#!/usr/bin/env node\n") }
];

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
});
