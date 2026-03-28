#!/usr/bin/env bash
set -euo pipefail

# Usage: 05_run_step13_mcp_rewrap.sh <SCRIPT_DIR> <MAIN_DIR>
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <SCRIPT_DIR> <MAIN_DIR>" >&2
  exit 1
fi

SCRIPT_DIR="$1"
MAIN_DIR="$2"
source "$SCRIPT_DIR/scripts/pipeline_helpers.sh"
STEP_OUT="$MAIN_DIR/claude_outputs/step13_output.json"
PIPELINE_DIR="$MAIN_DIR/.pipeline"
MARKER="$PIPELINE_DIR/05_step13_done"
GAP_REPORT="$MAIN_DIR/reports/gap_analysis.json"
STEP_SKIP_EXIT_CODE=10
mkdir -p "$PIPELINE_DIR"

STEP13_PROMPT="$SCRIPT_DIR/prompts/step13_prompt.md"

echo "05: step 13 MCP re-wrap -> $STEP_OUT" >&2

if [[ -f "$MARKER" ]]; then
  echo "05: step 13 already done (marker exists)" >&2
  exit 0
fi

# Skip if tutorial-only track (step 4 already wrapped everything)
if [[ -f "$GAP_REPORT" ]]; then
  track=$(python3 -c "import json; d=json.load(open('$GAP_REPORT')); print(d.get('track','implementation'))" 2>/dev/null || echo "implementation")
  if [[ "$track" == "tutorial" ]]; then
    echo "05: SKIP - tutorial track, no new tools from implementation to wrap" >&2
    touch "$MARKER"
    exit $STEP_SKIP_EXIT_CODE
  fi
fi

# Skip if no experiment code was produced
if ! find "$MAIN_DIR/src/experiments" -maxdepth 2 -name "*.py" -type f 2>/dev/null | grep -q .; then
  echo "05: SKIP - no experiment code found, nothing new to wrap" >&2
  touch "$MARKER"
  exit $STEP_SKIP_EXIT_CODE
fi

# Export paths for the prompt
export experiments_dir="$MAIN_DIR/src/experiments"
export tools_dir="$MAIN_DIR/tools"
export results_dir="$MAIN_DIR/reports/experiment_results"
export existing_mcp=""
# Find existing MCP server if any
if find "$MAIN_DIR/src" -maxdepth 1 -type f -name "*_mcp.py" 2>/dev/null | grep -q .; then
  existing_mcp=$(find "$MAIN_DIR/src" -maxdepth 1 -type f -name "*_mcp.py" | head -1)
fi
export existing_mcp

ENVSUBST_BIN="$(require_cli envsubst)"
CLAUDE_BIN="$(require_cli claude)"

"$ENVSUBST_BIN" < "$STEP13_PROMPT" | "$CLAUDE_BIN" --model claude-sonnet-4-20250514 \
  --verbose --output-format stream-json \
  --dangerously-skip-permissions -p - > "$STEP_OUT"

if search_text 'Would you like me to|Could you clarify' "$STEP_OUT"; then
  echo "05: ERROR - step 13 asked for clarification instead of re-wrapping MCP" >&2
  exit 1
fi

touch "$MARKER"
