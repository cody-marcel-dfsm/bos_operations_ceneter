"""Focused model-inheritance regression checks."""

import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from tools.codex_child_model import selected_model


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


if __name__ == "__main__":
    unittest.main()
