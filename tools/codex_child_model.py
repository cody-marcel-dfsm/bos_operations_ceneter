"""Resolve the model selected by the calling Codex task for child processes."""

from __future__ import annotations

import json
import os
from pathlib import Path
import tomllib


def selected_model() -> str:
    inherited = (os.environ.get("CODEX_SELECTED_MODEL") or "").strip()
    codex_home = Path(os.environ.get("CODEX_HOME") or Path.home() / ".codex")
    thread_id = os.environ.get("CODEX_THREAD_ID")
    if thread_id:
        if not all(character.isalnum() or character == "-" for character in thread_id):
            raise RuntimeError("Invalid CODEX_THREAD_ID; refusing to start a child model")
        sessions = sorted((codex_home / "sessions").rglob(f"*{thread_id}.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True)
        if sessions:
            model = None
            with sessions[0].open(encoding="utf-8") as session:
                for line in session:
                    if '"turn_context"' not in line:
                        continue
                    event = json.loads(line)
                    if event.get("type") == "turn_context":
                        candidate = event.get("payload", {}).get("model")
                        if isinstance(candidate, str) and candidate.strip():
                            model = candidate.strip()
            if model:
                return model
            raise RuntimeError("Active Codex task has no selected model; refusing to guess")
        if inherited:
            return inherited
        raise RuntimeError("Active Codex task session was not found; refusing to guess its model")

    if inherited:
        return inherited

    config_path = codex_home / "config.toml"
    if config_path.is_file():
        with config_path.open("rb") as config_file:
            model = tomllib.load(config_file).get("model")
        if isinstance(model, str) and model.strip():
            return model.strip()
    raise RuntimeError("No Codex task or configured model; refusing to start a child model")
