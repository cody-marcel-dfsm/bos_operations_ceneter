// Maintainer diagnostics expose exact fixed categories, never arbitrary errors or values.
const failureCodes = new Set([
  "reviewer_api_contract_failed",
  "reviewer_api_response_invalid",
  "reviewer_app_description_unvalidated",
  "reviewer_app_description_validation_missing",
  "reviewer_app_description_validation_mismatch",
  "reviewer_authority_argument",
  "reviewer_business_guard_required",
  "reviewer_camp_arguments_invalid",
  "reviewer_camp_context_not_discovered",
  "reviewer_camp_guard_not_ready",
  "reviewer_camp_operation_not_advertised",
  "reviewer_camp_operation_already_called",
  "reviewer_camp_skill_not_read",
  "reviewer_camp_tools_not_discovered",
  "reviewer_callback_invalid",
  "reviewer_callback_mismatch",
  "reviewer_consent_invalid",
  "reviewer_consent_unavailable",
  "reviewer_contact_not_observed",
  "reviewer_cookie_domain_mismatch",
  "reviewer_cookie_invalid",
  "reviewer_credential_substitution",
  "reviewer_describe_contact_invalid",
  "reviewer_describe_contact_unresolved",
  "reviewer_describe_http_failed",
  "reviewer_describe_response_invalid",
  "reviewer_describe_response_mismatch",
  "reviewer_describe_selection_invalid",
  "reviewer_discovery_not_approved",
  "reviewer_discovery_refresh_required",
  "reviewer_discovery_tool_missing",
  "reviewer_discovery_tools_missing",
  "reviewer_document_invalid",
  "reviewer_document_not_observed",
  "reviewer_document_scope_invalid",
  "reviewer_effect_not_approved",
  "reviewer_entry_failed",
  "reviewer_grant_invalid",
  "reviewer_grant_revocation_failed",
  "reviewer_identity_unverified",
  "reviewer_installed_product_ambiguous",
  "reviewer_installed_product_unresolved",
  "reviewer_mcp_business_call_forbidden",
  "reviewer_mcp_initialization_failed",
  "reviewer_mcp_protocol_unsupported",
  "reviewer_mcp_request_failed",
  "reviewer_mcp_resource_error",
  "reviewer_mcp_response_invalid",
  "reviewer_model_failed",
  "reviewer_model_timeout",
  "reviewer_model_policy_rejection",
  "reviewer_model_rate_limit",
  "reviewer_model_authentication_failure",
  "reviewer_model_output_invalid",
  "reviewer_model_request_failed",
  "reviewer_oauth_metadata_invalid",
  "reviewer_origin_mismatch",
  "reviewer_published_prerequisite_required",
  "reviewer_preference_read_failed",
  "reviewer_prior_validation_failed",
  "reviewer_reauthentication_required",
  "reviewer_registration_invalid",
  "reviewer_resource_ambiguous",
  "reviewer_resource_invalid",
  "reviewer_resource_mismatch",
  "reviewer_resource_not_observed",
  "reviewer_saved_connection_not_isolated",
  "reviewer_session_expired",
  "reviewer_static_completion_failed",
  "reviewer_static_continuation_invalid",
  "reviewer_static_continuation_missing",
  "reviewer_tool_failed",
  "reviewer_tool_unknown",
  "reviewer_url_invalid",
  "reviewer_validation_failed",
  "reviewer_validator_mode_unsupported",
]);
export function reviewerFailureCode(error, fallback = "reviewer_tool_failed") {
  for (const code of [error?.code, error?.message]) if (typeof code === "string" && failureCodes.has(code)) return code;
  return fallback === "native_execution_or_prerequisite_failed" ? fallback : "reviewer_tool_failed";
}
export function reviewerObservationFailures(observations) {
  return [...new Set(observations.filter(row => row.is_error || row.response?.valid === false).map(row => row.response?.valid === false ? "reviewer_validation_failed" : reviewerFailureCode({code: row.response?.reason})))];
}

const dynamicTools = new Set(['acceptance_guard_probe','acceptance_guard_status','acceptance_read_document',
  'acceptance_project_contract_facts','acceptance_compare_schemas','acceptance_read_installed',
  'acceptance_validate_installed','bos_get_context','bos_list_context_tools','bos_list_plugin_services','bos_list_resources',
  'bos_read_resource','bos_control_discover','bos_https_describe','bos_https_operation']);
