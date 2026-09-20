#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import process from "node:process";
import Ajv2020 from "ajv/dist/2020.js";

import { inspectCodexRuntime } from "./verify-codex-runtime.mjs";
import { root, stableJson } from "./lib/package-model.mjs";

const execFileAsync = promisify(execFile);

export const CONTROLLED_ATTENDEE = "cody.marcel@dfsm.ai";
export const LIVE_EVIDENCE_CONTRACT = "boc-agent-driven-journey-live-evidence/v1";
export const NATIVE_RESULT_CONTRACT = "boc-agent-driven-journey-native-result/v1";

const candidateContract = "bos-agent-journey-staging-acceptance/v1";
const nativeSchemaPath = join(root, "acceptance", "agent-driven-journey-native-result.schema.json");
const defaultBoslPath = join(root, "acceptance", "fixtures", "recent-meeting-follow-up.bosl.json");
const sha256Pattern = /^sha256:[a-f0-9]{64}$/u;
const revisionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const candidateHostPattern = /^agent-journey-acceptance---lead-director-backend-staging(?:-[a-z0-9]+-uc\.a\.run\.app|-[0-9]+\.us-central1\.run\.app)$/u;
const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const contextHandlePattern = /bos_ctx_v\d+_[a-z0-9_-]+/giu;
const privateKeyPattern = /^(?:access|refresh)?_?token$|authorization|cookie|secret|password|api_?key|credential|context_?handle|org(?:anization)?_?id|installation_?id|installed_?app_?id|role_?id|user_?id|journey_?id|execution_?id|campaign_?id|artifact_?ref|provider_?id|database_?id|sql|stack_?trace/iu;
const requiredServerChecks = new Set([
  "calendar_search_read",
  "automation_template_create_replay",
  "drive_preview_confirm_delete_reconcile",
  "journey_compile_register_execute_complete",
  "artifact_materialize_resolve_revoke"
]);

export const CHECK_REQUIREMENTS = Object.freeze({
  "AC-01": ["host_login_surface", "pending_prompt_resumed", "no_localhost_callback", "no_manual_login", "single_bos_connection"],
  "AC-02": ["single_server_authorized_scope", "no_raw_authority"],
  "AC-03": ["calendar_operations_described", "configured_calendar_source_returned", "observed_at_required", "public_errors_published"],
  "AC-04": ["source_from_describe", "limit_five", "most_recent_ended_event_selected", "opaque_read_action_returned"],
  "AC-05": ["closed_empty_input_enforced", "event_wrapper_used", "selected_event_matched", "top_level_observed_at_present", "controlled_attendee_count_one", "no_private_event_id"],
  "AC-06": ["fresh_app_describe", "bosl_resources_discovered", "opaque_descriptor_etag"],
  "AC-07": ["bosl_schema_reference_examples_agree", "exact_scope_reused", "authority_or_etag_change_invalidates"],
  "AC-07a": ["generated_packages_use_packaged_client", "shared_cache_authority_isolated", "failed_refresh_preserved", "no_sibling_source_dependency"],
  "AC-08": ["plugins_list_and_describes_agree", "readiness_separate", "semantic_operations_satisfy_task"],
  "AC-08a": ["csv_safe_encoding", "one_mib_limit", "five_active_objects_limit", "seventy_two_hour_ttl", "ten_contact_limit", "each_limit_fails_before_creation"],
  "AC-09": ["registration_operation_discovered", "raw_bosl_submitted", "compiled_true", "same_identity_replay_authoritative", "no_public_internal_ids"],
  "AC-10": ["compile_failed_422", "actionable_diagnostics", "prior_definition_unchanged", "no_start_action"],
  "AC-11": ["information_read_only", "not_started", "bodyless_start_action", "no_execution_identifier"],
  "AC-12": ["body_omitted", "content_type_omitted", "invalid_bodies_no_effect", "server_nodes_executed", "review_instruction_complete", "no_attendee_list_returned"],
  "AC-13": ["approval_payload_only", "step_completed", "bodyless_step_action", "replay_no_duplicate_approval"],
  "AC-14": ["bodyless_step_followed", "sanctioned_send_server_owned", "show_send_result_instruction", "sanitized_failures", "no_provider_execution_by_client"],
  "AC-15": ["body_omitted", "step_completed", "bodyless_step_action", "invalid_bodies_no_effect"],
  "AC-16": ["terminal_completed", "category_preserved", "sanitized_counts", "successful_send_at_least_one"],
  "AC-17": ["in_progress_202", "retry_interval_honored", "state_read_no_advance", "active_state_authoritative"],
  "AC-18": ["lost_response_replayed_exact_action", "effect_not_duplicated", "successor_only_next_action"],
  "AC-19": ["replacement_definition_current", "valid_old_action_original_execution", "invalid_old_action_no_mutation", "identity_read_reports_replacement"],
  "AC-20": ["missing_template_instruction_published", "template_recommended", "permission_obtained", "create_operation_discovered", "preserved_step_resumed"],
  "AC-21": ["refusal_no_mutation", "changed_proposal_requires_new_permission"],
  "AC-22": ["partial_failure_sanitized", "failure_caught", "proven_successes_excluded", "fresh_approval_required", "final_failure_terminal"],
  "AC-23": ["uncertain_send_nonterminal", "state_actions_only", "server_reconciles", "send_not_replayed"],
  "AC-24": ["current_user_choices_only", "no_automatic_stop", "exact_state_action_followed", "failed_code_user_stopped", "original_start_repeated", "retry_after_exact", "no_registration_retry_scheduled"],
  "AC-25": ["expired_410_during_retention", "no_resume_action", "aged_off_404", "no_client_retry"],
  "AC-26": ["host_reconnected", "same_instruction_recovered", "no_route_reconstruction", "no_user_state_management"],
  "AC-27": ["category_only_query", "public_status_complete", "unknown_category_404", "provider_unavailable_503", "duplicate_category_blocks_readiness", "no_internal_ids"],
  "AC-28": ["category_only_default_window", "explicit_window_exact", "metrics_observed_at", "invalid_window_400", "expired_window_410"],
  "AC-29": ["exact_prompt_executed", "graph_visualized", "dry_path_completed", "package_and_service_revision_recorded"],
  "AC-31": ["two_organization_shapes", "described_labels_and_fields", "described_ui_and_transitions", "no_fixed_entity_assumption"]
});

