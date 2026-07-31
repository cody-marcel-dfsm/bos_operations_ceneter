#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
BASE_VM=${BOS_VM_BASE:-bos-vanilla}
RUN_VM=${BOS_VM_RUN:-bos-acceptance}
ENV_FILE=${BOS_VM_ENV_FILE:-${ROOT}/.env}
PUBLIC_ENV=${BOS_VM_PUBLIC_ENV:-${ROOT}/config/vm-acceptance.env}
SSH="sshpass -p admin ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"

command -v tart >/dev/null
command -v sshpass >/dev/null
test -f "${ENV_FILE}"
test -f "${PUBLIC_ENV}"

for required in BOS_TEST_API_KEY CALIMATIC_API_TOKEN; do
  if ! /usr/bin/grep -Eq "^${required}=.+$" "${ENV_FILE}"; then
    echo "Missing ${required} in ${ENV_FILE}" >&2
    exit 1
  fi
done
for required in BOS_TEST_PACKAGE_URL BOS_TEST_MCP_URL BOS_TEST_ORG_ID BOS_TEST_INSTALLED_APP_ID BOS_TEST_PLUGIN_ID; do
  if ! /usr/bin/grep -Eq "^${required}=.+$" "${PUBLIC_ENV}"; then
    echo "Missing ${required} in ${PUBLIC_ENV}" >&2
    exit 1
  fi
done

if tart list | /usr/bin/awk -v name="${RUN_VM}" 'NR > 1 && $2 == name { found = 1 } END { exit !found }'; then
  tart delete "${RUN_VM}"
