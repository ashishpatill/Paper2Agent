#!/usr/bin/env bash
set -euo pipefail

# If the monitoring process (Node.js worker) dies mid-pipeline, its stdout/stderr
# pipe breaks. Without this trap, bash would receive SIGPIPE on the next echo and
# exit immediately, killing the pipeline before any more steps can run.
# With the trap, SIGPIPE is ignored: writes to broken pipes return EPIPE but the
# script continues. The || true guards below prevent set -e from catching EPIPE.
trap '' PIPE

# Verbose progress functions
VERBOSE=${VERBOSE:-1}
START_TIME=$(date +%s)
TOTAL_STEPS=18  # 4 setup steps + 13 core pipeline steps + launch MCP

log_progress() {
    local step_num=$1
    local step_name=$2
    local status=$3
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    if [[ $VERBOSE -eq 1 ]]; then
        case $status in
            "start")
                echo "[$timestamp] ▶️  Step $step_num/$TOTAL_STEPS: $step_name - STARTING" >&2 || true
                ;;
            "skip")
                echo "[$timestamp] ⏭️  Step $step_num/$TOTAL_STEPS: $step_name - SKIPPED (already done)" >&2 || true
                ;;
            "complete")
                echo "[$timestamp] ✅ Step $step_num/$TOTAL_STEPS: $step_name - COMPLETED" >&2 || true
                ;;
            "error")
                echo "[$timestamp] ❌ Step $step_num/$TOTAL_STEPS: $step_name - ERROR" >&2 || true
                ;;
        esac
        show_progress_bar $step_num
    fi
}

show_progress_bar() {
    local current=$1
    local total=$TOTAL_STEPS
    local width=30
    local percentage=$((current * 100 / total))
    local filled=$((current * width / total))
    local empty=$((width - filled))

    printf "Progress: [" >&2 || true
    printf "%*s" $filled | tr ' ' '█' >&2 || true
    printf "%*s" $empty | tr ' ' '░' >&2 || true
    printf "] %d%% (%d/%d)\n" $percentage $current $total >&2 || true
    echo >&2 || true
}

show_elapsed_time() {
    local current_time=$(date +%s)
    local elapsed=$((current_time - START_TIME))
    local minutes=$((elapsed / 60))
    local seconds=$((elapsed % 60))
    echo "⏱️  Total elapsed time: ${minutes}m ${seconds}s" >&2 || true
}

# Parse args
GITHUB_REPO_URL=""
FOLDER_NAME=""
TUTORIAL_FILTER=""
TUTORIAL_FILTER=""
API_KEY=""
PAPER_URL=""
PAPER_TITLE=""
OPERATOR_NOTES=""
PAPER2AGENT_JOB_ID=""
RUN_BENCHMARK=0
while [[ $# -gt 0 ]]; do
  case $1 in
    --project_dir)
      FOLDER_NAME="$2"
      shift 2
      ;;
    --github_url)
      GITHUB_REPO_URL="$2"
      shift 2
      ;;
    --tutorials)
      TUTORIAL_FILTER="$2"
      shift 2
      ;;
    --api)
      API_KEY="$2"
      shift 2
      ;;
    --paper_url)
      PAPER_URL="$2"
      shift 2
      ;;
    --paper_title)
      PAPER_TITLE="$2"
      shift 2
      ;;
    --notes)
      OPERATOR_NOTES="$2"
      shift 2
      ;;
    --job_id)
      PAPER2AGENT_JOB_ID="$2"
      shift 2
      ;;
    --benchmark)
      RUN_BENCHMARK=1
      shift 1
      ;;
    *)
      echo "Unknown parameter: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$GITHUB_REPO_URL" || -z "$FOLDER_NAME" ]]; then
  echo "Usage: bash Paper2Agent.sh \\" >&2
  echo "  --project_dir <project_dir> \\" >&2
  echo "  --github_url <github_repo_url> \\" >&2
  echo "  --tutorials <tutorial_filter> \\" >&2
  echo "  --api <api_key>" >&2
  echo "" >&2
  echo "  --tutorials: Optional filter for tutorials (supports natural language descriptions)" >&2
  echo "      Examples: 'data visualization', 'ML tutorial', 'preprocessing.ipynb'" >&2
  echo "  --api: Optional API key for notebook execution and testing" >&2
  echo "  --benchmark: Optional flag to run benchmark extraction and assessment (default: off)" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SETUP_STATUS="not run"
