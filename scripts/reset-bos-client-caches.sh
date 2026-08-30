#!/bin/sh

set -eu

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
exec node "$SCRIPT_DIR/reset-bos-client-caches.mjs" "$@"
