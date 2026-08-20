#!/usr/bin/env python3
"""Validate a privacy-safe Education Center SendGrid client workflow trace."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


SCHEMA = "education-center-sendgrid-campaign-trace/v1"
REFRESH_TRIGGERS = {
    "initial_connection",
    "oauth_reconnection",
    "permission_change",
    "plugin_update",
    "capability_refresh",
    "session_replacement",
}
PRESERVED_FIELDS = {
    "active_user_request",
    "campaign_draft",
    "audience_identity",
    "approval_state",
    "idempotency_keys",
}
PREVIEW_FIELDS = {
    "subject_utf8",
    "html_utf8",
    "plain_text_utf8",
    "sender",
    "reply_to",
    "campaign_dates",
    "contact_information",
    "category",
    "unsubscribe_configuration",
    "tracking_configuration",
    "physical_address",
}
METRICS = {
    "requested",
    "suppressed",
    "prepared",
    "accepted",
    "rejected",
    "delivered",
    "bounced",
    "unique_human_opens",
    "unique_human_clicks",
    "unsubscribes",
    "complaints",
    "conversions",
}
FORBIDDEN_AUTHORITY_KEYS = {
    "access_token",
    "refresh_token",
    "authorization_header",
    "api_key",
    "provider_credential",
    "org_id",
    "organization_id",
    "app_code",
    "application_id",
    "installed_app_id",
    "installation_id",
    "delegated_role_id",
}
EMAIL_PATTERN = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.I)


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def walk_keys(value: Any) -> set[str]:
    keys: set[str] = set()
    if isinstance(value, dict):
        for key, child in value.items():
            keys.add(str(key))
            keys.update(walk_keys(child))
    elif isinstance(value, list):
        for child in value:
            keys.update(walk_keys(child))
    return keys


def validate(trace: dict[str, Any]) -> list[str]:
    errors: list[str] = []

    def require(condition: bool, message: str) -> None:
        if not condition:
            errors.append(message)

    require(trace.get("schema_version") == SCHEMA, "invalid schema_version")
    require(trace.get("connection") == "education-center", "connection must be education-center")
    require(trace.get("context_verified") is True, "authenticated BOS context was not verified")
    require(trace.get("same_task_continuation_supported") is True, "same-task continuation is not supported")

    forbidden = sorted(walk_keys(trace) & FORBIDDEN_AUTHORITY_KEYS)
    require(not forbidden, f"trace contains forbidden authority keys: {', '.join(forbidden)}")
    serialized = json.dumps(trace, ensure_ascii=False)
    require(EMAIL_PATTERN.search(serialized) is None, "trace contains a raw email address")

    policy = set(as_list(trace.get("manifest_refresh_policy")))
    missing_triggers = sorted(REFRESH_TRIGGERS - policy)
    require(not missing_triggers, f"manifest refresh policy missing: {', '.join(missing_triggers)}")
    refreshes = as_list(trace.get("manifest_refreshes"))
    require(bool(refreshes), "manifest_refreshes must contain at least one refresh")
    for index, refresh in enumerate(refreshes):
        item = as_dict(refresh)
        require(bool(item.get("manifest_fingerprint")), f"refresh {index} missing manifest fingerprint")
        preserved = set(as_list(item.get("preserved_fields")))
        missing = sorted(PRESERVED_FIELDS - preserved)
        require(not missing, f"refresh {index} did not preserve: {', '.join(missing)}")
        require(item.get("context_revalidated") is True, f"refresh {index} did not revalidate context")

    session = as_dict(trace.get("session"))
    for field in ("request_hash", "draft_id", "audience_id", "campaign_id"):
        require(bool(session.get(field)), f"session missing {field}")
    keys = as_dict(session.get("idempotency_keys"))
    require(bool(keys.get("test_send")), "missing test_send idempotency key")
    require(bool(keys.get("list_send")), "missing list_send idempotency key")
    require(keys.get("test_send") != keys.get("list_send"), "test and list idempotency keys must differ")

    audience = as_dict(trace.get("audience"))
    for field in ("matched", "unique", "eligible", "excluded", "suppressed"):
        require(isinstance(audience.get(field), int) and audience[field] >= 0, f"audience {field} must be a nonnegative integer")
    if all(isinstance(audience.get(field), int) for field in ("matched", "unique", "eligible")):
        require(audience["matched"] >= audience["unique"] >= audience["eligible"], "audience counts are inconsistent")
    expected_eligible = trace.get("expected_eligible")
    if expected_eligible is not None:
        require(audience.get("eligible") == expected_eligible, "eligible audience does not match expected_eligible")
    require(bool(as_dict(audience.get("counts_by_source"))), "missing audience counts by source")
    require(bool(as_dict(audience.get("counts_by_cohort"))), "missing audience counts by cohort")
    require(bool(as_dict(audience.get("suppression_counts"))), "missing suppression counts")
    require(audience.get("provenance_preserved") is True, "audience provenance was not preserved")
    require(audience.get("overlapping_tags_preserved") is True, "overlapping cohort tags were not preserved")

    expected_names = set(as_list(trace.get("expected_named_recipients")))
    named = {
        str(as_dict(item).get("display_name")): as_dict(item)
        for item in as_list(audience.get("named_recipients"))
    }
    for name in sorted(expected_names):
        record = named.get(name, {})
        require(record.get("included") is True, f"named recipient {name} is not included")
        require(record.get("governed_update") is True, f"named recipient {name} bypassed governed update")

    preview = as_dict(trace.get("content_preview"))
    displayed = set(as_list(preview.get("displayed_fields")))
    missing_preview = sorted(PREVIEW_FIELDS - displayed)
    require(not missing_preview, f"content preview missing: {', '.join(missing_preview)}")
    require(preview.get("exact_utf8_displayed") is True, "exact UTF-8 content was not displayed")
    for field in ("content_hash", "audience_version", "category"):
        require(bool(preview.get(field)), f"content preview missing {field}")

    approval = as_dict(trace.get("approval"))
    require(approval.get("explicit") is True, "explicit approval is missing")
    require(approval.get("send_action") == "list_send", "approval is not bound to list_send")
    require(approval.get("content_hash") == preview.get("content_hash"), "approval content hash is stale")
    require(approval.get("audience_version") == preview.get("audience_version"), "approval audience version is stale")

    operations = [as_dict(item) for item in as_list(trace.get("operations"))]
    tests = [item for item in operations if item.get("mode") == "test"]
    live = [item for item in operations if item.get("mode") == "live"]
    require(len(tests) == 1, "workflow must contain exactly one test send")
    require(len(live) == 1, "workflow must contain exactly one live send")
    if len(tests) == 1 and len(live) == 1:
        require(tests[0].get("sequence", 0) < live[0].get("sequence", 0), "test send must precede live send")
        require(tests[0].get("idempotency_key") == keys.get("test_send"), "test idempotency key changed")
        require(live[0].get("idempotency_key") == keys.get("list_send"), "live idempotency key changed")
        require(tests[0].get("reconciled") is True, "test send was not reconciled")
        require(live[0].get("reconciled") is True, "live send was not reconciled")
        require(live[0].get("audience_count") == audience.get("eligible"), "live send audience count changed")
        for label, operation in (("test", tests[0]), ("live", live[0])):
            if operation.get("http_status") == 202:
                require(operation.get("outcome") == "accepted", f"{label} HTTP 202 must be accepted")

    statistics = as_dict(trace.get("statistics"))
    for mode in ("test", "live"):
        result = as_dict(statistics.get(mode))
        missing_metrics = sorted(METRICS - set(result))
        require(not missing_metrics, f"{mode} statistics missing: {', '.join(missing_metrics)}")
        require(bool(result.get("category")), f"{mode} statistics missing category")
        require(bool(result.get("reporting_cutoff")), f"{mode} statistics missing reporting cutoff")
        for metric in METRICS:
            require(isinstance(result.get(metric), int) and result[metric] >= 0, f"{mode} {metric} must be a nonnegative integer")
        if all(isinstance(result.get(metric), int) for metric in ("requested", "suppressed", "prepared")):
            require(result["prepared"] + result["suppressed"] <= result["requested"], f"{mode} requested/suppressed/prepared counts are inconsistent")
        if all(isinstance(result.get(metric), int) for metric in ("prepared", "accepted", "rejected")):
            require(result["accepted"] + result["rejected"] <= result["prepared"], f"{mode} prepared/accepted/rejected counts are inconsistent")
        if all(isinstance(result.get(metric), int) for metric in ("accepted", "delivered")):
            require(result["delivered"] <= result["accepted"], f"{mode} delivered exceeds accepted")
        if isinstance(result.get("delivered"), int) and result["delivered"] > 0:
            require(result.get("authenticated_delivery_events") is True, f"{mode} delivered lacks authenticated events")

    diagnostics = as_dict(trace.get("diagnostics"))
    for field in (
        "legacy_filesystem_token_used",
        "repository_sender_script_used",
        "direct_database_access_used",
        "raw_sendgrid_credential_used",
        "raw_recipient_addresses_exposed",
    ):
        require(diagnostics.get(field) is False, f"prohibited diagnostic state: {field}")
    require(diagnostics.get("hashed_recipient_identities") is True, "diagnostics do not use hashed recipient identities")

    missing_capabilities = as_list(trace.get("missing_capabilities"))
    if missing_capabilities:
        issue = as_dict(trace.get("capability_issue"))
        for field in (
            "issue_id",
            "stable_key",
            "missing_operation",
            "sanitized_context",
            "recovery_attempts",
            "completed_work",
            "user_impact",
            "acceptance_criteria",
        ):
            require(bool(issue.get(field)), f"capability issue missing {field}")

    return errors


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate_campaign_workflow_trace.py TRACE.json", file=sys.stderr)
        return 2
    path = Path(sys.argv[1])
    try:
        trace = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(json.dumps({"status": "invalid", "errors": [str(exc)]}))
        return 1
    errors = validate(as_dict(trace))
    print(json.dumps({"status": "valid" if not errors else "invalid", "errors": errors}, sort_keys=True))
    return 0 if not errors else 1


if __name__ == "__main__":
    raise SystemExit(main())
