#!/usr/bin/env python3
"""Create a deterministic, self-contained macOS customer installation ZIP."""

from __future__ import annotations

import hashlib
import json
import shutil
import stat
import tempfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def payload_manifest(root: Path) -> dict:
    files = []
    for path in sorted(root.rglob("*")):
        if path.is_file():
            files.append(
                {
                    "path": path.relative_to(root).as_posix(),
                    "sha256": sha256(path),
                }
            )
    return {"schema_version": "1", "files": files}


def add_file(archive: zipfile.ZipFile, path: Path, name: str) -> None:
    info = zipfile.ZipInfo(name, FIXED_ZIP_TIME)
    mode = (
        0o755
        if path.name.endswith(".sh") or path.name == "bos-mcp-broker"
        else 0o644
    )
    info.external_attr = (stat.S_IFREG | mode) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(info, path.read_bytes())


def main() -> None:
    package = json.loads((ROOT / "package.json").read_text())
    version = package["version"]
    DIST.mkdir(parents=True, exist_ok=True)
    destination = DIST / f"bos-operations-center-macos-{version}.zip"
    stable_destination = DIST / "bos-operations-center-macos.zip"

    with tempfile.TemporaryDirectory(prefix="bos-customer-zip-") as temporary:
        stage = Path(temporary) / "bos-operations-center"
        marketplace = stage / "marketplace"
        shutil.copytree(ROOT / "clients" / "codex", marketplace)
        broker = ROOT / "tmp" / "macos-broker" / "dist" / "bos-mcp-broker"
        if not broker.is_file():
            raise SystemExit(
                "Missing self-contained broker. Run scripts/build_macos_broker.sh."
            )
        broker_target = marketplace / "plugins" / "bos" / "bin" / "bos-mcp-broker"
        broker_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(broker, broker_target)
        (marketplace / "plugins" / "bos" / ".mcp.json").write_text(
            json.dumps(
                {
                    "mcpServers": {
                        "bos": {
                            "command": "./bin/bos-mcp-broker",
                            "args": [],
                            "cwd": ".",
                            "required": False,
                        }
                    }
                },
                indent=2,
            )
            + "\n"
        )
        shutil.rmtree(
            marketplace / "plugins" / "bos" / "scripts",
            ignore_errors=True,
        )
        shutil.copy2(ROOT / "installer" / "macos" / "install.sh", stage)
        shutil.copy2(ROOT / "installer" / "macos" / "README_INSTALL.md", stage)
        manifest = payload_manifest(stage)
        (stage / "PAYLOAD_MANIFEST.json").write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n"
        )

        with zipfile.ZipFile(destination, "w") as archive:
            for path in sorted(stage.rglob("*")):
                if path.is_file():
                    add_file(
                        archive,
                        path,
                        (Path(stage.name) / path.relative_to(stage)).as_posix(),
                    )
        shutil.copy2(destination, stable_destination)

    print(
        json.dumps(
            {
                "file": destination.name,
                "sha256": sha256(destination),
                "stable_file": stable_destination.name,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
