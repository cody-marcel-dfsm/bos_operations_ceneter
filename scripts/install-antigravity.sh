#!/bin/sh

set -eu

# Resolve the repository from this script's location, regardless of the
# directory from which the script is run.
SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
REPOSITORY_ROOT=$(CDPATH= cd "$SCRIPT_DIR/.." && pwd -P)
EXTENSIONS_DIR="$REPOSITORY_ROOT/clients/gemini/extensions"
PLUGINS_DIR="$HOME/.gemini/config/plugins"

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

echo "Clean install: removing prior BOS plugins without backups."
mkdir -p "$PLUGINS_DIR"

# Remove every installed BOS product so stale copies and old product names
# cannot coexist with the repository-backed links.
for TARGET in "$PLUGINS_DIR"/*; do
  if [ -e "$TARGET/.bos-product.json" ]; then
    rm -rf "$TARGET"
  fi
done

# Remove each preflight-validated disabled product by name so a broken old
# symlink cannot survive.
for NAME in $DISABLED_PRODUCTS; do
  TARGET="$PLUGINS_DIR/$NAME"
  if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
    rm -rf "$TARGET"
  fi
done

# Replace each current product target even when it is a broken symlink or an
# unmarked legacy copy.
for NAME in $ACTIVE_PRODUCTS; do
  SOURCE="$EXTENSIONS_DIR/$NAME"
  TARGET="$PLUGINS_DIR/$NAME"
  if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
    rm -rf "$TARGET"
  fi
  ln -s "$SOURCE" "$TARGET"
  echo "Linked $TARGET -> $SOURCE"
done

echo "Clean install complete. Restart Antigravity after each Git pull."
