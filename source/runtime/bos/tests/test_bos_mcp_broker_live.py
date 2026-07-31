"""Opt-in live tenant-isolation checks for the installed BOS credentials."""

import importlib.util
import json
import os
from pathlib import Path
import sys

import pytest


pytestmark = pytest.mark.skipif(
    os.environ.get("BOS_BROKER_LIVE_TEST") != "1",
    reason="requires authenticated BOS MCP test sessions",
)

MODULE_PATH = Path(__file__).parents[1] / "scripts" / "bos_mcp_broker.py"
SPEC = importlib.util.spec_from_file_location("bos_mcp_broker_live", MODULE_PATH)
broker = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = broker
SPEC.loader.exec_module(broker)


def _scopes(value):
    found = []
    if isinstance(value, dict):
        required = {"org_id", "app_code", "installed_app_id", "delegated_role_id"}
        if required.issubset(value):
            found.append({key: value[key] for key in required})
        for child in value.values():
            found.extend(_scopes(child))
    elif isinstance(value, list):
        for child in value:
            found.extend(_scopes(child))
    return found


def _live_scopes():
    result = broker._call_all("bos_get_context", {})
    scopes = []
    for item in result["content"]:
        if item.get("type") != "text":
            continue
        try:
            scopes.extend(_scopes(json.loads(item["text"])))
        except json.JSONDecodeError:
            continue
    unique = {
        (s["org_id"], s["app_code"], s["installed_app_id"], s["delegated_role_id"]): s
        for s in scopes
    }
    by_org = {}
    for scope in unique.values():
        by_org.setdefault(scope["org_id"], scope)
    assert len(by_org) >= 2
    return list(by_org.values())


def _assert_no_provider_data(result):
    assert result.get("isError") is True
    serialized = json.dumps(result).lower()
    assert '"records":' not in serialized
    assert '"students":' not in serialized
    assert '"messages":' not in serialized


def test_cross_org_app_install_and_role_mix_fails_closed():
    first, second = _live_scopes()[:2]
    mixed = {**first, "org_id": second["org_id"], "query": {"limit": 1}}
    selected = broker._select_upstream("gmail_search", mixed)
    payload = selected.request(
        "tools/call", {"name": "gmail_search", "arguments": mixed}
    )
    _assert_no_provider_data(payload["result"])


def test_historical_ism_to_icode_calimatic_attempt_returns_no_data():
    first, second = _live_scopes()[:2]
    attempts = [
        {**first, "org_id": second["org_id"], "query": {"limit": 1}},
        {**second, "org_id": first["org_id"], "query": {"limit": 1}},
    ]
    for arguments in attempts:
        selected = broker._select_upstream("calimatic_search_students", arguments)
        payload = selected.request(
            "tools/call",
            {"name": "calimatic_search_students", "arguments": arguments},
        )
        _assert_no_provider_data(payload["result"])