const observedTools = new Set([...dynamicTools,'guard.status','read.installed','validate.installed',
  'project.contract.facts','compare.schemas','bos.get.context','bos.list.context.tools','bos.execute',
  'resources.list','resources.read','app.describe','plugins.list','service.describe','api.contract.get','discovery.refresh']);
const controls = new Set(['app.describe','plugins.list','service.describe','api.contract.get','discovery.refresh']);
export const reviewerDiagnosticTool = (name, dynamic = false) =>
  (dynamic ? dynamicTools : observedTools).has(name) ? name : 'unrecognized_tool';
export const reviewerDiagnosticControl = name => controls.has(name) ? name : null;
const phases = new Set(['initialize','server_inventory','thread_start','turn_start','turn_running','tool_handler','output_parse']);
const bounded = value => Number.isSafeInteger(value) && value >= 0 && value <= 86400000 ? value : 0;
export function reviewerModelDiagnostics(value = {}) {
  return {phase: phases.has(value.phase) ? value.phase : 'unrecognized_phase',
    elapsed_ms: bounded(value.elapsed_ms), phase_elapsed_ms: bounded(value.phase_elapsed_ms),
    phase_durations: Object.fromEntries([...phases].filter(key => Object.hasOwn(value.phase_durations ?? {}, key))
      .map(key => [key, bounded(value.phase_durations[key])])),
    pending_tool: value.pending_tool == null ? null : reviewerDiagnosticTool(value.pending_tool, true),
    pending_tool_elapsed_ms: bounded(value.pending_tool_elapsed_ms),
    ...(reviewerDiagnosticControl(value.pending_control_operation) ? {pending_control_operation: value.pending_control_operation} : {}),
    completed_tool_calls: bounded(value.completed_tool_calls)};
}
export function reviewerErrorDiagnostic(error) {
  const code = error?.code, causeCode = error?.cause?.code;
  const present = code !== undefined && code !== null;
  if (failureCodes.has(code)) return {error_category: 'reviewer_error', error_code_present: true, error_code: code};
  if ([-32700,-32600,-32601,-32602,-32603].includes(code)) return {error_category: 'jsonrpc_error', error_code_present: true, error_code: code};
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return {error_category: 'request_timeout_or_abort', error_code_present: present};
  if (['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','EAI_AGAIN','ENOTFOUND'].includes(causeCode ?? code)) {
    return {error_category: 'network_error', error_code_present: true, error_code: causeCode ?? code};
  }
  if (error?.name === 'SyntaxError') return {error_category: 'response_parse_error', error_code_present: present};
  return {error_category: 'unrecognized_error', error_code_present: present};
}
export function reviewerErrorMetadata(value = {}) {
  const categories = new Set(['reviewer_error','jsonrpc_error','request_timeout_or_abort','network_error','response_parse_error','unrecognized_error']);
  const code = reviewerErrorDiagnostic({code: value.error_code});
  return {error_category: categories.has(value.error_category) ? value.error_category : 'unrecognized_error',
    error_code_present: value.error_code_present === true,
    ...(Object.hasOwn(code,'error_code') ? {error_code: code.error_code} : {})};
}

// Inspect upstream error notifications only; expose a fixed category, never their text.
export function reviewerModelNotificationFailure(notification, fallback = "reviewer_model_failed") {
  const failure = notification?.error ?? notification?.params?.error ?? notification?.params?.turn?.error;
  const text = typeof failure === "string" ? failure : failure?.message ?? notification?.params?.message ?? "";
  const code = failure?.code;
  if (code === "POLICY_REJECTION" || /content was flagged|possible cybersecurity risk|policy violation|safety.*(?:blocked|rejected)/i.test(String(text))) return "reviewer_model_policy_rejection";
  if (code === "RATE_LIMIT" || /rate.limit|usage.limit|quota.exceeded|too many requests/i.test(String(text))) return "reviewer_model_rate_limit";
  if (code === "AUTHENTICATION_FAILURE" || /unauthorized|authentication.failed|invalid.*(?:access.token|credential)/i.test(String(text))) return "reviewer_model_authentication_failure";
  return fallback === "reviewer_model_request_failed" ? fallback : "reviewer_model_failed";
}
