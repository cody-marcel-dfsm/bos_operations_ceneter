import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { BlockList, isIP } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const nonPublicWebsiteIpv4Addresses = new BlockList();
const nonPublicWebsiteIpv6Addresses = new BlockList();
const nonPublicWebsiteSuffixes = new Set([
  "alt", "arpa", "corp", "example", "home", "internal", "intranet", "invalid",
  "lan", "local", "localdomain", "localhost", "onion", "test"
]);
for (const [address, prefix, type] of [
  ["0.0.0.0", 8, "ipv4"], ["10.0.0.0", 8, "ipv4"], ["100.64.0.0", 10, "ipv4"],
  ["127.0.0.0", 8, "ipv4"], ["169.254.0.0", 16, "ipv4"], ["172.16.0.0", 12, "ipv4"],
  ["192.0.0.0", 24, "ipv4"], ["192.0.2.0", 24, "ipv4"], ["192.168.0.0", 16, "ipv4"],
  ["198.18.0.0", 15, "ipv4"], ["198.51.100.0", 24, "ipv4"], ["203.0.113.0", 24, "ipv4"],
  ["224.0.0.0", 4, "ipv4"], ["240.0.0.0", 4, "ipv4"], ["::", 128, "ipv6"],
  ["::1", 128, "ipv6"], ["::", 96, "ipv6"], ["::ffff:0:0", 96, "ipv6"],
  ["::ffff:0:0:0", 96, "ipv6"], ["64:ff9b::", 96, "ipv6"],
  ["64:ff9b:1::", 48, "ipv6"], ["100::", 64, "ipv6"], ["2001::", 32, "ipv6"],
  ["2001:db8::", 32, "ipv6"], ["2002::", 16, "ipv6"], ["fc00::", 7, "ipv6"],
  ["fe80::", 10, "ipv6"], ["fec0::", 10, "ipv6"], ["ff00::", 8, "ipv6"]
]) {
  (type === "ipv4" ? nonPublicWebsiteIpv4Addresses : nonPublicWebsiteIpv6Addresses)
    .addSubnet(address, prefix, type);
}

const optionalDefaults = Object.freeze({
  mailboxes: Object.freeze({ care_com: "", parent_communications: "" }),
  source_routes: Object.freeze({
    calimatic: "bos", lead_director: "bos", calendar: "bos",
    parent_communications: "bos", care_com: "bos"
  }),
  billing: Object.freeze({
    center_name: "", address: "", billing_contact_name: "", phone_number: "",
    invoice_reference_prefix: "", bright_horizons_rate_per_child_day: null
  })
});

function configurationRoot(baseHome = homedir()) {
  const isDefaultHome = baseHome === homedir();
  const root = process.platform === "darwin"
    ? join(baseHome, "Library", "Application Support")
    : process.platform === "win32"
      ? (isDefaultHome && process.env.APPDATA) || join(baseHome, "AppData", "Roaming")
      : (isDefaultHome && process.env.XDG_CONFIG_HOME) || join(baseHome, ".config");
  return join(root, "BOS", "plugins", "education-center");
}

export function durableSettingsPath(baseHome = homedir()) {
  return join(configurationRoot(baseHome), "customer-settings.json");
}

export function installedOverlayPath() {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "config",
    "customer-settings.json"
  );
}

function invalidControlText(value, maximum = 200) {
  return typeof value !== "string" || value.length > maximum ||
    /[\r\n\u0000-\u001f\u007f]/u.test(value);
}

function publicWebsite(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/gu, "").replace(/\.+$/gu, "").toLowerCase();
    const addressType = isIP(host);
    const hasNonPublicSuffix = [...nonPublicWebsiteSuffixes].some(
      (suffix) => host === suffix || host.endsWith(`.${suffix}`)
    );
    return new Set(["http:", "https:"]).has(url.protocol) && !url.username && !url.password &&
      (addressType || host.includes(".")) &&
      !(addressType === 4 && nonPublicWebsiteIpv4Addresses.check(host, "ipv4")) &&
      !(addressType === 6 && nonPublicWebsiteIpv6Addresses.check(host, "ipv6")) &&
      !hasNonPublicSuffix;
  } catch {
    return false;
  }
}

export function normalizeCustomerSettings(settings) {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return settings;
  const normalized = structuredClone(settings);
  for (const [key, defaults] of Object.entries(optionalDefaults)) {
    if (normalized[key] === undefined) {
      normalized[key] = { ...defaults };
    } else if (normalized[key] && typeof normalized[key] === "object" &&
        !Array.isArray(normalized[key])) {
      normalized[key] = { ...defaults, ...normalized[key] };
    }
  }
  if (normalized.default_context && typeof normalized.default_context === "object" &&
      !Array.isArray(normalized.default_context) &&
      Object.hasOwn(normalized.default_context, "role_code") &&
      !Object.hasOwn(normalized.default_context, "role_label")) {
    normalized.default_context.role_label = normalized.default_context.role_code;
    delete normalized.default_context.role_code;
  }
  return normalized;
}

