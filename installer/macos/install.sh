#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_MARKETPLACE="${SCRIPT_DIR}/marketplace"
DESTINATION="${HOME}/Library/Application Support/Infinite State Machines/BOS Marketplace"
BACKUP_ROOT="${HOME}/Library/Application Support/Infinite State Machines/BOS Backups"
MARKETPLACE_NAME="bos-operations-center"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer supports macOS." >&2
  exit 1
fi

if [ ! -f "${SOURCE_MARKETPLACE}/.agents/plugins/marketplace.json" ]; then
  echo "The embedded BOS marketplace is incomplete." >&2
  exit 1
fi

if [ -n "${CODEX_BIN:-}" ]; then
  codex_bin="${CODEX_BIN}"
elif command -v codex >/dev/null 2>&1; then
  codex_bin=$(command -v codex)
elif [ -x "/Applications/ChatGPT.app/Contents/Resources/codex" ]; then
  codex_bin="/Applications/ChatGPT.app/Contents/Resources/codex"
else
  echo "Codex is not installed. Install Codex, sign in, and run this script again." >&2
  exit 1
fi

if ! "${codex_bin}" login status >/dev/null 2>&1; then
  echo "Codex is installed and signed out. Sign in to Codex, then run this script again." >&2
  exit 1
fi

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
staging="${DESTINATION}.staging.$$"
backup="${BACKUP_ROOT}/marketplace-${timestamp}"
trap 'rm -rf "${staging}"' EXIT HUP INT TERM

/bin/mkdir -p "$(dirname "${DESTINATION}")" "${BACKUP_ROOT}"
/bin/rm -rf "${staging}"
/usr/bin/ditto "${SOURCE_MARKETPLACE}" "${staging}"

if [ -e "${DESTINATION}" ]; then
  /bin/mv "${DESTINATION}" "${backup}"
fi

if ! /bin/mv "${staging}" "${DESTINATION}"; then
  if [ -e "${backup}" ]; then
    /bin/mv "${backup}" "${DESTINATION}"
  fi
  exit 1
fi
trap - EXIT HUP INT TERM

marketplaces=$("${codex_bin}" plugin marketplace list --json)
if ! printf '%s' "${marketplaces}" |
  /usr/bin/grep -E "\"name\"[[:space:]]*:[[:space:]]*\"${MARKETPLACE_NAME}\"" >/dev/null; then
  "${codex_bin}" plugin marketplace add "${DESTINATION}" --json
fi

"${codex_bin}" plugin add "bos@${MARKETPLACE_NAME}" --json
"${codex_bin}" plugin add "icode-operations-center@${MARKETPLACE_NAME}" --json

echo
echo "BOS Operations Center is installed."
echo "Start a new Codex task. Codex will request BOS authentication through MCP"
echo "when the first secured BOS operation is requested."
