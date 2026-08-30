#!/usr/bin/env python3
"""Classify Codex tool calls and measure logged I/O payload volume."""

from __future__ import annotations

import argparse
import ast
import json
import os
import re
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any


@dataclass
class Call:
    call_id: str
    name: str
    category: str
    server: str
    timestamp: str
    month: str
    input_chars: int
    output_chars: int = 0
    media_chars: int = 0


DATA_URI_RE = re.compile(
    r"data:(?:image|audio|video)/[^;,\"'\s]+;base64,([A-Za-z0-9+/=_-]+)",
    re.IGNORECASE,
)


def parse_args() -> argparse.Namespace:
    default_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    parser = argparse.ArgumentParser(
        description="Measure MCP and other Codex tool I/O from local session logs."
    )
    parser.add_argument("--codex-home", type=Path, default=default_home)
    parser.add_argument("--days", type=int)
    parser.add_argument("--since", type=date.fromisoformat)
    parser.add_argument("--until", type=date.fromisoformat)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.days is not None and args.days < 1:
        parser.error("--days must be at least 1")
    if args.days is not None and args.since:
        parser.error("use only one of --days or --since")
    return args


def serialized_chars(value: Any) -> int:
    if value is None:
        return 0
    if isinstance(value, str):
        return len(value)
    try:
        return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")))
    except (TypeError, ValueError):
        return len(str(value))


def output_sizes(value: Any) -> tuple[int, int]:
    if value is None:
        return 0, 0
    if not isinstance(value, str):
        try:
            value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError):
            value = str(value)
    media_chars = sum(len(match.group(1)) for match in DATA_URI_RE.finditer(value))
    text_without_media = DATA_URI_RE.sub("[media payload omitted]", value)
    return len(text_without_media), media_chars


def clean_name(value: Any, fallback: str) -> str:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        action_type = value.get("type")
        if isinstance(action_type, str) and action_type:
            return action_type
    return fallback


def classify(name: str) -> str:
    normalized = name.casefold()
    if normalized.startswith("mcp__"):
        return "MCP"
    if normalized in {
        "exec_command",
        "write_stdin",
        "apply_patch",
        "exec",
        "wait",
        "local_shell_call",
    }:
        return "Shell & filesystem"
    if normalized in {
        "web_search",
        "web_search_call",
        "js",
        "click",
        "press_key",
        "set_value",
        "type_text",
        "scroll",
        "open_page",
        "view_image",
        "screenshot",
        "drag",
        "computer",
        "imagegen",
    }:
        return "Browser, web & media"
    if (
        "thread" in normalized
        or "agent" in normalized
        or normalized
        in {"spawn_agent", "wait_agent", "send_message", "followup_task", "close_agent"}
    ):
        return "Agents & threads"
    if normalized in {
        "update_plan",
        "get_goal",
        "create_goal",
        "update_goal",
    }:
        return "Planning & state"
    return "Other local tools"


