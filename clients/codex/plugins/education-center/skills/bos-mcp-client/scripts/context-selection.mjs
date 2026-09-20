// Preferences express intent; only fresh BOS discovery supplies executable handles.
export function resolveContext(
  discovery,
  { request = {}, defaults = {}, applicationName } = {}
) {
  if (discovery?.contract_version !== "bos-identity-mcp/v2" || !Array.isArray(discovery.contexts)) {
    return { status: "unsupported_contract" };
  }
  const fields = ["organization_name", "installation_name", "role_label"];
  const validPreference = value => value && typeof value === "object" && !Array.isArray(value) &&
    Object.entries(value).every(([key, entry]) => fields.includes(key) && typeof entry === "string" &&
      entry.length <= 200 && !/[\r\n\u0000-\u001f\u007f]/.test(entry));
  if (!validPreference(request) || !validPreference(defaults)) return { status: "invalid_preference" };
  if (applicationName !== undefined &&
      (typeof applicationName !== "string" || !applicationName.trim() ||
       applicationName.length > 200 || /[\r\n\u0000-\u001f\u007f]/.test(applicationName))) {
    return { status: "invalid_preference" };
  }
  const explicit = fields.some(key => request[key]?.trim());
  // Any explicit context starts a fresh selection; saved role/installation cannot leak into it.
  const selected = explicit ? request : defaults;
  const contexts = discovery.contexts;
  const contextKeys = [
    "context_handle",
    "organization_name",
    "application_name",
    "installation_name",
    "role_label",
    "is_default"
  ];
  const validLabel = value => typeof value === "string" && value.trim() &&
    value.length <= 200 && !/[\r\n\u0000-\u001f\u007f]/.test(value);
  if (contexts.some(context => !context || Array.isArray(context) ||
      Object.keys(context).length !== contextKeys.length ||
      contextKeys.some(key => !Object.hasOwn(context, key)) ||
      !/^bos_ctx_v2_[a-f0-9]{64}$/u.test(context.context_handle) ||
      ["organization_name", "application_name", "installation_name", "role_label"]
        .some(key => !validLabel(context[key])) ||
      typeof context.is_default !== "boolean")) {
    return { status: "invalid_discovery" };
  }
  const normalize = value => value.trim().normalize("NFC").toLocaleLowerCase("en-US");
  const matches = contexts.filter(context =>
    (!applicationName || normalize(context.application_name) === normalize(applicationName)) &&
    fields.every(key => !selected[key]?.trim() ||
      normalize(context[key]) === normalize(selected[key]))
  );
  if (!matches.length) return { status: explicit ? "requested_context_unavailable" : "default_context_unavailable" };
  if (matches.length !== 1) {
    const defaultsForSelection = selected.role_label?.trim()
      ? []
      : matches.filter(context => context.is_default);
    if (defaultsForSelection.length === 1) {
      return { status: "ready", context: defaultsForSelection[0] };
    }
    return { status: "context_ambiguous", candidates: matches };
  }
  return { status: "ready", context: matches[0] };
}
