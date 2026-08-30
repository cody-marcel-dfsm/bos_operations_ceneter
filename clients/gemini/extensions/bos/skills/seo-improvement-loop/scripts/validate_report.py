#!/usr/bin/env python3
"""Validate an SEO Improvement Loop report without writing any files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


REQUIRED_REPORT_FIELDS = {
    "schema_version",
    "run_id",
    "org_id",
    "app_code",
    "installed_app_id",
    "site_id",
    "site_url",
    "started_at",
    "completed_at",
    "mode",
    "evidence_summary",
    "operation_results",
    "review_summary",
    "review_analysis",
    "google_review_analysis",
    "selected_proposals",
    "skipped_candidates",
    "provider_blockers",
    "exit_decision",
    "next_due_at",
    "artifacts",
}

INTENDED_OPERATIONS = {
    "seo_sites_list",
    "seo_targets_list",
    "seo_run_begin",
    "seo_performance_measure",
    "seo_serp_measure",
    "seo_page_audit",
    "seo_metrics_compare",
    "seo_evidence_bundle_get",
    "reputation_search_profiles",
    "reputation_search_reviews",
    "seo_proposal_create",
    "seo_proposal_get",
}

OPERATION_CATEGORIES = {
    "discovery",
    "orchestration",
    "measurement",
    "analysis",
    "review",
}
OPERATION_STATUSES = {"executed", "skipped", "unavailable", "failed"}
REVIEW_RELEVANCE = {"primary_review", "supports_review"}
REVIEW_STATUSES = {"ready", "partial", "not_ready", "not_attempted"}
REVIEW_COVERAGE_STATUSES = {"complete", "partial", "unavailable"}


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _is_non_negative_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0

REQUIRED_PROPOSAL_FIELDS = {
    "action_id",
    "family",
    "target_url",
    "query_cluster",
    "evidence_refs",
    "current_values",
    "proposed_changes",
    "expected_effect",
    "risks",
    "approval_state",
    "evaluation_window",
}

EXIT_DECISIONS = {
    "continue",
    "hold",
    "goal_met",
    "plateaued",
    "blocked",
    "budget_exhausted",
    "deadline_reached",
    "safety_stop",
}


def _missing(value: dict[str, Any], required: set[str]) -> list[str]:
    return sorted(required.difference(value))


def validate_report(report: Any) -> list[str]:
    errors: list[str] = []
    if not isinstance(report, dict):
        return ["report must be a JSON object"]

    missing = _missing(report, REQUIRED_REPORT_FIELDS)
    if missing:
        errors.append(f"missing report fields: {', '.join(missing)}")

    if report.get("mode") != "observe_and_propose":
        errors.append("mode must equal observe_and_propose")

    decision = report.get("exit_decision")
    if decision not in EXIT_DECISIONS:
        errors.append("exit_decision is invalid")

    operation_results = report.get("operation_results")
    if not isinstance(operation_results, list):
        errors.append("operation_results must be an array")
    else:
        seen_operations: set[str] = set()
        for index, result in enumerate(operation_results):
            if not isinstance(result, dict):
                errors.append(f"operation_results[{index}] must be an object")
                continue
            required = {
                "operation",
                "category",
                "review_relevance",
                "status",
                "summary",
                "reason",
                "operation_id",
            }
            missing_result = _missing(result, required)
            if missing_result:
                errors.append(
                    f"operation_results[{index}] missing fields: "
                    f"{', '.join(missing_result)}"
                )
                continue
            operation = result["operation"]
            if operation not in INTENDED_OPERATIONS:
                errors.append(
                    f"operation_results[{index}].operation is unknown"
                )
            elif operation in seen_operations:
                errors.append(f"operation_results duplicates {operation}")
            seen_operations.add(operation)
            if result["category"] not in OPERATION_CATEGORIES:
                errors.append(
                    f"operation_results[{index}].category is invalid"
                )
            if result["review_relevance"] not in REVIEW_RELEVANCE:
                errors.append(
                    f"operation_results[{index}].review_relevance is invalid"
                )
            if result["status"] not in OPERATION_STATUSES:
                errors.append(
                    f"operation_results[{index}].status is invalid"
                )
            if result["status"] == "executed" and result["reason"] is not None:
                errors.append(
                    f"operation_results[{index}].reason must be null when executed"
                )
            if result["status"] != "executed" and not result["reason"]:
                errors.append(
                    f"operation_results[{index}].reason is required when not executed"
                )
        missing_operations = sorted(INTENDED_OPERATIONS - seen_operations)
        if missing_operations:
            errors.append(
                "operation_results missing intended operations: "
                + ", ".join(missing_operations)
            )

    review_summary = report.get("review_summary")
    if not isinstance(review_summary, dict):
        errors.append("review_summary must be an object")
    else:
        required_review = {
            "status",
            "operations",
            "proposal_count",
            "human_review_required",
            "summary",
        }
        missing_review = _missing(review_summary, required_review)
        if missing_review:
            errors.append(
                f"review_summary missing fields: {', '.join(missing_review)}"
            )
        else:
            if review_summary["status"] not in REVIEW_STATUSES:
                errors.append("review_summary.status is invalid")
            if set(review_summary["operations"]) != {
                "seo_proposal_create",
                "seo_proposal_get",
            }:
                errors.append(
                    "review_summary.operations must identify both review operations"
                )
            if not isinstance(review_summary["proposal_count"], int):
                errors.append("review_summary.proposal_count must be an integer")
            if review_summary["human_review_required"] is not True:
                errors.append("review_summary.human_review_required must be true")

    review_analysis = report.get("review_analysis")
    if not isinstance(review_analysis, dict):
        errors.append("review_analysis must be an object")
    else:
        required_analysis = {
            "evidence_reviewed",
            "current_assessment",
            "prior_run_comparison",
            "supported_conclusions",
            "unknowns",
            "proposal_readiness",
            "recommended_decision",
            "next_best_action",
        }
        missing_analysis = _missing(review_analysis, required_analysis)
        if missing_analysis:
            errors.append(
                "review_analysis missing fields: "
                + ", ".join(missing_analysis)
            )
        else:
            if not isinstance(review_analysis["evidence_reviewed"], list) or not (
                review_analysis["evidence_reviewed"]
            ):
                errors.append(
                    "review_analysis.evidence_reviewed must be a non-empty array"
                )
            if not isinstance(
                review_analysis["supported_conclusions"], list
            ) or not review_analysis["supported_conclusions"]:
                errors.append(
                    "review_analysis.supported_conclusions must be a non-empty array"
                )
            if not isinstance(review_analysis["unknowns"], list):
                errors.append("review_analysis.unknowns must be an array")
            for field in {
                "current_assessment",
                "prior_run_comparison",
                "proposal_readiness",
                "recommended_decision",
                "next_best_action",
            }:
                if not isinstance(review_analysis[field], str) or not (
                    review_analysis[field].strip()
                ):
                    errors.append(
                        f"review_analysis.{field} must be non-empty text"
                    )

    google_reviews = report.get("google_review_analysis")
    if not isinstance(google_reviews, dict):
        errors.append("google_review_analysis must be an object")
    else:
        required_google_reviews = {
            "source",
            "profile_id",
            "as_of",
            "timezone",
            "coverage",
            "coverage_note",
            "average_rating",
            "total_review_count",
            "reviews_analyzed",
            "last_7_days_count",
            "last_30_days_count",
            "last_90_days_count",
            "last_complete_week_count",
            "latest_review_at",
            "days_since_latest_review",
            "trailing_26_weeks_start",
            "weekly_frequency",
        }
        missing_google_reviews = _missing(
            google_reviews, required_google_reviews
        )
        if missing_google_reviews:
            errors.append(
                "google_review_analysis missing fields: "
                + ", ".join(missing_google_reviews)
            )
        else:
            if google_reviews["source"] != "Google Business Profile":
                errors.append(
                    "google_review_analysis.source must equal Google Business Profile"
                )
            if google_reviews["coverage"] not in REVIEW_COVERAGE_STATUSES:
                errors.append("google_review_analysis.coverage is invalid")
            for field in {
                "total_review_count",
                "reviews_analyzed",
                "last_7_days_count",
                "last_30_days_count",
                "last_90_days_count",
                "last_complete_week_count",
                "days_since_latest_review",
            }:
                value = google_reviews[field]
                if value is not None and not _is_non_negative_int(value):
                    errors.append(
                        f"google_review_analysis.{field} must be null or a non-negative integer"
                    )
            average_rating = google_reviews["average_rating"]
            if average_rating is not None and (
                not _is_number(average_rating)
                or average_rating < 0
                or average_rating > 5
            ):
                errors.append(
                    "google_review_analysis.average_rating must be null or a number from 0 through 5"
                )
            weekly = google_reviews["weekly_frequency"]
            if not isinstance(weekly, list) or len(weekly) != 26:
                errors.append(
                    "google_review_analysis.weekly_frequency must contain 26 buckets"
                )
            else:
                previous_start = ""
                for index, bucket in enumerate(weekly):
                    if not isinstance(bucket, dict):
                        errors.append(
                            f"google_review_analysis.weekly_frequency[{index}] must be an object"
                        )
                        continue
                    missing_bucket = _missing(
                        bucket, {"week_start", "week_end", "count"}
                    )
                    if missing_bucket:
                        errors.append(
                            "google_review_analysis.weekly_frequency"
                            f"[{index}] missing fields: {', '.join(missing_bucket)}"
                        )
                        continue
                    count = bucket["count"]
                    if count is not None and (
                        not isinstance(count, int) or count < 0
                    ):
                        errors.append(
                            "google_review_analysis.weekly_frequency"
                            f"[{index}].count must be null or a non-negative integer"
                        )
                    if previous_start and bucket["week_start"] <= previous_start:
                        errors.append(
                            "google_review_analysis.weekly_frequency must be chronological"
                        )
                    previous_start = bucket["week_start"]
                if google_reviews["coverage"] == "complete" and any(
                    bucket.get("count") is None
                    for bucket in weekly
                    if isinstance(bucket, dict)
                ):
                    errors.append(
                        "complete Google review coverage requires a count for every weekly bucket"
                    )
            if google_reviews["coverage"] == "complete":
                for field in {
                    "total_review_count",
                    "reviews_analyzed",
                    "last_7_days_count",
                    "last_30_days_count",
                    "last_90_days_count",
                    "last_complete_week_count",
                }:
                    if google_reviews[field] is None:
                        errors.append(
                            f"complete Google review coverage requires {field}"
                        )
                last_7 = google_reviews["last_7_days_count"]
                last_30 = google_reviews["last_30_days_count"]
                last_90 = google_reviews["last_90_days_count"]
                last_week = google_reviews["last_complete_week_count"]
                analyzed = google_reviews["reviews_analyzed"]
                total = google_reviews["total_review_count"]
                if all(_is_non_negative_int(value) for value in (last_7, last_30)):
                    if last_7 > last_30:
                        errors.append(
                            "last_7_days_count cannot exceed last_30_days_count"
                        )
                if all(
                    _is_non_negative_int(value) for value in (last_week, last_30)
                ) and last_week > last_30:
                    errors.append(
                        "last_complete_week_count cannot exceed last_30_days_count"
                    )
                if all(
                    _is_non_negative_int(value) for value in (last_30, last_90)
                ) and last_30 > last_90:
                    errors.append(
                        "last_30_days_count cannot exceed last_90_days_count"
                    )
                if all(
                    _is_non_negative_int(value) for value in (last_90, analyzed)
                ) and last_90 > analyzed:
                    errors.append(
                        "last_90_days_count cannot exceed reviews_analyzed"
                    )
                if all(
                    _is_non_negative_int(value) for value in (analyzed, total)
                ) and analyzed > total:
                    errors.append(
                        "reviews_analyzed cannot exceed total_review_count"
                    )
                if _is_non_negative_int(total):
                    latest = google_reviews["latest_review_at"]
                    days_since = google_reviews["days_since_latest_review"]
                    rating = google_reviews["average_rating"]
                    if total == 0:
                        if latest is not None or days_since is not None:
                            errors.append(
                                "zero total reviews requires null latest-review recency"
                            )
                        if rating is not None:
                            errors.append(
                                "zero total reviews requires null average_rating"
                            )
                    if total > 0 and (
                        not isinstance(latest, str)
                        or not latest.strip()
                        or not _is_non_negative_int(days_since)
                    ):
                        errors.append(
                            "positive total reviews require latest_review_at and non-negative days_since_latest_review"
                        )
                    if total > 0 and not _is_number(rating):
                        errors.append(
                            "positive total reviews require average_rating"
                        )

    proposals = report.get("selected_proposals")
    if not isinstance(proposals, list):
        errors.append("selected_proposals must be an array")
    elif len(proposals) > 1:
        errors.append("selected_proposals may contain at most one proposal")
    else:
        for index, proposal in enumerate(proposals):
            if not isinstance(proposal, dict):
                errors.append(f"selected_proposals[{index}] must be an object")
                continue
            missing_proposal = _missing(proposal, REQUIRED_PROPOSAL_FIELDS)
            if missing_proposal:
                errors.append(
                    f"selected_proposals[{index}] missing fields: "
                    f"{', '.join(missing_proposal)}"
                )

    forbidden_keys = {
        "report_body",
        "report_file",
        "report_archive",
        "website_apply_receipt",
        "cms_mutation",
        "wordpress_mutation",
    }
    found = sorted(forbidden_keys.intersection(report))
    if found:
        errors.append(f"forbidden report fields: {', '.join(found)}")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path, help="Path to report.json")
    args = parser.parse_args()

    try:
        report = json.loads(args.report.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"INVALID: {exc}")
        return 1

    errors = validate_report(report)
    if errors:
        for error in errors:
            print(f"INVALID: {error}")
        return 1

    print("VALID")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
