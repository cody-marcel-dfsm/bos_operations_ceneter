#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
VM=${BOS_VM_BASE:-bos-vanilla}
APP=${BOS_CODEX_APP:-/Applications/ChatGPT.app}
AUTH=${BOS_CODEX_AUTH:-${HOME}/.codex/auth.json}
SSH="sshpass -p admin ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"
ARCHIVE_DIR=$(/usr/bin/mktemp -d "${ROOT}/tmp/vm-prepare.XXXXXX")
APP_ARCHIVE=${ARCHIVE_DIR}/ChatGPT.zip
vm_pid=""
cleanup() {
  if [ -n "${vm_pid}" ]; then
    kill "${vm_pid}" 2>/dev/null || true
  fi
  tart stop "${VM}" 2>/dev/null || true
  /bin/rm -rf "${ARCHIVE_DIR}"
}
trap cleanup EXIT HUP INT TERM

command -v tart >/dev/null
command -v sshpass >/dev/null
test -d "${APP}"
test -f "${AUTH}"
tart list | /usr/bin/grep -q "${VM}"
/usr/bin/ditto -c -k --sequesterRsrc --keepParent "${APP}" "${APP_ARCHIVE}"

tart run --no-graphics --no-clipboard "${VM}" >"${ROOT}/tmp/${VM}-prepare.log" 2>&1 &
vm_pid=$!

ip=""
attempt=0
while [ "${attempt}" -lt 90 ]; do
  ip=$(tart ip "${VM}" 2>/dev/null || true)
  if [ -n "${ip}" ] && ${SSH} "admin@${ip}" true 2>/dev/null; then break; fi
  attempt=$((attempt + 1))
  sleep 2
done
test -n "${ip}"

sshpass -p admin scp -q -o PubkeyAuthentication=no -o PreferredAuthentications=password -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  "${AUTH}" "admin@${ip}:/tmp/codex-auth.json"
sshpass -p admin scp -q -o PubkeyAuthentication=no -o PreferredAuthentications=password -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  "${APP_ARCHIVE}" "admin@${ip}:/tmp/ChatGPT.zip"

${SSH} "admin@${ip}" 'sh -s' <<'GUEST'
set -eu
printf '%s\n' admin | sudo -S -p '' /bin/rm -rf /Applications/ChatGPT.app
printf '%s\n' admin | sudo -S -p '' /usr/bin/ditto -x -k /tmp/ChatGPT.zip /Applications
printf '%s\n' admin | sudo -S -p '' /bin/mkdir -p /usr/local/bin
printf '%s\n' admin | sudo -S -p '' /bin/ln -sf /Applications/ChatGPT.app/Contents/Resources/codex /usr/local/bin/codex
/bin/mkdir -p "$HOME/.codex"
/bin/mv /tmp/codex-auth.json "$HOME/.codex/auth.json"
/bin/rm -f /tmp/ChatGPT.zip
/bin/chmod 600 "$HOME/.codex/auth.json"
/usr/local/bin/codex login status >/dev/null
open /Applications/ChatGPT.app
sleep 5
/usr/local/bin/codex --version
test ! -e "$HOME/Library/Application Support/Infinite State Machines/BOS Marketplace"
GUEST

echo "Prepared ${VM}: Codex installed and signed in; BOS remains absent."
