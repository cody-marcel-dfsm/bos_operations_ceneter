import assert from "node:assert/strict";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyInstallation as applyInstallationRaw,
  codexBosMcpRegistration,
  codexHostBearerState,
  deriveInitialCustomerSettings,
  inspectInstallation,
  validateCustomerSettings,
  verifyInstallation as verifyInstallationRaw
} from "../scripts/install-package.mjs";
import { createCustomerExtension } from "../scripts/create-extension.mjs";
import { hashFile, root } from "../scripts/lib/package-model.mjs";

async function temporaryHome() {
  return mkdtemp(join(tmpdir(), "bos-install-test-"));
}

const customerSettings = {
  schema_version: "1",
  organization_display_name: "Example Learning LLC",
  location_display_name: "Example Center",
  timezone: "America/New_York",
  mailboxes: { care_com: "operations@example.com", parent_communications: "" },
  source_routes: {
    calimatic: "bos",
    lead_director: "bos",
    calendar: "bos",
    parent_communications: "bos",
    care_com: "connected_gmail"
  },
  billing: {
    center_name: "Example Center",
    address: "100 Example Avenue",
    billing_contact_name: "Accounts Receivable",
    phone_number: "5550100200",
    invoice_reference_prefix: "EXAMPLE_",
    bright_horizons_rate_per_child_day: 100
  }
};

const mcpApplication = "leaddirector";
const mcpResourceGroup = "icode-operations";
const resourceGroupUrl = "https://dfsm.ai/mcp/apps/leaddirector/icode-operations";

async function fakeCodex(_command, args) {
  if (args[0] === "mcp" && args[1] === "get") {
    const group = args[2];
    const url = `https://dfsm.ai/mcp/apps/leaddirector/${group}`;
    return {
      stdout: [
        group,
        `  url: ${url}`,
        "  bearer_token_env_var: BOS_API_KEY"
      ].join("\n")
    };
  }
  return { stdout: "" };
}

function applyInstallation(options) {
  return applyInstallationRaw({
    inspectCodexHost: async () => ({ state: "current", pid: 12345 }),
    runCommand: fakeCodex,
    ...options
  });
}

function verifyInstallation(options) {
  return verifyInstallationRaw({
    inspectCodexHost: async () => ({ state: "current", pid: 12345 }),
    runCommand: fakeCodex,
    ...options
  });
}

test("Codex runtime registration uses the client-configured BOS key", () => {
  assert.deepEqual(codexBosMcpRegistration(mcpApplication, mcpResourceGroup), {
    name: "icode-operations",
    url: resourceGroupUrl,
    bearer_token_env_var: "BOS_API_KEY",
    args: [
      "mcp", "add", "icode-operations", "--url", resourceGroupUrl,
      "--bearer-token-env-var", "BOS_API_KEY"
    ]
  });
  assert.throws(
    () => codexBosMcpRegistration("leaddirector", "not a group"),
    /kebab-case/
  );
});

test("Codex runtime registration always uses immutable named package routes", () => {
  const registration = codexBosMcpRegistration(
    "leaddirector",
    "icode-operations"
  );
  assert.equal(
    registration.url,
    "https://dfsm.ai/mcp/apps/leaddirector/icode-operations"
  );
  assert(!registration.url.includes("installed_app_id"));
  assert(!registration.args.includes("BOS_INSTALLED_APP_ID"));
});

test("Codex runtime installation derives app and resource group from product", async () => {
  const home = await temporaryHome();
  const report = await applyInstallationRaw({
    home,
    product: "icode-operations-center",
    inspectCodexHost: async () => ({ state: "current", pid: 12345 }),
    runCommand: fakeCodex
  });
  assert.equal(report.runtime.state, "current");
  assert.equal(report.runtime.url, resourceGroupUrl);
});

test("Codex runtime installation rejects a stale uncredentialed host", async () => {
  const home = await temporaryHome();
  const report = await applyInstallationRaw({
    home,
    product: "icode-operations-center",
    environment: { BOS_API_KEY: "credentialed-installer-shell" },
    inspectCodexHost: async () => ({
      state: "configuration_required",
      reason: "codex_host_bos_api_key_missing",
      pid: 4321
    }),
    runCommand: fakeCodex
  });
  assert.deepEqual(report.runtime, {
    state: "configuration_required",
    reason: "codex_host_bos_api_key_missing",
    pid: 4321,
    url: resourceGroupUrl,
    bearer_token_env_var: "BOS_API_KEY"
  });
});