const requiredCheckIds = Object.freeze(Object.keys(CHECK_REQUIREMENTS));
const observation = (caseName, source, method, bodyShape, httpStatus, schemaValidated, assertions) =>
  Object.freeze({ case: caseName, source, method, bodyShape, httpStatus, schemaValidated, assertions });

export const OBSERVATION_REQUIREMENTS = Object.freeze({
  "AC-01": [
    observation("signed_out_login", "native_host", "HOST", "none", 0, false,
      ["host_login_surface", "no_localhost_callback", "no_manual_login", "single_bos_connection"]),
    observation("pending_prompt_resume", "native_host", "HOST", "none", 0, false,
      ["pending_prompt_resumed"])
  ],
  "AC-02": [observation("context_discovery", "discovered_contract", "POST", "closed_empty_object", 200, true,
    ["single_server_authorized_scope", "no_raw_authority"])],
  "AC-03": [observation("calendar_describe", "discovered_contract", "POST", "semantic_input", 200, true,
    ["calendar_operations_described", "configured_calendar_source_returned", "observed_at_required", "public_errors_published"])],
  "AC-04": [observation("calendar_search", "discovered_contract", "POST", "semantic_input", 200, true,
    ["source_from_describe", "limit_five", "most_recent_ended_event_selected", "opaque_read_action_returned"])],
  "AC-05": [
    observation("event_read", "returned_action", "POST", "closed_empty_object", 200, true,
      ["event_wrapper_used", "selected_event_matched", "top_level_observed_at_present", "controlled_attendee_count_one", "no_private_event_id"]),
    observation("event_read_added_property", "returned_action", "POST", "returned_schema", 422, true,
      ["closed_empty_input_enforced"])
  ],
  "AC-06": [observation("app_describe", "discovered_contract", "POST", "closed_empty_object", 200, true,
    ["fresh_app_describe", "bosl_resources_discovered", "opaque_descriptor_etag"])],
  "AC-07": [
    observation("bosl_schema", "discovered_contract", "POST", "semantic_input", 200, true,
      ["bosl_schema_reference_examples_agree"]),
    observation("bosl_reference", "discovered_contract", "POST", "semantic_input", 200, true,
      ["bosl_schema_reference_examples_agree"]),
    observation("bosl_examples", "discovered_contract", "POST", "semantic_input", 200, true,
      ["bosl_schema_reference_examples_agree"]),
    observation("exact_scope_cache_reuse", "generated_package", "PACKAGE", "none", 0, false,
      ["exact_scope_reused"]),
    observation("authority_or_etag_invalidation", "generated_package", "PACKAGE", "none", 0, false,
      ["authority_or_etag_change_invalidates"])
  ],
  "AC-07a": [observation("external_consumer_packages", "generated_package", "PACKAGE", "none", 0, false,
    ["generated_packages_use_packaged_client", "shared_cache_authority_isolated", "failed_refresh_preserved", "no_sibling_source_dependency"])],
  "AC-08": [
    observation("plugins_list", "discovered_contract", "POST", "closed_empty_object", 200, true,
      ["plugins_list_and_describes_agree", "readiness_separate"]),
    observation("calendar_service_describe", "discovered_contract", "POST", "semantic_input", 200, true,
      ["plugins_list_and_describes_agree", "semantic_operations_satisfy_task"]),
    observation("automation_service_describe", "discovered_contract", "POST", "semantic_input", 200, true,
      ["plugins_list_and_describes_agree", "semantic_operations_satisfy_task"]),
    observation("sendgrid_service_describe", "discovered_contract", "POST", "semantic_input", 200, true,
      ["plugins_list_and_describes_agree", "semantic_operations_satisfy_task"])
  ],
  "AC-08a": [
    observation("artifact_constraints", "discovered_contract", "POST", "semantic_input", 200, true,
      ["csv_safe_encoding", "one_mib_limit", "five_active_objects_limit", "seventy_two_hour_ttl", "ten_contact_limit"]),
    observation("byte_limit", "returned_action", "POST", "none", 200, true,
      ["each_limit_fails_before_creation"]),
    observation("active_object_limit", "returned_action", "POST", "none", 200, true,
      ["each_limit_fails_before_creation"]),
    observation("ttl_limit", "returned_action", "POST", "none", 200, true,
      ["each_limit_fails_before_creation"]),
    observation("contact_limit", "returned_action", "POST", "none", 200, true,
      ["each_limit_fails_before_creation"])
  ],
  "AC-09": [
    observation("registration", "discovered_contract", "POST", "raw_bosl", 200, true,
      ["registration_operation_discovered", "raw_bosl_submitted", "compiled_true", "no_public_internal_ids"]),
    observation("registration_replay", "discovered_contract", "POST", "raw_bosl", 200, true,
      ["same_identity_replay_authoritative"])
  ],
  "AC-10": [
    observation("invalid_bosl", "discovered_contract", "POST", "raw_bosl", 422, true,
      ["compile_failed_422", "actionable_diagnostics", "no_start_action"]),
    observation("prior_definition_state", "discovered_contract", "GET", "none", 200, true,
      ["prior_definition_unchanged"])
  ],
  "AC-11": [observation("execution_information", "discovered_contract", "GET", "none", 200, true,
    ["information_read_only", "not_started", "bodyless_start_action", "no_execution_identifier"])],
  "AC-12": [
    observation("start", "returned_action", "POST", "none", 200, true,
      ["body_omitted", "content_type_omitted", "server_nodes_executed", "review_instruction_complete", "no_attendee_list_returned"]),
    observation("start_empty_object", "returned_action", "POST", "closed_empty_object", 422, true,
      ["invalid_bodies_no_effect"]),
    observation("start_json_null", "returned_action", "POST", "json_null", 422, true,
      ["invalid_bodies_no_effect"]),
    observation("start_arbitrary_body", "returned_action", "POST", "returned_schema", 422, true,
      ["invalid_bodies_no_effect"])
  ],
  "AC-13": [
    observation("review_complete", "returned_action", "POST", "returned_schema", 200, true,
      ["approval_payload_only", "step_completed", "bodyless_step_action"]),
    observation("review_complete_replay", "returned_action", "POST", "returned_schema", 200, true,
      ["replay_no_duplicate_approval"])
  ],
  "AC-14": [observation("send_step", "returned_action", "POST", "none", 200, true,
    ["bodyless_step_followed", "sanctioned_send_server_owned", "show_send_result_instruction", "sanitized_failures", "no_provider_execution_by_client"])],
  "AC-15": [
    observation("result_complete", "returned_action", "POST", "none", 200, true,
      ["body_omitted", "step_completed", "bodyless_step_action"]),
    observation("result_complete_empty_object", "returned_action", "POST", "closed_empty_object", 422, true,
      ["invalid_bodies_no_effect"]),
    observation("result_complete_json_null", "returned_action", "POST", "json_null", 422, true,
      ["invalid_bodies_no_effect"]),
    observation("result_complete_arbitrary_body", "returned_action", "POST", "returned_schema", 422, true,
      ["invalid_bodies_no_effect"])
  ],
  "AC-16": [observation("final_step", "returned_action", "POST", "none", 200, true,
    ["terminal_completed", "category_preserved", "sanitized_counts", "successful_send_at_least_one"])],
  "AC-17": [
    observation("start_in_progress", "returned_action", "POST", "none", 202, true,
      ["in_progress_202", "retry_interval_honored"]),
    observation("start_state_read", "returned_action", "GET", "none", 200, true,
      ["state_read_no_advance", "active_state_authoritative"]),
    observation("step_in_progress", "returned_action", "POST", "none", 202, true,
      ["in_progress_202", "retry_interval_honored"]),
    observation("step_state_read", "returned_action", "GET", "none", 200, true,
      ["state_read_no_advance", "active_state_authoritative"])
  ],
  "AC-18": [
    observation("start_initial", "returned_action", "POST", "none", 200, true, ["lost_response_replayed_exact_action"]),
    observation("start_replay", "returned_action", "POST", "none", 200, true, ["effect_not_duplicated", "successor_only_next_action"]),
    observation("complete_initial", "returned_action", "POST", "returned_schema", 200, true, ["lost_response_replayed_exact_action"]),
    observation("complete_replay", "returned_action", "POST", "returned_schema", 200, true, ["effect_not_duplicated", "successor_only_next_action"]),
    observation("failed_initial", "returned_action", "POST", "returned_schema", 200, true, ["lost_response_replayed_exact_action"]),
    observation("failed_replay", "returned_action", "POST", "returned_schema", 200, true, ["effect_not_duplicated", "successor_only_next_action"]),
    observation("step_initial", "returned_action", "POST", "none", 200, true, ["lost_response_replayed_exact_action"]),
    observation("step_replay", "returned_action", "POST", "none", 200, true, ["effect_not_duplicated", "successor_only_next_action"])
  ],
  "AC-19": [
    observation("replacement_registration", "discovered_contract", "POST", "raw_bosl", 200, true, ["replacement_definition_current"]),
    observation("valid_old_action", "returned_action", "POST", "returned_schema", 200, true, ["valid_old_action_original_execution"]),
    observation("invalid_old_action", "returned_action", "POST", "returned_schema", 200, true, ["invalid_old_action_no_mutation"]),
    observation("replacement_identity_read", "discovered_contract", "GET", "none", 200, true, ["identity_read_reports_replacement"])
  ],
  "AC-20": [
    observation("missing_template_instruction", "returned_action", "POST", "none", 200, true, ["missing_template_instruction_published"]),
    observation("template_recommendation_permission", "native_host", "HOST", "none", 0, false, ["template_recommended", "permission_obtained"]),
    observation("template_create", "discovered_contract", "POST", "semantic_input", 200, true, ["create_operation_discovered"]),
    observation("preserved_step_resume", "returned_action", "POST", "none", 200, true, ["preserved_step_resumed"])
  ],
  "AC-21": [
    observation("template_refusal", "native_host", "HOST", "none", 0, false, ["refusal_no_mutation"]),
    observation("template_change", "native_host", "HOST", "none", 0, false, ["changed_proposal_requires_new_permission"])
  ],
  "AC-22": [
    observation("partial_send_failure", "returned_action", "POST", "none", 200, true, ["partial_failure_sanitized", "failure_caught"]),
    observation("recovery_rematerialize", "returned_action", "POST", "none", 200, true, ["proven_successes_excluded"]),
    observation("recovery_approval", "returned_action", "POST", "returned_schema", 200, true, ["fresh_approval_required"]),
    observation("final_send_failure", "returned_action", "POST", "none", 200, true, ["final_failure_terminal"])
  ],
  "AC-23": [
    observation("uncertain_send", "returned_action", "POST", "none", 202, true, ["uncertain_send_nonterminal", "send_not_replayed"]),
    observation("uncertain_state", "returned_action", "GET", "none", 200, true, ["state_actions_only", "server_reconciles"]),
    observation("reconciled_state", "returned_action", "GET", "none", 200, true, ["server_reconciles", "send_not_replayed"])
  ],
  "AC-24": [
    observation("creation_rate_limit", "discovered_contract", "POST", "raw_bosl", 429, true, ["retry_after_exact", "no_registration_retry_scheduled"]),
    observation("active_capacity_start", "returned_action", "POST", "none", 409, true, ["current_user_choices_only", "no_automatic_stop"]),
    observation("stoppable_choice_state", "returned_action", "GET", "none", 200, true, ["current_user_choices_only", "exact_state_action_followed"]),
    observation("user_selected_stop", "returned_action", "POST", "returned_schema", 200, true, ["failed_code_user_stopped"]),
    observation("start_after_stop", "returned_action", "POST", "none", 200, true, ["original_start_repeated"])
  ],
  "AC-25": [
    observation("expired_during_retention", "returned_action", "GET", "none", 410, true, ["expired_410_during_retention", "no_resume_action", "no_client_retry"]),
    observation("aged_off", "returned_action", "GET", "none", 404, true, ["aged_off_404", "no_client_retry"])
  ],
  "AC-26": [
    observation("host_reconnect", "native_host", "HOST", "none", 0, false, ["host_reconnected", "no_user_state_management"]),
    observation("recovered_information", "discovered_contract", "GET", "none", 200, true, ["same_instruction_recovered", "no_route_reconstruction"])
  ],
  "AC-27": [
    observation("campaign_status", "discovered_contract", "POST", "semantic_input", 200, true, ["category_only_query", "public_status_complete", "no_internal_ids"]),
    observation("campaign_unknown", "discovered_contract", "POST", "semantic_input", 404, true, ["unknown_category_404"]),
    observation("campaign_provider_unavailable", "discovered_contract", "POST", "semantic_input", 503, true, ["provider_unavailable_503"]),
    observation("duplicate_category_readiness", "discovered_contract", "POST", "semantic_input", 200, true, ["duplicate_category_blocks_readiness"])
  ],
  "AC-28": [
    observation("metrics_default_window", "discovered_contract", "POST", "semantic_input", 200, true, ["category_only_default_window", "metrics_observed_at"]),
    observation("metrics_explicit_window", "discovered_contract", "POST", "semantic_input", 200, true, ["explicit_window_exact", "metrics_observed_at"]),
    observation("metrics_invalid_window", "discovered_contract", "POST", "semantic_input", 400, true, ["invalid_window_400"]),
    observation("metrics_expired_window", "discovered_contract", "POST", "semantic_input", 410, true, ["expired_window_410"])
  ],
  "AC-29": [observation("published_native_dry_run", "native_host", "HOST", "none", 0, false,
    ["exact_prompt_executed", "graph_visualized", "dry_path_completed", "package_and_service_revision_recorded"])],
  "AC-31": [
    observation("organization_one_shape", "discovered_contract", "POST", "semantic_input", 200, true,
      ["two_organization_shapes", "described_labels_and_fields", "described_ui_and_transitions"]),
    observation("organization_two_shape", "discovered_contract", "POST", "semantic_input", 200, true,
      ["two_organization_shapes", "described_labels_and_fields", "described_ui_and_transitions"]),
    observation("generated_package_entity_assumptions", "generated_package", "PACKAGE", "none", 0, false,
      ["no_fixed_entity_assumption"])
  ]
});

