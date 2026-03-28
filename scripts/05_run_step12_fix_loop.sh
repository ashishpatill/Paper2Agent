#!/usr/bin/env bash
set -euo pipefail

# Usage: 05_run_step12_fix_loop.sh <SCRIPT_DIR> <MAIN_DIR> <REPO_NAME>
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <SCRIPT_DIR> <MAIN_DIR> <REPO_NAME>" >&2
  exit 1
fi

SCRIPT_DIR="$1"
MAIN_DIR="$2"
REPO_NAME="$3"
source "$SCRIPT_DIR/scripts/pipeline_helpers.sh"
PIPELINE_DIR="$MAIN_DIR/.pipeline"
MARKER="$PIPELINE_DIR/05_step12_done"
GAP_REPORT="$MAIN_DIR/reports/gap_analysis.json"
COMPARISON_REPORT="$MAIN_DIR/reports/results_comparison.json"
FIX_LOOP_DIR="$MAIN_DIR/reports/fix_loop"
STEP_SKIP_EXIT_CODE=10
MAX_FIX_ATTEMPTS=3
mkdir -p "$PIPELINE_DIR" "$FIX_LOOP_DIR"

STEP12_PROMPT="$SCRIPT_DIR/prompts/step12_prompt.md"

echo "05: step 12 fix loop -> $FIX_LOOP_DIR" >&2

if [[ -f "$MARKER" ]]; then
  echo "05: step 12 already done (marker exists)" >&2
  exit 0
fi

# Skip if gap analysis says tutorial track
if [[ -f "$GAP_REPORT" ]]; then
  track=$(python3 -c "import json; d=json.load(open('$GAP_REPORT')); print(d.get('track','implementation'))" 2>/dev/null || echo "implementation")
  if [[ "$track" == "tutorial" ]]; then
    echo "05: SKIP - gap analysis track is 'tutorial', no fix loop needed" >&2
    touch "$MARKER"
    exit $STEP_SKIP_EXIT_CODE
  fi
fi

# Skip if no comparison report exists
if [[ ! -f "$COMPARISON_REPORT" ]]; then
  echo "05: SKIP - no results comparison report found, nothing to fix" >&2
  touch "$MARKER"
  exit $STEP_SKIP_EXIT_CODE
fi

# Check if results already match well enough
match=$(python3 -c "import json; d=json.load(open('$COMPARISON_REPORT')); print(d.get('overall_match','mismatch'))" 2>/dev/null || echo "mismatch")
match_score=$(python3 -c "import json; d=json.load(open('$COMPARISON_REPORT')); print(d.get('match_score',0))" 2>/dev/null || echo "0")

if python3 -c "exit(0 if float('$match_score') >= 0.8 else 1)" 2>/dev/null; then
  echo "05: SKIP - results match score ($match_score) >= 0.8, no fix loop needed" >&2
  touch "$MARKER"
  exit 0
fi

echo "05: step 12 starting fix loop (match=$match, score=$match_score, max_attempts=$MAX_FIX_ATTEMPTS)" >&2

ENVSUBST_BIN="$(require_cli envsubst)"
CLAUDE_BIN="$(require_cli claude)"

# Activate the project environment if it exists
ENV_PATH="$MAIN_DIR/${REPO_NAME}-env"
if [[ -d "$ENV_PATH" ]]; then
  export experiment_env_path="$ENV_PATH"
else
  export experiment_env_path=""
fi

export fix_loop_dir="$FIX_LOOP_DIR"
export comparison_report_path="$COMPARISON_REPORT"
export experiments_dir="$MAIN_DIR/src/experiments"
export results_dir="$MAIN_DIR/reports/experiment_results"
export max_fix_attempts="$MAX_FIX_ATTEMPTS"

# Inject cross-run learning overlay
export evolution_overlay
evolution_overlay="$(generate_overlay "$SCRIPT_DIR" "$MAIN_DIR" 12 "$REPO_NAME")"

# The fix loop runs as a single Claude session that iterates internally.
# It reads the comparison report, identifies failing experiments,
# modifies code, re-runs, and re-compares — up to MAX_FIX_ATTEMPTS times.
STEP_OUT="$MAIN_DIR/claude_outputs/step12_output.json"

"$ENVSUBST_BIN" < "$STEP12_PROMPT" | "$CLAUDE_BIN" --model claude-sonnet-4-20250514 \
  --verbose --output-format stream-json \
  --dangerously-skip-permissions -p - > "$STEP_OUT"

if search_text 'Would you like me to|Could you clarify' "$STEP_OUT"; then
  echo "05: ERROR - step 12 asked for clarification instead of fixing experiments" >&2
  exit 1
fi

# Report final state
if [[ -f "$FIX_LOOP_DIR/fix_loop_state.json" ]]; then
  converged=$(python3 -c "import json; d=json.load(open('$FIX_LOOP_DIR/fix_loop_state.json')); print(d.get('converged', False))" 2>/dev/null || echo "false")
  attempts=$(python3 -c "import json; d=json.load(open('$FIX_LOOP_DIR/fix_loop_state.json')); print(d.get('current_attempt', 0))" 2>/dev/null || echo "0")
  echo "05: step 12 fix loop complete - converged=$converged after $attempts attempts" >&2
else
  echo "05: WARNING - fix_loop_state.json not generated" >&2
fi

touch "$MARKER"
