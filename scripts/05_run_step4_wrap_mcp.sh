#!/usr/bin/env bash
set -euo pipefail

# Usage: 05d_run_step4_wrap.sh <SCRIPT_DIR> <MAIN_DIR>
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <SCRIPT_DIR> <MAIN_DIR>" >&2
  exit 1
fi

SCRIPT_DIR="$1"
MAIN_DIR="$2"
STEP_OUT="$MAIN_DIR/claude_outputs/step4_output.json"
PIPELINE_DIR="$MAIN_DIR/.pipeline"
MARKER="$PIPELINE_DIR/05_step4_done"
mkdir -p "$PIPELINE_DIR"

STEP4_PROMPT="$SCRIPT_DIR/prompts/step4_prompt.md"

echo "05: step 4 wrapping tools -> $STEP_OUT" >&2

if [[ -f "$MARKER" ]]; then
  echo "05: step 4 already done (marker exists)" >&2
  exit 0
fi

claude --model claude-sonnet-4-20250514 \
  --verbose --output-format stream-json \
  --dangerously-skip-permissions -p - < "$STEP4_PROMPT" > "$STEP_OUT"

if rg -qi 'Would you like me to|Could you clarify|What would you like me to do' "$STEP_OUT"; then
  echo "05: ERROR - step 4 asked for clarification instead of packaging an MCP server" >&2
  exit 1
fi

if ! find "$MAIN_DIR/src" -maxdepth 1 -type f -name "*_mcp.py" | grep -q .; then
  echo "05: ERROR - step 4 completed without generating an MCP server file in src/" >&2
  exit 1
fi

touch "$MARKER"