CLONE_STATUS="not run"
FOLDERS_STATUS="not run"
CONTEXT7_STATUS="not run"
MCP_STATUS="not run"
STEP_STATUS_LIST=("unused" "not run" "not run" "not run" "not run" "not run" "not run" "not run" "not run" "not run" "not run" "not run" "not run" "not run")
STEP_SKIP_EXIT_CODE=10

record_step_outcome() {
  local displayed_step_num="$1"
  local step_name="$2"
  local outcome="$3"
  local detail="${4:-}"
  local attempts="${5:-}"

  local npx_bin=""
  npx_bin="$(command -v npx 2>/dev/null || echo "")"
  if [[ -z "$npx_bin" ]]; then
    return
  fi

  "$npx_bin" tsx "$SCRIPT_DIR/scripts/update-step-outcome.ts" \
    "$MAIN_DIR" "$displayed_step_num" "$step_name" "$outcome" "$detail" "$attempts" \
    >/dev/null 2>&1 || true
}

# 1. Setup project (decide if we should run by checking marker)
MAIN_DIR="$SCRIPT_DIR/$FOLDER_NAME"
if [[ -f "$MAIN_DIR/.pipeline/01_setup_done" ]]; then
  log_progress 1 "Setup project environment" "skip"
  SETUP_STATUS="skipped"
else
  log_progress 1 "Setup project environment" "start"
  MAIN_DIR=$(bash $SCRIPT_DIR/scripts/01_setup_project.sh "$SCRIPT_DIR" "$FOLDER_NAME")
  log_progress 1 "Setup project environment" "complete"
  SETUP_STATUS="executed"
fi

cd "$MAIN_DIR"

export paper_url="$PAPER_URL"
export paper_title="$PAPER_TITLE"
BASE_OPERATOR_NOTES="$OPERATOR_NOTES"
export operator_notes="$OPERATOR_NOTES"
export paper2agent_job_id="$PAPER2AGENT_JOB_ID"

if [[ "$SETUP_STATUS" == "skipped" ]]; then
  record_step_outcome 1 "Setup project environment" "skipped" "Project setup marker already existed." 1
else
  record_step_outcome 1 "Setup project environment" "completed" "Project workspace initialized." 1
fi

# Compute repo name early so we can check clone artifact
repo_name=$(basename "$GITHUB_REPO_URL" .git)
export github_repo_name="$repo_name"

refresh_operator_notes_for_step() {
  local displayed_step_num="$1"
  export operator_notes="$BASE_OPERATOR_NOTES"

  if [[ -z "$paper2agent_job_id" ]]; then
    return
  fi

  local npx_bin
  npx_bin="$(command -v npx 2>/dev/null || echo "")"
  if [[ -z "$npx_bin" ]]; then
    return
  fi

  local feedback_overlay
  feedback_overlay="$("$npx_bin" tsx "$SCRIPT_DIR/scripts/consume-feedback.ts" "$paper2agent_job_id" "$displayed_step_num" 2>/dev/null || true)"

  if [[ -z "$feedback_overlay" ]]; then
    return
  fi

  if [[ -n "$BASE_OPERATOR_NOTES" ]]; then
    export operator_notes="${BASE_OPERATOR_NOTES}"$'\n\n'"${feedback_overlay}"
  else
    export operator_notes="$feedback_overlay"
  fi
}

