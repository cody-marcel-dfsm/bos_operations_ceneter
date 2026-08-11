import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  listProducts,
  copilotCredentialEnvVar,
  copilotMcpManifest,
  geminiExtensionManifest,
  materializeMcpUrl,
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

test("iCode packages include customer-neutral settings defaults", async () => {
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
    assert.match(guidance, /reconcile by[\s\S]*idempotency identifier/i);
    assert.match(guidance, /If BOS is absent from the callable tool manifest/i);
    assert.match(guidance, /Do not stop at\s+diagnosing client registration/i);
    assert.doesNotMatch(guidance, /unnamed endpoint as.*runtime connection/is);
    assert.match(guidance, /shared local document cache/i);
    assert.match(guidance, /request exactly those intervals plus\s+changes after its cursor/i);
    assert.match(guidance, /sync_completed_at/);
    await access(`${client.sourcePath}/scripts/document-cache.mjs`);
    await access(`${client.sourcePath}/references/document-cache-protocol.md`);
  }
});

test("generated runtime clients ship the canonical shared document cache helper", async () => {
  const canonical = await readFile(
    `${root}/source/platform/bos-mcp-client/scripts/document-cache.mjs`
  );
  for (const path of [
    `${root}/clients/codex/plugins/icode-operations-center/skills/bos-mcp-client/scripts/document-cache.mjs`,
    `${root}/clients/claude/plugins/icode-operations-center/skills/bos-mcp-client/scripts/document-cache.mjs`,
    `${root}/clients/copilot/products/icode-operations-center/skills/bos-mcp-client/scripts/document-cache.mjs`,
    `${root}/clients/copilot/skills/bos-mcp-client/scripts/document-cache.mjs`,
    `${root}/clients/gemini/extensions/icode-operations-center/skills/bos-mcp-client/scripts/document-cache.mjs`
  ]) {
    assert.deepEqual(await readFile(path), canonical, path);
  }
});

test("director planner repairs missing customer settings before resuming", async () => {
  const guidance = await readFile(
    `${root}/source/verticals/icode/icode-director-daily-planner/SKILL.md`,
    "utf8"
  );
  assert.match(guidance, /`icode-customer-initialization` when customer settings are missing/i);
  assert.match(guidance, /run `icode-customer-initialization` immediately/i);
  assert.doesNotMatch(guidance, /Stop when the setting is absent or invalid/);
});