def parse_invocation(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = ast.literal_eval(value)
        except (ValueError, SyntaxError):
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def event_date(timestamp: Any) -> date | None:
    if not isinstance(timestamp, str) or len(timestamp) < 10:
        return None
    try:
        return date.fromisoformat(timestamp[:10])
    except ValueError:
        return None


def in_scope(timestamp: Any, since: date | None, until: date | None) -> bool:
    parsed = event_date(timestamp)
    if since and (parsed is None or parsed < since):
        return False
    if until and (parsed is None or parsed > until):
        return False
    return True


def main() -> int:
    args = parse_args()
    since = date.today() - timedelta(days=args.days - 1) if args.days else args.since
    roots = [args.codex_home / "sessions", args.codex_home / "archived_sessions"]
    paths = sorted(
        {
            path.resolve()
            for root in roots
            if root.exists()
            for path in root.rglob("*.jsonl")
        }
    )
    calls: dict[str, Call] = {}
    files_scanned = 0
    malformed_lines = 0
    min_date: date | None = None
    max_date: date | None = None

    for path in paths:
        try:
            handle = path.open("r", encoding="utf-8")
        except OSError:
            continue
        files_scanned += 1
        with handle:
            for line in handle:
                try:
                    event = json.loads(line)
                except (json.JSONDecodeError, UnicodeDecodeError):
                    malformed_lines += 1
                    continue
                if not isinstance(event, dict):
                    continue
                timestamp = event.get("timestamp")
                if not in_scope(timestamp, since, args.until):
                    continue
                parsed_date = event_date(timestamp)
                if parsed_date:
                    min_date = parsed_date if min_date is None else min(min_date, parsed_date)
                    max_date = parsed_date if max_date is None else max(max_date, parsed_date)
                payload = event.get("payload")
                payload = payload if isinstance(payload, dict) else {}
                event_type = event.get("type")
                subtype = payload.get("type")

                if event_type == "response_item" and subtype in {
                    "function_call",
                    "custom_tool_call",
                    "local_shell_call",
                    "web_search_call",
                }:
                    call_id = str(payload.get("call_id") or payload.get("id") or "")
                    if not call_id:
                        continue
                    name = clean_name(
                        payload.get("name") or payload.get("action"), str(subtype)
                    )
                    arguments = payload.get("arguments")
                    if arguments is None:
                        arguments = payload.get("input")
                    if arguments is None:
                        arguments = payload.get("action")
                    calls[call_id] = Call(
                        call_id=call_id,
                        name=name,
                        category=classify(name),
                        server="",
                        timestamp=str(timestamp or ""),
                        month=str(timestamp or "")[:7],
                        input_chars=serialized_chars(arguments),
                    )
                    continue

                if event_type == "event_msg" and subtype == "mcp_tool_call_end":
                    call_id = str(payload.get("call_id") or "")
                    invocation = parse_invocation(payload.get("invocation"))
                    server = str(invocation.get("server") or "(unknown MCP server)")
                    tool = str(invocation.get("tool") or "(unknown MCP tool)")
                    if call_id not in calls:
                        calls[call_id] = Call(
                            call_id=call_id,
                            name=tool,
                            category="MCP",
                            server=server,
                            timestamp=str(timestamp or ""),
                            month=str(timestamp or "")[:7],
                            input_chars=serialized_chars(invocation.get("arguments")),
                        )
                    else:
                        calls[call_id].category = "MCP"
                        calls[call_id].server = server
                        calls[call_id].name = f"{server}.{tool}"
                    continue

                if event_type == "response_item" and subtype in {
                    "function_call_output",
                    "custom_tool_call_output",
                }:
                    call_id = str(payload.get("call_id") or "")
                    if call_id in calls:
                        text_chars, media_chars = output_sizes(payload.get("output"))
                        calls[call_id].output_chars += text_chars
                        calls[call_id].media_chars += media_chars

    category_totals: dict[str, dict[str, int]] = defaultdict(
        lambda: {"calls": 0, "input_chars": 0, "output_chars": 0, "media_chars": 0}
    )
    tool_totals: dict[tuple[str, str], dict[str, int]] = defaultdict(
        lambda: {"calls": 0, "input_chars": 0, "output_chars": 0, "media_chars": 0}
    )
    month_totals: dict[tuple[str, str], dict[str, int]] = defaultdict(
        lambda: {"calls": 0, "input_chars": 0, "output_chars": 0, "media_chars": 0}
    )
    server_totals: dict[str, dict[str, int]] = defaultdict(
        lambda: {"calls": 0, "input_chars": 0, "output_chars": 0, "media_chars": 0}
    )
    for call in calls.values():
        for target in (
            category_totals[call.category],
            tool_totals[(call.category, call.name)],
            month_totals[(call.month or "(unknown)", call.category)],
        ):
            target["calls"] += 1
            target["input_chars"] += call.input_chars
            target["output_chars"] += call.output_chars
            target["media_chars"] += call.media_chars
        if call.category == "MCP":
            server_key = call.server or "(unknown MCP server)"
            server_totals[server_key]["calls"] += 1
            server_totals[server_key]["input_chars"] += call.input_chars
            server_totals[server_key]["output_chars"] += call.output_chars
            server_totals[server_key]["media_chars"] += call.media_chars

    total_io_chars = sum(
        values["input_chars"] + values["output_chars"]
        for values in category_totals.values()
    )

    def rows(source: dict[Any, dict[str, int]], keys: tuple[str, ...]) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for raw_key, values in source.items():
            key_values = raw_key if isinstance(raw_key, tuple) else (raw_key,)
            row = dict(zip(keys, key_values))
            io_chars = values["input_chars"] + values["output_chars"]
            row.update(values)
            row["io_chars"] = io_chars
            row["estimated_io_tokens"] = round(io_chars / 4)
            row["estimated_output_tokens"] = round(values["output_chars"] / 4)
            row["io_share"] = io_chars / total_io_chars if total_io_chars else 0
            result.append(row)
        return sorted(result, key=lambda item: item["io_chars"], reverse=True)

    output = {
        "metadata": {
            "generated_at": date.today().isoformat(),
            "date_start": min_date.isoformat() if min_date else None,
            "date_end": max_date.isoformat() if max_date else None,
            "files_scanned": files_scanned,
            "malformed_lines": malformed_lines,
            "calls_classified": len(calls),
            "methodology": (
                "Calls and payload characters are exact log measurements. "
                "Text token-equivalents estimate four characters per token. Encoded "
                "image/audio/video payloads are excluded from text estimates and "
                "reported separately. Model token events do not allocate input or "
                "multimodal tokens to individual tools."
            ),
        },
        "categories": rows(category_totals, ("category",)),
        "months": rows(month_totals, ("month", "category")),
        "tools": rows(tool_totals, ("category", "tool")),
        "mcp_servers": rows(server_totals, ("server",)),
    }
    text = json.dumps(output, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