export const NATIVE_ENV_ALLOWLIST = Object.freeze(new Set([
  "CODEX_HOME", "HOME", "PATH", "SHELL", "USER", "LOGNAME",
  "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE",
  "TERM", "TERM_PROGRAM", "NO_COLOR", "COLORTERM",
  "SSL_CERT_FILE", "SSL_CERT_DIR", "NODE_EXTRA_CA_CERTS"
]));

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredString(value, label) {
  assert(typeof value === "string" && value.trim(), `${label} is required`);
  return value.trim();
}

function exactObject(value, keys, label) {
  assert(isObject(value), `${label} must be an object`);
  const observed = Object.keys(value).sort();
  const expected = [...keys].sort();
  assert(JSON.stringify(observed) === JSON.stringify(expected), `${label} does not match its closed contract`);
  return value;
}

function normalizeKey(value) {
  return String(value)
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[^A-Za-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .toLowerCase();
}

export function sanitizeEvidence(value) {
  if (Array.isArray(value)) return value.slice(0, 100).map(sanitizeEvidence);
  if (isObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      privateKeyPattern.test(normalizeKey(key))
        ? (item === undefined || item === null ? item : "[REDACTED]")
        : sanitizeEvidence(item)
    ]));
  }
  if (typeof value === "string") {
    const redacted = value
      .replace(emailPattern, "[REDACTED]")
      .replace(contextHandlePattern, "[REDACTED]");
    return redacted.length > 1000 ? `${redacted.slice(0, 1000)}…` : redacted;
  }
  return value;
}

