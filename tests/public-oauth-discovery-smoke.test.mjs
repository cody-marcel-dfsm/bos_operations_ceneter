import test from "node:test";
import assert from "node:assert/strict";
import { probePublicOAuthDiscovery, compareDiscoveryReports } from "../scripts/lib/public-oauth-discovery-smoke.mjs";

const origin = "https://bos.example";
const resource = `${origin}/mcp/apps/bos/platform`;
const prm = `${origin}/custom-public-metadata`;
function fixtures() {
  return [
    { status: 401, headers: new Headers({ "www-authenticate": `Bearer resource_metadata="${prm}", scope="mcp:tools"`, "set-cookie": "secret-cookie", "x-request-id": "safe-correlation" }), body: { token: "secret-token" } },
    { status: 200, headers: new Headers(), body: { resource, authorization_servers: [origin], scopes_supported: ["mcp:tools"], client_secret: "secret-client" } },
    { status: 200, headers: new Headers(), body: { issuer: origin, authorization_endpoint: `${origin}/authorize`, token_endpoint: `${origin}/token`, grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], access_token: "secret-access" } }
  ];
}
async function run(responses = fixtures()) {
  const urls = [];
  const report = await probePublicOAuthDiscovery({ resourceUrl: resource,
    request: async url => { urls.push(url); return responses.shift(); } });
  return { report, urls };
}
test("follows advertised public metadata with only GET adapter calls and stores no secrets", async () => {
  const { report, urls } = await run();
  assert.equal(report.status, "passed");
  assert.deepEqual(urls, [resource, prm, `${origin}/.well-known/oauth-authorization-server`]);
  assert.equal(report.requests[0].headers["x-request-id"], "safe-correlation");
  assert.doesNotMatch(JSON.stringify(report), /secret-|set-cookie|access_token|client_secret/);
  assert.match(report.scope, /full login is unverified/);
});
test("network failure is blocked, while observed resource/PKCE defects are failed", async () => {
  const { report: blocked } = await run([{ failure: { code: "dns" } }]);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.findings[0].category, "transport_or_tool");
  const responses = fixtures();
  responses[1].body.resource = `${origin}/other`;
  responses[2].body.code_challenge_methods_supported = ["plain"];
  const { report } = await run(responses);
  assert.equal(report.status, "failed");
  assert.deepEqual(report.findings.map(x => x.code), ["resource_mismatch", "pkce_s256_missing"]);
});
test("unsafe advertised URL is rejected without a follow-up or leaking its query", async () => {
  const responses = fixtures();
  responses[0].headers.set("www-authenticate", `Bearer resource_metadata="${prm}?token=secret-token"`);
  const { report, urls } = await run(responses);
  assert.equal(urls.length, 1);
  assert.equal(report.status, "failed");
  assert.doesNotMatch(JSON.stringify(report), /secret-token/);
});
test("malformed JSON and failed metadata HTTP status are explicit failures", async () => {
  for (const response of [{ status: 200, body: null }, { status: 503, body: {} }]) {
    const responses = fixtures();
    responses[1] = { ...response, headers: new Headers() };
    const { report } = await run(responses);
    assert.equal(report.status, "failed");
    assert.equal(report.findings[0].operation, "protected_resource_metadata");
  }
});
test("comparison ignores timestamps and correlation but detects metadata changes", async () => {
  const { report: previous } = await run();
  const current = structuredClone(previous);
  current.observed_at = "later";
  current.requests[0].observed_at = "later";
  current.requests[0].headers["x-request-id"] = "new-correlation";
  assert.equal(compareDiscoveryReports(previous, current).changed, false);
  current.requests[2].metadata.code_challenge_methods_supported = ["plain"];
  assert.equal(compareDiscoveryReports(previous, current).changed, true);
  assert.throws(() => compareDiscoveryReports(previous, { ...current, resource: `${origin}/other` }), /matching/);
});
