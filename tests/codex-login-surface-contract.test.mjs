import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import test from "node:test";
import { join } from "node:path";
import { promisify } from "node:util";
import { root } from "../scripts/lib/package-model.mjs";

const execFileAsync = promisify(execFile);

const bosProduct = JSON.parse(await readFile(
  join(root, "products", "bos", "product.json"),
  "utf8"
));
const provenBosAppId = bosProduct.codex_connector.id;
const bosResourceUrl = bosProduct.mcp_resource_url;
const pluginRoot = join(root, "clients", "codex", "plugins", "bos");

test("Codex BOS plugin preserves the required root app declaration", async () => {
  const product = JSON.parse(await readFile(
    join(root, "products", "bos", "product.json"),
    "utf8"
  ));
  const plugin = JSON.parse(await readFile(
    join(pluginRoot, ".codex-plugin", "plugin.json"),
    "utf8"
  ));
  const app = JSON.parse(await readFile(join(pluginRoot, ".app.json"), "utf8"));

  assert.equal(product.codex_connector.id, provenBosAppId);
  assert.equal(plugin.apps, "./.app.json");
  assert.equal(plugin.mcpServers, undefined);
  assert.deepEqual(app, {
    apps: {
      bos: {
        id: provenBosAppId,
        required: true
      }
    }
  });
  await assert.rejects(access(join(pluginRoot, ".mcp.json")), /ENOENT/);
});

test("Canonical Vault points active identity guidance at the product source", async () => {
  const [
    decision,
    specification,
    incident,
    conclusion,
    issueHistory,
    supersededReview,
    marketplaceDecision
  ] =
    await Promise.all([
      "Vault/decisions/2026-09-01-codex-registered-app-login-surface.md",
      "Vault/specs/single-bos-mcp-connection.md",
      "Vault/docs/codex-registered-app-incident.md",
      "Vault/docs/issues/conclusions/ISSUE_0001_CONCLUSION.md",
      "Vault/docs/issues/ISSUE_HISTORY.md",
      "Vault/reviews/2026-08-29-durable-codex-app-identity.md",
      "Vault/decisions/2026-08-11-desktop-private-marketplace-oauth.md"
    ].map((path) => readFile(join(root, path), "utf8")));

  for (const canonicalSource of [
    decision,
    specification,
    issueHistory
  ]) {
    assert.match(canonicalSource, /products\/bos\/product\.json/);
  }

  assert.match(decision, /immutable/i);
  assert.match(
    decision,
    /[Cc]ommit `e46546c`/
  );
  assert.match(
    specification,
    /products\/bos\/product\.json[\s\S]{0,160}sole authored identity/
  );
  assert.match(incident, /replacement/i);
  assert.match(conclusion, /regression/i);
  assert.match(supersededReview, /Status: Superseded on 2026-09-01/);
  assert.match(supersededReview, /SUPERSEDED\s*$/);
  assert.doesNotMatch(supersededReview, /does not approve[\s\S]*\nAPPROVED\s*$/i);
  assert.match(
    marketplaceDecision,
    /exact identifier format and value are governed by the superseding[\s\S]*2026-09-01 Codex login-surface decision/i
  );
});