# 2. Clone repo
if [[ -f "$MAIN_DIR/.pipeline/02_clone_done" ]]; then
  log_progress 2 "Clone GitHub repository" "skip"
  CLONE_STATUS="skipped"
  record_step_outcome 2 "Clone GitHub repository" "skipped" "Repository clone marker already existed." 1
else
  log_progress 2 "Clone GitHub repository" "start"
  repo_clone_path=$(bash $SCRIPT_DIR/scripts/02_clone_repo.sh "$MAIN_DIR" "$GITHUB_REPO_URL")
  repo_name=$(basename "$repo_clone_path")
  export github_repo_name="$repo_name"
  log_progress 2 "Clone GitHub repository" "complete"
  CLONE_STATUS="executed"
  record_step_outcome 2 "Clone GitHub repository" "completed" "Repository cloned into workspace." 1
fi

# 3. Prepare folders
if [[ -f "$MAIN_DIR/.pipeline/03_folders_done" ]]; then
  log_progress 3 "Prepare working directories" "skip"
  FOLDERS_STATUS="skipped"
  record_step_outcome 3 "Prepare working directories" "skipped" "Working directories were already prepared." 1
else
  log_progress 3 "Prepare working directories" "start"
  bash $SCRIPT_DIR/scripts/03_prepare_folders.sh "$MAIN_DIR"
  log_progress 3 "Prepare working directories" "complete"
  FOLDERS_STATUS="executed"
  record_step_outcome 3 "Prepare working directories" "completed" "Working directories prepared." 1
fi

# 4. Add context MCP
if [[ -f "$MAIN_DIR/.pipeline/04_context7_done" ]]; then
  log_progress 4 "Add context MCP server" "skip"
  CONTEXT7_STATUS="skipped"
  record_step_outcome 4 "Add context MCP server" "skipped" "Context MCP marker already existed." 1
else
  log_progress 4 "Add context MCP server" "start"
  bash $SCRIPT_DIR/scripts/04_add_context7_mcp.sh "$MAIN_DIR"
  log_progress 4 "Add context MCP server" "complete"
  CONTEXT7_STATUS="executed"
  record_step_outcome 4 "Add context MCP server" "completed" "Context MCP server added to workspace." 1
fi