function assertNoPrivateEvidence(value, path = "native result") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateEvidence(item, `${path}[${index}]`));
    return;
  }
  if (!isObject(value)) {
    if (typeof value === "string") {
      assert(!emailPattern.test(value), `${path} exposes an email address`);
      emailPattern.lastIndex = 0;
      assert(!contextHandlePattern.test(value), `${path} exposes an opaque context handle`);
      contextHandlePattern.lastIndex = 0;
    }
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    assert(!privateKeyPattern.test(normalizeKey(key)), `${path}.${key} exposes a private field`);
    assertNoPrivateEvidence(item, `${path}.${key}`);
  }
}

export function validateCandidateBaseUrl(value) {
  const parsed = new URL(requiredString(value, "candidate_base_url"));
  assert(parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port &&
    parsed.pathname === "/" && !parsed.search && !parsed.hash &&
    candidateHostPattern.test(parsed.hostname),
  "candidate acceptance must identify the isolated Agent Journey candidate origin");
  return parsed.origin;
}

export function validateReleaseTuple({ sourceRevision, serverRevision, imageDigest, packageVersions }) {
  assert(/^[a-f0-9]{40}$/u.test(sourceRevision), "--source-revision must be a full Git SHA");
  assert(revisionPattern.test(serverRevision), "--server-revision is invalid");
  assert(sha256Pattern.test(imageDigest), "--image-digest must be sha256:<64 hex>");
  assert(isObject(packageVersions) && Object.keys(packageVersions).length > 0,
    "--package-versions-json must be a non-empty object");
  for (const [name, version] of Object.entries(packageVersions)) {
    assert(/^[a-z][a-z0-9_-]*$/u.test(name) && /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/u.test(version),
      "package version tuple is invalid");
  }
  return { sourceRevision, serverRevision, imageDigest, packageVersions };
}

