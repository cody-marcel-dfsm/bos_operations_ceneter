#!/bin/sh
set -eu

SERVICE="com.infinitestatemachines.bos.default"
ACCOUNT="bos-client"
CONFIG_DIR="${HOME}/Library/Application Support/Infinite State Machines/BOS"
CONFIG_PATH="${CONFIG_DIR}/credentials.json"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "BOS Keychain connection requires macOS." >&2
  exit 1
fi

echo "A secure macOS dialog will request your BOS client key."
echo "The key is written directly to Keychain and is not printed or stored in this package."

/usr/bin/osascript <<'APPLESCRIPT' |
set response to display dialog "Paste your BOS client key." default answer "" with title "Connect BOS" with hidden answer buttons {"Cancel", "Connect"} default button "Connect" cancel button "Cancel"
return text returned of response
APPLESCRIPT
  /usr/bin/security add-generic-password \
    -a "${ACCOUNT}" \
    -s "${SERVICE}" \
    -l "Infinite State Machines BOS Client" \
    -D "BOS client credential" \
    -U \
    -w

umask 077
/bin/mkdir -p "${CONFIG_DIR}"
temporary="${CONFIG_PATH}.tmp.$$"
trap 'rm -f "${temporary}"' EXIT HUP INT TERM
{
  printf '%s\n' '{'
  printf '%s\n' '  "schema_version": "1",'
  printf '%s\n' '  "profiles": ['
  printf '%s\n' '    {'
  printf '%s\n' '      "name": "default",'
  printf '%s\n' "      \"keychain_service\": \"${SERVICE}\","
  printf '%s\n' "      \"keychain_account\": \"${ACCOUNT}\""
  printf '%s\n' '    }'
  printf '%s\n' '  ]'
  printf '%s\n' '}'
} > "${temporary}"
/bin/chmod 600 "${temporary}"
/bin/mv "${temporary}" "${CONFIG_PATH}"
trap - EXIT HUP INT TERM

echo "BOS is connected. Start a new Codex task to load the credential."
