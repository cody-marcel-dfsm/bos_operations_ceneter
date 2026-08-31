#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const schemaVersion = "bos-client-preferences/v1";
const allowedPreferenceKeys = new Set([
  "schema_version",
  "default_organization_label",
  "updated_at"
]);

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function normalizeLabel(value, label) {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string`);
  }
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 120 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    throw new Error(`${label} must be a single-line display value of 120 characters or fewer`);
  }
  return normalized;
}

function comparisonKey(value) {
  return normalizeLabel(value, "organization label").toLocaleLowerCase("en-US");
}

function canonicalLabels(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("available_organization_labels must be a non-empty array");
  }
  const labels = values.map((value) => normalizeLabel(value, "available organization label"));
  return [...new Map(labels.map((value) => [comparisonKey(value), value])).values()];
}

function matchAvailableLabel(requested, available) {
  const key = comparisonKey(requested);
  const matches = available.filter((label) => comparisonKey(label) === key);
  if (matches.length !== 1) {
    throw new Error("default organization must match exactly one currently authorized organization label");
  }
  return matches[0];
}

function privateRoot(path) {
  if (!isAbsolute(path)) {
    throw new Error("BOS_CLIENT_PREFERENCES_DIR must be an absolute path");
  }
  return resolve(path);
}

export function resolveClientPreferencesRoot({
  platform = process.platform,
  environment = process.env,
  userHome = homedir()
} = {}) {
  if (environment.BOS_CLIENT_PREFERENCES_DIR) {
    return privateRoot(environment.BOS_CLIENT_PREFERENCES_DIR);
  }
  if (platform === "darwin") {
    return join(
      userHome,
      "Library",
      "Application Support",
      "ai.dfsm.bos",
      "client-preferences",
      "v1"
    );
  }
  if (platform === "win32") {
    const appData = environment.APPDATA || join(userHome, "AppData", "Roaming");
    return join(appData, "DFSM", "BOS", "client-preferences", "v1");
  }
  const configHome = environment.XDG_CONFIG_HOME || join(userHome, ".config");
  return join(configHome, "ai.dfsm.bos", "client-preferences", "v1");
}

function preferencesFile(options) {
  const root = options.preferencesRoot
    ? privateRoot(options.preferencesRoot)
    : resolveClientPreferencesRoot(options);
  return join(root, "preferences.json");
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function ensurePrivateDirectory(path) {
  await mkdir(path, { recursive: true, mode: 0o700 });
  await chmod(path, 0o700);
}

async function atomicWriteJson(path, value) {
  await ensurePrivateDirectory(dirname(path));
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx"
  });
  await chmod(temporary, 0o600);
  await rename(temporary, path);
}

export async function readClientPreferences(input, options = {}) {
  const available = canonicalLabels(
    requireObject(input, "input").available_organization_labels
  );
  const file = preferencesFile(options);
  const preferences = await readJson(file, null);
  if (!preferences) return { state: "missing" };
  requireObject(preferences, "client preferences");
  for (const key of Object.keys(preferences)) {
    if (!allowedPreferenceKeys.has(key)) {
      throw new Error(`client preferences contain unsupported field: ${key}`);
    }
  }
  if (preferences.schema_version !== schemaVersion) {
    throw new Error("client preferences schema is unsupported");
  }
  if (typeof preferences.updated_at !== "string" ||
      Number.isNaN(Date.parse(preferences.updated_at))) {
    throw new Error("client preferences updated_at must be an ISO instant");
  }
  const requested = normalizeLabel(
    preferences.default_organization_label,
    "default_organization_label"
  );
  try {
    return {
      state: "current",
      default_organization_label: matchAvailableLabel(requested, available)
    };
  } catch {
    return {
      state: "stale",
      reason: "default_organization_unavailable",
      default_organization_label: requested
    };
  }
}

export async function setDefaultOrganizationPreference(input, options = {}) {
  const value = requireObject(input, "input");
  const available = canonicalLabels(value.available_organization_labels);
  const organizationLabel = matchAvailableLabel(
    normalizeLabel(value.organization_label, "organization_label"),
    available
  );
  const updatedAt = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(updatedAt.valueOf())) throw new Error("now must be an ISO instant");
  const preferences = {
    schema_version: schemaVersion,
    default_organization_label: organizationLabel,
    updated_at: updatedAt.toISOString()
  };
  await atomicWriteJson(preferencesFile(options), preferences);
  return {
    state: "committed",
    default_organization_label: organizationLabel,
    updated_at: preferences.updated_at
  };
}

async function readStandardInput() {
  let body = "";
  for await (const chunk of process.stdin) body += chunk;
  if (!body.trim()) throw new Error("JSON input is required on standard input");
  return JSON.parse(body);
}

async function main() {
  const operation = process.argv[2];
  const input = await readStandardInput();
  let result;
  if (operation === "read") result = await readClientPreferences(input);
  else if (operation === "set-default-organization") {
    result = await setDefaultOrganizationPreference(input);
  } else {
    throw new Error("operation must be read or set-default-organization");
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
