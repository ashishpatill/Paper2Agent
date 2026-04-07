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

# Resolve npx for downstream readiness report builder
NPX_BIN="$(resolve_cli npx 2>/dev/null || echo "")"

# Generate a temp prompt file for run_pipeline_agent (it expects a file path)
TEMP_PROM="$MAIN_DIR/.pipeline/step1_prompt.envsubst"
ENVSUBST_BIN="$(require_cli envsubst)"
"$ENVSUBST_BIN" < "$STEP1_PROMPT" > "$TEMP_PROM"

# Use provider-agnostic pipeline agent (respects PAPER2AGENT_CLI env var)
run_pipeline_agent "$TEMP_PROM" "$STEP_OUT"

if search_text 'Would you like me to|Could you clarify|What would you like me to do' "$STEP_OUT"; then
  echo "05: ERROR - step 1 asked for clarification instead of executing the tutorial scan" >&2
  exit 1
fi

SCAN_JSON="$MAIN_DIR/reports/tutorial-scanner.json"
INCLUDE_JSON="$MAIN_DIR/reports/tutorial-scanner-include-in-tools.json"
SETUP_JSON="$MAIN_DIR/reports/setup-readiness.json"

if [[ ! -s "$SCAN_JSON" || ! -s "$INCLUDE_JSON" ]]; then
  echo "05: ERROR - step 1 did not produce tutorial scanner reports for repo/${repo_name}" >&2
  exit 1
fi

if search_text 'AlphaPOP|score_batch|alphagenome|templates/' "$SCAN_JSON" "$INCLUDE_JSON"; then
  echo "05: ERROR - step 1 output referenced template/example assets instead of the target repository" >&2
  exit 1
fi

if ! "$NPX_BIN" tsx "$SCRIPT_DIR/scripts/build-step1-readiness-report.ts" "$MAIN_DIR" "$repo_name" "$tutorial_filter" >/dev/null; then
  echo "05: ERROR - step 1 did not produce a valid reports/setup-readiness.json report" >&2
  exit 1
fi

if [[ ! -s "$SETUP_JSON" ]]; then
  echo "05: ERROR - step 1 did not produce reports/setup-readiness.json" >&2
  exit 1
fi

touch "$MARKER"
