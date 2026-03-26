#!/usr/bin/env bash
set -euo pipefail

# Usage: 05b_run_step2_execute.sh <SCRIPT_DIR> <MAIN_DIR> [api_key]
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <SCRIPT_DIR> <MAIN_DIR> [api_key]" >&2
  exit 1
fi

SCRIPT_DIR="$1"
MAIN_DIR="$2"
api_key="${3:-}"
source "$SCRIPT_DIR/scripts/pipeline_helpers.sh"
STEP_OUT="$MAIN_DIR/claude_outputs/step2_output.json"
PIPELINE_DIR="$MAIN_DIR/.pipeline"
MARKER="$PIPELINE_DIR/05_step2_done"
mkdir -p "$PIPELINE_DIR"
STEP2_PROMPT="$SCRIPT_DIR/prompts/step2_prompt.md"

echo "05: step 2 executing tutorials -> $STEP_OUT" >&2

if [[ -f "$MARKER" ]]; then
  echo "05: step 2 already done (marker exists)" >&2
  exit 0
fi

if [[ ! -s "$MAIN_DIR/reports/tutorial-scanner-include-in-tools.json" ]]; then
  echo "05: ERROR - step 2 requires reports/tutorial-scanner-include-in-tools.json from step 1" >&2
  exit 1
fi

if [[ "$(jq '.tutorials | length' "$MAIN_DIR/reports/tutorial-scanner-include-in-tools.json" 2>/dev/null || echo 0)" -eq 0 ]]; then
  echo "05: SKIP - target repository has no runnable tutorials to execute. Step 3 will extract tools directly from source code." >&2
  exit 10
fi

export api_key="$api_key"

ENVSUBST_BIN="$(require_cli envsubst)"
CLAUDE_BIN="$(require_cli claude)"

"$ENVSUBST_BIN" < "$STEP2_PROMPT" | "$CLAUDE_BIN" --model claude-sonnet-4-20250514 \
  --verbose --output-format stream-json \
  --dangerously-skip-permissions -p - > "$STEP_OUT"

if search_text 'Would you like me to|Could you clarify|What would you like me to do' "$STEP_OUT"; then
  echo "05: ERROR - step 2 asked for clarification instead of executing tutorials" >&2
  exit 1
fi

EXECUTED_JSON="$MAIN_DIR/reports/executed_notebooks.json"

if [[ ! -s "$EXECUTED_JSON" ]]; then
  echo "05: ERROR - step 2 did not produce reports/executed_notebooks.json" >&2
  exit 1
fi

if search_text 'AlphaPOP|score_batch|alphagenome|templates/' "$EXECUTED_JSON" "$STEP_OUT"; then
  echo "05: ERROR - step 2 output referenced template/example assets instead of the target repository" >&2
  exit 1
fi

touch "$MARKER"
