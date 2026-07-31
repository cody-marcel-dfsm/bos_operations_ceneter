#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
VENV="${ROOT}/tmp/broker-build-venv"
WORK="${ROOT}/tmp/macos-broker"

if [ "$(uname -s)" != "Darwin" ] || [ "$(uname -m)" != "arm64" ]; then
  echo "The current customer broker build targets Apple-silicon macOS." >&2
  exit 1
fi

/bin/rm -rf "${VENV}"
python3 -m venv "${VENV}"
"${VENV}/bin/python" -m pip install \
  --disable-pip-version-check \
  --requirement "${ROOT}/installer/macos/broker-requirements.txt"

/bin/rm -rf "${WORK}"
/bin/mkdir -p "${WORK}"
export PYTHONHASHSEED=1
export SOURCE_DATE_EPOCH=0
"${VENV}/bin/pyinstaller" \
  --clean \
  --onefile \
  --name bos-mcp-broker \
  --distpath "${WORK}/dist" \
  --workpath "${WORK}/work" \
  --specpath "${WORK}" \
  "${ROOT}/source/runtime/bos/scripts/bos_mcp_broker.py"

printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' |
  "${WORK}/dist/bos-mcp-broker" |
  /usr/bin/grep -F '"name":"bos"' >/dev/null

echo "${WORK}/dist/bos-mcp-broker"
