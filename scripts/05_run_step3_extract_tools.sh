#!/usr/bin/env bash
set -euo pipefail

# Usage: 05c_run_step3_extract.sh <SCRIPT_DIR> <MAIN_DIR> [api_key]
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <SCRIPT_DIR> <MAIN_DIR> [api_key]" >&2
  exit 1
fi

SCRIPT_DIR="$1"
MAIN_DIR="$2"
api_key="${3:-}"
STEP_OUT="$MAIN_DIR/claude_outputs/step3_output.json"
PIPELINE_DIR="$MAIN_DIR/.pipeline"
MARKER="$PIPELINE_DIR/05_step3_done"
mkdir -p "$PIPELINE_DIR"

STEP3_PROMPT="$SCRIPT_DIR/prompts/step3_prompt.md"

echo "05: step 3 extracting tools -> $STEP_OUT" >&2

if [[ -f "$MARKER" ]]; then
  echo "05: step 3 already done (marker exists)" >&2
  exit 0
fi

if [[ ! -s "$MAIN_DIR/reports/executed_notebooks.json" ]]; then
  echo "05: ERROR - step 3 requires reports/executed_notebooks.json from step 2" >&2
  exit 1
fi

export api_key="$api_key"

envsubst < "$STEP3_PROMPT" | claude --model claude-sonnet-4-20250514 \
  --verbose --output-format stream-json \
  --dangerously-skip-permissions -p - > "$STEP_OUT"

if rg -qi 'Would you like me to|Could you clarify|What would you like me to do' "$STEP_OUT"; then
  echo "05: ERROR - step 3 asked for clarification instead of extracting tools" >&2
  exit 1
fi

if ! find "$MAIN_DIR/src/tools" -maxdepth 1 -type f -name "*.py" | grep -q .; then
  echo "05: ERROR - step 3 completed without generating any source files in src/tools/" >&2
  exit 1
fi

if rg -qi 'AlphaPOP|score_batch|alphagenome|templates/' "$MAIN_DIR/src" "$MAIN_DIR/tests" "$STEP_OUT"; then
  echo "05: ERROR - step 3 generated template/example content instead of paper-specific source files" >&2
  exit 1
fi

touch "$MARKER"
