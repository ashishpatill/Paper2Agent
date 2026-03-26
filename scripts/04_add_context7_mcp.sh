#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/pipeline_helpers.sh"

# Usage: 04_add_context_mcp.sh <MAIN_DIR>
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <MAIN_DIR>" >&2
  exit 1
fi

MAIN_DIR="$1"
PIPELINE_DIR="$MAIN_DIR/.pipeline"
MARKER="$PIPELINE_DIR/04_context7_done"
mkdir -p "$PIPELINE_DIR"

echo "04: adding context7 MCP (idempotent)" >&2

if [[ -f "$MARKER" ]]; then
  echo "04: already added (marker exists)" >&2
  exit 0
fi

CLAUDE_BIN="$(require_cli claude)" || exit 0
NPX_BIN="$(require_cli npx)" || exit 0
PYTHON_BIN="$(require_cli python3)" || exit 0

"$PYTHON_BIN" - "$MARKER" "$CLAUDE_BIN" "$NPX_BIN" <<'PY'
from pathlib import Path
import subprocess
import sys

marker_path = Path(sys.argv[1])
claude_bin = sys.argv[2]
npx_bin = sys.argv[3]
command = [
    claude_bin,
    "mcp",
    "add",
    "context7",
    "--",
    npx_bin,
    "-y",
    "@upstash/context7-mcp@latest",
]

try:
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=12,
        check=False,
    )
except subprocess.TimeoutExpired as exc:
    if exc.stdout:
        sys.stdout.write(exc.stdout)
    if exc.stderr:
        sys.stderr.write(exc.stderr)
    marker_path.touch()
    print(
        "04: warning - timed out while adding context7 MCP, treating as optional and continuing",
        file=sys.stderr,
    )
    sys.exit(0)

if completed.stdout:
    sys.stdout.write(completed.stdout)
if completed.stderr:
    sys.stderr.write(completed.stderr)

combined = "\n".join(filter(None, [completed.stdout, completed.stderr])).lower()
if completed.returncode == 0 or "already exists" in combined:
    marker_path.touch()
    print("04: context7 ready", file=sys.stderr)
    sys.exit(0)

print("04: warning - failed to add context7 MCP, continuing", file=sys.stderr)
sys.exit(0)
PY