fi
tart clone "${BASE_VM}" "${RUN_VM}"
tart run --no-graphics --no-clipboard "${RUN_VM}" >"${ROOT}/tmp/${RUN_VM}.log" 2>&1 &
vm_pid=$!
ip=""
cleanup() {
  if [ -n "${ip}" ]; then
    ${SSH} "admin@${ip}" 'rm -f /tmp/.env /tmp/vm-acceptance.env /tmp/bos-acceptance.out' 2>/dev/null || true
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

transfer_attempt=0
while ! sshpass -p admin scp -q \
  -o PubkeyAuthentication=no \
  -o PreferredAuthentications=password \
  -o StrictHostKeyChecking=no \
  -o UserKnownHostsFile=/dev/null \
  "${ENV_FILE}" "${PUBLIC_ENV}" "admin@${ip}:/tmp/"; do
  transfer_attempt=$((transfer_attempt + 1))
  if [ "${transfer_attempt}" -ge 5 ]; then
    echo "VM credential transfer failed after ${transfer_attempt} attempts" >&2
    exit 1
  fi
  sleep 2
done

${SSH} "admin@${ip}" '/bin/zsh -s' <<'GUEST'
set -eu
setopt pipefail
test -x /usr/local/bin/codex || command -v codex >/dev/null
/usr/local/bin/codex login status >/dev/null
open /Applications/ChatGPT.app
sleep 3
test -d "$HOME/.codex"
test ! -e "$HOME/Library/Application Support/Infinite State Machines/BOS Marketplace"
GUEST

${SSH} "admin@${ip}" '/bin/zsh -s' <<'GUEST'
set -eu
setopt pipefail
env_value() {
  /usr/bin/awk -v key="$1" '
    index($0, key "=") == 1 { print substr($0, length(key) + 2); exit }
  ' "$2"
}
export BOS_TEST_API_KEY=$(env_value BOS_TEST_API_KEY /tmp/.env)
export CALIMATIC_API_TOKEN=$(env_value CALIMATIC_API_TOKEN /tmp/.env)
export BOS_TEST_PACKAGE_URL=$(env_value BOS_TEST_PACKAGE_URL /tmp/vm-acceptance.env)
export BOS_MCP_URL=$(env_value BOS_TEST_MCP_URL /tmp/vm-acceptance.env)
export BOS_TEST_ORG_ID=$(env_value BOS_TEST_ORG_ID /tmp/vm-acceptance.env)
export BOS_TEST_INSTALLED_APP_ID=$(env_value BOS_TEST_INSTALLED_APP_ID /tmp/vm-acceptance.env)
export BOS_TEST_PLUGIN_ID=$(env_value BOS_TEST_PLUGIN_ID /tmp/vm-acceptance.env)
install_prompt=$(printf '%s\n' \
  "Install BOS Operations Center from ${BOS_TEST_PACKAGE_URL}." \
  "Download and verify the ZIP, install it, and verify that its BOS MCP is configured." \
  "Stop after installation so a fresh Codex process can discover the new MCP server.")
printf '%s' "${install_prompt}" | /usr/local/bin/codex exec --ephemeral --dangerously-bypass-approvals-and-sandbox -

# Codex starts plugin MCP servers from their declared configuration and does not
# forward arbitrary parent-shell variables. Pin the disposable acceptance clone
# to the explicitly configured test endpoint without changing the public package.
installed_mcp=$(/usr/bin/find \
  "$HOME/.codex/plugins/cache/bos-operations-center/bos" \
  -mindepth 2 -maxdepth 2 -name .mcp.json -print | /usr/bin/head -n 1)
test -f "${installed_mcp}"
mcp_staging="${installed_mcp}.staging.$$"
/usr/bin/jq --arg url "${BOS_MCP_URL}" \
  '.mcpServers.bos.env.BOS_MCP_URL = $url' \
  "${installed_mcp}" >"${mcp_staging}"
/bin/mv "${mcp_staging}" "${installed_mcp}"

acceptance_prompt=$(printf '%s\n' \
  "Use the installed BOS MCP and call bos_authenticate with this credential: ${BOS_TEST_API_KEY}" \
  "Select the test organization ${BOS_TEST_ORG_ID}." \
  "I explicitly authorize configuring installed app ${BOS_TEST_INSTALLED_APP_ID}, plugin ${BOS_TEST_PLUGIN_ID}, through bos_set_provider_credential using provider calimatic, credential name api_key, configuration_authority_confirmed true, and this credential value: ${CALIMATIC_API_TOKEN}" \
  "Then run one read-only Calimatic query and report only sanitized organization scope and record count." \
  "Only after every step succeeds, end with exactly: BOS_VM_ACCEPTANCE_PASS org_id=${BOS_TEST_ORG_ID} record_count=<integer>" \
  "Never print, persist, or repeat either credential.")
printf '%s' "${acceptance_prompt}" |
  /usr/local/bin/codex exec --ephemeral --dangerously-bypass-approvals-and-sandbox - 2>&1 |
  /usr/bin/awk '
    function redact(value, secret, before, after, position) {
      if (!length(secret)) return value
      while ((position = index(value, secret)) > 0) {
        before = substr(value, 1, position - 1)
        after = substr(value, position + length(secret))
        value = before "[REDACTED]" after
      }
      return value
    }
    BEGIN { bos = ENVIRON["BOS_TEST_API_KEY"]; provider = ENVIRON["CALIMATIC_API_TOKEN"] }
    { print redact(redact($0, bos), provider) }
  ' | /usr/bin/tee /tmp/bos-acceptance.out
if /usr/bin/grep -Fq "${BOS_TEST_API_KEY}" /tmp/bos-acceptance.out ||
   /usr/bin/grep -Fq "${CALIMATIC_API_TOKEN}" /tmp/bos-acceptance.out; then
  echo "Credential redaction assertion failed" >&2
  exit 1
fi
if ! /usr/bin/grep -Eq "^BOS_VM_ACCEPTANCE_PASS org_id=${BOS_TEST_ORG_ID} record_count=[0-9]+$" /tmp/bos-acceptance.out; then
  echo "Acceptance success marker missing" >&2
  exit 1
fi
rm -f /tmp/.env /tmp/vm-acceptance.env /tmp/bos-acceptance.out
GUEST

echo "macOS Codex acceptance flow completed in ${RUN_VM}"
