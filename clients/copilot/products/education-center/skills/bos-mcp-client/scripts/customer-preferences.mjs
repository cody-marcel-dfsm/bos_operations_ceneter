import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';

export function preferencesPath() {
  const root = process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support')
    : process.platform === 'win32' ? process.env.APPDATA || join(homedir(), 'AppData', 'Roaming')
    : process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
  return join(root, 'BOS', 'customer-preferences.json');
}
export function legacyPreferencesPath() {
  const override = process.env.BOS_CLIENT_PREFERENCES_DIR;
  if (override && !isAbsolute(override)) throw new Error('Legacy preference root must be absolute');
  const root = override || (process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'ai.dfsm.bos', 'client-preferences', 'v1')
    : process.platform === 'win32'
      ? join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'DFSM', 'BOS', 'client-preferences', 'v1')
      : join(process.env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'ai.dfsm.bos', 'client-preferences', 'v1'));
  return join(root, 'preferences.json');
}
function normalizeDefault(value, { allowLegacyRoleCode = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.organization_name !== 'string' || !value.organization_name.trim()) return null;
  const allowed = new Set(['organization_name', 'installation_name', 'role_label']);
  if (allowLegacyRoleCode) allowed.add('role_code');
  if (Object.entries(value).some(([key, entry]) => !allowed.has(key) ||
      typeof entry !== 'string' || entry.length > 200 ||
      /[\r\n\u0000-\u001f\u007f]/.test(entry))) return null;
  if (Object.hasOwn(value, 'role_code') && Object.hasOwn(value, 'role_label')) return null;
  const normalized = { ...value };
  if (Object.hasOwn(normalized, 'role_code')) {
    normalized.role_label = normalized.role_code;
    delete normalized.role_code;
  }
  return normalized;
}
export function validDefault(value) {
  return normalizeDefault(value) !== null;
}
export async function readPreferences(path = preferencesPath(), legacyPath = path === preferencesPath() ? legacyPreferencesPath() : null) {
  try {
    const value = JSON.parse(await readFile(path, 'utf8'));
    const default_context = normalizeDefault(value.default_context, { allowLegacyRoleCode: true });
    if (value.schema_version !== 'bos.customer-preferences/v1' || !default_context ||
        Object.keys(value).some(key => !['schema_version', 'default_context'].includes(key))) {
      throw new Error('Invalid customer preferences');
    }
    return { schema_version: value.schema_version, default_context };
  } catch (error) {
    if (error.code === 'ENOENT') {
      if (!legacyPath) return null;
      let legacy;
      try { legacy = JSON.parse(await readFile(legacyPath, 'utf8')); }
      catch (legacyError) { if (legacyError.code === 'ENOENT') return null; throw legacyError; }
      const default_context = { organization_name: legacy?.default_organization_label };
      if (legacy?.schema_version !== 'bos-client-preferences/v1' || !validDefault(default_context) ||
          typeof legacy.updated_at !== 'string' || Number.isNaN(Date.parse(legacy.updated_at)) ||
          Object.keys(legacy).some(key => !['schema_version', 'default_organization_label', 'updated_at'].includes(key))) {
        throw new Error('Invalid legacy customer preferences');
      }
      return { schema_version: 'bos.customer-preferences/v1', default_context };
    }
    throw error;
  }
}
export async function savePreferences(default_context, path = preferencesPath()) {
  const normalized = normalizeDefault(default_context);
  if (!normalized) throw new Error('Invalid default context preference');
  const value = { schema_version: 'bos.customer-preferences/v1', default_context: normalized };
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
  return readPreferences(path);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === 'read') console.log(JSON.stringify(await readPreferences()));
  else if (process.argv[2] === 'save') {
    let input = '';
    for await (const chunk of process.stdin) input += chunk;
    console.log(JSON.stringify(await savePreferences(JSON.parse(input))));
  } else throw new Error('Use read or save; save accepts confirmed preference JSON on standard input');
}
