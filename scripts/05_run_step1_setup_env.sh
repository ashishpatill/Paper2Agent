#!/usr/bin/env bash
set -euo pipefail

# Usage: 05_run_step1_setup_env.sh <SCRIPT_DIR> <MAIN_DIR> <repo_name> [tutorial_filter]
if [[ $# -lt 3 ]]; then
  echo "Usage: $0 <SCRIPT_DIR> <MAIN_DIR> <repo_name> [tutorial_filter]" >&2
  exit 1
fi

SCRIPT_DIR="$1"
MAIN_DIR="$2"
repo_name="$3"
tutorial_filter="${4:-}"
source "$SCRIPT_DIR/scripts/pipeline_helpers.sh"
STEP_OUT="$MAIN_DIR/claude_outputs/step1_output.json"
PIPELINE_DIR="$MAIN_DIR/.pipeline"
MARKER="$PIPELINE_DIR/05_step1_done"
mkdir -p "$PIPELINE_DIR"

STEP1_PROMPT="$SCRIPT_DIR/prompts/step1_prompt.md"

# Only output stdout when command-substituted: no final echo (this script is typically run directly).
echo "05: step1 prompt -> $STEP_OUT" >&2

if [[ -f "$MARKER" ]]; then
  echo "05: step 1 already done (marker exists)" >&2
  exit 0
fi

export github_repo_name="$repo_name"
export tutorial_filter="$tutorial_filter"

ENVSUBST_BIN="$(require_cli envsubst)"
CLAUDE_BIN="$(require_cli claude)"

"$ENVSUBST_BIN" < "$STEP1_PROMPT" | "$CLAUDE_BIN" \
  --model claude-sonnet-4-20250514 \
  --verbose \
  --output-format stream-json \
  --dangerously-skip-permissions \
  -p - > "$STEP_OUT"

if search_text 'Would you like me to|Could you clarify|What would you like me to do' "$STEP_OUT"; then
  echo "05: ERROR - step 1 asked for clarification instead of executing the tutorial scan" >&2
  exit 1
fi

SCAN_JSON="$MAIN_DIR/reports/tutorial-scanner.json"
INCLUDE_JSON="$MAIN_DIR/reports/tutorial-scanner-include-in-tools.json"

if [[ ! -s "$SCAN_JSON" || ! -s "$INCLUDE_JSON" ]]; then
  echo "05: ERROR - step 1 did not produce tutorial scanner reports for repo/${repo_name}" >&2
  exit 1
fi

if search_text 'AlphaPOP|score_batch|alphagenome|templates/' "$SCAN_JSON" "$INCLUDE_JSON"; then
  echo "05: ERROR - step 1 output referenced template/example assets instead of the target repository" >&2
  exit 1
fi

touch "$MARKER"
