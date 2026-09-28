import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  reconcileCustomerSettings,
  saveCustomerSettings,
  validateCustomerSettings
} from "../source/verticals/education-center/education-center-customer-initialization/scripts/customer-settings.mjs";

const settings = {
  schema_version: "1",
  brand_display_name: "Example Learning",
  organization_display_name: "Example Center",
  organization_website_url: "https://example.com/location",
  location_display_name: "Central",
  timezone: "UTC",
  mailboxes: { care_com: "", parent_communications: "" },
  source_routes: {
    calimatic: "bos",
    lead_director: "bos",
    calendar: "bos",
    parent_communications: "bos",
    care_com: "bos"
  },
  billing: {
    center_name: "",
    address: "",
    billing_contact_name: "",
    phone_number: "",
    invoice_reference_prefix: "",
    bright_horizons_rate_per_child_day: null
  },
  default_context: {
    organization_name: "Example Organization",
    installation_name: "Primary",
    role_label: "Operator"
  }
};

test("confirmed Education Center settings persist outside the plugin and repair a replaced overlay", async () => {
  const root = await mkdtemp(join(tmpdir(), "education-settings-"));
  const durablePath = join(root, "local", "customer-settings.json");
  const overlayPath = join(root, "plugin", "config", "customer-settings.json");
  const initializationPath = join(root, "plugin", "config", "customer-settings.initialization.json");
  try {
    await mkdir(join(root, "plugin", "config"), { recursive: true });
    await writeFile(initializationPath, "{}\n");
    const saved = await saveCustomerSettings(settings, { durablePath, overlayPath, initializationPath });
    assert.equal(saved.state, "current");
    assert.equal((await stat(durablePath)).mode & 0o777, 0o600);
    assert.equal((await stat(overlayPath)).mode & 0o777, 0o600);
    await rm(overlayPath);
    const repaired = await reconcileCustomerSettings({ durablePath, overlayPath });
    assert.equal(repaired.source, "durable");
    assert.deepEqual(JSON.parse(await readFile(overlayPath, "utf8")), settings);
    await assert.rejects(readFile(initializationPath, "utf8"), /ENOENT/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a valid confirmed overlay seeds only its Education Center durable counterpart", async () => {
  const root = await mkdtemp(join(tmpdir(), "education-overlay-"));
  const durablePath = join(root, "education-center", "customer-settings.json");
  const overlayPath = join(root, "plugin", "config", "customer-settings.json");
  try {
    await mkdir(join(root, "plugin", "config"), { recursive: true });
    await writeFile(overlayPath, `${JSON.stringify(settings)}\n`);
    const result = await reconcileCustomerSettings({ durablePath, overlayPath });
    assert.equal(result.source, "overlay");
    assert.deepEqual(JSON.parse(await readFile(durablePath, "utf8")), settings);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing or invalid counterparts retain first-run confirmation", async () => {
  const root = await mkdtemp(join(tmpdir(), "education-missing-"));
  const durablePath = join(root, "local", "customer-settings.json");
  const overlayPath = join(root, "plugin", "config", "customer-settings.json");
  try {
    assert.equal((await reconcileCustomerSettings({ durablePath, overlayPath })).state, "missing");
    await mkdir(join(root, "plugin", "config"), { recursive: true });
    await writeFile(overlayPath, "{}\n");
    assert.equal((await reconcileCustomerSettings({ durablePath, overlayPath })).state, "invalid");
    assert(validateCustomerSettings({ ...settings, default_context: { organization_name: "" } }).length > 0);
    assert(validateCustomerSettings({ ...settings, context_handle: "forbidden" }).length > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("legacy confirmed overlays normalize optional sections and role_code without confirmation", async () => {
  const root = await mkdtemp(join(tmpdir(), "education-legacy-"));
  const durablePath = join(root, "local", "customer-settings.json");
  const overlayPath = join(root, "plugin", "config", "customer-settings.json");
  const legacy = {
    schema_version: "1",
    brand_display_name: settings.brand_display_name,
    organization_display_name: settings.organization_display_name,
    organization_website_url: settings.organization_website_url,
    location_display_name: settings.location_display_name,
    timezone: settings.timezone,
    mailboxes: { care_com: "" },
    source_routes: { lead_director: "bos" },
    billing: { center_name: "Example Center" },
    default_context: { organization_name: "Example Organization", role_code: "Operator" }
  };
  try {
    await mkdir(join(root, "plugin", "config"), { recursive: true });
    await writeFile(overlayPath, `${JSON.stringify(legacy)}\n`);
    const result = await reconcileCustomerSettings({ durablePath, overlayPath });
    assert.equal(result.state, "current");
    assert.equal(result.source, "overlay");
    assert.equal(result.settings.default_context.role_label, "Operator");
    assert(!Object.hasOwn(result.settings.default_context, "role_code"));
    assert.deepEqual(result.settings.mailboxes, settings.mailboxes);
    assert.deepEqual(result.settings.source_routes, settings.source_routes);
    assert.deepEqual(result.settings.billing, { ...settings.billing, center_name: "Example Center" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("settings persistence rejects the installer's non-public website cases", () => {
  for (const organization_website_url of [
    "http://100.64.0.1",
    "http://224.0.0.1",
    "http://center.home"
  ]) {
    assert(validateCustomerSettings({ ...settings, organization_website_url }).includes(
      "organization_website_url must be a public HTTP or HTTPS URL"
    ));
  }
});
