"""Process-bound native review observation and committed-candidate continuation.

Admission is an append-only chain of immutable process records. Atomic hard-link
publication chooses one live controller; it never reserves source or review work.
The private socket only observes that controller and supplies hashed evidence.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import queue
import signal
import shlex
import socket
import stat
import subprocess
import threading
import time
import uuid

_LIVE = {}


def process_identity(pid):
    result = subprocess.run(["ps", "-p", str(pid), "-o", "lstart=,comm="],
                            capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else None


def process_birth(pid):
    result = subprocess.run(["ps", "-p", str(pid), "-o", "lstart="], capture_output=True, text=True)
    return " ".join(result.stdout.split()) if result.returncode == 0 else None


def _reviewer_group(record):
    """The gated launch creates one new OS session before native execution."""
    result = subprocess.run(["ps", "-ax", "-o", "pid=,pgid=,lstart=,stat="], capture_output=True, text=True)
    members = []
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) != 8 or not fields[0].isdigit() or not fields[1].isdigit():
            continue
        pid, group = int(fields[0]), int(fields[1])
        if group != record["process_group"]:
            continue
        birth = " ".join(fields[2:7])
        if pid == record["pid"] and birth != record["process_birth"]:
            # A reused leader PID identifies a later OS group. Its lifetime is
            # outside this registration; never observe or terminate that group.
            return []
        if not fields[7].startswith("Z"):
            members.append({"pid": pid, "process_birth": birth})
    return members


def _active_children(o, root, identity):
    directory = Path(identity["directory"]) / "children"
    if not directory.exists():
        return []
    o._metadata_directory(root, directory)
    active = []
    for path in sorted(p for p in directory.glob("reviewer-*.json")
                       if o.re.fullmatch(r"reviewer-[0-9a-f]{32}\.json", p.name)):
        raw = o._custody_read(root, path)[1]
        record = json.loads(raw)
        payload = {key: value for key, value in record.items() if key != "record_sha256"}
        if (raw != o._pretty(record) or record.get("record_sha256") != o._sha(o._canonical(payload))
                or record.get("root") != str(root) or record.get("controller_id") != identity["controller_id"]
                or record.get("owner_identity_sha256") != o._sha(o._pretty(identity))
                or record.get("process_group") != record.get("pid") or not record.get("process_birth")
                or not isinstance(record.get("pid"), int) or record["pid"] <= 0
                or record.get("evidence") != o._files(root, list(record.get("evidence", {})))):
            raise o.OracleApprovalError("Registered native reviewer custody changed")
        try:
            members = _reviewer_group(record)
        except ValueError as exc:
            raise o.OracleApprovalError(str(exc)) from exc
        if members:
            active.append({"registration": str(path), "record_sha256": record["record_sha256"],
                           "pid": record["pid"], "process_group": record["process_group"],
                           "process_birth": record["process_birth"], "members": members})
    return active


def reviewer_process(o, root, run, command, environment, controller):
    # The shell waits for its private stdin acknowledgement. Parent loss before
    # immutable registration closes that pipe and cannot start a reviewer.
    token = uuid.uuid4().hex
    gate = 'IFS= read -r token || exit 70; [ "$token" = "$1" ] || exit 70; shift; exec "$@"'
    process = subprocess.Popen(["/bin/sh", "-c", gate, "native-reviewer", token, *command],
                               cwd=root, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.PIPE, text=True, env=environment, start_new_session=True)
    path = controller.directory / "children" / ("reviewer-" + uuid.uuid4().hex + ".json")
    try:
        birth = process_birth(process.pid)
        if not birth or os.getpgid(process.pid) != process.pid:
            raise o.OracleApprovalError("Native reviewer could not establish its own process group")
        payload = {"kind": "boc-native-reviewer-process-v1", "root": str(root),
                   "controller_id": controller.identity["controller_id"],
                   "owner_identity_sha256": o._sha(o._pretty(controller.identity)),
                   "pid": process.pid, "process_group": process.pid, "process_birth": birth,
                   "run": str(run), "command_sha256": o._sha(o._canonical(command)),
                   "evidence": o._files(root, [str(run / "model.json"), str(run / "request.txt")])}
        record = dict(payload, record_sha256=o._sha(o._canonical(payload)))
        _publish(o, root, path, record)
        stdout, stderr = process.communicate(input=token + "\n")
        _active_children(o, root, controller.identity)
        _publish(o, root, path.with_suffix(".outcome.json"),
                 {"record_sha256": record["record_sha256"], "exit_code": process.returncode})
        completed = subprocess.CompletedProcess(command, process.returncode, stdout, stderr)
        completed.native_registration = {"path": str(path), "sha256": o._custody_read(root, path)[0]["sha256"]}
        return completed
    except BaseException as exc:
        try:
            if process.poll() is None or ("record" in locals() and _reviewer_group(record)):
                os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            stdout, stderr = process.communicate(timeout=2)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate(timeout=2)
        _publish(o, root, path.with_suffix(".failure.json"),
                 {"error_type": type(exc).__name__, "error": str(exc), "exit_code": process.returncode})
        o._atomic_write(run / "stdout.log", stdout.encode())
        o._atomic_write(run / "stderr.log", stderr.encode())
        raise


_RETRY = object()


def _wait_orphan(o, root, identity):
    while _active_children(o, root, identity):
        time.sleep(.1)
    if _terminal(o, root, identity) is None:
        _finish(o, root, identity, {"status": "ERROR", "error_type": "OracleApprovalError",
                                  "error": "Native controller process exited before its outcome; original evidence retained"})
    return _RETRY


def _head(o, root):
    result = subprocess.run(["git", "rev-parse", "--verify", "HEAD"], cwd=root,
                            capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else None


def _alive(identity):
    # Intentional producer exec preserves kernel birth while the launcher/comm
    # field can change. Socket token, immutable identity and inherited FD retain
    # the invocation's role; a recycled PID has a different birth.
    expected = identity.get("process_birth") or " ".join(identity["process_identity"].split()[:5])
    if process_birth(identity["pid"]) != expected:
        return False
    if identity["pid"] == os.getpid():
        return identity["controller_id"] in _LIVE
    return True


def legacy_active(o, root):
    """Observe only a native predecessor holding its old admission descriptor.

    New starters never open that descriptor, so they cannot be mistaken for a
    predecessor. argv is inspected only for the Python CLI phase, never emitted.
    """
    path = o.receipt_path(root).parent / "review.lock"
    if not path.exists():
        return None
    o._custody_read(root, path)
    found = subprocess.run(["lsof", "-t", str(path)], capture_output=True, text=True)
    for value in found.stdout.splitlines():
        if not value.isdecimal() or int(value) == os.getpid():
            continue
        pid = int(value)
        birth = process_identity(pid)
        cwd = subprocess.run(["lsof", "-a", "-p", value, "-d", "cwd", "-Fn"],
                             capture_output=True, text=True)
        if "n" + str(root) not in cwd.stdout.splitlines() or not birth:
            continue
        command = subprocess.run(["ps", "-p", value, "-o", "command="], capture_output=True, text=True)
        argv = shlex.split(command.stdout)
        if (len(argv) < 3 or (root / argv[1]).resolve() != root / "tools/oracle_approval.py"
                or argv[2] not in {"review", "proposal"}):
            continue
        born = subprocess.run(["ps", "-p", value, "-o", "lstart="], capture_output=True, text=True)
        birth_seconds = o.datetime.strptime(born.stdout.strip(), "%a %b %d %H:%M:%S %Y").astimezone().timestamp()
        phase = "issue" if argv[2] == "review" else "review_proposal"
        runs = o.receipt_path(root).parent / "runs"
        candidates = [p for p in runs.iterdir() if p.name.startswith(phase + "-")
                      and p.stat().st_ctime >= birth_seconds - 1 and not (p / "outcome.json").exists()]
        if len(candidates) != 1:
            raise o.OracleApprovalError("Legacy native owner has ambiguous invocation custody")
        run = candidates[0]
        model = run / "model.json"
        request = run / "request.txt"
        if not model.is_file() or not request.is_file():
            raise o.OracleApprovalError("Legacy native owner preparation is not yet observable")
        return {"state": "REVIEW_IN_PROGRESS", "attempt": str(run), "legacy": True,
                "identity": {"root": str(root), "review_kind": phase, "pid": pid,
                             "process_identity": birth, "invocation_sha256": o._sha(command.stdout.encode()),
                             "request_sha256": o._custody_read(root, request)[0]["sha256"],
                             "model_sha256": o._custody_read(root, model)[0]["sha256"]}}
    return None


def _follow_legacy(o, root, record, kind):
    identity = record["identity"]
    if identity["review_kind"] != kind:
        raise o.OracleApprovalError("A different native review phase is still running; original owner retained")
    path = o._metadata_run(root, o.receipt_path(root).parent / "legacy-observations", "observation-")
    _publish(o, root, path / "identity.json", record)
    while process_identity(identity["pid"]) == identity["process_identity"]:
        time.sleep(.2)
    run = Path(record["attempt"])
    outcome = _read(o, root, run / "outcome.json") if (run / "outcome.json").exists() else {
        "outcome": "ERROR", "error": {"message": "Legacy native process exited without a terminal outcome"}}
    _publish(o, root, path / "observed-outcome.json", outcome)
    if kind == "issue" and outcome["outcome"] == "APPROVED":
        try:
            if o.__package__:
                from . import shipment_state
            else:
                import shipment_state
            return shipment_state.validated_receipt(root)[0]
        except o.OracleApprovalError:
            pass  # Genuine historical success remains supporting after movement.
    context = run / "review-context.json"
    if context.exists():
        prior = _read(o, root, context)
        if (prior.get("base_commit") == o._git(root, "rev-parse", "HEAD").strip()
                and outcome["outcome"] != "APPROVED"):
            exception = {"REJECTED": o.OracleCandidateRejected, "INCOMPLETE": o.OracleReviewIncomplete}.get(outcome["outcome"], o.OracleApprovalError)
            raise exception("Observed original native " + outcome["outcome"] + "; evidence retained at " + str(run))
    return None


def _read(o, root, path):
    return json.loads(o._custody_read(root, path)[1])


def _publish(o, root, path, value):
    raw = o._pretty(value)
    if path.exists():
        if o._custody_read(root, path)[1] != raw:
            raise o.OracleApprovalError("Immutable controller record changed")
        return o._sha(raw)
    temporary = path.parent / (".publish-" + uuid.uuid4().hex)
    o._atomic_write(temporary, raw)
    directory = o._private_directory_fd(root, path.parent, (".git", "oracle"))
    try:
        try:
            os.link(temporary.name, path.name, src_dir_fd=directory, dst_dir_fd=directory, follow_symlinks=False)
        except FileExistsError:
            if o._custody_read(root, path)[1] != raw:
                raise o.OracleApprovalError("Immutable controller record changed")
    finally:
        os.unlink(temporary.name, dir_fd=directory)
        os.close(directory)
    return o._sha(raw)


def _admissions(o, root, kind="issue", series=None):
    if not o.re.fullmatch(r"[a-z_]+", kind):
        raise o.OracleApprovalError("Native controller kind is invalid")
    # Proposal/authorization assessment remains independent of the live source
    # reviewer. Each kind retains its own append-only admission chain.
    name = "admissions" if kind == "issue" else kind + "-" + o._sha(str(series).encode())[:24] + "-admissions"
    return o.receipt_path(root).parent / "controllers" / name


def _last(o, root, kind="issue", series=None):
    directory = _admissions(o, root, kind, series)
    if not directory.exists():
        return None, 0
    o._metadata_directory(root, directory)
    names = sorted(directory.iterdir())
    previous = None
    for number, path in enumerate(names, 1):
        if path.name != f"{number:08d}.json":
            raise o.OracleApprovalError("Controller admission chain is incomplete")
        raw = o._custody_read(root, path)[1]
        record = json.loads(raw)
        if (record.get("kind") != "boc-review-controller-v1" or record.get("root") != str(root)
                or record.get("previous_sha256") != previous):
            raise o.OracleApprovalError("Controller admission identity changed")
        identifier = record.get("controller_id", "")
        endpoint = record.get("endpoint")
        endpoint_valid = (isinstance(endpoint, dict) and endpoint.get("host") == "127.0.0.1"
                          and isinstance(endpoint.get("port"), int) and 0 < endpoint["port"] < 65536
                          and bool(record.get("owner_token")))
        if isinstance(endpoint, str):
            endpoint_valid = (Path(endpoint).parent == o.receipt_path(root).parent
                              and bool(o.re.fullmatch(r"s-[0-9a-f]{16}", Path(endpoint).name)))
        if (not o.re.fullmatch(r"controller-[0-9a-f]{32}", identifier)
                or record.get("directory") != str(directory.parent / identifier)
                or not isinstance(record.get("pid"), int) or record["pid"] <= 0
                or not record.get("process_identity")
                or not endpoint_valid
                or o._custody_read(root, Path(record["directory"]) / "identity.json")[1] != raw):
            raise o.OracleApprovalError("Controller process or original invocation custody changed")
        previous = o._sha(raw)
    return (record, len(names)) if names else (None, 0)


def _terminal(o, root, identity):
    path = Path(identity["directory"]) / "terminal.json"
    if not path.exists():
        return None
    result = _read(o, root, path)
    payload = {k: v for k, v in result.items() if k != "terminal_sha256"}
    if (result.get("controller_id") != identity["controller_id"]
            or ((identity.get("terminal_seal") or "terminal_sha256" in result)
                and result.get("terminal_sha256") != o._sha(o._canonical(payload)))):
        raise o.OracleApprovalError("Controller outcome has foreign identity")
    return result


def _finish(o, root, identity, value):
    payload = dict(value, controller_id=identity["controller_id"])
    return _publish(o, root, Path(identity["directory"]) / "terminal.json",
                    dict(payload, terminal_sha256=o._sha(o._canonical(payload))))


def _request(o, root, identity, request):
    endpoint = identity["endpoint"]
    if isinstance(endpoint, str):
        path = Path(endpoint)
        o._metadata_directory(root, path.parent)
        info = path.lstat()
        if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
            raise o.OracleApprovalError("Controller observation endpoint is foreign")
        family, address = socket.AF_UNIX, endpoint
    else:
        family, address = socket.AF_INET, (endpoint["host"], endpoint["port"])
    with socket.socket(family, socket.SOCK_STREAM) as client:
        client.settimeout(2)
        client.connect(address)
        client.sendall(o._canonical(dict(request, controller_id=identity["controller_id"],
                                        owner_token=identity.get("owner_token"))) + b"\n")
        raw = b""
        while not raw.endswith(b"\n") and len(raw) <= 131072:
            block = client.recv(8192)
            if not block:
                break
            raw += block
    response = json.loads(raw)
    if response.get("controller_id") != identity["controller_id"]:
        raise o.OracleApprovalError("Controller observation response is foreign")
    return response


def active(o, root):
    identity, _ = _last(o, root)
    if not identity or _terminal(o, root, identity):
        return legacy_active(o, root)
    if not _alive(identity):
        children = _active_children(o, root, identity)
        if children:
            return {"state": "REVIEW_IN_PROGRESS", "identity": {k: v for k, v in identity.items() if k != "owner_token"},
                    "orphaned_children": children, "attempt": None,
                    "reason": "Observe the interrupted owner's live registered reviewer groups"}
        return None
    try:
        return _request(o, root, identity, {"operation": "observe"})
    except (OSError, ValueError) as exc:
        if _terminal(o, root, identity):
            return None
        if not _alive(identity):
            children = _active_children(o, root, identity)
            if children:
                return {"state": "REVIEW_IN_PROGRESS", "identity": {k: v for k, v in identity.items() if k != "owner_token"},
                        "orphaned_children": children, "attempt": None}
            return None
        raise o.OracleApprovalError("Live controller observation failed; original owner retained") from exc


class Controller:
    def __init__(self, o, root, kind, series):
        self.o, self.root = o, root
        parent = o.receipt_path(root).parent
        resume = os.environ.pop("BOC_NATIVE_CONTROLLER_RELOAD", None)
        inherited_fd = os.environ.pop("BOC_NATIVE_CONTROLLER_FD", None)
        inherited_token = os.environ.pop("BOC_NATIVE_CONTROLLER_TOKEN", None)
        self.resumed = resume is not None
        self.resumed_evidence = []
        if self.resumed:
            state = _read(o, root, Path(resume))
            self.identity, _ = _last(o, root, kind, series)
            if (not self.identity or state.get("controller_id") != self.identity["controller_id"]
                    or self.identity["pid"] != os.getpid()
                    or (self.identity.get("process_birth") or " ".join(self.identity["process_identity"].split()[:5])) != process_birth(os.getpid())
                    or self.identity["review_kind"] != kind or self.identity["series_id"] != series
                    or self.identity["owner_token"] != inherited_token
                    or self.identity.get("listener_fd", int(inherited_fd)) != int(inherited_fd)
                    or state.get("owner_identity_sha256") != o._sha(o._pretty(self.identity))
                    or self.identity["reviewer_settings"] != o._review_settings_binding()
                    or _terminal(o, root, self.identity)):
                raise o.OracleApprovalError("Native producer reload lost its original process/owner identity")
            self.directory = Path(self.identity["directory"])
            if Path(resume).parent != self.directory:
                raise o.OracleApprovalError("Native producer reload left its original owner directory")
            endpoint = self.identity["endpoint"]
            self.endpoint = endpoint if isinstance(endpoint, str) else (endpoint["host"], endpoint["port"])
            self.socket = socket.socket(fileno=int(inherited_fd))
            self.socket.set_inheritable(False)
            if (self.socket.getsockname() != self.endpoint
                    or self.socket.getsockopt(socket.SOL_SOCKET, socket.SO_TYPE) != socket.SOCK_STREAM):
                raise o.OracleApprovalError("Native producer reload has a foreign observation socket")
            self.socket.listen(16)
            if o._files(root, list(state["evidence"])) != state["evidence"]:
                raise o.OracleApprovalError("Native producer reload evidence custody changed")
            self.resumed_evidence = list(state["evidence"])
        else:
            self._create(parent, kind, series)
        self.socket.settimeout(.2)
        self.pending = queue.Queue()
        self.stop = threading.Event()
        self.progress = {"state": "REVIEW_IN_PROGRESS", "attempt": None}
        self.producer_paths = [name for name in o.REVIEW_POLICY_MODULES if (root / name).is_file()]
        self.producer = o._files(root, self.producer_paths)
        _LIVE[self.identity["controller_id"]] = self

    def _create(self, parent, kind, series):
        o, root = self.o, self.root
        self.directory = o._metadata_run(root, parent / "controllers", "controller-")
        # Kernel-assigned loopback endpoints avoid pathname mutation/cleanup
        # races. Every request proves the private process-bound owner token.
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.bind(("127.0.0.1", 0))
        self.endpoint = self.socket.getsockname()
        self.socket.listen(16)
        self.socket.settimeout(.2)
        self.identity = {"kind": "boc-review-controller-v1", "root": str(root),
                         "controller_id": self.directory.name, "directory": str(self.directory),
                         "endpoint": {"host": self.endpoint[0], "port": self.endpoint[1]}, "pid": os.getpid(),
                         "listener_fd": self.socket.fileno(),
                         "owner_token": uuid.uuid4().hex,
                         "terminal_seal": True,
                         "process_identity": process_identity(os.getpid()), "review_kind": kind,
                         "process_birth": process_birth(os.getpid()),
                         "series_id": series, "reviewer_settings": o._review_settings_binding(),
                         "started_at": o.datetime.now(o.timezone.utc).isoformat(),
                         "original_review_started_at": os.environ.get("ORACLE_REVIEW_STARTED_AT"),
                         "original_release_started_at": os.environ.get("SHIP_IT_STARTED_AT")}

    def reload(self, evidence):
        self.stop.set()
        self.thread.join(2)
        if self.thread.is_alive():
            raise self.o.OracleApprovalError("Native producer observation thread did not quiesce")
        evidence = list(dict.fromkeys([*evidence, *self.evidence()]))
        state = {"controller_id": self.identity["controller_id"],
                 "owner_identity_sha256": self.o._sha(self.o._pretty(self.identity)),
                 "evidence": self.o._files(self.root, evidence),
                 "previous_producer": self.producer,
                 "current_producer": self.o._files(self.root, self.producer_paths)}
        path = self.directory / ("reload-" + uuid.uuid4().hex + ".json")
        _publish(self.o, self.root, path, state)
        self.socket.set_inheritable(True)
        environment = dict(os.environ, BOC_NATIVE_CONTROLLER_RELOAD=str(path),
                           BOC_NATIVE_CONTROLLER_FD=str(self.socket.fileno()),
                           BOC_NATIVE_CONTROLLER_TOKEN=self.identity["owner_token"])
        # exec preserves kernel process birth, the elected owner and listener.
        os.execve(os.sys.executable, [os.sys.executable, str(self.root / "tools/oracle_approval.py"),
                                     *os.sys.argv[1:]], environment)

    def claim(self):
        o, root = self.o, self.root
        if self.resumed:
            self.thread = threading.Thread(target=self.serve, daemon=True)
            self.thread.start()
            return None
        previous, count = _last(o, root, self.identity["review_kind"], self.identity["series_id"])
        if previous and not _terminal(o, root, previous) and _alive(previous):
            return previous
        if previous and _active_children(o, root, previous):
            return previous
        if previous and not _terminal(o, root, previous):
            _finish(o, root, previous, {"status": "ERROR", "error_type": "OracleApprovalError",
                                      "error": "Native controller process exited before its outcome; original evidence retained"})
        self.identity["previous_sha256"] = o._sha(o._pretty(previous)) if previous else None
        identity_path = self.directory / "identity.json"
        _publish(o, root, identity_path, self.identity)
        admissions = _admissions(o, root, self.identity["review_kind"], self.identity["series_id"])
        o._metadata_directory(root, admissions)
        source = o._private_directory_fd(root, self.directory, (".git", "oracle"))
        target = o._private_directory_fd(root, admissions, (".git", "oracle"))
        try:
            os.link(identity_path.name, f"{count + 1:08d}.json", src_dir_fd=source,
                    dst_dir_fd=target, follow_symlinks=False)
        except FileExistsError:
            return _last(o, root, self.identity["review_kind"], self.identity["series_id"])[0]
        finally:
            os.close(source); os.close(target)
        self.thread = threading.Thread(target=self.serve, daemon=True)
        self.thread.start()
        return None

    def serve(self):
        while not self.stop.is_set():
            try:
                client, _ = self.socket.accept()
            except socket.timeout:
                continue
            except OSError:
                return
            with client:
                try:
                    client.settimeout(1)
                    raw = b""
                    while not raw.endswith(b"\n") and len(raw) <= 131072:
                        block = client.recv(8192)
                        if not block:
                            break
                        raw += block
                    request = json.loads(raw)
                    if (request.get("controller_id") != self.identity["controller_id"]
                            or request.get("owner_token") != self.identity["owner_token"]):
                        raise ValueError("Foreign controller request")
                    if request.get("operation") == "attach":
                        if (request.get("review_kind") != self.identity["review_kind"]
                                or request.get("series_id") != self.identity["series_id"]
                                or request.get("reviewer_settings") != self.identity["reviewer_settings"]):
                            raise ValueError("Incompatible live native controller")
                        evidence = request.get("evidence", {})
                        if not isinstance(evidence, dict) or self.o._files(self.root, list(evidence)) != evidence:
                            raise ValueError("Attached evidence custody changed")
                        self.pending.put(request)
                    elif request.get("operation") != "observe":
                        raise ValueError("Unsupported controller observation")
                    response = dict(self.progress, controller_id=self.identity["controller_id"],
                                    identity={k: v for k, v in self.identity.items() if k != "owner_token"})
                except Exception as exc:
                    response = {"controller_id": self.identity["controller_id"], "error": str(exc)}
                try:
                    client.sendall(self.o._canonical(response) + b"\n")
                except OSError:
                    pass  # An observer cannot cancel or replace the owner.

    def evidence(self):
        paths = []
        while True:
            try:
                request = self.pending.get_nowait()
            except queue.Empty:
                return paths
            proof = request["evidence"]
            if self.o._files(self.root, list(proof)) != proof:
                raise self.o.OracleApprovalError("Attached evidence changed before consumption")
            _publish(self.o, self.root, self.directory / ("observer-" + uuid.uuid4().hex + ".json"), request)
            paths.extend(proof)

    def close(self):
        if getattr(self, "closed", False):
            return
        self.closed = True
        _LIVE.pop(self.identity["controller_id"], None)
        self.stop.set()
        self.socket.close()
        if hasattr(self, "thread"):
            self.thread.join(1.2)


def checkpoint_admitted(o, root, identity, terminal):
    path = Path(identity["directory"]) / "checkpoint-admission.json"
    if not path.exists():
        error = path.with_name("checkpoint-error.json")
        if error.exists():
            raise o.OracleApprovalError(_read(o, root, error)["error"])
        return False
    record = _read(o, root, path)
    payload = {key: value for key, value in record.items() if key != "admission_sha256"}
    if (record.get("controller_id") != identity["controller_id"]
            or record.get("result_sha256") != terminal.get("result_sha256")
            or record.get("admission_sha256") != o._sha(o._canonical(payload))
            or record.get("status") != "ADMITTED"):
        raise o.OracleApprovalError("Native checkpoint admission identity changed")
    return True


def _completed_result(o, root, identity):
    terminal = _terminal(o, root, identity)
    if terminal is None:
        return False, None
    if terminal.get("checkpoint_required") and not checkpoint_admitted(o, root, identity, terminal):
        return False, None
    if "result_path" in terminal:
        path = Path(terminal["result_path"])
        if path != Path(identity["directory"]) / "native-result.json":
            raise o.OracleApprovalError("Original native controller result is outside its owner")
        raw = o._custody_read(root, path)[1]
        if o._sha(raw) != terminal["result_sha256"]:
            raise o.OracleApprovalError("Original native controller result changed")
        result = json.loads(raw)
        if raw != o._pretty(result):
            raise o.OracleApprovalError("Original native controller result is not canonical")
        return True, result
    exception = {"OracleCandidateRejected": o.OracleCandidateRejected,
                 "OracleReviewIncomplete": o.OracleReviewIncomplete}.get(terminal.get("error_type"), o.OracleApprovalError)
    raise exception(terminal.get("error", "Native controller failed"))


def _follow(o, root, identity, kind, series, evidence):
    if (identity["review_kind"] != kind or identity["series_id"] != series
            or identity["reviewer_settings"] != o._review_settings_binding()):
        raise o.OracleApprovalError("Incompatible live native controller")
    if not _alive(identity) and _active_children(o, root, identity):
        return _wait_orphan(o, root, identity)
    complete, result = _completed_result(o, root, identity)
    if complete:
        return result
    request = {"operation": "attach", "review_kind": kind, "series_id": series,
               "reviewer_settings": o._review_settings_binding(), "evidence": o._files(root, evidence),
               "observer_pid": os.getpid(), "observer_process_identity": process_identity(os.getpid())}
    try:
        response = _request(o, root, identity, request)
    except (OSError, ValueError) as exc:
        complete, result = _completed_result(o, root, identity)
        if complete:
            return result
        if not _alive(identity):
            return _wait_orphan(o, root, identity)
        raise o.OracleApprovalError("Live native owner is not observable; original invocation retained") from exc
    if response.get("error"):
        raise o.OracleApprovalError(response["error"])
    while True:
        complete, result = _completed_result(o, root, identity)
        if complete:
            return result
        if not _alive(identity):
            return _wait_orphan(o, root, identity)
        time.sleep(.1)


def run(o, root, kind, attempt, args, kwargs, *, follow_commits=False, request=None):
    predecessor = None if "BOC_NATIVE_CONTROLLER_RELOAD" in os.environ else legacy_active(o, root)
    if predecessor:
        historical = _follow_legacy(o, root, predecessor, kind)
        if historical is not None:
            return historical
    if kind == "issue":
        head = _head(o, root)
        series = o._series_directory(root, head).name if head else "unborn"
        evidence = list(args[0] if args else kwargs.get("evidence_paths", []))
    elif kind == "review_proposal" and (args or "request" in kwargs):
        series = o._sha((args[0] if args else kwargs["request"]).encode())
        evidence = list(args[1] if len(args) > 1 else kwargs.get("evidence_paths", []))
    else:
        series, evidence = (o._sha(o._canonical(request)) if request is not None else kind), []
    controller = Controller(o, root, kind, series)
    try:
        previous = controller.claim()
        if previous:
            controller.close()
            result = _follow(o, root, previous, kind, series, evidence)
            if result is _RETRY:
                return run(o, root, kind, attempt, args, kwargs, follow_commits=follow_commits, request=request)
            if follow_commits and kind == "issue":
                if (o._git(root, "rev-parse", "HEAD").strip() != result.get("base_commit")
                        or o._git(root, "status", "--porcelain=v1", "--untracked-files=all").strip()):
                    return run(o, root, kind, attempt, args, kwargs, follow_commits=True, request=request)
                if o.__package__:
                    from . import shipment_state
                else:
                    import shipment_state
                shipment_state.validated_receipt(root)
            return result
        token = o._CONTROLLER.set(controller)
        try:
            pending_checkpoint = None
            checkpoint_before = None
            checkpoint_saved = None
            evidence = list(dict.fromkeys([*evidence, *controller.resumed_evidence]))
            while True:
                before = _head(o, root) if kind == "issue" else None
                before_status = o._git(root, "status", "--porcelain=v1", "--untracked-files=all") if follow_commits and kind == "issue" else None
                evidence = list(dict.fromkeys([*evidence, *controller.evidence()]))
                if follow_commits and kind == "issue" and o._files(root, controller.producer_paths) != controller.producer:
                    controller.reload(evidence)
                call_args, call_kwargs = args, dict(kwargs)
                if kind == "issue":
                    if args:
                        call_args = (evidence, *args[1:])
                    else:
                        call_kwargs["evidence_paths"] = evidence
                try:
                    result = attempt(root, *call_args, **call_kwargs)
                    if follow_commits and kind == "issue":
                        if o._git(root, "rev-parse", "HEAD").strip() != before:
                            continue
                        if o._git(root, "status", "--porcelain=v1", "--untracked-files=all").strip():
                            raise o.OracleSourceBindingError("Candidate awaits normal author commit")
                        if o.__package__:
                            from . import shipment_state
                        else:
                            import shipment_state
                        pending_checkpoint = shipment_state.record_validated(root, checkpoint=False)
                        if o._git(root, "rev-parse", "HEAD").strip() != before:
                            continue
                    break
                except o.OracleApprovalError as exc:
                    if not follow_commits or kind != "issue":
                        raise
                    moved = o._git(root, "rev-parse", "HEAD").strip() != before
                    current_status = o._git(root, "status", "--porcelain=v1", "--untracked-files=all")
                    newly_dirty = bool(current_status.strip()) and current_status != before_status
                    if not (isinstance(exc, o.OracleSourceBindingError) or moved or newly_dirty):
                        raise
                    _publish(o, root, controller.directory / ("movement-" + uuid.uuid4().hex + ".json"),
                             {"controller_id": controller.identity["controller_id"], "candidate_commit": before,
                              "error_type": type(exc).__name__, "error": str(exc),
                              "observed_commit": o._git(root, "rev-parse", "HEAD").strip()})
                    controller.progress = {"state": "REVIEW_IN_PROGRESS", "attempt": None,
                                           "reason": "Retained movement outcome; awaiting committed current candidate"}
                    while o._git(root, "status", "--porcelain=v1", "--untracked-files=all").strip():
                        time.sleep(.2)
                    if o._git(root, "rev-parse", "HEAD").strip() == before:
                        raise
            result_path = controller.directory / "native-result.json"
            digest = _publish(o, root, result_path, result)
            status = result.get("review_status")
            status = status if status and status != "COMPLETE" else result.get("verdict", "COMPLETED")
            _finish(o, root, controller.identity,
                    {"status": status, "result_path": str(result_path), "result_sha256": digest,
                     "checkpoint_required": pending_checkpoint is not None})
            if pending_checkpoint is not None:
                checkpoint_path = shipment_state.checkpoint_path(root)
                checkpoint_before = o._custody_read(root, checkpoint_path)[1] if checkpoint_path.exists() else None
                current = shipment_state._load(root)
                for key in ("last_released_commit", "released_merge_commit", "released_publication"):
                    if key in current:
                        pending_checkpoint[key] = current[key]
                checkpoint_saved = shipment_state._save(root, pending_checkpoint)
                payload = {"controller_id": controller.identity["controller_id"], "status": "ADMITTED",
                           "result_sha256": digest, "checkpoint_sha256": checkpoint_saved["state_sha256"],
                           "validated_commit": checkpoint_saved["last_validated_commit"]}
                _publish(o, root, controller.directory / "checkpoint-admission.json",
                         dict(payload, admission_sha256=o._sha(o._canonical(payload))))
            return result
        except BaseException as exc:
            status = "REJECTED" if isinstance(exc, o.OracleCandidateRejected) else "INCOMPLETE" if isinstance(exc, o.OracleReviewIncomplete) else "ERROR"
            if checkpoint_saved is not None:
                checkpoint_path = shipment_state.checkpoint_path(root)
                if o._custody_read(root, checkpoint_path)[1] == o._pretty(checkpoint_saved):
                    if checkpoint_before is None:
                        o._metadata_remove(root, checkpoint_path)
                    else:
                        o._atomic_write(checkpoint_path, checkpoint_before)
            terminal = _terminal(o, root, controller.identity)
            if terminal and terminal.get("checkpoint_required"):
                _publish(o, root, controller.directory / "checkpoint-error.json",
                         {"error_type": type(exc).__name__, "error": str(exc)})
            if terminal is None:
                _finish(o, root, controller.identity,
                        {"status": status, "error_type": type(exc).__name__, "error": str(exc)})
            raise
        finally:
            o._CONTROLLER.reset(token)
    finally:
        controller.close()
