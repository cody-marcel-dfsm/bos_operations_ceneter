#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
BASE_VM=${BOS_VM_BASE:-bos-vanilla}
RUN_VM=${BOS_VM_RUN:-bos-acceptance}
ENV_FILE=${BOS_VM_ENV_FILE:-${ROOT}/.env}
PUBLIC_ENV=${BOS_VM_PUBLIC_ENV:-${ROOT}/config/vm-acceptance.env}
SSH="sshpass -p admin ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

command -v tart >/dev/null
command -v sshpass >/dev/null
test -f "${ENV_FILE}"
test -f "${PUBLIC_ENV}"

for required in BOS_TEST_API_KEY CALIMATIC_API_TOKEN; do
  if ! /usr/bin/grep -q "^${required}=" "${ENV_FILE}"; then
    echo "Missing ${required} in ${ENV_FILE}" >&2
    exit 1
  fi
done

if tart list --format json | /usr/bin/grep -q "\"Name\":\"${RUN_VM}\""; then
  tart delete "${RUN_VM}"
fi
tart clone "${BASE_VM}" "${RUN_VM}"
tart run --no-graphics --no-clipboard "${RUN_VM}" >"${ROOT}/tmp/${RUN_VM}.log" 2>&1 &
vm_pid=$!
ip=""
cleanup() {
  if [ -n "${ip}" ]; then
    ${SSH} "admin@${ip}" 'rm -f /tmp/.env /tmp/vm-acceptance.env' 2>/dev/null || true
  fi
  kill "${vm_pid}" 2>/dev/null || true
  tart stop "${RUN_VM}" 2>/dev/null || true
}
trap cleanup EXIT HUP INT TERM

attempt=0
while [ "${attempt}" -lt 90 ]; do
  ip=$(tart ip "${RUN_VM}" 2>/dev/null || true)
  if [ -n "${ip}" ] && ${SSH} "admin@${ip}" true 2>/dev/null; then break; fi
  attempt=$((attempt + 1))
  sleep 2
done
test -n "${ip}"

sshpass -p admin scp -q -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null \
  "${ENV_FILE}" "${PUBLIC_ENV}" "admin@${ip}:/tmp/"

${SSH} "admin@${ip}" 'sh -s' <<'GUEST'
set -eu
test -x /usr/local/bin/codex || command -v codex >/dev/null
codex login status >/dev/null
open -a ChatGPT
sleep 3
test -d "$HOME/.codex"
test ! -e "$HOME/Library/Application Support/Infinite State Machines/BOS Marketplace"
GUEST

${SSH} "admin@${ip}" 'sh -s' <<'GUEST'
set -eu
set -a
. /tmp/.env
. /tmp/vm-acceptance.env
set +a
prompt=$(printf '%s\n' \
  "Install BOS Operations Center from ${BOS_TEST_PACKAGE_URL}." \
  "Download and verify the ZIP, install it, and start the BOS MCP." \
  "Authenticate BOS using BOS_TEST_API_KEY from the process environment." \
  "For the test organization ${BOS_TEST_ORG_ID}, configure Calimatic using CALIMATIC_API_TOKEN from the process environment." \
  "Then run one read-only Calimatic query and report only sanitized organization scope and record count." \
  "Never print, persist, or repeat either credential.")
printf '%s' "${prompt}" | codex exec --dangerously-bypass-approvals-and-sandbox -
rm -f /tmp/.env /tmp/vm-acceptance.env
GUEST

echo "macOS Codex acceptance flow completed in ${RUN_VM}"
