// Maintainer diagnostics expose exact fixed categories, never arbitrary errors or values.
const failureCodes = new Set([
  "reviewer_api_contract_failed",
  "reviewer_api_response_invalid",
  "reviewer_app_description_unvalidated",
  "reviewer_authority_argument",
  "reviewer_business_guard_required",
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
  "reviewer_mcp_response_invalid",
  "reviewer_model_failed",
  "reviewer_model_policy_rejection",
  "reviewer_model_rate_limit",
  "reviewer_model_authentication_failure",
  "reviewer_model_output_invalid",
  "reviewer_model_request_failed",
  "reviewer_oauth_metadata_invalid",
  "reviewer_origin_mismatch",
  "reviewer_published_prerequisite_required",
  "reviewer_preference_read_failed",
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