# 5: Core Paper2Agent pipeline steps
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13; do
  OUT="$MAIN_DIR/claude_outputs/step${i}_output.json"
  MARK="$MAIN_DIR/.pipeline/05_step${i}_done"

  # Define step names
  case $i in
    1) STEP_NAME="Setup Python environment & scan tutorials" ;;
    2) STEP_NAME="Execute tutorial notebooks" ;;
    3) STEP_NAME="Extract tools from tutorials" ;;
    4) STEP_NAME="Wrap tools in MCP server" ;;
    5) STEP_NAME="Generate code coverage & quality reports" ;;
    6) STEP_NAME="Extract benchmark questions" ;;
    7) STEP_NAME="Run benchmark assessment" ;;
    8) STEP_NAME="Gap analysis (coverage scoring)" ;;
    9) STEP_NAME="Paper coder (implement gaps)" ;;
    10) STEP_NAME="Experiment runner (sandboxed)" ;;
    11) STEP_NAME="Results comparator" ;;
    12) STEP_NAME="Fix loop (convergence iteration)" ;;
    13) STEP_NAME="MCP re-wrap (implementation tools)" ;;
  esac

  if [[ -f "$MARK" ]]; then
    log_progress $((4+i)) "$STEP_NAME" "skip"
    STEP_STATUS_LIST[$i]="skipped"
    record_step_outcome $((4+i)) "$STEP_NAME" "skipped" "Step marker already existed before execution." 1
  else
    # Check if benchmark steps should be skipped
    if [[ ($i -eq 6 || $i -eq 7) && $RUN_BENCHMARK -eq 0 ]]; then
        log_progress $((4+i)) "$STEP_NAME" "skip"
        STEP_STATUS_LIST[$i]="skipped (optional)"
        record_step_outcome $((4+i)) "$STEP_NAME" "skipped" "Optional benchmark step skipped because --benchmark was not enabled." 1
        continue
    fi

    refresh_operator_notes_for_step $((4+i))
    log_progress $((4+i)) "$STEP_NAME" "start"

    # Per-step timeout thresholds (seconds) — warnings only, not kills
    case $i in
      1|2|3) STEP_TIMEOUT_SECS=600 ;;   # 10 min for env/tutorials/extract
      4|5)   STEP_TIMEOUT_SECS=300 ;;   # 5 min for MCP wrap/coverage
      6|7)   STEP_TIMEOUT_SECS=300 ;;   # 5 min for benchmarks
      8)     STEP_TIMEOUT_SECS=300 ;;   # 5 min for gap analysis
      9)     STEP_TIMEOUT_SECS=900 ;;   # 15 min for paper coder
      10)    STEP_TIMEOUT_SECS=1200 ;;  # 20 min for experiment runner
      11)    STEP_TIMEOUT_SECS=300 ;;   # 5 min for results comparator
      12)    STEP_TIMEOUT_SECS=1800 ;;  # 30 min for fix loop
      13)    STEP_TIMEOUT_SECS=600 ;;   # 10 min for MCP re-wrap
      *)     STEP_TIMEOUT_SECS=600 ;;
    esac
    export STEP_TIMEOUT_SECS

    # Start heartbeat monitor for this step's Claude output
    STEP_OUTFILE="$MAIN_DIR/claude_outputs/step${i}_output.json"
    _heartbeat_pid=""
    (
      sleep 5
      _last_size=0
      _last_desc=""
      _tick=0
      while true; do
        sleep 15
        _tick=$((_tick + 1))
        [[ -f "$STEP_OUTFILE" ]] || continue
        _cur_size=$(wc -c < "$STEP_OUTFILE" 2>/dev/null || echo 0)
        # Extract latest activity from Claude stream-json
        _desc=$(tail -3 "$STEP_OUTFILE" 2>/dev/null | grep -o '"description":"[^"]*"' | tail -1 | sed 's/"description":"//;s/"$//' 2>/dev/null || true)
        if [[ -z "$_desc" ]]; then
          _desc=$(tail -3 "$STEP_OUTFILE" 2>/dev/null | grep -o '"last_tool_name":"[^"]*"' | tail -1 | sed 's/"last_tool_name":"//;s/"$//' 2>/dev/null || true)
        fi
        _elapsed=$((_tick * 15))
        # Warn if step exceeds expected timeout (10 minutes for most steps, 20 for heavy ones)
        _warn_threshold=${STEP_TIMEOUT_SECS:-600}
        if [[ $_elapsed -eq $_warn_threshold ]]; then
          echo "  ⚠️  [${_elapsed}s] Step has exceeded ${_warn_threshold}s — may be stuck" >&2
        elif [[ $_elapsed -gt $_warn_threshold && $((_tick % 8)) -eq 0 ]]; then
          echo "  ⚠️  [${_elapsed}s] Step still running past timeout (${_cur_size} bytes output)" >&2
        fi
        if [[ -n "$_desc" && "$_desc" != "$_last_desc" ]]; then
          echo "  ↳ [${_elapsed}s] Claude: ${_desc:0:120}" >&2
          _last_desc="$_desc"
        elif [[ "$_cur_size" -gt "$_last_size" ]]; then
          echo "  ↳ [${_elapsed}s] Claude working... (${_cur_size} bytes output)" >&2
        elif [[ $((_tick % 4)) -eq 0 ]]; then
          echo "  ↳ [${_elapsed}s] Still running (${_cur_size} bytes)" >&2
        fi
        _last_size=$_cur_size
      done
    ) &
    _heartbeat_pid=$!

    MAX_STEP_RETRIES=2
    step_attempt=0
    step_succeeded=false

    while [[ $step_attempt -le $MAX_STEP_RETRIES ]]; do
      step_attempt=$((step_attempt + 1))
      if [[ $step_attempt -gt 1 ]]; then
        echo "[$( date '+%Y-%m-%d %H:%M:%S' )] 🔄 Step $i retry $((step_attempt-1))/$MAX_STEP_RETRIES: $STEP_NAME" >&2 || true
      fi

      set +e
      case $i in
        1) bash $SCRIPT_DIR/scripts/05_run_step1_setup_env.sh "$SCRIPT_DIR" "$MAIN_DIR" "$repo_name" "$TUTORIAL_FILTER" ;;
        2) bash $SCRIPT_DIR/scripts/05_run_step2_execute_tutorials.sh "$SCRIPT_DIR" "$MAIN_DIR" "$API_KEY" ;;
        3) bash $SCRIPT_DIR/scripts/05_run_step3_extract_tools.sh "$SCRIPT_DIR" "$MAIN_DIR" "$API_KEY" ;;
        4) bash $SCRIPT_DIR/scripts/05_run_step4_wrap_mcp.sh "$SCRIPT_DIR" "$MAIN_DIR" ;;
        5) bash $SCRIPT_DIR/scripts/05_run_step5_generate_coverage.sh "$SCRIPT_DIR" "$MAIN_DIR" "$repo_name" ;;
        6) bash $SCRIPT_DIR/scripts/05_run_step6_extract_benchmarks.sh "$SCRIPT_DIR" "$MAIN_DIR" "$repo_name" ;;
        7) bash $SCRIPT_DIR/scripts/05_run_step7_benchmark_assessment.sh "$SCRIPT_DIR" "$MAIN_DIR" "$repo_name" ;;
        8) bash $SCRIPT_DIR/scripts/05_run_step8_gap_analysis.sh "$SCRIPT_DIR" "$MAIN_DIR" ;;
        9) bash $SCRIPT_DIR/scripts/05_run_step9_paper_coder.sh "$SCRIPT_DIR" "$MAIN_DIR" ;;
        10) bash $SCRIPT_DIR/scripts/05_run_step10_experiment_runner.sh "$SCRIPT_DIR" "$MAIN_DIR" "$repo_name" ;;
        11) bash $SCRIPT_DIR/scripts/05_run_step11_results_comparator.sh "$SCRIPT_DIR" "$MAIN_DIR" ;;
        12) bash $SCRIPT_DIR/scripts/05_run_step12_fix_loop.sh "$SCRIPT_DIR" "$MAIN_DIR" "$repo_name" ;;
        13) bash $SCRIPT_DIR/scripts/05_run_step13_mcp_rewrap.sh "$SCRIPT_DIR" "$MAIN_DIR" ;;
      esac
      step_exit_code=$?
      set -e

      # Skip exit code — not a failure
      if [[ $step_exit_code -eq $STEP_SKIP_EXIT_CODE ]]; then
        log_progress $((4+i)) "$STEP_NAME" "skip"
        STEP_STATUS_LIST[$i]="skipped"
        record_step_outcome $((4+i)) "$STEP_NAME" "skipped" "Step script reported that execution should be skipped." "$step_attempt"
        step_succeeded=true
        break
      fi

      # Success
      if [[ $step_exit_code -eq 0 ]]; then
        step_succeeded=true
        break
      fi

      # Failed — attempt auto-diagnosis before retry
      if [[ $step_attempt -le $MAX_STEP_RETRIES ]]; then
        echo "[$( date '+%Y-%m-%d %H:%M:%S' )] 🔧 Step $i failed (exit $step_exit_code), diagnosing..." >&2 || true

        # Read last lines of step output for diagnosis
        STEP_OUTPUT="$MAIN_DIR/claude_outputs/step${i}_output.json"
        STEP_LOG=""
        if [[ -f "$STEP_OUTPUT" ]]; then
          STEP_LOG=$(tail -30 "$STEP_OUTPUT" 2>/dev/null || true)
        fi

        # Auto-fix common failures
        fix_applied=false

        # Check for missing Python packages
        if echo "$STEP_LOG" | grep -qi "ModuleNotFoundError\|ImportError\|No module named"; then
          missing_module=$(echo "$STEP_LOG" | grep -oi "No module named '[^']*'" | head -1 | sed "s/No module named '//;s/'//")
          if [[ -n "$missing_module" ]]; then
            echo "  → Auto-fix: installing missing module '$missing_module'" >&2 || true
            ENV_PATH="$MAIN_DIR/${repo_name}-env"
            if [[ -d "$ENV_PATH" ]]; then
              "$ENV_PATH/bin/pip" install "$missing_module" 2>/dev/null || pip3 install "$missing_module" 2>/dev/null || true
            else
              pip3 install "$missing_module" 2>/dev/null || true
            fi
            fix_applied=true
          fi
        fi

        # Check for Claude auth errors — not retryable
        if echo "$STEP_LOG" | grep -qi "authentication_error\|OAuth token.*expired"; then
          echo "  → Claude authentication error — cannot auto-fix, stopping" >&2 || true
          break
        fi

        # Check for Claude usage exhaustion — not retryable, must wait for reset
        if echo "$STEP_LOG" | grep -qi "out of extra usage\|usage limit reached\|rate.*limit\|quota.*exceeded"; then
          reset_hint=$(echo "$STEP_LOG" | grep -oi "resets [^\"]*" | head -1 || true)
          echo "  → Claude usage limit reached ($reset_hint) — cannot retry, stopping pipeline" >&2 || true
          break
        fi

        # Check for disk space — not retryable
        if echo "$STEP_LOG" | grep -qi "No space left on device"; then
          echo "  → Disk full — cannot auto-fix, stopping" >&2 || true
          break
        fi

        # Check for permission errors
        if echo "$STEP_LOG" | grep -qi "Permission denied"; then
          echo "  → Permission error — attempting chmod fix" >&2 || true
          chmod -R u+rw "$MAIN_DIR" 2>/dev/null || true
          fix_applied=true
        fi

        # Remove marker so step reruns
        rm -f "$MARK"

        if [[ "$fix_applied" == "false" ]]; then
          echo "  → No specific fix found, retrying step anyway" >&2 || true
        fi
      fi
    done

    # Stop heartbeat monitor
    if [[ -n "$_heartbeat_pid" ]]; then
      kill "$_heartbeat_pid" 2>/dev/null || true
      wait "$_heartbeat_pid" 2>/dev/null || true
    fi

    if [[ "$step_succeeded" == "true" ]]; then
      if [[ "${STEP_STATUS_LIST[$i]}" != "skipped" ]]; then
        if [[ $step_attempt -gt 1 ]]; then
          log_progress $((4+i)) "$STEP_NAME" "complete"
          STEP_STATUS_LIST[$i]="executed (after $((step_attempt-1)) retry)"
          record_step_outcome $((4+i)) "$STEP_NAME" "completed" "Step completed successfully after retries." "$step_attempt"
        else
          log_progress $((4+i)) "$STEP_NAME" "complete"
          STEP_STATUS_LIST[$i]="executed"
          record_step_outcome $((4+i)) "$STEP_NAME" "completed" "Step completed successfully." "$step_attempt"
        fi
      fi
    else
      # All retries exhausted — log but continue pipeline for non-critical steps
      # Steps 2, 5, 6, 7 are non-critical (tutorials, coverage, benchmarks)
      NON_CRITICAL_STEPS="2 5 6 7"
      if echo "$NON_CRITICAL_STEPS" | grep -qw "$i"; then
        echo "[$( date '+%Y-%m-%d %H:%M:%S' )] ⚠️  Step $i failed after $MAX_STEP_RETRIES retries — skipping (non-critical)" >&2 || true
        log_progress $((4+i)) "$STEP_NAME" "error"
        STEP_STATUS_LIST[$i]="failed (non-critical, skipped)"
        touch "$MARK"  # Mark as done so pipeline continues
        record_step_outcome $((4+i)) "$STEP_NAME" "failed_tolerated" "Step failed after retries but was tolerated because it is non-critical." "$step_attempt"
      else
        log_progress $((4+i)) "$STEP_NAME" "error"
        STEP_STATUS_LIST[$i]="failed"
        record_step_outcome $((4+i)) "$STEP_NAME" "failed" "Step failed after retries and stopped the pipeline." "$step_attempt"
        echo "[$( date '+%Y-%m-%d %H:%M:%S' )] ❌ Step $i failed after $MAX_STEP_RETRIES retries — stopping pipeline" >&2 || true
        exit $step_exit_code
      fi
    fi
  fi
