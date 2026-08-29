#!/bin/sh

set -eu

# DESTRUCTIVE CLEAN INSTALLER
#
# This command permanently removes every installed BOS Antigravity product
# folder or symlink, including all local customizations stored inside those
# product directories. It creates no backup. The user must explicitly confirm
# this destruction before the script performs any filesystem mutation.

# Resolve the repository from this script's location, regardless of the
# directory from which the script is run.
SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
REPOSITORY_ROOT=$(CDPATH= cd "$SCRIPT_DIR/.." && pwd -P)
EXTENSIONS_DIR="$REPOSITORY_ROOT/clients/gemini/extensions"
PLUGINS_DIR="$HOME/.gemini/config/plugins"
CONFIRMATION_PHRASE="DELETE ALL BOS ANTIGRAVITY CUSTOMIZATIONS"

printf '%s\n' \
  "WARNING: DESTRUCTIVE CLEAN INSTALL" \
  "This command permanently deletes every installed BOS Antigravity product" \
  "folder and symlink under:" \
  "  $PLUGINS_DIR" \
  "All local customizations stored inside those BOS product folders will be lost." \
  "No backup or automatic recovery will be created." \
  "Unrelated non-BOS Antigravity plugins are preserved." \
  "" \
  "To agree to this destruction, type exactly:" \
  "  $CONFIRMATION_PHRASE"
printf '> '
IFS= read -r CONFIRMATION || CONFIRMATION=""

if [ "$CONFIRMATION" != "$CONFIRMATION_PHRASE" ]; then
  echo "Clean install aborted. No plugins or customizations were changed." >&2
  exit 1
fi

if [ ! -d "$EXTENSIONS_DIR" ]; then
  echo "Error: Gemini extensions were not found at $EXTENSIONS_DIR" >&2
  exit 1
fi

if ! PREFLIGHT_PRODUCTS=$(node "$SCRIPT_DIR/preflight-antigravity.mjs" "$REPOSITORY_ROOT"); then
  echo "Error: Antigravity source preflight failed; existing plugins were preserved." >&2
  exit 1
fi
ACTIVE_PRODUCTS=$(printf '%s\n' "$PREFLIGHT_PRODUCTS" | sed -n 's/^active://p')
DISABLED_PRODUCTS=$(printf '%s\n' "$PREFLIGHT_PRODUCTS" | sed -n 's/^disabled://p')

echo "Confirmation accepted. Permanently deleting prior BOS Antigravity plugins without backups."
mkdir -p "$PLUGINS_DIR"

# DESTRUCTIVE: remove every installed BOS product, including any local files or
# customer customizations stored inside the product directory. No backup is
# created. This block runs only after exact user confirmation and preflight.
for TARGET in "$PLUGINS_DIR"/*; do
  if [ -e "$TARGET/.bos-product.json" ]; then
    rm -rf "$TARGET"
  fi
done

# DESTRUCTIVE: remove each preflight-validated disabled product by name so a
# broken legacy symlink cannot survive. No backup is created.
for NAME in $DISABLED_PRODUCTS; do
  TARGET="$PLUGINS_DIR/$NAME"
  if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
    rm -rf "$TARGET"
  fi
done

# DESTRUCTIVE REPLACEMENT: remove each current product target, including any
# local customizations it contains, then replace it with the repository symlink.
for NAME in $ACTIVE_PRODUCTS; do
  SOURCE="$EXTENSIONS_DIR/$NAME"
  TARGET="$PLUGINS_DIR/$NAME"
  if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
    rm -rf "$TARGET"
  fi
  ln -s "$SOURCE" "$TARGET"
  echo "Linked $TARGET -> $SOURCE"
done

if ! node "$SCRIPT_DIR/verify-antigravity-runtime.mjs"; then
  echo "Error: Antigravity post-install verification failed." >&2
  exit 1
fi

echo "Destructive clean install complete. Restart Antigravity after each Git pull."
