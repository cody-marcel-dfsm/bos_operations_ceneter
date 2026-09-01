"""Canonical repository paths for generated and temporary artifacts."""

from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
VAULT_TMP = PROJECT_ROOT / "Vault" / "tmp"


def vault_workflow_tmp(workflow: str) -> Path:
    """Return and create a workflow-scoped Vault cache directory."""
    if not workflow or workflow in {".", ".."} or "/" in workflow or "\\" in workflow:
        raise ValueError("workflow must be one safe path component")
    path = VAULT_TMP / workflow
    path.mkdir(parents=True, exist_ok=True)
    return path
