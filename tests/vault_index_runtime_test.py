"""The Vault index runs only in the project-local runtime Vault/index/venv (owner direction, 2026-11-16)."""
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools import vault_index  # noqa: E402

# The fixture names the contract itself, so it runs against any selector revision.
MARKER = "BOS_VAULT_INDEX_RUNTIME"
PROBE_SECONDS = 10


class Reexecuted(Exception):
    """Raised by the execve stand-in in place of replacing the test process."""


class ProjectRuntime(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.tmp = Path(folder.name)
        self.project = self.tmp / "bos_operations_center"
        self.runtime = self.project / "Vault/index/venv"
        self.interpreter = self.runtime / "bin/python"
        self.probes, self.execs = [], []
        self.patch(vault_index, "PROJECT_ROOT", self.project)
        self.patch(vault_index.os, "execve", self.execve)
        self.patch(vault_index.os, "execv", lambda path, argv: self.execve(path, argv, None))
        self.patch(vault_index.subprocess, "run", self.probe)
        self.answer = dict(stdout="3.13\n", returncode=0, error=None)
        environment = patch.dict(os.environ, {})
        environment.start()
        self.addCleanup(environment.stop)
        os.environ.pop(MARKER, None)
        os.environ.pop("VAULT_INDEX_PYTHON", None)

    def patch(self, target, name, value):
        patcher = patch.object(target, name, value)
        patcher.start()
        self.addCleanup(patcher.stop)

    def install(self, mode=0o755):
        self.interpreter.parent.mkdir(parents=True)
        self.interpreter.write_text("#!/bin/sh\n")
        self.interpreter.chmod(mode)

    def running(self, executable, prefix, version=(3, 13)):
        self.patch(vault_index.sys, "executable", str(executable))
        self.patch(vault_index.sys, "prefix", str(prefix))
        self.patch(vault_index.sys, "version_info", (*version, 0, "final", 0))

    def execve(self, path, argv, env):
        self.execs.append((path, argv, env))
        raise Reexecuted()

    def probe(self, argv, **options):
        self.probes.append((argv, options))
        if self.answer["error"] is not None:
            raise self.answer["error"]
        return subprocess.CompletedProcess(argv, self.answer["returncode"], self.answer["stdout"], "")

    def test_project_runtime_continues_in_place(self):
        self.install()
        for version in ((3, 12), (3, 13)):
            self.running(self.interpreter, self.runtime, version)
            vault_index.ensure_stable_chroma_runtime()
            os.environ[MARKER] = "1"
            vault_index.ensure_stable_chroma_runtime()
            os.environ.pop(MARKER)
        self.assertEqual((self.probes, self.execs), ([], []))

    def test_supported_external_interpreter_switches_to_the_project_runtime(self):
        self.install()
        external = self.tmp / "system/bin/python3.13"
        self.running(external, self.tmp / "system", (3, 13))
        os.environ["VAULT_INDEX_PYTHON"] = str(external)
        self.patch(vault_index.sys, "argv", ["vault_index.py", "sync", "--quiet", "--force-manifest"])
        with self.assertRaises(Reexecuted):
            vault_index.ensure_stable_chroma_runtime()
        resolved = str(self.interpreter.resolve())
        ((probe_argv, options),) = self.probes
        self.assertEqual(probe_argv[:2], [resolved, "-c"])
        self.assertEqual(options["timeout"], PROBE_SECONDS)
        self.assertGreater(options["timeout"], 0)
        self.assertNotEqual(options.get("shell"), True)
        ((path, argv, env),) = self.execs
        self.assertEqual(path, resolved)
        self.assertEqual(argv, [resolved, str(Path(vault_index.__file__).resolve()),
                                "sync", "--quiet", "--force-manifest"])
        self.assertEqual(env[MARKER], "1")

    def test_external_prefix_or_unsupported_version_inside_runtime_is_not_in_place(self):
        self.install()
        for executable, prefix, version in ((self.interpreter, self.tmp / "system", (3, 13)),
                                            (self.interpreter, self.runtime, (3, 14)),
                                            (self.interpreter, self.runtime, (3, 11))):
            self.probes.clear(); self.execs.clear()
            self.running(executable, prefix, version)
            with self.assertRaises(Reexecuted):
                vault_index.ensure_stable_chroma_runtime()
            self.assertEqual(len(self.probes), 1)

    def test_missing_escaping_or_unusable_runtime_is_rejected_before_probe(self):
        self.running(self.tmp / "system/bin/python3", self.tmp / "system", (3, 14))
        with self.assertRaisesRegex(RuntimeError, "not installed"):
            vault_index.ensure_stable_chroma_runtime()
        outside = self.tmp / "bos_operations_center-sibling/bin/python"
        outside.parent.mkdir(parents=True)
        outside.write_text("#!/bin/sh\n"); outside.chmod(0o755)
        self.interpreter.parent.mkdir(parents=True)
        self.interpreter.symlink_to(outside)
        with self.assertRaisesRegex(RuntimeError, "outside the project"):
            vault_index.ensure_stable_chroma_runtime()
        self.interpreter.unlink()
        self.interpreter.write_text("#!/bin/sh\n"); self.interpreter.chmod(0o644)
        with self.assertRaisesRegex(RuntimeError, "not executable"):
            vault_index.ensure_stable_chroma_runtime()
        self.assertEqual((self.probes, self.execs), ([], []))

    def test_runtime_directory_resolving_outside_the_project_is_never_in_place(self):
        external = self.tmp / "external-runtime"
        (external / "bin").mkdir(parents=True)
        (external / "bin/python").write_text("#!/bin/sh\n"); (external / "bin/python").chmod(0o755)
        self.runtime.parent.mkdir(parents=True)
        self.runtime.symlink_to(external, target_is_directory=True)
        self.running(external / "bin/python", external, (3, 13))
        with self.assertRaisesRegex(RuntimeError, "outside the project"):
            vault_index.ensure_stable_chroma_runtime()
        os.environ[MARKER] = "1"
        with self.assertRaisesRegex(RuntimeError, "not that runtime"):
            vault_index.ensure_stable_chroma_runtime()
        self.assertEqual((self.probes, self.execs), ([], []))

    def test_probe_failures_stop_with_a_provisioning_error(self):
        self.install()
        self.running(self.tmp / "system/bin/python3", self.tmp / "system", (3, 14))
        for answer in (dict(stdout="3.14\n"), dict(stdout="3.11\n"), dict(stdout="Python 3.13\n"),
                       dict(stdout=""), dict(returncode=1),
                       dict(error=OSError("exec format error")),
                       dict(error=subprocess.TimeoutExpired(["python"], 10))):
            self.answer = {**dict(stdout="3.13\n", returncode=0, error=None), **answer}
            with self.assertRaisesRegex(RuntimeError, "Vault/docs/operations/vault-index-runtime.md"):
                vault_index.ensure_stable_chroma_runtime()
        self.assertEqual(self.execs, [])
        self.assertEqual(len(self.probes), 7)

    def test_marked_process_outside_the_runtime_never_reexecutes_again(self):
        self.install()
        os.environ[MARKER] = "1"
        self.running(self.tmp / "system/bin/python3", self.tmp / "system", (3, 13))
        with self.assertRaisesRegex(RuntimeError, "not that runtime"):
            vault_index.ensure_stable_chroma_runtime()
        self.assertEqual((self.probes, self.execs), ([], []))

    def test_native_worker_keeps_its_argument_and_lock_descriptor(self):
        self.install()
        self.running(self.interpreter, self.runtime, (3, 13))
        lock = self.project / "Vault/index/sync.lock"
        self.patch(vault_index, "SYNC_LOCK_FILE", lock)
        launched = []

        def worker(argv, **options):
            launched.append((argv, options))
            return subprocess.CompletedProcess(argv, 0, "{}", "")

        self.patch(vault_index.subprocess, "run", worker)
        self.assertEqual(vault_index._native_operation(["sync"]), {})
        ((argv, options),) = launched
        self.assertEqual(argv[0], str(self.interpreter))
        self.assertEqual(argv[2], "--native-worker-lock-fd")
        self.assertEqual(options["pass_fds"], (int(argv[3]),))
        self.assertEqual(argv[4:], ["sync"])

    def test_provisioning_guide_keeps_dependencies_in_the_project(self):
        root = Path(__file__).resolve().parents[1]
        guide = (root / "Vault/docs/operations/vault-index-runtime.md")
        if not guide.exists():
            self.skipTest("private Vault documentation is not present in this checkout")
        text = guide.read_text().lower()
        for required in ("vault/index/venv/bin/python", "3.12", "3.13", "chromadb==1.5.9", "standalone cpython",
                         "standard library", "each machine", "conventional virtual environment"):
            self.assertIn(required, text)
        self.assertNotIn("export vault_index_python", text)


if __name__ == "__main__":
    unittest.main()
