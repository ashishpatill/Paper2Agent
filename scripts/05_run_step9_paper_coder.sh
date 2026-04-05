#!/usr/bin/env bash
set -euo pipefail

# Usage: 05_run_step9_paper_coder.sh <SCRIPT_DIR> <MAIN_DIR>
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <SCRIPT_DIR> <MAIN_DIR>" >&2
  exit 1
fi

SCRIPT_DIR="$1"
MAIN_DIR="$2"
source "$SCRIPT_DIR/scripts/pipeline_helpers.sh"
STEP_OUT="$MAIN_DIR/claude_outputs/step9_output.json"
PIPELINE_DIR="$MAIN_DIR/.pipeline"
MARKER="$PIPELINE_DIR/05_step9_done"
GAP_REPORT="$MAIN_DIR/reports/gap_analysis.json"
STEP_SKIP_EXIT_CODE=10
mkdir -p "$PIPELINE_DIR" "$MAIN_DIR/src/experiments"

STEP9_PROMPT="$SCRIPT_DIR/prompts/step9_prompt.md"

echo "05: step 9 paper coder -> $STEP_OUT" >&2

if [[ -f "$MARKER" ]]; then
  echo "05: step 9 already done (marker exists)" >&2
  exit 0
fi

# Check if gap analysis says we should skip implementation
if [[ -f "$GAP_REPORT" ]]; then
  track=$(python3 -c "import json; d=json.load(open('$GAP_REPORT')); print(d.get('track','implementation'))" 2>/dev/null || echo "implementation")
  if [[ "$track" == "tutorial" ]]; then
    echo "05: SKIP - gap analysis track is 'tutorial' (coverage > 0.7), no implementation needed" >&2
    touch "$MARKER"
    exit $STEP_SKIP_EXIT_CODE
  fi
fi

# Detect hardware profile for code generation context
hw_gpu="none"
hw_vram="0"
hw_tier="cpu"
if command -v nvidia-smi &>/dev/null; then
  hw_gpu=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "unknown")
  hw_vram=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 || echo "0")
  hw_tier="gpu"
elif python3 -c "import torch; assert torch.backends.mps.is_available()" 2>/dev/null; then
  hw_gpu="Apple Silicon MPS"
  hw_vram="shared"
  hw_tier="mps"
fi

export hw_gpu hw_vram hw_tier
export gap_report_path="$GAP_REPORT"

# Acquire datasets before generating experiment code
NPX_BIN="$(resolve_cli npx 2>/dev/null || echo "")"
if [[ -n "$NPX_BIN" ]]; then
  PAPER_ANALYSIS=""
  for candidate in \
    "$MAIN_DIR/reports/paper-analysis.json" \
    "$MAIN_DIR/../.paper2agent/jobs/*/paper-analysis.json"; do
    if [[ -f "$candidate" ]]; then
      PAPER_ANALYSIS="$candidate"
      break
    fi
  done
  echo "05: step 9 - acquiring datasets..." >&2
  "$NPX_BIN" tsx "$SCRIPT_DIR/scripts/acquire-datasets.ts" \
    "$SCRIPT_DIR" "$MAIN_DIR" "${PAPER_ANALYSIS:-}" 2>&1 || true
fi

# Inject cross-run learning overlay
export evolution_overlay
evolution_overlay="$(generate_overlay "$SCRIPT_DIR" "$MAIN_DIR" 9 "$github_repo_name")"

# Generate envsubstituted prompt and run with provider-agnostic agent
TEMP_PROM="$MAIN_DIR/.pipeline/step9_prompt.envsubst"
ENVSUBST_BIN="$(require_cli envsubst)"
"$ENVSUBST_BIN" < "$STEP9_PROMPT" > "$TEMP_PROM"
run_pipeline_agent "$TEMP_PROM" "$STEP_OUT"

if search_text 'Would you like me to|Could you clarify' "$STEP_OUT"; then
  echo "05: ERROR - step 9 asked for clarification instead of generating code" >&2
  exit 1
fi

# Validate that experiment code was generated
if ! find "$MAIN_DIR/src/experiments" -maxdepth 2 -name "*.py" -type f 2>/dev/null | grep -q .; then
  echo "05: ERROR - step 9 completed without generating any experiment code in src/experiments/" >&2
  exit 1
fi

touch "$MARKER"

if [[ -n "$NPX_BIN" ]]; then
  "$NPX_BIN" tsx "$SCRIPT_DIR/scripts/build-replication-outcome.ts" "$MAIN_DIR" >/dev/null 2>&1 || true
fi
