import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  listProducts,
  copilotMcpManifest,
  geminiExtensionManifest,
  geminiPluginManifest,
  geminiPluginMcpManifest,
  injectProductInitializationPreflight,
  injectSettingsPreflight,
  materializeMcpUrl,
  pathExists,
  pluginManifest,
  productInitializationIndependentSkills,
  transformProductSkillGuidance,
  resolveProductSkills,
  root,
  walkFiles,
  validateProduct
} from "../scripts/lib/package-model.mjs";

const execFileAsync = promisify(execFile);

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

test("BOS packages ship MCP-optional visual guided support on every client", async () => {
  const products = await listProducts();
  const bos = products.find(({ manifest }) => manifest.name === "bos");
  assert(bos, "bos product must exist");
  assert(bos.manifest.includes.includes("platform/bos-guided-support"));

  const skills = await resolveProductSkills(bos.manifest);
  const support = skills.find((skill) => skill.name === "bos-guided-support");
  assert(support, "bos must include guided support");

  const guidance = await readFile(support.skillFile, "utf8");
  const states = await readFile(
    `${support.sourcePath}/references/support-state-machine.md`,
    "utf8"
  );
  const runbooks = await readFile(
    `${support.sourcePath}/references/client-runbooks.md`,
    "utf8"
  );
  const visual = await readFile(
    `${support.sourcePath}/references/visual-support.md`,
    "utf8"
  );

  assert.match(guidance, /MCP is an enhancement, never a prerequisite/i);
  assert.match(guidance, /Install.*Load.*Register.*Sign in.*Discover.*Verify/s);
  assert.match(guidance, /Preserve\s+progress the user already reported/i);
  assert.match(guidance, /one safe, bounded, authenticated read succeeds/i);
  assert.match(states, /A later-stage error never proves an earlier stage failed/i);
  assert.match(runbooks, /ChatGPT\/Codex Desktop/);
  assert.match(runbooks, /Claude Cowork\/Desktop/);
  assert.match(runbooks, /GitHub Copilot CLI or VS Code/);
  assert.match(runbooks, /Gemini CLI/);
  assert.match(runbooks, /Google Antigravity 2\.0 Desktop/);
  assert.match(visual, /one high-contrast circle or rounded rectangle/i);
  assert.match(visual, /Never fabricate a vendor\s+screenshot/i);

  for (const skillRoot of [
    `${root}/clients/codex/plugins/bos/skills/bos-guided-support`,
    `${root}/clients/claude/plugins/bos/skills/bos-guided-support`,
    `${root}/clients/copilot/products/bos/skills/bos-guided-support`,
    `${root}/clients/gemini/extensions/bos/skills/bos-guided-support`
  ]) {
    await access(`${skillRoot}/SKILL.md`);
    await access(`${skillRoot}/agents/openai.yaml`);
    await access(`${skillRoot}/assets/connection-journey.svg`);
  }
});

test("Education Center packages include customer-neutral settings defaults", async () => {
  for (const path of [
    `${root}/clients/codex/plugins/education-center/config/customer-settings.template.json`,
    `${root}/clients/claude/plugins/education-center/config/customer-settings.template.json`,
    `${root}/clients/copilot/products/education-center/config/customer-settings.template.json`,
    `${root}/clients/gemini/extensions/education-center/config/customer-settings.template.json`
  ]) {
    const settings = JSON.parse(await readFile(path, "utf8"));
    assert.equal(settings.schema_version, "1");
    assert.equal(settings.brand_display_name, "");
    assert.equal(settings.organization_display_name, "");
    assert.equal(settings.organization_website_url, "");
    assert.equal(settings.location_display_name, "");
    assert.equal(settings.timezone, "");
    assert.equal(settings.mailboxes.care_com, "");
    assert.equal(settings.mailboxes.parent_communications, "");
    assert.deepEqual(settings.source_routes, {
      calimatic: "bos",
      lead_director: "bos",
      calendar: "bos",
      parent_communications: "bos",
      care_com: "bos"
    });
  }
});

test("settings products declare an included initializer", async () => {
  const education = (await listProducts()).find(
    ({ manifest }) => manifest.name === "education-center"
  )?.manifest;
  assert(education);
  assert.equal(
    education.settings_initializer,
    "education-center-customer-initialization"
  );
  assert.equal(
    education.plugin_settings_initializer,
    "bos-plugin-settings-initialization"
  );
  assert.deepEqual(validateProduct(education), []);

  const withoutInitializer = { ...education };
  delete withoutInitializer.settings_initializer;
  assert.match(
    validateProduct(withoutInitializer).join("\n"),
    /settings_template and settings_initializer must be declared together/
  );
  assert.match(
    validateProduct({ ...education, settings_initializer: "missing-skill" }).join("\n"),
    /settings_initializer must name an included skill/
  );
});

test("plugin settings initializer is included by subservices using the BOS connection", async () => {
  const education = (await listProducts()).find(
    ({ manifest }) => manifest.name === "education-center"
  )?.manifest;
  assert(education);
  assert.deepEqual(validateProduct(education), []);
  assert.match(
    validateProduct({ ...education, plugin_settings_initializer: "missing-skill" })
      .join("\n"),
    /plugin_settings_initializer must name an included skill/
  );
  assert.equal(education.runtime, undefined);
  assert.equal(education.application_name, undefined);
  assert.equal(education.mcp_group_name, undefined);
  assert.equal(education.codex_app_id, undefined);
});

