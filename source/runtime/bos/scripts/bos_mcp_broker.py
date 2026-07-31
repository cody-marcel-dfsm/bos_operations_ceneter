#!/usr/bin/env python3
"""One deferred, tenant-neutral MCP surface over org-scoped BOS credentials."""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from time import time
from typing import Any

import httpx


BOS_URL = (os.environ.get("BOS_MCP_URL") or "https://dfsm.ai/mcp").rstrip("/")
PROTOCOL_VERSION = "2025-06-18"
DISCOVERY_TOOLS = {
    "bos_get_context",
    "bos_get_source_capabilities",
    "bos_list_apps",
    "bos_list_sources",
}
LOCAL_TOOL_NAMES = {
    "bos_authenticate",
    "bos_get_connection_status",
}
BOOTSTRAP_TOOLS = {
    "bos_authenticate": {
        "name": "bos_authenticate",
        "description": (
            "Authenticate this in-memory BOS MCP session. Ask the customer for "
            "their BOS credential and pass it immediately. Never repeat, log, or "
            "store the credential in a file, prompt, or configuration."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "credential": {
                    "type": "string",
                    "description": "Sensitive BOS credential supplied by the customer.",
                    "writeOnly": True,
                }
            },
            "required": ["credential"],
            "additionalProperties": False,
        },
    },
    "bos_get_connection_status": {
        "name": "bos_get_connection_status",
        "description": "Return sanitized BOS authentication state.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
    },
}
DISCOVERY_CONTRACT_TOOLS = {
    name: {
        "name": name,
        "description": "Return authenticated, tenant-scoped BOS discovery data.",
        "inputSchema": {
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
    }
    for name in sorted(DISCOVERY_TOOLS)
}
PROVIDER_CONTRACT_TOOLS = {
    "bos_start_provider_authorization": {
        "name": "bos_start_provider_authorization",
        "description": (
            "Start provider OAuth authorization. Open the returned URL for the "
            "customer, poll status, then resume the original operation once."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "org_id": {"type": "string"},
                "installed_app_id": {"type": "string"},
                "plugin_id": {"type": "string"},
                "provider": {"type": "string"},
                "required_scopes": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
            "required": ["org_id", "installed_app_id", "plugin_id", "provider"],
            "additionalProperties": False,
        },
    },
    "bos_get_authorization_status": {
        "name": "bos_get_authorization_status",
        "description": "Poll a BOS provider-authorization transaction.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "org_id": {"type": "string"},
                "installed_app_id": {"type": "string"},
                "plugin_id": {"type": "string"},
                "transaction_id": {"type": "string"},
            },
            "required": [
                "org_id",
                "installed_app_id",
                "plugin_id",
                "transaction_id",
            ],
            "additionalProperties": False,
        },
    },
    "bos_set_provider_credential": {
        "name": "bos_set_provider_credential",
        "description": (
            "Send a customer-supplied provider secret to BOS for encrypted, "
            "tenant-scoped storage. Never repeat or log credential_value."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "org_id": {"type": "string"},
                "installed_app_id": {"type": "string"},
                "plugin_id": {"type": "string"},
                "provider": {"type": "string"},
                "credential_name": {"type": "string"},
                "credential_value": {"type": "string", "writeOnly": True},
                "configuration_authority_confirmed": {
                    "type": "boolean",
                    "const": True,
                    "description": (
                        "True only after the authenticated user explicitly supplies "
                        "or authorizes configuration of this provider credential."
                    ),
                },
            },
            "required": [
                "org_id",
                "installed_app_id",
                "plugin_id",
                "provider",
                "credential_name",
                "credential_value",
                "configuration_authority_confirmed",
            ],
            "additionalProperties": False,
        },
    },
    "bos_resume_operation": {
        "name": "bos_resume_operation",
        "description": (
            "Resume the original operation after BOS verifies recovered provider "
            "authorization. BOS permits at most one automatic retry."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "org_id": {"type": "string"},
                "installed_app_id": {"type": "string"},
                "plugin_id": {"type": "string"},
                "operation_id": {"type": "string"},
            },
            "required": [
                "org_id",
                "installed_app_id",
                "plugin_id",
                "operation_id",
            ],
            "additionalProperties": False,
        },
    },
}
SCOPED_READ_PROPERTIES = {
    "org_id": {"type": "string", "format": "uuid"},
    "app_code": {"type": "string"},
    "installed_app_id": {"type": "string", "format": "uuid"},
    "delegated_role_id": {"type": "string"},
    "query": {"type": "object"},
}
CALIMATIC_CONTRACT_TOOLS = {
    "calimatic_search_students": {
        "name": "calimatic_search_students",
        "description": "Search Calimatic students in exact server-returned BOS scope.",
        "inputSchema": {
            "type": "object",
            "properties": SCOPED_READ_PROPERTIES,
            "required": [
                "org_id",
                "app_code",
                "installed_app_id",
                "delegated_role_id",
            ],
            "additionalProperties": False,
        },
    },
    "calimatic_list_enrollments": {
        "name": "calimatic_list_enrollments",
        "description": "List Calimatic enrollments in exact server-returned BOS scope.",
        "inputSchema": {
            "type": "object",
            "properties": SCOPED_READ_PROPERTIES,
            "required": [
                "org_id",
                "app_code",
                "installed_app_id",
                "delegated_role_id",
            ],
            "additionalProperties": False,
        },
    },
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
    credential: str
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
        self.client = httpx.Client(
            timeout=30,
            headers={
                "Authorization": f"Bearer {self.credential}",
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


upstreams: list[Upstream] = []


def _upstreams() -> list[Upstream]:
    return upstreams


def _all_tools() -> list[dict[str, Any]]:
    if active_tools is None:
        _activate_tools(notify=False)
    assert active_tools is not None
    return active_tools


def _activate_tools(*, notify: bool = True) -> None:
    global active_tools, pending_tools_changed
    merged: dict[str, dict[str, Any]] = dict(BOOTSTRAP_TOOLS)
    # Codex snapshots MCP tools at process startup. Advertise the stable BOS
    # contract immediately, while call routing below continues to fail closed
    # until authentication and exact tenant scope are established.
    merged.update(DISCOVERY_CONTRACT_TOOLS)
    merged.update(PROVIDER_CONTRACT_TOOLS)
    merged.update(CALIMATIC_CONTRACT_TOOLS)
    for upstream in _upstreams():
        for name, tool in upstream.load_tools().items():
            merged[name] = tool
    active_tools = [merged[name] for name in sorted(merged)]
    pending_tools_changed = notify


def _call_all(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    content: list[dict[str, Any]] = []
    is_error = False
    for upstream in _upstreams():
        result = upstream.request(
            "tools/call", {"name": name, "arguments": arguments}
        ).get("result", {})
        content.extend(result.get("content", []))
        is_error = is_error or bool(result.get("isError"))
    return {"content": content, "isError": is_error}


def _text_result(value: dict[str, Any], *, is_error: bool = False) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": json.dumps(value, separators=(",", ":"))}],
        "isError": is_error,
    }


def _authenticate(arguments: dict[str, Any]) -> dict[str, Any]:
    global upstreams, active_tools
    credential = arguments.pop("credential", None)
    if not isinstance(credential, str) or not credential.strip():
        return _text_result(
            {"status": "authentication_required", "reason": "missing_credential"},
            is_error=True,
        )
    candidate = Upstream(name="default", credential=credential.strip())
    try:
        candidate.initialize()
        candidate.load_tools()
        candidate.load_org_ids()
    except Exception:
        candidate.credential = ""
        if candidate.client is not None:
            candidate.client.close()
        return _text_result(
            {"status": "authentication_required", "reason": "invalid_credential"},
            is_error=True,
        )
    upstreams = [candidate]
    active_tools = None
    _activate_tools()
    return _text_result(
        {
            "status": "connected",
            "message": "BOS authenticated. Call bos_get_context before domain work.",
        }
    )


def _connection_status() -> dict[str, Any]:
    return _text_result(
        {
            "status": "connected" if _upstreams() else "authentication_required",
            "credential_storage": "mcp_session_memory" if _upstreams() else "none",
        }
    )


def _select_upstream(name: str, arguments: dict[str, Any]) -> Upstream:
    candidates = list(_upstreams())
    if not candidates:
        raise RuntimeError(
            "BOS authentication is required. Ask the customer for their BOS "
            "credential and call bos_authenticate."
        )
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
                    "If BOS is disconnected, ask the customer for their BOS credential "
                    "and call bos_authenticate. Then call bos_get_context and pass exact "
                    "server-returned scope on every domain call. When BOS returns "
                    "authorization_required, automatically guide OAuth login or request "
                    "the provider key, verify authorization, and resume the original "
                    "operation once. Never repeat or log credential values."
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
        if name == "bos_authenticate":
            result = _authenticate(arguments)
        elif name == "bos_get_connection_status":
            result = _connection_status()
        elif name in DISCOVERY_TOOLS:
            if not _upstreams():
                raise RuntimeError(
                    "BOS authentication is required. Call bos_authenticate first."
                )
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
