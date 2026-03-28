#!/bin/bash
set -euo pipefail

# Activate Python environment if specified
if [[ -n "${P2A_ENV_PATH:-}" ]] && [[ -f "${P2A_ENV_PATH}/bin/activate" ]]; then
  source "${P2A_ENV_PATH}/bin/activate"
fi

# Handle setup_only network policy:
# Allow network during pip install phase, then drop it before running experiments
if [[ "${P2A_NETWORK_POLICY:-full}" == "setup_only" ]]; then
  # Install any requirements first (while network is up)
  if [[ -f requirements.txt ]]; then
    pip install --no-cache-dir -r requirements.txt 2>/dev/null || true
  fi
  if [[ -f src/experiments/requirements.txt ]]; then
    pip install --no-cache-dir -r src/experiments/requirements.txt 2>/dev/null || true
  fi

  # Drop all outbound network after setup
  if command -v iptables &>/dev/null; then
    iptables -P OUTPUT DROP 2>/dev/null || true
    iptables -A OUTPUT -o lo -j ACCEPT 2>/dev/null || true
    echo "Network dropped after setup phase" >&2
  fi
fi

exec "$@"