export function validateCandidateAcceptance(document, tuple) {
  exactObject(document, new Set([
    "contract", "source_revision", "server_revision", "image_digest",
    "candidate_base_url", "provider_mode", "live_send", "checks"
  ]), "candidate acceptance");
  assert(document.contract === candidateContract, "candidate acceptance contract is unsupported");
  assert(document.source_revision === tuple.sourceRevision &&
    document.server_revision === tuple.serverRevision &&
    document.image_digest === tuple.imageDigest,
  "candidate acceptance does not match the release tuple");
  validateCandidateBaseUrl(document.candidate_base_url);
  assert(document.provider_mode === "fake" && document.live_send === false,
    "candidate acceptance does not prove fake-provider execution");
  assert(isObject(document.checks) &&
    Object.keys(document.checks).length === requiredServerChecks.size &&
    Object.keys(document.checks).every((name) => requiredServerChecks.has(name)) &&
    Object.values(document.checks).every((value) => value === true),
  "candidate acceptance has an incomplete server check set");
  return document;
}

function schemaValidator(schema) {
  const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
  const validate = ajv.compile(schema);
  return (value) => {
    if (!validate(value)) {
      const detail = (validate.errors ?? [])
        .map((error) => `${error.instancePath || "$"} ${error.message}`)
        .join("; ");
      throw new Error(`native acceptance result failed its schema: ${detail}`);
    }
  };
}