test("settings preflight injection preserves frontmatter and adds resumable initialization", () => {
  const source = "---\nname: example\ndescription: Example.\n---\n\n# Example\n";
  const output = injectSettingsPreflight(source, "initialize-example");
  assert.match(output, /^---\nname: example\ndescription: Example\.\n---/);
  assert.match(output, /validate its customer-owned `config\/customer-settings\.json`/i);
  assert.match(output, /invoke `initialize-example`[\s\S]*immediately/i);
  assert.match(output, /initializer is already active[\s\S]*without invoking it again/i);
  assert.match(output, /Preserve the user's original request/i);
  assert.match(output, /resume the original request automatically/i);
});

test("product initialization preflight orders client settings before plugin settings", () => {
  const source = "---\nname: example\ndescription: Example skill guidance.\n---\n\n# Example\n";
  const output = injectProductInitializationPreflight(source, {
    settingsInitializer: "initialize-client-settings",
    pluginSettingsInitializer: "initialize-plugin-settings"
  });
  assert.match(output, /## Product initialization preflight/);
  assert.match(
    output,
    /invoke `initialize-client-settings`[\s\S]*Invoke `initialize-plugin-settings`/i
  );
  assert.match(output, /preserve the pending request/i);
  assert.match(output, /resume the original request automatically/i);
});

test("runtime plugin settings routing is independent of product initialization", () => {
  const source = "---\nname: bos-plugin-settings\ndescription: Settings.\n---\n\n# Settings\n";
  const output = transformProductSkillGuidance({
    settings_initializer: "initialize-client-settings",
    plugin_settings_initializer: "initialize-plugin-settings"
  }, "bos-plugin-settings", source);
  assert.equal(output, source);
});

test("every generated Education Center domain skill enforces first-run initialization", async () => {
  const education = (await listProducts()).find(
    ({ manifest }) => manifest.name === "education-center"
  )?.manifest;
  assert(education);
  const skills = await resolveProductSkills(education);
  const roots = [
    `${root}/clients/codex/plugins/education-center/skills`,
    `${root}/clients/claude/plugins/education-center/skills`,
    `${root}/clients/copilot/products/education-center/skills`,
    `${root}/clients/copilot/skills`,
    `${root}/clients/gemini/extensions/education-center/skills`
  ];
  for (const clientRoot of roots) {
    for (const skill of skills) {
      const guidance = await readFile(`${clientRoot}/${skill.name}/SKILL.md`, "utf8");
      if (skill.name === education.settings_initializer) {
        assert.match(guidance, /Run this workflow immediately after installing or upgrading/i);
        continue;
      }
      if (skill.name === education.plugin_settings_initializer) {
        assert.match(guidance, /## Product first-run preflight/, `${clientRoot}/${skill.name}`);
        assert.doesNotMatch(guidance, /## Product initialization preflight/);
        continue;
      }
      if (productInitializationIndependentSkills.has(skill.name)) {
        if (skill.name === "bos-plugin-settings") {
          assert.match(guidance, /## Route before preflight/);
        }
        assert.doesNotMatch(guidance, /## Product initialization preflight/);
        assert.doesNotMatch(guidance, /config\/customer-settings\.json/);
        continue;
      }
      assert.match(guidance, /## Product initialization preflight/, `${clientRoot}/${skill.name}`);
      assert.match(guidance, /missing file, an incomplete[\s\S]*or an invalid value/i);
      assert.match(guidance, /invoke `education-center-customer-initialization`[\s\S]*immediately/i);
      assert.match(guidance, /invoke `bos-plugin-settings-initialization`/i);
      assert.match(guidance, /host-managed BOS authentication/i);
      assert.match(guidance, /resume the original request automatically/i);
    }
  }
});

test("Education Center packages include governed single-lead Agent Call operations", async () => {
  const products = await listProducts();
  const educationCenter = products.find(
    ({ manifest }) => manifest.name === "education-center"
  );
  assert(educationCenter, "education-center product must exist");
  assert(
    educationCenter.manifest.includes.includes(
      "capabilities/agent-call-operations"
    )
  );

  const skills = await resolveProductSkills(educationCenter.manifest);
  const agentCalls = skills.find(
    (skill) => skill.name === "agent-call-operations"
  );
  assert(agentCalls, "education-center must include Agent Call operations");

  const guidance = await readFile(agentCalls.skillFile, "utf8");
  const contract = await readFile(
    `${agentCalls.sourcePath}/references/capability-contract.md`,
    "utf8"
  );
  assert.match(guidance, /education_center_search_leads/);
  assert.match(guidance, /education_center_initiate_agent_call/);
  assert.match(guidance, /attributes\.available_actions\[\][\s\S]*agent_call/i);
  assert.match(guidance, /arguments\.lead_id[\s\S]*absent or ambiguous/i);
  assert.match(guidance, /Never pass[\s\S]*record_ref[\s\S]*as `lead_id`/i);
  assert.match(guidance, /education_center_get_agent_call_status/);
  assert.match(guidance, /same-task continuation controls/);
  assert.match(guidance, /Do not end the task/);
  assert.doesNotMatch(guidance, /Refresh or reconnect.*then retry/i);
  assert.match(guidance, /exactly one lead/i);
  assert.match(guidance, /each explicit user request[\s\S]*fresh idempotency key/i);
  assert.match(guidance, /same lead in the same conversation/i);
  assert.match(guidance, /Reuse that key only for a transport retry/i);
  assert.match(guidance, /call-log or provider-call reference/i);
  assert.match(guidance, /follow-up questions[\s\S]*read-only/i);
  assert.match(guidance, /never invoke the call mutation/i);
  assert.match(guidance, /only operation used for[\s\S]*outcome reconciliation/i);
  assert.match(guidance, /bounded status follow-up/i);
  assert.match(guidance, /up to 60\s+seconds/i);
  assert.match(guidance, /Call requested; completion not confirmed/i);
  assert.match(guidance, /Never say `dispatched`\s*from `accepted`/i);
  assert.match(guidance, /Omit internal[\s\S]*CRM status/i);
  assert.match(guidance, /provider call reference[\s\S]*call-log ID/i);
  assert.match(guidance, /Call failed — send this screenshot to BOS\s+support/i);
  assert.match(guidance, /Error code:[\s\S]*Support reference:[\s\S]*Call placement:/i);
  assert.match(guidance, /Not returned by BOS/i);
  assert.match(guidance, /invalid error\s+response[\s\S]*public tool name and timestamp/i);
  assert.match(guidance, /never replace it with a generic phrase[\s\S]*indeterminate server\s+error/i);
  assert.match(guidance, /Do not infer a root cause/i);
  assert.match(guidance, /Keep[\s\S]*repair instructions out of the user-facing error/i);
  assert.match(contract, /UUID[\s\S]*available_actions\[\][\s\S]*arguments\.lead_id/i);
  assert.match(contract, /never use[\s\S]*record_ref/i);
  assert.match(contract, /public schema excludes[\s\S]*org_id[\s\S]*phone numbers/i);
  assert.match(contract, /Metadata `run_as_role` applies only to autonomous/i);
  assert.match(contract, /without dispatching a second provider call/i);
  assert.match(contract, /latest persisted call for that lead/i);
  assert.match(contract, /It never dispatches or retries/i);
  assert.match(contract, /authenticated actor and server-selected[\s\S]*actor role/i);
  assert.match(contract, /run_as_role` applies only to autonomous/i);
  assert.match(contract, /status discovery[\s\S]*Retell is disconnected/i);
});

test("Education Center packages include governed SendGrid campaign operations", async () => {
  const products = await listProducts();
  const educationCenter = products.find(
    ({ manifest }) => manifest.name === "education-center"
  );
  assert(educationCenter, "education-center product must exist");
  assert(
    educationCenter.manifest.includes.includes(
      "capabilities/sendgrid-campaign-operations"
    )
  );

  const skills = await resolveProductSkills(educationCenter.manifest);
  const sendgrid = skills.find(
    (skill) => skill.name === "sendgrid-campaign-operations"
  );
  assert(sendgrid, "education-center must include SendGrid campaign operations");

  const guidance = await readFile(sendgrid.skillFile, "utf8");
  const contract = await readFile(
    `${sendgrid.sourcePath}/references/capability-contract.md`,
    "utf8"
  );
  const workflow = await readFile(
    `${sendgrid.sourcePath}/references/client-workflow.md`,
    "utf8"
  );
  assert.match(guidance, /Calimatic[\s\S]*Lead Director[\s\S]*Gmail/i);
  assert.match(guidance, /explicit approval[\s\S]*list send/i);
  assert.match(`${guidance}\n${contract}`, /education_center_send_sendgrid_campaign/);
  assert.match(guidance, /HTTP 202[\s\S]*accepted[\s\S]*delivered[\s\S]*authenticated/i);
  assert.match(guidance, /Reconcile uncertain outcomes before any retry/i);
  assert.match(contract, /pause, resume, cancel, or reschedule/i);
  assert.match(contract, /unique human opens[\s\S]*unique human clicks/i);
  assert.match(contract, /Source membership or prior correspondence alone does not establish consent/i);
  assert.match(guidance, /manifest refresh[\s\S]*same-task continuation/i);
  assert.match(guidance, /deterministic test send[\s\S]*list send/i);
  assert.match(guidance, /HTTP 202[\s\S]*accepted/i);
  assert.match(contract, /Upsert capability issue/i);
  assert.match(workflow, /returning\s+seasonal families[\s\S]*recent trials/i);
  assert.match(workflow, /display exactly[\s\S]*UTF-8 subject[\s\S]*physical address/i);
  await access(`${sendgrid.sourcePath}/scripts/validate_campaign_workflow_trace.py`);
});

test("SendGrid client trace validates the governed 229-recipient acceptance path", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "sendgrid-client-trace-"));
  try {
    const tracePath = join(temporary, "trace.json");
    const metrics = (requested, suppressed, prepared, accepted, delivered) => ({
      requested,
      suppressed,
      prepared,
      accepted,
      rejected: prepared - accepted,
      delivered,
      bounced: accepted - delivered,
      unique_human_opens: 0,
      unique_human_clicks: 0,
      unsubscribes: 0,
      complaints: 0,
      conversions: 0,
      authenticated_delivery_events: delivered > 0,
      category: "ownership-transition",
      reporting_cutoff: "2026-08-20T18:00:00Z"
    });
    const trace = {
      schema_version: "education-center-sendgrid-campaign-trace/v1",
      connection: "bos",
      context_verified: true,
      same_task_continuation_supported: true,
      manifest_refresh_policy: [
        "initial_connection",
        "oauth_reconnection",
        "permission_change",
        "plugin_update",
        "capability_refresh",
        "session_replacement"
      ],
      manifest_refreshes: [{
        trigger: "capability_refresh",
        manifest_fingerprint: "sha256:manifest-v2",
        context_revalidated: true,
        preserved_fields: [
          "active_user_request",
          "campaign_draft",
          "audience_identity",
          "approval_state",
          "idempotency_keys"
        ]
      }],
      session: {
        request_hash: "sha256:request",
        draft_id: "draft-1",
        audience_id: "audience-1",
        campaign_id: "campaign-1",
        idempotency_keys: {
          test_send: "campaign-1:test:v1",
          list_send: "campaign-1:live:v1"
        }
      },
      expected_eligible: 229,
      expected_named_recipients: ["Max", "Jeremy"],
      audience: {
        matched: 248,
        unique: 235,
        eligible: 229,
        excluded: 6,
        suppressed: 6,
        counts_by_source: { calimatic: 120, lead_director: 115 },
        counts_by_cohort: { returning_spring: 112, camp_customers: 139 },
        suppression_counts: { unsubscribed: 3, bounced: 2, do_not_email: 1 },
        provenance_preserved: true,
        overlapping_tags_preserved: true,
        named_recipients: [
          { display_name: "Max", included: true, governed_update: true },
          { display_name: "Jeremy", included: true, governed_update: true }
        ]
      },
      content_preview: {
        displayed_fields: [
          "subject_utf8",
          "html_utf8",
          "plain_text_utf8",
          "sender",
          "reply_to",
          "campaign_dates",
          "contact_information",
          "category",
          "unsubscribe_configuration",
          "tracking_configuration",
          "physical_address"
        ],
        exact_utf8_displayed: true,
        content_hash: "sha256:utf8-content",
        audience_version: "audience-v2",
        category: "ownership-transition"
      },
      approval: {
        explicit: true,
        send_action: "list_send",
        content_hash: "sha256:utf8-content",
        audience_version: "audience-v2"
      },
      operations: [
        {
          sequence: 1,
          mode: "test",
          idempotency_key: "campaign-1:test:v1",
          http_status: 202,
          outcome: "accepted",
          reconciled: true,
          audience_count: 1
        },
        {
          sequence: 2,
          mode: "live",
          idempotency_key: "campaign-1:live:v1",
          http_status: 202,
          outcome: "accepted",
          reconciled: true,
          audience_count: 229
        }
      ],
      statistics: {
        test: metrics(1, 0, 1, 1, 1),
        live: metrics(235, 6, 229, 229, 227)
      },
      diagnostics: {
        legacy_filesystem_token_used: false,
        repository_sender_script_used: false,
        direct_database_access_used: false,
        raw_sendgrid_credential_used: false,
        raw_recipient_addresses_exposed: false,
        hashed_recipient_identities: true
      },
      missing_capabilities: []
    };
    await writeFile(tracePath, JSON.stringify(trace));
    const validator =
      `${root}/source/capabilities/sendgrid-campaign-operations/scripts/validate_campaign_workflow_trace.py`;
    const { stdout } = await execFileAsync("python3", [validator, tracePath]);
    assert.deepEqual(JSON.parse(stdout), { errors: [], status: "valid" });

    const invalidTrace = structuredClone(trace);
    invalidTrace.org_id = "actor-supplied-authority";
    invalidTrace.approval.content_hash = "sha256:stale-content";
    invalidTrace.missing_capabilities = ["audience_update"];
    invalidTrace.capability_issue = {};
    await writeFile(tracePath, JSON.stringify(invalidTrace));
    await assert.rejects(
      execFileAsync("python3", [validator, tracePath]),
      (error) => {
        const result = JSON.parse(error.stdout);
        const message = result.errors.join("\n");
        assert.match(message, /forbidden authority keys: org_id/i);
        assert.match(message, /approval content hash is stale/i);
        assert.match(message, /capability issue missing issue_id/i);
        return true;
      }
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("application runtime packages ship agent-owned MCP lifecycle recovery", async () => {
  const products = await listProducts();
  for (const product of products.filter(({ manifest }) => manifest.runtime)) {
    const name = product.manifest.name;
    const skills = await resolveProductSkills(product.manifest);
    const client = skills.find((skill) => skill.name === "bos-mcp-client");
    assert(client, `${name} must include bos-mcp-client`);
    const guidance = await readFile(client.skillFile, "utf8");
    assert.match(guidance, /agent owns the BOS MCP client lifecycle/i);
    assert.match(guidance, /reconnect or reinitialize/i);
    assert.match(guidance, /Never ask the user to reconnect BOS, resend the request/i);
    assert.match(guidance, /permission or role changes[\s\S]*plugin install\/update[\s\S]*capability enablement/i);
    assert.match(guidance, /sanitized continuation envelope/i);
    assert.match(guidance, /same-task session/i);
    assert.match(guidance, /reconcile by[\s\S]*idempotency identifier/i);
    assert.match(guidance, /If BOS is absent from the callable tool manifest/i);
    assert.match(guidance, /Do not stop at\s+diagnosing client registration/i);
    assert.match(guidance, /invalid_client/i);
    assert.match(guidance, /stale host-owned public-client registration/i);
    assert.match(guidance, /dynamic\s+client registration/i);
    assert.match(guidance, /same sealed BOS\s+resource/i);
    assert.match(guidance, /restart authorization once/i);
    assert.match(guidance, /authorization_required/i);
    assert.match(guidance, /authorization path immediately[\s\S]*active request/i);
    assert.match(guidance, /request interceptor around every BOS domain[\s\S]*tools\/call/i);
    assert.match(guidance, /Calimatic[\s\S]*portal URL and API\s+key/i);
    assert.match(guidance, /model and MCP client[\s\S]*never receive either value/i);
    assert.match(guidance, /poll[\s\S]*bos_resume_operation[\s\S]*without asking the user to resubmit/i);
    assert.doesNotMatch(guidance, /unnamed endpoint as.*runtime connection/is);
    assert.match(guidance, /shared local document cache/i);
    assert.match(guidance, /select exactly one authorized organization/i);
    assert.match(guidance, /default_organization_label/i);
    assert.match(guidance, /never stores an organization ID, context ID/i);
    assert.match(guidance, /explicit organization[\s\S]*does not rewrite the saved defaults/i);
    assert.match(guidance, /unless the user explicitly asks for that cross-organization/i);
    assert.match(guidance, /request exactly those intervals plus\s+changes after its cursor/i);
    assert.match(guidance, /sync_completed_at/);
    await access(`${client.sourcePath}/scripts/document-cache.mjs`);
    await access(`${client.sourcePath}/scripts/client-preferences.mjs`);
    await access(`${client.sourcePath}/references/document-cache-protocol.md`);
    await access(`${client.sourcePath}/references/runtime-continuation-contract.md`);
  }
});

test("Codex reauthentication exposes native user-controlled authentication", async () => {
  const client = await readFile(
    `${root}/source/platform/bos-mcp-client/SKILL.md`,
    "utf8"
  );
  const stateMachine = await readFile(
    `${root}/source/platform/bos-guided-support/references/support-state-machine.md`,
    "utf8"
  );
  const runbook = await readFile(
    `${root}/source/platform/bos-guided-support/references/client-runbooks.md`,
    "utf8"
  );

  assert.match(client, /reauthenticationRequired/i);
  assert.match(client, /\.app\.json[\s\S]*plugin-page \*\*Login\*\*/i);
  assert.match(client, /registered BOS app with `required: true`/i);
  assert.match(client, /presence does not depend on receiving an MCP response/i);
  assert.match(client, /HTTP 401[\s\S]*WWW-Authenticate[\s\S]*resource_metadata/i);
  assert.match(client, /notLoggedIn[\s\S]*complete OAuth discovery/i);
  assert.match(client, /invalid_grant[\s\S]*Refresh token[\s\S]*replay detected/i);
  assert.match(client, /stop the refresh retry loop[\s\S]*fresh consent/i);
  assert.match(client, /Do not\s+invoke a CLI login/i);
  assert.match(client, /Do not use\s+generic app-permission tools/i);
  assert.match(
    client,
    /From BOS Operations Center, never enter[\s\S]*paste-ready prompt for a server-side\s+agent/i
  );
  assert.match(client, /refresh[\s\S]*`bos_get_context`[\s\S]*resume/i);
  assert.match(
    stateMachine,
    /reauthenticationRequired[\s\S]*Sign in[\s\S]*never[\s\S]*unavailable tools/i
  );
  assert.match(
    stateMachine,
    /invalid_grant[\s\S]*Refresh token replay[\s\S]*Sign in[\s\S]*stop the refresh retry/i
  );
  assert.match(
    stateMachine,
    /plugin page has no[\s\S]*Register BOS[\s\S]*does not depend on an MCP response/i
  );
  assert.match(
    runbook,
    /required: true[\s\S]*registered app binding renders this control[\s\S]*independently of any MCP response/i
  );

  for (const path of [
    `${root}/clients/codex/plugins/bos/skills/bos-mcp-client/SKILL.md`,
    `${root}/clients/codex/plugins/education-center/skills/bos-mcp-client/SKILL.md`
  ]) {
    const generated = await readFile(path, "utf8");
    assert.match(generated, /reauthenticationRequired/i, path);
    assert.match(generated, /required: true/i, path);
    assert.match(generated, /notLoggedIn/i, path);
    assert.doesNotMatch(generated, /codex mcp login/i, path);
    assert.match(generated, /Do not use\s+generic app-permission tools/i, path);
  }
});

test("implementation skill hands server work to the owning repository", async () => {
  const implementation = await readFile(
    `${root}/source/platform/implementation/SKILL.md`,
    "utf8"
  );

  assert.match(implementation, /Repository ownership boundary/i);
  assert.match(
    implementation,
    /Never enter or mutate a BOS server repository from an Operations Center task/i
  );
  assert.match(implementation, /paste-ready prompt for an agent running in the owning\s+server repository/i);
  assert.match(implementation, /server-side agent\s+independently\s+determines/i);
  assert.match(implementation, /npm run contract:check/i);
  assert.match(implementation, /npm run\s+contract:oauth-discovery-live/i);
  assert.match(implementation, /npm run contract:oauth-live/i);
  assert.match(
    implementation,
    /Return exactly one continuous\s+Markdown prompt as the entire server handoff response/i
  );
});

test("repository release skill cannot cross into the BOS server repository", async () => {
  const shipIt = await readFile(
    `${root}/.agents/skills/ship-it/SKILL.md`,
    "utf8"
  );
  const repositoryInstructions = await readFile(`${root}/AGENTS.md`, "utf8");

  assert.match(shipIt, /ships BOS Operations Center only/i);
  assert.match(shipIt, /never creates or uses a sibling server worktree/i);
  assert.match(shipIt, /paste-ready prompt for an agent operating in the owning server\s+repository/i);
  assert.match(repositoryInstructions, /Never edit, commit, push, merge, or deploy BOS server code/i);
  assert.match(repositoryInstructions, /paste-ready prompt for an agent operating in\s+the owning server repository/i);
  assert.match(shipIt, /client-owned Operations Center acceptance suite/i);
  assert.match(shipIt, /contract:oauth-discovery-live/i);
  assert.match(shipIt, /exactly one continuous Markdown prompt/i);
  assert.match(repositoryInstructions, /contract:oauth-discovery-live/i);
  assert.match(repositoryInstructions, /exactly one continuous\s+Markdown prompt/i);
});

test("canonical single-connection knowledge requires native auth and client-owned server AC", async () => {
  const specification = await readFile(
    `${root}/Vault/specs/single-bos-mcp-connection.md`,
    "utf8"
  );

  assert.match(specification, /registered root BOS app[\s\S]*renders the plugin-page/i);
  assert.match(specification, /required: true/i);
  assert.match(specification, /Receiving an\s+OAuth challenge[\s\S]*independent\s+contracts/i);
  assert.match(specification, /HTTP 401[\s\S]*notLoggedIn[\s\S]*already[\s\S]*native action/i);
  assert.match(specification, /exactly one continuous copyable Markdown\s+prompt/i);
  assert.match(specification, /npm run contract:check/i);
  assert.match(specification, /contract:oauth-discovery-live/i);
  assert.match(specification, /contract:oauth-live/i);
  assert.doesNotMatch(specification, /codex mcp login/i);
});

test("guided support classifies OAuth invalid_client as registration recovery", async () => {
  const stateMachine = await readFile(
    `${root}/source/platform/bos-guided-support/references/support-state-machine.md`,
    "utf8"
  );
  assert.match(stateMachine, /invalid_client[\s\S]*Register BOS/i);
  assert.match(stateMachine, /discard[\s\S]*stale[\s\S]*registration/i);
  assert.doesNotMatch(stateMachine, /invalid_client[\s\S]{0,120}Provider ready/i);
});

test("generated clients ship stale OAuth registration recovery", async () => {
  for (const path of [
    `${root}/clients/codex/plugins/bos/skills/bos-mcp-client/SKILL.md`,
    `${root}/clients/codex/plugins/education-center/skills/bos-mcp-client/SKILL.md`,
    `${root}/clients/claude/plugins/bos/skills/bos-mcp-client/SKILL.md`,
    `${root}/clients/claude/plugins/education-center/skills/bos-mcp-client/SKILL.md`,
    `${root}/clients/copilot/products/bos/skills/bos-mcp-client/SKILL.md`,
    `${root}/clients/copilot/products/education-center/skills/bos-mcp-client/SKILL.md`,
    `${root}/clients/copilot/skills/bos-mcp-client/SKILL.md`,
    `${root}/clients/gemini/extensions/bos/skills/bos-mcp-client/SKILL.md`,
    `${root}/clients/gemini/extensions/education-center/skills/bos-mcp-client/SKILL.md`
  ]) {
    const guidance = await readFile(path, "utf8");
    assert.match(guidance, /invalid_client/i, path);
    assert.match(guidance, /stale host-owned public-client registration/i, path);
    assert.match(guidance, /restart authorization once/i, path);
  }
});

test("generated runtime clients ship the canonical shared document cache helper", async () => {
  const canonical = await readFile(
    `${root}/source/platform/bos-mcp-client/scripts/document-cache.mjs`
  );
  for (const path of [
    `${root}/clients/codex/plugins/education-center/skills/bos-mcp-client/scripts/document-cache.mjs`,
    `${root}/clients/claude/plugins/education-center/skills/bos-mcp-client/scripts/document-cache.mjs`,
    `${root}/clients/copilot/products/education-center/skills/bos-mcp-client/scripts/document-cache.mjs`,
    `${root}/clients/copilot/skills/bos-mcp-client/scripts/document-cache.mjs`,
    `${root}/clients/gemini/extensions/education-center/skills/bos-mcp-client/scripts/document-cache.mjs`
  ]) {
    assert.deepEqual(await readFile(path), canonical, path);
  }
});

test("generated BOS-family clients ship the canonical organization preference helper", async () => {
  const canonical = await readFile(
    `${root}/source/platform/bos-mcp-client/scripts/client-preferences.mjs`
  );
  for (const path of [
    `${root}/clients/codex/plugins/bos/skills/bos-mcp-client/scripts/client-preferences.mjs`,
    `${root}/clients/codex/plugins/education-center/skills/bos-mcp-client/scripts/client-preferences.mjs`,
    `${root}/clients/claude/plugins/bos/skills/bos-mcp-client/scripts/client-preferences.mjs`,
    `${root}/clients/claude/plugins/education-center/skills/bos-mcp-client/scripts/client-preferences.mjs`,
    `${root}/clients/copilot/products/bos/skills/bos-mcp-client/scripts/client-preferences.mjs`,
    `${root}/clients/copilot/products/education-center/skills/bos-mcp-client/scripts/client-preferences.mjs`,
    `${root}/clients/gemini/extensions/bos/skills/bos-mcp-client/scripts/client-preferences.mjs`,
    `${root}/clients/gemini/extensions/education-center/skills/bos-mcp-client/scripts/client-preferences.mjs`
  ]) {
    assert.deepEqual(await readFile(path), canonical, path);
  }
});

test("director planner repairs missing customer settings before resuming", async () => {
  const guidance = await readFile(
    `${root}/source/verticals/education-center/education-center-director-daily-planner/SKILL.md`,
    "utf8"
  );
  assert.match(guidance, /`education-center-customer-initialization` when customer settings are missing/i);
  assert.match(guidance, /run `education-center-customer-initialization` immediately/i);
  assert.doesNotMatch(guidance, /Stop when the setting is absent or invalid/);
});

test("director daily planner is camp-first at day-level detail", async () => {
  const guidance = await readFile(
    `${root}/source/verticals/education-center/education-center-director-daily-planner/SKILL.md`,
    "utf8"
  );
  const dailyContract = await readFile(
    `${root}/source/verticals/education-center/education-center-director-daily-planner/references/planner-content.md`,
    "utf8"
  );
  assert.match(guidance, /selected day[\s\S]*daily planner/);
  assert.match(guidance, /same camp-first operating hierarchy[\s\S]*day-level detail/i);
  assert.match(guidance, /material events in the following 48 hours/i);
  assert.match(dailyContract, /## Camps today/);
  assert.match(
    dailyContract,
    /Primary family phone[\s\S]*Enrollment source[\s\S]*Attendance\/arrival state/
  );
  assert.match(dailyContract, /Paid enrollment[\s\S]*Care\.com[\s\S]*Bright Horizons/);
  assert.match(dailyContract, /## Camp-family calls and exceptions/);
  assert.match(dailyContract, /## Today's timeline and upcoming events/);
  assert.match(guidance, /30 days before the reporting-period start/);
  assert.match(dailyContract, /explicitly assigned[\s\S]*camp occurrence and date/);
});

test("director report visuals use a bounded mobile-first Mermaid fallback", async () => {
  const guidance = await readFile(
    `${root}/source/verticals/education-center/education-center-director-daily-planner/SKILL.md`,
    "utf8"
  );
  const visualContract = await readFile(
    `${root}/source/verticals/education-center/education-center-director-daily-planner/references/mobile-visual.md`,
    "utf8"
  );

  assert.match(guidance, /references\/mobile-visual\.md/);
  assert.match(visualContract, /mobile-first/i);
  assert.match(visualContract, /Never create local HTML or emit a `visualize` content reference/i);
  assert.match(visualContract, /standard Markdown by default/i);
  assert.match(visualContract, /`flowchart TB`/);
  assert.match(visualContract, /never use[^\n]*`timeline`[^\n]*`gantt`[^\n]*`xychart`/i);
  assert.match(visualContract, /no more than seven nodes/i);
  assert.match(visualContract, /32 visible characters/i);
  assert.match(visualContract, /personally identifiable\s+information/i);
  assert.match(visualContract, /accessible text summary/i);
});

test("camp enrollment reports render the accepted weekly image and deduped family contacts", async () => {
  const classGuidance = await readFile(
    `${root}/source/verticals/education-center/education-center-class-operations/SKILL.md`,
    "utf8"
  );
  const directorGuidance = await readFile(
    `${root}/source/verticals/education-center/education-center-director-daily-planner/SKILL.md`,
    "utf8"
  );
  const directorFrontmatter = directorGuidance.split("---")[1];

  assert.match(
    classGuidance,
    /camp enrollments for next week with student names per\s+day and family phone numbers/i
  );
  assert.match(classGuidance, /five-column\s+Monday-Friday image/i);
  assert.match(classGuidance, /repeat each child on every day/i);
  assert.match(classGuidance, /`Student — Camp`/i);
  assert.match(classGuidance, /Include each family once/i);
  assert.match(classGuidance, /Keep phone\s+numbers out of the image/i);
  assert.match(classGuidance, /PNG output[\s\S]*SVG otherwise/i);
  assert.match(classGuidance, /Never substitute Mermaid, a Markdown-only\s+roster/i);
  assert.match(
    classGuidance,
    /run the shared document-cache\s+`begin` → source gap\/delta → `commit` → `read` workflow/i
  );
  assert.match(
    classGuidance,
    /generate from the covered cache without a\s+source content query/i
  );
  assert.match(
    classGuidance,
    /missing daily fields in one summary response do not prove that occurrence data\s+is unavailable/i
  );
  assert.match(
    classGuidance,
    /A partial or unavailable source never suppresses the image when another source\s+returned exact day-level placements/i
  );
  assert.match(
    classGuidance,
    /Do not print `daily occurrence data unavailable`/i
  );
  const renderer =
    `${root}/source/verticals/education-center/education-center-class-operations/scripts/render_week_calendar.py`;
  await access(renderer);

  const temporary = await mkdtemp(join(tmpdir(), "camp-roster-calendar-"));
  try {
    const input = join(temporary, "week.json");
    const output = join(temporary, "week.svg");
    await writeFile(input, JSON.stringify({
      title: "Education Center Camps — Test Week",
      bh_label: "Provisional BH",
      days: [
        {
          date: "Mon Aug 10",
          paid: [{ name: "Johnny Example", camp: "Minecraft" }],
          bh: [{ name: "Jordan Example", camp: "Minecraft" }],
          care_com: [{ name: "Jamie Example", camp: "Roblox" }]
        },
        { date: "Tue Aug 11", paid: [{ name: "Johnny Example", camp: "Minecraft" }] },
        { date: "Wed Aug 12" },
        { date: "Thu Aug 13" },
        { date: "Fri Aug 14" }
      ]
    }));
    await execFileAsync("python3", [renderer, input, output]);
    const svg = await readFile(output, "utf8");
    assert.match(svg, /Johnny Example — Minecraft/);
    assert.match(svg, /Jordan Example — Minecraft/);
    assert.match(svg, /Jamie Example — Roblox/);
    assert.match(svg, /Confirmed Care\.com/);
    assert.match(svg, /Headcount: 3/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  assert.match(
    directorGuidance,
    /request asks only for a class or camp roster[\s\S]*execute `education-center-class-operations`/i
  );
  assert.doesNotMatch(
    directorFrontmatter,
    /class or enrollment summary, family contact sheet/i
  );
});

test("director skill handles weekly summaries without scope questions", async () => {
  const guidance = await readFile(
    `${root}/source/verticals/education-center/education-center-director-daily-planner/SKILL.md`,
    "utf8"
  );
  assert.match(guidance, /weekly summary, weekly director report, week-in-review/i);
  assert.match(guidance, /current local[\s\S]*Monday-through-Sunday/i);
  assert.doesNotMatch(guidance, /most recently completed[\s\S]*Monday-through-Sunday/i);
  assert.match(guidance, /“For my director” identifies\s+the report audience/i);
  assert.match(guidance, /Never ask the\s+user to choose a director, organization, source, key, or role/i);
  assert.match(guidance, /Require exactly one[\s\S]*authenticated user and role/i);
  assert.match(guidance, /Never ask whether to use Education Center operations, email, Calendar/i);
  assert.match(guidance, /every camp[\s\S]*student roster by day/i);
  assert.match(guidance, /primary family phone/i);
  assert.match(guidance, /Paid enrollment[\s\S]*Care\.com[\s\S]*Bright Horizons/i);
  assert.match(guidance, /parent communication notes[\s\S]*this week's camps/i);
  assert.match(guidance, /upcoming Calendar events/i);
  const weeklyContract = await readFile(
    `${root}/source/verticals/education-center/education-center-director-daily-planner/references/weekly-summary-content.md`,
    "utf8"
  );
  assert.match(weeklyContract, /## Camps this week/);
  assert.match(weeklyContract, /Day\/date[\s\S]*Primary family phone[\s\S]*Enrollment source/);
  assert.match(weeklyContract, /## Family calls and camp exceptions/);
  assert.match(weeklyContract, /## Upcoming events/);
  assert.match(weeklyContract, /confirmed but unassigned[\s\S]*Needs review/);
  const product = (await listProducts()).find(
    ({ manifest }) => manifest.name === "education-center"
  )?.manifest;
  assert(product);
  assert(product.default_prompts.includes("Give me a weekly summary for my director."));
});

test("BOS starter prompts provide operating-system-style discovery", async () => {
  const product = (await listProducts()).find(
    ({ manifest }) => manifest.name === "bos"
  )?.manifest;
  assert(product);
  assert.deepEqual(product.default_prompts, [
    "List the BOS apps and skills installed for my organization.",
    "Show me the tools and workflows available in each BOS app.",
    "Check which BOS apps are connected and ready to use."
  ]);
});

test("camp and student evidence honor customer-owned Care.com source routing", async () => {
  for (const relativePath of [
    "source/verticals/education-center/education-center-class-operations/SKILL.md",
    "source/verticals/education-center/education-center-student-operations/SKILL.md"
  ]) {
    const guidance = await readFile(`${root}/${relativePath}`, "utf8");
    assert.match(guidance, /source_routes\.care_com/i);
    assert.match(guidance, /`education_center_search_email_evidence`/);
    assert.match(guidance, /email-account-routing/i);
    assert.match(guidance, /normal Gmail connector/i);
    assert.match(guidance, /bounded lookback of up to 180 days/i);
    assert.match(guidance, /mailboxes\.care_com/i);
  }
});

test("service routing composes package defaults with preserved customer settings", async () => {
  const guidance = await readFile(
    `${root}/source/verticals/education-center/education-center-service-routing/SKILL.md`,
    "utf8"
  );
  assert.match(guidance, /customer-settings\.template\.json[\s\S]*recursively overlay/i);
  assert.match(guidance, /Package builds never rewrite the customer overlay/i);
  assert.match(guidance, /source_routes\.care_com/i);
  assert.match(guidance, /connected_gmail[\s\S]*email-account-routing/i);
  assert.match(guidance, /brand_display_name/);
  assert.match(guidance, /terminology\.brand_display_name/);
  assert.match(guidance, /customer-facing[\s\S]*franchise or brand/i);
  assert.match(guidance, /inert display text/i);
});

test("every Education Center skill applies tenant brand terminology only to display copy", async () => {
  const product = (await listProducts()).find(
    ({ manifest }) => manifest.name === "education-center"
  )?.manifest;
  assert(product);
  const skills = await resolveProductSkills(product);
  for (const skill of skills.filter(({ name }) => name.startsWith("education-center-"))) {
    const guidance = await readFile(skill.skillFile, "utf8");
    assert.match(guidance, /brand_display_name/, skill.name);
    assert.match(guidance, /customer-facing/, skill.name);
    assert.match(
      guidance,
      /brand_display_name[\s\S]*(?:Keep technical|Never interpolate)[\s\S]*identifiers/i,
      skill.name
    );
  }
});

test("Education Center initialization proposes sourced defaults with one-step acceptance", async () => {
  const guidance = await readFile(
    `${root}/source/verticals/education-center/education-center-customer-initialization/SKILL.md`,
    "utf8"
  );
  assert.match(
    guidance,
    /Recommended defaults[\s\S]*brand display name[\s\S]*organization\s+display name[\s\S]*Default BOS organization[\s\S]*location\s+display name[\s\S]*IANA timezone/i
  );
  assert.match(guidance, /Reply \*\*Use these defaults\*\*[\s\S]*accept all values/i);
  assert.match(guidance, /status and source/i);
  assert.match(guidance, /bos-mcp-client[\s\S]*live-tool discovery/i);
  assert.match(guidance, /Complete authentication before asking any customer-settings question/i);
  assert.match(guidance, /Connect\/Sign in[\s\S]*context discovery[\s\S]*present the recommendation/i);
  assert.match(guidance, /Claude[\s\S]*persistent \*\*Connect\*\* action[\s\S]*Customize\s*→\s*Connectors/i);
  assert.match(guidance, /authentication_required[\s\S]*preserve the initialization draft[\s\S]*ask[\s\S]*no settings questions/i);
  assert.match(guidance, /store it as `brand_display_name`/i);
  assert.match(guidance, /set-default-organization[\s\S]*state: committed/i);
  assert.match(guidance, /never inside\s+`customer-settings\.json`/i);
  assert.match(guidance, /inspect every plugin-service connection[\s\S]*selected organization/i);
  assert.match(guidance, /connection actions one at a time/i);
});

test("Bright Horizons report prompts deterministically generate the reimbursement workbook", async () => {
  const skillRoot = `${root}/source/verticals/education-center/education-center-invoice-operations`;
  const guidance = await readFile(`${skillRoot}/SKILL.md`, "utf8");
  const contract = await readFile(
    `${skillRoot}/references/bright-horizons-workbook.md`,
    "utf8"
  );
  const operatingRules = await readFile(
    `${skillRoot}/references/bright-horizons-operating-rules.md`,
    "utf8"
  );
  const builder = await readFile(
    `${skillRoot}/scripts/build_bh_invoice.mjs`,
    "utf8"
  );
  const template = JSON.parse(await readFile(
    `${skillRoot}/assets/bright-horizons-reimbursement-template.json`,
    "utf8"
  ));

  assert.match(guidance, /create a Bright Horizons report for last week/i);
  assert.match(guidance, /deterministic reimbursement\s+workbook-generation intent/i);
  assert.match(guidance, /Never invoke[\s\S]*reimbursement-report generation/i);
  assert.match(guidance, /reconcile every\s+candidate child-day[\s\S]*before building/i);
  assert.match(guidance, /one short summary plus the\s+attached workbook/i);
  assert.match(contract, /commands[\s\S]*create a Bright Horizons report for last week/i);
  assert.match(contract, /billing disposition[\s\S]*active[\s\S]*timely cancellation[\s\S]*late cancellation[\s\S]*post-start cancellation/i);
  assert.match(contract, /candidate child-day set[\s\S]*union of Calimatic[\s\S]*provider evidence/i);
  assert.match(contract, /Calimatic-only[\s\S]*provider-confirmed[\s\S]*unresolved/i);
  assert.match(contract, /row\.rate_per_day[\s\S]*50%/i);
  assert.match(contract, /attached final[\s\S]*`\.xlsx` workbook/i);
  assert.match(operatingRules, /brighthorizonsenrollments@calimatic\.com/i);
  assert.match(operatingRules, /providerbilling@brighthorizons\.com/i);
  assert.match(operatingRules, /two business days[\s\S]*5:00\s+p\.m\./i);
  assert.match(operatingRules, /mark[\s\S]*paid only after[\s\S]*funds/i);
  assert.match(operatingRules, /each business day[\s\S]*dated export|normalized\s+snapshot/i);
  assert.match(operatingRules, /within 45 calendar days/i);
  assert.match(operatingRules, /peer discussion[\s\S]*never override/i);
  assert.doesNotMatch(contract, /\$103\.00 is configured/i);
  assert.match(builder, /bright-horizons-reimbursement-template\.json/);
  assert.match(builder, /"rate_per_day"/);
  assert.doesNotMatch(builder, /configuredRatePerDay\s*=\s*103/);
  assert.doesNotMatch(builder, /(?<!path\.)resolve\(process\.cwd\(\)/);
  assert.equal(
    template.schema_version,
    "bright-horizons-reimbursement-template/v1"
  );
  assert.equal(template.worksheet_name, "Invoice");
  assert.deepEqual(template.detail.headers, [
    "Employee Name",
    "Employer",
    "Case #",
    "# of Children",
    "Date of Care",
    "# of Hours of Care",
    "Rate per Day",
    "Amount",
    "Other Comments"
  ]);
});

test("Bright Horizons builder validates the distributed template and reimbursement totals", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bos-bh-invoice-"));
  const inputPath = join(directory, "input.json");
  await writeFile(inputPath, JSON.stringify({
    date_submitted: "2026-08-11",
    center_name: "Example Center",
    address: "Example Address",
    billing_contact_name: "Example Billing Contact",
    phone_number: "555-0100",
    invoice_reference_number: "EXAMPLE_7",
    rate_per_day: 103,
    period_start: "2026-08-03",
    period_end: "2026-08-09",
    rows: [
      {
        employee_name: "Employee B",
        employer: "Employer",
        case_number: "CASE-2",
        number_of_children: 1,
        date_of_care: "2026-08-04",
        hours_of_care: 7,
        rate_per_day: 51.5,
        other_comments: "Late cancellation — 50% rate"
      },
      {
        employee_name: "Employee A",
        employer: "Employer",
        case_number: "CASE-1",
        number_of_children: 2,
        date_of_care: "2026-08-03",
        hours_of_care: 7,
        other_comments: ""
      }
    ]
  }));
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        `${root}/source/verticals/education-center/education-center-invoice-operations/scripts/build_bh_invoice.mjs`,
        inputPath,
        "--validate-only"
      ],
      { cwd: root }
    );
    const result = JSON.parse(stdout);
    assert.equal(result.template_schema_version, "bright-horizons-reimbursement-template/v1");
    assert.equal(result.invoice_reference, "EXAMPLE_7");
    assert.equal(result.child_day_count, 3);
    assert.equal(result.invoice_total, 257.5);
    assert.equal(result.period_start, "2026-08-03");
    assert.equal(result.period_end, "2026-08-09");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("client distributions include the Bright Horizons reimbursement template", async () => {
  for (const path of [
    `${root}/clients/codex/plugins/education-center/skills/education-center-invoice-operations/assets/bright-horizons-reimbursement-template.json`,
    `${root}/clients/claude/plugins/education-center/skills/education-center-invoice-operations/assets/bright-horizons-reimbursement-template.json`,
    `${root}/clients/copilot/products/education-center/skills/education-center-invoice-operations/assets/bright-horizons-reimbursement-template.json`,
    `${root}/clients/gemini/extensions/education-center/skills/education-center-invoice-operations/assets/bright-horizons-reimbursement-template.json`
  ]) {
    await access(path);
  }
});

test("client distributions include deterministic Bright Horizons operating rules", async () => {
  for (const path of [
    `${root}/clients/codex/plugins/education-center/skills/education-center-invoice-operations/references/bright-horizons-operating-rules.md`,
    `${root}/clients/claude/plugins/education-center/skills/education-center-invoice-operations/references/bright-horizons-operating-rules.md`,
    `${root}/clients/copilot/products/education-center/skills/education-center-invoice-operations/references/bright-horizons-operating-rules.md`,
    `${root}/clients/gemini/extensions/education-center/skills/education-center-invoice-operations/references/bright-horizons-operating-rules.md`
  ]) {
    await access(path);
  }
});

test("parent communications owns the configured email-evidence route", async () => {
  const guidance = await readFile(
    `${root}/source/verticals/education-center/education-center-parent-communications/SKILL.md`,
    "utf8"
  );
  assert.match(guidance, /source_routes\.parent_communications/i);
  assert.match(guidance, /mailboxes\.parent_communications/i);
  assert.match(guidance, /email-account-routing/i);
  assert.match(guidance, /read-only correspondence evidence/i);
  assert.match(guidance, /never substitute Gmail for those channels/i);
});

test("canonical and generated skills contain no removed use-bos references", async () => {
  const roots = [`${root}/source`, `${root}/clients`];
  const failures = [];
  for (const directory of roots) {
    for (const path of await walkFiles(directory)) {
      if (!path.endsWith("SKILL.md")) continue;
      const guidance = await readFile(path, "utf8");
      if (/\buse-bos\b/.test(guidance)) failures.push(path);
    }
  }
  assert.deepEqual(failures, []);
});

test("all product manifests validate and resolve unique skills", async () => {
  const products = await listProducts();
  assert.equal(products.length, 4);
  for (const { path, manifest } of products) {
    assert.deepEqual(validateProduct(manifest, path), []);
    const skills = await resolveProductSkills(manifest);
    assert.equal(skills.length, new Set(skills.map((skill) => skill.name)).size);
  }
});

test("BOS marketplace metadata explains the platform and links to its website", async () => {
  const bos = (await listProducts()).find(
    ({ manifest }) => manifest.name === "bos"
  )?.manifest;
  assert(bos);
  assert.equal(bos.display_name, "BOS — Business Operating System");
  assert.equal(bos.description.length, 79);
  assert.match(bos.description, /Agent-first Business Operating System/);
  assert.match(bos.long_description, /owns the authenticated MCP connection/);
  assert.match(bos.long_description, /server-evaluated tools/);
  assert.match(bos.long_description, /authorization on every request/);
  assert.equal(bos.website_url, "https://dfsm.ai");
  assert.equal(bos.brand_color, "#061638");
  assert.equal(bos.composer_icon, "assets/bos-logo.png");
  assert.equal(bos.logo, "assets/bos-logo.png");

  const codex = pluginManifest(bos);
  assert.equal(codex.description, bos.description);
  assert.equal(codex.homepage, bos.website_url);
  assert.equal(codex.interface.shortDescription, bos.description);
  assert.equal(codex.interface.longDescription, bos.long_description);
  assert.equal(codex.interface.websiteURL, bos.website_url);
  assert.equal(codex.interface.brandColor, bos.brand_color);
  assert.equal(codex.interface.composerIcon, "./assets/bos-logo.png");
  assert.equal(codex.interface.logo, "./assets/bos-logo.png");
  await access(`${root}/products/bos/assets/bos-logo.png`);
  await access(`${root}/clients/codex/plugins/bos/assets/bos-logo.png`);
});

test("Education Operation Center marketplace metadata presents independent workflows", async () => {
  const education = (await listProducts()).find(
    ({ manifest }) => manifest.name === "education-center"
  )?.manifest;
  assert(education);
  assert.equal(education.display_name, "Education Operation Center");
  assert.ok(education.description.length <= 80);
  assert.match(education.description, /Agent-first education operations/);
  assert.match(
    education.long_description,
    /Ads and Customer Outreach → Free Trial Class, Session, or Booking → Enrollment/
  );
  assert.match(education.long_description, /independent deterministic workflow/);
  assert.match(education.long_description, /Intelligent orchestrators select and coordinate/);
  assert.match(education.long_description, /complex, human-centered tasks/);
  assert.match(education.long_description, /preserving human judgment, approvals/);
  assert.equal(education.website_url, "https://dfsm.ai");
  assert.equal(education.brand_color, "#061638");
  assert.equal(education.composer_icon, "assets/education-center-logo.png");
  assert.equal(education.logo, "assets/education-center-logo.png");

  const codex = pluginManifest(education);
  assert.equal(codex.interface.displayName, education.display_name);
  assert.equal(codex.interface.shortDescription, education.description);
  assert.equal(codex.interface.longDescription, education.long_description);
  assert.equal(codex.interface.websiteURL, education.website_url);
  assert.equal(codex.interface.brandColor, education.brand_color);
  assert.equal(codex.interface.composerIcon, "./assets/education-center-logo.png");
  assert.equal(codex.interface.logo, "./assets/education-center-logo.png");
  await access(`${root}/products/education-center/assets/education-center-logo.png`);
  await access(`${root}/clients/codex/plugins/education-center/assets/education-center-logo.png`);
});

test("only BOS owns runtime application and MCP group names", async () => {
  const products = await listProducts();
  assert.deepEqual(
    Object.fromEntries(
      products.map(({ manifest }) => [
        manifest.name,
        [manifest.application_name, manifest.mcp_group_name]
      ])
    ),
    {
      bos: ["bos", "platform"],
      "education-center": [undefined, undefined],
      "my-crm": [undefined, undefined],
      "video-ads": [undefined, undefined]
    }
  );
  for (const { manifest } of products) {
    assert.equal("mcp_application" in manifest, false);
    assert.equal("mcp_resource_group" in manifest, false);
    assert.equal("installed_app_id" in manifest, false);
  }
});

test("runtime package model materializes the single BOS route", async () => {
  const template = "https://dfsm.ai/mcp/apps/bos/platform";
  for (const { manifest } of await listProducts()) {
    if (!manifest.runtime) continue;
    const expected = template;
    assert.equal(materializeMcpUrl(template, manifest), expected);
    const gemini = await geminiExtensionManifest(manifest);
    assert.equal(gemini.mcpServers[manifest.mcp_group_name].httpUrl, expected);
    assert.deepEqual(gemini.mcpServers[manifest.mcp_group_name].oauth, { enabled: true });
    assert.doesNotMatch(JSON.stringify(gemini), /BOS_INSTALLED_APP_ID|installed_app_id/);
    const geminiDesktop = await geminiPluginMcpManifest(manifest);
    assert.equal(geminiDesktop.mcpServers[manifest.mcp_group_name].serverUrl, expected);
    const copilot = await copilotMcpManifest(manifest);
    assert.equal(copilot.mcpServers[manifest.mcp_group_name].url, expected);
    assert.equal(copilot.mcpServers[manifest.mcp_group_name].headers, undefined);
  }
});

test("runtime products declare credential-free OAuth bindings", async () => {
  const runtimeProducts = (await listProducts())
    .map(({ manifest }) => manifest)
    .filter((manifest) => manifest.runtime);
  for (const product of runtimeProducts) {
    const gemini = await geminiExtensionManifest(product);
    assert.equal(gemini.settings, undefined);
    assert.equal(gemini.mcpServers[product.mcp_group_name].headers, undefined);
    const copilot = await copilotMcpManifest(product);
    assert.equal(copilot.mcpServers[product.mcp_group_name].headers, undefined);
  }
});

test("Copilot products bundle GitHub's repository MCP configuration", async () => {
  for (const { manifest: product } of await listProducts()) {
    if (product.release_status === "disabled") continue;
    if (!product.clients.includes("copilot")) continue;
    const productRoot = `${root}/clients/copilot/products/${product.name}`;
    if (!product.runtime) {
      await assert.rejects(access(`${productRoot}/.github/mcp.json`));
      const readme = await readFile(`${productRoot}/README.md`, "utf8");
      assert.match(readme, /existing BOS connection/i);
      continue;
    }
    const config = JSON.parse(
      await readFile(`${productRoot}/.github/mcp.json`, "utf8")
    );
    assert.deepEqual(Object.keys(config.mcpServers), [product.mcp_group_name]);
    assert.deepEqual(config.mcpServers[product.mcp_group_name], {
      type: "http",
      url: "https://dfsm.ai/mcp/apps/bos/platform",
      tools: ["*"]
    });
    assert.doesNotMatch(
      JSON.stringify(config),
      /BOS_INSTALLED_APP_ID|installed_app_id/
    );
    const readme = await readFile(`${productRoot}/README.md`, "utf8");
    assert.equal(config.mcpServers[product.mcp_group_name].headers, undefined);
    assert.match(readme, /complete BOS sign-in/i);
    assert.match(
      readme,
      /mcp\/apps\/bos\/platform/
    );
  }
});

test("package schema reserves runtime ownership for BOS", () => {
  const base = {
    schema_version: "1",
    name: "bos",
    version: "1.0.0",
    display_name: "Example",
    description: "Example runtime package.",
    publisher: "Example Publisher",
    category: "Productivity",
    authentication: "ON_INSTALL",
    release_status: "active",
    clients: ["codex"],
    includes: ["platform/bos-mcp-client"],
    runtime: "bos",
    application_name: "bos",
    mcp_group_name: "platform",
    codex_app_id: "asdk_app_6a932992592081919cdc88c60e4ff2dd",
    runtime_verification_tools: ["bos_get_context"],
    default_prompts: []
  };
  assert.deepEqual(validateProduct(base), []);
  assert.deepEqual(
    validateProduct({
      ...base,
      long_description: "A longer marketplace description.",
      website_url: "https://example.com"
    }),
    []
  );
  assert.match(
    validateProduct({ ...base, website_url: "http://example.com" }).join("\n"),
    /website_url must be an absolute HTTPS URL/
  );
  assert.match(
    validateProduct({ ...base, includes: ["platform/planning"] }).join("\n"),
    /runtime requires platform\/bos-mcp-client/
  );
  assert.match(
    validateProduct({ ...base, mcp_application: "leaddirector" }).join("\n"),
    /unknown field mcp_application/
  );
  assert.match(
    validateProduct({ ...base, credential_env_var: "EXAMPLE_BOS_CREDENTIAL" }).join("\n"),
    /unknown field credential_env_var/
  );
  const { mcp_group_name: _removed, ...incomplete } = base;
  assert.match(validateProduct(incomplete).join("\n"), /runtime requires application_name and mcp_group_name/);
  assert.match(
    validateProduct({ ...base, codex_app_id: "asdk_app_account_scoped" }).join("\n"),
    /codex_app_id must be a durable asdk_app identifier/
  );
  assert.match(
    validateProduct({ ...base, name: "education-center" }).join("\n"),
    /subservice products must use the BOS-owned connection/
  );
  assert.match(
    validateProduct({ ...base, authentication: "ON_USE" }).join("\n"),
    /BOS authentication must be ON_INSTALL/
  );
  const subservice = {
    ...base,
    name: "education-center",
    authentication: "ON_USE",
    runtime: undefined,
    application_name: undefined,
    mcp_group_name: undefined,
    codex_app_id: undefined,
    includes: ["platform/bos-mcp-client"]
  };
  assert.deepEqual(validateProduct(subservice), []);
  assert.match(
    validateProduct({ ...subservice, authentication: "ON_INSTALL" }).join("\n"),
    /subservice authentication policy must be ON_USE/
  );
});

test("Video Ads composes workflows without another BOS endpoint", async () => {
  const products = await listProducts();
  const videoAds = products.find(
    ({ manifest }) => manifest.name === "video-ads"
  )?.manifest;
  assert(videoAds);
  assert.equal(videoAds.brand_color, "#061638");
  assert.equal(videoAds.composer_icon, "assets/marketing-director-logo.png");
  assert.equal(videoAds.logo, "assets/marketing-director-logo.png");
  const manifest = pluginManifest(videoAds);
  assert.equal(manifest.interface.composerIcon, "./assets/marketing-director-logo.png");
  assert.equal(manifest.interface.logo, "./assets/marketing-director-logo.png");
  await access(`${root}/products/video-ads/assets/marketing-director-logo.png`);
  assert.equal(videoAds.runtime, undefined);
  assert.equal(videoAds.application_name, undefined);
  assert.equal(videoAds.mcp_group_name, undefined);
  assert.equal(videoAds.release_status, "disabled");
  assert.equal("credential_env_var" in videoAds, false);
  const skills = await resolveProductSkills(videoAds);
  assert.deepEqual(
    skills.map((skill) => skill.name),
    [
      "bos-mcp-client",
      "bos-plugin-settings",
      "bos-plugin-settings-initialization",
      "submit-feedback",
      "manage-customer-extension",
      "video-ad-briefing",
      "video-ad-generation",
      "video-ad-drive-delivery"
    ]
  );
});

test("disabled products are absent while active runtime products remain scoped", async () => {
  await access(`${root}/clients/codex/plugins/bos/.app.json`);
  await assert.rejects(access(`${root}/clients/codex/plugins/video-ads`));
  await assert.rejects(access(`${root}/clients/claude/plugins/bos/.mcp.json`));
  await assert.rejects(access(`${root}/clients/claude/plugins/video-ads`));
  await assert.rejects(
    access(`${root}/clients/codex/plugins/education-center/.mcp.json`)
  );
  const app = JSON.parse(await readFile(
    `${root}/clients/codex/plugins/bos/.app.json`,
    "utf8"
  ));
  assert.deepEqual(app, {
    apps: {
      bos: {
        id: "asdk_app_6a932992592081919cdc88c60e4ff2dd",
        required: true
      }
    }
  });
  await assert.rejects(access(`${root}/clients/codex/plugins/bos/.mcp.json`));
  await assert.rejects(
    access(`${root}/clients/claude/plugins/education-center/.mcp.json`)
  );
});

test("disabled product inventory is generated for idempotent client pruning", async () => {
  const inventory = JSON.parse(
    await readFile(`${root}/clients/disabled-products.json`, "utf8")
  );
  assert.deepEqual(inventory, {
    schema_version: "1",
    products: [
      {
        name: "my-crm"
      },
      {
        name: "video-ads"
      }
    ]
  });
});

test("BOS owns OAuth while Education Center adds no connection binding", async () => {
  const codexRoot = `${root}/clients/codex/plugins/bos`;
  const metadata = JSON.parse(await readFile(`${codexRoot}/.bos-product.json`, "utf8"));
  const plugin = JSON.parse(await readFile(`${codexRoot}/.codex-plugin/plugin.json`, "utf8"));
  const app = JSON.parse(await readFile(`${codexRoot}/.app.json`, "utf8"));
  assert.equal(metadata.application_name, "bos");
  assert.equal(metadata.mcp_group_name, "platform");
  assert.equal(metadata.codex_app_id, "asdk_app_6a932992592081919cdc88c60e4ff2dd");
  assert.equal(plugin.apps, "./.app.json");
  assert.equal(plugin.mcpServers, undefined);
  assert.equal(app.apps.bos.id, metadata.codex_app_id);
  assert.equal(app.apps.bos.required, true);
  assert.deepEqual(Object.keys(app.apps.bos), ["id", "required"]);
  await assert.rejects(access(`${codexRoot}/.mcp.json`));

  const claudeRoot = `${root}/clients/claude/plugins/bos`;
  const claudeMetadata = JSON.parse(await readFile(
    `${claudeRoot}/.bos-product.json`,
    "utf8"
  ));
  const claudePlugin = JSON.parse(await readFile(
    `${claudeRoot}/.claude-plugin/plugin.json`,
    "utf8"
  ));
  assert.equal(claudeMetadata.connection_scope, "claude_account");
  assert.equal(
    claudeMetadata.resource_url,
    "https://dfsm.ai/mcp/apps/bos/platform"
  );
  assert.equal(claudePlugin.mcpServers, undefined);
  assert.equal("userConfig" in claudePlugin, false);
  await assert.rejects(access(`${claudeRoot}/.mcp.json`));
  const connectorGuide = await readFile(`${claudeRoot}/CONNECTORS.md`, "utf8");
  assert.match(connectorGuide, /account-level Web connector/);
  assert.match(connectorGuide, /Connect/);
  assert.match(connectorGuide, /https:\/\/dfsm\.ai\/mcp\/apps\/bos\/platform/);
  const educationRoot = `${root}/clients/codex/plugins/education-center`;
  await assert.rejects(access(`${educationRoot}/.app.json`));
  const educationMetadata = JSON.parse(await readFile(`${educationRoot}/.bos-product.json`, "utf8"));
  assert.equal(educationMetadata.connection_owner, "bos");
  assert.equal(educationMetadata.authentication, "bos_managed");
});

test("Claude distribution is a marketplace of self-contained plugins", async () => {
  const marketplace = JSON.parse(
    await readFile(
      `${root}/clients/claude/.claude-plugin/marketplace.json`,
      "utf8"
    )
  );
  assert.equal(marketplace.name, "bos-education-center");
  assert.equal(
    marketplace.plugins.every(({ version }) => version === undefined),
    true,
    "Claude marketplace entries must defer to plugin.json as the single version authority"
  );
  assert.deepEqual(
    marketplace.plugins.map(({ name, source }) => ({ name, source })),
    [
      { name: "bos", source: "./plugins/bos" },
      {
        name: "education-center",
        source: "./plugins/education-center"
      },
    ]
  );
  await assert.rejects(
    access(`${root}/clients/claude/.claude-plugin/plugin.json`),
    /ENOENT/
  );
  await assert.rejects(access(`${root}/clients/claude/.mcp.json`), /ENOENT/);
  const educationCenterReadme = await readFile(
    `${root}/clients/claude/plugins/education-center/README.md`,
    "utf8"
  );
  assert.match(educationCenterReadme, /authenticated adult/);
  assert.match(educationCenterReadme, /Students and minors are data subjects/);
  assert.match(educationCenterReadme, /minimum-necessary disclosure/);
  assert.match(educationCenterReadme, /https:\/\/dfsm\.ai\/apps\/bos\/privacy\.html/);

  await access(`${root}/.claude-plugin/marketplace.json`);

  const educationCenterManifest = JSON.parse(
    await readFile(
      `${root}/clients/claude/plugins/education-center/.claude-plugin/plugin.json`,
      "utf8"
    )
  );
  assert.equal(educationCenterManifest.mcpServers, undefined);
  assert.equal("userConfig" in educationCenterManifest, false);
  await assert.rejects(
    access(`${root}/clients/claude/plugins/education-center/.mcp.json`)
  );

  await assert.rejects(access(`${root}/clients/claude/plugins/video-ads`));
});

test("generated clients use host-native BOS connections without local transport", async () => {
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

test("one Gemini extension bundles CLI and Antigravity Desktop with OAuth MCP", async () => {
  const products = await listProducts();
  for (const { manifest: product } of products) {
    if (product.release_status === "disabled") continue;
    if (!product.clients.includes("gemini")) continue;
    const extensionRoot = `${root}/clients/gemini/extensions/${product.name}`;
    const manifest = JSON.parse(
      await readFile(`${extensionRoot}/gemini-extension.json`, "utf8")
    );
    const desktopPlugin = JSON.parse(
      await readFile(`${extensionRoot}/plugin.json`, "utf8")
    );
    const readme = await readFile(`${extensionRoot}/README.md`, "utf8");
    assert.equal(manifest.name, product.name);
    assert.equal(manifest.version, product.version);
    assert.deepEqual(desktopPlugin, geminiPluginManifest(product));
    assert.match(
      desktopPlugin.description,
      new RegExp(`Version ${product.version.replaceAll(".", "\\.")}\\.$`)
    );
    assert.match(
      readme,
      new RegExp(`gemini extensions install clients/gemini/extensions/${product.name}`)
    );
    assert.match(readme, /\/extensions list/);
    assert.match(readme, /\/skills list/);
    assert.match(readme, new RegExp(`gemini extensions update ${product.name}`));
    assert.match(readme, /Antigravity 2\.0 Desktop/);
    assert.match(readme, /~\/\.gemini\/config\/plugins\//);
    assert.match(readme, /scripts\/clean-install-antigravity\.sh/);
    assert.match(readme, /DELETE ALL BOS ANTIGRAVITY CUSTOMIZATIONS/);
    assert.match(readme, /clean install/i);
    assert.match(readme, /without backups/);
    if (!product.runtime) {
      assert.equal(manifest.mcpServers, undefined);
      await assert.rejects(access(`${extensionRoot}/mcp_config.json`));
      assert.match(readme, /existing BOS connection/i);
      continue;
    }
    assert.match(readme, new RegExp(`/mcp auth ${product.mcp_group_name}`));
    assert.match(readme, /Settings > Customizations/);
    assert.match(readme, /Authenticate/);
    assert.match(
      readme,
      /mcp\/apps\/bos\/platform/
    );
    assert.deepEqual(Object.keys(manifest.mcpServers), [product.mcp_group_name]);
    const server = manifest.mcpServers[product.mcp_group_name];
    assert.equal(
      server.httpUrl,
      "https://dfsm.ai/mcp/apps/bos/platform"
    );
    assert.equal(server.url, undefined);
    assert.equal(server.command, undefined);
    assert.deepEqual(server.oauth, { enabled: true });
    assert.equal(server.headers, undefined);
    assert.equal(manifest.settings, undefined);
    const desktopMcp = JSON.parse(
      await readFile(`${extensionRoot}/mcp_config.json`, "utf8")
    );
    assert.deepEqual(desktopMcp, await geminiPluginMcpManifest(product));
    assert.equal(
      desktopMcp.mcpServers[product.mcp_group_name].serverUrl,
      "https://dfsm.ai/mcp/apps/bos/platform"
    );
    assert.doesNotMatch(
      JSON.stringify(manifest),
      /BOS_INSTALLED_APP_ID|installed_app_id/
    );

    const skills = await resolveProductSkills(product);
    for (const skill of skills) {
      await access(`${extensionRoot}/skills/${skill.name}/SKILL.md`);
    }
  }
});

test("Gemini client package provides one CLI and desktop extension umbrella", async () => {
  const readme = await readFile(`${root}/clients/gemini/README.md`, "utf8");
  assert.match(readme, /gemini extensions install clients\/gemini\/extensions\/bos/);
  assert.match(
    readme,
    /gemini extensions install clients\/gemini\/extensions\/education-center/
  );
  assert.match(readme, /Antigravity 2\.0 Desktop/);
  assert.match(readme, /~\/\.gemini\/config\/plugins/);
  assert.match(readme, /scripts\/clean-install-antigravity\.sh/);
  assert.match(readme, /DELETE ALL BOS ANTIGRAVITY CUSTOMIZATIONS/);
  assert.match(readme, /clean installer/);
  assert.match(readme, /without backups/);
  assert.match(readme, /After each Git pull, restart Antigravity/);
  assert.match(readme, /\/mcp auth platform/);
  assert.match(readme, /Settings > Customizations/);
  assert.doesNotMatch(readme, /API key|sensitive BOS setting/i);
  assert.match(readme, /\/extensions list/);
  assert.match(readme, /\/skills list/);
});

test("feedback contract uses the BOS MCP resource and stable retry identity", async () => {
  const metadata = JSON.parse(await readFile(
    `${root}/clients/codex/plugins/bos/.bos-product.json`,
    "utf8"
  ));
  const app = JSON.parse(await readFile(
    `${root}/clients/codex/plugins/bos/.app.json`,
    "utf8"
  ));
  const runtime = JSON.parse(await readFile(
    `${root}/source/runtime/bos/.mcp.json`,
    "utf8"
  ));
  const url = `https://dfsm.ai/mcp/apps/${metadata.application_name}/${metadata.mcp_group_name}`;
  assert.equal(url, "https://dfsm.ai/mcp/apps/bos/platform");
  assert.equal(runtime.mcpServers.bos.url, url);
  assert.equal(app.apps.bos.id, metadata.codex_app_id);
  assert.equal(app.apps.bos.required, true);
  assert.doesNotMatch(JSON.stringify({ metadata, runtime, app }), /BOS_INSTALLED_APP_ID/);

  const skill = await readFile(
    `${root}/source/platform/submit-feedback/SKILL.md`,
    "utf8"
  );
  const contract = await readFile(
    `${root}/source/platform/submit-feedback/references/feedback-contract.md`,
    "utf8"
  );
  assert.match(skill, /Do not send execution-scope fields/);
  assert.match(skill, /retry once with the same submission ID/);
  assert.match(skill, /Do not claim triage, assignment, prioritization/);
  assert.match(contract, /missing_or_ambiguous_scope/);
  assert.match(contract, /feedback_create_not_allowed/);
  assert.match(contract, /feedback_rate_limit_exceeded/);
  assert.match(contract, /feedback_storage_unavailable/);
  assert.match(contract, /idempotency_conflict/);
  assert.doesNotMatch(contract, /"org_id"|"app_code"|"installed_app_id"/);
});

test("Education Center composition contains only approved shared runtime foundations", async () => {
  const products = await listProducts();
  const byName = Object.fromEntries(
    products.map(({ manifest }) => [manifest.name, manifest])
  );
  const educationCenter = await resolveProductSkills(byName["education-center"]);
  assert(educationCenter.some((skill) => skill.name === "education-center-class-operations"));
  assert(educationCenter.some((skill) => skill.name === "education-center-customer-initialization"));
  const bos = await resolveProductSkills(byName.bos);
  const bosNames = new Set(bos.map((skill) => skill.name));
  const shared = educationCenter
    .filter((skill) => bosNames.has(skill.name))
    .map((skill) => skill.name);
  assert.deepEqual(shared, [
    "bos-mcp-client",
    "bos-plugin-settings",
    "submit-feedback",
    "manage-customer-extension"
  ]);
});

test("My CRM composes the approved reusable federated runtime skills", async () => {
  const products = await listProducts();
  const myCrm = products.find(({ manifest }) => manifest.name === "my-crm")?.manifest;
  assert(myCrm);
  assert.equal(myCrm.release_status, "disabled");
  assert.deepEqual(
    myCrm.includes.filter((include) => include.startsWith("platform/")),
    [
      "platform/bos-mcp-client",
      "platform/bos-plugin-settings",
      "platform/bos-plugin-settings-initialization",
      "platform/bos-federated-query",
      "platform/bos-cache-maintenance",
      "platform/submit-feedback",
      "platform/manage-customer-extension"
    ]
  );
  const skills = await resolveProductSkills(myCrm);
  assert(skills.some((skill) => skill.name === "bos-federated-query"));
  assert(skills.some((skill) => skill.name === "bos-cache-maintenance"));

  const policy = JSON.parse(await readFile(
    `${root}/source/capabilities/my-crm/references/client-policy.json`,
    "utf8"
  ));
  assert.deepEqual(policy.freshness_defaults_seconds, {
    exact_record: 60,
    pipeline_state: 120,
    record_search: 300,
    activity_timeline: 600
  });
  assert.equal(
    policy.identity.automatic_merged_view_key,
    "exact_normalized_email"
  );
  assert.equal(policy.mutation.verification_reads_per_uncertain_source, 1);
  assert.equal(policy.mutation.safe_replays_per_uncertain_source, 1);
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
    if (manifest.release_status === "disabled") {
      for (const productRoot of Object.values(roots).map((resolver) =>
        resolver(manifest.name)
      )) {
        await assert.rejects(access(productRoot));
      }
      continue;
    }
    for (const client of manifest.clients) {
      const productRoot = roots[client](manifest.name);
      const metadata = JSON.parse(
        await readFile(`${productRoot}/.bos-product.json`, "utf8")
      );
      assert.deepEqual(metadata, {
        schema_version: "1",
        name: manifest.name,
        version: manifest.version,
        client,
        ...(client === "codex" ? {
          runtime_verification_tools: manifest.runtime_verification_tools,
          ...(manifest.runtime ? { codex_app_id: manifest.codex_app_id } : {})
        } : {}),
        ...(manifest.runtime ? {
          application_name: manifest.application_name,
          mcp_group_name: manifest.mcp_group_name,
          ...(client === "claude" ? {
            connection_scope: "claude_account",
            resource_url: "https://dfsm.ai/mcp/apps/bos/platform"
          } : {})
        } : {}),
        connection_owner: "bos",
        authentication: manifest.runtime
          ? "oauth_2_1"
          : "bos_managed"
      });
      const manager = await readFile(
        `${productRoot}/skills/manage-customer-extension/SKILL.md`,
        "utf8"
      );
      assert.match(manager, /asks to update, customize, override, specialize/);
      assert.match(manager, /<product-root>\/\.bos-package-state\.json/);
      assert.match(
        manager,
        /~\/\.agents\/bos-education-center-marketplace\/plugins\/<product>\/skills/
      );
      assert.match(manager, /Report\s+the resolved physical extension path before writing it/);
      assert.match(manager, /config\/customer-settings\.json.*product-wide/s);
      assert.match(manager, /\.bos-extension\.json.*per-skill/s);
    }
  }
});

test("generated feedback skill automatically discovers customer customizations", async () => {
  const products = await listProducts();
  for (const { manifest } of products) {
    if (manifest.release_status === "disabled") continue;
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

test("customer installation guidance contains no maintainer build commands", async () => {
  const readme = await readFile(`${root}/README.md`, "utf8");
  const installSection = readme.split("## Install\n")[1]
    .split("## Customer onboarding\n")[0];
  const normalizedInstallSection = installSection
    .replace(/^>\s?/gm, "")
    .replace(/\s+/g, " ");
  assert.doesNotMatch(installSection, /npm run (?:build|release(?::check|:customer)?)/);
  assert.match(installSection, /Education Operation Center/);
  assert.doesNotMatch(installSection, /(?<!Operation )Education Center/);
  assert.doesNotMatch(installSection, /clone this repository/i);
  assert.doesNotMatch(installSection, /unreleased development version/i);
  assert.match(installSection, /host's sign-in flow/i);
  assert.match(installSection, /paste:/i);
  assert.doesNotMatch(
    installSection,
    /EDUCATION_CENTER_BOS_API_KEY|bearer_token_env_var|user_config\.bos_api_key|gcloud|gcp-secret-name/i
  );
  assert.match(
    normalizedInstallSection,
    /authorization is incomplete.*registered app binding renders.*plugin-page action.*absent.*display-binding defect.*do not launch authentication.*unavailable-data report/i
  );
});

test("README routes customer, development, and credential-free release validation explicitly", async () => {
  const readme = await readFile(`${root}/README.md`, "utf8");
  const repositoryPackage = JSON.parse(await readFile(`${root}/package.json`, "utf8"));
  const environmentIndex = readme.split("## Choose your environment\n")[1]
    .split("## Install\n")[0];
  const installSection = readme.split("## Install\n")[1]
    .split("## Customer onboarding\n")[0];
  const developmentSection = readme.split("## Local plugin development\n")[1]
    .split("## Release validation\n")[0];
  const releaseSection = readme.split("## Release validation\n")[1]
    .split("## Other clients\n")[0];

  for (const destination of [
    "#chatgptcodex-desktop",
    "#claude-coworkdesktop",
    "#local-plugin-development",
    "#release-validation",
    "#other-clients"
  ]) {
    assert.match(environmentIndex, new RegExp(`\\(${destination}\\)`));
  }

  assert.match(installSection, /Open a new Codex task and paste:/);
  assert.ok(
    installSection.includes(
      `Current desktop marketplace release: \`${repositoryPackage.version}\``
    )
  );
  assert.match(installSection, /Customize → Plugins/);
  assert.match(installSection, /host's sign-in flow/i);
  assert.doesNotMatch(
    installSection,
    /EDUCATION_CENTER_BOS_API_KEY|EDUCATION_CENTER_SMOKE_TIME_ZONE/
  );
  assert.match(developmentSection, /codex plugin marketplace add \.\//);
  assert.match(developmentSection, /claude plugin marketplace add \.\//);
  assert.match(releaseSection, /npm run release:check/);
  assert.match(releaseSection, /credential-free and local/i);
  assert.match(releaseSection, /creates no ZIPs, tarballs, customer archives/i);
  assert.match(releaseSection, /performs no live MCP call/i);
  assert.doesNotMatch(releaseSection, /ACCESS_TOKEN|SMOKE_TIME_ZONE/);
  assert.equal(repositoryPackage.scripts.build, "npm run build:packages");
  assert.equal(
    repositoryPackage.scripts["release:check"],
    "npm run build && npm run check && npm run contract:check && npm test"
  );
  for (const removed of [
    "build:artifacts",
    "check:build",
    "release:customer",
    "smoke:mcp:education-center",
    "smoke:mcp:education-center-data",
    "smoke:mcp:video-ads"
  ]) {
    assert.equal(repositoryPackage.scripts[removed], undefined);
  }
});

test("release sources contain no archive builders or noninteractive OAuth gate", async () => {
  const retiredReleaseToken = [
    "EDUCATION_CENTER", "RELEASE", "OAUTH", "ACCESS", "TOKEN"
  ].join("_");
  const currentReleaseSources = [
    `${root}/package.json`,
    `${root}/README.md`,
    `${root}/Vault/docs/architecture.md`,
    `${root}/.agents/skills/ship-it/SKILL.md`
  ];
  for (const path of currentReleaseSources) {
    const content = await readFile(path, "utf8");
    assert.equal(content.includes(retiredReleaseToken), false);
    assert.doesNotMatch(content, /create_(?:release|customer_zip)\.py/);
  }
  for (const removedPath of [
    `${root}/scripts/create_release.py`,
    `${root}/scripts/create_customer_zip.py`,
    `${root}/scripts/check-build-output.mjs`,
    `${root}/scripts/smoke-mcp-connection.mjs`,
    `${root}/scripts/smoke-education-center-director-query.mjs`
  ]) {
    assert.equal(await pathExists(removedPath), false);
  }
});

test("ship-it publishes releases through a merged pull request", async () => {
  const workflow = await readFile(
    `${root}/.agents/skills/ship-it/SKILL.md`,
    "utf8"
  );
  assert.match(workflow, /Never push a release commit directly to the default branch/i);
  assert.match(workflow, /create a release branch/i);
  assert.match(workflow, /open a pull request/i);
  assert.match(workflow, /merge the pull request/i);
  assert.match(workflow, /Claude organization marketplace/i);
  assert.match(workflow, /publisher cannot force a refresh/i);
  assert.match(workflow, /official Anthropic marketplace/i);
  assert.match(workflow, /codex plugin marketplace upgrade/i);
  assert.match(workflow, /OpenAI Platform/i);
  assert.equal(
    workflow.indexOf("## Create the release branch") <
      workflow.indexOf("## Create the release version"),
    true,
    "release branch creation must precede the version bump"
  );
});

test("desktop marketplace versions match the repository release", async () => {
  const repositoryPackage = JSON.parse(await readFile(`${root}/package.json`, "utf8"));
  const expectedVersion = repositoryPackage.version;
  const packageManifest = JSON.parse(await readFile(
    `${root}/package-manifest.json`,
    "utf8"
  ));
  const claudeMarketplace = JSON.parse(await readFile(
    `${root}/clients/claude/.claude-plugin/marketplace.json`,
    "utf8"
  ));

  assert.equal(packageManifest.version, expectedVersion);
  assert.deepEqual(
    Object.keys(packageManifest.clients).sort(),
    ["claude", "codex", "copilot", "gemini"]
  );
  assert.equal(
    claudeMarketplace.plugins.every(({ version }) => version === undefined),
    true
  );

  for (const clientManifest of [
    "clients/codex/plugins/bos/.codex-plugin/plugin.json",
    "clients/codex/plugins/education-center/.codex-plugin/plugin.json",
    "clients/claude/plugins/bos/.claude-plugin/plugin.json",
    "clients/claude/plugins/education-center/.claude-plugin/plugin.json"
  ]) {
    const manifest = JSON.parse(await readFile(`${root}/${clientManifest}`, "utf8"));
    assert.equal(manifest.version, expectedVersion, clientManifest);
  }
});

test("generated client marketplaces expose native Claude and Codex desktop packages", async () => {
  const codex = JSON.parse(await readFile(
    `${root}/clients/codex/.agents/plugins/marketplace.json`,
    "utf8"
  ));
  const claude = JSON.parse(await readFile(
    `${root}/clients/claude/.claude-plugin/marketplace.json`,
    "utf8"
  ));
  assert.deepEqual(codex.plugins.map(({ name, source, policy }) => ({
    name,
    path: source.path,
    authentication: policy.authentication
  })), [
    {
      name: "bos",
      path: "./plugins/bos",
      authentication: "ON_INSTALL"
    },
    {
      name: "education-center",
      path: "./plugins/education-center",
      authentication: "ON_USE"
    }
  ]);
  assert.deepEqual(claude.plugins.map(({ name, source }) => ({ name, source })), [
    { name: "bos", source: "./plugins/bos" },
    {
      name: "education-center",
      source: "./plugins/education-center"
    }
  ]);
  const repositoryCodex = JSON.parse(await readFile(
    `${root}/.agents/plugins/marketplace.json`,
    "utf8"
  ));
  const repositoryClaude = JSON.parse(await readFile(
    `${root}/.claude-plugin/marketplace.json`,
    "utf8"
  ));
  assert.deepEqual(repositoryCodex.plugins.map(({ name, source }) => ({
    name,
    path: source.path
  })), [
    { name: "bos", path: "./clients/codex/plugins/bos" },
    { name: "education-center", path: "./clients/codex/plugins/education-center" }
  ]);
  assert.deepEqual(repositoryClaude.plugins.map(({ name, source }) => ({ name, source })), [
    { name: "bos", source: "./clients/claude/plugins/bos" },
    { name: "education-center", source: "./clients/claude/plugins/education-center" }
  ]);
});

test("Oracle is repository-local and excluded from customer packages", async () => {
  const product = JSON.parse(await readFile(`${root}/products/bos/product.json`, "utf8"));
  const localOracle = await readFile(
    `${root}/.agents/skills/oracle/SKILL.md`,
    "utf8"
  );
  const repositoryInstructions = await readFile(`${root}/AGENTS.md`, "utf8");

  assert.equal(product.includes.includes("platform/oracle"), false);
  assert.match(localOracle, /python3 tools\/vault_index\.py sync --quiet/i);
  assert.match(localOracle, /Vault\/docs\/architecture\.md/i);
  assert.match(localOracle, /never distributed in customer BOS plugins/i);
  assert.match(repositoryInstructions, /repository-local `.agents\/skills\/oracle`/i);
  assert.equal(await pathExists(`${root}/source/platform/oracle/SKILL.md`), false);

  for (const clientRoot of [
    "clients/codex/plugins",
    "clients/claude/plugins",
    "clients/copilot/products",
    "clients/gemini/extensions"
  ]) {
    assert.equal(
      await pathExists(`${root}/${clientRoot}/bos/skills/oracle/SKILL.md`),
      false,
      `${clientRoot} must not distribute the repository-local Oracle`
    );
  }
});

test("migrated BOS personal workflows are canonical and generated for every applicable client", async () => {
  const customerMarkers = new RegExp([
    "/Users/" + "cody",
    "cody" + "\\.marcel",
    "i" + "Code Cherry Creek",
    "M" + "Asset Holdings"
  ].join("|"));
  const bosSkills = [
    "bos-visual-output",
    "campaign-offer-marketing-sales",
    "collision-call-audit-email",
    "collision-repair-proposal-builder",
    "corporate-counsel",
    "email-account-routing",
    "landing-page-copywriting",
    "marketing-analysis",
    "meta-ads-conversion-optimization",
    "sendgrid-campaigns",
    "seo-improvement-loop"
  ];
  const educationSkills = [
    "camp-capacity-planning",
    "local-school-market-research",
    "partnership-proposal-builder"
  ];
  const clientRoots = {
    codex: "clients/codex/plugins",
    claude: "clients/claude/plugins",
    copilot: "clients/copilot/products",
    gemini: "clients/gemini/extensions"
  };
  for (const [client, clientRoot] of Object.entries(clientRoots)) {
    for (const skill of bosSkills) {
      const text = await readFile(`${root}/${clientRoot}/bos/skills/${skill}/SKILL.md`, "utf8");
      assert.doesNotMatch(text, customerMarkers);
    }
    for (const skill of educationSkills) {
      const text = await readFile(
        `${root}/${clientRoot}/education-center/skills/${skill}/SKILL.md`,
        "utf8"
      );
      assert.doesNotMatch(text, customerMarkers);
    }
  }
  await access(`${root}/.agents/skills/codex-token-usage-analysis/SKILL.md`);
});