done

# 6. Launch MCP
if [[ -f "$MAIN_DIR/.pipeline/06_mcp_done" ]]; then
  log_progress $TOTAL_STEPS "Launch MCP server" "skip"
  MCP_STATUS="skipped"
  record_step_outcome $TOTAL_STEPS "Launch MCP server" "skipped" "Launch MCP marker already existed." 1
else
  log_progress $TOTAL_STEPS "Launch MCP server" "start"
  bash $SCRIPT_DIR/scripts/06_launch_mcp.sh "$MAIN_DIR" "$repo_name"
  log_progress $TOTAL_STEPS "Launch MCP server" "complete"
  MCP_STATUS="executed"
  record_step_outcome $TOTAL_STEPS "Launch MCP server" "completed" "MCP server launch step completed." 1
fi

# --- Extract lessons for cross-run learning ---
NPX_BIN="$(command -v npx 2>/dev/null || echo "")"
if [[ -n "$NPX_BIN" ]]; then
  "$NPX_BIN" tsx "$SCRIPT_DIR/scripts/extract-lessons.ts" \
    "$SCRIPT_DIR" "$MAIN_DIR" "${PAPER_TITLE:-}" "$repo_name" 2>&1 || true
fi

# --- Final Summary Report ---
echo "" || true
echo "🎉 Pipeline execution completed!" >&2 || true
show_elapsed_time
echo "" || true
echo "================ Pipeline Summary ================" >&2 || true
printf "01 Setup project: %s\n" "$SETUP_STATUS" >&2 || true
printf "02 Clone repository: %s\n" "$CLONE_STATUS" >&2 || true
printf "03 Prepare folders: %s\n" "$FOLDERS_STATUS" >&2 || true
printf "04 Add context MCP: %s\n" "$CONTEXT7_STATUS" >&2 || true

