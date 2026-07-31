#!/usr/bin/env python3
"""One deferred, tenant-neutral MCP surface over org-scoped BOS credentials."""

from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from time import time
from typing import Any

import httpx


BOS_URL = "https://dfsm.ai/mcp"
PROTOCOL_VERSION = "2025-06-18"
KEYCHAIN_ACCOUNT = "cody"
UPSTREAMS = {
    "dfsm": "ai.dfsm.bos.agent.dfsm",
    "icode": "ai.dfsm.bos.agent.icode",
}
DISCOVERY_TOOLS = {
    "bos_get_context",
    "bos_get_source_capabilities",
    "bos_list_apps",
    "bos_list_sources",
}
LOG_PATH = Path.home() / ".codex" / "cache" / "bos-broker-events.jsonl"
active_tools: list[dict[str, Any]] | None = None
pending_tools_changed = False
def _log(event: str, **details: Any) -> None:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open("a") as handle:
        handle.write(
            json.dumps({"time": round(time(), 3), "event": event, **details}) + "\n"
        )
    LOG_PATH.chmod(0o600)


def _keychain_password(service: str) -> str:
    result = subprocess.run(
        [
            "/usr/bin/security",
            "find-generic-password",
            "-a",
            KEYCHAIN_ACCOUNT,
            "-s",
            service,
            "-w",
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    value = result.stdout.strip()
    if result.returncode or not value:
        raise RuntimeError(
            "BOS authentication is not configured in macOS Keychain for "
            f"{service}. Reconnect the BOS plugin."
        )
    return value


def _decode_response(response: httpx.Response) -> dict[str, Any]:
    response.raise_for_status()
    content_type = response.headers.get("content-type", "")
    if "text/event-stream" not in content_type:
        return response.json()
    for line in response.text.splitlines():
        if line.startswith("data:"):
            payload = line[5:].strip()
            if payload and payload != "[DONE]":
                return json.loads(payload)
    raise RuntimeError("BOS returned an empty MCP event stream")


@dataclass
class Upstream:
    name: str
    keychain_service: str
    client: httpx.Client | None = None
    session_id: str | None = None
    tools: dict[str, dict[str, Any]] | None = None
    org_ids: set[str] | None = None

    def request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        if self.client is None:
            self.initialize()
        assert self.client is not None
        headers = {}
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        _log("upstream_request_started", upstream=self.name, method=method)
        response = self.client.post(
            BOS_URL,
            headers=headers,
            json={
                "jsonrpc": "2.0",
                "id": 2,
                "method": method,
                **({"params": params} if params is not None else {}),
            },
        )
        result = _decode_response(response)
        _log("upstream_request_completed", upstream=self.name, method=method)
        return result

    def initialize(self) -> None:
        _log("upstream_initialize_started", upstream=self.name)
        token = _keychain_password(self.keychain_service)
        self.client = httpx.Client(
            timeout=30,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json, text/event-stream",
                "Content-Type": "application/json",
            },
        )
        response = self.client.post(
            BOS_URL,
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {"name": "codex-bos-broker", "version": "0.1.0"},
                },
            },
        )
        payload = _decode_response(response)
        if "error" in payload:
            raise RuntimeError(payload["error"].get("message", "BOS initialization failed"))
        self.session_id = response.headers.get("mcp-session-id")
        headers = {"Mcp-Session-Id": self.session_id} if self.session_id else {}
        self.client.post(
            BOS_URL,
            headers=headers,
            json={"jsonrpc": "2.0", "method": "notifications/initialized"},
        )
        _log("upstream_initialize_completed", upstream=self.name)

    def load_tools(self) -> dict[str, dict[str, Any]]:
        if self.tools is None:
            payload = self.request("tools/list", {})
            self.tools = {
                tool["name"]: tool for tool in payload.get("result", {}).get("tools", [])
            }
        return self.tools

    def load_org_ids(self) -> set[str]:
        if self.org_ids is None:
            result = self.request(
                "tools/call",
                {"name": "bos_get_context", "arguments": {}},
            ).get("result", {})
            found: set[str] = set()
            for item in result.get("content", []):
                if item.get("type") != "text":
                    continue
                try:
                    value = json.loads(item.get("text", ""))
                except json.JSONDecodeError:
                    continue
                _collect_org_ids(value, found)
            self.org_ids = found
        return self.org_ids


