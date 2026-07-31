#!/usr/bin/env python3
"""One deferred, tenant-neutral MCP surface over org-scoped BOS credentials."""

from __future__ import annotations

import json
import os
import secrets
import sys
import threading
import webbrowser
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from time import time
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx


BOS_URL = (os.environ.get("BOS_MCP_URL") or "https://dfsm.ai/mcp").rstrip("/")
if urlsplit(BOS_URL).scheme != "https" and os.environ.get("BOS_ALLOW_INSECURE_TEST_URL") != "1":
    raise RuntimeError("BOS_MCP_URL must use HTTPS")
PROTOCOL_VERSION = "2025-06-18"
DISCOVERY_TOOLS = {
    "bos_get_context",
    "bos_get_source_capabilities",
    "bos_list_apps",
    "bos_list_sources",
}
LOCAL_TOOL_NAMES = {
    "bos_authenticate",
    "bos_start_authentication",
    "bos_get_authentication_status",
    "bos_get_connection_status",
}
BOOTSTRAP_TOOLS = {
    "bos_authenticate": {
        "name": "bos_authenticate",
        "description": (
            "Legacy programmatic authentication for controlled test harnesses. "
            "Never ask a customer to place a credential in chat. Interactive "
            "clients must call bos_start_authentication instead."
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
    "bos_start_authentication": {
        "name": "bos_start_authentication",
        "description": (
            "Open a one-time local credential page owned by this MCP process. "
            "The customer enters the BOS credential there, never in chat."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {},
            "additionalProperties": False,
        },
    },
    "bos_get_authentication_status": {
        "name": "bos_get_authentication_status",
        "description": "Return sanitized status for the local BOS authentication handoff.",
        "inputSchema": {
            "type": "object",
            "properties": {"handoff_id": {"type": "string"}},
            "required": ["handoff_id"],
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
    "bos_start_provider_credential_handoff": {
        "name": "bos_start_provider_credential_handoff",
        "description": "Open a one-time local page for an explicitly authorized provider API key. Never request the key in chat.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "org_id": {"type": "string"},
                "installed_app_id": {"type": "string"},
                "plugin_id": {"type": "string"},
                "provider": {"type": "string"},
                "credential_name": {"type": "string"},
                "configuration_authority_confirmed": {"type": "boolean", "const": True},
            },
            "required": ["org_id", "installed_app_id", "plugin_id", "provider", "credential_name", "configuration_authority_confirmed"],
            "additionalProperties": False,
        },
    },
    "bos_get_provider_credential_handoff_status": {
        "name": "bos_get_provider_credential_handoff_status",
        "description": "Return sanitized status for the local provider-credential handoff.",
        "inputSchema": {"type": "object", "properties": {"handoff_id": {"type": "string"}}, "required": ["handoff_id"], "additionalProperties": False},
    },
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
AUTH_HANDOFF_TTL_SECONDS = 300
auth_handoff: dict[str, Any] = {"status": "idle"}
auth_handoff_lock = threading.Lock()
provider_handoff: dict[str, Any] = {"status": "idle"}
provider_handoff_lock = threading.Lock()


def _handoff_page(action: str, heading: str, field_label: str, disclosure: str, message: str = "") -> bytes:
    notice = f'<p role="alert">{message}</p>' if message else ""
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="referrer" content="no-referrer"><title>{heading}</title>
<style>body{{font:16px system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem}}label,input,button{{display:block;width:100%;box-sizing:border-box}}input,button{{font:inherit;padding:.75rem;margin-top:.5rem}}button{{margin-top:1rem}}</style></head>
<body><h1>{heading}</h1><p>{disclosure}</p>{notice}
<form method="post" action="{action}" autocomplete="off"><label>{field_label}<input name="credential" type="password" required autofocus autocomplete="off"></label><button type="submit">Connect</button></form></body></html>""".encode()


def _valid_loopback_request(handler: BaseHTTPRequestHandler, expected_host: str) -> bool:
    if handler.headers.get("Host") != expected_host:
        return False
    origin = handler.headers.get("Origin")
    if origin and origin != f"http://{expected_host}":
        return False
    fetch_site = handler.headers.get("Sec-Fetch-Site")
    if fetch_site and fetch_site not in {"same-origin", "none"}:
        return False
    return True


def _shutdown_server(server: HTTPServer) -> None:
    try:
        server.shutdown()
    finally:
        server.server_close()


def _start_authentication_handoff() -> dict[str, Any]:
    global auth_handoff
    if _upstreams():
        return _text_result({"status": "connected", "credential_storage": "mcp_session_memory"})

    with auth_handoff_lock:
        if auth_handoff.get("status") == "pending" and auth_handoff.get("expires_at", 0) > time():
            return _text_result({"status": "authorization_pending", "handoff_id": auth_handoff["id"], "authorization_url": auth_handoff["url"], "expires_in_seconds": max(0, int(auth_handoff["expires_at"] - time()))})

        nonce = secrets.token_urlsafe(32)
        handoff_id = secrets.token_urlsafe(18)
        path = f"/bos-auth/{nonce}"
        expires_at = time() + AUTH_HANDOFF_TTL_SECONDS

        class HandoffHandler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: Any) -> None:
                return

            def _headers(self, status: int, length: int) -> None:
                self.send_response(status)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(length))
                self.send_header("Cache-Control", "no-store, max-age=0")
                self.send_header("Pragma", "no-cache")
                self.send_header("Referrer-Policy", "no-referrer")
                self.send_header("X-Frame-Options", "DENY")
                self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
                self.end_headers()

            def do_GET(self) -> None:
                with auth_handoff_lock:
                    valid = auth_handoff.get("id") == handoff_id and auth_handoff.get("status") == "pending"
                if not valid or urlsplit(self.path).path != path or time() >= expires_at or not _valid_loopback_request(self, expected_host):
                    body = b"Authentication link is invalid or expired."
                    self._headers(404, len(body)); self.wfile.write(body); return
                body = _handoff_page(path, "Connect BOS", "BOS credential", "The local BOS broker receives this credential outside ChatGPT and transmits it to the configured BOS service over TLS for authentication. It remains only in broker session memory.")
                self._headers(200, len(body)); self.wfile.write(body)

            def do_POST(self) -> None:
                global auth_handoff
                if urlsplit(self.path).path != path or not _valid_loopback_request(self, expected_host):
                    body = b"Authentication link is invalid or expired."
                    self._headers(404, len(body)); self.wfile.write(body); return
                if not self.headers.get("Content-Type", "").startswith("application/x-www-form-urlencoded"):
                    body = b"Invalid request."
                    self._headers(415, len(body)); self.wfile.write(body); return
                with auth_handoff_lock:
                    valid = auth_handoff.get("id") == handoff_id and auth_handoff.get("status") == "pending"
                    if valid and time() < expires_at:
                        auth_handoff["status"] = "processing"
                    else:
                        valid = False
                if not valid:
                    body = b"Authentication link is invalid, expired, or already used."
                    self._headers(410, len(body)); self.wfile.write(body); return
                submitted = ""
                connected = False
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                    if length < 1 or length > 8192:
                        raise ValueError("invalid length")
                    submitted = parse_qs(self.rfile.read(length).decode("utf-8", "strict"), keep_blank_values=True).get("credential", [""])[0]
                    result = _authenticate({"credential": submitted})
                    connected = not result.get("isError")
                    body = (b"<h1>BOS connected</h1><p>You can close this window and return to ChatGPT.</p>" if connected else b"Credential was not accepted. Return to ChatGPT and request a new link.")
                    self._headers(200 if connected else 401, len(body)); self.wfile.write(body)
                except Exception:
                    body = b"Authentication failed. Return to ChatGPT and request a new link."
                    self._headers(400, len(body)); self.wfile.write(body)
                finally:
                    submitted = ""
                    with auth_handoff_lock:
                        if auth_handoff.get("id") == handoff_id:
                            auth_handoff = {"id": handoff_id, "status": "connected" if connected else "failed"}
                    threading.Thread(target=_shutdown_server, args=(self.server,), daemon=True).start()

        server = HTTPServer(("127.0.0.1", 0), HandoffHandler)
        expected_host = f"127.0.0.1:{server.server_port}"
        url = f"http://127.0.0.1:{server.server_port}{path}"
        auth_handoff = {"id": handoff_id, "status": "pending", "url": url, "expires_at": expires_at, "server": server}
        threading.Thread(target=server.serve_forever, daemon=True).start()
        expiry_timer = threading.Timer(AUTH_HANDOFF_TTL_SECONDS, _shutdown_server, args=(server,))
        expiry_timer.daemon = True
        expiry_timer.start()
    webbrowser.open(url)
    return _text_result({"status": "authorization_pending", "handoff_id": handoff_id, "authorization_url": url, "expires_in_seconds": AUTH_HANDOFF_TTL_SECONDS, "instruction": "Enter the credential only in the local BOS window, then call bos_get_authentication_status."})


def _authentication_handoff_status(arguments: dict[str, Any]) -> dict[str, Any]:
    with auth_handoff_lock:
        if arguments.get("handoff_id") != auth_handoff.get("id"):
            return _text_result({"status": "unknown", "credential_storage": "none"}, is_error=True)
        status = auth_handoff.get("status", "idle")
        if status == "pending" and auth_handoff.get("expires_at", 0) <= time():
            status = "expired"
    if _upstreams() and status == "connected":
        return _text_result({"status": "connected", "credential_storage": "mcp_session_memory"})
    return _text_result({"status": status, "credential_storage": "none"})


def _start_provider_credential_handoff(arguments: dict[str, Any]) -> dict[str, Any]:
    global provider_handoff
    upstream = _select_upstream("bos_set_provider_credential", arguments)
    safe_arguments = dict(arguments)
    with provider_handoff_lock:
        if provider_handoff.get("status") == "pending" and provider_handoff.get("expires_at", 0) > time():
            if provider_handoff.get("scope") != safe_arguments:
                return _text_result({"status": "handoff_scope_conflict"}, is_error=True)
            return _text_result({"status": "authorization_pending", "handoff_id": provider_handoff["id"], "authorization_url": provider_handoff["url"], "expires_in_seconds": max(0, int(provider_handoff["expires_at"] - time()))})
        nonce = secrets.token_urlsafe(32)
        handoff_id = secrets.token_urlsafe(18)
        path = f"/bos-provider/{nonce}"
        expires_at = time() + AUTH_HANDOFF_TTL_SECONDS

        class ProviderHandoffHandler(BaseHTTPRequestHandler):
            def log_message(self, format: str, *args: Any) -> None:
                return

            def _headers(self, status: int, length: int) -> None:
                self.send_response(status)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(length))
                self.send_header("Cache-Control", "no-store, max-age=0")
                self.send_header("Pragma", "no-cache")
                self.send_header("Referrer-Policy", "no-referrer")
                self.send_header("X-Frame-Options", "DENY")
                self.send_header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'")
                self.end_headers()

            def do_GET(self) -> None:
                with provider_handoff_lock:
                    valid = provider_handoff.get("id") == handoff_id and provider_handoff.get("status") == "pending"
                if not valid or urlsplit(self.path).path != path or time() >= expires_at or not _valid_loopback_request(self, expected_host):
                    body = b"Credential link is invalid or expired."
                    self._headers(404, len(body)); self.wfile.write(body); return
                body = _handoff_page(path, "Connect provider", "Provider credential", "The local BOS broker receives this credential outside ChatGPT and transmits it to the configured BOS service over TLS for validation and encrypted tenant-scoped storage.")
                self._headers(200, len(body)); self.wfile.write(body)

            def do_POST(self) -> None:
                global provider_handoff
                if urlsplit(self.path).path != path or not _valid_loopback_request(self, expected_host):
                    body = b"Credential link is invalid or expired."
                    self._headers(404, len(body)); self.wfile.write(body); return
                if not self.headers.get("Content-Type", "").startswith("application/x-www-form-urlencoded"):
                    body = b"Invalid request."
                    self._headers(415, len(body)); self.wfile.write(body); return
                with provider_handoff_lock:
                    valid = provider_handoff.get("id") == handoff_id and provider_handoff.get("status") == "pending" and provider_handoff.get("scope") == safe_arguments
                    if valid and time() < expires_at:
                        provider_handoff["status"] = "processing"
                    else:
                        valid = False
                if not valid:
                    body = b"Credential link is invalid, expired, or already used."
                    self._headers(410, len(body)); self.wfile.write(body); return
                submitted = ""
                forwarded: dict[str, Any] = {}
                connected = False
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                    if length < 1 or length > 8192:
                        raise ValueError("invalid length")
                    submitted = parse_qs(self.rfile.read(length).decode("utf-8", "strict"), keep_blank_values=True).get("credential", [""])[0]
                    forwarded = {**safe_arguments, "credential_value": submitted}
                    payload = upstream.request("tools/call", {"name": "bos_set_provider_credential", "arguments": forwarded})
                    result = payload.get("result", {})
                    connected = "error" not in payload and not result.get("isError")
                    body = (b"<h1>Provider connected</h1><p>You can close this window and return to ChatGPT.</p>" if connected else b"Provider credential was not accepted. Return to ChatGPT and request a new link.")
                    self._headers(200 if connected else 400, len(body)); self.wfile.write(body)
                except Exception:
                    body = b"Provider configuration failed. Return to ChatGPT and request a new link."
                    self._headers(400, len(body)); self.wfile.write(body)
                finally:
                    submitted = ""; forwarded.clear()
                    with provider_handoff_lock:
                        if provider_handoff.get("id") == handoff_id:
                            provider_handoff = {"id": handoff_id, "status": "configured" if connected else "failed", "scope": safe_arguments}
                    threading.Thread(target=_shutdown_server, args=(self.server,), daemon=True).start()

        server = HTTPServer(("127.0.0.1", 0), ProviderHandoffHandler)
        expected_host = f"127.0.0.1:{server.server_port}"
        url = f"http://127.0.0.1:{server.server_port}{path}"
        provider_handoff = {"id": handoff_id, "status": "pending", "scope": safe_arguments, "url": url, "expires_at": expires_at, "server": server}
        threading.Thread(target=server.serve_forever, daemon=True).start()
        expiry_timer = threading.Timer(AUTH_HANDOFF_TTL_SECONDS, _shutdown_server, args=(server,))
        expiry_timer.daemon = True
        expiry_timer.start()
    webbrowser.open(url)
    return _text_result({"status": "authorization_pending", "handoff_id": handoff_id, "authorization_url": url, "expires_in_seconds": AUTH_HANDOFF_TTL_SECONDS, "instruction": "Enter the provider credential only in the local BOS window, then call bos_get_provider_credential_handoff_status."})


def _provider_credential_handoff_status(arguments: dict[str, Any]) -> dict[str, Any]:
    with provider_handoff_lock:
        if arguments.get("handoff_id") != provider_handoff.get("id"):
            return _text_result({"status": "unknown"}, is_error=True)
        status = provider_handoff.get("status", "idle")
        if status == "pending" and provider_handoff.get("expires_at", 0) <= time():
            status = "expired"
    return _text_result({"status": status})
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
            "BOS authentication is required. Call bos_start_authentication and "
            "have the customer use the local BOS window; never request the credential in chat."
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
                    "If BOS is disconnected, call bos_start_authentication. The customer "
                    "enters the credential only in the local BOS window; never request it "
                    "in chat. Poll bos_get_authentication_status, then call bos_get_context "
                    "and pass exact "
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
        elif name == "bos_start_authentication":
            result = _start_authentication_handoff()
        elif name == "bos_get_authentication_status":
            result = _authentication_handoff_status(arguments)
        elif name == "bos_get_connection_status":
            result = _connection_status()
        elif name == "bos_start_provider_credential_handoff":
            result = _start_provider_credential_handoff(arguments)
        elif name == "bos_get_provider_credential_handoff_status":
            result = _provider_credential_handoff_status(arguments)
        elif name in DISCOVERY_TOOLS:
            if not _upstreams():
                raise RuntimeError(
                    "BOS authentication is required. Call bos_start_authentication first."
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
