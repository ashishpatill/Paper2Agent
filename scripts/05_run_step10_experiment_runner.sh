#!/usr/bin/env bash
set -euo pipefail

# Usage: 05_run_step10_experiment_runner.sh <SCRIPT_DIR> <MAIN_DIR> <REPO_NAME>
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <SCRIPT_DIR> <MAIN_DIR> <REPO_NAME>" >&2
  exit 1
fi

SCRIPT_DIR="$1"
MAIN_DIR="$2"
REPO_NAME="$3"
source "$SCRIPT_DIR/scripts/pipeline_helpers.sh"
STEP_OUT="$MAIN_DIR/claude_outputs/step10_output.json"
PIPELINE_DIR="$MAIN_DIR/.pipeline"
MARKER="$PIPELINE_DIR/05_step10_done"
GAP_REPORT="$MAIN_DIR/reports/gap_analysis.json"
RESULTS_DIR="$MAIN_DIR/reports/experiment_results"
STEP_SKIP_EXIT_CODE=10
mkdir -p "$PIPELINE_DIR" "$RESULTS_DIR"

STEP10_PROMPT="$SCRIPT_DIR/prompts/step10_prompt.md"

echo "05: step 10 experiment runner -> $STEP_OUT" >&2

if [[ -f "$MARKER" ]]; then
  echo "05: step 10 already done (marker exists)" >&2
  exit 0
fi

# Skip if gap analysis says tutorial track
if [[ -f "$GAP_REPORT" ]]; then
  track=$(python3 -c "import json; d=json.load(open('$GAP_REPORT')); print(d.get('track','implementation'))" 2>/dev/null || echo "implementation")
  if [[ "$track" == "tutorial" ]]; then
    echo "05: SKIP - gap analysis track is 'tutorial', no experiments to run" >&2
    touch "$MARKER"
    exit $STEP_SKIP_EXIT_CODE
  fi
fi

# Skip if no experiment code exists
if ! find "$MAIN_DIR/src/experiments" -maxdepth 2 -name "*.py" -type f 2>/dev/null | grep -q .; then
  echo "05: SKIP - no experiment code found in src/experiments/" >&2
  touch "$MARKER"
  exit $STEP_SKIP_EXIT_CODE
fi

# Activate the project environment if it exists
ENV_PATH="$MAIN_DIR/${REPO_NAME}-env"
if [[ -d "$ENV_PATH" ]]; then
  export experiment_env_path="$ENV_PATH"
else
  export experiment_env_path=""
fi

export results_dir="$RESULTS_DIR"
export experiments_dir="$MAIN_DIR/src/experiments"

# Detect sandbox mode: Docker if available, otherwise subprocess
sandbox_mode="subprocess"
sandbox_network="none"
sandbox_timeout=1800
sandbox_memory="8g"
sandbox_gpu="false"

if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  sandbox_mode="docker"
  # Check for GPU passthrough availability
  if command -v nvidia-smi &>/dev/null; then
    sandbox_gpu="true"
  fi
fi

export sandbox_mode sandbox_network sandbox_timeout sandbox_memory sandbox_gpu

# Inject cross-run learning overlay
export evolution_overlay
evolution_overlay="$(generate_overlay "$SCRIPT_DIR" "$MAIN_DIR" 10 "$REPO_NAME")"

ENVSUBST_BIN="$(require_cli envsubst)"
CLAUDE_BIN="$(require_cli claude)"

"$ENVSUBST_BIN" < "$STEP10_PROMPT" | "$CLAUDE_BIN" --model claude-sonnet-4-20250514 \
  --verbose --output-format stream-json \
  --dangerously-skip-permissions -p - > "$STEP_OUT"

if search_text 'Would you like me to|Could you clarify' "$STEP_OUT"; then
  echo "05: ERROR - step 10 asked for clarification instead of running experiments" >&2
  exit 1
fi

# Check that at least some results were produced
if ! find "$RESULTS_DIR" -maxdepth 2 -name "*.json" -type f 2>/dev/null | grep -q .; then
  echo "05: WARNING - no result JSON files found in reports/experiment_results/" >&2
  # Don't fail — partial results are acceptable
fi

touch "$MARKER"
