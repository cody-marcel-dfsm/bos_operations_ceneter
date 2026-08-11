#!/usr/bin/env python3
"""Create a deterministic, cross-platform customer distribution ZIP."""

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
    mode = 0o644
    info.external_attr = (stat.S_IFREG | mode) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(info, path.read_bytes())


def main() -> None:
    DIST.mkdir(parents=True, exist_ok=True)
    for old in DIST.glob("bos-operations-center*.zip"):
        old.unlink()
    destination = DIST / "bos-operations-center.zip"
    version = json.loads((ROOT / "package.json").read_text())["version"]
    versioned_destination = DIST / f"bos-operations-center-{version}.zip"

    with tempfile.TemporaryDirectory(prefix="bos-customer-zip-") as temporary:
        stage = Path(temporary) / "bos-operations-center"
        shutil.copytree(ROOT / "clients", stage / "clients")
        shutil.copy2(ROOT / "installer" / "README_INSTALL.md", stage)
        (stage / "scripts").mkdir()
        shutil.copy2(
            ROOT / "scripts" / "launch-codex-with-bos.swift",
            stage / "scripts" / "launch-codex-with-bos.swift",
        )
        shutil.copy2(
            ROOT / "scripts" / "install-package.mjs",
            stage / "scripts" / "install-package.mjs",
        )
        shutil.copy2(
            ROOT / "scripts" / "install-claude-local.mjs",
            stage / "scripts" / "install-claude-local.mjs",
        )
        (stage / "scripts" / "lib").mkdir()
        shutil.copy2(
            ROOT / "scripts" / "lib" / "package-model.mjs",
            stage / "scripts" / "lib" / "package-model.mjs",
        )
        shutil.copy2(
            ROOT / "scripts" / "lib" / "codex-layout.mjs",
            stage / "scripts" / "lib" / "codex-layout.mjs",
        )
        extension_script = (
            stage
            / "source"
            / "platform"
            / "manage-customer-extension"
            / "scripts"
        )
        extension_script.mkdir(parents=True)
        shutil.copy2(
            ROOT
            / "source"
            / "platform"
            / "manage-customer-extension"
            / "scripts"
            / "manage-extension.mjs",
            extension_script / "manage-extension.mjs",
        )
        (stage / "package.json").write_text(
            json.dumps(
                {
                    "name": "bos-operations-center-installer",
                    "version": version,
                    "private": True,
                    "type": "module",
                    "scripts": {
                        "install:inspect": "node scripts/install-package.mjs inspect",
                        "install:plan": "node scripts/install-package.mjs plan",
                        "install:apply": "node scripts/install-package.mjs apply",
                        "install:verify": "node scripts/install-package.mjs verify",
                        "install:claude": "node scripts/install-claude-local.mjs",
                    },
                },
                indent=2,
                sort_keys=True,
            )
            + "\n"
        )
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
    shutil.copyfile(destination, versioned_destination)
    print(
        json.dumps(
            {
                "files": [
                    {"file": versioned_destination.name, "sha256": sha256(versioned_destination)},
                    {"file": destination.name, "sha256": sha256(destination)},
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