export function validateNativeAcceptance(document, schema) {
  schemaValidator(schema)(document);
  assert(document.contract === NATIVE_RESULT_CONTRACT, "native result contract is unsupported");
  assert(document.status === "APPROVED", `native acceptance returned ${document.status}: ${document.message}`);
  assert(document.provider_mode === "fake" && document.live_send === false,
    "native acceptance did not preserve fake/no-send mode");
  assert(document.controlled_attendee_count === 1, "native acceptance did not use one controlled attendee");
  assert(document.release_matched === true, "native acceptance did not prove the deployed release tuple");
  for (const [name, expected] of Object.entries({
    host_managed: true,
    protocol_initialized: true,
    bos_connection_reused: true,
    second_connection_created: false,
    manual_auth_instruction: false,
    localhost_callback: false
  })) {
    assert(document.connection[name] === expected, `native connection invariant failed: ${name}`);
  }
  const observedIds = document.checks.map(({ id }) => id);
  assert(observedIds.length === requiredCheckIds.length && new Set(observedIds).size === requiredCheckIds.length,
    "native acceptance check IDs are duplicated or incomplete");
  assert(requiredCheckIds.every((id) => observedIds.includes(id)),
    "native acceptance omitted a mandatory BOC-JRN-017 check");
  for (const check of document.checks) {
    assert(check.status === "passed", `${check.id} did not pass`);
    const requirements = OBSERVATION_REQUIREMENTS[check.id];
    assert(check.observations.length === requirements.length,
      `${check.id} has an incomplete observation set`);
    const cases = check.observations.map((item) => item.case);
    assert(new Set(cases).size === cases.length && requirements.every((item) => cases.includes(item.case)),
      `${check.id} observation cases are duplicated or incomplete`);
    for (const requirement of requirements) {
      const observed = check.observations.find((item) => item.case === requirement.case);
      for (const [key, expected] of Object.entries({
        source: requirement.source,
        method: requirement.method,
        body_shape: requirement.bodyShape
      })) {
        assert(observed.request[key] === expected,
          `${check.id}/${requirement.case} has incorrect ${key}`);
      }
      assert(observed.response.http_status === requirement.httpStatus,
        `${check.id}/${requirement.case} has incorrect HTTP status`);
      assert(observed.response.schema_validated === requirement.schemaValidated,
        `${check.id}/${requirement.case} has incorrect schema-validation result`);
      assert(requirement.assertions.every((item) => observed.assertions.includes(item)),
        `${check.id}/${requirement.case} omitted a required assertion`);
    }
    const allAssertions = new Set(check.observations.flatMap((item) => item.assertions));
    assert(CHECK_REQUIREMENTS[check.id].every((item) => allAssertions.has(item)),
      `${check.id} omitted a matrix assertion`);
  }
  assertNoPrivateEvidence(document);
  return document;
}

export function buildNativeEnvironment(environment = process.env) {
  return Object.fromEntries(Object.entries(environment).filter(([name, value]) =>
    NATIVE_ENV_ALLOWLIST.has(name) && typeof value === "string"
  ));
}