test("GPT always renders Connect or Reconnect independently of resolver and grant state", async () => {
  const contract = JSON.parse(await readFile(
    join(root, "contracts", "codex-login-surface.v1.json"),
    "utf8"
  ));

  assert.equal(contract.action.always_visible, true);
  assert.deepEqual(contract.action.allowed_labels, ["Connect", "Reconnect"]);
  assert.deepEqual(contract.action.display_metadata_fallback_order, [
    "connector_metadata",
    "directory_app",
    "plugin_declaration"
  ]);
  assert.equal(contract.action.raw_id_is_renderable, true);
  assert.deepEqual(contract.action.visibility_inputs, [
    "plugin_declares_root_bos_app"
  ]);
  assert(contract.action.forbidden_visibility_inputs.includes(
    "connector_metadata_resolved"
  ));
  assert(contract.action.forbidden_visibility_inputs.includes(
    "connector_metadata_request_succeeded"
  ));
  assert(contract.action.forbidden_visibility_inputs.includes(
    "display_name_is_friendly"
  ));
  assert(contract.action.forbidden_visibility_inputs.includes(
    "connection_exists"
  ));
  assert(contract.action.forbidden_visibility_inputs.includes(
    "connection_inventory_request_succeeded"
  ));
  assert(contract.action.forbidden_visibility_inputs.includes(
    "oauth_grant_valid"
  ));
  assert(contract.action.forbidden_visibility_inputs.includes(
    "callable_tools_loaded"
  ));
  assert(contract.action.forbidden_visibility_inputs.includes(
    "tool_discovery_request_succeeded"
  ));

  for (const state of contract.states) {
    assert.equal(state.visible, true, JSON.stringify(state));
    assert(
      contract.action.allowed_labels.includes(state.label),
      JSON.stringify(state)
    );
  }

  const unresolved = contract.states.find((state) =>
    state.connector_metadata === "missing"
  );
  assert.equal(unresolved.label, "Connect");
  assert.equal(unresolved.connector_metadata_request, "failed");
  assert.equal(unresolved.display_name, "raw_id");
  assert.equal(unresolved.connection_inventory_request, "failed");
  assert.equal(unresolved.tool_discovery_request, "failed");

  const unusableGrant = contract.states.find((state) =>
    state.grant === "expired_or_invalid"
  );
  assert.equal(unusableGrant.label, "Reconnect");

  assert.equal(contract.diagnostics.default_enabled, true);
  assert.equal(
    contract.diagnostics.disable_environment_variable,
    "BOS_HTTP_DEBUG=0"
  );
  assert.equal(contract.diagnostics.stream, "stderr");
  assert.equal(contract.diagnostics.format, "ndjson");
  assert.equal(contract.diagnostics.correlation_field, "request_id");
  assert.deepEqual(contract.diagnostics.required_pairs, [
    "http.request:http.response_or_http.error",
    "protocol.request:protocol.response_or_protocol.error"
  ]);
  assert(contract.diagnostics.required_redactions.includes("authorization"));
  assert(contract.diagnostics.required_redactions.includes("account_id"));
  assert.equal(contract.diagnostics.preserve_stdout_contract_output, true);
});

test("Codex Login cannot regress to direct-MCP-only or optional app packaging", async () => {
  const app = JSON.parse(await readFile(join(pluginRoot, ".app.json"), "utf8"));
  const content = JSON.stringify(app);

  assert.equal(app.apps.bos.required, true);
  assert.deepEqual(Object.keys(app.apps.bos).sort(), ["id", "required"]);
  assert.doesNotMatch(content, /authorization|bearer_token_env_var/i);
});

test("Canonical customer guidance requires the registered app and rejects a direct Codex MCP binding", async () => {
  const authenticationGuidance = await readFile(
    join(
      root,
      "source",
      "platform",
      "authentication-context-integrity",
      "SKILL.md"
    ),
    "utf8"
  );
  const supportStateMachine = await readFile(
    join(
      root,
      "source",
      "platform",
      "bos-guided-support",
      "references",
      "support-state-machine.md"
    ),
    "utf8"
  );
  const marketplaceHarness = await readFile(
    join(root, "Vault", "docs", "marketplace-agent-harness-plan.md"),
    "utf8"
  );
  const implementationTasks = await readFile(
    join(root, "Vault", "docs", "IMPLEMENTATION_TASKS.md"),
    "utf8"
  );

  assert.match(
    authenticationGuidance,
    /ChatGPT\/Codex packages[\s\S]*required package-owned root BOS app in `\.app\.json`/
  );
  assert.match(
    authenticationGuidance,
    /package exactly one required[\s\S]*`\.app\.json` declaration[\s\S]*no direct[\s\S]*`\.mcp\.json`/
  );
  assert.doesNotMatch(
    authenticationGuidance,
    /ChatGPT\/Codex[\s\S]{0,200}(?:package|declare)[\s\S]{0,120}`\.mcp\.json`[\s\S]{0,120}no[\s\S]{0,80}`\.app\.json`/
  );
  assert.match(
    supportStateMachine,
    /Codex restore the required package-owned `\.app\.json` registered-app declaration/
  );
  assert.doesNotMatch(supportStateMachine, /package-owned MCP declaration/);
  for (const activeVaultGuidance of [marketplaceHarness, implementationTasks]) {
    assert.match(
      activeVaultGuidance,
      /Codex[\s\S]{0,160}required[\s\S]{0,120}`\.app\.json`[\s\S]{0,160}no direct[\s\S]{0,80}`\.mcp\.json`/
    );
    assert.doesNotMatch(
      activeVaultGuidance,
      /Codex(?: runtime products| uses)[\s\S]{0,120}`\.mcp\.json`[\s\S]{0,120}no `\.app\.json`/
    );
  }
});

