#!/usr/bin/env bash
set -euo pipefail
# Installed source lives at ROOT/releases/REV/source/host-runtime/NAME.
# The private control file contains only fixed local references, never credentials.
here="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
root="$(cd -- "$here/../../../../.." && pwd -P)"
if [[ -z "${HATCH_HOOK_RUNTIME:-}" || ! -f "$HATCH_HOOK_RUNTIME" ]]; then
  exit 1
fi
source "$HATCH_HOOK_RUNTIME"
if payload="$(node "$here/muse-companion-cli.mjs" hook-payload --control "$root/run/control.json")" && [[ "$payload" != "null" ]]; then
  wake "BOS journey work is pending" "$payload"
else
  silent
fi
