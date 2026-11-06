import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { BlockList, isIP } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export const PROFILE_SCHEMA = "bos.customer-profile/v1";

const sections = Object.freeze({
  organization: Object.freeze([
    "display_name", "brand_display_name", "website_url", "location_display_name",
    "timezone", "industry", "description"
  ]),
  user: Object.freeze([
    "display_name", "preferred_name", "email", "title", "role_label", "signature_name"
  ]),
  communication: Object.freeze(["locale", "tone"])
});
const longFields = new Set(["description", "tone"]);
const statuses = new Set(["confirmed", "server", "derived", "suggested"]);
const syncStatuses = new Set(["committed", "not_available", "pending", "failed"]);

const privateIpv4 = new BlockList();
const privateIpv6 = new BlockList();
const privateSuffixes = new Set([
  "alt", "arpa", "corp", "example", "home", "internal", "intranet", "invalid",
  "lan", "local", "localdomain", "localhost", "onion", "test"
]);
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
]) privateIpv4.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96],
  ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]
]) privateIpv6.addSubnet(address, prefix, "ipv6");

export function profilePath(baseHome = homedir()) {
  const isDefaultHome = baseHome === homedir();
  const root = process.platform === "darwin"
    ? join(baseHome, "Library", "Application Support")
    : process.platform === "win32"
      ? (isDefaultHome && process.env.APPDATA) || join(baseHome, "AppData", "Roaming")
      : (isDefaultHome && process.env.XDG_CONFIG_HOME) || join(baseHome, ".config");
  return join(root, "BOS", "plugins", "bos", "customer-profile.json");
}

function badText(value, maximum) {
  return typeof value !== "string" || value.length > maximum ||
    /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(value) ||
    (maximum <= 200 && /[\r\n]/u.test(value));
}

export function publicWebsite(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/gu, "").replace(/\.+$/gu, "").toLowerCase();
    const type = isIP(host);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password &&
      (type > 0 || host.includes(".")) &&
      !(type === 4 && privateIpv4.check(host, "ipv4")) &&
      !(type === 6 && privateIpv6.check(host, "ipv6")) &&
      ![...privateSuffixes].some(suffix => host === suffix || host.endsWith(`.${suffix}`));
  } catch {
    return false;
  }
}

function validateOrganization(label, entry, failures) {
  const at = `organizations[${JSON.stringify(label)}]`;
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    failures.push(`${at} must be an object`);
    return;
  }
  const allowed = new Set([...Object.keys(sections), "sources", "server_sync", "confirmed_at"]);
  for (const key of Object.keys(entry)) if (!allowed.has(key)) failures.push(`${at}: unknown field ${key}`);
  for (const [section, fields] of Object.entries(sections)) {
    const value = entry[section] ?? {};
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      failures.push(`${at}.${section} must be an object`);
      continue;
    }
    for (const [field, text] of Object.entries(value)) {
      if (!fields.includes(field)) failures.push(`${at}.${section}: unknown field ${field}`);
      else if (badText(text, longFields.has(field) ? 2000 : 200)) failures.push(`${at}.${section}.${field} must be safe text`);
    }
  }
  if (!entry.organization?.display_name?.trim()) failures.push(`${at}.organization.display_name is required`);
  const website = entry.organization?.website_url;
  if (website && !publicWebsite(website)) failures.push(`${at}.organization.website_url must be a public HTTP or HTTPS URL`);
  const timezone = entry.organization?.timezone;
  if (timezone) {
    try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); }
    catch { failures.push(`${at}.organization.timezone must be a valid IANA timezone`); }
  }
  const email = entry.user?.email;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) failures.push(`${at}.user.email must be a valid email address`);
  for (const [field, source] of Object.entries(entry.sources ?? {})) {
    if (!/^(organization|user|communication)\.[a-z_]+$/u.test(field) || !source ||
        typeof source !== "object" || !statuses.has(source.status) ||
        badText(source.source ?? "", 200) || badText(source.retrieved_at ?? "", 64) ||
        Object.keys(source).some(key => !["status", "source", "retrieved_at"].includes(key))) {
      failures.push(`${at}.sources.${field} is invalid`);
    }
  }
  const sync = entry.server_sync;
  if (sync !== undefined && (!sync || typeof sync !== "object" || !syncStatuses.has(sync.status) ||
      Object.entries(sync).some(([key, value]) => !["status", "service", "revision", "updated_at"].includes(key) || badText(value, 200)))) {
    failures.push(`${at}.server_sync is invalid`);
  }
  if (entry.confirmed_at !== undefined && badText(entry.confirmed_at, 64)) failures.push(`${at}.confirmed_at is invalid`);
}