test("Codex host inspection reads the active app-server environment", async (context) => {
  if (process.platform !== "darwin") {
    context.skip("macOS host inspection");
    return;
  }
  const calls = [];
  const report = await codexHostBearerState(async (_command, args) => {
    calls.push(args);
    if (args[0] === "-axo") {
      return {
        stdout: "4321 /Applications/ChatGPT.app/Contents/Resources/codex app-server\n"
      };
    }
    return {
      stdout: "/Applications/ChatGPT.app/Contents/Resources/codex app-server BOS_API_KEY=test-only"
    };
  });
  assert.deepEqual(report, { state: "current", pid: 4321 });
  assert.deepEqual(calls[1], ["eww", "-p", "4321", "-o", "command="]);
});

test("initialization derives safe client values and leaves unknowns unresolved", () => {
  const template = {
    schema_version: "1",
    organization_display_name: "",
    location_display_name: "",
    timezone: "",
    mailboxes: { care_com: "", parent_communications: "" },
    source_routes: { care_com: "bos" },
    billing: {}
  };
  const draft = deriveInitialCustomerSettings(template, {
    timezone: "America/Chicago",
    organization_display_name: "Example Organization",
    care_com_mailbox: "care@example.com"
  });
  assert.equal(draft.timezone, "America/Chicago");
  assert.equal(draft.organization_display_name, "Example Organization");
  assert.equal(draft.location_display_name, "");
  assert.equal(draft.mailboxes.care_com, "care@example.com");
  assert.deepEqual(draft._initialization.derived_sources, {
    organization_display_name: "client_context",
    timezone: "client_context",
    "mailboxes.care_com": "client_connected_account_metadata"
  });
});

test("customer source routes are typed and cannot redirect operational domains to Gmail", () => {
  assert.deepEqual(validateCustomerSettings(customerSettings), []);
  assert.match(
    validateCustomerSettings({
      ...customerSettings,
      source_routes: { ...customerSettings.source_routes, calimatic: "connected_gmail" }
    }).join("; "),
    /source_routes\.calimatic does not support connected_gmail/
  );
  assert.match(
    validateCustomerSettings({
      ...customerSettings,
      source_routes: { ...customerSettings.source_routes, care_com: "unknown" }
    }).join("; "),
    /source_routes\.care_com must be bos or connected_gmail/
  );
  assert.match(
    validateCustomerSettings({
      ...customerSettings,
      source_routes: {
        ...customerSettings.source_routes,
        parent_communications: "connected_gmail"
      }
    }).join("; "),
    /source_routes\.parent_communications requires mailboxes\.parent_communications/
  );
  assert.deepEqual(
    validateCustomerSettings({
      ...customerSettings,
      mailboxes: {
        ...customerSettings.mailboxes,
        parent_communications: "families@example.com"
      },
      source_routes: {
        ...customerSettings.source_routes,
        parent_communications: "connected_gmail"
      }
    }),
    []
  );
});

test("iCode install without answers creates a customer-owned initialization draft", async () => {
  const home = await temporaryHome();
  const report = await applyInstallation({
    home,
    product: "icode-operations-center",
    clientContext: { timezone: "America/Los_Angeles" }
  });
  assert.equal(report.settings.state, "initializing");
  const draft = JSON.parse(await readFile(report.settings.draft_path, "utf8"));
  assert.equal(draft.timezone, "America/Los_Angeles");
  assert.equal(draft.organization_display_name, "");
  assert.equal((await stat(report.settings.draft_path)).mode & 0o777, 0o600);
});

test("customer settings validate, install, and survive product updates", async () => {
  const home = await temporaryHome();
  assert.deepEqual(validateCustomerSettings(customerSettings), []);
  await applyInstallation({
    home,
    product: "icode-operations-center",
    settings: customerSettings
  });
  const settingsPath = join(
    home,
    "plugins",
    "icode-operations-center",
    "config",
    "customer-settings.json"
  );
  assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")), customerSettings);
  assert.equal((await stat(settingsPath)).mode & 0o777, 0o600);
  const report = await applyInstallation({
    home,
    product: "icode-operations-center"
  });
  assert.equal(report.settings.state, "current");
  assert.deepEqual(JSON.parse(await readFile(settingsPath, "utf8")), customerSettings);
  assert(report.actions.preserve.includes("config/customer-settings.json"));
});

test("customer settings reject missing identity and invalid timezone", () => {
  const failures = validateCustomerSettings({
    schema_version: "1",
    organization_display_name: "",
    location_display_name: "Example",
    timezone: "Denver local"
  });
  assert(failures.some((failure) => failure.includes("organization_display_name")));
  assert(failures.some((failure) => failure.includes("IANA timezone")));
});

