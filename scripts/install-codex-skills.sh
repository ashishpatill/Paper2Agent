#!/usr/bin/env bash
set -euo pipefail

CODEX_HOME_DIR="${CODEX_HOME:-$HOME/.codex}"
TARGET_DIR="$CODEX_HOME_DIR/skills"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/codex-skills"

mkdir -p "$TARGET_DIR"

for skill_dir in "$SOURCE_DIR"/*; do
  skill_name="$(basename "$skill_dir")"
  target_path="$TARGET_DIR/paper2agent-$skill_name"
  rm -rf "$target_path"
  ln -s "$skill_dir" "$target_path"
  echo "Installed Codex skill: $target_path -> $skill_dir"
done

echo "Paper2Agent Codex skills are available in $TARGET_DIR"
