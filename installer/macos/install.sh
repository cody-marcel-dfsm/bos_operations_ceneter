#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE_MARKETPLACE="${SCRIPT_DIR}/marketplace"
DESTINATION="${HOME}/Library/Application Support/Infinite State Machines/BOS Marketplace"
BACKUP_ROOT="${HOME}/Library/Application Support/Infinite State Machines/BOS Backups"
MARKETPLACE_NAME="bos-icode"
settings_file="${BOS_CUSTOMER_SETTINGS_FILE:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --settings)
      [ "$#" -ge 2 ] || { echo "--settings requires a JSON file" >&2; exit 1; }
      settings_file="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This installer supports macOS." >&2
  exit 1
fi

if [ ! -f "${SOURCE_MARKETPLACE}/.agents/plugins/marketplace.json" ]; then
  echo "The embedded BOS marketplace is incomplete." >&2
  exit 1
fi

if [ -n "${settings_file}" ]; then
  if [ ! -f "${settings_file}" ] || ! /usr/bin/plutil -lint "${settings_file}" >/dev/null; then
    echo "Customer settings must be a readable JSON property list." >&2
    exit 1
  fi
  for key in schema_version organization_display_name location_display_name timezone; do
    value=$(/usr/bin/plutil -extract "${key}" raw -o - "${settings_file}" 2>/dev/null || true)
    if [ -z "${value}" ]; then
      echo "Customer settings are missing ${key}." >&2
      exit 1
    fi
  done
  schema_version=$(/usr/bin/plutil -extract schema_version raw -o - "${settings_file}")
  timezone=$(/usr/bin/plutil -extract timezone raw -o - "${settings_file}")
  if [ "${schema_version}" != "1" ]; then
    echo "Customer settings schema_version must be 1." >&2
    exit 1
  fi
  case "${timezone}" in
    /*|*..*) echo "Customer settings timezone is invalid." >&2; exit 1 ;;
  esac
  if [ ! -f "/usr/share/zoneinfo/${timezone}" ]; then
    echo "Customer settings timezone must be a valid IANA timezone." >&2
    exit 1
  fi
  if /usr/bin/grep -Eqi '"(api[_-]?key|token|password|secret|credential|authorization)"[[:space:]]*:' "${settings_file}"; then
    echo "Customer settings must not contain credentials or secrets." >&2
    exit 1
  fi
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
if [ -n "${settings_file}" ]; then
  /bin/mkdir -p "${staging}/plugins/icode-operations-center/config"
  /bin/cp "${settings_file}" "${staging}/plugins/icode-operations-center/config/customer-settings.json"
  /bin/chmod 600 "${staging}/plugins/icode-operations-center/config/customer-settings.json"
elif [ -f "${DESTINATION}/plugins/icode-operations-center/config/customer-settings.json" ]; then
  /bin/mkdir -p "${staging}/plugins/icode-operations-center/config"
  /bin/cp "${DESTINATION}/plugins/icode-operations-center/config/customer-settings.json" \
    "${staging}/plugins/icode-operations-center/config/customer-settings.json"
  /bin/chmod 600 "${staging}/plugins/icode-operations-center/config/customer-settings.json"
fi

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
if [ -n "${settings_file}" ]; then
  echo "Customer settings were applied to iCode Operations Center."
else
  echo "iCode customer settings remain unconfigured. Copy the included template,"
  echo "fill it in, and rerun install.sh --settings /path/to/customer-settings.json."
fi
echo "Start a new Codex task. Codex will request BOS authentication through MCP"
echo "when the first secured BOS operation is requested."
