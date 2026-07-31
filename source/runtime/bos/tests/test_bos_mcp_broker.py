import importlib.util
import json
from pathlib import Path
import sys

import pytest


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "bos_mcp_broker.py"
SPEC = importlib.util.spec_from_file_location("bos_mcp_broker", MODULE_PATH)
broker = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = broker
SPEC.loader.exec_module(broker)


class FakeUpstream:
    def __init__(self, name, org_ids):
        self.name = name
        self._org_ids = set(org_ids)
        self.calls = []

    def load_org_ids(self):
        return self._org_ids

    def request(self, method, params=None):
        self.calls.append((method, params))
        return {"result": {"content": [{"type": "text", "text": self.name}]}}


def test_initialize_is_local_and_does_not_touch_upstreams(monkeypatch):
    def forbidden():
        raise AssertionError("startup must not authenticate BOS")

    monkeypatch.setattr(broker, "_all_tools", forbidden)
    response = broker._handle(
        {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {},
        }
    )
    assert response["result"]["serverInfo"]["name"] == "bos"


def test_unauthenticated_tools_expose_stable_fail_closed_contract(monkeypatch):
    monkeypatch.setattr(broker, "upstreams", [])
    monkeypatch.setattr(broker, "active_tools", None)

    response = broker._handle(
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
    )

    names = [tool["name"] for tool in response["result"]["tools"]]
    assert "bos_authenticate" in names
    assert "bos_get_context" in names
    assert "bos_set_provider_credential" in names
    assert "calimatic_list_enrollments" in names
    assert "calimatic_search_students" in names


def test_authentication_accepts_secret_through_mcp_without_logging_it(monkeypatch):
    events = []

    class AuthenticatedUpstream:
        def __init__(self, name, credential):
            self.name = name
            self.credential = credential
            self.client = None

        def initialize(self):
            events.append(("initialized", self.credential))

        def load_tools(self):
            return {"bos_get_context": {"name": "bos_get_context", "inputSchema": {}}}

        def load_org_ids(self):
            return {"org-dfsm"}

    monkeypatch.setattr(broker, "Upstream", AuthenticatedUpstream)
    monkeypatch.setattr(broker, "upstreams", [])
    monkeypatch.setattr(broker, "active_tools", None)
    arguments = {"credential": "bos-secret-value"}

    result = broker._authenticate(arguments)

    assert result["isError"] is False
    assert arguments == {}
    assert broker.upstreams[0].credential == "bos-secret-value"
    assert "bos-secret-value" not in json.dumps(result)


def test_tools_list_exposes_authorized_union_on_initial_discovery(monkeypatch):
    class ToolUpstream:
        def __init__(self, tools):
            self.tools = tools

        def load_tools(self):
            return self.tools

    context_tool = {"name": "bos_get_context", "inputSchema": {"type": "object"}}
    gmail_tool = {"name": "gmail_search", "inputSchema": {"type": "object"}}
    monkeypatch.setattr(
        broker,
        "upstreams",
        [
            ToolUpstream({"bos_get_context": context_tool}),
            ToolUpstream(
                {
                    "bos_get_context": context_tool,
                    "gmail_search": gmail_tool,
                }
            ),
        ],
    )
    monkeypatch.setattr(broker, "active_tools", None)
    monkeypatch.setattr(broker, "pending_tools_changed", False)
    response = broker._handle(
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}
    )

    assert [tool["name"] for tool in response["result"]["tools"]] == [
        "bos_authenticate",
        "bos_get_authorization_status",
        "bos_get_connection_status",
        "bos_get_context",
        "bos_get_source_capabilities",
        "bos_list_apps",
        "bos_list_sources",
        "bos_resume_operation",
        "bos_set_provider_credential",
        "bos_start_provider_authorization",
        "calimatic_list_enrollments",
        "calimatic_search_students",
        "gmail_search",
    ]
    assert broker.pending_tools_changed is False


def test_explicit_org_routes_to_exactly_one_scoped_upstream(monkeypatch):
    first = FakeUpstream("dfsm", {"org-dfsm"})
    second = FakeUpstream("icode", {"org-icode"})
    monkeypatch.setattr(broker, "upstreams", [first, second])

    selected = broker._select_upstream("gmail_search", {"org_id": "org-icode"})

    assert selected is second