test("Codex Login display binding remains independent from server OAuth discovery", async () => {
  const contract = JSON.parse(await readFile(
    join(root, "contracts", "single-bos-mcp-connection.v1.json"),
    "utf8"
  ));

  assert.equal(contract.codex_app_id, provenBosAppId);
  assert.equal(contract.resource_url, bosResourceUrl);
  assert.equal(contract.codex_app_required, true);
  assert(contract.connection_artifacts.includes(
    "clients/codex/plugins/bos/.app.json"
  ));
  assert(!contract.connection_artifacts.includes(
    "clients/codex/plugins/bos/.mcp.json"
  ));
});

test("Codex Login release contract requires separately verified GPT UI evidence", async () => {
  const contract = JSON.parse(await readFile(
    join(root, "contracts", "codex-login-surface.v1.json"),
    "utf8"
  ));
  const packageManifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  assert.equal(contract.visual_acceptance.required, true);
  assert.equal(
    contract.visual_acceptance.artifact_pattern,
    "Vault/evidence/codex-login/<version>-connect-button.png"
  );
  assert.equal(
    contract.visual_acceptance.review_artifact_pattern,
    "Vault/evidence/codex-login/<version>-connect-button.review.json"
  );
  assert.equal(
    packageManifest.scripts["acceptance:codex-login"],
    "node scripts/verify-codex-login-evidence.mjs"
  );
});

test("Codex Login evidence requires an Oracle-reviewed hash and visible action", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bos-login-evidence-"));
  const screenshot = join(directory, `${bosProduct.version}-connect-button.png`);
  const review = join(directory, `${bosProduct.version}-connect-button.review.json`);
  const image = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(2048)
  ]);
  await writeFile(screenshot, image);
  const receipt = {
    schema_version: "1",
    product_version: bosProduct.version,
    screenshot: `${bosProduct.version}-connect-button.png`,
    screenshot_sha256: createHash("sha256").update(image).digest("hex"),
    surface: "GPT_PLUGIN_DETAIL",
    visible_action: "Connect",
    reviewer: "ORACLE",
    verdict: "APPROVED"
  };
  await writeFile(review, `${JSON.stringify(receipt, null, 2)}\n`);
  const command = join(root, "scripts", "verify-codex-login-evidence.mjs");
  const accepted = await execFileAsync(process.execPath, [
    command,
    "--screenshot", screenshot,
    "--review", review,
    "--json"
  ]);
  assert.equal(JSON.parse(accepted.stdout).ok, true);

  await writeFile(review, `${JSON.stringify({
    ...receipt,
    screenshot_sha256: "0".repeat(64)
  }, null, 2)}\n`);
  await assert.rejects(
    execFileAsync(process.execPath, [
      command,
      "--screenshot", screenshot,
      "--review", review,
      "--json"
    ]),
    (error) => {
      const report = JSON.parse(error.stdout);
      assert.equal(report.ok, false);
      assert.match(report.failure, /does not match/);
      return true;
    }
  );
});

test("Codex Login acceptance includes a version-matched GPT plugin screenshot", async () => {
  const evidence = await readFile(join(
    root,
    "Vault",
    "evidence",
    "codex-login",
    `${bosProduct.version}-connect-button.png`
  ));
  assert(evidence.length > 1024, "Login screenshot evidence is unexpectedly small");
  assert.deepEqual(
    [...evidence.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "Login acceptance evidence must be a PNG screenshot"
  );
});