test("customer settings reject undeclared fields and credential-like values", () => {
  const failures = validateCustomerSettings({
    ...customerSettings,
    api_key: "must-never-live-here",
    mailboxes: { ...customerSettings.mailboxes, private: "other@example.com" }
  });
  assert(failures.includes("unknown settings field: api_key"));
  assert(failures.includes("unknown mailboxes field: private"));
});

test("missing installation is created and second apply is a no-op", async () => {
  const home = await temporaryHome();
  const initial = await inspectInstallation({ home, product: "bos" });
  assert.equal(initial.state, "missing");
  const applied = await applyInstallation({ home, product: "bos" });
  assert.equal(applied.state, "managed-current");
  assert.equal(applied.marketplace, "current");
  const stateBefore = await readFile(
    join(home, "plugins", "bos", ".bos-package-state.json"),
    "utf8"
  );
  const repeated = await applyInstallation({ home, product: "bos" });
  const stateAfter = await readFile(
    join(home, "plugins", "bos", ".bos-package-state.json"),
    "utf8"
  );
  assert.equal(repeated.state, "managed-current");
  assert.equal(stateAfter, stateBefore);
});

test("apply preserves unrelated marketplace entries and plugin files", async () => {
  const home = await temporaryHome();
  await applyInstallation({ home, product: "bos" });
  const userFile = join(home, "plugins", "bos", "USER-NOTES.txt");
  await writeFile(userFile, "preserve me\n");
  const marketplacePath = join(home, ".agents", "plugins", "marketplace.json");
  const marketplace = JSON.parse(await readFile(marketplacePath, "utf8"));
  marketplace.plugins.unshift({
    name: "other",
    source: { source: "local", path: "./plugins/other" },
    policy: { installation: "AVAILABLE", authentication: "ON_USE" },
    category: "Productivity"
  });
  await writeFile(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`);
  const report = await applyInstallation({ home, product: "bos" });
  assert.equal(report.state, "managed-current");
  assert.equal(await readFile(userFile, "utf8"), "preserve me\n");
  const updated = JSON.parse(await readFile(marketplacePath, "utf8"));
  assert.equal(updated.plugins[0].name, "other");
});

test("managed package files are installed read-only", async () => {
  const home = await temporaryHome();
  await applyInstallation({ home, product: "bos" });
  const skill = join(home, "plugins", "bos", "skills", "planning", "SKILL.md");
  const mode = (await stat(skill)).mode & 0o777;
  assert.equal(mode, 0o444);
});

test("customer extension composes a base skill and survives package apply", async () => {
  const home = await temporaryHome();
  await applyInstallation({ home, product: "bos" });
  const created = await createCustomerExtension({
    home,
    product: "bos",
    baseSkill: "planning",
    site: "cherry-creek"
  });
  const extensionSkill = join(created.path, "SKILL.md");
  const before = await readFile(extensionSkill, "utf8");
  assert.match(before, /\$bos:planning/);

  const inspected = await inspectInstallation({ home, product: "bos" });
  assert.deepEqual(inspected.extensions, [
    {
      name: "planning-cherry-creek",
      product: "bos",
      skill: "planning",
      tested_version: created.tested_version,
      schema_version: "2",
      tenant: "cherry-creek"
    }
  ]);
  assert.deepEqual(inspected.warnings, []);

  await applyInstallation({ home, product: "bos" });
  assert.equal(await readFile(extensionSkill, "utf8"), before);
});

test("customer extension reports base version compatibility warnings", async () => {
  const home = await temporaryHome();
  await applyInstallation({ home, product: "bos" });
  const created = await createCustomerExtension({
    home,
    product: "bos",
    baseSkill: "planning",
    site: "cherry-creek"
  });
  const manifestPath = join(created.path, ".bos-extension.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.extends.tested_version = "0.1.0";
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const report = await inspectInstallation({ home, product: "bos" });
  assert.deepEqual(report.warnings, [
    `planning-cherry-creek: tested with 0.1.0; installing ${created.tested_version}`
  ]);
});

test("modified managed file is backed up and replaced", async () => {
  const home = await temporaryHome();
  await applyInstallation({ home, product: "bos" });
  const skill = join(home, "plugins", "bos", "skills", "planning", "SKILL.md");
  await chmod(skill, 0o644);
  await writeFile(skill, "local modification\n");
  const report = await inspectInstallation({ home, product: "bos" });
  assert.equal(report.state, "managed-modified");
  assert.deepEqual(report.actions.replace, ["skills/planning/SKILL.md"]);
  await applyInstallation({ home, product: "bos" });
  assert.notEqual(await readFile(skill, "utf8"), "local modification\n");
  const backups = await readdir(join(home, ".agents", "bos-backups"));
  assert.equal(backups.length, 1);
  assert.equal(
    await readFile(
      join(
        home,
        ".agents",
        "bos-backups",
        backups[0],
        "skills",
        "planning",
        "SKILL.md"
      ),
      "utf8"
    ),
    "local modification\n"
  );
});

test("verify reports current installation", async () => {
  const home = await temporaryHome();
  await applyInstallation({ home, product: "bos" });
  const report = await verifyInstallation({ home, product: "bos" });
  assert.equal(report.ok, true);
});

test("compatible unmanaged plugin is adopted", async () => {
  const home = await temporaryHome();
  const desired = join(root, "clients", "codex", "plugins", "bos");
  const target = join(home, "plugins", "bos");
  await mkdir(join(home, "plugins"), { recursive: true });
  await cp(desired, target, { recursive: true });
  const before = await inspectInstallation({ home, product: "bos" });
  assert.equal(before.state, "compatible-unmanaged");
  const after = await applyInstallation({ home, product: "bos" });
  assert.equal(after.state, "managed-current");
});

test("stale managed file updates when prior hash proves ownership", async () => {
  const home = await temporaryHome();
  await applyInstallation({ home, product: "bos" });
  const skill = join(home, "plugins", "bos", "skills", "planning", "SKILL.md");
  await chmod(skill, 0o644);
  await writeFile(skill, "managed old version\n");
  const statePath = join(
    home,
    "plugins",
    "bos",
    ".bos-package-state.json"
  );
  await chmod(statePath, 0o644);
  const state = JSON.parse(await readFile(statePath, "utf8"));
  state.managed_hashes["skills/planning/SKILL.md"] = await hashFile(skill);
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  const before = await inspectInstallation({ home, product: "bos" });
  assert.equal(before.state, "managed-stale");
  const after = await applyInstallation({ home, product: "bos" });
  assert.equal(after.state, "managed-current");
  assert.notEqual(await readFile(skill, "utf8"), "managed old version\n");
});

test("conflicting marketplace entry stops installation", async () => {
  const home = await temporaryHome();
  const marketplacePath = join(home, ".agents", "plugins", "marketplace.json");
  await mkdir(join(home, ".agents", "plugins"), { recursive: true });
  await writeFile(
    marketplacePath,
    `${JSON.stringify(
      {
        name: "bos-icode",
        plugins: [
          {
            name: "bos",
            source: { source: "local", path: "./plugins/not-bos" },
            policy: {
              installation: "AVAILABLE",
              authentication: "ON_USE"
            },
            category: "Productivity"
          }
        ]
      },
      null,
      2
    )}\n`
  );
  const report = await inspectInstallation({ home, product: "bos" });
  assert.equal(report.state, "conflict");
  await assert.rejects(
    applyInstallation({ home, product: "bos" }),
    /Installation state is conflict/
  );
});

test("unsafe target outside selected home is rejected", async () => {
  const home = await temporaryHome();
  await assert.rejects(
    inspectInstallation({
      home,
      product: "bos",
      target: join(tmpdir(), "outside-bos")
    }),
    /Target must remain inside/
  );
});

test("stale package-owned files are removed while user files remain", async () => {
  const home = await temporaryHome();
  await applyInstallation({ home, product: "bos" });
  const target = join(home, "plugins", "bos");
  const removedPath = join(target, "obsolete-managed.txt");
  const userPath = join(target, "user-owned.txt");
  await writeFile(removedPath, "old managed content\n");
  await writeFile(userPath, "user content\n");
  const statePath = join(target, ".bos-package-state.json");
  await chmod(statePath, 0o644);
  const state = JSON.parse(await readFile(statePath, "utf8"));
  state.managed_paths.push("obsolete-managed.txt");
  state.managed_hashes["obsolete-managed.txt"] = await hashFile(removedPath);
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);

  const before = await inspectInstallation({ home, product: "bos" });
  assert.equal(before.state, "managed-stale");
  assert.deepEqual(before.actions.remove, ["obsolete-managed.txt"]);
  await applyInstallation({ home, product: "bos" });
  await assert.rejects(readFile(removedPath, "utf8"), /ENOENT/);
  assert.equal(await readFile(userPath, "utf8"), "user content\n");
});
