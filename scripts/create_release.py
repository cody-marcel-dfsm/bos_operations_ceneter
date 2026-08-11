#!/usr/bin/env python3
"""Create deterministic product/client archives and checksums."""

from __future__ import annotations

import gzip
import hashlib
import io
import json
import tarfile
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"


def add_tree(archive: tarfile.TarFile, source: Path, prefix: str) -> None:
    for path in sorted(source.rglob("*")):
        if path.is_dir() or "__pycache__" in path.parts:
            continue
        relative = path.relative_to(source)
        info = archive.gettarinfo(str(path), arcname=str(Path(prefix) / relative))
        info.uid = 0
        info.gid = 0
        info.uname = ""
        info.gname = ""
        info.mtime = 0
        with path.open("rb") as handle:
            archive.addfile(info, handle)


def create_archive(source: Path, destination: Path, prefix: str) -> None:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w", format=tarfile.PAX_FORMAT) as tar:
        add_tree(tar, source, prefix)
    with destination.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0) as zipped:
            zipped.write(buffer.getvalue())


def create_zip(source: Path, destination: Path, prefix: str) -> None:
    with zipfile.ZipFile(destination, "w") as archive:
        for path in sorted(source.rglob("*")):
            if path.is_dir() or "__pycache__" in path.parts or path.suffix == ".pyc":
                continue
            relative = path.relative_to(source)
            info = zipfile.ZipInfo((Path(prefix) / relative).as_posix(), (1980, 1, 1, 0, 0, 0))
            info.external_attr = (0o100644 << 16)
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    DIST.mkdir(parents=True, exist_ok=True)
    for old in DIST.glob("*.tar.gz"):
        old.unlink()
    for old in DIST.glob("*-claude*.zip"):
        old.unlink()

    releases = []
    for product_file in sorted((ROOT / "products").glob("*/product.json")):
        product = json.loads(product_file.read_text())
        if product.get("release_status") == "disabled":
            continue
        name = product["name"]
        version = product["version"]
        roots = {
            "codex": ROOT / "clients" / "codex" / "plugins" / name,
            "claude": ROOT / "clients" / "claude" / "plugins" / name,
            "copilot": ROOT / "clients" / "copilot" / "products" / name,
            "gemini": ROOT / "clients" / "gemini" / "extensions" / name,
        }
        for client in product["clients"]:
            source = roots[client]
            if client == "claude":
                destination = DIST / f"{name}-{client}.zip"
                create_zip(source, destination, name)
            else:
                destination = DIST / f"{name}-{client}-{version}.tar.gz"
                create_archive(source, destination, name)
            releases.append(
                {
                    "product": name,
                    "client": client,
                    "version": version,
                    "file": destination.name,
                    "sha256": sha256(destination),
                }
            )

    manifest = {
        "schema_version": "1",
        "archives": releases,
    }
    (DIST / "release-manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n"
    )
    print(f"Created {len(releases)} deterministic release archives.")


if __name__ == "__main__":
    main()