test("director daily planner is camp-first at day-level detail", async () => {
  const guidance = await readFile(
    `${root}/source/verticals/icode/icode-director-daily-planner/SKILL.md`,
    "utf8"
  );
  const dailyContract = await readFile(
    `${root}/source/verticals/icode/icode-director-daily-planner/references/planner-content.md`,
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
    `${root}/source/verticals/icode/icode-director-daily-planner/SKILL.md`,
    "utf8"
  );
  const visualContract = await readFile(
    `${root}/source/verticals/icode/icode-director-daily-planner/references/mobile-visual.md`,
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
    `${root}/source/verticals/icode/icode-class-operations/SKILL.md`,
    "utf8"
  );
  const directorGuidance = await readFile(
    `${root}/source/verticals/icode/icode-director-daily-planner/SKILL.md`,
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
  const renderer =
    `${root}/source/verticals/icode/icode-class-operations/scripts/render_week_calendar.py`;
  await access(renderer);

  const temporary = await mkdtemp(join(tmpdir(), "camp-roster-calendar-"));
  try {
    const input = join(temporary, "week.json");
    const output = join(temporary, "week.svg");
    await writeFile(input, JSON.stringify({
      title: "iCode Camps — Test Week",
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
    /request asks only for a class or camp roster[\s\S]*execute `icode-class-operations`/i
  );
  assert.doesNotMatch(
    directorFrontmatter,
    /class or enrollment summary, family contact sheet/i
  );
});

test("director skill handles weekly summaries without scope questions", async () => {
  const guidance = await readFile(
    `${root}/source/verticals/icode/icode-director-daily-planner/SKILL.md`,
    "utf8"
  );
  assert.match(guidance, /weekly summary, weekly director report, week-in-review/i);
  assert.match(guidance, /current local[\s\S]*Monday-through-Sunday/i);
  assert.doesNotMatch(guidance, /most recently completed[\s\S]*Monday-through-Sunday/i);
  assert.match(guidance, /“For my director” identifies\s+the report audience/i);
  assert.match(guidance, /Never ask the\s+user to choose a director, organization, source, key, or role/i);
  assert.match(guidance, /Require exactly one[\s\S]*authenticated user and role/i);
  assert.match(guidance, /Never ask whether to use iCode operations, email, Calendar/i);
  assert.match(guidance, /every camp[\s\S]*student roster by day/i);
  assert.match(guidance, /primary family phone/i);
  assert.match(guidance, /Paid enrollment[\s\S]*Care\.com[\s\S]*Bright Horizons/i);
  assert.match(guidance, /parent communication notes[\s\S]*this week's camps/i);
  assert.match(guidance, /upcoming Calendar events/i);
  const weeklyContract = await readFile(
    `${root}/source/verticals/icode/icode-director-daily-planner/references/weekly-summary-content.md`,
    "utf8"
  );
  assert.match(weeklyContract, /## Camps this week/);
  assert.match(weeklyContract, /Day\/date[\s\S]*Primary family phone[\s\S]*Enrollment source/);
  assert.match(weeklyContract, /## Family calls and camp exceptions/);
  assert.match(weeklyContract, /## Upcoming events/);
  assert.match(weeklyContract, /confirmed but unassigned[\s\S]*Needs review/);
  const product = (await listProducts()).find(
    ({ manifest }) => manifest.name === "icode-operations-center"
  )?.manifest;
  assert(product);
  assert(product.default_prompts.includes("Give me a weekly summary for my director."));
});

test("camp and student evidence honor customer-owned Care.com source routing", async () => {
  for (const relativePath of [
    "source/verticals/icode/icode-class-operations/SKILL.md",
    "source/verticals/icode/icode-student-operations/SKILL.md"
  ]) {
    const guidance = await readFile(`${root}/${relativePath}`, "utf8");
    assert.match(guidance, /source_routes\.care_com/i);
    assert.match(guidance, /`icode_search_email_evidence`/);
    assert.match(guidance, /email-account-routing/i);
    assert.match(guidance, /normal Gmail connector/i);
    assert.match(guidance, /bounded lookback of up to 180 days/i);
    assert.match(guidance, /mailboxes\.care_com/i);
  }
});

test("service routing composes package defaults with preserved customer settings", async () => {
  const guidance = await readFile(
    `${root}/source/verticals/icode/icode-service-routing/SKILL.md`,
    "utf8"
  );
  assert.match(guidance, /customer-settings\.template\.json[\s\S]*recursively overlay/i);
  assert.match(guidance, /Package builds never rewrite the customer overlay/i);
  assert.match(guidance, /source_routes\.care_com/i);
  assert.match(guidance, /connected_gmail[\s\S]*email-account-routing/i);
});

test("Bright Horizons report prompts deterministically generate the reimbursement workbook", async () => {
  const skillRoot = `${root}/source/verticals/icode/icode-invoice-operations`;
  const guidance = await readFile(`${skillRoot}/SKILL.md`, "utf8");
  const contract = await readFile(
    `${skillRoot}/references/bright-horizons-workbook.md`,
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
  assert.match(guidance, /one short summary plus the\s+attached workbook/i);
  assert.match(contract, /commands[\s\S]*create a Bright Horizons report for last week/i);
  assert.match(contract, /attached final[\s\S]*`\.xlsx` workbook/i);
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
        other_comments: ""
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
        `${root}/source/verticals/icode/icode-invoice-operations/scripts/build_bh_invoice.mjs`,
        inputPath,
        "--validate-only"
      ],
      { cwd: root }
    );
    const result = JSON.parse(stdout);
    assert.equal(result.template_schema_version, "bright-horizons-reimbursement-template/v1");
    assert.equal(result.invoice_reference, "EXAMPLE_7");
    assert.equal(result.child_day_count, 3);
    assert.equal(result.invoice_total, 309);
    assert.equal(result.period_start, "2026-08-03");
    assert.equal(result.period_end, "2026-08-09");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("client distributions include the Bright Horizons reimbursement template", async () => {
  for (const path of [
    `${root}/clients/codex/plugins/icode-operations-center/skills/icode-invoice-operations/assets/bright-horizons-reimbursement-template.json`,
    `${root}/clients/claude/plugins/icode-operations-center/skills/icode-invoice-operations/assets/bright-horizons-reimbursement-template.json`,
    `${root}/clients/copilot/products/icode-operations-center/skills/icode-invoice-operations/assets/bright-horizons-reimbursement-template.json`,
    `${root}/clients/gemini/extensions/icode-operations-center/skills/icode-invoice-operations/assets/bright-horizons-reimbursement-template.json`
  ]) {
    await access(path);
  }
});

test("parent communications owns the configured email-evidence route", async () => {
  const guidance = await readFile(
    `${root}/source/verticals/icode/icode-parent-communications/SKILL.md`,
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
  assert.equal(products.length, 3);
  for (const { path, manifest } of products) {
    assert.deepEqual(validateProduct(manifest, path), []);
    const skills = await resolveProductSkills(manifest);
    assert.equal(skills.length, new Set(skills.map((skill) => skill.name)).size);
  }
});

test("runtime manifests use explicit human-readable application and MCP group names", async () => {
  const products = await listProducts();
  assert.deepEqual(
    Object.fromEntries(
      products.map(({ manifest }) => [
        manifest.name,
        [manifest.application_name, manifest.mcp_group_name]
      ])
    ),
    {
      bos: [undefined, undefined],
      "icode-operations-center": ["leaddirector", "icode-operations"],
      "video-ads": ["leaddirector", "video-ads"]
    }
  );
  for (const { manifest } of products) {
    assert.equal("mcp_application" in manifest, false);
    assert.equal("mcp_resource_group" in manifest, false);
    assert.equal("installed_app_id" in manifest, false);
  }
});

test("runtime package model materializes named application routes", async () => {
  const template = "https://dfsm.ai/mcp/apps/{application_name}/{mcp_group_name}";
  for (const { manifest } of await listProducts()) {
    if (!manifest.runtime) continue;
    const expected = `${template.split("{application_name}")[0]}${manifest.application_name}/${manifest.mcp_group_name}`;
    assert.equal(materializeMcpUrl(template, manifest), expected);
    const gemini = await geminiExtensionManifest(manifest);
    assert.equal(gemini.mcpServers[manifest.mcp_group_name].httpUrl, expected);
    assert.doesNotMatch(JSON.stringify(gemini), /BOS_INSTALLED_APP_ID|installed_app_id/);
    const copilot = await copilotMcpManifest(manifest);
    assert.equal(copilot.mcpServers[manifest.mcp_group_name].url, expected);
    assert.equal(
      copilot.mcpServers[manifest.mcp_group_name].headers.Authorization,
      `Bearer \${${copilotCredentialEnvVar(manifest)}}`
    );
  }
});

test("runtime products declare isolated product credential bindings", async () => {
  const runtimeProducts = (await listProducts())
    .map(({ manifest }) => manifest)
    .filter((manifest) => manifest.runtime);
  for (const product of runtimeProducts) {
    const gemini = await geminiExtensionManifest(product);
    assert.equal(gemini.settings[0].envVar, product.credential_env_var);
    const copilot = await copilotMcpManifest(product);
    assert.equal(
      copilot.mcpServers[product.mcp_group_name].headers.Authorization,
      `Bearer \${${copilotCredentialEnvVar(product)}}`
    );
  }
  assert.equal(
    new Set(runtimeProducts.map(({ credential_env_var }) => credential_env_var)).size,
    runtimeProducts.length
  );
});

test("Copilot products bundle GitHub's repository MCP configuration", async () => {
  for (const { manifest: product } of await listProducts()) {
    if (product.release_status === "disabled") continue;
    if (!product.clients.includes("copilot")) continue;
    const productRoot = `${root}/clients/copilot/products/${product.name}`;
    if (!product.runtime) {
      await assert.rejects(access(`${productRoot}/.github/mcp.json`));
      const readme = await readFile(`${productRoot}/README.md`, "utf8");
      assert.match(readme, /skills-only package/i);
      continue;
    }
    const config = JSON.parse(
      await readFile(`${productRoot}/.github/mcp.json`, "utf8")
    );
    assert.deepEqual(Object.keys(config.mcpServers), [product.mcp_group_name]);
    assert.deepEqual(config.mcpServers[product.mcp_group_name], {
      type: "http",
      url: `https://dfsm.ai/mcp/apps/${product.application_name}/${product.mcp_group_name}`,
      headers: {
        Authorization: `Bearer \${${copilotCredentialEnvVar(product)}}`
      },
      tools: ["*"]
    });
    assert.doesNotMatch(
      JSON.stringify(config),
      /BOS_INSTALLED_APP_ID|installed_app_id/
    );
    const readme = await readFile(`${productRoot}/README.md`, "utf8");
    assert.equal(
      config.mcpServers[product.mcp_group_name].headers.Authorization,
      `Bearer \${${copilotCredentialEnvVar(product)}}`
    );
    assert.match(readme, new RegExp(copilotCredentialEnvVar(product)));
    assert.match(
      readme,
      new RegExp(`/mcp/apps/${product.application_name}/${product.mcp_group_name}`)
    );
  }
});

test("package schema rejects legacy or incomplete MCP route fields", () => {
  const base = {
    schema_version: "1",
    name: "example",
    version: "1.0.0",
    display_name: "Example",
    description: "Example runtime package.",
    publisher: "Example Publisher",
    category: "Productivity",
    authentication: "ON_USE",
    release_status: "active",
    clients: ["codex"],
    includes: ["platform/bos-mcp-client"],
    runtime: "bos",
    application_name: "leaddirector",
    mcp_group_name: "example",
    credential_env_var: "EXAMPLE_BOS_API_KEY",
    default_prompts: []
  };
  assert.deepEqual(validateProduct(base), []);
  assert.match(
    validateProduct({ ...base, includes: ["platform/planning"] }).join("\n"),
    /runtime requires platform\/bos-mcp-client/
  );
  assert.match(
    validateProduct({ ...base, mcp_application: "leaddirector" }).join("\n"),
    /unknown field mcp_application/
  );
  const { mcp_group_name: _removed, ...incomplete } = base;
  assert.match(validateProduct(incomplete).join("\n"), /runtime requires application_name and mcp_group_name/);
});

test("Video Ads composes workflow skills and a scoped BOS endpoint", async () => {
  const products = await listProducts();
  const videoAds = products.find(
    ({ manifest }) => manifest.name === "video-ads"
  )?.manifest;
  assert(videoAds);
  assert.equal(videoAds.runtime, "bos");
  assert.equal(videoAds.application_name, "leaddirector");
  assert.equal(videoAds.mcp_group_name, "video-ads");
  assert.equal(videoAds.release_status, "disabled");
  assert.equal(videoAds.credential_env_var, "VIDEO_ADS_BOS_API_KEY");
  const skills = await resolveProductSkills(videoAds);
  assert.deepEqual(
    skills.map((skill) => skill.name),
    [
      "bos-mcp-client",
      "manage-customer-extension",
      "video-ad-briefing",
      "video-ad-generation",
      "video-ad-drive-delivery"
    ]
  );
});

test("disabled products are absent while active runtime products remain scoped", async () => {
  for (const client of ["codex", "claude"]) {
    await assert.rejects(access(`${root}/clients/${client}/plugins/bos/.mcp.json`));
    await assert.rejects(
      access(`${root}/clients/${client}/plugins/video-ads`)
    );
    const iCode = JSON.parse(
      await readFile(
        `${root}/clients/${client}/plugins/icode-operations-center/.mcp.json`,
        "utf8"
      )
    );
    assert.deepEqual(Object.keys(iCode.mcpServers), ["icode-operations"]);
    assert.equal(iCode.mcpServers["icode-operations"].type, "http");
    assert.equal(
      iCode.mcpServers["icode-operations"].url,
      "https://dfsm.ai/mcp/apps/leaddirector/icode-operations"
    );
    if (client === "claude") {
      assert.equal(
        iCode.mcpServers["icode-operations"].headers.Authorization,
        "Bearer ${user_config.bos_api_key}"
      );
    } else {
      assert.equal(
        iCode.mcpServers["icode-operations"].bearer_token_env_var,
        "ICODE_OPERATIONS_BOS_API_KEY"
      );
      assert.equal("headers" in iCode.mcpServers["icode-operations"], false);
    }
  }
});

test("disabled product inventory is generated for idempotent client pruning", async () => {
  const inventory = JSON.parse(
    await readFile(`${root}/clients/disabled-products.json`, "utf8")
  );
  assert.deepEqual(inventory, {
    schema_version: "1",
    products: [{
      name: "video-ads",
      application_name: "leaddirector",
      mcp_group_name: "video-ads"
    }]
  });
});

test("iCode packages use the Lead Director app resource-group route", async () => {
  for (const [client, path] of [
    ["codex", `${root}/clients/codex/plugins/icode-operations-center/.mcp.json`],
    ["claude", `${root}/clients/claude/plugins/icode-operations-center/.mcp.json`]
  ]) {
    const config = JSON.parse(await readFile(path, "utf8"));
    assert.equal(config.mcpServers["icode-operations"].type, "http", client);
    assert.equal(
      config.mcpServers["icode-operations"].url,
      "https://dfsm.ai/mcp/apps/leaddirector/icode-operations",
      client
    );
    if (client === "claude") {
      assert.equal("bearer_token_env_var" in config.mcpServers["icode-operations"], false, client);
      assert.equal(
        config.mcpServers["icode-operations"].headers.Authorization,
        "Bearer ${user_config.bos_api_key}",
        client
      );
    } else {
      assert.equal(
        config.mcpServers["icode-operations"].bearer_token_env_var,
        "ICODE_OPERATIONS_BOS_API_KEY",
        client
      );
      assert.equal("headers" in config.mcpServers["icode-operations"], false, client);
    }
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

  const repositoryMarketplace = JSON.parse(
    await readFile(`${root}/.claude-plugin/marketplace.json`, "utf8")
  );
  assert.equal(repositoryMarketplace.name, "bos-icode");
  assert.deepEqual(
    repositoryMarketplace.plugins.map(({ name, source }) => ({ name, source })),
    marketplace.plugins.map(({ name }) => ({
      name,
      source: `./clients/claude/plugins/${name}`
    }))
  );

  const iCodeManifest = JSON.parse(
    await readFile(
      `${root}/clients/claude/plugins/icode-operations-center/.claude-plugin/plugin.json`,
      "utf8"
    )
  );
  assert.equal(iCodeManifest.mcpServers, "./.mcp.json");
  assert.deepEqual(iCodeManifest.userConfig, {
    bos_api_key: {
      type: "string",
      title: "iCode Operations Center API key",
      description: "Paste the organization-scoped API key supplied by your BOS administrator.",
      sensitive: true,
      required: true
    }
  });

  const iCodeRuntime = JSON.parse(
    await readFile(
      `${root}/clients/claude/plugins/icode-operations-center/.mcp.json`,
      "utf8"
    )
  );
  assert.equal(
    iCodeRuntime.mcpServers["icode-operations"].url,
    "https://dfsm.ai/mcp/apps/leaddirector/icode-operations"
  );
  assert.equal(
    iCodeRuntime.mcpServers["icode-operations"].headers.Authorization,
    "Bearer ${user_config.bos_api_key}"
  );
  assert.equal("bearer_token_env_var" in iCodeRuntime.mcpServers["icode-operations"], false);

  await assert.rejects(access(`${root}/clients/claude/plugins/video-ads`));
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

test("Gemini extensions bundle canonical skills and authenticated Streamable HTTP MCP", async () => {
  const products = await listProducts();
  for (const { manifest: product } of products) {
    if (product.release_status === "disabled") continue;
    if (!product.clients.includes("gemini")) continue;
    const extensionRoot = `${root}/clients/gemini/extensions/${product.name}`;
    const manifest = JSON.parse(
      await readFile(`${extensionRoot}/gemini-extension.json`, "utf8")
    );
    assert.equal(manifest.name, product.name);
    assert.equal(manifest.version, product.version);
    if (!product.runtime) {
      assert.equal(manifest.mcpServers, undefined);
      continue;
    }
    assert.deepEqual(Object.keys(manifest.mcpServers), [product.mcp_group_name]);
    const server = manifest.mcpServers[product.mcp_group_name];
    assert.equal(
      server.httpUrl,
      `https://dfsm.ai/mcp/apps/${product.application_name}/${product.mcp_group_name}`
    );
    assert.equal(server.url, undefined);
    assert.equal(server.command, undefined);
    assert.equal(
      server.headers.Authorization,
      `Bearer \${${product.credential_env_var}}`
    );
    assert.deepEqual(
      manifest.settings.map(({ envVar, sensitive }) => ({ envVar, sensitive })),
      [{ envVar: product.credential_env_var, sensitive: true }]
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

test("feedback contract keeps app resource-group selection static and retry identity stable", async () => {
  const runtime = JSON.parse(await readFile(
    `${root}/clients/codex/plugins/icode-operations-center/.mcp.json`,
    "utf8"
  ));
  const url = runtime.mcpServers["icode-operations"].url;
  assert.equal(url, "https://dfsm.ai/mcp/apps/leaddirector/icode-operations");
  assert.doesNotMatch(JSON.stringify(runtime), /BOS_INSTALLED_APP_ID/);

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

test("iCode composition contains only approved shared runtime foundations", async () => {
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
  assert.deepEqual(shared, ["manage-customer-extension"]);
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
        ...(manifest.runtime ? {
          application_name: manifest.application_name,
          mcp_group_name: manifest.mcp_group_name,
          credential_env_var: manifest.credential_env_var
        } : {})
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

test("customer installation guidance contains no maintainer build commands", async () => {
  const readme = await readFile(`${root}/README.md`, "utf8");
  const installSection = readme.split("## Install\n")[1]
    .split("## Customer onboarding\n")[0];
  const packagedInstructions = await readFile(
    `${root}/installer/README_INSTALL.md`, "utf8"
  );
  for (const guidance of [installSection, packagedInstructions]) {
    assert.doesNotMatch(guidance, /npm run (?:build|release(?::check|:customer)?)/);
  }
  assert.doesNotMatch(installSection, /clone this repository/i);
  assert.doesNotMatch(installSection, /unreleased development version/i);
  assert.match(packagedInstructions, /reconnect the configured named MCP/i);
  assert.match(packagedInstructions, /Restart or reinstall only after a local/i);
});
