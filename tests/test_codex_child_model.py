"""Focused model-inheritance regression checks."""

import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools.codex_child_model import selected_model, selected_reasoning_effort


class SelectedModelTests(unittest.TestCase):
    def test_active_task_wins_conflicting_inherited_hint(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            session = home / "sessions/2026/09/29/rollout-task-123.jsonl"
            session.parent.mkdir(parents=True)
            session.write_text(json.dumps({"type": "turn_context", "payload": {"model": "gpt-6-sol"}}) + "\n")
            with patch.dict(os.environ, {"CODEX_HOME": directory, "CODEX_THREAD_ID": "task-123", "CODEX_SELECTED_MODEL": "gpt-6-astra"}, clear=True):
                self.assertEqual(selected_model(), "gpt-6-sol")

    def test_ephemeral_child_inherits_explicit_parent_model(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"CODEX_HOME": directory, "CODEX_THREAD_ID": "task-123", "CODEX_SELECTED_MODEL": "gpt-6-sol"}, clear=True):
                self.assertEqual(selected_model(), "gpt-6-sol")

    def test_standalone_cli_uses_configured_model(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "config.toml").write_text('model = "gpt-5.6-sol"\n')
            with patch.dict(os.environ, {"CODEX_HOME": directory}, clear=True):
                self.assertEqual(selected_model(), "gpt-5.6-sol")

    def test_unknown_model_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict(os.environ, {"CODEX_HOME": directory, "CODEX_THREAD_ID": "task-123"}, clear=True):
                with self.assertRaises(RuntimeError):
                    selected_model()

    def test_active_effort_wins_conflicting_inherited_hint_and_config(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory); session = home / "sessions/rollout-task-123.jsonl"
            session.parent.mkdir(); session.write_text(json.dumps({"type": "turn_context", "payload": {"effort": "xhigh"}}) + "\n")
            (home / "config.toml").write_text('model_reasoning_effort = "medium"\n')
            with patch.dict(os.environ, {"CODEX_HOME": directory, "CODEX_THREAD_ID": "task-123",
                                         "CODEX_SELECTED_REASONING_EFFORT": "low"}, clear=True):
                self.assertEqual(selected_reasoning_effort(), "xhigh")

    def test_latest_turn_unspecified_effort_remains_unset(self):
        with tempfile.TemporaryDirectory() as directory:
            session = Path(directory) / "sessions/rollout-task-123.jsonl"; session.parent.mkdir()
            session.write_text('\n'.join(json.dumps({"type": "turn_context", "payload": payload})
                                         for payload in [{"effort": "high"}, {"model": "gpt-6-sol"}]) + '\n')
            with patch.dict(os.environ, {"CODEX_HOME": directory, "CODEX_THREAD_ID": "task-123",
                                         "CODEX_SELECTED_REASONING_EFFORT": "low"}, clear=True):
                self.assertIsNone(selected_reasoning_effort())

    def test_effort_ephemeral_inheritance_and_standalone_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "config.toml").write_text('model_reasoning_effort = "xhigh"\n')
            with patch.dict(os.environ, {"CODEX_HOME": directory, "CODEX_THREAD_ID": "task-123",
                                         "CODEX_SELECTED_REASONING_EFFORT": "high"}, clear=True):
                self.assertEqual(selected_reasoning_effort(), "high")
            with patch.dict(os.environ, {"CODEX_HOME": directory}, clear=True):
                self.assertEqual(selected_reasoning_effort(), "xhigh")
            (Path(directory) / "config.toml").write_text('model = "gpt-6-sol"\n')
            with patch.dict(os.environ, {"CODEX_HOME": directory}, clear=True):
                self.assertIsNone(selected_reasoning_effort())

    def test_malformed_effort_and_thread_fail_closed(self):
        for value in ['', [], 3]:
            with self.subTest(value=value), tempfile.TemporaryDirectory() as directory:
                session = Path(directory) / "sessions/rollout-task-123.jsonl"; session.parent.mkdir()
                session.write_text(json.dumps({"type": "turn_context", "payload": {"effort": value}}) + '\n')
                with patch.dict(os.environ, {"CODEX_HOME": directory, "CODEX_THREAD_ID": "task-123"}, clear=True):
                    with self.assertRaises(RuntimeError):
                        selected_reasoning_effort()
        with patch.dict(os.environ, {"CODEX_THREAD_ID": "invalid/task"}, clear=True):
            with self.assertRaises(RuntimeError):
                selected_reasoning_effort()


if __name__ == "__main__":
    unittest.main()
