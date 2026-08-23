#!/bin/sh

set -eu

# Resolve the repository from this script's location, regardless of the
# directory from which the script is run.
SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" && pwd -P)
REPOSITORY_ROOT=$(CDPATH= cd "$SCRIPT_DIR/.." && pwd -P)
EXTENSIONS_DIR="$REPOSITORY_ROOT/clients/gemini/extensions"
PLUGINS_DIR=${ANTIGRAVITY_PLUGINS_DIR:-"$HOME/.gemini/config/plugins"}

if [ ! -d "$EXTENSIONS_DIR" ]; then
  echo "Error: Gemini extensions were not found at $EXTENSIONS_DIR" >&2
  exit 1
fi

FOUND_EXTENSION=false
for SOURCE in "$EXTENSIONS_DIR"/*; do
  if [ -d "$SOURCE" ] && [ -f "$SOURCE/plugin.json" ] && [ -f "$SOURCE/.bos-product.json" ]; then
    FOUND_EXTENSION=true
  fi
done

if [ "$FOUND_EXTENSION" != true ]; then
  echo "Error: no generated BOS plugins were found in $EXTENSIONS_DIR" >&2
  exit 1
fi

echo "Clean install: removing prior BOS plugins without backups."
mkdir -p "$PLUGINS_DIR"

# Remove every installed BOS product so stale copies and old product names
# cannot coexist with the repository-backed links.
for TARGET in "$PLUGINS_DIR"/*; do
  if [ -e "$TARGET/.bos-product.json" ]; then
    rm -rf "$TARGET"
  fi
done

# Replace each current product target even when it is a broken symlink or an
# unmarked legacy copy.
for SOURCE in "$EXTENSIONS_DIR"/*; do
  if [ ! -d "$SOURCE" ] || [ ! -f "$SOURCE/plugin.json" ] || [ ! -f "$SOURCE/.bos-product.json" ]; then
    continue
  fi

  NAME=$(basename "$SOURCE")
  TARGET="$PLUGINS_DIR/$NAME"
  if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
    rm -rf "$TARGET"
  fi
  ln -s "$SOURCE" "$TARGET"
  echo "Linked $TARGET -> $SOURCE"
done

echo "Clean install complete. Restart Antigravity after each Git pull."
