"""Deterministic proof for derived outputs: regenerate, byte-compare, fail closed.

Owner direction (Projects AGENTS.md, "Oracle review continuity — owner direction,
2026-10-15"): retain each validated file's content identity, review only deltas
and use content comparisons for review integrity. Outputs that are a pure
function of reviewed canonical sources are proven here by rerunning the
repository's own generator on the exact candidate and comparing every byte; the
model cohorts review only the canonical deltas. This module grants coverage only
through the native proof sealed in the review context, never through model output.
"""
from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile

KIND = "boc-deterministic-generated-proof-v1"
GENERATOR = ["npm", "run", "-s", "build:packages"]
GENERATOR_SECONDS = 300
_ZIP = re.compile(r"products/[^/]+/openai/[^/]+-skills\.zip")
_VERSION = re.compile(r'  version: "([0-9]+)\.([0-9]+)\.([0-9]+)"')
_REQUIRES = re.compile(r'  requires: "(.*)"')


def generated_path(path: str) -> bool:
    """The declared build:packages output namespace; everything else is canonical."""
    return (path.startswith("clients/") or path == "skill-release-manifest.json"
            or bool(_ZIP.fullmatch(path)))


def _git(root, *args, data=None, env=None):
    result = subprocess.run(["git", *args], cwd=root, input=data, capture_output=True, env=env)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace").strip() or "git failed")
    return result.stdout


def _inventory(root, tree):
    """path -> (mode, blob id) for every tracked entry of a tree."""
    rows = {}
    for line in _git(root, "ls-tree", "-r", "-z", "--full-tree", tree).split(b"\0"):
        if not line:
            continue
        meta, name = line.split(b"\t", 1)
        mode, kind, identity = meta.decode().split()
        rows[name.decode()] = (mode, identity)
    return rows


def _frontmatter(text):
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---\n", 4)
    return None if end < 0 else (text[4:end].split("\n"), text[end:])


def _metadata(text):
    """Parse name, version and exact requires; None for malformed or ambiguous metadata."""
    parts = _frontmatter(text)
    if parts is None:
        return None
    lines, _ = parts
    names = [line for line in lines if line.startswith("name: ")]
    versions = [index for index, line in enumerate(lines) if line.startswith("  version:")]
    requires = [index for index, line in enumerate(lines) if line.startswith("  requires:")]
    if len(names) != 1 or len(versions) != 1 or len(requires) != 1:
        return None
    version = _VERSION.fullmatch(lines[versions[0]])
    pins = _REQUIRES.fullmatch(lines[requires[0]])
    if version is None or pins is None:
        return None
    try:
        value = json.loads(pins.group(1).replace('\\"', '"'))
    except ValueError:
        return None
    if not isinstance(value, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in value.items()):
        return None
    rest = [line for index, line in enumerate(lines) if index not in {versions[0], requires[0]}]
    return {"name": names[0][6:], "version": tuple(int(item) for item in version.groups()),
            "requires": value, "rest": rest, "positions": (versions[0], requires[0])}


def metadata_only(old_text: str, new_text: str, versions: dict) -> bool:
    """True only for the mechanical version/requires change the release rules require."""
    old, new = _metadata(old_text), _metadata(new_text)
    if old is None or new is None:
        return False
    if (old["name"] != new["name"] or old["rest"] != new["rest"] or old["positions"] != new["positions"]
            or _frontmatter(old_text)[1] != _frontmatter(new_text)[1]):
        return False
    if new["version"] <= old["version"] or set(new["requires"]) != set(old["requires"]):
        return False
    return all(versions.get(name) == pin for name, pin in new["requires"].items())


def _extract(root, tree, target):
    archive = _git(root, "archive", "--format=tar", tree)
    with tarfile.open(fileobj=io.BytesIO(archive)) as bundle:
        for member in bundle.getmembers():
            name = PurePosixPath(member.name)
            if name.is_absolute() or ".." in name.parts or not (member.isfile() or member.isdir() or member.issym()):
                raise ValueError("Candidate archive contains an unsafe entry: " + member.name)
        bundle.extractall(target, filter="tar")


def _clear_generated(target):
    clients = target / "clients"
    if clients.is_dir() and not clients.is_symlink():
        for child in clients.iterdir():
            shutil.rmtree(child) if child.is_dir() and not child.is_symlink() else child.unlink()
    (target / "skill-release-manifest.json").unlink(missing_ok=True)
    for archive in target.glob("products/*/openai/*-skills.zip"):
        archive.unlink()


def _regenerated(root, target):
    """path -> (mode, blob id) for the regenerated export, read-only toward Git."""
    paths = []
    for directory, folders, files in os.walk(target):
        folders[:] = sorted(folders)
        for name in files:
            paths.append(Path(directory, name))
    rows = {}
    names = [str(path.relative_to(target)) for path in paths]
    if names:
        ids = _git(root, "hash-object", "--no-filters", "--stdin-paths",
                   data="\n".join(str(path) for path in paths).encode()).decode().split()
        for path, name, identity in zip(paths, names, ids):
            if path.is_symlink():
                mode, identity = "120000", _git(root, "hash-object", "--stdin",
                                                data=os.readlink(path).encode()).decode().strip()
            else:
                mode = "100755" if os.access(path, os.X_OK) else "100644"
            rows[name] = (mode, identity)
    return rows


