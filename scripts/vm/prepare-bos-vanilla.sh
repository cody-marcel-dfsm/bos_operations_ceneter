#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
VM=${BOS_VM_BASE:-bos-vanilla}
APP=${BOS_CODEX_APP:-/Applications/ChatGPT.app}
AUTH=${BOS_CODEX_AUTH:-${HOME}/.codex/auth.json}
SSH="sshpass -p admin ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

command -v tart >/dev/null
command -v sshpass >/dev/null
test -d "${APP}"
test -f "${AUTH}"
tart list | /usr/bin/grep -q "${VM}"

tart run --no-graphics --no-clipboard \
  --dir="codex-app:${APP}:ro" "${VM}" >"${ROOT}/tmp/${VM}-prepare.log" 2>&1 &
vm_pid=$!
cleanup() {
  kill "${vm_pid}" 2>/dev/null || true
  tart stop "${VM}" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM

ip=""
attempt=0
while [ "${attempt}" -lt 90 ]; do
  ip=$(tart ip "${VM}" 2>/dev/null || true)
  if [ -n "${ip}" ] && ${SSH} "admin@${ip}" true 2>/dev/null; then break; fi
  attempt=$((attempt + 1))
  sleep 2
done
test -n "${ip}"

sshpass -p admin scp -q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  "${AUTH}" "admin@${ip}:/tmp/codex-auth.json"

${SSH} "admin@${ip}" 'sh -s' <<'GUEST'
set -eu
sudo /usr/bin/ditto "/Volumes/My Shared Files/codex-app" /Applications/ChatGPT.app
sudo /bin/ln -sf /Applications/ChatGPT.app/Contents/Resources/codex /usr/local/bin/codex
/bin/mkdir -p "$HOME/.codex"
/bin/mv /tmp/codex-auth.json "$HOME/.codex/auth.json"
/bin/chmod 600 "$HOME/.codex/auth.json"
codex login status >/dev/null
open -a ChatGPT
sleep 5
codex --version
test ! -e "$HOME/Library/Application Support/Infinite State Machines/BOS Marketplace"
GUEST

echo "Prepared ${VM}: Codex installed and signed in; BOS remains absent."