export function validateProfile(profile) {
  const failures = [];
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return ["profile must be a JSON object"];
  if (profile.schema_version !== PROFILE_SCHEMA) failures.push(`schema_version must be ${PROFILE_SCHEMA}`);
  for (const key of Object.keys(profile)) if (!["schema_version", "organizations"].includes(key)) failures.push(`unknown field ${key}`);
  const organizations = profile.organizations;
  if (!organizations || typeof organizations !== "object" || Array.isArray(organizations)) {
    failures.push("organizations must be an object keyed by organization label");
    return failures;
  }
  for (const [label, entry] of Object.entries(organizations)) {
    if (!label.trim() || badText(label, 200)) failures.push("organization labels must be safe single-line text");
    else validateOrganization(label, entry, failures);
  }
  return failures;
}

function sameLabel(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export async function readProfile({ path = profilePath(), organization } = {}) {
  let profile;
  try {
    profile = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return { state: "missing", path };
    if (error instanceof SyntaxError) return { state: "invalid", path, failures: ["invalid JSON"] };
    throw error;
  }
  const failures = validateProfile(profile);
  if (failures.length) return { state: "invalid", path, failures };
  if (organization === undefined) return { state: "current", path, profile };
  const match = Object.entries(profile.organizations).find(([label]) => sameLabel(label, organization));
  return match
    ? { state: "current", path, organization: match[0], entry: match[1] }
    : { state: "missing", path, organization };
}

async function writeAtomic(path, value) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  await rename(temporary, path);
  await chmod(path, 0o600);
}

// Merges confirmed organizations into the saved profile. Organizations not in
// the input are preserved unchanged.
export async function saveProfile(input, { path = profilePath() } = {}) {
  const incoming = { schema_version: PROFILE_SCHEMA, organizations: {}, ...input };
  const failures = validateProfile(incoming);
  if (failures.length) throw new Error(`Invalid customer profile: ${failures.join("; ")}`);
  const current = await readProfile({ path });
  if (current.state === "invalid") throw new Error(`Saved customer profile is invalid: ${current.failures.join("; ")}`);
  const merged = { schema_version: PROFILE_SCHEMA, organizations: { ...(current.profile?.organizations ?? {}) } };
  for (const [label, entry] of Object.entries(incoming.organizations)) {
    const existing = Object.keys(merged.organizations).find(name => sameLabel(name, label));
    if (existing) delete merged.organizations[existing];
    merged.organizations[label] = entry;
  }
  await writeAtomic(path, merged);
  return readProfile({ path });
}

async function main() {
  const [command, flag, value] = process.argv.slice(2);
  if (command === "read") {
    if (flag !== undefined && (flag !== "--organization" || !value)) throw new Error("Use read [--organization LABEL]");
    const result = await readProfile({ organization: value });
    console.log(JSON.stringify(result));
    if (result.state !== "current") process.exitCode = 2;
    return;
  }
  if (command === "save") {
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    console.log(JSON.stringify(await saveProfile(JSON.parse(input))));
    return;
  }
  throw new Error("Use read [--organization LABEL] or save (confirmed profile JSON on standard input)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
