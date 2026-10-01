import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { signOutCurrentConnection, logoutReceipt } from "../source/platform/bos-mcp-client/scripts/logout.mjs";

const resourceMetadataUrl = "https://bos.example.test/.well-known/oauth-protected-resource/mcp/apps/bos/platform";
const descriptor = { name: "bos_logout", inputSchema: {
  type: "object", properties: {}, required: [], additionalProperties: false,
} };
const receipt = { structuredContent: { status: "signed_out", scope: "current_connection" } };

function fixture(overrides = {}) {
  const calls = [];
  const preferences = { bos: "confirmed", dependent: "confirmed" };
  const reuse = { current: ["context", "descriptor", "continuation"], other: ["other-context"] };
  return { calls, preferences, reuse, host: {
    resourceMetadataUrl,
    listTools: async () => { calls.push("discover"); return [descriptor]; },
    callTool: async (request) => { calls.push(request); return receipt; },
    discardAuthorityReuse: async () => { calls.push("discard"); reuse.current = []; },
    invalidateAuthorityCache: async () => { calls.push("invalidate-current"); },
    ...overrides,
  } };
}

test("logout uses the discovered empty-input operation and terminates with scoped cleanup", async () => {
  const f = fixture();
  assert.deepEqual(await signOutCurrentConnection(f.host), {
    status: "signed_out", terminal: true, reuseDiscarded: true, cacheCleanup: "complete",
  });
  assert.deepEqual(f.calls, ["discover", { name: "bos_logout", arguments: {} }, "discard", "invalidate-current"]);
  assert.deepEqual(f.reuse, { current: [], other: ["other-context"] });
  assert.deepEqual(f.preferences, { bos: "confirmed", dependent: "confirmed" });
});

for (const stage of ["listTools", "callTool"]) {
  test(`canonical challenged 401 during ${stage} is terminal signed out`, async () => {
    const f = fixture({ [stage]: async () => { throw {
      status: 401, headers: { "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"` },
    }; } });
    assert.equal((await signOutCurrentConnection(f.host)).status, "signed_out");
    assert.equal(f.calls.filter((call) => typeof call === "object").length, 0);
    assert.deepEqual(f.reuse.current, []);
  });
}

for (const error of [{ status: 401 }, { status: 401, headers: {
  "WWW-Authenticate": 'Bearer resource_metadata="https://other.example.test/metadata"',
} }, new Error("transport lost")]) {
  test("unconfirmed logout neither retries nor treats another audience as signed out", async () => {
    let attempted = 0;
    const f = fixture({ callTool: async () => { attempted++; throw error; } });
    assert.equal((await signOutCurrentConnection(f.host)).status, "unconfirmed");
    assert.equal(attempted, 1);
    assert.deepEqual(f.reuse.current, []);
  });
}

test("missing or selector-bearing logout contracts preserve the current connection", async () => {
  for (const tools of [[], [{ ...descriptor, inputSchema: {
    ...descriptor.inputSchema, properties: { context_handle: { type: "string" } },
  } }]]) {
    const f = fixture({ listTools: async () => tools });
    assert.deepEqual(await signOutCurrentConnection(f.host), { status: "unsupported", terminal: true });
    assert.deepEqual(f.calls, []);
    assert.equal(f.reuse.current.length, 3);
  }
});

test("only the exact receipt confirms logout; cleanup failures remain explicit", async () => {
  for (const result of [null, { ...receipt, isError: true }, { structuredContent: {
    ...receipt.structuredContent, scope: "all_connections",
  } }, { structuredContent: { ...receipt.structuredContent, token: "fixture" } }]) {
    assert.equal(logoutReceipt(result), false);
    const f = fixture({ callTool: async () => result });
    assert.equal((await signOutCurrentConnection(f.host)).status, "unconfirmed");
  }
  const f = fixture({ invalidateAuthorityCache: undefined });
  assert.equal((await signOutCurrentConnection(f.host)).cacheCleanup, "unavailable");
  const failed = fixture({ invalidateAuthorityCache: async () => { throw Error("unavailable"); } });
  assert.equal((await signOutCurrentConnection(failed.host)).cacheCleanup, "failed");
});

test("every generated client ships the canonical terminal logout helper and precedence", async () => {
  const canonical = await readFile(new URL("../source/platform/bos-mcp-client/scripts/logout.mjs", import.meta.url), "utf8");
  const paths = ["clients/claude/plugins/bos/skills", "clients/claude/plugins/education-center/skills",
    "clients/codex/plugins/bos/skills", "clients/codex/plugins/education-center/skills",
    "clients/copilot/products/bos/skills", "clients/copilot/products/education-center/skills",
    "clients/gemini/extensions/bos/skills", "clients/gemini/extensions/education-center/skills"];
  for (const path of paths) {
    assert.equal(await readFile(new URL(`../${path}/bos-mcp-client/scripts/logout.mjs`, import.meta.url), "utf8"), canonical);
    const shipped = await readdir(new URL(`../${path}/`, import.meta.url));
    for (const skill of ["bos-plugin-console", "bos-guided-support"].filter((name) => shipped.includes(name))) {
      const content = await readFile(new URL(`../${path}/${skill}/SKILL.md`, import.meta.url), "utf8");
      const logout = content.indexOf("sign-out");
      const identity = content.indexOf("identity-context");
      assert.ok(logout > 0 && (identity < 0 || logout < identity));
      const initialization = content.indexOf("Before performing this skill's workflow");
      assert.ok(initialization < 0 || logout < initialization);
    }
  }
});