def test_activation_replaces_bootstrap_with_current_authorized_union(monkeypatch):
    class ToolUpstream:
        def __init__(self, tools):
            self.tools = tools

        def load_tools(self):
            return self.tools

    first_tool = {"name": "bos_get_context", "inputSchema": {"type": "object"}}
    second_tool = {"name": "gmail_search", "inputSchema": {"type": "object"}}
    monkeypatch.setattr(
        broker,
        "upstreams",
        [
            ToolUpstream({"bos_get_context": first_tool}),
            ToolUpstream({"bos_get_context": first_tool, "gmail_search": second_tool}),
        ],
    )
    monkeypatch.setattr(broker, "active_tools", None)
    monkeypatch.setattr(broker, "pending_tools_changed", False)

    broker._activate_tools()

    assert [tool["name"] for tool in broker._all_tools()] == [
        "bos_authenticate",
        "bos_get_authorization_status",
        "bos_get_connection_status",
        "bos_get_context",
        "bos_get_source_capabilities",
        "bos_list_apps",
        "bos_list_sources",
        "bos_resume_operation",
        "bos_set_provider_credential",
        "bos_start_provider_authorization",
        "calimatic_list_enrollments",
        "calimatic_search_students",
        "gmail_search",
    ]
    assert broker.pending_tools_changed is True


@pytest.mark.parametrize("arguments", [{}, {"org_id": "foreign-org"}])
def test_missing_or_foreign_org_fails_closed(monkeypatch, arguments):
    monkeypatch.setattr(
        broker,
        "upstreams",
        [FakeUpstream("dfsm", {"org-dfsm"}), FakeUpstream("icode", {"org-icode"})],
    )

    with pytest.raises(RuntimeError, match="missing or ambiguous"):
        broker._select_upstream("gmail_search", arguments)


def test_discovery_combines_context_without_selecting_credentials(monkeypatch):
    first = FakeUpstream("dfsm", {"org-dfsm"})
    second = FakeUpstream("icode", {"org-icode"})
    monkeypatch.setattr(broker, "upstreams", [first, second])

    result = broker._call_all("bos_get_context", {})

    assert [item["text"] for item in result["content"]] == ["dfsm", "icode"]
    assert len(first.calls) == len(second.calls) == 1


def test_missing_authentication_fails_closed(monkeypatch):
    monkeypatch.setattr(broker, "upstreams", [])

    with pytest.raises(RuntimeError, match="authentication is required"):
        broker._select_upstream("gmail_search", {})


def test_provider_secret_contract_marks_value_write_only():
    schema = broker.PROVIDER_CONTRACT_TOOLS["bos_set_provider_credential"][
        "inputSchema"
    ]

    assert schema["properties"]["credential_value"]["writeOnly"] is True
    assert "credential_value" in schema["required"]


def test_provider_api_key_is_forwarded_once_and_never_echoed(monkeypatch):
    upstream = FakeUpstream("dfsm", {"org-dfsm"})
    monkeypatch.setattr(broker, "upstreams", [upstream])
    arguments = {
        "org_id": "org-dfsm",
        "installed_app_id": "install-1",
        "plugin_id": "calimatic",
        "provider": "calimatic",
        "credential_name": "api_key",
        "credential_value": "provider-secret",
    }

    response = broker._handle(
        {
            "jsonrpc": "2.0",
            "id": 8,
            "method": "tools/call",
            "params": {
                "name": "bos_set_provider_credential",
                "arguments": arguments,
            },
        }
    )

    assert upstream.calls == [
        (
            "tools/call",
            {"name": "bos_set_provider_credential", "arguments": arguments},
        )
    ]
    assert "provider-secret" not in json.dumps(response)


def test_oauth_start_and_status_are_forwarded_to_scoped_bos(monkeypatch):
    upstream = FakeUpstream("dfsm", {"org-dfsm"})
    monkeypatch.setattr(broker, "upstreams", [upstream])

    broker._handle(
        {
            "jsonrpc": "2.0",
            "id": 9,
            "method": "tools/call",
            "params": {
                "name": "bos_start_provider_authorization",
                "arguments": {
                    "org_id": "org-dfsm",
                    "installed_app_id": "install-1",
                    "plugin_id": "google",
                    "provider": "google",
                    "required_scopes": ["gmail.readonly", "calendar.readonly"],
                },
            },
        }
    )
    broker._handle(
        {
            "jsonrpc": "2.0",
            "id": 10,
            "method": "tools/call",
            "params": {
                "name": "bos_get_authorization_status",
                "arguments": {
                    "org_id": "org-dfsm",
                    "installed_app_id": "install-1",
                    "plugin_id": "google",
                    "transaction_id": "auth-1",
                },
            },
        }
    )

    assert [call[1]["name"] for call in upstream.calls] == [
        "bos_start_provider_authorization",
        "bos_get_authorization_status",
    ]