function acceptanceCatalog() {
  return Object.entries(OBSERVATION_REQUIREMENTS)
    .map(([id, observations]) => `${id}: ${observations.map((item) =>
      `${item.case}[source=${item.source};method=${item.method};body=${item.bodyShape};status=${item.httpStatus};schema=${item.schemaValidated};assertions=${item.assertions.join("|")}]`
    ).join(", ")}`)
    .join("\n");
}

export function buildNativePrompt(tuple, boslDocument, candidateAcceptance) {
  const identity = requiredString(boslDocument.identity, "BOSL identity");
  const category = requiredString(boslDocument.inputs?.campaign_category, "BOSL campaign category");
  return `Run the BOC-JRN-017 deployed-candidate acceptance through the installed BOS product's existing host-managed authenticated connection. The host owns OAuth, MCP initialization, the selected organization/application/user authority, and HTTPS transport. Reuse that connection. Never request, infer, print, store, or pass a credential, raw authority value, context handle, organization identifier, installation identifier, role identifier, user identifier, provider identifier, internal journey identifier, or internal execution identifier. Do not create a second connection and do not issue raw HTTP yourself.

Use the exact prompt: "Use the attendees from the meeting that just ended to prepare and send a follow-up."
Use the current authorized Lead Director scope, task-scoped Describe, its complete published operation contracts, and only returned actions. Resolve Calendar routing from discovery. Calendar search is bounded to five. For the selected event read response, read the event from response.event and observed_at from the top-level response, verify it matches the selected title and time, and verify exactly one attendee equal to ${CONTROLLED_ATTENDEE}. Never reproduce the address in the result; report only controlled_attendee_count=1.

Read the discovered BOSL schema, reference, and examples. Submit the complete raw BOSL document using its customer identity ${JSON.stringify(identity)} and category ${JSON.stringify(category)} to the registration operation returned by Describe. Never derive a registration URL. Follow every lifecycle URL and payload schema exactly as returned. The server owns journey state and all server-executable journey nodes. Exercise only deterministic fake/sandbox providers. Perform no real send. Do not stop at a fixture or local assertion: each deployed row must have an actual deployed response and its published schema validation.

The candidate preflight evidence is bound to source ${tuple.sourceRevision}, service revision ${tuple.serverRevision}, image ${tuple.imageDigest}, provider_mode=fake, live_send=false, and candidate ${candidateAcceptance.candidate_base_url}. Confirm the connected deployed service matches that tuple. Generated-package rows must inspect the current generated BOS packages. Native rows must exercise the supported host behavior. AC-30 is intentionally excluded because a real send requires separate immediate owner authorization.

Return one closed JSON object matching the supplied schema. Include every required check exactly once and every listed subcase as a separate observation. Record its exact request source, method, body shape, actual HTTP status, short contract-relevant response summary, schema-validation result, and assertion tokens. For native/package observations use HTTP status 0. Do not combine separate calls or status results into one observation. Do not put an endpoint URL, attendee, source record, category value, identity value, opaque action, authority value, or provider payload in the result. Return APPROVED only after every observation passes. Return HOST_ACTION_REQUIRED only when the native host itself must present BOS sign-in/reconnect. Return REJECTED for any other failure.

Required checks and assertion tokens:
${acceptanceCatalog()}`;
}

async function defaultRunCommand(args, { environment }) {
  const { stdout } = await execFileAsync("codex", args, {
    cwd: root,
    env: environment,
    maxBuffer: 32 * 1024 * 1024
  });
  return stdout;
}

function validateBoslFixture(document) {
  assert(isObject(document), "--bosl-file must contain an object");
  assert(Array.isArray(document.inputs?.attendees) && document.inputs.attendees.length === 1,
    "BOSL fixture must contain exactly one attendee");
  assert(document.inputs.attendees[0]?.email === CONTROLLED_ATTENDEE,
    "BOSL fixture does not contain the controlled attendee");
  const sendNodes = (document.nodes ?? []).filter((node) => node?.operation === "sendgrid-email.campaign.send");
  assert(sendNodes.length === 1 && sendNodes[0].type === "server",
    "BOSL fixture must contain one server-owned sanctioned send node");
  return document;
}

function packageVersionsFromRuntime(runtime) {
  return Object.fromEntries(Object.entries(runtime.installed_products ?? {})
    .map(([name, product]) => [name.replaceAll("-", "_"), product.version])
    .filter(([, version]) => typeof version === "string"));
}