export function validateCustomerSettings(settings) {
  const failures = [];
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return ["settings must be a JSON object"];
  }
  const allowed = new Set([
    "schema_version", "brand_display_name", "organization_display_name",
    "organization_website_url", "location_display_name", "timezone", "mailboxes",
    "source_routes", "billing", "default_context"
  ]);
  if (settings.schema_version !== "1") failures.push('schema_version must be "1"');
  for (const key of Object.keys(settings)) {
    if (!allowed.has(key)) failures.push(`unknown settings field: ${key}`);
  }
  for (const key of [
    "brand_display_name", "organization_display_name", "organization_website_url",
    "location_display_name", "timezone"
  ]) {
    if (typeof settings[key] !== "string" || !settings[key].trim()) {
      failures.push(`${key} must be a non-empty string`);
    }
  }
  if (invalidControlText(settings.brand_display_name ?? "", 120)) {
    failures.push("brand_display_name must be a single-line display value of 120 characters or fewer");
  }
  if (typeof settings.organization_website_url === "string" &&
      !publicWebsite(settings.organization_website_url)) {
    failures.push("organization_website_url must be a public HTTP or HTTPS URL");
  }
  if (typeof settings.timezone === "string" && settings.timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: settings.timezone });
    } catch {
      failures.push("timezone must be a valid IANA timezone");
    }
  }
  const context = settings.default_context;
  if (context !== undefined) {
    if (!context || typeof context !== "object" || Array.isArray(context) ||
        typeof context.organization_name !== "string" || !context.organization_name.trim()) {
      failures.push("default_context.organization_name must be a non-empty string");
    } else {
      const fields = new Set(["organization_name", "installation_name", "role_label"]);
      for (const [key, value] of Object.entries(context)) {
        if (!fields.has(key) || invalidControlText(value)) {
          failures.push(`invalid default_context field: ${key}`);
        }
      }
    }
  }
  const objectFields = {
    mailboxes: new Set(["care_com", "parent_communications"]),
    source_routes: new Set(["calimatic", "lead_director", "calendar", "parent_communications", "care_com"]),
    billing: new Set([
      "center_name", "address", "billing_contact_name", "phone_number",
      "invoice_reference_prefix", "bright_horizons_rate_per_child_day"
    ])
  };
  for (const [key, fields] of Object.entries(objectFields)) {
    const value = settings[key];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      failures.push(`${key} must be an object`);
      continue;
    }
    for (const field of Object.keys(value)) {
      if (!fields.has(field)) failures.push(`unknown ${key} field: ${field}`);
    }
  }
  for (const key of ["care_com", "parent_communications"]) {
    const value = settings.mailboxes?.[key];
    if (value !== "" && (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value))) {
      failures.push(`mailboxes.${key} must be empty or a valid email address`);
    }
  }
  for (const [key, value] of Object.entries(settings.source_routes ?? {})) {
    if (!new Set(["bos", "connected_gmail"]).has(value)) {
      failures.push(`source_routes.${key} must be bos or connected_gmail`);
    } else if (value === "connected_gmail" && !new Set(["care_com", "parent_communications"]).has(key)) {
      failures.push(`source_routes.${key} does not support connected_gmail`);
    } else if (value === "connected_gmail" && !settings.mailboxes?.[key]) {
      failures.push(`source_routes.${key} requires mailboxes.${key}`);
    }
  }
  const rate = settings.billing?.bright_horizons_rate_per_child_day;
  if (rate !== null && (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0)) {
    failures.push("billing.bright_horizons_rate_per_child_day must be null or a non-negative number");
  }
  return failures;
}

async function readValid(path) {
  try {
    const value = normalizeCustomerSettings(JSON.parse(await readFile(path, "utf8")));
    const failures = validateCustomerSettings(value);
    return failures.length ? { state: "invalid", failures } : { state: "current", value };
  } catch (error) {
    if (error?.code === "ENOENT") return { state: "missing" };
    if (error instanceof SyntaxError) return { state: "invalid", failures: ["invalid JSON"] };
    throw error;
  }
}

async function writeAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await rename(temporary, path);
  await chmod(path, 0o600);
}

export async function reconcileCustomerSettings({
  durablePath = durableSettingsPath(),
  overlayPath = installedOverlayPath()
} = {}) {
  const durable = await readValid(durablePath);
  const overlay = await readValid(overlayPath);
  if (durable.state === "current") {
    if (overlay.state !== "current" || JSON.stringify(overlay.value) !== JSON.stringify(durable.value)) {
      await writeAtomic(overlayPath, durable.value);
    }
    return { state: "current", source: "durable", settings: durable.value, durablePath, overlayPath };
  }
  if (overlay.state === "current") {
    await writeAtomic(durablePath, overlay.value);
    return { state: "current", source: "overlay", settings: overlay.value, durablePath, overlayPath };
  }
  return {
    state: durable.state === "invalid" || overlay.state === "invalid" ? "invalid" : "missing",
    durable: durable.state,
    overlay: overlay.state,
    durablePath,
    overlayPath
  };
}

export async function saveCustomerSettings(settings, {
  durablePath = durableSettingsPath(),
  overlayPath = installedOverlayPath(),
  initializationPath = join(dirname(overlayPath), "customer-settings.initialization.json")
} = {}) {
  const normalized = normalizeCustomerSettings(settings);
  const failures = validateCustomerSettings(normalized);
  if (failures.length) throw new Error(`Invalid customer settings: ${failures.join("; ")}`);
  await writeAtomic(durablePath, normalized);
  await writeAtomic(overlayPath, normalized);
  await rm(initializationPath, { force: true });
  return reconcileCustomerSettings({ durablePath, overlayPath });
}

async function main() {
  const command = process.argv[2];
  if (command === "reconcile" || command === "read") {
    const result = await reconcileCustomerSettings();
    console.log(JSON.stringify(result));
    if (result.state !== "current") process.exitCode = 2;
    return;
  }
  if (command === "save") {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    console.log(JSON.stringify(await saveCustomerSettings(JSON.parse(input))));
    return;
  }
  throw new Error("Use reconcile, read, or save; save accepts confirmed settings JSON on standard input");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
