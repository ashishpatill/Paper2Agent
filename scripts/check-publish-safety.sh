#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

blocked_paths=(
  ".paper2agent/"
  ".env.local"
  ".claude/settings.local.json"
)

echo "Checking for staged local-only files..."

staged_files=$(git diff --cached --name-only || true)
if [[ -z "$staged_files" ]]; then
  echo "No staged files detected."
else
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    for blocked in "${blocked_paths[@]}"; do
      if [[ "$blocked" == */ ]]; then
        if [[ "$file" == "$blocked"* ]]; then
          echo "ERROR: staged local-only path detected: $file" >&2
          exit 1
        fi
      elif [[ "$file" == "$blocked" ]]; then
        echo "ERROR: staged local-only path detected: $file" >&2
        exit 1
      fi
    done
  done <<< "$staged_files"
fi

echo "Checking ignored runtime paths for accidental tracking..."

tracked_sensitive=0
for blocked in "${blocked_paths[@]}"; do
  if git ls-files --error-unmatch "$blocked" >/dev/null 2>&1; then
    echo "ERROR: tracked sensitive path detected: $blocked" >&2
    tracked_sensitive=1
  fi
done

if [[ $tracked_sensitive -ne 0 ]]; then
  exit 1
fi

echo "Publish safety check passed."
