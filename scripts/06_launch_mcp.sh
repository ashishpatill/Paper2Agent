#!/usr/bin/env bash
set -euo pipefail

# Usage: 06_launch_mcp.sh <MAIN_DIR> <repo_name>
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <MAIN_DIR> <repo_name>" >&2
  exit 1
fi

MAIN_DIR="$1"
repo_name="$2"
PIPELINE_DIR="$MAIN_DIR/.pipeline"
MARKER="$PIPELINE_DIR/06_mcp_done"
mkdir -p "$PIPELINE_DIR"

TOOL_PY="$MAIN_DIR/src/${repo_name}_mcp.py"

echo "06: launching MCP for $repo_name" >&2

if [[ -f "$MARKER" ]]; then
  echo "06: already launched (marker exists)" >&2
  exit 0
fi

if [[ -f "$TOOL_PY" ]]; then
  echo "06: found ${TOOL_PY}, adding to local mcp connected to claude-code" >&2
fi

# Add (idempotent enough for our purpose) and then call gemini
fastmcp install claude-code $TOOL_PY --python ${MAIN_DIR}/${repo_name}-env/bin/python

# Launch client (this is interactive - we still call it)
claude || echo "06: claude code client exited" >&2

touch "$MARKER"
