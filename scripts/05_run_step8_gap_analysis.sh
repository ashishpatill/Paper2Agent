#!/usr/bin/env bash
set -euo pipefail

# Usage: 05_run_step8_gap_analysis.sh <SCRIPT_DIR> <MAIN_DIR>
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <SCRIPT_DIR> <MAIN_DIR>" >&2
  exit 1
fi

SCRIPT_DIR="$1"
MAIN_DIR="$2"
source "$SCRIPT_DIR/scripts/pipeline_helpers.sh"
STEP_OUT="$MAIN_DIR/claude_outputs/step8_output.json"
PIPELINE_DIR="$MAIN_DIR/.pipeline"
MARKER="$PIPELINE_DIR/05_step8_done"
GAP_REPORT="$MAIN_DIR/reports/gap_analysis.json"
STEP_SKIP_EXIT_CODE=10
mkdir -p "$PIPELINE_DIR" "$MAIN_DIR/reports"

STEP8_PROMPT="$SCRIPT_DIR/prompts/step8_prompt.md"

echo "05: step 8 gap analysis -> $STEP_OUT" >&2

if [[ -f "$MARKER" ]]; then
  echo "05: step 8 already done (marker exists)" >&2
  exit 0
fi

# Check if paper analysis exists (needed for capabilities and reported_results)
PAPER_ANALYSIS=""
for candidate in \
  "$MAIN_DIR/reports/paper-analysis.json" \
  "$MAIN_DIR/../.paper2agent/jobs/*/paper-analysis.json"; do
  if [[ -f "$candidate" ]]; then
    PAPER_ANALYSIS="$candidate"
    break
  fi
done

# Check what tools were extracted
TOOLS_DIR="$MAIN_DIR/src/tools"
if [[ ! -d "$TOOLS_DIR" ]] || ! find "$TOOLS_DIR" -maxdepth 1 -name "*.py" -type f 2>/dev/null | grep -q .; then
  echo "05: step 8 - no extracted tools found in src/tools/, gap analysis will report 0% coverage" >&2
fi

export paper_analysis_path="${PAPER_ANALYSIS:-}"
export tools_dir="$TOOLS_DIR"

# Inject cross-run learning overlay
export evolution_overlay
evolution_overlay="$(generate_overlay "$SCRIPT_DIR" "$MAIN_DIR" 8)"

ENVSUBST_BIN="$(require_cli envsubst)"
CLAUDE_BIN="$(require_cli claude)"

"$ENVSUBST_BIN" < "$STEP8_PROMPT" | "$CLAUDE_BIN" --model claude-sonnet-4-20250514 \
  --verbose --output-format stream-json \
  --dangerously-skip-permissions -p - > "$STEP_OUT"

if search_text 'Would you like me to|Could you clarify' "$STEP_OUT"; then
  echo "05: ERROR - step 8 asked for clarification instead of analyzing gaps" >&2
  exit 1
fi

# Validate gap analysis report was generated
if [[ ! -f "$GAP_REPORT" ]]; then
  echo "05: WARNING - gap_analysis.json not generated, creating default (coverage=0)" >&2
  cat > "$GAP_REPORT" <<'DEFAULTJSON'
{
  "coverage_score": 0,
  "track": "implementation",
  "covered_capabilities": [],
  "uncovered_capabilities": [],
  "gaps": [],
  "recommended_approach": "Full implementation from paper required - no tutorial coverage found."
}
DEFAULTJSON
fi

# Read the track decision
track=$(python3 -c "import json; d=json.load(open('$GAP_REPORT')); print(d.get('track','implementation'))" 2>/dev/null || echo "implementation")
score=$(python3 -c "import json; d=json.load(open('$GAP_REPORT')); print(d.get('coverage_score',0))" 2>/dev/null || echo "0")

echo "05: step 8 gap analysis complete - coverage=$score track=$track" >&2

# Export for downstream steps
export gap_analysis_track="$track"
export gap_analysis_score="$score"

touch "$MARKER"
