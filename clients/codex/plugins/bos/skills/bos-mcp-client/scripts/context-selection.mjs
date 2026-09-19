// Preferences express intent; only fresh BOS discovery supplies executable handles.
export function resolveContext(discovery, { request = {}, defaults = {}, appCode } = {}) {
  if (discovery?.contract_version !== "bos-identity-mcp/v2" || !Array.isArray(discovery.contexts)) {
    return { status: "unsupported_contract" };
  }
  const fields = ["organization_name", "installation_name", "role_code"];
  const validPreference = value => value && typeof value === "object" && !Array.isArray(value) &&
    Object.entries(value).every(([key, entry]) => fields.includes(key) && typeof entry === "string" &&
      entry.length <= 200 && !/[\r\n\u0000-\u001f\u007f]/.test(entry));
  if (!validPreference(request) || !validPreference(defaults)) return { status: "invalid_preference" };
  const explicit = fields.some(key => request[key]?.trim());
  // Any explicit context starts a fresh selection; saved role/installation cannot leak into it.
  const selected = explicit ? request : defaults;
  const contexts = discovery.contexts;
  if (contexts.some(context => !context ||
      ["context_handle", "org_id", "app_code", "installed_app_id", "actor_role_id", "organization_name", "installation_name"]
        .some(key => typeof context[key] !== "string" || !context[key]))) {
    return { status: "invalid_discovery" };
  }
  const normalize = value => value.trim().normalize("NFC").toLocaleLowerCase("en-US");
  const matches = contexts.filter(context => (!appCode || context.app_code === appCode) &&
    fields.every(key => !selected[key]?.trim() || normalize(context[key === "role_code" ? "actor_role_id" : key]) === normalize(selected[key])));
  if (!matches.length) return { status: explicit ? "requested_context_unavailable" : "default_context_unavailable" };
  if (matches.length !== 1) return { status: "context_ambiguous", candidates: matches };
  return { status: "ready", context: matches[0] };
}
