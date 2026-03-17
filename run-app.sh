#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

MODE="${1:-dev}"
shift || true

REQUIRED_NODE_MAJOR=20

print_usage() {
  cat <<'EOF'
Usage: ./run-app.sh [mode] [extra args]

Modes:
  install   Install app dependencies with npm
  dev       Start the Next.js development server (default)
  build     Build the app for production
  start     Start the production server
  check     Run lint and production build
  help      Show this message

Examples:
  ./run-app.sh
  ./run-app.sh install
  ./run-app.sh dev -- --hostname 0.0.0.0 --port 3000
  ./run-app.sh start -- --hostname 0.0.0.0 --port 3000
EOF
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Error: required command '$command_name' was not found in PATH." >&2
    exit 1
  fi
}

check_node_version() {
  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$node_major" -lt "$REQUIRED_NODE_MAJOR" ]]; then
    echo "Error: Node.js $REQUIRED_NODE_MAJOR+ is required. Found $(node --version)." >&2
    exit 1
  fi
}

ensure_runtime_dirs() {
  mkdir -p .paper2agent/local .paper2agent/jobs .paper2agent/uploads .paper2agent/workspaces .paper2agent/logs
}

ensure_dependencies() {
  if [[ ! -d node_modules ]]; then
    echo "node_modules not found. Installing dependencies..." >&2
    npm install
  fi
}

ensure_css_runtime() {
  node scripts/ensure-lightningcss-runtime.js
}

reset_dev_cache() {
  node scripts/reset-next-dev-cache.js
}

run_npm_script() {
  local script_name="$1"
  shift || true

  if [[ "${1:-}" == "--" ]]; then
    shift
  fi

  npm run "$script_name" -- "$@"
}

require_command node
require_command npm
check_node_version
ensure_runtime_dirs

case "$MODE" in
  install)
    npm install "$@"
    ;;
  dev)
    ensure_dependencies
    reset_dev_cache
    ensure_css_runtime
    run_npm_script dev "$@"
    ;;
  build)
    ensure_dependencies
    ensure_css_runtime
    run_npm_script build "$@"
    ;;
  start)
    ensure_dependencies
    ensure_css_runtime
    if [[ ! -d .next ]]; then
      echo "No production build found. Building first..." >&2
      npm run build
    fi
    run_npm_script start "$@"
    ;;
  check)
    ensure_dependencies
    ensure_css_runtime
    npm run lint
    npm run build
    ;;
  help|-h|--help)
    print_usage
    ;;
  *)
    echo "Error: unknown mode '$MODE'." >&2
    echo >&2
    print_usage
    exit 1
    ;;
esac
