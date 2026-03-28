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
