#!/usr/bin/env bash
set -euo pipefail

# Usage: 05_run_step11_results_comparator.sh <SCRIPT_DIR> <MAIN_DIR>
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <SCRIPT_DIR> <MAIN_DIR>" >&2
  exit 1
fi

SCRIPT_DIR="$1"
MAIN_DIR="$2"
source "$SCRIPT_DIR/scripts/pipeline_helpers.sh"
STEP_OUT="$MAIN_DIR/claude_outputs/step11_output.json"
PIPELINE_DIR="$MAIN_DIR/.pipeline"
MARKER="$PIPELINE_DIR/05_step11_done"
GAP_REPORT="$MAIN_DIR/reports/gap_analysis.json"
RESULTS_DIR="$MAIN_DIR/reports/experiment_results"
COMPARISON_REPORT="$MAIN_DIR/reports/results_comparison.json"
STEP_SKIP_EXIT_CODE=10
mkdir -p "$PIPELINE_DIR"
NPX_BIN="$(resolve_cli npx 2>/dev/null || echo "")"

STEP11_PROMPT="$SCRIPT_DIR/prompts/step11_prompt.md"

echo "05: step 11 results comparator -> $STEP_OUT" >&2

if [[ -f "$MARKER" ]]; then
  echo "05: step 11 already done (marker exists)" >&2
  exit 0
fi

# Skip if gap analysis says tutorial track
if [[ -f "$GAP_REPORT" ]]; then
  track=$(python3 -c "import json; d=json.load(open('$GAP_REPORT')); print(d.get('track','implementation'))" 2>/dev/null || echo "implementation")
  if [[ "$track" == "tutorial" ]]; then
    echo "05: SKIP - gap analysis track is 'tutorial', no comparison needed" >&2
    touch "$MARKER"
    exit $STEP_SKIP_EXIT_CODE
  fi
fi

# Skip if no experiment results exist
if ! find "$RESULTS_DIR" -maxdepth 2 -name "*.json" -type f 2>/dev/null | grep -q .; then
  echo "05: SKIP - no experiment results found to compare" >&2
  touch "$MARKER"
  exit $STEP_SKIP_EXIT_CODE
fi

export results_dir="$RESULTS_DIR"
export comparison_report_path="$COMPARISON_REPORT"

# Generate envsubstituted prompt and run with provider-agnostic agent
TEMP_PROM="$MAIN_DIR/.pipeline/step11_prompt.envsubst"
ENVSUBST_BIN="$(require_cli envsubst)"
"$ENVSUBST_BIN" < "$STEP11_PROMPT" > "$TEMP_PROM"
run_pipeline_agent "$TEMP_PROM" "$STEP_OUT"

if search_text 'Would you like me to|Could you clarify' "$STEP_OUT"; then
  echo "05: ERROR - step 11 asked for clarification instead of comparing results" >&2
  exit 1
fi

# Read comparison outcome
if [[ -f "$COMPARISON_REPORT" ]]; then
  match=$(python3 -c "import json; d=json.load(open('$COMPARISON_REPORT')); print(d.get('overall_match','unknown'))" 2>/dev/null || echo "unknown")
  score=$(python3 -c "import json; d=json.load(open('$COMPARISON_REPORT')); print(d.get('match_score',0))" 2>/dev/null || echo "0")
  echo "05: step 11 comparison complete - match=$match score=$score" >&2
else
  echo "05: WARNING - results_comparison.json not generated" >&2
fi

touch "$MARKER"

if [[ -n "$NPX_BIN" ]]; then
  "$NPX_BIN" tsx "$SCRIPT_DIR/scripts/build-replication-outcome.ts" "$MAIN_DIR" >/dev/null 2>&1 || true
fi
