"""Seal for `oracle-spec/1` implementation specs (BOS product-family formula).

The seal is a sanity check that the Oracle spec step ran and that the build uses
the spec it produced. It is not security or tamper resistance: there are no keys
or signatures. This module has no repository dependencies so build hosts and CI can
recompute it; it adapts, and never imports, the sibling BOS implementation.
"""

import hashlib
import hmac
import json

KIND = "oracle-spec/1"


def compute_seal(spec):
    """sha256(b"oracle-spec/1\\0" + canonical JSON of everything except `seal`)."""
    body = {key: value for key, value in spec.items() if key != "seal"}
    canonical = json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    return hashlib.sha256(KIND.encode() + b"\0" + canonical.encode()).hexdigest()


def seal_matches(spec):
    """True when `spec` is an oracle-spec/1 object whose seal recomputes exactly."""
    try:
        expected = compute_seal(spec) if isinstance(spec, dict) else None
    except ValueError:  # non-finite numbers have no canonical form
        return False
    return (expected is not None and spec.get("kind") == KIND and isinstance(spec.get("seal"), str)
            and hmac.compare_digest(spec["seal"], expected))
