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
import socket
import stat
import subprocess
import threading
import time
import uuid


def process_identity(pid):
    result = subprocess.run(["ps", "-p", str(pid), "-o", "lstart=,comm="],
                            capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else None


def _read(o, root, path):
    return json.loads(o._custody_read(root, path)[1])


def _publish(o, root, path, value):
    raw = o._pretty(value)
    if path.exists():
        if o._custody_read(root, path)[1] != raw:
            raise o.OracleApprovalError("Immutable controller record changed")
    else:
        o._atomic_write(path, raw)
    return o._sha(raw)


def _last(o, root):
    directory = o.receipt_path(root).parent / "controllers" / "admissions"
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
        if (not o.re.fullmatch(r"controller-[0-9a-f]{32}", identifier)
                or record.get("directory") != str(directory.parent / identifier)
                or not isinstance(record.get("pid"), int) or record["pid"] <= 0
                or not record.get("process_identity")
                or Path(record.get("endpoint", "")).parent != o.receipt_path(root).parent
                or not o.re.fullmatch(r"s-[0-9a-f]{16}", Path(record["endpoint"]).name)
                or o._custody_read(root, Path(record["directory"]) / "identity.json")[1] != raw):
            raise o.OracleApprovalError("Controller process or original invocation custody changed")
        previous = o._sha(raw)
    return (record, len(names)) if names else (None, 0)


def _terminal(o, root, identity):
    path = Path(identity["directory"]) / "terminal.json"
    if not path.exists():
        return None
    result = _read(o, root, path)
    if result.get("controller_id") != identity["controller_id"]:
        raise o.OracleApprovalError("Controller outcome has foreign identity")
    return result


def _request(o, root, identity, request):
    endpoint = Path(identity["endpoint"])
    o._metadata_directory(root, endpoint.parent)
    info = endpoint.lstat()
    if not stat.S_ISSOCK(info.st_mode) or info.st_uid != os.getuid():
        raise o.OracleApprovalError("Controller observation endpoint is foreign")
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
        client.settimeout(2)
        client.connect(str(endpoint))
        client.sendall(o._canonical(dict(request, controller_id=identity["controller_id"])) + b"\n")
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
        return None
    if process_identity(identity["pid"]) != identity["process_identity"]:
        return None
    try:
        return _request(o, root, identity, {"operation": "observe"})
    except (OSError, ValueError) as exc:
        raise o.OracleApprovalError("Live controller observation failed; original owner retained") from exc


class Controller:
    def __init__(self, o, root, kind, series):
        self.o, self.root = o, root
        parent = o.receipt_path(root).parent
        self.directory = o._metadata_run(root, parent / "controllers", "controller-")
        self.endpoint = parent / ("s-" + uuid.uuid4().hex[:16])
        self.socket = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.socket.bind(str(self.endpoint))
        os.chmod(self.endpoint, 0o600)
        self.socket.listen(16)
        self.socket.settimeout(.2)
        self.identity = {"kind": "boc-review-controller-v1", "root": str(root),
                         "controller_id": self.directory.name, "directory": str(self.directory),
                         "endpoint": str(self.endpoint), "pid": os.getpid(),
                         "process_identity": process_identity(os.getpid()), "review_kind": kind,
                         "series_id": series, "reviewer_settings": o._review_settings_binding(),
                         "started_at": o.datetime.now(o.timezone.utc).isoformat(),
                         "original_review_started_at": os.environ.get("ORACLE_REVIEW_STARTED_AT"),
                         "original_release_started_at": os.environ.get("SHIP_IT_STARTED_AT")}
        self.pending = queue.Queue()
        self.stop = threading.Event()
        self.progress = {"state": "REVIEW_IN_PROGRESS", "attempt": None}

    def claim(self):
        o, root = self.o, self.root
        previous, count = _last(o, root)
        if previous and not _terminal(o, root, previous) and process_identity(previous["pid"]) == previous["process_identity"]:
            return previous
        if previous and not _terminal(o, root, previous):
            _publish(o, root, Path(previous["directory"]) / "terminal.json",
                     {"controller_id": previous["controller_id"], "status": "ERROR",
                      "error_type": "OracleApprovalError", "error": "Native controller process exited before its outcome"})
        self.identity["previous_sha256"] = o._sha(o._pretty(previous)) if previous else None
        identity_path = self.directory / "identity.json"
        _publish(o, root, identity_path, self.identity)
        admissions = o.receipt_path(root).parent / "controllers" / "admissions"
        o._metadata_directory(root, admissions)
        source = o._private_directory_fd(root, self.directory, (".git", "oracle"))
        target = o._private_directory_fd(root, admissions, (".git", "oracle"))
        try:
            os.link(identity_path.name, f"{count + 1:08d}.json", src_dir_fd=source,
                    dst_dir_fd=target, follow_symlinks=False)
        except FileExistsError:
            return _last(o, root)[0]
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
                    if request.get("controller_id") != self.identity["controller_id"]:
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
                                    identity=self.identity)
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
        self.stop.set()
        self.socket.close()
        if hasattr(self, "thread"):
            self.thread.join(1.2)
        self.endpoint.unlink(missing_ok=True)


