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
source "$SCRIPT_DIR/scripts/pipeline_helpers.sh"
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
  # No executed notebooks - check if there is source code to extract tools from directly
  if ! find "$MAIN_DIR/repo" -maxdepth 5 -name "*.py" -not -path "*/.git/*" 2>/dev/null | grep -q .; then
    echo "05: ERROR - step 3 requires either executed notebooks or Python source code in repo/" >&2
    exit 1
  fi
  echo "05: no executed_notebooks.json - will extract tools directly from source code in repo/" >&2
  export code_only_extraction=1
else
  export code_only_extraction=0
fi

export api_key="$api_key"

# Generate envsubstituted prompt and run with provider-agnostic agent
TEMP_PROM="$MAIN_DIR/.pipeline/step3_prompt.envsubst"
ENVSUBST_BIN="$(require_cli envsubst)"
"$ENVSUBST_BIN" < "$STEP3_PROMPT" > "$TEMP_PROM"
run_pipeline_agent "$TEMP_PROM" "$STEP_OUT"

if search_text 'Would you like me to|Could you clarify|What would you like me to do' "$STEP_OUT"; then
  echo "05: ERROR - step 3 asked for clarification instead of extracting tools" >&2
  exit 1
fi

if ! find "$MAIN_DIR/src/tools" -maxdepth 1 -type f -name "*.py" | grep -q .; then
  echo "05: ERROR - step 3 completed without generating any source files in src/tools/" >&2
  exit 1
fi

if search_text 'AlphaPOP|score_batch|alphagenome|templates/' "$MAIN_DIR/src" "$MAIN_DIR/tests" "$STEP_OUT"; then
  echo "05: ERROR - step 3 generated template/example content instead of paper-specific source files" >&2
  exit 1
fi

touch "$MARKER"