def _skill_versions(root, tree, inventory):
    versions = {}
    for name in inventory:
        if name.startswith("source/") and name.endswith("/SKILL.md"):
            parsed = _metadata(_git(root, "show", f"{tree}:{name}").decode("utf-8", errors="replace"))
            if parsed is not None:
                versions[parsed["name"]] = ".".join(map(str, parsed["version"]))
    return versions


def prove(o, root, tree, baseline, required_paths, run_dir, *, generator=None, timeout=GENERATOR_SECONDS):
    """Regenerate the exact candidate and byte-compare; any difference raises."""
    root, run_dir = Path(root), Path(run_dir)
    generator = list(generator or GENERATOR)
    candidate = _inventory(root, tree)
    target = run_dir / "generated-proof" / "tree"
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    try:
        _extract(root, tree, target)
    except (RuntimeError, ValueError, tarfile.TarError) as exc:
        raise o.OracleApprovalError("Generated-output proof could not export the candidate: " + str(exc)) from exc
    _clear_generated(target)
    modules = root / "node_modules"
    link = target / "node_modules"
    if modules.is_dir() and not link.exists():
        link.symlink_to(modules, target_is_directory=True)
    environment = dict(os.environ, GIT_DIR=str(root / ".git"))
    environment.pop("GIT_WORK_TREE", None)
    environment.pop("GIT_INDEX_FILE", None)
    try:
        result = subprocess.run(generator, cwd=target, env=environment, capture_output=True, timeout=timeout,
                                stdin=subprocess.DEVNULL)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise o.OracleApprovalError("Generated-output proof generator did not complete: " + str(exc)) from exc
    log = run_dir / "generated-proof" / "generator.log"
    log.write_bytes(result.stdout + b"\n--- stderr ---\n" + result.stderr)
    if result.returncode:
        raise o.OracleApprovalError(f"Generated-output proof generator exited {result.returncode}; see {log}")
    if link.is_symlink():
        link.unlink()
    # Every regenerated file, including scratch output, joins the comparison:
    # nothing outside the candidate inventory is discarded before it is compared.
    regenerated = _regenerated(root, target)
    differing = sorted(name for name in set(candidate) | set(regenerated)
                       if candidate.get(name) != regenerated.get(name))
    if differing:
        shown = ", ".join(differing[:20]) + (f" and {len(differing) - 20} more" if len(differing) > 20 else "")
        raise o.OracleApprovalError("Generated outputs do not reproduce from canonical sources: " + shown)
    shutil.rmtree(target, ignore_errors=True)
    baseline_rows = _inventory(root, baseline)
    versions = _skill_versions(root, tree, candidate)
    generated, metadata = [], []
    for name in sorted(set(required_paths)):
        if generated_path(name):
            generated.append(name)
        elif (name.startswith("source/") and name.endswith("/SKILL.md") and name in candidate
              and name in baseline_rows and candidate[name][0] == baseline_rows[name][0]
              and metadata_only(_git(root, "show", f"{baseline}:{name}").decode("utf-8", errors="replace"),
                                _git(root, "show", f"{tree}:{name}").decode("utf-8", errors="replace"),
                                versions)):
            metadata.append(name)
    canonical = {name: value for name, value in candidate.items() if not generated_path(name)}
    digest = lambda value: hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()
    runtime = {"python": sys.version.split()[0]}
    for tool in ("node", "npm"):
        try:
            runtime[tool] = subprocess.run([tool, "--version"], capture_output=True, text=True,
                                           timeout=30).stdout.strip()
        except (OSError, subprocess.TimeoutExpired):
            runtime[tool] = None
    return {"kind": KIND, "candidate_tree": tree, "baseline_commit": baseline, "generator": generator,
            "generator_exit_code": result.returncode, "runtime": runtime,
            "generator_inputs_sha256": digest(canonical), "regenerated_inventory_sha256": digest(regenerated),
            "generated_paths": generated, "metadata_paths": metadata, "grants_model_coverage": False}


def covered_paths(context) -> set:
    """Paths covered by a native proof bound to this exact candidate; otherwise none."""
    proof = context.get("deterministic_coverage")
    if (not isinstance(proof, dict) or proof.get("kind") != KIND
            or proof.get("candidate_tree") != context.get("candidate_tree")
            or proof.get("generator_exit_code") != 0):
        return set()
    generated = [name for name in proof.get("generated_paths", []) if isinstance(name, str) and generated_path(name)]
    metadata = [name for name in proof.get("metadata_paths", []) if isinstance(name, str)
                and name.startswith("source/") and name.endswith("/SKILL.md")]
    return set(generated) | set(metadata)


def generator_declared(root, tree) -> bool:
    """Only a candidate declaring the package generator can prove derived outputs."""
    try:
        manifest = json.loads(_git(root, "show", f"{tree}:package.json"))
    except (RuntimeError, ValueError):
        return False
    return isinstance(manifest, dict) and isinstance(manifest.get("scripts"), dict) and \
        isinstance(manifest["scripts"].get("build:packages"), str)


def applies(paths) -> bool:
    return any(generated_path(name) or (name.startswith("source/") and name.endswith("/SKILL.md")) for name in paths)