export async function runLiveAcceptance({
  sourceRevision,
  serverRevision,
  imageDigest,
  packageVersions,
  candidateAcceptance,
  boslDocument,
  runCommand = defaultRunCommand,
  verifyRuntime = inspectCodexRuntime,
  environment = process.env,
  now = () => new Date()
}) {
  const tuple = validateReleaseTuple({ sourceRevision, serverRevision, imageDigest, packageVersions });
  validateCandidateAcceptance(candidateAcceptance, tuple);
  validateBoslFixture(boslDocument);
  const runtime = await verifyRuntime();
  assert(runtime?.ok === true, `installed BOS runtime is incomplete: ${(runtime?.failures ?? []).join("; ")}`);
  const installedVersions = packageVersionsFromRuntime(runtime);
  for (const [name, version] of Object.entries(packageVersions)) {
    assert(installedVersions[name] === version,
      `installed ${name} package version ${installedVersions[name] ?? "missing"} does not match ${version}`);
  }
  const schema = JSON.parse(await readFile(nativeSchemaPath, "utf8"));
  const temporary = await mkdtemp(join(tmpdir(), "boc-agent-journey-live-"));
  const responseFile = join(temporary, "native-result.json");
  const prompt = buildNativePrompt(tuple, boslDocument, candidateAcceptance);
  try {
    await runCommand([
      "exec", "--ephemeral", "--json", "--sandbox", "read-only", "--cd", root,
      "--output-schema", nativeSchemaPath,
      "--output-last-message", responseFile,
      prompt
    ], { environment: buildNativeEnvironment(environment) });
    const nativeResult = JSON.parse(await readFile(responseFile, "utf8"));
    validateNativeAcceptance(nativeResult, schema);
    return {
      contract: LIVE_EVIDENCE_CONTRACT,
      passed: true,
      observed_at: now().toISOString(),
      source_revision: sourceRevision,
      server_revision: serverRevision,
      image_digest: imageDigest,
      package_versions: packageVersions,
      provider_mode: "fake",
      live_send: false,
      controlled_attendee_count: 1,
      candidate_acceptance_sha256: `sha256:${createHash("sha256").update(stableJson(candidateAcceptance)).digest("hex")}`,
      bosl_sha256: `sha256:${createHash("sha256").update(stableJson(boslDocument)).digest("hex")}`,
      native_result: sanitizeEvidence(nativeResult)
    };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export function parseArguments(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (name === "--help") return { help: true };
    assert(name.startsWith("--"), `unknown argument ${name}`);
    const value = args[++index];
    assert(value !== undefined && !value.startsWith("--"), `${name} requires a value`);
    const key = name.slice(2).replaceAll("-", "_");
    assert(!Object.hasOwn(values, key), `${name} was repeated`);
    values[key] = value;
  }
  const allowed = new Set([
    "evidence_out", "source_revision", "server_revision", "image_digest",
    "package_versions_json", "bosl_file", "candidate_acceptance", "provider_mode"
  ]);
  for (const key of Object.keys(values)) {
    assert(allowed.has(key), `unknown argument --${key.replaceAll("_", "-")}`);
  }
  return values;
}

function usage() {
  return [
    "Usage: npm run acceptance:agent-journey-live -- \\",
    "  --candidate-acceptance <BOS deployed-candidate evidence JSON> \\",
    "  --bosl-file <canonical BOSL JSON> --evidence-out <new JSON file> \\",
    "  --source-revision <40-hex SHA> --server-revision <revision> \\",
    "  --image-digest <sha256:digest> --package-versions-json <JSON> \\",
    "  --provider-mode fake"
  ].join("\n");
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) {
    console.log(usage());
    return;
  }
  for (const name of ["evidence_out", "source_revision", "server_revision", "image_digest",
    "package_versions_json", "candidate_acceptance", "provider_mode"]) {
    requiredString(options[name], `--${name.replaceAll("_", "-")}`);
  }
  assert(options.provider_mode === "fake",
    "automated acceptance requires --provider-mode fake; a real send is a separately owner-gated acceptance");
  const candidateAcceptance = JSON.parse(await readFile(resolve(options.candidate_acceptance), "utf8"));
  const boslDocument = JSON.parse(await readFile(resolve(options.bosl_file ?? defaultBoslPath), "utf8"));
  const evidence = await runLiveAcceptance({
    sourceRevision: options.source_revision,
    serverRevision: options.server_revision,
    imageDigest: options.image_digest,
    packageVersions: JSON.parse(options.package_versions_json),
    candidateAcceptance,
    boslDocument
  });
  const evidencePath = resolve(options.evidence_out);
  await writeFile(evidencePath, stableJson(evidence), { encoding: "utf8", flag: "wx", mode: 0o600 });
  console.log(JSON.stringify({
    contract: evidence.contract,
    passed: true,
    evidence: evidencePath,
    check_count: evidence.native_result.checks.length,
    source_revision: evidence.source_revision,
    server_revision: evidence.server_revision,
    image_digest: evidence.image_digest,
    package_versions: evidence.package_versions
  }));
}

const invoked = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invoked) {
  main().catch((error) => {
    console.error(JSON.stringify({
      contract: LIVE_EVIDENCE_CONTRACT,
      passed: false,
      error: sanitizeEvidence(error instanceof Error ? error.message : String(error))
    }));
    process.exitCode = 1;
  });
}