def _follow(o, root, identity, kind, series, evidence):
    request = {"operation": "attach", "review_kind": kind, "series_id": series,
               "reviewer_settings": o._review_settings_binding(), "evidence": o._files(root, evidence),
               "observer_pid": os.getpid(), "observer_process_identity": process_identity(os.getpid())}
    response = _request(o, root, identity, request)
    if response.get("error"):
        raise o.OracleApprovalError(response["error"])
    while True:
        terminal = _terminal(o, root, identity)
        if terminal:
            if terminal["status"] == "APPROVED":
                path = Path(terminal["result_path"])
                raw = o._custody_read(root, path)[1]
                if o._sha(raw) != terminal["result_sha256"]:
                    raise o.OracleApprovalError("Original native controller result changed")
                return json.loads(raw)
            exception = {"OracleCandidateRejected": o.OracleCandidateRejected,
                         "OracleReviewIncomplete": o.OracleReviewIncomplete}.get(terminal.get("error_type"), o.OracleApprovalError)
            raise exception(terminal.get("error", "Native controller failed"))
        if process_identity(identity["pid"]) != identity["process_identity"]:
            raise o.OracleApprovalError("Observed native controller process exited; original evidence retained")
        time.sleep(.1)


def run(o, root, kind, attempt, args, kwargs, *, follow_commits=False):
    if kind == "issue":
        series = o._series_directory(root, o._git(root, "rev-parse", "HEAD").strip()).name
        evidence = list(args[0] if args else kwargs.get("evidence_paths", []))
    elif kind == "review_proposal" and (args or "request" in kwargs):
        series = o._sha((args[0] if args else kwargs["request"]).encode())
        evidence = list(args[1] if len(args) > 1 else kwargs.get("evidence_paths", []))
    else:
        series, evidence = kind, []
    controller = Controller(o, root, kind, series)
    try:
        previous = controller.claim()
        if previous:
            controller.close()
            result = _follow(o, root, previous, kind, series, evidence)
            if follow_commits and kind == "issue":
                if (o._git(root, "rev-parse", "HEAD").strip() != result.get("base_commit")
                        or o._git(root, "status", "--porcelain=v1", "--untracked-files=all").strip()):
                    return run(o, root, kind, attempt, args, kwargs, follow_commits=True)
                if o.__package__:
                    from . import shipment_state
                else:
                    import shipment_state
                shipment_state.validated_receipt(root)
            return result
        token = o._CONTROLLER.set(controller)
        try:
            while True:
                before = o._git(root, "rev-parse", "HEAD").strip() if kind == "issue" else None
                evidence = list(dict.fromkeys([*evidence, *controller.evidence()]))
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
                        shipment_state.record_validated(root)
                        if o._git(root, "rev-parse", "HEAD").strip() != before:
                            continue
                    break
                except o.OracleApprovalError as exc:
                    if not follow_commits or kind != "issue":
                        raise
                    moved = o._git(root, "rev-parse", "HEAD").strip() != before
                    dirty = bool(o._git(root, "status", "--porcelain=v1", "--untracked-files=all").strip())
                    if not (isinstance(exc, o.OracleSourceBindingError) or moved or dirty):
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
            _publish(o, root, controller.directory / "terminal.json",
                     {"controller_id": controller.identity["controller_id"], "status": "APPROVED",
                      "result_path": str(result_path), "result_sha256": digest})
            return result
        except BaseException as exc:
            _publish(o, root, controller.directory / "terminal.json",
                     {"controller_id": controller.identity["controller_id"], "status": "ERROR",
                      "error_type": type(exc).__name__, "error": str(exc)})
            raise
        finally:
            o._CONTROLLER.reset(token)
    finally:
        controller.close()
