#!/usr/bin/env python3
"""Aggregate local Codex JSONL token events by user request."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Iterable, TextIO


TOKEN_FIELDS = (
    "input_tokens",
    "cached_input_tokens",
    "output_tokens",
    "reasoning_output_tokens",
    "total_tokens",
)


@dataclass
class RequestUsage:
    request_id: str
    session_id: str
    timestamp: str
    date: str
    project: str
    cwd: str
    source: str
    model: str
    prompt: str
    prompt_chars: int
    prompt_sha256: str
    model_calls: int = 0
    tool_calls: int = 0
    input_tokens: int = 0
    cached_input_tokens: int = 0
    uncached_input_tokens: int = 0
    output_tokens: int = 0
    reasoning_output_tokens: int = 0
    total_tokens: int = 0
    models: Counter[str] = field(default_factory=Counter, repr=False)

    @property
    def cached_input_percent(self) -> float:
        if not self.input_tokens:
            return 0.0
        return 100.0 * self.cached_input_tokens / self.input_tokens

    def public_dict(self, prompt_mode: str) -> dict[str, Any]:
        data = asdict(self)
        data.pop("models", None)
        data["prompt"] = render_prompt(self.prompt, prompt_mode)
        data["cached_input_percent"] = round(self.cached_input_percent, 1)
        return data


@dataclass
class ScanStats:
    files_scanned: int = 0
    lines_scanned: int = 0
    malformed_lines: int = 0
    token_events_without_request: int = 0
    files_failed: int = 0


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    default_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    parser = argparse.ArgumentParser(
        description="Rank local Codex user requests by token consumption."
    )
    parser.add_argument("--codex-home", type=Path, default=default_home)
    parser.add_argument("--sessions-dir", type=Path, action="append")
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument("--days", type=int, help="Include the latest N calendar days.")
    scope.add_argument("--since", type=date.fromisoformat, help="Earliest date, YYYY-MM-DD.")
    parser.add_argument("--until", type=date.fromisoformat, help="Latest date, YYYY-MM-DD.")
    parser.add_argument("--project", help="Case-insensitive substring matched against cwd.")
    parser.add_argument("--model", help="Case-insensitive model substring.")
    parser.add_argument(
        "--sort",
        choices=("total", "uncached", "input", "output", "reasoning", "calls"),
        default="total",
    )
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument(
        "--prompt-mode",
        choices=("redacted", "preview", "full"),
        default="redacted",
    )
    parser.add_argument("--format", choices=("markdown", "csv", "json"), default="markdown")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    if args.days is not None and args.days < 1:
        parser.error("--days must be at least 1")
    if args.limit < 1:
        parser.error("--limit must be at least 1")
    return args


def session_paths(args: argparse.Namespace) -> list[Path]:
    roots = args.sessions_dir or [
        args.codex_home / "sessions",
        args.codex_home / "archived_sessions",
    ]
    found: set[Path] = set()
    for root in roots:
        if root.is_file() and root.suffix == ".jsonl":
            found.add(root.resolve())
        elif root.exists():
            found.update(path.resolve() for path in root.rglob("*.jsonl"))
    return sorted(found)


def safe_int(value: Any) -> int:
    if isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return max(0, int(value))
    return 0


def normalize_timestamp(value: Any, fallback: str = "") -> str:
    return value if isinstance(value, str) else fallback


def timestamp_date(value: str) -> str:
    if len(value) >= 10:
        candidate = value[:10]
        try:
            return date.fromisoformat(candidate).isoformat()
        except ValueError:
            pass
    return ""


def extract_prompt(payload: dict[str, Any]) -> str:
    message = payload.get("message")
    if isinstance(message, str):
        return message.strip()
    if isinstance(message, list):
        parts: list[str] = []
        for item in message:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts).strip()
    return ""


def project_name(cwd: str) -> str:
    if not cwd:
        return "(unknown)"
    return Path(cwd).name or cwd


def scan_file(path: Path, stats: ScanStats) -> list[RequestUsage]:
    results: list[RequestUsage] = []
    session_id = path.stem
    session_timestamp = ""
    cwd = ""
    source = ""
    current_model = ""
    current: RequestUsage | None = None
    request_number = 0

    def finish() -> None:
        nonlocal current
        if current is not None and current.model_calls:
            current.uncached_input_tokens = max(
                0, current.input_tokens - current.cached_input_tokens
            )
            if current.models:
                current.model = ", ".join(
                    model for model, _ in current.models.most_common()
                )
            results.append(current)
        current = None

    try:
        handle = path.open("r", encoding="utf-8")
    except OSError:
        stats.files_failed += 1
        return results

    stats.files_scanned += 1
    with handle:
        for line in handle:
            stats.lines_scanned += 1
            try:
                event = json.loads(line)
            except (json.JSONDecodeError, UnicodeDecodeError):
                stats.malformed_lines += 1
                continue
            if not isinstance(event, dict):
                stats.malformed_lines += 1
                continue
            event_type = event.get("type")
            payload = event.get("payload")
            payload = payload if isinstance(payload, dict) else {}
            event_timestamp = normalize_timestamp(event.get("timestamp"), session_timestamp)

            if event_type == "session_meta":
                session_id = str(payload.get("id") or session_id)
                session_timestamp = normalize_timestamp(
                    payload.get("timestamp"), event_timestamp
                )
                cwd = str(payload.get("cwd") or cwd)
                source = str(payload.get("source") or source)
                continue

            if event_type == "turn_context":
                current_model = str(payload.get("model") or current_model)
                turn_cwd = payload.get("cwd")
                if isinstance(turn_cwd, str) and turn_cwd:
                    cwd = turn_cwd
                    if current is not None:
                        current.cwd = turn_cwd
                        current.project = project_name(turn_cwd)
                if current is not None and current_model:
                    current.model = current_model
                continue

            subtype = payload.get("type")
            if event_type == "event_msg" and subtype == "user_message":
                finish()
                request_number += 1
                prompt = extract_prompt(payload)
                timestamp = event_timestamp or session_timestamp
                request_id = f"{session_id[:12]}:{request_number}"
                current = RequestUsage(
                    request_id=request_id,
                    session_id=session_id,
                    timestamp=timestamp,
                    date=timestamp_date(timestamp),
                    project=project_name(cwd),
                    cwd=cwd,
                    source=source,
                    model=current_model,
                    prompt=prompt,
                    prompt_chars=len(prompt),
                    prompt_sha256=hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:12],
                )
                continue

            if event_type == "response_item" and subtype in (
                "function_call",
                "custom_tool_call",
                "local_shell_call",
                "web_search_call",
            ):
                if current is not None:
                    current.tool_calls += 1
                continue

            if event_type == "event_msg" and subtype == "token_count":
                info = payload.get("info")
                info = info if isinstance(info, dict) else {}
                usage = info.get("last_token_usage")
                if not isinstance(usage, dict):
                    continue
                if current is None:
                    stats.token_events_without_request += 1
                    continue
                for field_name in TOKEN_FIELDS:
                    setattr(
                        current,
                        field_name,
                        getattr(current, field_name) + safe_int(usage.get(field_name)),
                    )
                current.model_calls += 1
                if current_model:
                    current.models[current_model] += 1
                continue

            if event_type == "event_msg" and subtype == "task_complete":
                finish()
    finish()
    return results


def apply_filters(
    requests: Iterable[RequestUsage], args: argparse.Namespace
) -> list[RequestUsage]:
    if args.days is not None:
        since = date.today() - timedelta(days=args.days - 1)
    else:
        since = args.since
    project_filter = args.project.casefold() if args.project else ""
    model_filter = args.model.casefold() if args.model else ""
    filtered: list[RequestUsage] = []
    for request in requests:
        request_date = date.fromisoformat(request.date) if request.date else None
        if since and (request_date is None or request_date < since):
            continue
        if args.until and (request_date is None or request_date > args.until):
            continue
        if project_filter and project_filter not in request.cwd.casefold():
            continue
        if model_filter and model_filter not in request.model.casefold():
            continue
        filtered.append(request)
    return filtered


def sort_requests(requests: list[RequestUsage], sort_key: str) -> list[RequestUsage]:
    keys = {
        "total": lambda item: item.total_tokens,
        "uncached": lambda item: item.uncached_input_tokens,
        "input": lambda item: item.input_tokens,
        "output": lambda item: item.output_tokens,
        "reasoning": lambda item: item.reasoning_output_tokens,
        "calls": lambda item: item.model_calls,
    }
    return sorted(requests, key=keys[sort_key], reverse=True)


def render_prompt(prompt: str, mode: str) -> str:
    compact = " ".join(prompt.split())
    if mode == "redacted":
        return f"[redacted; {len(prompt):,} chars]"
    if mode == "preview":
        return compact if len(compact) <= 120 else compact[:117] + "..."
    return prompt


def fmt_int(value: int) -> str:
    return f"{value:,}"


def aggregate(
    requests: Iterable[RequestUsage], key_name: str
) -> list[tuple[str, dict[str, int]]]:
    totals: dict[str, dict[str, int]] = defaultdict(
        lambda: {"requests": 0, "total": 0, "uncached": 0, "output": 0}
    )
    for request in requests:
        key = str(getattr(request, key_name) or "(unknown)")
        totals[key]["requests"] += 1
        totals[key]["total"] += request.total_tokens
        totals[key]["uncached"] += request.uncached_input_tokens
        totals[key]["output"] += request.output_tokens
    return sorted(totals.items(), key=lambda item: item[1]["total"], reverse=True)


def markdown_report(
    requests: list[RequestUsage],
    ranked: list[RequestUsage],
    stats: ScanStats,
    args: argparse.Namespace,
) -> str:
    total = sum(item.total_tokens for item in requests)
    input_tokens = sum(item.input_tokens for item in requests)
    cached = sum(item.cached_input_tokens for item in requests)
    uncached = sum(item.uncached_input_tokens for item in requests)
    output = sum(item.output_tokens for item in requests)
    reasoning = sum(item.reasoning_output_tokens for item in requests)
    calls = sum(item.model_calls for item in requests)
    dates = sorted(item.date for item in requests if item.date)
    date_range = f"{dates[0]} through {dates[-1]}" if dates else "(unknown)"
    cached_pct = 100.0 * cached / input_tokens if input_tokens else 0.0

    lines = [
        "# Codex Token Usage Analysis",
        "",
        f"- Date range: {date_range}",
        f"- Session files scanned: {stats.files_scanned:,}",
        f"- Requests with token data: {len(requests):,}",
        f"- Model calls: {calls:,}",
        f"- Total tokens: {fmt_int(total)}",
        f"- Input tokens: {fmt_int(input_tokens)}",
        f"- Cached input: {fmt_int(cached)} ({cached_pct:.1f}%)",
        f"- Uncached input: {fmt_int(uncached)}",
        f"- Output tokens: {fmt_int(output)}",
        f"- Reasoning output: {fmt_int(reasoning)} (included in output)",
        "",
        f"## Top requests by {args.sort}",
        "",
        "| # | Timestamp | Request | Project | Model | Calls | Tools | Total | Uncached input | Output | Cached % | Prompt |",
        "|---:|---|---|---|---|---:|---:|---:|---:|---:|---:|---|",
    ]
    for rank, item in enumerate(ranked[: args.limit], start=1):
        prompt = render_prompt(item.prompt, args.prompt_mode).replace("|", "\\|")
        model = item.model.replace("|", "\\|")
        lines.append(
            f"| {rank} | {item.timestamp or '(unknown)'} | {item.request_id} | "
            f"{item.project} | {model or '(unknown)'} | {item.model_calls} | "
            f"{item.tool_calls} | {fmt_int(item.total_tokens)} | "
            f"{fmt_int(item.uncached_input_tokens)} | {fmt_int(item.output_tokens)} | "
            f"{item.cached_input_percent:.1f}% | {prompt} |"
        )

    lines.extend(["", "## Usage by project", "", "| Project | Requests | Total | Uncached input | Output |", "|---|---:|---:|---:|---:|"])
    for key, values in aggregate(requests, "project")[:10]:
        lines.append(
            f"| {key} | {values['requests']:,} | {values['total']:,} | "
            f"{values['uncached']:,} | {values['output']:,} |"
        )

    lines.extend(["", "## Usage by model", "", "| Model | Requests | Total | Uncached input | Output |", "|---|---:|---:|---:|---:|"])
    for key, values in aggregate(requests, "model")[:10]:
        lines.append(
            f"| {key} | {values['requests']:,} | {values['total']:,} | "
            f"{values['uncached']:,} | {values['output']:,} |"
        )

    lines.extend(["", "## Optimization signals", ""])
    if ranked:
        top = ranked[0]
        share = 100.0 * top.total_tokens / total if total else 0.0
        lines.append(
            f"- The largest request used {fmt_int(top.total_tokens)} tokens "
            f"({share:.1f}% of the selected total) across {top.model_calls} model calls."
        )
    multi_call = [item for item in requests if item.model_calls >= 5]
    if multi_call:
        multi_total = sum(item.total_tokens for item in multi_call)
        lines.append(
            f"- {len(multi_call):,} requests made at least 5 model calls and used "
            f"{fmt_int(multi_total)} tokens. Narrower tasks and smaller tool outputs "
            "are the primary controls for these agent loops."
        )
    high_uncached = sorted(
        requests, key=lambda item: item.uncached_input_tokens, reverse=True
    )[:5]
    if high_uncached:
        lines.append(
            f"- The top 5 requests by new context introduced "
            f"{fmt_int(sum(item.uncached_input_tokens for item in high_uncached))} "
            "uncached input tokens. Review these first for oversized attachments, "
            "broad file reads, or long inherited instructions."
        )
    if cached_pct >= 80:
        lines.append(
            f"- {cached_pct:.1f}% of input was cached. Total activity is high while "
            "new-context usage is materially lower; prioritize call count and task "
            "scope when optimizing."
        )
    elif input_tokens:
        lines.append(
            f"- Cached input was {cached_pct:.1f}%. Reusing stable context and "
            "starting fresh tasks after topic changes can reduce repeated uncached input."
        )
    if stats.malformed_lines or stats.files_failed:
        lines.append(
            f"- Scan warnings: {stats.malformed_lines:,} malformed lines and "
            f"{stats.files_failed:,} unreadable files."
        )
    lines.extend(
        [
            "",
            "_Token counts measure Codex activity. ChatGPT credits and API cost require "
            "current plan, model, service-tier, and pricing rules._",
        ]
    )
    return "\n".join(lines) + "\n"


def write_csv(
    handle: TextIO, ranked: list[RequestUsage], prompt_mode: str
) -> None:
    rows = [item.public_dict(prompt_mode) for item in ranked]
    fieldnames = list(rows[0].keys()) if rows else [
        "request_id",
        "session_id",
        "timestamp",
        "date",
        "project",
        "cwd",
        "source",
        "model",
        "prompt",
        "prompt_chars",
        "prompt_sha256",
        "model_calls",
        "tool_calls",
        "input_tokens",
        "cached_input_tokens",
        "uncached_input_tokens",
        "output_tokens",
        "reasoning_output_tokens",
        "total_tokens",
        "cached_input_percent",
    ]
    writer = csv.DictWriter(handle, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)


def write_output(
    requests: list[RequestUsage],
    ranked: list[RequestUsage],
    stats: ScanStats,
    args: argparse.Namespace,
) -> None:
    handle: TextIO
    close_handle = False
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        handle = args.output.open("w", encoding="utf-8", newline="")
        close_handle = True
    else:
        handle = sys.stdout
    try:
        if args.format == "markdown":
            handle.write(markdown_report(requests, ranked, stats, args))
        elif args.format == "csv":
            write_csv(handle, ranked, args.prompt_mode)
        else:
            json.dump(
                {
                    "scan": asdict(stats),
                    "request_count": len(requests),
                    "requests": [
                        item.public_dict(args.prompt_mode) for item in ranked
                    ],
                },
                handle,
                indent=2,
            )
            handle.write("\n")
    finally:
        if close_handle:
            handle.close()


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    paths = session_paths(args)
    if not paths:
        print("No Codex JSONL session logs found.", file=sys.stderr)
        return 2
    stats = ScanStats()
    requests: list[RequestUsage] = []
    for path in paths:
        requests.extend(scan_file(path, stats))
    requests = apply_filters(requests, args)
    ranked = sort_requests(requests, args.sort)
    write_output(requests, ranked, stats, args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