def _collect_org_ids(value: Any, found: set[str]) -> None:
    if isinstance(value, dict):
        org_id = value.get("org_id")
        if isinstance(org_id, str):
            found.add(org_id)
        for child in value.values():
            _collect_org_ids(child, found)
    elif isinstance(value, list):
        for child in value:
            _collect_org_ids(child, found)


upstreams = [
    Upstream(name=name, keychain_service=service)
    for name, service in UPSTREAMS.items()
]


def _all_tools() -> list[dict[str, Any]]:
    if active_tools is None:
        _activate_tools(notify=False)
    assert active_tools is not None
    return active_tools


def _activate_tools(*, notify: bool = True) -> None:
    global active_tools, pending_tools_changed
    merged: dict[str, dict[str, Any]] = {}
    for upstream in upstreams:
        for name, tool in upstream.load_tools().items():
            existing = merged.get(name)
            if existing and existing.get("inputSchema") != tool.get("inputSchema"):
                raise RuntimeError(f"BOS tool schema differs across contexts: {name}")
            merged[name] = tool
    active_tools = [merged[name] for name in sorted(merged)]
    pending_tools_changed = notify


def _call_all(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    content: list[dict[str, Any]] = []
    is_error = False
    for upstream in upstreams:
        result = upstream.request(
            "tools/call", {"name": name, "arguments": arguments}
        ).get("result", {})
        content.extend(result.get("content", []))
        is_error = is_error or bool(result.get("isError"))
    return {"content": content, "isError": is_error}


def _select_upstream(name: str, arguments: dict[str, Any]) -> Upstream:
    candidates = list(upstreams)
    org_id = arguments.get("org_id")
    if isinstance(org_id, str):
        candidates = [u for u in candidates if org_id in u.load_org_ids()]
    if len(candidates) != 1:
        raise RuntimeError(
            "BOS context is missing or ambiguous. Call bos_get_context, then pass "
            "the exact server-returned org_id and app/install/role selectors."
        )
    return candidates[0]


def _handle(message: dict[str, Any]) -> dict[str, Any] | None:
    method = message.get("method")
    request_id = message.get("id")
    _log("local_request", method=method, has_id=request_id is not None)
    if request_id is None:
        return None
    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {"listChanged": True}},
                "serverInfo": {"name": "bos", "version": "0.1.0"},
                "instructions": (
                    "Use one tenant-neutral BOS connection. Call bos_get_context "
                    "and pass exact explicit scope on every domain call."
                ),
            },
        }
    if method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "result": {"tools": _all_tools()},
        }
    if method == "tools/call":
        params = message.get("params") or {}
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if name in DISCOVERY_TOOLS:
            result = _call_all(name, arguments)
            if name == "bos_get_context":
                _activate_tools()
        else:
            upstream = _select_upstream(name, arguments)
            payload = upstream.request(
                "tools/call", {"name": name, "arguments": arguments}
            )
            if "error" in payload:
                return {"jsonrpc": "2.0", "id": request_id, "error": payload["error"]}
            result = payload.get("result", {})
        return {"jsonrpc": "2.0", "id": request_id, "result": result}
    if method == "ping":
        return {"jsonrpc": "2.0", "id": request_id, "result": {}}
    return {
        "jsonrpc": "2.0",
        "id": request_id,
        "error": {"code": -32601, "message": f"Method not found: {method}"},
    }


def main() -> None:
    global pending_tools_changed
    for line in sys.stdin:
        try:
            message = json.loads(line)
            response = _handle(message)
        except Exception as exc:
            response = {
                "jsonrpc": "2.0",
                "id": message.get("id") if "message" in locals() else None,
                "error": {"code": -32000, "message": str(exc)},
            }
        if response is not None:
            sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")
            sys.stdout.flush()
        if pending_tools_changed:
            sys.stdout.write(
                json.dumps(
                    {"jsonrpc": "2.0", "method": "notifications/tools/list_changed"},
                    separators=(",", ":"),
                )
                + "\n"
            )
            sys.stdout.flush()
            pending_tools_changed = False


if __name__ == "__main__":
    main()
