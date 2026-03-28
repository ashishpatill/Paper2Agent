#!/usr/bin/env bash

resolve_cli() {
  local name="$1"

  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return 0
  fi

  local candidate=""
  case "$name" in
    claude)
      for candidate in \
        "$HOME/.local/bin/claude" \
        "/opt/homebrew/bin/claude" \
        "/usr/local/bin/claude"
      do
        if [[ -x "$candidate" ]]; then
          echo "$candidate"
          return 0
        fi
      done
      ;;
    envsubst)
      for candidate in \
        "/opt/homebrew/bin/envsubst" \
        "/usr/local/bin/envsubst"
      do
        if [[ -x "$candidate" ]]; then
          echo "$candidate"
          return 0
        fi
      done
      ;;
    npx)
      for candidate in \
        "/opt/homebrew/bin/npx" \
        "/usr/local/bin/npx"
      do
        if [[ -x "$candidate" ]]; then
          echo "$candidate"
          return 0
        fi
      done
      ;;
    rg)
      for candidate in \
        "/opt/homebrew/bin/rg" \
        "/usr/local/bin/rg"
      do
        if [[ -x "$candidate" ]]; then
          echo "$candidate"
          return 0
        fi
      done
      ;;
    python3)
      for candidate in \
        "/usr/bin/python3" \
        "/opt/homebrew/bin/python3" \
        "/usr/local/bin/python3"
      do
        if [[ -x "$candidate" ]]; then
          echo "$candidate"
          return 0
        fi
      done
      ;;
  esac

  return 1
}

require_cli() {
  local name="$1"
  local resolved=""

  if ! resolved="$(resolve_cli "$name")"; then
    echo "Required command not found: $name" >&2
    return 127
  fi

  echo "$resolved"
}

generate_overlay() {
  local script_dir="$1"
  local main_dir="$2"
  local step_num="$3"
  local repo_name="${4:-}"

  # Try to generate evolution store overlay via tsx
  local npx_bin=""
  if npx_bin="$(resolve_cli npx 2>/dev/null)"; then
    "$npx_bin" tsx "$script_dir/scripts/evolution-overlay.ts" "$main_dir" "$step_num" "$repo_name" 2>/dev/null || true
  fi
}

# Run a Claude CLI command with progress heartbeats to stderr.
# Usage: run_claude_with_heartbeat <output_file> <prompt_command>
# The prompt_command should be the full pipeline that produces the prompt text,
# e.g., "$ENVSUBST_BIN < prompt.md"
# This tails the Claude CLI stream-json output and emits periodic heartbeat
# lines so the pipeline log doesn't appear stuck.
run_claude_with_heartbeat() {
  local output_file="$1"
  shift
  # Remaining args are the claude command and its arguments
  local claude_args=("$@")

  # Start a background heartbeat monitor that tails the output file
  local heartbeat_pid=""
  (
    sleep 3  # wait for file to be created
    local last_size=0
    local last_desc=""
    local tick=0
    while true; do
      sleep 10
      tick=$((tick + 1))
      if [[ ! -f "$output_file" ]]; then
        continue
      fi
      local cur_size
      cur_size=$(wc -c < "$output_file" 2>/dev/null || echo 0)

      # Extract the latest tool description from stream-json output
      local desc=""
      desc=$(tail -5 "$output_file" 2>/dev/null | grep -o '"description":"[^"]*"' | tail -1 | sed 's/"description":"//;s/"$//' || true)
      if [[ -z "$desc" ]]; then
        desc=$(tail -5 "$output_file" 2>/dev/null | grep -o '"last_tool_name":"[^"]*"' | tail -1 | sed 's/"last_tool_name":"//;s/"$//' || true)
      fi

      if [[ -n "$desc" && "$desc" != "$last_desc" ]]; then
        echo "  ↳ Claude: ${desc:0:120}" >&2
        last_desc="$desc"
      elif [[ "$cur_size" -gt "$last_size" ]]; then
        echo "  ↳ Claude working... (${cur_size} bytes, ${tick}0s elapsed)" >&2
      elif [[ $((tick % 6)) -eq 0 ]]; then
        echo "  ↳ Claude still running (${tick}0s elapsed, output ${cur_size} bytes)" >&2
      fi
      last_size=$cur_size
    done
  ) &
  heartbeat_pid=$!

  # Run the actual command
  local exit_code=0
  "${claude_args[@]}" > "$output_file" || exit_code=$?

  # Kill heartbeat
  kill "$heartbeat_pid" 2>/dev/null || true
  wait "$heartbeat_pid" 2>/dev/null || true

  return $exit_code
}

search_text() {
  local pattern="$1"
  shift

  local targets=()
  local target=""
  for target in "$@"; do
    if [[ -e "$target" ]]; then
      targets+=("$target")
    fi
  done

  if [[ ${#targets[@]} -eq 0 ]]; then
    return 1
  fi

  local rg_bin=""
  if rg_bin="$(resolve_cli rg 2>/dev/null)"; then
    "$rg_bin" -qi "$pattern" "${targets[@]}"
    return $?
  fi

  grep -EqiR --exclude-dir=.git -- "$pattern" "${targets[@]}"
}