for i in 1 2 3 4 5 6 7 8 9 10 11 12 13; do
  case $i in
    1) STEP_DESC="Setup env & scan" ;;
    2) STEP_DESC="Execute tutorials" ;;
    3) STEP_DESC="Extract tools" ;;
    4) STEP_DESC="Wrap MCP server" ;;
    5) STEP_DESC="Generate coverage & quality" ;;
    6) STEP_DESC="Extract benchmarks" ;;
    7) STEP_DESC="Run assessment" ;;
    8) STEP_DESC="Gap analysis" ;;
    9) STEP_DESC="Paper coder" ;;
    10) STEP_DESC="Experiment runner" ;;
    11) STEP_DESC="Results comparator" ;;
    12) STEP_DESC="Fix loop" ;;
    13) STEP_DESC="MCP re-wrap" ;;
  esac
  printf "05.%02d %s: %s\n" "$i" "$STEP_DESC" "${STEP_STATUS_LIST[$i]}" >&2 || true
done
printf "06 Launch MCP: %s\n" "$MCP_STATUS" >&2 || true
echo "=================================================" >&2 || true

# Show usage instructions
if [[ $VERBOSE -eq 1 ]]; then
  echo "" || true
  echo "📋 To disable verbose output, run with: VERBOSE=0 $0 ..." >&2 || true
  echo "📋 To re-run with more verbosity, check individual script outputs" >&2 || true
fi
